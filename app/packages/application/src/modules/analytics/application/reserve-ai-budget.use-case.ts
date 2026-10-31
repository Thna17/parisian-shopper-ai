import { Inject, Injectable } from '@nestjs/common';
import { BudgetExhaustedError, InsufficientBudgetError } from '../domain/analytics-errors.js';
import type { AiCostReservationRecord, ReserveBudgetInput } from '../domain/budget.types.js';
import {
  BUDGET_LEDGER_REPOSITORY,
  type BudgetLedgerRepository,
} from './budget-ledger.repository.js';

@Injectable()
export class ReserveAiBudgetUseCase {
  public constructor(
    @Inject(BUDGET_LEDGER_REPOSITORY)
    private readonly budgetLedgerRepo: BudgetLedgerRepository,
  ) {}

  public async execute(input: ReserveBudgetInput): Promise<AiCostReservationRecord> {
    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const periodEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999),
    );

    let policy = await this.budgetLedgerRepo.getActivePolicy();
    if (!policy) {
      policy = await this.budgetLedgerRepo.createPolicy({
        monthlyCeiling: 20.0,
        perRequestCeiling: 2.0,
        softAlertThreshold: 80.0,
        effectiveFrom: periodStart,
        actorUserId: '00000000-0000-0000-0000-000000000000',
      });
    }

    // Check request ceiling
    if (input.estimatedMaxCost > policy.perRequestCeiling) {
      throw new InsufficientBudgetError(input.estimatedMaxCost, policy.perRequestCeiling);
    }

    // Check utilization
    const utilization = await this.budgetLedgerRepo.getBudgetUtilization(
      policy.id,
      periodStart,
      periodEnd,
    );

    if (utilization.isExhausted || utilization.remainingHeadroomUsd < input.estimatedMaxCost) {
      throw new BudgetExhaustedError(
        `Operational AI budget exhausted: remaining headroom is $${utilization.remainingHeadroomUsd.toFixed(4)} USD, but operation requires $${input.estimatedMaxCost.toFixed(4)} USD.`,
      );
    }

    return this.budgetLedgerRepo.reserveBudget(input);
  }
}
