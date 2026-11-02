import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  ActiveReservationNotFoundError,
  ReservationStateTransitionError,
} from '../../domain/budget-errors.js';
import {
  type DomainEventEnvelope,
  type UsageLedgerEntryRecord,
  type UsageReservationRecord,
} from '../../domain/budget.types.js';
import {
  USAGE_LEDGER_REPOSITORY,
  type UsageLedgerRepository,
} from '../ports/usage-ledger.repository.js';

export interface CancelReservationCommand {
  readonly reservationId: string;
  readonly reason: string;
  readonly actorUserId: string;
  readonly isConfirmedZeroCharge?: boolean | undefined;
}

@Injectable()
export class CancelReservationUseCase {
  public constructor(
    @Inject(USAGE_LEDGER_REPOSITORY)
    private readonly usageLedgerRepo: UsageLedgerRepository,
  ) {}

  public async execute(command: CancelReservationCommand): Promise<{
    readonly reservation: UsageReservationRecord;
    readonly ledgerEntry: UsageLedgerEntryRecord;
    readonly event: DomainEventEnvelope<Record<string, unknown>>;
  }> {
    const reservation = await this.usageLedgerRepo.findReservationById(command.reservationId);
    if (!reservation) {
      throw new ActiveReservationNotFoundError(command.reservationId);
    }

    const now = new Date();

    // 1. Pre-dispatch Cancellation (AC-6): RESERVED -> RELEASED without ProviderAttempt
    if (reservation.state === 'RESERVED') {
      const updatedReservation = await this.usageLedgerRepo.updateReservationState(
        reservation.id,
        'RELEASED',
        reservation.version,
        now,
      );

      const settlementKey = `cancel:${reservation.id}:pre-dispatch`;
      const ledgerEntry = await this.usageLedgerRepo.appendLedgerEntry({
        entryType: 'RESERVATION_RELEASED',
        reservationId: reservation.id,
        settlementKey,
        amount: 0,
        currency: reservation.currency,
        costKnowledge: 'ZERO_CONFIRMED',
        actorUserId: command.actorUserId,
        systemComponent: 'usage-ledger-cancellation-service',
      });

      const event: DomainEventEnvelope<Record<string, unknown>> = {
        eventId: randomUUID(),
        eventType: 'usage.reservation.released',
        eventVersion: '1.0.0',
        aggregateType: 'UsageReservation',
        aggregateId: reservation.id,
        tenantId: reservation.tenantId,
        occurredAt: now.toISOString(),
        recordedAt: now.toISOString(),
        correlationId: reservation.idempotencyKey,
        causationId: reservation.id,
        idempotencyKey: `${reservation.id}:rel`,
        actorType: 'USER',
        actorId: command.actorUserId,
        policyVersionId: reservation.budgetPolicyVersionId,
        payload: {
          reservationId: reservation.id,
          reason: command.reason,
          releasedAt: now.toISOString(),
        },
      };

      return { reservation: updatedReservation, ledgerEntry, event };
    }

    // 2. Post-dispatch Cancellation (AC-8):
    if (reservation.state === 'DISPATCHED') {
      if (command.isConfirmedZeroCharge === true) {
        // Confirmed zero charge -> RELEASED
        const updatedReservation = await this.usageLedgerRepo.updateReservationState(
          reservation.id,
          'RELEASED',
          reservation.version,
          now,
        );

        const settlementKey = `cancel:${reservation.id}:confirmed-zero`;
        const ledgerEntry = await this.usageLedgerRepo.appendLedgerEntry({
          entryType: 'RESERVATION_RELEASED',
          reservationId: reservation.id,
          settlementKey,
          amount: 0,
          currency: reservation.currency,
          costKnowledge: 'ZERO_CONFIRMED',
          actorUserId: command.actorUserId,
          systemComponent: 'usage-ledger-cancellation-service',
        });

        const event: DomainEventEnvelope<Record<string, unknown>> = {
          eventId: randomUUID(),
          eventType: 'usage.reservation.released',
          eventVersion: '1.0.0',
          aggregateType: 'UsageReservation',
          aggregateId: reservation.id,
          tenantId: reservation.tenantId,
          occurredAt: now.toISOString(),
          recordedAt: now.toISOString(),
          correlationId: reservation.idempotencyKey,
          causationId: reservation.id,
          idempotencyKey: `${reservation.id}:rel:post`,
          actorType: 'USER',
          actorId: command.actorUserId,
          policyVersionId: reservation.budgetPolicyVersionId,
          payload: {
            reservationId: reservation.id,
            reason: command.reason,
            releasedAt: now.toISOString(),
          },
        };

        return { reservation: updatedReservation, ledgerEntry, event };
      }

      // Ambiguous charge liability -> HELD_FOR_RECONCILIATION
      const updatedReservation = await this.usageLedgerRepo.updateReservationState(
        reservation.id,
        'HELD_FOR_RECONCILIATION',
        reservation.version,
        null,
      );

      const settlementKey = `cancel:${reservation.id}:ambiguous-hold`;
      const ledgerEntry = await this.usageLedgerRepo.appendLedgerEntry({
        entryType: 'UNKNOWN_OUTCOME_HOLD',
        reservationId: reservation.id,
        settlementKey,
        amount: reservation.estimatedCost,
        currency: reservation.currency,
        costKnowledge: 'UNKNOWN',
        actorUserId: command.actorUserId,
        systemComponent: 'usage-ledger-cancellation-service',
      });

      const event: DomainEventEnvelope<Record<string, unknown>> = {
        eventId: randomUUID(),
        eventType: 'usage.reconciliation.required',
        eventVersion: '1.0.0',
        aggregateType: 'UsageReservation',
        aggregateId: reservation.id,
        tenantId: reservation.tenantId,
        occurredAt: now.toISOString(),
        recordedAt: now.toISOString(),
        correlationId: reservation.idempotencyKey,
        causationId: reservation.id,
        idempotencyKey: `${reservation.id}:reconcile`,
        actorType: 'USER',
        actorId: command.actorUserId,
        policyVersionId: reservation.budgetPolicyVersionId,
        payload: {
          reservationId: reservation.id,
          amountHeld: reservation.estimatedCost,
          reason: command.reason,
        },
      };

      return { reservation: updatedReservation, ledgerEntry, event };
    }

    throw new ReservationStateTransitionError(reservation.state, 'RELEASED');
  }
}
