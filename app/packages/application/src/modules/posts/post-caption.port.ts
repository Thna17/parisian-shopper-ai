import type { AIContext } from '../ai/application/ai-context.js';
import type { AIContentOutput } from '../ai/domain/ai-output.schema.js';
import type { BrandRuleVersion } from '../brand/application/brand-rule.repository.js';
import type { FactualValidationOutcome } from '../validation/domain/validation.js';
import type { PostActor } from './post-policy.js';
export const POST_CAPTION_PROVIDER = Symbol('POST_CAPTION_PROVIDER');
export const POST_CAPTION_REPOSITORY = Symbol('POST_CAPTION_REPOSITORY');
export type CaptionState =
  'QUEUED' | 'GENERATING' | 'COMPLETE' | 'BLOCKED' | 'FAILED' | 'UNCERTAIN';
export interface CaptionAttempt {
  id: string;
  postId: string;
  sourceRevisionId: string;
  sourceRevisionNumber: number;
  requesterUserId: string;
  brandRuleVersionId: string | null;
  brandRuleDigest: string | null;
  method: 'AI' | 'TEMPLATE';
  status: CaptionState;
  provider: string;
  model: string;
  context: unknown;
  output: unknown;
  provenance: unknown;
  validation: unknown;
  error: string | null;
  deadline: Date;
  providerRequestId: string | null;
}
export interface CaptionBrandOption {
  version: BrandRuleVersion;
  digest: string;
  approved: boolean;
  hasPlaceholders: boolean;
}
export interface PostCaptionRepository {
  brands(): Promise<CaptionBrandOption[]>;
  approveBrand(id: string, digest: string, actor: PostActor): Promise<void>;
  enqueue(input: {
    postId: string;
    expectedRevision: number;
    actor: PostActor;
    brandRuleVersionId: string | null;
    brandRuleDigest: string | null;
    method: 'AI' | 'TEMPLATE';
    provider: string;
    model: string;
    context: AIContext | null;
    timeoutMs: number;
  }): Promise<CaptionAttempt>;
  latest(postId: string): Promise<CaptionAttempt | null>;
  claim(id: string): Promise<boolean>;
  capture(
    id: string,
    output: unknown,
    provenance: Record<string, unknown>,
    providerRequestId?: string,
  ): Promise<void>;
  finish(id: string, output: AIContentOutput, validation: FactualValidationOutcome): Promise<void>;
  fail(id: string, status: 'FAILED' | 'UNCERTAIN' | 'BLOCKED', error: string): Promise<void>;
}
