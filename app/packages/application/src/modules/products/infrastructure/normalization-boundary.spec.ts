import { describe, expect, it } from '@jest/globals';
import { z } from 'zod';

import { FICTIONAL_PRODUCTS } from '../testing/fictional-products.js';
import { normalizeExternalProduct } from './normalization-boundary.js';

const fictionalRawSchema = z.object({ payload: z.unknown() }).strict();

describe('external product normalization boundary', () => {
  it('validates provider-specific raw input before mapping and normalized output afterward', () => {
    const fixture = FICTIONAL_PRODUCTS[0];
    if (fixture === undefined) throw new Error('Fixture missing');

    expect(
      normalizeExternalProduct({
        raw: { payload: fixture },
        rawSchema: fictionalRawSchema,
        map: (raw) => raw.payload,
      }),
    ).toEqual(fixture);
  });

  it.each([
    ['invalid raw shape', { wrong: true }, (raw: { payload: unknown }): unknown => raw.payload],
    [
      'invalid normalized result',
      { payload: { product: { sku: 'BROKEN' } } },
      (raw: { payload: unknown }): unknown => raw.payload,
    ],
  ])('fails closed for %s', (_name, raw, map) => {
    expect(() => normalizeExternalProduct({ raw, rawSchema: fictionalRawSchema, map })).toThrow(
      'Product source returned an invalid response',
    );
  });
});
