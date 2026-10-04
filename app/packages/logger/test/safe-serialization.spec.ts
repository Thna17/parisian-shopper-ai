import { sanitizeForLogging } from '../src/safe-serialization.js';

describe('safe log serialization', () => {
  it('redacts credentials recursively', () => {
    const result = sanitizeForLogging({
      DATABASE_URL: 'postgresql://secret',
      nested: {
        telegram_token: 'telegram-secret',
        ai_api_key: 'ai-secret',
        productApiToken: 'product-secret',
        safe: 'visible',
      },
    });

    expect(JSON.stringify(result)).not.toContain('postgresql://secret');
    expect(JSON.stringify(result)).not.toContain('telegram-secret');
    expect(JSON.stringify(result)).not.toContain('ai-secret');
    expect(JSON.stringify(result)).not.toContain('product-secret');
    expect(result).toEqual({
      DATABASE_URL: '[REDACTED]',
      nested: {
        telegram_token: '[REDACTED]',
        ai_api_key: '[REDACTED]',
        productApiToken: '[REDACTED]',
        safe: 'visible',
      },
    });
  });

  it('serializes errors without arbitrary attached properties', () => {
    const error = new Error('safe failure message');
    Object.assign(error, { token: 'must-not-leak' });

    expect(JSON.stringify(sanitizeForLogging(error))).not.toContain('must-not-leak');
  });
});
