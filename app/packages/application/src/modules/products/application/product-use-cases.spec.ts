import { describe, expect, it, jest } from '@jest/globals';
import { type ApplicationLogger } from '@parisian-shopper/common';

import { MockProductSource } from '../infrastructure/mock-product-source.js';
import { type NormalizedProductEnvelope } from '../domain/product.schema.js';
import { GetProductBySkuUseCase } from './get-product-by-sku.use-case.js';
import { type ProductMetrics } from './product-metrics.port.js';
import { type ProductSource } from './product-source.port.js';
import { SearchProductsUseCase } from './search-products.use-case.js';

const metrics: ProductMetrics = { record: jest.fn() };
const logger: ApplicationLogger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('product application use cases', () => {
  it('gets a normalized product by SKU', async () => {
    const useCase = new GetProductBySkuUseCase(new MockProductSource(), metrics, logger);

    await expect(useCase.execute({ sku: ' FIC-PERF-001 ' })).resolves.toMatchObject({
      product: { sku: 'FIC-PERF-001' },
    });
  });

  it('maps a missing SKU to PRODUCT_NOT_FOUND', async () => {
    const useCase = new GetProductBySkuUseCase(new MockProductSource(), metrics, logger);

    await expect(useCase.execute({ sku: 'FIC-NOT-FOUND' })).rejects.toMatchObject({
      code: 'PRODUCT_NOT_FOUND',
    });
  });

  it('searches normalized fixture products', async () => {
    const useCase = new SearchProductsUseCase(new MockProductSource(), metrics, logger);

    const result = await useCase.execute({ query: 'Atelier Placeholder', limit: 10 });
    expect(result.items.map((item) => item.product.sku)).toEqual(['FIC-PERF-002', 'FIC-PERF-005']);
  });

  it('rejects an invalid source response at the application boundary', async () => {
    const invalidSource: ProductSource = {
      adapterName: 'invalid-test-source',
      getBySku: () =>
        Promise.resolve({ product: { sku: 'BROKEN' } } as unknown as NormalizedProductEnvelope),
      search: () => Promise.resolve({ items: [] }),
    };
    const useCase = new GetProductBySkuUseCase(invalidSource, metrics, logger);

    await expect(useCase.execute({ sku: 'BROKEN' })).rejects.toMatchObject({
      code: 'PRODUCT_SOURCE_RESPONSE_INVALID',
    });
  });

  it('rejects a source that exceeds the requested search limit', async () => {
    const mock = new MockProductSource();
    const item = await mock.getBySku('FIC-PERF-001');
    if (item === null) throw new Error('Fixture missing');
    const invalidSource: ProductSource = {
      adapterName: 'invalid-limit-source',
      getBySku: (sku) => mock.getBySku(sku),
      search: () => Promise.resolve({ items: [item, item] }),
    };
    const useCase = new SearchProductsUseCase(invalidSource, metrics, logger);

    await expect(useCase.execute({ query: 'moon', limit: 1 })).rejects.toMatchObject({
      code: 'PRODUCT_SOURCE_RESPONSE_INVALID',
    });
  });
});
