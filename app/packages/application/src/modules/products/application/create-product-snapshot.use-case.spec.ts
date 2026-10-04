import { describe, expect, it, jest } from '@jest/globals';
import { type ApplicationLogger } from '@parisian-shopper/common';

import { FICTIONAL_PRODUCTS } from '../testing/fictional-products.js';
import { CreateProductSnapshotUseCase } from './create-product-snapshot.use-case.js';
import { type ProductMetrics } from './product-metrics.port.js';
import {
  type CreateProductSnapshotRecord,
  type ProductSnapshot,
  type ProductSnapshotRepository,
} from './product-snapshot.repository.js';

describe('CreateProductSnapshotUseCase', () => {
  it('hashes and persists normalized facts through the repository port', async () => {
    const records: CreateProductSnapshotRecord[] = [];
    const repository: ProductSnapshotRepository = {
      create: (input) => {
        records.push(input);
        return Promise.resolve({
          id: '00000000-0000-4000-8000-000000000001',
          ...input,
          createdAt: new Date('2026-10-04T00:00:00Z'),
        });
      },
      findById: () => Promise.resolve(null),
    };
    const metrics: ProductMetrics = { record: jest.fn() };
    const logger: ApplicationLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    const useCase = new CreateProductSnapshotUseCase(repository, metrics, logger);
    const fixture = getFixture();

    const snapshot: ProductSnapshot = await useCase.execute(fixture);

    expect(records).toHaveLength(1);
    expect(snapshot.snapshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.product.product.sku).toBe('FIC-PERF-001');
  });
});

function getFixture(): (typeof FICTIONAL_PRODUCTS)[number] {
  const fixture = FICTIONAL_PRODUCTS[0];
  if (fixture === undefined) throw new Error('Fixture missing');
  return fixture;
}
