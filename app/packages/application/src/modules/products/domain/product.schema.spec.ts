import { describe, expect, it } from '@jest/globals';

import { FICTIONAL_PRODUCTS } from '../testing/fictional-products.js';
import { normalizedProductEnvelopeSchema } from './product.schema.js';

describe('normalized product schema', () => {
  it('accepts all eight fictional fixture variations', () => {
    expect(FICTIONAL_PRODUCTS).toHaveLength(8);
    FICTIONAL_PRODUCTS.forEach((product) =>
      expect(normalizedProductEnvelopeSchema.safeParse(product).success).toBe(true),
    );
  });

  it('canonicalizes decimal strings without binary floating point', () => {
    const input = structuredClone(FICTIONAL_PRODUCTS[0]);
    if (input === undefined) throw new Error('Fixture missing');
    (input.product as unknown as Record<string, unknown>)['price'] = '38.0000';

    expect(normalizedProductEnvelopeSchema.parse(input).product.price).toBe('38');
  });

  const invalidCases: readonly [string, (product: Record<string, unknown>) => void][] = [
    [
      'missing required field',
      (product: Record<string, unknown>): void => {
        delete product['brand'];
      },
    ],
    [
      'malformed price',
      (product: Record<string, unknown>): void => {
        product['price'] = '37.99999';
      },
    ],
    [
      'invalid currency',
      (product: Record<string, unknown>): void => {
        product['currency'] = 'usd';
      },
    ],
    [
      'unknown stock state',
      (product: Record<string, unknown>): void => {
        product['stock_status'] = 'available';
      },
    ],
    [
      'malformed fragrance notes',
      (product: Record<string, unknown>): void => {
        product['fragrance_notes'] = { top: 'citrus' };
      },
    ],
    [
      'unapproved similarity claim',
      (product: Record<string, unknown>): void => {
        product['similarity_claims'] = [
          {
            claim_id: 'unapproved',
            text: 'Unapproved test claim',
            status: 'pending',
            approved_by: 'nobody',
            approved_at: '2026-01-01T00:00:00Z',
          },
        ];
      },
    ],
  ];

  it.each(invalidCases)('rejects %s', (_name, mutate) => {
    const input = cloneFixture();
    mutate(input.product);

    expect(normalizedProductEnvelopeSchema.safeParse(input).success).toBe(false);
  });

  it('rejects an invalid image URL and a promotional price over the regular price', () => {
    const invalidImage = cloneFixture();
    (invalidImage.product as unknown as Record<string, unknown>)['images'] = [
      { url: 'http://127.0.0.1/private.jpg', role: 'primary', position: 1 },
    ];
    expect(normalizedProductEnvelopeSchema.safeParse(invalidImage).success).toBe(false);

    const invalidPromotion = cloneFixture();
    (invalidPromotion.product as unknown as Record<string, unknown>)['promo_price'] = '39';
    expect(normalizedProductEnvelopeSchema.safeParse(invalidPromotion).success).toBe(false);
  });
});

function cloneFixture(): (typeof FICTIONAL_PRODUCTS)[number] {
  const fixture = FICTIONAL_PRODUCTS[0];
  if (fixture === undefined) throw new Error('Fixture missing');
  return structuredClone(fixture);
}
