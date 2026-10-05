import { type ContentVersion } from '../../content/application/content-generation.repository.js';
import { type ProductSnapshot } from '../../products/application/product-snapshot.repository.js';

export const FACTUAL_VALIDATOR_VERSION = 'ps-factual-v1';

export const FindingSeverity = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  BLOCKING: 'BLOCKING',
} as const;
export type FindingSeverity = (typeof FindingSeverity)[keyof typeof FindingSeverity];

export const ValidationStatus = {
  PASSED: 'PASSED',
  PASSED_WITH_WARNINGS: 'PASSED_WITH_WARNINGS',
  BLOCKED: 'BLOCKED',
  FAILED: 'FAILED',
} as const;
export type ValidationStatus = (typeof ValidationStatus)[keyof typeof ValidationStatus];

export const FindingCode = {
  VALIDATION_COMPLETED: 'VALIDATION_COMPLETED',
  VALIDATOR_INTERNAL_ERROR: 'VALIDATOR_INTERNAL_ERROR',
  SKU_MISMATCH: 'SKU_MISMATCH',
  PRODUCT_NAME_MISMATCH: 'PRODUCT_NAME_MISMATCH',
  BRAND_MISMATCH: 'BRAND_MISMATCH',
  PRICE_MISMATCH: 'PRICE_MISMATCH',
  CURRENCY_MISMATCH: 'CURRENCY_MISMATCH',
  PROMO_PRICE_MISMATCH: 'PROMO_PRICE_MISMATCH',
  UNSUPPORTED_PROMOTION: 'UNSUPPORTED_PROMOTION',
  UNSUPPORTED_DISCOUNT: 'UNSUPPORTED_DISCOUNT',
  DISCOUNT_MISMATCH: 'DISCOUNT_MISMATCH',
  STOCK_CONTRADICTION: 'STOCK_CONTRADICTION',
  SIZE_MISMATCH: 'SIZE_MISMATCH',
  CONCENTRATION_MISMATCH: 'CONCENTRATION_MISMATCH',
  UNSUPPORTED_FRAGRANCE_NOTE: 'UNSUPPORTED_FRAGRANCE_NOTE',
  UNSUPPORTED_ORIGIN: 'UNSUPPORTED_ORIGIN',
  ORIGIN_MISMATCH: 'ORIGIN_MISMATCH',
  UNSUPPORTED_SIMILARITY_CLAIM: 'UNSUPPORTED_SIMILARITY_CLAIM',
  SIMILARITY_WORDING_EXCEEDS_APPROVAL: 'SIMILARITY_WORDING_EXCEEDS_APPROVAL',
  UNSUPPORTED_PERFORMANCE_CLAIM: 'UNSUPPORTED_PERFORMANCE_CLAIM',
  FACTS_USED_MISMATCH: 'FACTS_USED_MISMATCH',
} as const;
export type FindingCode = (typeof FindingCode)[keyof typeof FindingCode];

export interface ValidationFindingDraft {
  field: string;
  severity: FindingSeverity;
  code: FindingCode;
  message: string;
  expectedValue?: unknown;
  actualValue?: unknown;
  sourcePath?: string;
  contentPath?: string;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface FactualValidationInput {
  productSnapshot: ProductSnapshot;
  contentVersion: ContentVersion;
}

export interface FactualValidationOutcome {
  validatorVersion: typeof FACTUAL_VALIDATOR_VERSION;
  status: ValidationStatus;
  findings: readonly ValidationFindingDraft[];
  findingCount: number;
  blockingCount: number;
  warningCount: number;
  infoCount: number;
}

export interface ContentTextSegment {
  path: string;
  text: string;
}

export function contentTextSegments(version: ContentVersion): readonly ContentTextSegment[] {
  const output = version.structuredOutput;
  return [
    { path: 'headline', text: output.headline },
    ...(output.khmer_caption === null
      ? []
      : [{ path: 'khmer_caption', text: output.khmer_caption }]),
    ...(output.english_caption === null
      ? []
      : [{ path: 'english_caption', text: output.english_caption }]),
    { path: 'cta', text: output.cta },
    ...output.hashtags.map((text, index) => ({ path: `hashtags[${index}]`, text })),
    { path: 'creative_brief', text: output.creative_brief },
    ...output.facts_used.map((text, index) => ({ path: `facts_used[${index}]`, text })),
  ];
}
