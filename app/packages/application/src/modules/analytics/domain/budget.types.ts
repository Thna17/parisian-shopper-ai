export const BudgetScope = {
  GLOBAL: 'GLOBAL',
  MONTHLY: 'MONTHLY',
  CAMPAIGN: 'CAMPAIGN',
} as const;
export type BudgetScope = (typeof BudgetScope)[keyof typeof BudgetScope];

export const BudgetPolicyStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  EXPIRED: 'EXPIRED',
} as const;
export type BudgetPolicyStatus = (typeof BudgetPolicyStatus)[keyof typeof BudgetPolicyStatus];

export const ReservationStatus = {
  PENDING: 'PENDING',
  COMMITTED: 'COMMITTED',
  RELEASED: 'RELEASED',
  EXPIRED: 'EXPIRED',
  UNRECONCILED: 'UNRECONCILED',
} as const;
export type ReservationStatus = (typeof ReservationStatus)[keyof typeof ReservationStatus];

export const CostKnowledgeState = {
  EXACT: 'EXACT',
  ESTIMATED: 'ESTIMATED',
  ZERO_CONFIRMED: 'ZERO_CONFIRMED',
  UNKNOWN: 'UNKNOWN',
} as const;
export type CostKnowledgeState = (typeof CostKnowledgeState)[keyof typeof CostKnowledgeState];

export const ReconciliationStatus = {
  SETTLED: 'SETTLED',
  PENDING_RECONCILIATION: 'PENDING_RECONCILIATION',
  DISPUTED: 'DISPUTED',
  MANUALLY_RECONCILED: 'MANUALLY_RECONCILED',
} as const;
export type ReconciliationStatus = (typeof ReconciliationStatus)[keyof typeof ReconciliationStatus];

export interface AiBudgetPolicyRecord {
  readonly id: string;
  readonly scope: BudgetScope;
  readonly currency: string;
  readonly monthlyCeiling: number;
  readonly perRequestCeiling: number;
  readonly softAlertThreshold: number;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
  readonly status: BudgetPolicyStatus;
  readonly createdById: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AiCostReservationRecord {
  readonly id: string;
  readonly budgetPolicyId: string;
  readonly idempotencyKey: string;
  readonly contentJobId: string | null;
  readonly creativeJobId: string | null;
  readonly generationAttemptId: string | null;
  readonly reservedAmount: number;
  readonly currency: string;
  readonly status: ReservationStatus;
  readonly expiresAt: Date;
  readonly settledAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AiUsageRecordData {
  readonly id: string;
  readonly reservationId: string | null;
  readonly generationAttemptId: string | null;
  readonly provider: string;
  readonly model: string;
  readonly providerRequestId: string | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly totalTokens: number | null;
  readonly estimatedCost: number;
  readonly confirmedCost: number | null;
  readonly currency: string;
  readonly costKnowledge: CostKnowledgeState;
  readonly reconciliationStatus: ReconciliationStatus;
  readonly reconciliationNotes: string | null;
  readonly createdAt: Date;
  readonly settledAt: Date | null;
}

export interface BudgetUtilizationResult {
  readonly policyId: string;
  readonly currency: string;
  readonly monthlyCeiling: number;
  readonly perRequestCeiling: number;
  readonly softAlertThreshold: number;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly settledCostUsd: number;
  readonly activeReservedCostUsd: number;
  readonly unreconciledExposureUsd: number;
  readonly totalCommittedCostUsd: number;
  readonly remainingHeadroomUsd: number;
  readonly utilizationPercent: number;
  readonly isExhausted: boolean;
  readonly isSoftAlertTriggered: boolean;
  readonly asOf: string;
}

export interface CreateBudgetPolicyInput {
  readonly scope?: BudgetScope;
  readonly currency?: string;
  readonly monthlyCeiling: number;
  readonly perRequestCeiling?: number;
  readonly softAlertThreshold?: number;
  readonly effectiveFrom?: Date;
  readonly effectiveTo?: Date | null;
  readonly actorUserId: string;
}

export interface UpdateBudgetPolicyInput {
  readonly monthlyCeiling?: number;
  readonly perRequestCeiling?: number;
  readonly softAlertThreshold?: number;
  readonly status?: BudgetPolicyStatus;
  readonly effectiveTo?: Date | null;
  readonly actorUserId: string;
}

export interface ReserveBudgetInput {
  readonly idempotencyKey: string;
  readonly estimatedMaxCost: number;
  readonly contentJobId?: string | undefined;
  readonly creativeJobId?: string | undefined;
  readonly generationAttemptId?: string | undefined;
  readonly ttlSeconds?: number | undefined;
}

export interface SettleReservationInput {
  readonly reservationId: string;
  readonly provider: string;
  readonly model: string;
  readonly providerRequestId?: string | undefined;
  readonly inputTokens?: number | undefined;
  readonly outputTokens?: number | undefined;
  readonly totalTokens?: number | undefined;
  readonly actualCost?: number | undefined;
  readonly confirmedCost?: number | undefined;
  readonly costKnowledge?: CostKnowledgeState | undefined;
  readonly generationAttemptId?: string | undefined;
}

export interface CostLedgerItem {
  readonly id: string;
  readonly type: 'RESERVATION' | 'USAGE';
  readonly referenceId: string;
  readonly provider: string;
  readonly model: string;
  readonly status: string;
  readonly costKnowledge: string;
  readonly amountUsd: number;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly idempotencyKey?: string | undefined;
  readonly createdAt: string;
}

export interface PaginatedCostLedger {
  readonly items: readonly CostLedgerItem[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
}

export interface UnreconciledUsageRecord {
  readonly reservationId: string;
  readonly idempotencyKey: string;
  readonly contentJobId: string | null;
  readonly creativeJobId: string | null;
  readonly reservedAmount: number;
  readonly status: ReservationStatus;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly reason: string;
}

export interface ReconcileUsageInput {
  readonly reservationId: string;
  readonly resolution: 'SETTLE_CONFIRMED' | 'RELEASE_UNBILLED' | 'MANUAL_ADJUSTMENT';
  readonly confirmedCost?: number;
  readonly notes: string;
  readonly actorUserId: string;
}

export interface CostLedgerQuery {
  readonly page?: number;
  readonly limit?: number;
  readonly provider?: string;
  readonly model?: string;
  readonly status?: string;
  readonly startDate?: Date;
  readonly endDate?: Date;
}
