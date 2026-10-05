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
    expect(configuration.FEATURE_TELEGRAM).toBe(false);
    expect(configuration.FEATURE_PRODUCT_API).toBe(false);
    expect(configuration.FEATURE_AUTO_PUBLISHING).toBe(false);
    expect(configuration.FEATURE_META_PUBLISHING).toBe(false);
    expect(configuration.FEATURE_ANALYTICS).toBe(false);
    expect(Object.values(FeatureFlag)).toHaveLength(7);
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
});
