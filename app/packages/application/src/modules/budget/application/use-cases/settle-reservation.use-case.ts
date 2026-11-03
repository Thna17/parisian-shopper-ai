import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  ActiveReservationNotFoundError,
  DuplicateSettlementError,
  ExchangeRateUnavailableError,
  ReservationStateTransitionError,
  UnverifiedPricingError,
} from '../../domain/budget-errors.js';
import {
  type CompleteAttemptInput,
  type CostKnowledgeState,
  type DomainEventEnvelope,
  type ProviderAttemptRecord,
  type UsageLedgerEntryRecord,
  type UsageReservationRecord,
} from '../../domain/budget.types.js';
import { CircuitBreakerService } from '../../domain/circuit-breaker.js';
import {
  PROVIDER_PRICING_REPOSITORY,
  type ProviderPricingRepository,
} from '../ports/provider-pricing.repository.js';
import {
  USAGE_LEDGER_REPOSITORY,
  type UsageLedgerRepository,
} from '../ports/usage-ledger.repository.js';

export interface SettleReservationCommand {
  readonly reservationId: string;
  readonly attemptId: string;
  readonly settlementKey: string;
  readonly outcome: CompleteAttemptInput['operationalOutcome'];
  readonly actualCost?: number | undefined;
  readonly currency?: string | undefined;
  readonly costKnowledge?: CostKnowledgeState | undefined;
  readonly pricingVersionId?: string | undefined;
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
  // Foreign exchange provenance
  readonly exchangeRate?: number | undefined;
  readonly exchangeRateSource?: string | undefined;
  readonly exchangeRateSourceRecordId?: string | undefined;
  readonly exchangeRateEffectiveAt?: Date | undefined;
  readonly baseCurrency?: string | undefined;
  readonly quoteCurrency?: string | undefined;
}

@Injectable()
export class SettleReservationUseCase {
  public constructor(
    @Inject(USAGE_LEDGER_REPOSITORY)
    private readonly usageLedgerRepo: UsageLedgerRepository,
    @Inject(PROVIDER_PRICING_REPOSITORY)
    private readonly pricingRepo: ProviderPricingRepository,
    private readonly circuitBreaker: CircuitBreakerService,
  ) {}

  public async execute(command: SettleReservationCommand): Promise<{
    readonly reservation: UsageReservationRecord;
    readonly attempt: ProviderAttemptRecord;
    readonly ledgerEntry: UsageLedgerEntryRecord;
    readonly event: DomainEventEnvelope<Record<string, unknown>>;
  }> {
    // 1. Idempotency Check (AC-4): duplicate settlement prevents double-debiting
    const existingEntry = await this.usageLedgerRepo.findLedgerEntryBySettlementKey(
      command.settlementKey,
    );
    if (existingEntry) {
      throw new DuplicateSettlementError(command.settlementKey);
    }

    const reservation = await this.usageLedgerRepo.findReservationById(command.reservationId);
    if (!reservation) {
      throw new ActiveReservationNotFoundError(command.reservationId);
    }

    const attempt = await this.usageLedgerRepo.findAttemptById(command.attemptId);
    if (!attempt) {
      throw new Error(`ProviderAttempt with id ${command.attemptId} not found.`);
    }

    // Reservation must be DISPATCHED or HELD_FOR_RECONCILIATION
    if (reservation.state !== 'DISPATCHED' && reservation.state !== 'HELD_FOR_RECONCILIATION') {
      throw new ReservationStateTransitionError(reservation.state, 'SETTLED');
    }

    const now = new Date();

    // Foreign currency provenance verification (AC-11)
    if (command.quoteCurrency && command.quoteCurrency !== (command.baseCurrency ?? 'USD')) {
      if (
        command.exchangeRate === undefined ||
        !command.exchangeRateSource ||
        !command.exchangeRateEffectiveAt
      ) {
        throw new ExchangeRateUnavailableError(
          command.quoteCurrency,
          command.baseCurrency ?? 'USD',
        );
      }
    }

    // Pricing provenance verification for paid executions (AC-10)
    if (
      command.outcome === 'SUCCEEDED' &&
      command.actualCost !== undefined &&
      command.actualCost > 0
    ) {
      if (command.pricingVersionId) {
        const pricing = await this.pricingRepo.findActivePricing(
          attempt.providerId,
          attempt.modelId,
          now,
        );
        if (!pricing || pricing.approvalStatus !== 'APPROVED') {
          throw new UnverifiedPricingError(attempt.providerId, attempt.modelId);
        }
      }
    }

    // 2. Handle State Transitions according to outcome
    if (command.outcome === 'SUCCEEDED') {
      // Transition attempt to SUCCEEDED
      const updatedAttempt = await this.usageLedgerRepo.updateAttempt({
        attemptId: attempt.id,
        operationalOutcome: 'SUCCEEDED',
        inputTokens: command.inputTokens,
        outputTokens: command.outputTokens,
        imageCount: command.imageCount,
        resolutionTier: command.resolutionTier,
        videoDurationSeconds: command.videoDurationSeconds,
        durationMs: command.durationMs,
        outputDigest: command.outputDigest,
        providerRequestId: command.providerRequestId,
      });

      this.circuitBreaker.recordSuccess(attempt.providerId, attempt.modality);

      // Transition reservation to SETTLED
      const updatedReservation = await this.usageLedgerRepo.updateReservationState(
        reservation.id,
        'SETTLED',
        reservation.version,
        now,
      );

      // Determine cost knowledge (AC-9)
      const costKnowledge: CostKnowledgeState =
        command.costKnowledge ?? (command.actualCost === 0 ? 'ZERO_CONFIRMED' : 'EXACT');

      const amount = command.actualCost ?? reservation.estimatedCost;

      const ledgerEntry = await this.usageLedgerRepo.appendLedgerEntry({
        entryType: 'USAGE_COMMITTED',
        reservationId: reservation.id,
        attemptId: attempt.id,
        settlementKey: command.settlementKey,
        amount,
        currency: command.currency ?? reservation.currency,
        costKnowledge,
        pricingVersionId: command.pricingVersionId ?? null,
        exchangeRate: command.exchangeRate ?? null,
        exchangeRateSource: command.exchangeRateSource ?? null,
        exchangeRateSourceRecordId: command.exchangeRateSourceRecordId ?? null,
        exchangeRateEffectiveAt: command.exchangeRateEffectiveAt ?? null,
        baseCurrency: command.baseCurrency ?? null,
        quoteCurrency: command.quoteCurrency ?? null,
        actorUserId: reservation.userId,
        systemComponent: 'usage-ledger-settlement-service',
      });

      const event: DomainEventEnvelope<Record<string, unknown>> = {
        eventId: randomUUID(),
        eventType: 'usage.committed',
        eventVersion: '1.0.0',
        aggregateType: 'UsageLedgerEntry',
        aggregateId: ledgerEntry.id,
        tenantId: reservation.tenantId,
        occurredAt: now.toISOString(),
        recordedAt: now.toISOString(),
        correlationId: reservation.idempotencyKey,
        causationId: attempt.id,
        idempotencyKey: command.settlementKey,
        actorType: 'WORKER',
        actorId: reservation.userId,
        policyVersionId: reservation.budgetPolicyVersionId,
        pricingVersionId: command.pricingVersionId ?? null,
        exchangeRateSnapshotId: command.exchangeRateSourceRecordId ?? null,
        payload: {
          ledgerEntryId: ledgerEntry.id,
          reservationId: reservation.id,
          amount: ledgerEntry.amount,
          currency: ledgerEntry.currency,
          costKnowledge: ledgerEntry.costKnowledge,
        },
      };

      return {
        reservation: updatedReservation,
        attempt: updatedAttempt,
        ledgerEntry,
        event,
      };
    }

    if (command.outcome === 'TIMED_OUT' || command.outcome === 'UNKNOWN_OUTCOME') {
      // Invariant 9 (AC-7): Timeout / Unknown Outcome transitions to HELD_FOR_RECONCILIATION
      const updatedAttempt = await this.usageLedgerRepo.updateAttempt({
        attemptId: attempt.id,
        operationalOutcome: command.outcome,
        durationMs: command.durationMs,
        errorCode: command.errorCode ?? 'TIMEOUT_OR_CONNECTION_DROP',
        errorMessage:
          command.errorMessage ?? 'Provider execution timed out or severed mid-transfer.',
        providerRequestId: command.providerRequestId,
      });

      this.circuitBreaker.recordFailure(attempt.providerId, attempt.modality, now.getTime());

      const updatedReservation = await this.usageLedgerRepo.updateReservationState(
        reservation.id,
        'HELD_FOR_RECONCILIATION',
        reservation.version,
        null,
      );

      // Append UNKNOWN_OUTCOME_HOLD to ledger
      const ledgerEntry = await this.usageLedgerRepo.appendLedgerEntry({
        entryType: 'UNKNOWN_OUTCOME_HOLD',
        reservationId: reservation.id,
        attemptId: attempt.id,
        settlementKey: command.settlementKey,
        amount: reservation.estimatedCost,
        currency: reservation.currency,
        costKnowledge: 'UNKNOWN',
        pricingVersionId: null,
        actorUserId: reservation.userId,
        systemComponent: 'usage-ledger-settlement-service',
      });

      const event: DomainEventEnvelope<Record<string, unknown>> = {
        eventId: randomUUID(),
        eventType: 'provider.attempt.unknown_outcome',
        eventVersion: '1.0.0',
        aggregateType: 'ProviderAttempt',
        aggregateId: attempt.id,
        tenantId: reservation.tenantId,
        occurredAt: now.toISOString(),
        recordedAt: now.toISOString(),
        correlationId: reservation.idempotencyKey,
        causationId: attempt.id,
        idempotencyKey: command.settlementKey,
        actorType: 'WORKER',
        actorId: reservation.userId,
        policyVersionId: reservation.budgetPolicyVersionId,
        payload: {
          attemptId: attempt.id,
          reservationId: reservation.id,
          durationMs: command.durationMs,
          errorCode: command.errorCode,
        },
      };

      return {
        reservation: updatedReservation,
        attempt: updatedAttempt,
        ledgerEntry,
        event,
      };
    }

    // FAILED or CANCELLED_AFTER_DISPATCH
    const updatedAttempt = await this.usageLedgerRepo.updateAttempt({
      attemptId: attempt.id,
      operationalOutcome: command.outcome,
      durationMs: command.durationMs,
      cancellationReason: command.cancellationReason,
      errorCode: command.errorCode ?? 'PROVIDER_ERROR',
      errorMessage: command.errorMessage ?? 'Provider execution failed.',
      providerRequestId: command.providerRequestId,
    });

    this.circuitBreaker.recordFailure(attempt.providerId, attempt.modality, now.getTime());

    // Explicit failure releases the hold
    const updatedReservation = await this.usageLedgerRepo.updateReservationState(
      reservation.id,
      'RELEASED',
      reservation.version,
      now,
    );

    const ledgerEntry = await this.usageLedgerRepo.appendLedgerEntry({
      entryType: 'RESERVATION_RELEASED',
      reservationId: reservation.id,
      attemptId: attempt.id,
      settlementKey: command.settlementKey,
      amount: 0,
      currency: reservation.currency,
      costKnowledge: 'ZERO_CONFIRMED',
      pricingVersionId: null,
      actorUserId: reservation.userId,
      systemComponent: 'usage-ledger-settlement-service',
    });

    const event: DomainEventEnvelope<Record<string, unknown>> = {
      eventId: randomUUID(),
      eventType: 'provider.attempt.failed',
      eventVersion: '1.0.0',
      aggregateType: 'ProviderAttempt',
      aggregateId: attempt.id,
      tenantId: reservation.tenantId,
      occurredAt: now.toISOString(),
      recordedAt: now.toISOString(),
      correlationId: reservation.idempotencyKey,
      causationId: attempt.id,
      idempotencyKey: command.settlementKey,
      actorType: 'WORKER',
      actorId: reservation.userId,
      policyVersionId: reservation.budgetPolicyVersionId,
      payload: {
        attemptId: attempt.id,
        reservationId: reservation.id,
        errorCode: command.errorCode,
        errorMessage: command.errorMessage,
      },
    };

    return {
      reservation: updatedReservation,
      attempt: updatedAttempt,
      ledgerEntry,
      event,
    };
  }
}
