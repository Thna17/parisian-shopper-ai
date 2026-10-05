import { describe, expect, it } from '@jest/globals';

import { ApplicationError } from '@parisian-shopper/common';

import { telegramSafeError } from './telegram-error-mapper.js';
import { callbackData, splitTelegramMessage } from './telegram-formatters.js';

describe('Telegram presentation safety', () => {
  it('splits oversized Unicode text without splitting surrogate pairs', () => {
    const chunks = splitTelegramMessage('🌸'.repeat(20), 7);
    expect(chunks.join('')).toBe('🌸'.repeat(20));
    expect(chunks.every((chunk) => Array.from(chunk).length <= 7)).toBe(true);
  });

  it('uses plain opaque callback data without trusted business state', () => {
    expect(callbackData('opaque_token')).toBe('ps:opaque_token');
    expect(callbackData('opaque_token')).not.toContain('price');
  });

  it('maps known application errors and hides unknown internals', () => {
    expect(
      telegramSafeError(
        new ApplicationError({ code: 'PRODUCT_NOT_FOUND', publicMessage: 'Internal detail' }),
      ),
    ).toBe('Product not found.');
    expect(telegramSafeError(new Error('database password leaked'))).toBe(
      'Something went wrong. Please try again later.',
    );
  });

  it('requires no Markdown escaping because Telegram output is sent as plain text', () => {
    const text = '<script>_*[]()</script> ខ្មែរ';
    expect(splitTelegramMessage(text)).toEqual([text]);
  });
});
