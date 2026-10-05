import { type BrandRuleVersion } from '../../brand/application/brand-rule.repository.js';
import { type ContentJob } from '../../content/application/content-generation.repository.js';
import { type ProductSnapshot } from '../../products/application/product-snapshot.repository.js';

export const PROMPT_CONTEXT_VERSION = 'ps-content-v1';

export interface TrustedContextSection<T> {
  trust: 'TRUSTED';
  data: T;
}

export interface UntrustedContextSection<T> {
  trust: 'UNTRUSTED_DATA';
  data: T;
}

export interface AIContext {
  version: typeof PROMPT_CONTEXT_VERSION;
  systemRules: TrustedContextSection<readonly string[]>;
  brandRules: TrustedContextSection<BrandRuleVersion['rules']>;
  contentStrategy: TrustedContextSection<{
    contentType: ContentJob['contentType'];
    objective: string;
    instructions: readonly string[];
    constraints: readonly string[];
  }>;
  productFacts: UntrustedContextSection<ProductSnapshot['product']['product']>;
  reviewerInstruction?: UntrustedContextSection<string>;
  previousDraft?: UntrustedContextSection<unknown>;
  request: Readonly<{
    contentJobId: string;
    language: ContentJob['language'];
    platform: ContentJob['platform'];
    campaignContext?: string;
  }>;
}
