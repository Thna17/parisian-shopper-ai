import { describe, expect, it } from '@jest/globals';

import { DisabledProductSource } from './infrastructure/disabled-product-source.js';
import { MockProductSource } from './infrastructure/mock-product-source.js';
import { selectProductSource } from './products.module.js';

describe('Product Source selection', () => {
  it.each(['development', 'test'] as const)('uses fictional fixtures in %s', (environment) => {
    expect(selectProductSource(environment, false)).toBeInstanceOf(MockProductSource);
  });

  it('never silently uses fixtures in production', () => {
    expect(selectProductSource('production', false)).toBeInstanceOf(DisabledProductSource);
  });

  it('fails closed when the unimplemented HTTP integration is enabled', () => {
    expect(() => selectProductSource('development', true)).toThrow('Product source is unavailable');
  });
});
