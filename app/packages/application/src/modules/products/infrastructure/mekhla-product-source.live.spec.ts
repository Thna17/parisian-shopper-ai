import { describe, expect, it } from '@jest/globals';

import { MekhlaProductSource } from './mekhla-product-source.js';

const runLive = process.env.RUN_PRODUCT_API_LIVE_TESTS === 'true';

describe('MekhlaProductSource (live read-only contract test)', () => {
  const conditionalIt = runLive ? it : it.skip;

  conditionalIt(
    'verifies live Mekhla API envelope and fetches an active product',
    async () => {
      const source = new MekhlaProductSource({
        baseUrl: process.env.PRODUCT_API_BASE_URL ?? 'https://api.mekhla.digital',
        businessId: process.env.PRODUCT_API_BUSINESS_ID ?? 'cmpwgnlpv0001li15e3n16uhc',
        currency: process.env.PRODUCT_API_CURRENCY ?? 'USD',
        allowedHosts: ['api.mekhla.digital'],
        timeoutMs: 5000,
        maxRetries: 2,
      });

      // Read-only search: fetch active perfumes
      const searchResult = await source.search({ query: 'Yes I Am', limit: 2 });
      expect(searchResult).toBeDefined();
      expect(Array.isArray(searchResult.items)).toBe(true);

      if (searchResult.items.length === 0) {
        // Report clearly if no items found
        console.warn('Live Mekhla API returned 0 active perfume items for query');
        return;
      }

      const firstItem = searchResult.items[0];
      expect(firstItem?.schema_version).toBe('1.0');
      expect(firstItem?.product.sku).toBeDefined();
      expect(firstItem?.product.price).toBeDefined();
      expect(firstItem?.product.currency).toBe('USD');

      // Test exact getBySku using the discovered shortCode
      const sku = firstItem!.product.sku;
      const detailResult = await source.getBySku(sku);
      expect(detailResult).not.toBeNull();
      expect(detailResult?.product.sku).toBe(sku);
      expect(detailResult?.source_record_id).toBe(firstItem!.source_record_id);
    },
    15000,
  );
});
