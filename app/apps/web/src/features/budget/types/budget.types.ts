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

export const LedgerEntryType = {
  RESERVATION_CREATED: 'RESERVATION_CREATED',
  RESERVATION_HOLD: 'RESERVATION_HOLD',
  RESERVATION_RELEASED: 'RESERVATION_RELEASED',
  RESERVATION_RELEASE: 'RESERVATION_RELEASE',
  USAGE_COMMITTED: 'USAGE_COMMITTED',
  COST_COMMITMENT: 'COST_COMMITMENT',
  USAGE_CORRECTION: 'USAGE_CORRECTION',
  CORRECTION: 'CORRECTION',
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

export const CircuitState = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
} as const;
export type CircuitState = (typeof CircuitState)[keyof typeof CircuitState];

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
  readonly rollingQuotaLimits?: Record<string, unknown> | null;
  readonly allowedProviders: readonly string[];
  readonly allowedFallbacks: readonly string[];
  readonly effectiveFrom: string | Date;
  readonly effectiveTo?: string | Date | null;
  readonly approvedByUserId?: string | null;
  readonly createdAt: string | Date;
  readonly updatedAt: string | Date;
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

export interface ActiveBudgetReport {
  readonly policy: BudgetPolicyRecord | null;
  readonly quota: QuotaStatusReport | null;
}

export interface UsageReservationRecord {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly budgetPolicyVersionId: string;
  readonly userId: string;
  readonly tenantId: string;
  readonly creativeJobId?: string | null;
  readonly contentJobId?: string | null;
  readonly campaignId?: string | null;
  readonly providerId: string;
  readonly modelId: string;
  readonly estimatedCost: number;
  readonly currency: string;
  readonly capacityUnits?: number | null;
  readonly state: ReservationLifecycleState;
  readonly createdAt: string | Date;
  readonly dispatchedAt?: string | Date | null;
  readonly expiresAt: string | Date;
  readonly closedAt?: string | Date | null;
  readonly version: number;
}

export interface UsageLedgerEntryRecord {
  readonly id: string;
  readonly entryType: LedgerEntryType;
  readonly reservationId: string;
  readonly attemptId?: string | null;
  readonly settlementKey: string;
  readonly amount: number;
  readonly currency: string;
  readonly costKnowledge: CostKnowledgeState;
  readonly pricingVersionId?: string | null;
  readonly exchangeRate?: number | null;
  readonly exchangeRateSource?: string | null;
  readonly exchangeRateSourceRecordId?: string | null;
  readonly exchangeRateEffectiveAt?: string | Date | null;
  readonly baseCurrency?: string | null;
  readonly quoteCurrency?: string | null;
  readonly recordedAt: string | Date;
  readonly reconciliationRef?: string | null;
  readonly correctionOfEntryId?: string | null;
  readonly actorUserId?: string | null;
  readonly systemComponent: string;
  readonly createdAt: string | Date;
  readonly modelId?: string;
  readonly tokenCount?: number;
}

export interface UpdateBudgetPolicyParams {
  readonly monthlyCeiling?: number;
  readonly dailyCeiling?: number;
  readonly perOperationMax?: number;
  readonly softAlertThreshold?: number;
  readonly enforceHardCap?: boolean;
  readonly maxDailyRetries?: number;
  readonly reservationTtlSeconds?: number;
  readonly allowedProviders?: readonly string[];
  readonly allowedFallbacks?: readonly string[];
}

export interface ReconcileReservationParams {
  readonly settlementKey: string;
  readonly confirmedAmount: number;
  readonly isCharged: boolean;
  readonly reconciliationRef: string;
  readonly costKnowledge: CostKnowledgeState;
  readonly notes?: string;
}

export interface CircuitBreakerStatus {
  readonly modality: AiModality;
  readonly providerId: string;
  readonly state: CircuitState;
  readonly consecutiveFailures: number;
  readonly cooldownSecondsRemaining: number;
  readonly lastTrippedAt?: string | null;
  readonly lastProbeAt?: string | null;
}

export interface ProviderRoutingCapability {
  readonly providerId: string;
  readonly modelId: string;
  readonly capability: string;
  readonly modality: AiModality;
  readonly estimatedCostPerUnit?: number;
  readonly currency: string;
  readonly healthy: boolean;
  readonly circuitState: CircuitState;
  readonly fallbackChain?: readonly string[];
}

export interface ListLedgerQuery {
  readonly limit?: number;
  readonly offset?: number;
  readonly entryType?: string;
  readonly reservationId?: string;
}

export interface ListUnreconciledQuery {
  readonly limit?: number;
  readonly offset?: number;
}

export interface RouteCapabilityQuery {
  readonly modality?: AiModality;
  readonly capability?: string;
  readonly preferredProviderId?: string;
}
