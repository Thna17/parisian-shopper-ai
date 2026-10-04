import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
  CreateProductSnapshotUseCase,
  type ProductMetrics,
  type NormalizedProductEnvelope,
  FICTIONAL_PRODUCTS,
} from '@parisian-shopper/application';
import { type ApplicationLogger } from '@parisian-shopper/common';
import { jest } from '@jest/globals';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { PrismaProductSnapshotRepository } from '../../src/product-snapshot/prisma-product-snapshot.repository.js';
import { PrismaService } from '../../src/prisma.service.js';

const execFileAsync = promisify(execFile);
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const metrics: ProductMetrics = { record: jest.fn() };
const logger: ApplicationLogger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('immutable ProductSnapshot persistence', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let prisma: PrismaService | undefined;
  let repository: PrismaProductSnapshotRepository | undefined;
  let createSnapshot: CreateProductSnapshotUseCase | undefined;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17.6-alpine')
      .withDatabase('parisian_snapshot_test')
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
    repository = new PrismaProductSnapshotRepository(prisma);
    createSnapshot = new CreateProductSnapshotUseCase(repository, metrics, logger);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it('creates and reads a normalized immutable snapshot', async () => {
    const created = await getUseCase().execute(getFixture());
    const loaded = await getRepository().findById(created.id);

    expect(loaded).toEqual(created);
    expect(loaded?.snapshotHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('preserves Snapshot A at 38 USD after the source changes to 35 USD in Snapshot B', async () => {
    const sourceV1 = getFixture();
    const snapshotA = await getUseCase().execute(sourceV1);

    const sourceV2 = {
      ...sourceV1,
      source_version: 'fixture-v2',
      source_updated_at: '2026-10-04T09:45:00.000Z',
      product: { ...sourceV1.product, price: '35' },
    };
    const snapshotB = await getUseCase().execute(sourceV2);

    const reloadedA = await getRepository().findById(snapshotA.id);
    const reloadedB = await getRepository().findById(snapshotB.id);
    expect(reloadedA?.product.product.price).toBe('38');
    expect(reloadedB?.product.product.price).toBe('35');
    expect(reloadedA?.snapshotHash).not.toBe(reloadedB?.snapshotHash);
    expect(snapshotA.id).not.toBe(snapshotB.id);
  });

  it('rejects database updates and deletes', async () => {
    const snapshot = await getUseCase().execute(getFixture());
    const database = getPrisma();

    await expect(
      database.$executeRaw`UPDATE product_snapshots SET price = 1 WHERE id = ${snapshot.id}::uuid`,
    ).rejects.toThrow('product_snapshots are append-only');
    await expect(
      database.$executeRaw`DELETE FROM product_snapshots WHERE id = ${snapshot.id}::uuid`,
    ).rejects.toThrow('product_snapshots are append-only');

    expect((await getRepository().findById(snapshot.id))?.product.product.price).toBe('38');
  });

  it('enforces monetary database constraints even if persistence is bypassed', async () => {
    await expect(
      getPrisma().$executeRaw`
        INSERT INTO product_snapshots (
          sku, product_name, brand, category, price, currency, stock_status,
          source_schema_version, source_system, source_updated_at, retrieved_at,
          lifecycle_status, snapshot_hash, normalizer_version
        ) VALUES (
          'BROKEN', 'Broken fixture', 'Broken brand', 'test', -1, 'USD', 'unknown',
          '1.0', 'test', NOW(), NOW(), 'active', ${'a'.repeat(64)}, 'test'
        )
      `,
    ).rejects.toThrow();
  });

  function getPrisma(): PrismaService {
    if (prisma === undefined) throw new Error('Prisma test client is not initialized');
    return prisma;
  }

  function getRepository(): PrismaProductSnapshotRepository {
    if (repository === undefined) throw new Error('Snapshot repository is not initialized');
    return repository;
  }

  function getUseCase(): CreateProductSnapshotUseCase {
    if (createSnapshot === undefined) throw new Error('Snapshot use case is not initialized');
    return createSnapshot;
  }
});

function getFixture(): NormalizedProductEnvelope {
  const fixture = FICTIONAL_PRODUCTS[0];
  if (fixture === undefined) throw new Error('Fixture missing');
  return structuredClone(fixture);
}
