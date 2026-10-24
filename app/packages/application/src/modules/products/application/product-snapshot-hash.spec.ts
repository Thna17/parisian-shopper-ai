import { describe, expect, it } from '@jest/globals';

import { FICTIONAL_PRODUCTS } from '../testing/fictional-products.js';
import {
  calculateProductDependencyHashes,
  calculateProductSnapshotHash,
  canonicalJson,
} from './product-snapshot-hash.js';

describe('product snapshot hashing', () => {
  it('produces the same hash for the same facts and object keys in another order', () => {
    const fixture = getFixture();
    const reordered = Object.fromEntries(Object.entries(fixture).reverse());

    expect(calculateProductSnapshotHash(fixture)).toBe(
      calculateProductSnapshotHash(reordered as unknown as typeof fixture),
    );
    expect(canonicalJson({ b: 2, a: 1 })).toBe(canonicalJson({ a: 1, b: 2 }));
  });

  it('changes when a protected fact changes', () => {
    const original = getFixture();
    const changed = { ...original, product: { ...original.product, price: '35' } };

    expect(calculateProductSnapshotHash(changed)).not.toBe(calculateProductSnapshotHash(original));
  });

  it('excludes the unstable retrieval timestamp and source timestamp from business hashes', () => {
    const original = getFixture();
    const retrievedLater = {
      ...original,
      retrieved_at: '2026-10-05T02:30:00.000Z',
      source_updated_at: '2026-10-05T02:29:00.000Z',
      etag: 'new-etag-999',
    };

    const originalHashes = calculateProductDependencyHashes(original);
    const laterHashes = calculateProductDependencyHashes(retrievedLater);

    expect(laterHashes.full).toBe(originalHashes.full);
    expect(laterHashes.catalogPrice).toBe(originalHashes.catalogPrice);
    expect(laterHashes.campaignPrice).toBe(originalHashes.campaignPrice);
    expect(laterHashes.stock).toBe(originalHashes.stock);
    expect(laterHashes.promotion).toBe(originalHashes.promotion);
    expect(laterHashes.permanentFacts).toBe(originalHashes.permanentFacts);
    expect(laterHashes.visualAssets).toBe(originalHashes.visualAssets);
  });

  it('handles null and undefined fields with canonical stability', () => {
    const fixture = getFixture();
    const withoutPromo = {
      ...fixture,
      product: {
        ...fixture.product,
        promo_price: undefined,
        discount: undefined,
      },
    };
    const hashes1 = calculateProductDependencyHashes(withoutPromo);
    const hashes2 = calculateProductDependencyHashes(withoutPromo);
    expect(hashes1).toEqual(hashes2);
    expect(hashes1.campaignPrice).toMatch(/^[a-f0-9]{64}$/);
    expect(hashes1.promotion).toMatch(/^[a-f0-9]{64}$/);
  });

  it('stock-only change alters only stock and full hashes', () => {
    const original = getFixture();
    const originalHashes = calculateProductDependencyHashes(original);

    const changed = {
      ...original,
      product: { ...original.product, stock_status: 'out_of_stock' as const },
    };
    const changedHashes = calculateProductDependencyHashes(changed);

    expect(changedHashes.stock).not.toBe(originalHashes.stock);
    expect(changedHashes.full).not.toBe(originalHashes.full);

    // Unrelated scopes remain identical
    expect(changedHashes.catalogPrice).toBe(originalHashes.catalogPrice);
    expect(changedHashes.campaignPrice).toBe(originalHashes.campaignPrice);
    expect(changedHashes.promotion).toBe(originalHashes.promotion);
    expect(changedHashes.permanentFacts).toBe(originalHashes.permanentFacts);
    expect(changedHashes.visualAssets).toBe(originalHashes.visualAssets);
  });

  it('catalog-price-only change alters only catalog-price and full hashes', () => {
    const original = getFixture();
    const originalHashes = calculateProductDependencyHashes(original);

    const changed = {
      ...original,
      product: { ...original.product, price: '99.5' },
    };
    const changedHashes = calculateProductDependencyHashes(changed);

    expect(changedHashes.catalogPrice).not.toBe(originalHashes.catalogPrice);
    expect(changedHashes.full).not.toBe(originalHashes.full);

    // Unrelated scopes remain identical
    expect(changedHashes.stock).toBe(originalHashes.stock);
    expect(changedHashes.campaignPrice).toBe(originalHashes.campaignPrice);
    expect(changedHashes.promotion).toBe(originalHashes.promotion);
    expect(changedHashes.permanentFacts).toBe(originalHashes.permanentFacts);
    expect(changedHashes.visualAssets).toBe(originalHashes.visualAssets);
  });

  it('campaign-price-only change alters only campaign-price and full hashes', () => {
    const original = getFixture();
    const originalHashes = calculateProductDependencyHashes(original);

    const changed = {
      ...original,
      product: { ...original.product, promo_price: '30' },
    };
    const changedHashes = calculateProductDependencyHashes(changed);

    expect(changedHashes.campaignPrice).not.toBe(originalHashes.campaignPrice);
    expect(changedHashes.full).not.toBe(originalHashes.full);

    // Unrelated scopes remain identical
    expect(changedHashes.catalogPrice).toBe(originalHashes.catalogPrice);
    expect(changedHashes.stock).toBe(originalHashes.stock);
    expect(changedHashes.promotion).toBe(originalHashes.promotion);
    expect(changedHashes.permanentFacts).toBe(originalHashes.permanentFacts);
    expect(changedHashes.visualAssets).toBe(originalHashes.visualAssets);
  });

  it('promotion-only change alters only promotion and full hashes', () => {
    const original = getFixture();
    const originalHashes = calculateProductDependencyHashes(original);

    const changed = {
      ...original,
      product: {
        ...original.product,
        discount: {
          type: 'percentage' as const,
          value: '15',
          label: 'Summer Special',
          calculation_method: 'standard_markdown',
          starts_at: '2026-06-01T00:00:00.000Z',
          ends_at: '2026-08-31T23:59:59.000Z',
        },
      },
    };
    const changedHashes = calculateProductDependencyHashes(changed);

    expect(changedHashes.promotion).not.toBe(originalHashes.promotion);
    expect(changedHashes.full).not.toBe(originalHashes.full);

    // Unrelated scopes remain identical
    expect(changedHashes.catalogPrice).toBe(originalHashes.catalogPrice);
    expect(changedHashes.campaignPrice).toBe(originalHashes.campaignPrice);
    expect(changedHashes.stock).toBe(originalHashes.stock);
    expect(changedHashes.permanentFacts).toBe(originalHashes.permanentFacts);
    expect(changedHashes.visualAssets).toBe(originalHashes.visualAssets);
  });

  it('static-fact-only change alters only permanent-fact and full hashes', () => {
    const original = getFixture();
    const originalHashes = calculateProductDependencyHashes(original);

    const changed = {
      ...original,
      product: { ...original.product, description: 'Updated luxury description.' },
    };
    const changedHashes = calculateProductDependencyHashes(changed);

    expect(changedHashes.permanentFacts).not.toBe(originalHashes.permanentFacts);
    expect(changedHashes.full).not.toBe(originalHashes.full);

    // Unrelated scopes remain identical
    expect(changedHashes.catalogPrice).toBe(originalHashes.catalogPrice);
    expect(changedHashes.campaignPrice).toBe(originalHashes.campaignPrice);
    expect(changedHashes.stock).toBe(originalHashes.stock);
    expect(changedHashes.promotion).toBe(originalHashes.promotion);
    expect(changedHashes.visualAssets).toBe(originalHashes.visualAssets);
  });

  it('visual-asset-only change alters only visual-asset and full hashes', () => {
    const original = getFixture();
    const originalHashes = calculateProductDependencyHashes(original);

    const changed = {
      ...original,
      product: {
        ...original.product,
        images: [
          {
            url: 'https://images.parisianshopper.fr/products/perfumes/new-hero.png',
            role: 'primary' as const,
            position: 1,
            alt_text: 'New hero bottle',
            sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          },
        ],
      },
    };
    const changedHashes = calculateProductDependencyHashes(changed);

    expect(changedHashes.visualAssets).not.toBe(originalHashes.visualAssets);
    expect(changedHashes.full).not.toBe(originalHashes.full);

    // Unrelated scopes remain identical
    expect(changedHashes.catalogPrice).toBe(originalHashes.catalogPrice);
    expect(changedHashes.campaignPrice).toBe(originalHashes.campaignPrice);
    expect(changedHashes.stock).toBe(originalHashes.stock);
    expect(changedHashes.promotion).toBe(originalHashes.promotion);
    expect(changedHashes.permanentFacts).toBe(originalHashes.permanentFacts);
  });

  it('normalizes fragrance notes order stably', () => {
    const fixture1 = getFixture();
    const fixture2 = {
      ...fixture1,
      product: {
        ...fixture1.product,
        fragrance_notes: {
          top: ['Bergamot', 'Mandarin'],
          heart: ['Rose', 'Jasmine'],
          base: ['Vanilla', 'Cedarwood'],
        },
      },
    };
    const fixture3 = {
      ...fixture1,
      product: {
        ...fixture1.product,
        fragrance_notes: {
          top: ['Mandarin', 'Bergamot'], // reversed
          heart: ['Jasmine', 'Rose'], // reversed
          base: ['Cedarwood', 'Vanilla'], // reversed
        },
      },
    };

    expect(calculateProductDependencyHashes(fixture2).permanentFacts).toBe(
      calculateProductDependencyHashes(fixture3).permanentFacts,
    );
  });
});

function getFixture(): (typeof FICTIONAL_PRODUCTS)[number] {
  const fixture = FICTIONAL_PRODUCTS[0];
  if (fixture === undefined) throw new Error('Fixture missing');
  return structuredClone(fixture);
}
