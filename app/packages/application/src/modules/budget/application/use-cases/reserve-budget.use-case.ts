import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { BudgetExceededError } from '../../domain/budget-errors.js';
import {
  type BudgetReservationInput,
  type DomainEventEnvelope,
  type QuotaStatusReport,
  type UsageReservationRecord,
} from '../../domain/budget.types.js';
import {
  BUDGET_POLICY_REPOSITORY,
  type BudgetPolicyRepository,
} from '../ports/budget-policy.repository.js';
import {
  USAGE_LEDGER_REPOSITORY,
  type UsageLedgerRepository,
} from '../ports/usage-ledger.repository.js';

@Injectable()
export class ReserveBudgetUseCase {
  public constructor(
    @Inject(USAGE_LEDGER_REPOSITORY)
    private readonly usageLedgerRepo: UsageLedgerRepository,
    @Inject(BUDGET_POLICY_REPOSITORY)
    private readonly budgetPolicyRepo: BudgetPolicyRepository,
  ) {}

  public async execute(input: BudgetReservationInput): Promise<{
    readonly reservation: UsageReservationRecord;
    readonly quotaStatus: QuotaStatusReport;
    readonly event: DomainEventEnvelope<{
      readonly reservationId: string;
      readonly userId: string;
      readonly estimatedCost: number;
      readonly currency: string;
      readonly expiresAt: string;
      readonly policyVersionId: string;
    }>;
  }> {
    // 1. Idempotency Check (AC-3): Return existing hold without double allocating
    const existing = await this.usageLedgerRepo.findReservationByIdempotencyKey(
      input.idempotencyKey,
    );
    const now = new Date();

    const scopeType = input.scopeType ?? 'GLOBAL';
    const scopeId = input.scopeId ?? 'GLOBAL';

    let policy = await this.budgetPolicyRepo.getActivePolicy(scopeType, scopeId, now);
    if (!policy) {
      // Default fallback policy
      policy = await this.budgetPolicyRepo.createPolicy({
        version: '1.0.0',
        scopeType,
        scopeId,
        currency: 'USD',
        monthlyCeiling: 20.0,
        dailyCeiling: 10.0,
        perOperationMax: 2.0,
        softAlertThreshold: 0.8,
        enforceHardCap: true,
        maxDailyRetries: 3,
        reservationTtlSeconds: 300,
        allowedProviders: ['openai', 'codex_cli', 'fake'],
        allowedFallbacks: ['codex_cli', 'fake'],
        createdById: input.userId ?? '00000000-0000-0000-0000-000000000000',
      });
    }

    if (existing) {
      const quotaStatus = await this.getQuotaReport(policy.id, scopeType, scopeId, now);
      const event: DomainEventEnvelope<{
        readonly reservationId: string;
        readonly userId: string;
        readonly estimatedCost: number;
        readonly currency: string;
        readonly expiresAt: string;
        readonly policyVersionId: string;
      }> = {
        eventId: randomUUID(),
        eventType: 'usage.reservation.created',
        eventVersion: '1.0.0',
        aggregateType: 'UsageReservation',
        aggregateId: existing.id,
        tenantId: existing.tenantId,
        occurredAt: existing.createdAt.toISOString(),
        recordedAt: now.toISOString(),
        correlationId: input.idempotencyKey,
        causationId: input.idempotencyKey,
        idempotencyKey: input.idempotencyKey,
        actorType: 'USER',
        actorId: existing.userId,
        policyVersionId: existing.budgetPolicyVersionId,
        payload: {
          reservationId: existing.id,
          userId: existing.userId,
          estimatedCost: existing.estimatedCost,
          currency: existing.currency,
          expiresAt: existing.expiresAt.toISOString(),
          policyVersionId: existing.budgetPolicyVersionId,
        },
      };

      return { reservation: existing, quotaStatus, event };
    }

    // 2. Per-operation maximum ceiling enforcement
    if (input.estimatedCost > policy.perOperationMax) {
      throw new BudgetExceededError(
        `Per-operation budget ceiling exceeded: estimated cost $${input.estimatedCost.toFixed(4)} USD exceeds per-operation maximum of $${policy.perOperationMax.toFixed(4)} USD.`,
      );
    }

    // 3. Aggregate spend & active exposure
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const dayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
    );

    const [spentMonth, spentDay, activeExposure] = await Promise.all([
      this.usageLedgerRepo.getAggregateSpend(scopeType, scopeId, monthStart, now, policy.currency),
      this.usageLedgerRepo.getAggregateSpend(scopeType, scopeId, dayStart, now, policy.currency),
      this.usageLedgerRepo.getActiveReservedExposure(scopeType, scopeId, now, policy.currency),
    ]);

    const totalCommittedMonth = spentMonth + activeExposure;
    const totalCommittedDay = spentDay + activeExposure;

    // 4. Hard budget ceilings enforcement (AC-2)
    if (policy.enforceHardCap) {
      if (totalCommittedMonth + input.estimatedCost > policy.monthlyCeiling) {
        const headroom = Math.max(0, policy.monthlyCeiling - totalCommittedMonth);
        throw new BudgetExceededError(
          `Monthly budget ceiling exceeded: available headroom $${headroom.toFixed(4)} USD is less than required $${input.estimatedCost.toFixed(4)} USD.`,
        );
      }

      if (totalCommittedDay + input.estimatedCost > policy.dailyCeiling) {
        const headroom = Math.max(0, policy.dailyCeiling - totalCommittedDay);
        throw new BudgetExceededError(
          `Daily budget ceiling exceeded: available headroom $${headroom.toFixed(4)} USD is less than required $${input.estimatedCost.toFixed(4)} USD.`,
        );
      }
    }

    // 5. Reservation duration & TTL
    const ttlSeconds = input.ttlSeconds ?? policy.reservationTtlSeconds;
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    const reservation = await this.usageLedgerRepo.createReservation({
      idempotencyKey: input.idempotencyKey,
      budgetPolicyVersionId: policy.id,
      userId: input.userId ?? '00000000-0000-0000-0000-000000000000',
      tenantId: input.tenantId ?? 'parisian-shopper-default',
      creativeJobId: input.creativeJobId ?? null,
      contentJobId: input.contentJobId ?? null,
      campaignId: input.campaignId ?? null,
      providerId: input.providerId,
      modelId: input.modelId,
      estimatedCost: input.estimatedCost,
      currency: input.currency ?? policy.currency,
      capacityUnits: input.capacityUnits ?? null,
      expiresAt,
    });

    // 6. Append immutable reservation hold entry to the ledger
    const settlementKey = `hold:${reservation.id}`;
    await this.usageLedgerRepo.appendLedgerEntry({
      entryType: 'RESERVATION_CREATED',
      reservationId: reservation.id,
      settlementKey,
      amount: reservation.estimatedCost,
      currency: reservation.currency,
      costKnowledge: 'ESTIMATED',
      pricingVersionId: null,
      actorUserId: reservation.userId,
      systemComponent: 'usage-ledger-reservation-service',
    });

    const quotaStatus = await this.getQuotaReport(policy.id, scopeType, scopeId, now);

    const event: DomainEventEnvelope<{
      readonly reservationId: string;
      readonly userId: string;
      readonly estimatedCost: number;
      readonly currency: string;
      readonly expiresAt: string;
      readonly policyVersionId: string;
    }> = {
      eventId: randomUUID(),
      eventType: 'usage.reservation.created',
      eventVersion: '1.0.0',
      aggregateType: 'UsageReservation',
      aggregateId: reservation.id,
      tenantId: reservation.tenantId,
      occurredAt: now.toISOString(),
      recordedAt: now.toISOString(),
      correlationId: input.idempotencyKey,
      causationId: input.idempotencyKey,
      idempotencyKey: reservation.id,
      actorType: 'USER',
      actorId: reservation.userId,
      policyVersionId: policy.id,
      payload: {
        reservationId: reservation.id,
        userId: reservation.userId,
        estimatedCost: reservation.estimatedCost,
        currency: reservation.currency,
        expiresAt: reservation.expiresAt.toISOString(),
        policyVersionId: policy.id,
      },
    };

    return { reservation, quotaStatus, event };
  }

  private async getQuotaReport(
    policyId: string,
    scopeType: string,
    scopeId: string,
    now: Date,
  ): Promise<QuotaStatusReport> {
    const policy = await this.budgetPolicyRepo.getPolicyById(policyId);
    if (!policy) {
      throw new Error(`Policy not found for id ${policyId}`);
    }

    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const dayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
    );

    const [spentMonth, spentDay, activeExposure] = await Promise.all([
      this.usageLedgerRepo.getAggregateSpend(scopeType, scopeId, monthStart, now, policy.currency),
      this.usageLedgerRepo.getAggregateSpend(scopeType, scopeId, dayStart, now, policy.currency),
      this.usageLedgerRepo.getActiveReservedExposure(scopeType, scopeId, now, policy.currency),
    ]);

    const totalCommittedMonth = spentMonth + activeExposure;
    const totalCommittedDay = spentDay + activeExposure;
    const remainingMonthlyHeadroom = Math.max(0, policy.monthlyCeiling - totalCommittedMonth);
    const remainingDailyHeadroom = Math.max(0, policy.dailyCeiling - totalCommittedDay);

    const isSoftAlertTriggered =
      policy.monthlyCeiling > 0
        ? totalCommittedMonth / policy.monthlyCeiling >= policy.softAlertThreshold
        : false;

    return {
      policyId: policy.id,
      policyVersion: policy.version,
      scopeType: policy.scopeType,
      scopeId: policy.scopeId,
      currency: policy.currency,
      monthlyCeiling: policy.monthlyCeiling,
      dailyCeiling: policy.dailyCeiling,
      perOperationMax: policy.perOperationMax,
      softAlertThreshold: policy.softAlertThreshold,
      totalSettledSpendMonth: spentMonth,
      totalSettledSpendDay: spentDay,
      activeReservedExposure: activeExposure,
      remainingMonthlyHeadroom,
      remainingDailyHeadroom,
      isMonthlyCeilingExhausted: remainingMonthlyHeadroom <= 0,
      isDailyCeilingExhausted: remainingDailyHeadroom <= 0,
      isSoftAlertTriggered,
      asOf: now.toISOString(),
    };
  }
}
