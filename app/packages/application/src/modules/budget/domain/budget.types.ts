export const ReservationLifecycleState = {
  RESERVED: 'RESERVED',
  DISPATCHED: 'DISPATCHED',
  RELEASED: 'RELEASED',
  EXPIRED: 'EXPIRED',
  HELD_FOR_RECONCILIATION: 'HELD_FOR_RECONCILIATION',
  SETTLED: 'SETTLED',
} as const;
export type ReservationLifecycleState =
  (typeof ReservationLifecycleState)[keyof typeof ReservationLifecycleState];

export const ProviderAttemptOutcome = {
  IN_PROGRESS: 'IN_PROGRESS',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  CANCELLED_AFTER_DISPATCH: 'CANCELLED_AFTER_DISPATCH',
  TIMED_OUT: 'TIMED_OUT',
  UNKNOWN_OUTCOME: 'UNKNOWN_OUTCOME',
} as const;
export type ProviderAttemptOutcome =
  (typeof ProviderAttemptOutcome)[keyof typeof ProviderAttemptOutcome];

export const RetryRelationship = {
  INITIAL_ATTEMPT: 'INITIAL_ATTEMPT',
  RETRY_OF_FAILURE: 'RETRY_OF_FAILURE',
  NONE: 'NONE',
} as const;
export type RetryRelationship = (typeof RetryRelationship)[keyof typeof RetryRelationship];

export const LedgerEntryType = {
  RESERVATION_CREATED: 'RESERVATION_CREATED',
  RESERVATION_RELEASED: 'RESERVATION_RELEASED',
  USAGE_COMMITTED: 'USAGE_COMMITTED',
  USAGE_CORRECTION: 'USAGE_CORRECTION',
  UNKNOWN_OUTCOME_HOLD: 'UNKNOWN_OUTCOME_HOLD',
  RECONCILIATION_CONFIRMED: 'RECONCILIATION_CONFIRMED',
  RECONCILIATION_RELEASED: 'RECONCILIATION_RELEASED',
} as const;
export type LedgerEntryType = (typeof LedgerEntryType)[keyof typeof LedgerEntryType];

export const AiModality = {
  TEXT: 'TEXT',
  IMAGE: 'IMAGE',
  VIDEO: 'VIDEO',
} as const;
export type AiModality = (typeof AiModality)[keyof typeof AiModality];

export const PricingUnit = {
  PER_1K_TOKENS: 'PER_1K_TOKENS',
  PER_1M_TOKENS: 'PER_1M_TOKENS',
  PER_IMAGE: 'PER_IMAGE',
  PER_VIDEO_SECOND: 'PER_VIDEO_SECOND',
  SUBSCRIPTION_FLAT: 'SUBSCRIPTION_FLAT',
} as const;
export type PricingUnit = (typeof PricingUnit)[keyof typeof PricingUnit];

export const PricingApprovalStatus = {
  PROPOSED: 'PROPOSED',
  APPROVED: 'APPROVED',
  SUPERSEDED: 'SUPERSEDED',
  REJECTED: 'REJECTED',
} as const;
export type PricingApprovalStatus =
  (typeof PricingApprovalStatus)[keyof typeof PricingApprovalStatus];

export const EnvironmentTier = {
  DEVELOPMENT: 'DEVELOPMENT',
  STAGING: 'STAGING',
  PRODUCTION: 'PRODUCTION',
} as const;
export type EnvironmentTier = (typeof EnvironmentTier)[keyof typeof EnvironmentTier];

export const CostKnowledgeState = {
  EXACT: 'EXACT',
  ESTIMATED: 'ESTIMATED',
  ZERO_CONFIRMED: 'ZERO_CONFIRMED',
  UNKNOWN: 'UNKNOWN',
} as const;
export type CostKnowledgeState = (typeof CostKnowledgeState)[keyof typeof CostKnowledgeState];

export const BudgetScopeType = {
  GLOBAL: 'GLOBAL',
  TENANT: 'TENANT',
  CAMPAIGN: 'CAMPAIGN',
  USER: 'USER',
} as const;
export type BudgetScopeType = (typeof BudgetScopeType)[keyof typeof BudgetScopeType];

export interface BudgetPolicyRecord {
  readonly id: string;
  readonly version: string;
  readonly scopeType: BudgetScopeType;
  readonly scopeId: string;
  readonly currency: string;
  readonly monthlyCeiling: number;
  readonly dailyCeiling: number;
  readonly perOperationMax: number;
  readonly softAlertThreshold: number; // 0.50 to 0.99
  readonly enforceHardCap: boolean;
  readonly maxDailyRetries: number;
  readonly reservationTtlSeconds: number;
  readonly rollingQuotaLimits?: Record<string, unknown> | null | undefined;
  readonly allowedProviders: readonly string[];
  readonly allowedFallbacks: readonly string[];
  readonly effectiveFrom: Date;
  readonly effectiveTo?: Date | null | undefined;
  readonly approvedByUserId?: string | null | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface UsageReservationRecord {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly budgetPolicyVersionId: string;
  readonly userId: string;
  readonly tenantId: string;
  readonly creativeJobId?: string | null | undefined;
  readonly contentJobId?: string | null | undefined;
  readonly campaignId?: string | null | undefined;
  readonly providerId: string;
  readonly modelId: string;
  readonly estimatedCost: number;
  readonly currency: string;
  readonly capacityUnits?: number | null | undefined;
  readonly state: ReservationLifecycleState;
  readonly createdAt: Date;
  readonly dispatchedAt?: Date | null | undefined;
  readonly expiresAt: Date;
  readonly closedAt?: Date | null | undefined;
  readonly version: number;
}

export interface ProviderAttemptRecord {
  readonly id: string;
  readonly reservationId: string;
  readonly attemptNumber: number;
  readonly providerId: string;
  readonly modelId: string;
  readonly modality: AiModality;
  readonly providerRequestId?: string | null | undefined;
  readonly dispatchedAt: Date;
  readonly completedAt?: Date | null | undefined;
  readonly operationalOutcome: ProviderAttemptOutcome;
  readonly retryRelationship: RetryRelationship;
  readonly inputTokens?: number | null | undefined;
  readonly outputTokens?: number | null | undefined;
  readonly imageCount?: number | null | undefined;
  readonly resolutionTier?: string | null | undefined;
  readonly videoDurationSeconds?: number | null | undefined;
  readonly cancellationReason?: string | null | undefined;
  readonly durationMs?: number | null | undefined;
  readonly safePromptDigest: string;
  readonly digestAlgorithm: string;
  readonly digestKeyVersion: string;
  readonly outputDigest?: string | null | undefined;
  readonly errorCode?: string | null | undefined;
  readonly errorMessage?: string | null | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface UsageLedgerEntryRecord {
  readonly id: string;
  readonly entryType: LedgerEntryType;
  readonly reservationId: string;
  readonly attemptId?: string | null | undefined;
  readonly settlementKey: string;
  readonly amount: number;
  readonly currency: string;
  readonly costKnowledge: CostKnowledgeState;
  readonly pricingVersionId?: string | null | undefined;
  readonly exchangeRate?: number | null | undefined;
  readonly exchangeRateSource?: string | null | undefined;
  readonly exchangeRateSourceRecordId?: string | null | undefined;
  readonly exchangeRateEffectiveAt?: Date | null | undefined;
  readonly baseCurrency?: string | null | undefined;
  readonly quoteCurrency?: string | null | undefined;
  readonly recordedAt: Date;
  readonly reconciliationRef?: string | null | undefined;
  readonly correctionOfEntryId?: string | null | undefined;
  readonly actorUserId?: string | null | undefined;
  readonly systemComponent: string;
  readonly createdAt: Date;
}

export interface ProviderPricingVersionRecord {
  readonly id: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly capability: string;
  readonly modality: AiModality;
  readonly pricingUnit: PricingUnit;
  readonly inputTokenRate?: number | null | undefined;
  readonly outputTokenRate?: number | null | undefined;
  readonly imageRateByResolution?: Record<string, string | number> | null | undefined;
  readonly videoRateByDuration?: Record<string, string | number> | null | undefined;
  readonly subscriptionRules?: Record<string, unknown> | null | undefined;
  readonly currency: string;
  readonly source: string;
  readonly pricingSourceUrl: string;
  readonly sourceRetrievedAt: Date;
  readonly effectiveFrom: Date;
  readonly effectiveTo?: Date | null | undefined;
  readonly approvalStatus: PricingApprovalStatus;
  readonly approvedByUserId?: string | null | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ProviderCapabilityRegistrationRecord {
  readonly id: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly modality: AiModality;
  readonly supportedCapabilities: readonly string[];
  readonly environment: EnvironmentTier;
  readonly supportsIdempotency: boolean;
  readonly active: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface DomainEventEnvelope<T = Record<string, unknown>> {
  readonly eventId: string;
  readonly eventType: string;
  readonly eventVersion: string;
  readonly aggregateType:
    'UsageReservation' | 'ProviderAttempt' | 'UsageLedgerEntry' | 'BudgetPolicy';
  readonly aggregateId: string;
  readonly tenantId: string;
  readonly occurredAt: string;
  readonly recordedAt: string;
  readonly correlationId: string;
  readonly causationId: string;
  readonly idempotencyKey: string;
  readonly actorType: 'SYSTEM' | 'USER' | 'WORKER' | 'ADMIN';
  readonly actorId?: string | null | undefined;
  readonly policyVersionId?: string | null | undefined;
  readonly pricingVersionId?: string | null | undefined;
  readonly exchangeRateSnapshotId?: string | null | undefined;
  readonly payload: T;
}

export interface BudgetReservationInput {
  readonly idempotencyKey: string;
  readonly estimatedCost: number;
  readonly providerId: string;
  readonly modelId: string;
  readonly scopeType?: BudgetScopeType | undefined;
  readonly scopeId?: string | undefined;
  readonly userId?: string | undefined;
  readonly tenantId?: string | undefined;
  readonly creativeJobId?: string | undefined;
  readonly contentJobId?: string | undefined;
  readonly campaignId?: string | undefined;
  readonly currency?: string | undefined;
  readonly capacityUnits?: number | undefined;
  readonly ttlSeconds?: number | undefined;
}

export interface RecordAttemptInput {
  readonly reservationId: string;
  readonly attemptNumber: number;
  readonly providerId: string;
  readonly modelId: string;
  readonly modality: AiModality;
  readonly promptText: string;
  readonly modelParameters?: Record<string, unknown> | undefined;
  readonly templateVersion?: string | undefined;
  readonly retryRelationship?: RetryRelationship | undefined;
  readonly providerRequestId?: string | undefined;
}

export interface CompleteAttemptInput {
  readonly attemptId: string;
  readonly operationalOutcome: ProviderAttemptOutcome;
  readonly inputTokens?: number | undefined;
  readonly outputTokens?: number | undefined;
  readonly imageCount?: number | undefined;
  readonly resolutionTier?: string | undefined;
  readonly videoDurationSeconds?: number | undefined;
  readonly durationMs?: number | undefined;
  readonly outputDigest?: string | undefined;
  readonly errorCode?: string | undefined;
  readonly errorMessage?: string | undefined;
  readonly cancellationReason?: string | undefined;
  readonly providerRequestId?: string | undefined;
}

export interface CommitUsageInput {
  readonly reservationId: string;
  readonly attemptId?: string | undefined;
  readonly settlementKey: string;
  readonly amount: number;
  readonly currency?: string | undefined;
  readonly costKnowledge: CostKnowledgeState;
  readonly pricingVersionId?: string | undefined;
  readonly exchangeRate?: number | undefined;
  readonly exchangeRateSource?: string | undefined;
  readonly exchangeRateSourceRecordId?: string | undefined;
  readonly exchangeRateEffectiveAt?: Date | undefined;
  readonly baseCurrency?: string | undefined;
  readonly quoteCurrency?: string | undefined;
  readonly actorUserId?: string | undefined;
  readonly systemComponent?: string | undefined;
}

export interface ReconcileHeldReservationInput {
  readonly reservationId: string;
  readonly settlementKey: string;
  readonly confirmedAmount: number;
  readonly isCharged: boolean;
  readonly reconciliationRef: string;
  readonly costKnowledge: CostKnowledgeState;
  readonly actorUserId: string;
  readonly notes?: string | undefined;
}

export interface QuotaStatusReport {
  readonly policyId: string;
  readonly policyVersion: string;
  readonly scopeType: BudgetScopeType;
  readonly scopeId: string;
  readonly currency: string;
  readonly monthlyCeiling: number;
  readonly dailyCeiling: number;
  readonly perOperationMax: number;
  readonly softAlertThreshold: number;
  readonly totalSettledSpendMonth: number;
  readonly totalSettledSpendDay: number;
  readonly activeReservedExposure: number;
  readonly remainingMonthlyHeadroom: number;
  readonly remainingDailyHeadroom: number;
  readonly isMonthlyCeilingExhausted: boolean;
  readonly isDailyCeilingExhausted: boolean;
  readonly isSoftAlertTriggered: boolean;
  readonly asOf: string;
}
