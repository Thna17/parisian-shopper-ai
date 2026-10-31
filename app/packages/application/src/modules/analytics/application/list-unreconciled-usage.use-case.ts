import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '../../auth/domain/permissions.js';
import { InsufficientAnalyticsPermissionError } from '../domain/analytics-errors.js';
import type { UnreconciledUsageRecord } from '../domain/budget.types.js';
import {
  BUDGET_LEDGER_REPOSITORY,
  type BudgetLedgerRepository,
} from './budget-ledger.repository.js';

export interface ListUnreconciledUsageInput {
  readonly permissions: readonly string[];
}

@Injectable()
export class ListUnreconciledUsageUseCase {
  public constructor(
    @Inject(BUDGET_LEDGER_REPOSITORY)
    private readonly budgetLedgerRepo: BudgetLedgerRepository,
  ) {}

  public async execute(
    input: ListUnreconciledUsageInput,
  ): Promise<readonly UnreconciledUsageRecord[]> {
    const hasPermission =
      input.permissions.includes(Permission.VIEW_AI_COSTS) ||
      input.permissions.includes(Permission.VIEW_ALL_CONTENT);

    if (!hasPermission) {
      throw new InsufficientAnalyticsPermissionError(Permission.VIEW_AI_COSTS);
    }

    return this.budgetLedgerRepo.listUnreconciledUsage();
  }
}
