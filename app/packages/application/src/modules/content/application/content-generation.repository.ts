import { type AIContentOutput } from '../../ai/domain/ai-output.schema.js';
import {
  type ContentJobStatus,
  ContentLanguage,
  ContentPlatform,
  ContentType,
} from '../domain/content.js';

export const CONTENT_GENERATION_REPOSITORY = Symbol('CONTENT_GENERATION_REPOSITORY');

export interface ContentJob {
  id: string;
  productSnapshotId: string;
  brandRuleVersionId: string;
  requesterUserId: string;
  telegramCreateFlowId?: string;
  contentType: ContentType;
  language: ContentLanguage;
  platform: ContentPlatform;
  campaignContext?: string;
  status: ContentJobStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface GenerationAttempt {
  id: string;
  contentJobId: string;
  attemptNumber: number;
  provider: string;
  model: string;
  promptVersion: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT';
  startedAt: Date;
  completedAt?: Date;
  errorCode?: string;
}

export interface ContentVersion {
  id: string;
  contentJobId: string;
  versionNumber: number;
  brandRuleVersionId: string;
  productSnapshotId: string;
  generationAttemptId: string;
  revisionRequestId?: string;
  provider: string;
  model: string;
  promptVersion: string;
  structuredOutput: AIContentOutput;
  createdAt: Date;
}

export interface CreateContentJobInput {
  productSnapshotId: string;
  brandRuleVersionId: string;
  requesterUserId: string;
  telegramCreateFlowId?: string;
  contentType: ContentType;
  language: ContentLanguage;
  platform: ContentPlatform;
  campaignContext?: string;
}

export interface BeginGenerationInput {
  contentJobId: string;
  provider: string;
  model: string;
  promptVersion: string;
  staleAfterMs: number;
}

export interface ActiveRevisionContext {
  id: string;
  type: 'EDIT' | 'REGENERATE';
  sourceContentVersionId: string;
  instruction?: string;
}

export type BeginGenerationResult =
  | {
      disposition: 'STARTED';
      job: ContentJob;
      attempt: GenerationAttempt;
      activeRevision?: ActiveRevisionContext;
    }
  | { disposition: 'ALREADY_COMPLETE'; job: ContentJob }
  | { disposition: 'ALREADY_RUNNING'; job: ContentJob };

export interface CompleteGenerationInput {
  contentJobId: string;
  attemptId: string;
  output: AIContentOutput;
  provider: string;
  model: string;
  promptVersion: string;
  providerMetadata?: Readonly<Record<string, unknown>>;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  latencyMs: number;
}

export interface FailGenerationInput {
  contentJobId: string;
  attemptId: string;
  status: 'FAILED' | 'TIMED_OUT';
  errorCode: string;
  errorMetadata?: Readonly<Record<string, unknown>>;
  latencyMs: number;
}

export interface ContentGenerationRepository {
  createJob(input: CreateContentJobInput): Promise<ContentJob>;
  findJobById(id: string): Promise<ContentJob | null>;
  findVersionById(id: string): Promise<ContentVersion | null>;
  beginGeneration(input: BeginGenerationInput): Promise<BeginGenerationResult>;
  completeGeneration(input: CompleteGenerationInput): Promise<ContentVersion>;
  failGeneration(input: FailGenerationInput): Promise<void>;
  findVersionsByJobId(contentJobId: string): Promise<readonly ContentVersion[]>;
  findAttemptsByJobId(contentJobId: string): Promise<readonly GenerationAttempt[]>;
}
