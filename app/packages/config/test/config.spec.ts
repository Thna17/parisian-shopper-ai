import { FeatureFlag } from '../src/feature-flags.js';
import { validateEnvironment } from '../src/environment.schema.js';

const minimumEnvironment = {
  DATABASE_URL: 'postgresql://user:password@localhost:5432/parisian',
};

describe('configuration validation', () => {
  it('uses safe feature defaults', () => {
    const configuration = validateEnvironment(minimumEnvironment);

    expect(configuration.FEATURE_AI_TEXT_GENERATION).toBe(false);
    expect(configuration.FEATURE_AI_IMAGE_GENERATION).toBe(false);
    expect(configuration.FEATURE_CREATIVE_GENERATION).toBe(false);
    expect(configuration.FEATURE_HIGGSFIELD_PROVIDER).toBe(false);
    expect(configuration.FEATURE_PRODUCT_IMAGE_TO_VIDEO).toBe(false);
    expect(configuration.FEATURE_TELEGRAM).toBe(false);
    expect(configuration.FEATURE_PRODUCT_API).toBe(false);
    expect(configuration.FEATURE_AUTO_PUBLISHING).toBe(false);
    expect(configuration.FEATURE_META_PUBLISHING).toBe(false);
    expect(configuration.FEATURE_TELEGRAM_CHANNEL_PUBLISHING).toBe(false);
    expect(configuration.FEATURE_ANALYTICS).toBe(false);
    expect(Object.values(FeatureFlag)).toHaveLength(11);
  });

  it('parses the string false as false', () => {
    const configuration = validateEnvironment({
      ...minimumEnvironment,
      FEATURE_TELEGRAM: 'false',
    });

    expect(configuration.FEATURE_TELEGRAM).toBe(false);
  });

  it('rejects malformed required configuration', () => {
    expect(() => validateEnvironment({ DATABASE_URL: 'mysql://localhost/example' })).toThrow(
      'DATABASE_URL must be a PostgreSQL URL',
    );
  });

  it('does not require future secrets while their features are disabled', () => {
    expect(() => validateEnvironment(minimumEnvironment)).not.toThrow();
  });

  it('allows explicitly enabled fake AI without a secret outside production', () => {
    const configuration = validateEnvironment({
      ...minimumEnvironment,
      FEATURE_AI_TEXT_GENERATION: 'true',
      AI_PROVIDER: 'fake',
    });
    expect(configuration.AI_PROVIDER).toBe('fake');
  });

  it('requires an OpenAI key only when enabled with the OpenAI provider', () => {
    expect(() =>
      validateEnvironment({
        ...minimumEnvironment,
        FEATURE_AI_TEXT_GENERATION: 'true',
        AI_PROVIDER: 'openai',
      }),
    ).toThrow(/OPENAI_API_KEY is required|OPENAI_MODEL is required/);
  });

  it('does not silently use fake AI in production', () => {
    expect(() =>
      validateEnvironment({
        ...minimumEnvironment,
        NODE_ENV: 'production',
        FEATURE_AI_TEXT_GENERATION: 'true',
        AI_PROVIDER: 'fake',
      }),
    ).toThrow('Fake AI is prohibited');
  });

  it('does not silently use fake creative provider in production', () => {
    expect(() =>
      validateEnvironment({
        ...minimumEnvironment,
        NODE_ENV: 'production',
        FEATURE_CREATIVE_GENERATION: 'true',
        CREATIVE_PROVIDER: 'fake',
      }),
    ).toThrow('Fake creative provider is prohibited');
  });

  it('requires Higgsfield credentials only when creative generation and the provider are enabled', () => {
    expect(() =>
      validateEnvironment({
        ...minimumEnvironment,
        FEATURE_CREATIVE_GENERATION: 'true',
        FEATURE_HIGGSFIELD_PROVIDER: 'true',
        CREATIVE_VIDEO_PROVIDER: 'higgsfield',
      }),
    ).toThrow('HF_CREDENTIALS is required');

    expect(() =>
      validateEnvironment({
        ...minimumEnvironment,
        FEATURE_CREATIVE_GENERATION: 'true',
        FEATURE_HIGGSFIELD_PROVIDER: 'true',
        CREATIVE_VIDEO_PROVIDER: 'higgsfield',
        HF_CREDENTIALS: 'test-key:test-secret',
      }),
    ).not.toThrow();
  });

  it('rejects unknown Higgsfield models and product image-to-video activation', () => {
    expect(() =>
      validateEnvironment({
        ...minimumEnvironment,
        HIGGSFIELD_VIDEO_MODEL: 'unknown/model',
      }),
    ).toThrow('HIGGSFIELD_VIDEO_MODEL');
    expect(() =>
      validateEnvironment({
        ...minimumEnvironment,
        FEATURE_PRODUCT_IMAGE_TO_VIDEO: 'true',
      }),
    ).toThrow('visual fidelity policy');
  });

  it('requires a Telegram token only when Telegram is enabled', () => {
    expect(() => validateEnvironment({ ...minimumEnvironment, FEATURE_TELEGRAM: 'true' })).toThrow(
      'TELEGRAM_BOT_TOKEN is required',
    );
  });

  it('requires webhook URL and a strong secret when Telegram webhook mode is enabled', () => {
    expect(() =>
      validateEnvironment({
        ...minimumEnvironment,
        FEATURE_TELEGRAM: 'true',
        TELEGRAM_BOT_TOKEN: 'fictional-test-token',
      }),
    ).toThrow(/TELEGRAM_WEBHOOK_URL|TELEGRAM_WEBHOOK_SECRET/u);
    expect(() =>
      validateEnvironment({
        ...minimumEnvironment,
        FEATURE_TELEGRAM: 'true',
        TELEGRAM_BOT_TOKEN: 'fictional-test-token',
        TELEGRAM_MODE: 'webhook',
        TELEGRAM_WEBHOOK_URL: 'https://example.invalid/telegram/webhook',
        TELEGRAM_WEBHOOK_SECRET: 'a'.repeat(32),
      }),
    ).not.toThrow();
  });

  it('permits explicit local polling without webhook settings', () => {
    expect(() =>
      validateEnvironment({
        ...minimumEnvironment,
        FEATURE_TELEGRAM: 'true',
        TELEGRAM_BOT_TOKEN: 'fictional-test-token',
        TELEGRAM_MODE: 'polling',
      }),
    ).not.toThrow();
  });

  it.each(['FEATURE_AUTO_PUBLISHING', 'FEATURE_META_PUBLISHING'] as const)(
    'refuses to enable %s during Phase 1A',
    (flag) => {
      expect(() => validateEnvironment({ ...minimumEnvironment, [flag]: 'true' })).toThrow();
    },
  );

  it('rejects wildcard CORS in production', () => {
    expect(() =>
      validateEnvironment({
        ...minimumEnvironment,
        NODE_ENV: 'production',
        APP_CORS_ORIGINS: '*',
      }),
    ).toThrow('Wildcard CORS is prohibited');
  });

  it('uses safe Codex CLI configuration defaults', () => {
    const configuration = validateEnvironment(minimumEnvironment);

    expect(configuration.CODEX_CLI_TEXT_TIMEOUT_MS).toBe(120_000);
    expect(configuration.CODEX_CLI_IMAGE_TIMEOUT_MS).toBe(300_000);
    expect(configuration.CODEX_CLI_MAX_CONCURRENCY).toBe(1);
    expect(configuration.AI_PROVIDER).toBe('fake');
    expect(configuration.CREATIVE_PROVIDER).toBe('fake');
  });

  it('rejects AI_PROVIDER=codex_cli in production', () => {
    expect(() =>
      validateEnvironment({
        ...minimumEnvironment,
        NODE_ENV: 'production',
        AI_PROVIDER: 'codex_cli',
      }),
    ).toThrow('Codex CLI AI provider is prohibited in production');
  });

  it('rejects CREATIVE_PROVIDER=codex_cli in production', () => {
    expect(() =>
      validateEnvironment({
        ...minimumEnvironment,
        NODE_ENV: 'production',
        CREATIVE_PROVIDER: 'codex_cli',
      }),
    ).toThrow('Codex CLI creative provider is prohibited in production');
  });

  it('permits codex_cli providers outside production when required feature flags are set', () => {
    const configuration = validateEnvironment({
      ...minimumEnvironment,
      NODE_ENV: 'development',
      AI_PROVIDER: 'codex_cli',
      CREATIVE_PROVIDER: 'codex_cli',
      FEATURE_CREATIVE_GENERATION: 'true',
      FEATURE_AI_IMAGE_GENERATION: 'true',
    });

    expect(configuration.AI_PROVIDER).toBe('codex_cli');
    expect(configuration.CREATIVE_PROVIDER).toBe('codex_cli');
  });

  it('rejects CREATIVE_PROVIDER=codex_cli when FEATURE_CREATIVE_GENERATION is not enabled', () => {
    expect(() =>
      validateEnvironment({
        ...minimumEnvironment,
        NODE_ENV: 'development',
        CREATIVE_PROVIDER: 'codex_cli',
        FEATURE_CREATIVE_GENERATION: 'false',
        FEATURE_AI_IMAGE_GENERATION: 'true',
      }),
    ).toThrow('FEATURE_CREATIVE_GENERATION must be true when CREATIVE_PROVIDER=codex_cli');
  });

  it('rejects CREATIVE_PROVIDER=codex_cli when FEATURE_AI_IMAGE_GENERATION is not enabled', () => {
    expect(() =>
      validateEnvironment({
        ...minimumEnvironment,
        NODE_ENV: 'development',
        CREATIVE_PROVIDER: 'codex_cli',
        FEATURE_CREATIVE_GENERATION: 'true',
        FEATURE_AI_IMAGE_GENERATION: 'false',
      }),
    ).toThrow('FEATURE_AI_IMAGE_GENERATION must be true when CREATIVE_PROVIDER=codex_cli');
  });

  it('does not require OPENAI_API_KEY when CREATIVE_PROVIDER=codex_cli', () => {
    expect(() =>
      validateEnvironment({
        ...minimumEnvironment,
        NODE_ENV: 'development',
        FEATURE_CREATIVE_GENERATION: 'true',
        FEATURE_AI_IMAGE_GENERATION: 'true',
        CREATIVE_PROVIDER: 'codex_cli',
      }),
    ).not.toThrow();
  });

  it('requires OPENAI_API_KEY when CREATIVE_PROVIDER=openai and creative generation is enabled', () => {
    expect(() =>
      validateEnvironment({
        ...minimumEnvironment,
        FEATURE_CREATIVE_GENERATION: 'true',
        CREATIVE_PROVIDER: 'openai',
      }),
    ).toThrow('OPENAI_API_KEY is required when creative provider uses OpenAI');

    expect(() =>
      validateEnvironment({
        ...minimumEnvironment,
        FEATURE_CREATIVE_GENERATION: 'true',
        CREATIVE_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-test-key-for-openai',
      }),
    ).not.toThrow();
  });

  it('does not require OPENAI_API_KEY or OPENAI_MODEL when AI_PROVIDER=codex_cli', () => {
    expect(() =>
      validateEnvironment({
        ...minimumEnvironment,
        FEATURE_AI_TEXT_GENERATION: 'true',
        AI_PROVIDER: 'codex_cli',
      }),
    ).not.toThrow();
  });

  describe('legacy product asset fallback configuration', () => {
    it('defaults ALLOW_LEGACY_PRODUCT_ASSET_FALLBACK to false', () => {
      const config = validateEnvironment(minimumEnvironment);
      expect(config.ALLOW_LEGACY_PRODUCT_ASSET_FALLBACK).toBe(false);
    });

    it('rejects ALLOW_LEGACY_PRODUCT_ASSET_FALLBACK=true in production', () => {
      expect(() =>
        validateEnvironment({
          ...minimumEnvironment,
          NODE_ENV: 'production',
          ALLOW_LEGACY_PRODUCT_ASSET_FALLBACK: 'true',
        }),
      ).toThrow('ALLOW_LEGACY_PRODUCT_ASSET_FALLBACK is strictly prohibited in production');
    });

    it('permits ALLOW_LEGACY_PRODUCT_ASSET_FALLBACK=true in development or test', () => {
      expect(() =>
        validateEnvironment({
          ...minimumEnvironment,
          NODE_ENV: 'development',
          ALLOW_LEGACY_PRODUCT_ASSET_FALLBACK: 'true',
        }),
      ).not.toThrow();
    });
  });

  describe('product api configuration validation', () => {
    const validProductApiEnvironment = {
      ...minimumEnvironment,
      FEATURE_PRODUCT_API: 'true',
      PRODUCT_API_BASE_URL: 'https://api.mekhla.digital',
      PRODUCT_API_BUSINESS_ID: 'cmpwgnlpv0001li15e3n16uhc',
      PRODUCT_API_CURRENCY: 'USD',
      PRODUCT_API_ALLOWED_HOSTS: 'api.mekhla.digital',
    };

    it('accepts valid product API configuration', () => {
      const config = validateEnvironment(validProductApiEnvironment);
      expect(config.FEATURE_PRODUCT_API).toBe(true);
      expect(config.PRODUCT_API_BASE_URL).toBe('https://api.mekhla.digital');
      expect(config.PRODUCT_API_BUSINESS_ID).toBe('cmpwgnlpv0001li15e3n16uhc');
      expect(config.PRODUCT_API_CURRENCY).toBe('USD');
      expect(config.PRODUCT_API_TIMEOUT_MS).toBe(3000);
      expect(config.PRODUCT_API_MAX_RETRIES).toBe(2);
      expect(config.RUN_PRODUCT_API_LIVE_TESTS).toBe(false);
    });

    it('rejects missing PRODUCT_API_BASE_URL when FEATURE_PRODUCT_API=true', () => {
      expect(() =>
        validateEnvironment({
          ...minimumEnvironment,
          FEATURE_PRODUCT_API: 'true',
          PRODUCT_API_BUSINESS_ID: 'cmpwgnlpv0001li15e3n16uhc',
        }),
      ).toThrow('PRODUCT_API_BASE_URL is required when FEATURE_PRODUCT_API=true');
    });

    it('rejects non-HTTPS PRODUCT_API_BASE_URL', () => {
      expect(() =>
        validateEnvironment({
          ...validProductApiEnvironment,
          PRODUCT_API_BASE_URL: 'http://api.mekhla.digital',
        }),
      ).toThrow('PRODUCT_API_BASE_URL must use HTTPS');
    });

    it('rejects embedded credentials in PRODUCT_API_BASE_URL', () => {
      expect(() =>
        validateEnvironment({
          ...validProductApiEnvironment,
          PRODUCT_API_BASE_URL: 'https://user:pass@api.mekhla.digital',
        }),
      ).toThrow('PRODUCT_API_BASE_URL must not contain embedded credentials');
    });

    it('rejects unexpected port in PRODUCT_API_BASE_URL', () => {
      expect(() =>
        validateEnvironment({
          ...validProductApiEnvironment,
          PRODUCT_API_BASE_URL: 'https://api.mekhla.digital:8080',
        }),
      ).toThrow('PRODUCT_API_BASE_URL must not specify an unexpected port');
    });

    it('rejects host not in PRODUCT_API_ALLOWED_HOSTS', () => {
      expect(() =>
        validateEnvironment({
          ...validProductApiEnvironment,
          PRODUCT_API_BASE_URL: 'https://untrusted-host.example.com',
          PRODUCT_API_ALLOWED_HOSTS: 'api.mekhla.digital',
        }),
      ).toThrow(
        "PRODUCT_API_BASE_URL host 'untrusted-host.example.com' is not in PRODUCT_API_ALLOWED_HOSTS",
      );
    });

    it('rejects missing PRODUCT_API_BUSINESS_ID when FEATURE_PRODUCT_API=true', () => {
      expect(() =>
        validateEnvironment({
          ...minimumEnvironment,
          FEATURE_PRODUCT_API: 'true',
          PRODUCT_API_BASE_URL: 'https://api.mekhla.digital',
          PRODUCT_API_ALLOWED_HOSTS: 'api.mekhla.digital',
        }),
      ).toThrow('PRODUCT_API_BUSINESS_ID is required when FEATURE_PRODUCT_API=true');
    });
  });
});
