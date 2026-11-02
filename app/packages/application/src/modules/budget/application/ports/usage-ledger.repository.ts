import {
  type CompleteAttemptInput,
  type CostKnowledgeState,
  type LedgerEntryType,
  type ProviderAttemptRecord,
  type ReservationLifecycleState,
  type UsageLedgerEntryRecord,
  type UsageReservationRecord,
} from '../../domain/budget.types.js';

export const USAGE_LEDGER_REPOSITORY = Symbol('USAGE_LEDGER_REPOSITORY');

export interface UsageReservationDraft {
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
  readonly expiresAt: Date;
}

export interface ProviderAttemptDraft {
  readonly reservationId: string;
  readonly attemptNumber: number;
  readonly providerId: string;
  readonly modelId: string;
  readonly modality: string;
  readonly safePromptDigest: string;
  readonly digestAlgorithm: string;
  readonly digestKeyVersion: string;
  readonly retryRelationship?: string | undefined;
  readonly providerRequestId?: string | undefined;
}

export interface UsageLedgerEntryDraft {
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
  readonly reconciliationRef?: string | null | undefined;
  readonly correctionOfEntryId?: string | null | undefined;
  readonly actorUserId?: string | null | undefined;
  readonly systemComponent?: string | undefined;
}

export interface UsageLedgerRepository {
  createReservation(draft: UsageReservationDraft): Promise<UsageReservationRecord>;
  findReservationById(id: string): Promise<UsageReservationRecord | null>;
  findReservationByIdempotencyKey(key: string): Promise<UsageReservationRecord | null>;
  updateReservationState(
    id: string,
    state: ReservationLifecycleState,
    expectedVersion: number,
    closedAt?: Date | null,
    dispatchedAt?: Date | null,
  ): Promise<UsageReservationRecord>;
  listExpiredReservations(cutoff: Date): Promise<readonly UsageReservationRecord[]>;

  createAttempt(draft: ProviderAttemptDraft): Promise<ProviderAttemptRecord>;
  findAttemptById(id: string): Promise<ProviderAttemptRecord | null>;
  findAttemptByReservationAndNumber(
    reservationId: string,
    attemptNumber: number,
  ): Promise<ProviderAttemptRecord | null>;
  updateAttempt(input: CompleteAttemptInput): Promise<ProviderAttemptRecord>;
  listAttemptsByReservationId(reservationId: string): Promise<readonly ProviderAttemptRecord[]>;

  appendLedgerEntry(draft: UsageLedgerEntryDraft): Promise<UsageLedgerEntryRecord>;
  findLedgerEntryBySettlementKey(key: string): Promise<UsageLedgerEntryRecord | null>;
  listLedgerEntriesByReservationId(
    reservationId: string,
  ): Promise<readonly UsageLedgerEntryRecord[]>;
  listLedgerEntries(
    limit?: number,
    offset?: number,
  ): Promise<{
    readonly items: readonly UsageLedgerEntryRecord[];
    readonly total: number;
  }>;

  getAggregateSpend(
    scopeType: string,
    scopeId: string,
    fromDate: Date,
    toDate: Date,
    currency?: string,
  ): Promise<number>;

  getActiveReservedExposure(
    scopeType: string,
    scopeId: string,
    now: Date,
    currency?: string,
  ): Promise<number>;

  listHeldReservations(limit?: number, offset?: number): Promise<readonly UsageReservationRecord[]>;
}
