import { describe, expect, it } from '@jest/globals';

import { type ProductSource } from '../application/product-source.port.js';
import { normalizedProductEnvelopeSchema } from '../domain/product.schema.js';

export function productSourceContract(
  implementationName: string,
  createSource: () => ProductSource,
): void {
  describe(`${implementationName} ProductSource contract`, () => {
    it('gets a known exact SKU and returns normalized data', async () => {
      const product = await createSource().getBySku('FIC-PERF-001');

      expect(product?.product.product_name).toBe('Moonlit River Eau de Parfum');
      expect(normalizedProductEnvelopeSchema.safeParse(product).success).toBe(true);
    });

    it('returns null for an unknown or incorrectly cased exact SKU', async () => {
      const source = createSource();

      await expect(source.getBySku('UNKNOWN-001')).resolves.toBeNull();
      await expect(source.getBySku('fic-perf-001')).resolves.toBeNull();
    });

    it.each([
      ['SKU', 'FIC-WATCH-001', 'FIC-WATCH-001'],
      ['product name', 'cloud petal', 'FIC-COS-001'],
      ['brand', 'maison imaginaire', 'FIC-PERF-001'],
    ])('searches by %s', async (_kind, query, expectedSku) => {
      const result = await createSource().search({ query, limit: 20 });

      expect(result.items.map((item) => item.product.sku)).toContain(expectedSku);
      result.items.forEach((item) =>
        expect(normalizedProductEnvelopeSchema.safeParse(item).success).toBe(true),
      );
    });

    it('rejects an empty query and enforces the requested limit', async () => {
      const source = createSource();

      await expect(
        Promise.resolve().then(() => source.search({ query: ' ', limit: 20 })),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      const limited = await source.search({ query: 'FIC-', limit: 2 });
      expect(limited.items).toHaveLength(2);
    });
  });
}
