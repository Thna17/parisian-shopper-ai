import { Inject, Injectable } from '@nestjs/common';
import type { AiUsageRecordData, SettleReservationInput } from '../domain/budget.types.js';
import { PricingCatalogService } from '../domain/pricing-catalog.js';
import {
  BUDGET_LEDGER_REPOSITORY,
  type BudgetLedgerRepository,
} from './budget-ledger.repository.js';

@Injectable()
export class SettleAiUsageUseCase {
  public constructor(
    @Inject(BUDGET_LEDGER_REPOSITORY)
    private readonly budgetLedgerRepo: BudgetLedgerRepository,
  ) {}

  public async execute(input: SettleReservationInput): Promise<AiUsageRecordData> {
    const { cost: calculatedCost, isZeroCost } = PricingCatalogService.calculateCost({
      provider: input.provider,
      model: input.model,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
    });

    const actualCost = input.actualCost ?? calculatedCost;
    const costKnowledge = isZeroCost
      ? 'ZERO_CONFIRMED'
      : (input.costKnowledge ?? (input.confirmedCost !== undefined ? 'EXACT' : 'ESTIMATED'));

    return this.budgetLedgerRepo.settleReservation({
      ...input,
      actualCost,
      costKnowledge,
    });
  }

  public async release(reservationId: string, reason?: string): Promise<void> {
    return this.budgetLedgerRepo.releaseReservation(reservationId, reason);
  }

  public async markUnreconciled(reservationId: string, reason: string): Promise<void> {
    return this.budgetLedgerRepo.markUnreconciled(reservationId, reason);
  }
}
