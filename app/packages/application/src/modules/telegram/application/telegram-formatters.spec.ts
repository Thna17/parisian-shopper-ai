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

  it('displays [DEMO] prefix prominently when demoMode is enabled', async () => {
    const { formatDraft, formatProduct, formatJobSummary, formatValidation } =
      await import('./telegram-formatters.js');
    const { FICTIONAL_PRODUCTS } = await import('../../products/testing/fictional-products.js');

    const product = FICTIONAL_PRODUCTS[0]!;
    const normalProduct = formatProduct(product);
    const demoProduct = formatProduct(product, { demoMode: true });

    expect(normalProduct.startsWith('Product:')).toBe(true);
    expect(demoProduct.startsWith('[DEMO] Product:')).toBe(true);

    const draftView = {
      jobId: '12345678-1234-1234-1234-123456789abc',
      sku: 'FIC-PERF-001',
      versionNumber: 1,
      productName: 'Moonlit River',
      contentType: 'PRODUCT_SPOTLIGHT' as const,
      language: 'BILINGUAL' as const,
      platform: 'TELEGRAM' as const,
      jobStatus: 'DRAFT',
      requesterTelegramUserId: '700000001',
      telegramIdentityId: 'identity-1',
      createdAt: new Date(),
      output: {
        headline: 'A magical scent',
        khmerCaption: 'ក្លិនក្រអូបពិសេស',
        englishCaption: 'A magical scent for you',
        cta: 'Shop now',
        hashtags: ['#fragrance'],
      },
      validation: {
        id: 'val-1',
        contentVersionId: 'ver-1',
        status: 'PASSED' as const,
        findings: [],
        findingCount: 0,
        blockingCount: 0,
        warningCount: 0,
        infoCount: 0,
        validatorVersion: '1.0',
        createdAt: new Date(),
      },
    };

    const normalDraft = formatDraft(draftView);
    const demoDraft = formatDraft(draftView, { demoMode: true });

    expect(normalDraft.startsWith('DRAFT #12345678 — V1')).toBe(true);
    expect(demoDraft.startsWith('[DEMO] DRAFT #12345678 — V1')).toBe(true);

    const summary = {
      jobId: '12345678-1234-1234-1234-123456789abc',
      sku: 'FIC-PERF-001',
      contentType: 'PRODUCT_SPOTLIGHT' as const,
      language: 'BILINGUAL' as const,
      platform: 'TELEGRAM' as const,
      productName: 'Moonlit River',
      jobStatus: 'DRAFT',
      validationStatus: 'PASSED',
      createdAt: new Date(),
    };
    expect(formatJobSummary(summary)).toBe('#12345678 Moonlit River — Draft / Validated');
    expect(formatJobSummary(summary, { demoMode: true })).toBe(
      '[DEMO] #12345678 Moonlit River — Draft / Validated',
    );

    const valResult = {
      id: 'val-1',
      contentVersionId: 'ver-1',
      status: 'BLOCKED' as const,
      findings: [
        {
          id: 'find-1',
          validationResultId: 'val-1',
          field: 'price',
          code: 'PRICE_MISMATCH' as const,
          severity: 'BLOCKING' as const,
          message: 'Price is wrong',
          createdAt: new Date(),
        },
      ],
      findingCount: 1,
      blockingCount: 1,
      warningCount: 0,
      infoCount: 0,
      validatorVersion: '1.0',
      createdAt: new Date(),
    };
    expect(formatValidation(valResult, { demoMode: true }).startsWith('[DEMO] ❌ BLOCKED')).toBe(
      true,
    );
  });
});
