import { describe, expect, it } from '@jest/globals';
import { type AppConfigService } from '@parisian-shopper/config';

import { DisabledProductSource } from './infrastructure/disabled-product-source.js';
import { MekhlaProductSource } from './infrastructure/mekhla-product-source.js';
import { MockProductSource } from './infrastructure/mock-product-source.js';
import { selectProductSource } from './products.module.js';

describe('Product Source selection', () => {
  const fakeConfig = {
    productApi: {
      baseUrl: 'https://api.mekhla.digital',
      businessId: 'cmpwgnlpv0001li15e3n16uhc',
      currency: 'USD',
      allowedHosts: ['api.mekhla.digital'],
      timeoutMs: 3000,
      maxRetries: 2,
      runLiveTests: false,
    },
  } as unknown as AppConfigService;

  it.each(['development', 'test'] as const)(
    'uses fictional fixtures in %s when disabled',
    (environment) => {
      expect(selectProductSource(environment, false)).toBeInstanceOf(MockProductSource);
    },
  );

  it('never silently uses fixtures in production when disabled', () => {
    expect(selectProductSource('production', false)).toBeInstanceOf(DisabledProductSource);
  });

  it('fails closed when product API is enabled without complete configuration', () => {
    expect(() => selectProductSource('development', true)).toThrow('Product source is unavailable');
  });

  it('selects MekhlaProductSource when product API is enabled with valid config', () => {
    const source = selectProductSource('development', true, fakeConfig);
    expect(source).toBeInstanceOf(MekhlaProductSource);
    expect(source.adapterName).toBe('mekhla-http');
  });

  it('selects MekhlaProductSource in production when product API is enabled with valid config', () => {
    const source = selectProductSource('production', true, fakeConfig);
    expect(source).toBeInstanceOf(MekhlaProductSource);
    expect(source.adapterName).toBe('mekhla-http');
  });
});
