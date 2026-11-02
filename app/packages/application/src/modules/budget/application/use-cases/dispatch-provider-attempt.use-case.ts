import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  ActiveReservationNotFoundError,
  ReservationExpiredError,
  ReservationStateTransitionError,
} from '../../domain/budget-errors.js';
import {
  type DomainEventEnvelope,
  type ProviderAttemptRecord,
  type RecordAttemptInput,
  type UsageReservationRecord,
} from '../../domain/budget.types.js';
import { CircuitBreakerService } from '../../domain/circuit-breaker.js';
import { SafePromptDigestService } from '../../domain/safe-prompt-digest.service.js';
import {
  PROVIDER_CAPABILITY_REPOSITORY,
  type ProviderCapabilityRepository,
} from '../ports/provider-capability.repository.js';
import {
  USAGE_LEDGER_REPOSITORY,
  type UsageLedgerRepository,
} from '../ports/usage-ledger.repository.js';

@Injectable()
export class DispatchProviderAttemptUseCase {
  public constructor(
    @Inject(USAGE_LEDGER_REPOSITORY)
    private readonly usageLedgerRepo: UsageLedgerRepository,
    @Inject(PROVIDER_CAPABILITY_REPOSITORY)
    private readonly capabilityRepo: ProviderCapabilityRepository,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly digestService: SafePromptDigestService,
  ) {}

  public async execute(input: RecordAttemptInput): Promise<{
    readonly reservation: UsageReservationRecord;
    readonly attempt: ProviderAttemptRecord;
    readonly attemptStartedEvent: DomainEventEnvelope<{
      readonly attemptId: string;
      readonly reservationId: string;
      readonly attemptNumber: number;
      readonly modality: string;
      readonly safePromptDigest: string;
      readonly digestKeyVersion: string;
    }>;
  }> {
    const reservation = await this.usageLedgerRepo.findReservationById(input.reservationId);
    if (!reservation) {
      throw new ActiveReservationNotFoundError(input.reservationId);
    }

    // Invariant 1 (AC-1): Active Reservation Prerequisite
    if (reservation.state !== 'RESERVED') {
      throw new ReservationStateTransitionError(reservation.state, 'DISPATCHED');
    }

    const now = new Date();
    if (now > reservation.expiresAt) {
      await this.usageLedgerRepo.updateReservationState(
        reservation.id,
        'EXPIRED',
        reservation.version,
        now,
      );
      throw new ReservationExpiredError(reservation.id, reservation.expiresAt);
    }

    // Circuit Breaker Check
    this.circuitBreaker.assertHealthy(input.providerId, input.modality, now.getTime());

    // Safe Prompt Digest: Keyed HMAC-SHA256 with preserved whitespace
    const { safePromptDigest, digestAlgorithm, digestKeyVersion } =
      this.digestService.computeDigest({
        promptText: input.promptText,
        modelParameters: input.modelParameters,
        provider: input.providerId,
        model: input.modelId,
        templateVersion: input.templateVersion,
      });

    // Create ProviderAttempt in initial IN_PROGRESS state
    const attempt = await this.usageLedgerRepo.createAttempt({
      reservationId: reservation.id,
      attemptNumber: input.attemptNumber,
      providerId: input.providerId,
      modelId: input.modelId,
      modality: input.modality,
      safePromptDigest,
      digestAlgorithm,
      digestKeyVersion,
      retryRelationship: input.retryRelationship ?? 'INITIAL_ATTEMPT',
      providerRequestId: input.providerRequestId,
    });

    // Update reservation: RESERVED -> DISPATCHED
    const updatedReservation = await this.usageLedgerRepo.updateReservationState(
      reservation.id,
      'DISPATCHED',
      reservation.version,
      null,
      now,
    );

    const attemptStartedEvent: DomainEventEnvelope<{
      readonly attemptId: string;
      readonly reservationId: string;
      readonly attemptNumber: number;
      readonly modality: string;
      readonly safePromptDigest: string;
      readonly digestKeyVersion: string;
    }> = {
      eventId: randomUUID(),
      eventType: 'provider.attempt.started',
      eventVersion: '1.0.0',
      aggregateType: 'ProviderAttempt',
      aggregateId: attempt.id,
      tenantId: reservation.tenantId,
      occurredAt: now.toISOString(),
      recordedAt: now.toISOString(),
      correlationId: reservation.idempotencyKey,
      causationId: attempt.id,
      idempotencyKey: `${attempt.id}:start`,
      actorType: 'WORKER',
      actorId: reservation.userId,
      policyVersionId: reservation.budgetPolicyVersionId,
      payload: {
        attemptId: attempt.id,
        reservationId: reservation.id,
        attemptNumber: attempt.attemptNumber,
        modality: attempt.modality,
        safePromptDigest: attempt.safePromptDigest,
        digestKeyVersion: attempt.digestKeyVersion,
      },
    };

    return {
      reservation: updatedReservation,
      attempt,
      attemptStartedEvent,
    };
  }
}
