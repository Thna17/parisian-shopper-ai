import { describe, expect, it } from '@jest/globals';

import { parseSearchInput, parseSku } from './product-input.js';

describe('product input validation', () => {
  it('trims valid flexible SKUs without forcing alphanumeric-only syntax', () => {
    expect(parseSku('  KH/été.01_A  ')).toBe('KH/été.01_A');
  });

  it.each(['', '   ', 'SKU WITH SPACE', `SKU-${'x'.repeat(65)}`, 'SKU\u0000BAD'])(
    'rejects malformed SKU %p',
    (sku) => {
      expect(() => parseSku(sku)).toThrow('Invalid SKU');
    },
  );

  it('trims search and applies a bounded default limit', () => {
    expect(parseSearchInput({ query: '  moon  ' })).toEqual({ query: 'moon', limit: 20 });
  });

  it.each([
    { query: ' ' },
    { query: 'x' },
    { query: 'valid', limit: 0 },
    { query: 'valid', limit: 51 },
  ])('rejects unsafe search input %#', (input) => {
    expect(() => parseSearchInput(input)).toThrow('Invalid product search');
  });
});
