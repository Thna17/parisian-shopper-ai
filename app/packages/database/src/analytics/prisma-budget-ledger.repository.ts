import { Injectable } from '@nestjs/common';
import {
  type AiBudgetPolicyRecord,
  type AiCostReservationRecord,
  type AiUsageRecordData,
  BudgetExhaustedError,
  type BudgetLedgerRepository,
  BudgetPolicyNotFoundError,
  type BudgetUtilizationResult,
  type CostLedgerItem,
  type CostLedgerQuery,
  type CreateBudgetPolicyInput,
  type PaginatedCostLedger,
  type ReconcileUsageInput,
  ReservationNotFoundError,
  type ReserveBudgetInput,
  type SettleReservationInput,
  type UnreconciledUsageRecord,
  type UpdateBudgetPolicyInput,
} from '@parisian-shopper/application';
import {
  BudgetScope,
  Prisma,
  type AiBudgetPolicy,
  type AiCostReservation,
  type AiUsageRecord,
} from '@prisma/client';
import { PrismaService } from '../prisma.service.js';

@Injectable()
export class PrismaBudgetLedgerRepository implements BudgetLedgerRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async getActivePolicy(scope = 'MONTHLY'): Promise<AiBudgetPolicyRecord | null> {
    const now = new Date();
    const policy = await this.prisma.aiBudgetPolicy.findFirst({
      where: {
        scope: scope as BudgetScope,
        status: 'ACTIVE',
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!policy) return null;
    return this.mapPolicy(policy);
  }

  public async getPolicyById(id: string): Promise<AiBudgetPolicyRecord | null> {
    const policy = await this.prisma.aiBudgetPolicy.findUnique({
      where: { id },
    });
    if (!policy) return null;
    return this.mapPolicy(policy);
  }

  public async listPolicies(): Promise<readonly AiBudgetPolicyRecord[]> {
    const policies = await this.prisma.aiBudgetPolicy.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return policies.map((p) => this.mapPolicy(p));
  }

  public async createPolicy(input: CreateBudgetPolicyInput): Promise<AiBudgetPolicyRecord> {
    const created = await this.prisma.aiBudgetPolicy.create({
      data: {
        scope: input.scope ?? 'MONTHLY',
        currency: input.currency ?? 'USD',
        monthlyCeiling: new Prisma.Decimal(input.monthlyCeiling),
        perRequestCeiling: new Prisma.Decimal(input.perRequestCeiling ?? 2.0),
        softAlertThreshold: new Prisma.Decimal(input.softAlertThreshold ?? 80.0),
        effectiveFrom: input.effectiveFrom ?? new Date(),
        effectiveTo: input.effectiveTo ?? null,
        status: 'ACTIVE',
        createdById: input.actorUserId,
      },
    });

    return this.mapPolicy(created);
  }

  public async updatePolicy(
    id: string,
    input: UpdateBudgetPolicyInput,
  ): Promise<AiBudgetPolicyRecord> {
    const data: Prisma.AiBudgetPolicyUpdateInput = {};
    if (input.monthlyCeiling !== undefined) {
      data.monthlyCeiling = new Prisma.Decimal(input.monthlyCeiling);
    }
    if (input.perRequestCeiling !== undefined) {
      data.perRequestCeiling = new Prisma.Decimal(input.perRequestCeiling);
    }
    if (input.softAlertThreshold !== undefined) {
      data.softAlertThreshold = new Prisma.Decimal(input.softAlertThreshold);
    }
    if (input.status !== undefined) {
      data.status = input.status;
    }
    if (input.effectiveTo !== undefined) {
      data.effectiveTo = input.effectiveTo;
    }

    const updated = await this.prisma.aiBudgetPolicy.update({
      where: { id },
      data,
    });

    return this.mapPolicy(updated);
  }

  public async getBudgetUtilization(
    policyId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<BudgetUtilizationResult> {
    const policy = await this.prisma.aiBudgetPolicy.findUnique({
      where: { id: policyId },
    });

    if (!policy) {
      throw new BudgetPolicyNotFoundError(policyId);
    }

    const now = new Date();
    const periodFilter = { gte: periodStart, lte: periodEnd };

    // 1. Settled costs in period
    const settledAgg = await this.prisma.aiUsageRecord.aggregate({
      where: {
        createdAt: periodFilter,
        reconciliationStatus: { in: ['SETTLED', 'MANUALLY_RECONCILED'] },
      },
      _sum: { estimatedCost: true, confirmedCost: true },
    });

    // Fallback: check generation attempts in period if aiUsageRecord is empty
    const attemptAgg = await this.prisma.generationAttempt.aggregate({
      where: { startedAt: periodFilter, status: 'SUCCEEDED' },
      _sum: { estimatedCost: true },
    });

    // 2. Active reservations (pending & not expired)
    const activeReservationsAgg = await this.prisma.aiCostReservation.aggregate({
      where: {
        budgetPolicyId: policy.id,
        status: 'PENDING',
        expiresAt: { gt: now },
        createdAt: periodFilter,
      },
      _sum: { reservedAmount: true },
    });

    // 3. Unreconciled exposure
    const unreconciledAgg = await this.prisma.aiCostReservation.aggregate({
      where: {
        budgetPolicyId: policy.id,
        status: 'UNRECONCILED',
        createdAt: periodFilter,
      },
      _sum: { reservedAmount: true },
    });

    const settledCostUsd =
      Number(settledAgg._sum.confirmedCost ?? settledAgg._sum.estimatedCost ?? 0) ||
      Number(attemptAgg._sum.estimatedCost ?? 0);
    const activeReservedCostUsd = Number(activeReservationsAgg._sum.reservedAmount ?? 0);
    const unreconciledExposureUsd = Number(unreconciledAgg._sum.reservedAmount ?? 0);

    const totalCommittedCostUsd =
      Math.round((settledCostUsd + activeReservedCostUsd + unreconciledExposureUsd) * 10000) /
      10000;
    const monthlyCeiling = Number(policy.monthlyCeiling);
    const remainingHeadroomUsd =
      Math.round(Math.max(0, monthlyCeiling - totalCommittedCostUsd) * 10000) / 10000;

    const utilizationPercent =
      monthlyCeiling > 0
        ? Math.min(100, Math.round((totalCommittedCostUsd / monthlyCeiling) * 10000) / 100)
        : 100;

    const softAlertThreshold = Number(policy.softAlertThreshold);
    const isExhausted = remainingHeadroomUsd <= 0;
    const isSoftAlertTriggered = utilizationPercent >= softAlertThreshold;

    return {
      policyId: policy.id,
      currency: policy.currency,
      monthlyCeiling,
      perRequestCeiling: Number(policy.perRequestCeiling),
      softAlertThreshold,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      settledCostUsd,
      activeReservedCostUsd,
      unreconciledExposureUsd,
      totalCommittedCostUsd,
      remainingHeadroomUsd,
      utilizationPercent,
      isExhausted,
      isSoftAlertTriggered,
      asOf: now.toISOString(),
    };
  }

  public async reserveBudget(input: ReserveBudgetInput): Promise<AiCostReservationRecord> {
    const existing = await this.prisma.aiCostReservation.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      return this.mapReservation(existing);
    }

    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const periodEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999),
    );

    // Serializable / isolated transaction for concurrency-safe check & reserve
    return this.prisma.$transaction(
      async (tx) => {
        let policy = await tx.aiBudgetPolicy.findFirst({
          where: {
            scope: 'MONTHLY',
            status: 'ACTIVE',
            effectiveFrom: { lte: now },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
          },
          orderBy: { createdAt: 'desc' },
        });

        if (!policy) {
          policy = await tx.aiBudgetPolicy.create({
            data: {
              scope: 'MONTHLY',
              currency: 'USD',
              monthlyCeiling: new Prisma.Decimal(20.0),
              perRequestCeiling: new Prisma.Decimal(2.0),
              softAlertThreshold: new Prisma.Decimal(80.0),
              effectiveFrom: periodStart,
              effectiveTo: null,
              status: 'ACTIVE',
              createdById: '00000000-0000-0000-0000-000000000000',
            },
          });
        }

        const periodFilter = { gte: periodStart, lte: periodEnd };

        const [settledAgg, reservedAgg, unreconciledAgg] = await Promise.all([
          tx.aiUsageRecord.aggregate({
            where: {
              createdAt: periodFilter,
              reconciliationStatus: { in: ['SETTLED', 'MANUALLY_RECONCILED'] },
            },
            _sum: { estimatedCost: true, confirmedCost: true },
          }),
          tx.aiCostReservation.aggregate({
            where: {
              budgetPolicyId: policy.id,
              status: 'PENDING',
              expiresAt: { gt: now },
              createdAt: periodFilter,
            },
            _sum: { reservedAmount: true },
          }),
          tx.aiCostReservation.aggregate({
            where: {
              budgetPolicyId: policy.id,
              status: 'UNRECONCILED',
              createdAt: periodFilter,
            },
            _sum: { reservedAmount: true },
          }),
        ]);

        const settled = Number(settledAgg._sum.confirmedCost ?? settledAgg._sum.estimatedCost ?? 0);
        const reserved = Number(reservedAgg._sum.reservedAmount ?? 0);
        const unreconciled = Number(unreconciledAgg._sum.reservedAmount ?? 0);
        const totalCommitted = settled + reserved + unreconciled;
        const monthlyCeiling = Number(policy.monthlyCeiling);

        if (totalCommitted + input.estimatedMaxCost > monthlyCeiling) {
          const headroom = Math.max(0, monthlyCeiling - totalCommitted);
          throw new BudgetExhaustedError(
            `Budget cap exceeded: available headroom $${headroom.toFixed(4)} USD is less than required $${input.estimatedMaxCost.toFixed(4)} USD.`,
          );
        }

        const ttlSec = input.ttlSeconds ?? 300; // default 5 minutes
        const expiresAt = new Date(now.getTime() + ttlSec * 1000);

        const reservation = await tx.aiCostReservation.create({
          data: {
            budgetPolicyId: policy.id,
            idempotencyKey: input.idempotencyKey,
            contentJobId: input.contentJobId ?? null,
            creativeJobId: input.creativeJobId ?? null,
            generationAttemptId: input.generationAttemptId ?? null,
            reservedAmount: new Prisma.Decimal(input.estimatedMaxCost),
            currency: 'USD',
            status: 'PENDING',
            expiresAt,
          },
        });

        return this.mapReservation(reservation);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  public async settleReservation(input: SettleReservationInput): Promise<AiUsageRecordData> {
    return this.prisma.$transaction(
      async (tx) => {
        const reservation = await tx.aiCostReservation.findUnique({
          where: { id: input.reservationId },
        });

        if (!reservation) {
          throw new ReservationNotFoundError(input.reservationId);
        }

        const now = new Date();
        await tx.aiCostReservation.update({
          where: { id: reservation.id },
          data: {
            status: 'COMMITTED',
            settledAt: now,
          },
        });

        const estimatedCost = new Prisma.Decimal(
          input.actualCost ?? Number(reservation.reservedAmount),
        );
        const confirmedCost =
          input.confirmedCost !== undefined ? new Prisma.Decimal(input.confirmedCost) : null;

        const usageRecord = await tx.aiUsageRecord.create({
          data: {
            reservationId: reservation.id,
            generationAttemptId: input.generationAttemptId ?? reservation.generationAttemptId,
            provider: input.provider,
            model: input.model,
            providerRequestId: input.providerRequestId ?? null,
            inputTokens: input.inputTokens ?? null,
            outputTokens: input.outputTokens ?? null,
            totalTokens: input.totalTokens ?? null,
            estimatedCost,
            confirmedCost,
            currency: 'USD',
            costKnowledge: input.costKnowledge ?? 'ESTIMATED',
            reconciliationStatus: 'SETTLED',
            settledAt: now,
          },
        });

        return this.mapUsageRecord(usageRecord);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  public async releaseReservation(reservationId: string, _reason?: string): Promise<void> {
    await this.prisma.aiCostReservation.update({
      where: { id: reservationId },
      data: {
        status: 'RELEASED',
        settledAt: new Date(),
      },
    });
  }

  public async markUnreconciled(reservationId: string, reason: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const reservation = await tx.aiCostReservation.findUnique({
        where: { id: reservationId },
      });
      if (!reservation) return;

      await tx.aiCostReservation.update({
        where: { id: reservation.id },
        data: {
          status: 'UNRECONCILED',
        },
      });

      await tx.aiUsageRecord.create({
        data: {
          reservationId: reservation.id,
          generationAttemptId: reservation.generationAttemptId,
          provider: 'unknown',
          model: 'unknown',
          estimatedCost: reservation.reservedAmount,
          currency: 'USD',
          costKnowledge: 'UNKNOWN',
          reconciliationStatus: 'PENDING_RECONCILIATION',
          reconciliationNotes: reason,
        },
      });
    });
  }

  public async listCostLedger(query: CostLedgerQuery): Promise<PaginatedCostLedger> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.AiUsageRecordWhereInput = {};
    if (query.provider) where.provider = query.provider;
    if (query.model) where.model = query.model;
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const [records, total] = await Promise.all([
      this.prisma.aiUsageRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { reservation: true },
      }),
      this.prisma.aiUsageRecord.count({ where }),
    ]);

    const items: CostLedgerItem[] = records.map((r) => ({
      id: r.id,
      type: 'USAGE',
      referenceId: r.generationAttemptId ?? r.reservationId ?? r.id,
      provider: r.provider,
      model: r.model,
      status: r.reconciliationStatus,
      costKnowledge: r.costKnowledge,
      amountUsd: Number(r.confirmedCost ?? r.estimatedCost),
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      idempotencyKey: r.reservation?.idempotencyKey,
      createdAt: r.createdAt.toISOString(),
    }));

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  public async listUnreconciledUsage(): Promise<readonly UnreconciledUsageRecord[]> {
    const reservations = await this.prisma.aiCostReservation.findMany({
      where: {
        status: 'UNRECONCILED',
      },
      include: { usageRecords: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return reservations.map((r) => ({
      reservationId: r.id,
      idempotencyKey: r.idempotencyKey,
      contentJobId: r.contentJobId,
      creativeJobId: r.creativeJobId,
      reservedAmount: Number(r.reservedAmount),
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      reason: r.usageRecords[0]?.reconciliationNotes ?? 'Provider timeout / unknown completion',
    }));
  }

  public async reconcileUsage(
    recordId: string,
    input: ReconcileUsageInput,
  ): Promise<AiUsageRecordData> {
    return this.prisma.$transaction(async (tx) => {
      const reservation = await tx.aiCostReservation.findUnique({
        where: { id: input.reservationId },
      });

      if (!reservation) {
        throw new ReservationNotFoundError(input.reservationId);
      }

      const confirmedCost =
        input.confirmedCost !== undefined ? new Prisma.Decimal(input.confirmedCost) : null;

      await tx.aiCostReservation.update({
        where: { id: reservation.id },
        data: {
          status: input.resolution === 'RELEASE_UNBILLED' ? 'RELEASED' : 'COMMITTED',
          settledAt: new Date(),
        },
      });

      const updatedRecord = await tx.aiUsageRecord.update({
        where: { id: recordId },
        data: {
          confirmedCost,
          reconciliationStatus:
            input.resolution === 'RELEASE_UNBILLED' ? 'SETTLED' : 'MANUALLY_RECONCILED',
          reconciliationNotes: input.notes,
          settledAt: new Date(),
        },
      });

      return this.mapUsageRecord(updatedRecord);
    });
  }

  private mapPolicy(p: AiBudgetPolicy): AiBudgetPolicyRecord {
    return {
      id: p.id,
      scope: p.scope,
      currency: p.currency,
      monthlyCeiling: Number(p.monthlyCeiling),
      perRequestCeiling: Number(p.perRequestCeiling),
      softAlertThreshold: Number(p.softAlertThreshold),
      effectiveFrom: p.effectiveFrom,
      effectiveTo: p.effectiveTo,
      status: p.status,
      createdById: p.createdById,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }

  private mapReservation(r: AiCostReservation): AiCostReservationRecord {
    return {
      id: r.id,
      budgetPolicyId: r.budgetPolicyId,
      idempotencyKey: r.idempotencyKey,
      contentJobId: r.contentJobId,
      creativeJobId: r.creativeJobId,
      generationAttemptId: r.generationAttemptId,
      reservedAmount: Number(r.reservedAmount),
      currency: r.currency,
      status: r.status,
      expiresAt: r.expiresAt,
      settledAt: r.settledAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  private mapUsageRecord(u: AiUsageRecord): AiUsageRecordData {
    return {
      id: u.id,
      reservationId: u.reservationId,
      generationAttemptId: u.generationAttemptId,
      provider: u.provider,
      model: u.model,
      providerRequestId: u.providerRequestId,
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
      totalTokens: u.totalTokens,
      estimatedCost: Number(u.estimatedCost),
      confirmedCost: u.confirmedCost ? Number(u.confirmedCost) : null,
      currency: u.currency,
      costKnowledge: u.costKnowledge,
      reconciliationStatus: u.reconciliationStatus,
      reconciliationNotes: u.reconciliationNotes,
      createdAt: u.createdAt,
      settledAt: u.settledAt,
    };
  }
}
