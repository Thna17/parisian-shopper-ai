import { describe, expect, it, jest } from '@jest/globals';
import { type ApplicationLogger } from '@parisian-shopper/common';
import sharp from 'sharp';

import { FICTIONAL_PRODUCTS } from '../testing/fictional-products.js';
import { SyncMekhlaCatalogUseCase } from './sync-mekhla-catalog.use-case.js';
import {
  type CreateProductSnapshotRecord,
  type ProductSnapshot,
  type ProductSnapshotRepository,
} from './product-snapshot.repository.js';
import {
  type CreateFreshnessAssessmentInput,
  type ProductFreshnessAssessment,
  type ProductFreshnessAssessmentRepository,
} from './product-freshness-assessment.repository.js';
import { type ProductAssetRepository } from './product-asset.repository.js';
import {
  type ProductAssetStoragePort,
  type StoredProductAssetInfo,
} from './product-asset-storage.port.js';
import { type ProductCatalogPageResult, type ProductSource } from './product-source.port.js';
import {
  type AcquiredAssetPayload,
  type ProductAssetAcquisitionPort,
} from './product-asset-acquisition.port.js';
import { type NormalizedProductEnvelope } from '../domain/product.schema.js';
import {
  type ProductAsset,
  type ProductAssetRegistration,
  ProductAssetRole,
} from '../domain/product-asset.js';

describe('SyncMekhlaCatalogUseCase', () => {
  async function createCutoutBuffer(width = 400, height = 400): Promise<Buffer> {
    const svg = `<svg width="${width}" height="${height}">
      <rect x="50" y="50" width="300" height="300" rx="20" fill="#D4AF37"/>
    </svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
  }

  function createTestFixtures(): NormalizedProductEnvelope[] {
    return FICTIONAL_PRODUCTS.slice(0, 3).map((item) => structuredClone(item));
  }

  it('performs cryptographic hash change detection and deduplicates unchanged products', async () => {
    const fixtures = createTestFixtures();
    const createdSnapshots: ProductSnapshot[] = [];
    const assessments: ProductFreshnessAssessment[] = [];

    const snapshotRepo: ProductSnapshotRepository = {
      create: (input: CreateProductSnapshotRecord) => {
        const snap: ProductSnapshot = {
          id: `snap-${createdSnapshots.length + 1}`,
          ...input,
          createdAt: new Date(),
        };
        createdSnapshots.push(snap);
        return Promise.resolve(snap);
      },
      findById: () => Promise.resolve(null),
      findLatestBySku: (sku: string) => {
        const found = createdSnapshots.filter((s) => s.product.product.sku === sku);
        return Promise.resolve(found.length > 0 ? found[found.length - 1]! : null);
      },
    };

    const assessmentRepo: ProductFreshnessAssessmentRepository = {
      create: (input: CreateFreshnessAssessmentInput) => {
        const a: ProductFreshnessAssessment = {
          id: `assess-${assessments.length + 1}`,
          ...input,
          createdAt: new Date(),
        };
        assessments.push(a);
        return Promise.resolve(a);
      },
      findLatestForSnapshot: (snapshotId: string) => {
        const found = assessments.find((a) => a.snapshotId === snapshotId);
        return Promise.resolve(found ?? null);
      },
      listForSnapshot: () => Promise.resolve([]),
      findByIdempotencyKey: () => Promise.resolve(null),
    };

    const mockSource: ProductSource = {
      adapterName: 'mock-mekhla',
      getBySku: () => Promise.resolve(null),
      search: () => Promise.resolve({ items: fixtures }),
      fetchCatalogPage: (page = 1, limit = 50): Promise<ProductCatalogPageResult> => {
        return Promise.resolve({
          items: fixtures,
          pagination: { page, limit, totalItems: fixtures.length, totalPages: 1 },
        });
      },
    };

    const logger: ApplicationLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const useCase = new SyncMekhlaCatalogUseCase(
      mockSource,
      snapshotRepo,
      assessmentRepo,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      logger,
    );

    // Initial run: all 3 products are new
    const firstResult = await useCase.execute();
    expect(firstResult.status).toBe('COMPLETED');
    expect(firstResult.synced).toBe(3);
    expect(firstResult.skipped).toBe(0);
    expect(createdSnapshots).toHaveLength(3);
    expect(assessments).toHaveLength(3);

    // Second run: no attributes changed, zero new snapshots created (deduplicated)
    const secondResult = await useCase.execute();
    expect(secondResult.status).toBe('COMPLETED');
    expect(secondResult.synced).toBe(0);
    expect(secondResult.skipped).toBe(3);
    expect(createdSnapshots).toHaveLength(3); // strictly 3, no drift
  });

  it('detects attribute changes and updates snapshots with new cryptographic hash', async () => {
    const fixtures = createTestFixtures();
    const createdSnapshots: ProductSnapshot[] = [];

    const snapshotRepo: ProductSnapshotRepository = {
      create: (input: CreateProductSnapshotRecord) => {
        const snap: ProductSnapshot = {
          id: `snap-${createdSnapshots.length + 1}`,
          ...input,
          createdAt: new Date(),
        };
        createdSnapshots.push(snap);
        return Promise.resolve(snap);
      },
      findById: () => Promise.resolve(null),
      findLatestBySku: (sku: string) => {
        const found = createdSnapshots.filter((s) => s.product.product.sku === sku);
        return Promise.resolve(found.length > 0 ? found[found.length - 1]! : null);
      },
    };

    let catalogItems = fixtures.slice(0, 1);
    const mockSource: ProductSource = {
      adapterName: 'mock-mekhla',
      getBySku: () => Promise.resolve(null),
      search: () => Promise.resolve({ items: catalogItems }),
      fetchCatalogPage: (): Promise<ProductCatalogPageResult> => {
        return Promise.resolve({
          items: catalogItems,
          pagination: { page: 1, limit: 50, totalItems: catalogItems.length, totalPages: 1 },
        });
      },
    };

    const useCase = new SyncMekhlaCatalogUseCase(mockSource, snapshotRepo);

    // First run
    await useCase.execute();
    expect(createdSnapshots).toHaveLength(1);
    const initialHash = createdSnapshots[0]!.snapshotHash;

    // Mutate product price attribute in upstream catalog
    const modifiedItem = structuredClone(catalogItems[0]!);
    modifiedItem.product.price = '189.00';
    catalogItems = [modifiedItem];

    // Second run: change detected, new snapshot created with new hash
    const secondResult = await useCase.execute();
    expect(secondResult.synced).toBe(1);
    expect(secondResult.skipped).toBe(0);
    expect(createdSnapshots).toHaveLength(2);
    expect(createdSnapshots[1]!.snapshotHash).not.toBe(initialHash);
  });

  it('bypasses hash comparison when force=true is supplied', async () => {
    const fixtures = createTestFixtures().slice(0, 1);
    const createdSnapshots: ProductSnapshot[] = [];

    const snapshotRepo: ProductSnapshotRepository = {
      create: (input: CreateProductSnapshotRecord) => {
        const snap: ProductSnapshot = {
          id: `snap-${createdSnapshots.length + 1}`,
          ...input,
          createdAt: new Date(),
        };
        createdSnapshots.push(snap);
        return Promise.resolve(snap);
      },
      findById: () => Promise.resolve(null),
      findLatestBySku: (sku: string) => {
        const found = createdSnapshots.filter((s) => s.product.product.sku === sku);
        return Promise.resolve(found.length > 0 ? found[found.length - 1]! : null);
      },
    };

    const mockSource: ProductSource = {
      adapterName: 'mock-mekhla',
      getBySku: () => Promise.resolve(null),
      search: () => Promise.resolve({ items: fixtures }),
      fetchCatalogPage: (): Promise<ProductCatalogPageResult> => {
        return Promise.resolve({
          items: fixtures,
          pagination: { page: 1, limit: 50, totalItems: 1, totalPages: 1 },
        });
      },
    };

    const useCase = new SyncMekhlaCatalogUseCase(mockSource, snapshotRepo);

    await useCase.execute({ force: false });
    expect(createdSnapshots).toHaveLength(1);

    // Second run with force: true
    const forceResult = await useCase.execute({ force: true });
    expect(forceResult.synced).toBe(1);
    expect(forceResult.skipped).toBe(0);
    expect(createdSnapshots).toHaveLength(2);
  });

  it('downloads asset, verifies transparent PNG cutout with Sharp, and registers in ProductAsset table', async () => {
    const cutoutPng = await createCutoutBuffer(600, 600);
    const item = structuredClone(FICTIONAL_PRODUCTS[0]!);
    item.product.images = [
      {
        url: 'https://cdn.mekhla.digital/products/fic-001.png',
        role: 'primary',
        position: 1,
      },
    ];

    const createdSnapshots: ProductSnapshot[] = [];
    const savedAssets: ProductAsset[] = [];
    const registrations: ProductAssetRegistration[] = [];

    const snapshotRepo: ProductSnapshotRepository = {
      create: (input) => {
        const snap = { id: 'snap-cutout-1', ...input, createdAt: new Date() };
        createdSnapshots.push(snap);
        return Promise.resolve(snap);
      },
      findById: () => Promise.resolve(null),
      findLatestBySku: () => Promise.resolve(null),
    };

    const assetStorage: ProductAssetStoragePort = {
      saveAsset: (buffer: Buffer): Promise<StoredProductAssetInfo> => {
        const sha256 = 'd'.repeat(64);
        return Promise.resolve({
          storageKey: `cas/dd/dd/${sha256}.png`,
          sha256,
          mimeType: 'image/png',
          byteSize: buffer.length,
        });
      },
      getAssetBuffer: () => Promise.resolve(cutoutPng),
      assetExists: () => Promise.resolve(true),
      deriveStorageKey: (sha256, ext) =>
        `cas/${sha256.slice(0, 2)}/${sha256.slice(2, 4)}/${sha256}.${ext}`,
    };

    const assetRepo: ProductAssetRepository = {
      saveAsset: (asset: ProductAsset) => {
        savedAssets.push(asset);
        return Promise.resolve(asset);
      },
      saveRegistration: (reg: ProductAssetRegistration) => {
        registrations.push(reg);
        return Promise.resolve(reg);
      },
      findAssetById: () => Promise.resolve(null),
      findAssetBySha256: () => Promise.resolve(null),
      findRegistrationById: () => Promise.resolve(null),
      findRegistrationsBySku: () => Promise.resolve([]),
      findAllHeroCutoutRegistrations: () => Promise.resolve([]),
      findRegistrationsBySkuAndRole: () => Promise.resolve([]),
      findApprovedHeroCutoutBySku: () => Promise.resolve(null),
      saveTransform: () => Promise.resolve({} as never),
      saveValidationAssessment: () => Promise.resolve({} as never),
      saveApprovalEvent: () => Promise.resolve({} as never),
      saveRightsEvent: () => Promise.resolve({} as never),
      findApprovalEventsByRegistration: () => Promise.resolve([]),
      findRightsEventsByRegistration: () => Promise.resolve([]),
      findRegistrationByReplacedId: () => Promise.resolve(null),
      findLatestValidationAssessment: () => Promise.resolve(null),
      findLatestApprovalEvent: () => Promise.resolve(null),
      findLatestRightsEvent: () => Promise.resolve(null),
      findTransformsByDerivedAsset: () => Promise.resolve([]),
    };

    const assetAcquisition: ProductAssetAcquisitionPort = {
      fetchAsset: (): Promise<AcquiredAssetPayload> =>
        Promise.resolve({
          buffer: cutoutPng,
          mimeType: 'image/png',
          byteSize: cutoutPng.length,
          sourceUrl: 'https://cdn.mekhla.digital/products/fic-001.png',
          sha256: 'd'.repeat(64),
        }),
    };

    const mockSource: ProductSource = {
      adapterName: 'mock-mekhla',
      getBySku: () => Promise.resolve(null),
      search: () => Promise.resolve({ items: [item] }),
      fetchCatalogPage: (): Promise<ProductCatalogPageResult> => {
        return Promise.resolve({
          items: [item],
          pagination: { page: 1, limit: 50, totalItems: 1, totalPages: 1 },
        });
      },
    };

    const useCase = new SyncMekhlaCatalogUseCase(
      mockSource,
      snapshotRepo,
      undefined,
      assetStorage,
      assetRepo,
      assetAcquisition,
    );

    const result = await useCase.execute();
    expect(result.status).toBe('COMPLETED');
    expect(result.cutoutsProcessed).toBe(1);
    expect(savedAssets).toHaveLength(1);
    expect(savedAssets[0]!.hasAlpha).toBe(true);
    expect(savedAssets[0]!.mimeType).toBe('image/png');
    expect(registrations).toHaveLength(1);
    expect(registrations[0]!.role).toBe(ProductAssetRole.HERO_CUTOUT);
  });

  it('guarantees zero-downtime resilience when individual product processing throws', async () => {
    const fixtures = createTestFixtures();
    const createdSnapshots: ProductSnapshot[] = [];

    const snapshotRepo: ProductSnapshotRepository = {
      create: (input) => {
        if (input.product.product.sku === fixtures[1]!.product.sku) {
          throw new Error('Database write collision for second item');
        }
        const snap = { id: `snap-${createdSnapshots.length + 1}`, ...input, createdAt: new Date() };
        createdSnapshots.push(snap);
        return Promise.resolve(snap);
      },
      findById: () => Promise.resolve(null),
      findLatestBySku: () => Promise.resolve(null),
    };

    const mockSource: ProductSource = {
      adapterName: 'mock-mekhla',
      getBySku: () => Promise.resolve(null),
      search: () => Promise.resolve({ items: fixtures }),
      fetchCatalogPage: (): Promise<ProductCatalogPageResult> => {
        return Promise.resolve({
          items: fixtures,
          pagination: { page: 1, limit: 50, totalItems: fixtures.length, totalPages: 1 },
        });
      },
    };

    const useCase = new SyncMekhlaCatalogUseCase(mockSource, snapshotRepo);
    const result = await useCase.execute();

    // Zero-downtime: 2 of 3 products synced successfully despite the middle failure
    expect(result.status).toBe('COMPLETED');
    expect(result.synced).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.sku).toBe(fixtures[1]!.product.sku);
  });
});
