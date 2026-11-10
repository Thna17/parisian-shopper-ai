import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
  FICTIONAL_PRODUCTS,
  generateTransparentProductPng_TEST_ONLY,
  type AcquiredAssetPayload,
  type NormalizedProductEnvelope,
  type ProductAssetAcquisitionPort,
  type ProductAssetStoragePort,
  type ProductCatalogPageResult,
  type ProductSource,
  type StoredProductAssetInfo,
  ProductAssetRole,
  SyncMekhlaCatalogUseCase,
} from '@parisian-shopper/application';
import { type ApplicationLogger } from '@parisian-shopper/common';
import { jest } from '@jest/globals';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { PrismaProductSnapshotRepository } from '../../src/product-snapshot/prisma-product-snapshot.repository.js';
import { PrismaProductFreshnessAssessmentRepository } from '../../src/product-snapshot/prisma-product-freshness-assessment.repository.js';
import { PrismaProductAssetRepository } from '../../src/product-asset/prisma-product-asset.repository.js';
import { PrismaService } from '../../src/prisma.service.js';

const execFileAsync = promisify(execFile);
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const logger: ApplicationLogger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('Product Catalog Sync Pipeline Integration', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let prisma: PrismaService | undefined;
  let snapshotRepo: PrismaProductSnapshotRepository | undefined;
  let assessmentRepo: PrismaProductFreshnessAssessmentRepository | undefined;
  let assetRepo: PrismaProductAssetRepository | undefined;

  const cutoutPng = generateTransparentProductPng_TEST_ONLY({
    width: 500,
    height: 500,
    productWidth: 250,
    productHeight: 350,
  });

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17.6-alpine')
      .withDatabase('parisian_catalog_sync_test')
      .withUsername('parisian_test')
      .withPassword('fictional_test_password')
      .start();
    const databaseUrl = container.getConnectionUri();
    await execFileAsync(
      'pnpm',
      ['--filter', '@parisian-shopper/database', 'prisma:migrate:deploy'],
      { cwd: appRoot, env: { ...process.env, DATABASE_URL: databaseUrl } },
    );
    process.env.DATABASE_URL = databaseUrl;
    prisma = new PrismaService();
    await prisma.$connect();
    snapshotRepo = new PrismaProductSnapshotRepository(prisma);
    assessmentRepo = new PrismaProductFreshnessAssessmentRepository(prisma);
    assetRepo = new PrismaProductAssetRepository(prisma);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it('executes end-to-end sync, persists snapshots and freshness, deduplicates on subsequent runs, and records hash updates on change', async () => {
    const initialItems: NormalizedProductEnvelope[] = [
      structuredClone(FICTIONAL_PRODUCTS[0]!),
      structuredClone(FICTIONAL_PRODUCTS[1]!),
    ];
    let catalogItems = [...initialItems];

    const mockSource: ProductSource = {
      adapterName: 'test-mekhla-source',
      getBySku: (): Promise<null> => Promise.resolve(null),
      search: (): Promise<{ items: NormalizedProductEnvelope[] }> =>
        Promise.resolve({ items: catalogItems }),
      fetchCatalogPage: (page = 1, limit = 50): Promise<ProductCatalogPageResult> => {
        return Promise.resolve({
          items: catalogItems,
          pagination: { page, limit, totalItems: catalogItems.length, totalPages: 1 },
        });
      },
    };

    const mockStorage: ProductAssetStoragePort = {
      saveAsset: (buffer: Buffer): Promise<StoredProductAssetInfo> => {
        const sha256 = 'e'.repeat(64);
        return Promise.resolve({
          storageKey: `cas/ee/ee/${sha256}.png`,
          sha256,
          mimeType: 'image/png',
          byteSize: buffer.length,
        });
      },
      getAssetBuffer: (): Promise<Buffer | null> => Promise.resolve(cutoutPng),
      assetExists: (): Promise<boolean> => Promise.resolve(true),
      deriveStorageKey: (sha256: string, ext: string): string =>
        `cas/${sha256.slice(0, 2)}/${sha256.slice(2, 4)}/${sha256}.${ext}`,
    };

    const mockAcquisition: ProductAssetAcquisitionPort = {
      fetchAsset: (): Promise<AcquiredAssetPayload> =>
        Promise.resolve({
          buffer: cutoutPng,
          mimeType: 'image/png',
          byteSize: cutoutPng.length,
          sourceUrl: 'https://cdn.mekhla.digital/products/test.png',
          sha256: 'e'.repeat(64),
        }),
    };

    if (!snapshotRepo || !assessmentRepo || !assetRepo || !prisma) {
      throw new Error('Database services not initialized');
    }

    const useCase = new SyncMekhlaCatalogUseCase(
      mockSource,
      snapshotRepo,
      assessmentRepo,
      mockStorage,
      assetRepo,
      mockAcquisition,
      undefined,
      undefined,
      logger,
    );

    // 1. Initial Synchronization Run: Creates initial snapshots and freshness assessments
    const firstSync = await useCase.execute();
    expect(firstSync.status).toBe('COMPLETED');
    expect(firstSync.synced).toBe(2);
    expect(firstSync.skipped).toBe(0);

    const firstSnapshotsCount = await prisma.productSnapshot.count();
    expect(firstSnapshotsCount).toBe(2);

    const firstAssessmentsCount = await prisma.productFreshnessAssessment.count();
    expect(firstAssessmentsCount).toBe(2);

    // 2. Deduplication Verification: Second run with identical attributes results in zero new snapshots
    const secondSync = await useCase.execute();
    expect(secondSync.status).toBe('COMPLETED');
    expect(secondSync.synced).toBe(0);
    expect(secondSync.skipped).toBe(2);

    const afterSecondCount = await prisma.productSnapshot.count();
    expect(afterSecondCount).toBe(2); // strictly 2 snapshots, zero duplicate rows

    // 3. Cryptographic Hash Change Detection: Mutate price of first product
    const updatedItem = structuredClone(initialItems[0]!);
    updatedItem.product.price = '250.00';
    catalogItems = [updatedItem, initialItems[1]!];

    const thirdSync = await useCase.execute();
    expect(thirdSync.status).toBe('COMPLETED');
    expect(thirdSync.synced).toBe(1);
    expect(thirdSync.skipped).toBe(1);

    const totalSnapshotsAfterUpdate = await prisma.productSnapshot.count();
    expect(totalSnapshotsAfterUpdate).toBe(3);

    // Verify latest snapshot for SKU has updated hash
    const latestSnapshot = await snapshotRepo.findLatestBySku(updatedItem.product.sku);
    expect(latestSnapshot).not.toBeNull();
    expect(latestSnapshot?.product.product.price).toBe('250');

    // 4. Verify Transparent Asset Processing and SHA-256 registration
    const registeredAssets = await assetRepo.findRegistrationsBySku(updatedItem.product.sku);
    expect(registeredAssets.length).toBeGreaterThanOrEqual(1);
    expect(registeredAssets[0]?.role).toBe(ProductAssetRole.HERO_CUTOUT);
  }, 120_000);
});
