import { Injectable } from '@nestjs/common';
import {
  type BudgetPolicyRecord,
  type BudgetPolicyRepository,
  type BudgetScopeType,
  type CreateBudgetPolicyDraft,
  type UpdateBudgetPolicyDraft,
} from '@parisian-shopper/application';
import { BudgetScope, Prisma, type AiBudgetPolicy } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';

@Injectable()
export class PrismaBudgetPolicyRepository implements BudgetPolicyRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async getActivePolicy(
    scopeType: BudgetScopeType = 'GLOBAL',
    scopeId = 'GLOBAL',
    date = new Date(),
  ): Promise<BudgetPolicyRecord | null> {
    const policy = await this.prisma.aiBudgetPolicy.findFirst({
      where: {
        scopeType: scopeType as BudgetScope,
        scopeId,
        status: 'ACTIVE',
        effectiveFrom: { lte: date },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!policy) {
      // Fallback: look for ANY active policy
      const anyPolicy = await this.prisma.aiBudgetPolicy.findFirst({
        where: {
          status: 'ACTIVE',
          effectiveFrom: { lte: date },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
        },
        orderBy: { createdAt: 'desc' },
      });
      return anyPolicy ? this.mapPolicy(anyPolicy) : null;
    }

    return this.mapPolicy(policy);
  }

  public async getPolicyById(id: string): Promise<BudgetPolicyRecord | null> {
    const policy = await this.prisma.aiBudgetPolicy.findUnique({
      where: { id },
    });
    if (!policy) return null;
    return this.mapPolicy(policy);
  }

  public async listPolicies(): Promise<readonly BudgetPolicyRecord[]> {
    const policies = await this.prisma.aiBudgetPolicy.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return policies.map((p) => this.mapPolicy(p));
  }

  public async createPolicy(draft: CreateBudgetPolicyDraft): Promise<BudgetPolicyRecord> {
    const created = await this.prisma.aiBudgetPolicy.create({
      data: {
        version: draft.version ?? '1.0.0',
        scopeType: (draft.scopeType ?? 'GLOBAL') as BudgetScope,
        scopeId: draft.scopeId ?? 'GLOBAL',
        currency: draft.currency ?? 'USD',
        monthlyCeiling: new Prisma.Decimal(draft.monthlyCeiling),
        dailyCeiling: new Prisma.Decimal(draft.dailyCeiling ?? 10.0),
        perRequestCeiling: new Prisma.Decimal(draft.perOperationMax ?? 2.0),
        perOperationMax: new Prisma.Decimal(draft.perOperationMax ?? 2.0),
        softAlertThreshold: new Prisma.Decimal(
          draft.softAlertThreshold !== undefined ? draft.softAlertThreshold * 100 : 80.0,
        ),
        enforceHardCap: draft.enforceHardCap ?? true,
        maxDailyRetries: draft.maxDailyRetries ?? 3,
        reservationTtlSeconds: draft.reservationTtlSeconds ?? 300,
        rollingQuotaLimits:
          draft.rollingQuotaLimits !== undefined && draft.rollingQuotaLimits !== null
            ? (draft.rollingQuotaLimits as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        allowedProviders: draft.allowedProviders
          ? [...draft.allowedProviders]
          : ['openai', 'codex_cli', 'fake'],
        allowedFallbacks: draft.allowedFallbacks
          ? [...draft.allowedFallbacks]
          : ['codex_cli', 'fake'],
        effectiveFrom: draft.effectiveFrom ?? new Date(),
        effectiveTo: draft.effectiveTo ?? null,
        status: 'ACTIVE',
        createdById: draft.createdById,
        approvedByUserId: draft.approvedByUserId ?? null,
      },
    });

    return this.mapPolicy(created);
  }

  public async updatePolicy(
    id: string,
    draft: UpdateBudgetPolicyDraft,
  ): Promise<BudgetPolicyRecord> {
    const data: Prisma.AiBudgetPolicyUpdateInput = {};

    if (draft.monthlyCeiling !== undefined) {
      data.monthlyCeiling = new Prisma.Decimal(draft.monthlyCeiling);
    }
    if (draft.dailyCeiling !== undefined) {
      data.dailyCeiling = new Prisma.Decimal(draft.dailyCeiling);
    }
    if (draft.perOperationMax !== undefined) {
      data.perOperationMax = new Prisma.Decimal(draft.perOperationMax);
      data.perRequestCeiling = new Prisma.Decimal(draft.perOperationMax);
    }
    if (draft.softAlertThreshold !== undefined) {
      data.softAlertThreshold = new Prisma.Decimal(draft.softAlertThreshold * 100);
    }
    if (draft.enforceHardCap !== undefined) {
      data.enforceHardCap = draft.enforceHardCap;
    }
    if (draft.maxDailyRetries !== undefined) {
      data.maxDailyRetries = draft.maxDailyRetries;
    }
    if (draft.reservationTtlSeconds !== undefined) {
      data.reservationTtlSeconds = draft.reservationTtlSeconds;
    }
    if (draft.rollingQuotaLimits !== undefined) {
      data.rollingQuotaLimits =
        draft.rollingQuotaLimits !== null
          ? (draft.rollingQuotaLimits as Prisma.InputJsonValue)
          : Prisma.JsonNull;
    }
    if (draft.allowedProviders !== undefined) {
      data.allowedProviders = [...draft.allowedProviders];
    }
    if (draft.allowedFallbacks !== undefined) {
      data.allowedFallbacks = [...draft.allowedFallbacks];
    }
    if (draft.effectiveTo !== undefined) {
      data.effectiveTo = draft.effectiveTo;
    }
    if (draft.approvedByUserId !== undefined) {
      data.approvedByUserId = draft.approvedByUserId;
    }

    const updated = await this.prisma.aiBudgetPolicy.update({
      where: { id },
      data,
    });

    return this.mapPolicy(updated);
  }

  private mapPolicy(p: AiBudgetPolicy): BudgetPolicyRecord {
    const softThresholdNumber = Number(p.softAlertThreshold);
    // Normalize percentage to 0.50 - 0.99 if stored as 0 - 100
    const normalizedSoftThreshold =
      softThresholdNumber > 1 ? softThresholdNumber / 100 : softThresholdNumber;

    return {
      id: p.id,
      version: p.version,
      scopeType: p.scopeType as BudgetScopeType,
      scopeId: p.scopeId,
      currency: p.currency,
      monthlyCeiling: Number(p.monthlyCeiling),
      dailyCeiling: Number(p.dailyCeiling),
      perOperationMax: Number(p.perOperationMax),
      softAlertThreshold: normalizedSoftThreshold,
      enforceHardCap: p.enforceHardCap,
      maxDailyRetries: p.maxDailyRetries,
      reservationTtlSeconds: p.reservationTtlSeconds,
      rollingQuotaLimits: p.rollingQuotaLimits as Record<string, unknown> | null,
      allowedProviders: p.allowedProviders,
      allowedFallbacks: p.allowedFallbacks,
      effectiveFrom: p.effectiveFrom,
      effectiveTo: p.effectiveTo,
      approvedByUserId: p.approvedByUserId,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }
}
