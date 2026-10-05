import { describe, expect, it } from '@jest/globals';

import { secretsEqual } from './telegram-webhook.controller.js';

describe('Telegram webhook secret verification', () => {
  it('accepts only an exact secret and safely handles different lengths', () => {
    const secret = 'a-secure-webhook-secret-of-32-chars';
    expect(secretsEqual(secret, secret)).toBe(true);
    expect(secretsEqual(undefined, secret)).toBe(false);
    expect(secretsEqual('short', secret)).toBe(false);
    expect(secretsEqual(`${secret}x`, secret)).toBe(false);
  });
});
