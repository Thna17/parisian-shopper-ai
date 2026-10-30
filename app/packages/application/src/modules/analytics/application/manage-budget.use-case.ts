import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '../../auth/domain/permissions.js';
import {
  BudgetPolicyNotFoundError,
  InsufficientAnalyticsPermissionError,
} from '../domain/analytics-errors.js';
import type {
  AiBudgetPolicyRecord,
  CreateBudgetPolicyInput,
  UpdateBudgetPolicyInput,
} from '../domain/budget.types.js';
import {
  BUDGET_LEDGER_REPOSITORY,
  type BudgetLedgerRepository,
} from './budget-ledger.repository.js';

export interface CreateBudgetPolicyCommand extends CreateBudgetPolicyInput {
  readonly permissions: readonly string[];
}

export interface UpdateBudgetPolicyCommand extends UpdateBudgetPolicyInput {
  readonly policyId: string;
  readonly permissions: readonly string[];
}

@Injectable()
export class ManageBudgetUseCase {
  public constructor(
    @Inject(BUDGET_LEDGER_REPOSITORY)
    private readonly budgetLedgerRepo: BudgetLedgerRepository,
  ) {}

  public async create(command: CreateBudgetPolicyCommand): Promise<AiBudgetPolicyRecord> {
    if (!command.permissions.includes(Permission.MANAGE_AI_BUDGETS)) {
      throw new InsufficientAnalyticsPermissionError(Permission.MANAGE_AI_BUDGETS);
    }

    if (command.monthlyCeiling <= 0) {
      throw new Error('Monthly ceiling must be greater than zero.');
    }

    return this.budgetLedgerRepo.createPolicy(command);
  }

  public async update(command: UpdateBudgetPolicyCommand): Promise<AiBudgetPolicyRecord> {
    if (!command.permissions.includes(Permission.MANAGE_AI_BUDGETS)) {
      throw new InsufficientAnalyticsPermissionError(Permission.MANAGE_AI_BUDGETS);
    }

    const existing = await this.budgetLedgerRepo.getPolicyById(command.policyId);
    if (!existing) {
      throw new BudgetPolicyNotFoundError(command.policyId);
    }

    if (command.monthlyCeiling !== undefined && command.monthlyCeiling <= 0) {
      throw new Error('Monthly ceiling must be greater than zero.');
    }

    return this.budgetLedgerRepo.updatePolicy(command.policyId, command);
  }

  public async list(permissions: readonly string[]): Promise<readonly AiBudgetPolicyRecord[]> {
    if (
      !permissions.includes(Permission.VIEW_AI_COSTS) &&
      !permissions.includes(Permission.MANAGE_AI_BUDGETS) &&
      !permissions.includes(Permission.VIEW_ALL_CONTENT)
    ) {
      throw new InsufficientAnalyticsPermissionError(Permission.VIEW_AI_COSTS);
    }

    return this.budgetLedgerRepo.listPolicies();
  }
}
