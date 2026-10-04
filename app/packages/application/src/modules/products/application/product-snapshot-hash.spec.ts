import { describe, expect, it } from '@jest/globals';

import { FICTIONAL_PRODUCTS } from '../testing/fictional-products.js';
import { calculateProductSnapshotHash, canonicalJson } from './product-snapshot-hash.js';

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

  it('excludes the unstable retrieval timestamp', () => {
    const original = getFixture();
    const retrievedLater = { ...original, retrieved_at: '2026-10-05T02:30:00.000Z' };

    expect(calculateProductSnapshotHash(retrievedLater)).toBe(
      calculateProductSnapshotHash(original),
    );
  });
});

function getFixture(): (typeof FICTIONAL_PRODUCTS)[number] {
  const fixture = FICTIONAL_PRODUCTS[0];
  if (fixture === undefined) throw new Error('Fixture missing');
  return structuredClone(fixture);
}
