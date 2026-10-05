import { type NormalizedProductEnvelope } from '../../products/domain/product.schema.js';
import { type PersistedValidationResult } from '../../validation/application/validation.repository.js';
import {
  type ContentLanguage,
  type ContentPlatform,
  type ContentType,
} from '../../content/domain/content.js';
import {
  type TelegramAction,
  type TelegramActor,
  type TelegramUserProfile,
} from '../domain/telegram.js';

export const TELEGRAM_WORKFLOW_REPOSITORY = Symbol('TELEGRAM_WORKFLOW_REPOSITORY');

export interface TelegramCreateFlow {
  id: string;
  telegramIdentityId: string;
  product: NormalizedProductEnvelope;
  status:
    | 'SELECTING_CONTENT_TYPE'
    | 'SELECTING_LANGUAGE'
    | 'SELECTING_PLATFORM'
    | 'COMPLETED'
    | 'EXPIRED';
  contentType?: ContentType;
  language?: ContentLanguage;
  platform?: ContentPlatform;
  expiresAt: Date;
  completedAt?: Date;
}

export interface TelegramActionTokenRecord {
  id: string;
  telegramIdentityId: string;
  action: TelegramAction;
  resourceId: string;
  metadata?: Readonly<Record<string, unknown>>;
  singleUse: boolean;
  expiresAt: Date;
}

export type ConsumeActionTokenResult =
  | { disposition: 'VALID'; token: TelegramActionTokenRecord }
  | { disposition: 'NOT_FOUND' | 'EXPIRED' | 'WRONG_USER' | 'CONSUMED' };

export interface TelegramJobSummary {
  jobId: string;
  sku: string;
  productName: string;
  contentType: ContentType;
  language: ContentLanguage;
  platform: ContentPlatform;
  jobStatus: string;
  versionId?: string;
  versionNumber?: number;
  validationStatus?: string;
  createdAt: Date;
}

export interface TelegramDraftView extends TelegramJobSummary {
  requesterTelegramUserId: string;
  telegramIdentityId: string;
  requesterRoles?: readonly string[];
  output: {
    headline: string;
    khmerCaption: string | null;
    englishCaption: string | null;
    cta: string;
    hashtags: readonly string[];
  };
  validation: PersistedValidationResult;
  allVersions?: readonly {
    id: string;
    versionNumber: number;
    validationStatus?: string;
    createdAt: Date;
    headline: string;
  }[];
}

export interface TelegramFailureView {
  jobId: string;
  productName: string;
  requesterTelegramUserId: string;
  telegramIdentityId: string;
}

export interface TelegramOutboxEvent {
  id: string;
  topic: string;
  payload: Readonly<Record<string, unknown>>;
  attemptCount: number;
}

export interface StoreActionTokenInput {
  tokenHash: string;
  telegramIdentityId: string;
  action: TelegramAction;
  resourceId: string;
  metadata?: Readonly<Record<string, unknown>>;
  singleUse: boolean;
  expiresAt: Date;
}

export interface TelegramWorkflowRepository {
  claimInboundUpdate(
    updateId: string,
    telegramUserId: string | null,
    updateType: string,
  ): Promise<boolean>;
  resolveActor(profile: TelegramUserProfile): Promise<TelegramActor | null>;
  recordDeniedAccess(profile: TelegramUserProfile): Promise<void>;
  consumeRateLimit(
    identityId: string,
    action: string,
    limit: number,
    windowSeconds: number,
  ): Promise<boolean>;
  createFlow(
    identityId: string,
    product: NormalizedProductEnvelope,
    expiresAt: Date,
  ): Promise<TelegramCreateFlow>;
  findFlowById(id: string): Promise<TelegramCreateFlow | null>;
  updateFlowSelection(
    id: string,
    field: 'contentType' | 'language' | 'platform',
    value: string,
  ): Promise<TelegramCreateFlow>;
  completeFlow(id: string): Promise<void>;
  storeActionTokens(inputs: readonly StoreActionTokenInput[]): Promise<void>;
  consumeActionToken(
    tokenHash: string,
    telegramUserId: string,
    now: Date,
  ): Promise<ConsumeActionTokenResult>;
  listRecentJobs(actor: TelegramActor, limit: number): Promise<readonly TelegramJobSummary[]>;
  listHistory(
    actor: TelegramActor,
    sku: string,
    limit: number,
  ): Promise<readonly TelegramJobSummary[]>;
  findJobByFlowId(flowId: string): Promise<TelegramJobSummary | null>;
  getSourceByJobId(actor: TelegramActor, jobId: string): Promise<NormalizedProductEnvelope | null>;
  getValidationByVersionId(
    actor: TelegramActor,
    versionId: string,
  ): Promise<PersistedValidationResult | null>;
  getDraftViewByVersionId(versionId: string): Promise<TelegramDraftView | null>;
  getFailureViewByJobId(jobId: string): Promise<TelegramFailureView | null>;
  claimOutboxEvents(
    topics: readonly string[],
    limit: number,
    now: Date,
  ): Promise<readonly TelegramOutboxEvent[]>;
  beginNotificationDelivery(
    outboxEventId: string,
    telegramIdentityId: string,
  ): Promise<'SEND' | 'ALREADY_SENT'>;
  markNotificationSent(outboxEventId: string, now: Date): Promise<void>;
  markNotificationFailed(
    outboxEventId: string,
    errorCode: string,
    retryAt: Date,
    terminal: boolean,
  ): Promise<void>;
  markOutboxProcessed(outboxEventId: string, now: Date): Promise<void>;
  createPendingInteraction(input: {
    telegramIdentityId: string;
    contentJobId: string;
    contentVersionId: string;
    action: 'EDIT' | 'REJECT';
    expiresAt: Date;
  }): Promise<void>;
  findActivePendingInteraction(
    telegramIdentityId: string,
    now: Date,
  ): Promise<{
    id: string;
    contentJobId: string;
    contentVersionId: string;
    action: 'EDIT' | 'REJECT';
  } | null>;
  completePendingInteraction(id: string, now: Date): Promise<void>;
  cancelPendingInteraction(id: string, now: Date): Promise<void>;
  getPreviousVersions(
    actor: TelegramActor,
    jobId: string,
  ): Promise<
    readonly {
      id: string;
      versionNumber: number;
      validationStatus?: string;
      createdAt: Date;
      headline: string;
    }[]
  >;
  appendAudit(input: {
    actor?: TelegramActor;
    action: string;
    resourceType?: string;
    resourceId?: string;
    metadata?: Readonly<Record<string, unknown>>;
  }): Promise<void>;
}
