import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  ActiveReservationNotFoundError,
  DuplicateSettlementError,
  ReservationStateTransitionError,
} from '../../domain/budget-errors.js';
import {
  type DomainEventEnvelope,
  type ReconcileHeldReservationInput,
  type UsageLedgerEntryRecord,
  type UsageReservationRecord,
} from '../../domain/budget.types.js';
import {
  USAGE_LEDGER_REPOSITORY,
  type UsageLedgerRepository,
} from '../ports/usage-ledger.repository.js';

@Injectable()
export class ReconcileHeldReservationUseCase {
  public constructor(
    @Inject(USAGE_LEDGER_REPOSITORY)
    private readonly usageLedgerRepo: UsageLedgerRepository,
  ) {}

  public async execute(input: ReconcileHeldReservationInput): Promise<{
    readonly reservation: UsageReservationRecord;
    readonly ledgerEntry: UsageLedgerEntryRecord;
    readonly event: DomainEventEnvelope<Record<string, unknown>>;
  }> {
    const existing = await this.usageLedgerRepo.findLedgerEntryBySettlementKey(input.settlementKey);
    if (existing) {
      throw new DuplicateSettlementError(input.settlementKey);
    }

    const reservation = await this.usageLedgerRepo.findReservationById(input.reservationId);
    if (!reservation) {
      throw new ActiveReservationNotFoundError(input.reservationId);
    }

    if (reservation.state !== 'HELD_FOR_RECONCILIATION') {
      throw new ReservationStateTransitionError(
        reservation.state,
        input.isCharged ? 'SETTLED' : 'RELEASED',
      );
    }

    const now = new Date();

    if (input.isCharged) {
      const updatedReservation = await this.usageLedgerRepo.updateReservationState(
        reservation.id,
        'SETTLED',
        reservation.version,
        now,
      );

      const ledgerEntry = await this.usageLedgerRepo.appendLedgerEntry({
        entryType: 'RECONCILIATION_CONFIRMED',
        reservationId: reservation.id,
        settlementKey: input.settlementKey,
        amount: input.confirmedAmount,
        currency: reservation.currency,
        costKnowledge: input.costKnowledge,
        reconciliationRef: input.reconciliationRef,
        actorUserId: input.actorUserId,
        systemComponent: 'usage-ledger-reconciliation-service',
      });

      const event: DomainEventEnvelope<Record<string, unknown>> = {
        eventId: randomUUID(),
        eventType: 'usage.reconciliation.completed',
        eventVersion: '1.0.0',
        aggregateType: 'UsageLedgerEntry',
        aggregateId: ledgerEntry.id,
        tenantId: reservation.tenantId,
        occurredAt: now.toISOString(),
        recordedAt: now.toISOString(),
        correlationId: reservation.idempotencyKey,
        causationId: reservation.id,
        idempotencyKey: input.settlementKey,
        actorType: 'ADMIN',
        actorId: input.actorUserId,
        policyVersionId: reservation.budgetPolicyVersionId,
        payload: {
          ledgerEntryId: ledgerEntry.id,
          reconciliationRef: input.reconciliationRef,
          finalAmount: ledgerEntry.amount,
          costKnowledge: ledgerEntry.costKnowledge,
        },
      };

      return { reservation: updatedReservation, ledgerEntry, event };
    }

    // Unbilled / Dropped
    const updatedReservation = await this.usageLedgerRepo.updateReservationState(
      reservation.id,
      'RELEASED',
      reservation.version,
      now,
    );

    const ledgerEntry = await this.usageLedgerRepo.appendLedgerEntry({
      entryType: 'RECONCILIATION_RELEASED',
      reservationId: reservation.id,
      settlementKey: input.settlementKey,
      amount: 0,
      currency: reservation.currency,
      costKnowledge: 'ZERO_CONFIRMED',
      reconciliationRef: input.reconciliationRef,
      actorUserId: input.actorUserId,
      systemComponent: 'usage-ledger-reconciliation-service',
    });

    const event: DomainEventEnvelope<Record<string, unknown>> = {
      eventId: randomUUID(),
      eventType: 'usage.reconciliation.completed',
      eventVersion: '1.0.0',
      aggregateType: 'UsageLedgerEntry',
      aggregateId: ledgerEntry.id,
      tenantId: reservation.tenantId,
      occurredAt: now.toISOString(),
      recordedAt: now.toISOString(),
      correlationId: reservation.idempotencyKey,
      causationId: reservation.id,
      idempotencyKey: input.settlementKey,
      actorType: 'ADMIN',
      actorId: input.actorUserId,
      policyVersionId: reservation.budgetPolicyVersionId,
      payload: {
        ledgerEntryId: ledgerEntry.id,
        reconciliationRef: input.reconciliationRef,
        finalAmount: 0,
        costKnowledge: 'ZERO_CONFIRMED',
      },
    };

    return { reservation: updatedReservation, ledgerEntry, event };
  }
}
