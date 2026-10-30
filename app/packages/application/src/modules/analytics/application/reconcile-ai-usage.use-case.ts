import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '../../auth/domain/permissions.js';
import { InsufficientAnalyticsPermissionError } from '../domain/analytics-errors.js';
import type { AiUsageRecordData, ReconcileUsageInput } from '../domain/budget.types.js';
import {
  BUDGET_LEDGER_REPOSITORY,
  type BudgetLedgerRepository,
} from './budget-ledger.repository.js';

export interface ReconcileAiUsageCommand extends ReconcileUsageInput {
  readonly recordId: string;
  readonly permissions: readonly string[];
}

@Injectable()
export class ReconcileAiUsageUseCase {
  public constructor(
    @Inject(BUDGET_LEDGER_REPOSITORY)
    private readonly budgetLedgerRepo: BudgetLedgerRepository,
  ) {}

  public async execute(command: ReconcileAiUsageCommand): Promise<AiUsageRecordData> {
    if (!command.permissions.includes(Permission.MANAGE_AI_BUDGETS)) {
      throw new InsufficientAnalyticsPermissionError(Permission.MANAGE_AI_BUDGETS);
    }

    return this.budgetLedgerRepo.reconcileUsage(command.recordId, command);
  }
}
