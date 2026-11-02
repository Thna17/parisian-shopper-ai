import { type BudgetPolicyRecord, type BudgetScopeType } from '../../domain/budget.types.js';

export const BUDGET_POLICY_REPOSITORY = Symbol('BUDGET_POLICY_REPOSITORY');

export interface CreateBudgetPolicyDraft {
  readonly version?: string | undefined;
  readonly scopeType?: BudgetScopeType | undefined;
  readonly scopeId?: string | undefined;
  readonly currency?: string | undefined;
  readonly monthlyCeiling: number;
  readonly dailyCeiling?: number | undefined;
  readonly perOperationMax?: number | undefined;
  readonly softAlertThreshold?: number | undefined;
  readonly enforceHardCap?: boolean | undefined;
  readonly maxDailyRetries?: number | undefined;
  readonly reservationTtlSeconds?: number | undefined;
  readonly rollingQuotaLimits?: Record<string, unknown> | null | undefined;
  readonly allowedProviders?: readonly string[] | undefined;
  readonly allowedFallbacks?: readonly string[] | undefined;
  readonly effectiveFrom?: Date | undefined;
  readonly effectiveTo?: Date | null | undefined;
  readonly approvedByUserId?: string | null | undefined;
  readonly createdById: string;
}

export interface UpdateBudgetPolicyDraft {
  readonly monthlyCeiling?: number | undefined;
  readonly dailyCeiling?: number | undefined;
  readonly perOperationMax?: number | undefined;
  readonly softAlertThreshold?: number | undefined;
  readonly enforceHardCap?: boolean | undefined;
  readonly maxDailyRetries?: number | undefined;
  readonly reservationTtlSeconds?: number | undefined;
  readonly rollingQuotaLimits?: Record<string, unknown> | null | undefined;
  readonly allowedProviders?: readonly string[] | undefined;
  readonly allowedFallbacks?: readonly string[] | undefined;
  readonly effectiveTo?: Date | null | undefined;
  readonly approvedByUserId?: string | null | undefined;
}

export interface BudgetPolicyRepository {
  getActivePolicy(
    scopeType?: BudgetScopeType,
    scopeId?: string,
    date?: Date,
  ): Promise<BudgetPolicyRecord | null>;

  getPolicyById(id: string): Promise<BudgetPolicyRecord | null>;

  listPolicies(): Promise<readonly BudgetPolicyRecord[]>;

  createPolicy(draft: CreateBudgetPolicyDraft): Promise<BudgetPolicyRecord>;

  updatePolicy(id: string, draft: UpdateBudgetPolicyDraft): Promise<BudgetPolicyRecord>;
}
