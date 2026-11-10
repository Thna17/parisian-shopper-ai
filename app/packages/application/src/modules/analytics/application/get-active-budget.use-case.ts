import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '../../auth/domain/permissions.js';
import { InsufficientAnalyticsPermissionError } from '../domain/analytics-errors.js';
import type { BudgetUtilizationResult } from '../domain/budget.types.js';
import {
  BUDGET_LEDGER_REPOSITORY,
  type BudgetLedgerRepository,
} from './budget-ledger.repository.js';

export interface GetActiveBudgetInput {
  readonly permissions: readonly string[];
}

@Injectable()
export class GetActiveBudgetUseCase {
  public constructor(
    @Inject(BUDGET_LEDGER_REPOSITORY)
    private readonly budgetLedgerRepo: BudgetLedgerRepository,
  ) {}

  public async execute(input: GetActiveBudgetInput): Promise<BudgetUtilizationResult | null> {
    const hasPermission =
      input.permissions.includes(Permission.VIEW_AI_COSTS) ||
      input.permissions.includes(Permission.VIEW_ALL_CONTENT);

    if (!hasPermission) {
      throw new InsufficientAnalyticsPermissionError(Permission.VIEW_AI_COSTS);
    }

    // Default UTC month boundaries
    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const periodEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999),
    );

    const policy = await this.budgetLedgerRepo.getActivePolicy();
    // Viewing a report cannot create spending authority or invent a business policy.
    if (!policy) return null;

    return this.budgetLedgerRepo.getBudgetUtilization(policy.id, periodStart, periodEnd);
  }
}
