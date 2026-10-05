import { describe, expect, it } from '@jest/globals';

import { FICTIONAL_PRODUCTS } from '../../products/testing/fictional-products.js';
import { type ContentVersion } from '../../content/application/content-generation.repository.js';
import { type ProductSnapshot } from '../../products/application/product-snapshot.repository.js';
import { type NormalizedProduct } from '../../products/domain/product.schema.js';
import { DeterministicFactualValidator } from './factual-validator.js';
import {
  FACTUAL_VALIDATOR_VERSION,
  type FactualValidationOutcome,
  FindingCode,
  ValidationStatus,
} from './validation.js';

const validator = new DeterministicFactualValidator();

describe('DeterministicFactualValidator', () => {
  it('passes grounded bilingual content and exposes a stable version', () => {
    const result = validate(
      0,
      'Moonlit River Eau de Parfum by Maison Imaginaire. SKU: FIC-PERF-001. $38 USD. 75 ml. Made in France. Top notes: Fictional bergamot, Fictional pear. Heart notes: Fictional jasmine. Base notes: Fictional cedar, Fictional musk.',
      'Moonlit River Eau de Parfum តម្លៃ $38 USD ផលិតនៅប្រទេសបារាំង។',
    );
    expect(result.validatorVersion).toBe(FACTUAL_VALIDATOR_VERSION);
    expect(result.status).toBe(ValidationStatus.PASSED);
  });

  it.each([
    ['$35', FindingCode.PRICE_MISMATCH],
    ['$38', undefined],
    ['$38.00', undefined],
    ['38 USD', undefined],
    ['USD 38.00', undefined],
    ['€38', FindingCode.CURRENCY_MISMATCH],
    ['USD 380', FindingCode.PRICE_MISMATCH],
  ])('validates exact money claim %s', (claim, expectedCode) => {
    const result = validate(0, `Price: ${claim}`);
    expect(result.findings.some((item) => item.code === expectedCode)).toBe(
      expectedCode !== undefined,
    );
  });

  it.each([
    ['Save 10% off', 0, FindingCode.UNSUPPORTED_DISCOUNT],
    ['Save 15% off', 1, FindingCode.DISCOUNT_MISMATCH],
    ['Save 20% off for $51.20 USD', 1, undefined],
  ])('validates source-backed promotion %s', (text, productIndex, expectedCode) => {
    const result = validate(productIndex, text);
    expect(result.findings.some((item) => item.code === expectedCode)).toBe(
      expectedCode !== undefined,
    );
  });

  it.each([
    ['100 ml', FindingCode.SIZE_MISMATCH],
    ['EDT', FindingCode.CONCENTRATION_MISMATCH],
    ['Made in Cambodia', FindingCode.ORIGIN_MISMATCH],
    ['Made in France', undefined],
    ['Top notes: Fictional lemon', FindingCode.UNSUPPORTED_FRAGRANCE_NOTE],
    ['identical to Unknown Luxury', FindingCode.UNSUPPORTED_SIMILARITY_CLAIM],
    ['lasts for 12 hours', FindingCode.UNSUPPORTED_PERFORMANCE_CLAIM],
  ])('validates controlled claim %s', (text, expectedCode) => {
    const result = validate(0, text);
    expect(result.findings.some((item) => item.code === expectedCode)).toBe(
      expectedCode !== undefined,
    );
  });

  it('blocks fragrance notes when the source contains no note data', () => {
    expect(validate(2, 'Top notes: lemon').status).toBe(ValidationStatus.BLOCKED);
  });

  it('detects Khmer origin hallucination', () => {
    const result = validate(7, 'ផលិតនៅប្រទេសបារាំង');
    expect(result.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: FindingCode.UNSUPPORTED_ORIGIN })]),
    );
  });

  it('aggregates every rule instead of stopping at the first blocker', () => {
    const result = validate(0, 'SKU: WRONG-1. $35 USD. EDT. Made in Cambodia.');
    expect(result.status).toBe(ValidationStatus.BLOCKED);
    expect(result.blockingCount).toBeGreaterThanOrEqual(4);
  });

  it('does not trust structured facts_used', () => {
    const content = version('Grounded copy without a displayed price.', null);
    content.structuredOutput.facts_used.push('price=35');
    const result = validator.validate({ productSnapshot: snapshot(0), contentVersion: content });
    expect(result.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: FindingCode.FACTS_USED_MISMATCH })]),
    );
  });

  it('compares a 10% source discount without deriving it from prices', () => {
    const source = snapshotWith({
      discount: { type: 'percentage', value: '10', calculation_method: 'upstream' },
    });
    expect(validateInput(source, '10% off').status).toBe(ValidationStatus.PASSED);
    expect(validateInput(source, '15% off').status).toBe(ValidationStatus.BLOCKED);
  });

  it.each([
    ['Special price $30', 0, FindingCode.UNSUPPORTED_PROMOTION],
    ['Promo price $38', 1, FindingCode.PROMO_PRICE_MISMATCH],
    ['Promo price $51.20', 1, undefined],
  ])('validates explicitly labelled promotion price %s', (text, productIndex, code) => {
    const result = validate(productIndex, text);
    expect(result.findings.some((finding) => finding.code === code)).toBe(code !== undefined);
  });

  it.each([
    ['100ml', ValidationStatus.PASSED],
    ['100 ml', ValidationStatus.PASSED],
    ['50ml', ValidationStatus.BLOCKED],
  ])('normalizes source size for %s', (text, status) => {
    expect(
      validateInput(snapshotWith({ size: { value: '100', unit: 'ml', display: '100 ml' } }), text)
        .status,
    ).toBe(status);
  });

  it.each([
    ['EDP', ValidationStatus.PASSED],
    ['Eau de Parfum', ValidationStatus.PASSED],
    ['EDT', ValidationStatus.BLOCKED],
  ])('uses controlled concentration alias for %s', (text, status) => {
    expect(validateInput(snapshot(0), text).status).toBe(status);
  });

  it('enforces approved similarity wording and target', () => {
    expect(validateInput(snapshot(0), 'Similar to Example Scent').status).toBe(
      ValidationStatus.PASSED,
    );
    expect(validateInput(snapshot(0), 'Identical to Example Scent').status).toBe(
      ValidationStatus.BLOCKED,
    );
  });

  it.each([
    ['តម្លៃ $35', FindingCode.PRICE_MISMATCH],
    ['បញ្ចុះតម្លៃ 15%', FindingCode.DISCOUNT_MISMATCH],
    ['ទំហំ 50ml', FindingCode.SIZE_MISMATCH],
    ['ប្រភេទ EDT', FindingCode.CONCENTRATION_MISMATCH],
    ['ស្រដៀងនឹង Dior Sauvage', FindingCode.UNSUPPORTED_SIMILARITY_CLAIM],
  ])('detects Khmer protected-fact mismatch: %s', (text, code) => {
    const source = snapshotWith({
      discount: { type: 'percentage', value: '10', calculation_method: 'upstream' },
      size: { value: '100', unit: 'ml', display: '100 ml' },
    });
    expect(validateInput(source, '', text).findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code })]),
    );
  });

  it('validates both bilingual captions independently for concentration', () => {
    expect(validateInput(snapshot(0), 'EDP', 'EDT').status).toBe(ValidationStatus.BLOCKED);
  });
});

function validate(
  productIndex: number,
  english: string,
  khmer: string | null = null,
): FactualValidationOutcome {
  return validator.validate({
    productSnapshot: snapshot(productIndex),
    contentVersion: version(english, khmer),
  });
}

function validateInput(
  productSnapshot: ProductSnapshot,
  english: string,
  khmer: string | null = null,
): FactualValidationOutcome {
  return validator.validate({ productSnapshot, contentVersion: version(english, khmer) });
}

function snapshotWith(overrides: Partial<NormalizedProduct>): ProductSnapshot {
  const base = snapshot(0);
  return {
    ...base,
    product: {
      ...base.product,
      product: { ...base.product.product, ...overrides },
    },
  };
}

function snapshot(index: number): ProductSnapshot {
  const product = FICTIONAL_PRODUCTS[index];
  if (product === undefined) throw new Error('Fixture is missing');
  return {
    id: '00000000-0000-4000-8000-000000000001',
    product,
    snapshotHash: 'a'.repeat(64),
    normalizerVersion: 'phase-1b-v1',
    createdAt: new Date('2026-10-05T00:00:00.000Z'),
  };
}

function version(english: string, khmer: string | null): ContentVersion {
  return {
    id: '00000000-0000-4000-8000-000000000002',
    contentJobId: '00000000-0000-4000-8000-000000000003',
    versionNumber: 1,
    brandRuleVersionId: '00000000-0000-4000-8000-000000000004',
    productSnapshotId: '00000000-0000-4000-8000-000000000001',
    generationAttemptId: '00000000-0000-4000-8000-000000000005',
    provider: 'fake',
    model: 'fixture',
    promptVersion: '1',
    structuredOutput: {
      headline: 'Product highlight',
      khmer_caption: khmer,
      english_caption: english,
      cta: 'Learn more',
      hashtags: ['#Fictional'],
      creative_brief: 'Static product presentation',
      facts_used: [],
      warnings: [],
      missing_information: [],
    },
    createdAt: new Date('2026-10-05T00:00:00.000Z'),
  };
}
