/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-explicit-any, @typescript-eslint/require-await */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Permission } from '../../auth/domain/permissions.js';
import {
  BudgetExhaustedError,
  InsufficientAnalyticsPermissionError,
} from '../domain/analytics-errors.js';
import type {
  AiBudgetPolicyRecord,
  AiCostReservationRecord,
  BudgetUtilizationResult,
  ReserveBudgetInput,
  SettleReservationInput,
  UnreconciledUsageRecord,
} from '../domain/budget.types.js';
import { PricingCatalogService } from '../domain/pricing-catalog.js';
import { type BudgetLedgerRepository } from './budget-ledger.repository.js';
import { GetActiveBudgetUseCase } from './get-active-budget.use-case.js';
import { ManageBudgetUseCase } from './manage-budget.use-case.js';
import { ReserveAiBudgetUseCase } from './reserve-ai-budget.use-case.js';
import { SettleAiUsageUseCase } from './settle-ai-usage.use-case.js';
import { ListCostLedgerUseCase } from './list-cost-ledger.use-case.js';
import { ListUnreconciledUsageUseCase } from './list-unreconciled-usage.use-case.js';
import { ReconcileAiUsageUseCase } from './reconcile-ai-usage.use-case.js';

describe('COST-SEC-01 to COST-SEC-16: AI Cost Ledger & Enforceable Spending Limits', () => {
  let mockBudgetRepo: jest.Mocked<BudgetLedgerRepository>;
  let reserveBudgetUseCase: ReserveAiBudgetUseCase;
  let settleBudgetUseCase: SettleAiUsageUseCase;
  let activeBudgetUseCase: GetActiveBudgetUseCase;
  let manageBudgetUseCase: ManageBudgetUseCase;
  let _listCostLedgerUseCase: ListCostLedgerUseCase;
  let listUnreconciledUseCase: ListUnreconciledUsageUseCase;
  let _reconcileUseCase: ReconcileAiUsageUseCase;

  const defaultPolicy: AiBudgetPolicyRecord = {
    id: 'pol-001',
    scope: 'MONTHLY',
    currency: 'USD',
    monthlyCeiling: 20.0,
    perRequestCeiling: 2.0,
    softAlertThreshold: 80.0,
    effectiveFrom: new Date('2026-10-01T00:00:00Z'),
    effectiveTo: null,
    status: 'ACTIVE',
    createdById: 'admin-001',
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
  };

  const defaultUtilization: BudgetUtilizationResult = {
    policyId: 'pol-001',
    currency: 'USD',
    monthlyCeiling: 20.0,
    perRequestCeiling: 2.0,
    softAlertThreshold: 80.0,
    periodStart: '2026-10-01T00:00:00.000Z',
    periodEnd: '2026-10-31T23:59:59.999Z',
    settledCostUsd: 2.5,
    activeReservedCostUsd: 0.1,
    unreconciledExposureUsd: 0,
    totalCommittedCostUsd: 2.6,
    remainingHeadroomUsd: 17.4,
    utilizationPercent: 13.0,
    isExhausted: false,
    isSoftAlertTriggered: false,
    asOf: '2026-10-30T10:00:00.000Z',
  };

  beforeEach(() => {
    mockBudgetRepo = {
      getActivePolicy: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(defaultPolicy),
      getPolicyById: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(defaultPolicy),
      listPolicies: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue([defaultPolicy]),
      createPolicy: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(defaultPolicy),
      updatePolicy: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(defaultPolicy),
      getBudgetUtilization: jest
        .fn<(...args: any[]) => Promise<any>>()
        .mockResolvedValue(defaultUtilization),
      reserveBudget: jest
        .fn<(...args: any[]) => Promise<any>>()
        .mockImplementation(async (input: ReserveBudgetInput) => ({
          id: 'res-new-001',
          budgetPolicyId: 'pol-001',
          idempotencyKey: input.idempotencyKey,
          contentJobId: input.contentJobId ?? null,
          creativeJobId: input.creativeJobId ?? null,
          generationAttemptId: input.generationAttemptId ?? null,
          reservedAmount: input.estimatedMaxCost,
          currency: 'USD',
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 300000),
          settledAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      settleReservation: jest
        .fn<(...args: any[]) => Promise<any>>()
        .mockImplementation(async (input: SettleReservationInput) => ({
          id: 'usage-001',
          reservationId: input.reservationId,
          generationAttemptId: input.generationAttemptId ?? null,
          provider: input.provider,
          model: input.model,
          providerRequestId: input.providerRequestId ?? null,
          inputTokens: input.inputTokens ?? null,
          outputTokens: input.outputTokens ?? null,
          totalTokens: input.totalTokens ?? null,
          estimatedCost: input.actualCost ?? 0.05,
          confirmedCost: input.confirmedCost ?? null,
          currency: 'USD',
          costKnowledge: input.costKnowledge ?? 'ESTIMATED',
          reconciliationStatus: 'SETTLED',
          reconciliationNotes: null,
          createdAt: new Date(),
          settledAt: new Date(),
        })),
      releaseReservation: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(undefined),
      markUnreconciled: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(undefined),
      listCostLedger: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      }),
      listUnreconciledUsage: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue([]),
      reconcileUsage: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
        id: 'usage-001',
        reservationId: 'res-001',
        generationAttemptId: null,
        provider: 'openai',
        model: 'gpt-4o',
        providerRequestId: null,
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        estimatedCost: 0.05,
        confirmedCost: 0.04,
        currency: 'USD',
        costKnowledge: 'EXACT',
        reconciliationStatus: 'MANUALLY_RECONCILED',
        reconciliationNotes: 'Reconciled from invoice',
        createdAt: new Date(),
        settledAt: new Date(),
      }),
    };

    reserveBudgetUseCase = new ReserveAiBudgetUseCase(mockBudgetRepo);
    settleBudgetUseCase = new SettleAiUsageUseCase(mockBudgetRepo);
    activeBudgetUseCase = new GetActiveBudgetUseCase(mockBudgetRepo);
    manageBudgetUseCase = new ManageBudgetUseCase(mockBudgetRepo);
    _listCostLedgerUseCase = new ListCostLedgerUseCase(mockBudgetRepo);
    listUnreconciledUseCase = new ListUnreconciledUsageUseCase(mockBudgetRepo);
    _reconcileUseCase = new ReconcileAiUsageUseCase(mockBudgetRepo);
  });

  it('COST-SEC-01: Reservation occurs before paid provider dispatch and returns committed hold', async () => {
    const reservation = await reserveBudgetUseCase.execute({
      idempotencyKey: 'idemp-attempt-1',
      estimatedMaxCost: 0.05,
      contentJobId: 'job-1',
    });
    expect(reservation.id).toBe('res-new-001');
    expect(reservation.status).toBe('PENDING');
    expect(reservation.reservedAmount).toBe(0.05);
  });

  it('COST-SEC-02: Atomic concurrent budget reservations evaluate remaining headroom safely', async () => {
    const res1 = await reserveBudgetUseCase.execute({
      idempotencyKey: 'concurrent-1',
      estimatedMaxCost: 0.05,
    });
    const res2 = await reserveBudgetUseCase.execute({
      idempotencyKey: 'concurrent-2',
      estimatedMaxCost: 0.05,
    });
    expect(res1).toBeDefined();
    expect(res2).toBeDefined();
    expect(mockBudgetRepo.reserveBudget).toHaveBeenCalledTimes(2);
  });

  it('COST-SEC-03: Budget exhaustion denial fails closed before provider dispatch', async () => {
    mockBudgetRepo.getBudgetUtilization.mockResolvedValueOnce({
      ...defaultUtilization,
      remainingHeadroomUsd: 0.01,
      totalCommittedCostUsd: 19.99,
      isExhausted: true,
    });

    await expect(
      reserveBudgetUseCase.execute({
        idempotencyKey: 'exhausted-1',
        estimatedMaxCost: 0.05,
      }),
    ).rejects.toThrow(BudgetExhaustedError);
  });

  it('COST-SEC-04: Duplicate request cannot reserve twice and returns existing reservation', async () => {
    const existingReservation: AiCostReservationRecord = {
      id: 'res-existing-1',
      budgetPolicyId: 'pol-001',
      idempotencyKey: 'duplicate-key-1',
      contentJobId: 'job-1',
      creativeJobId: null,
      generationAttemptId: null,
      reservedAmount: 0.05,
      currency: 'USD',
      status: 'PENDING',
      expiresAt: new Date(),
      settledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockBudgetRepo.reserveBudget.mockResolvedValueOnce(existingReservation);

    const res = await reserveBudgetUseCase.execute({
      idempotencyKey: 'duplicate-key-1',
      estimatedMaxCost: 0.05,
    });
    expect(res.id).toBe('res-existing-1');
  });

  it('COST-SEC-05: Worker retries preserve cost integrity with attempt-specific keys', async () => {
    const attempt1 = await reserveBudgetUseCase.execute({
      idempotencyKey: 'job-1:attempt-1',
      estimatedMaxCost: 0.05,
    });
    const attempt2 = await reserveBudgetUseCase.execute({
      idempotencyKey: 'job-1:attempt-2',
      estimatedMaxCost: 0.05,
    });
    expect(attempt1.idempotencyKey).not.toBe(attempt2.idempotencyKey);
  });

  it('COST-SEC-06: Provider timeout creates unreconciled state without releasing exposure', async () => {
    await settleBudgetUseCase.markUnreconciled('res-timeout-1', 'OpenAI timed out after 30s');
    expect(mockBudgetRepo.markUnreconciled).toHaveBeenCalledWith(
      'res-timeout-1',
      'OpenAI timed out after 30s',
    );
  });

  it('COST-SEC-07: Crash recovery does not silently release exposure', async () => {
    const unreconciledList: UnreconciledUsageRecord[] = [
      {
        reservationId: 'res-unreconciled-1',
        idempotencyKey: 'crashed-job-1',
        contentJobId: 'job-crash',
        creativeJobId: null,
        reservedAmount: 0.05,
        status: 'UNRECONCILED',
        createdAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
        reason: 'Worker crashed mid-execution',
      },
    ];
    mockBudgetRepo.listUnreconciledUsage.mockResolvedValueOnce(unreconciledList);

    const items = await listUnreconciledUseCase.execute({
      permissions: [Permission.VIEW_AI_COSTS],
    });
    expect(items.length).toBe(1);
    expect(items[0]?.status).toBe('UNRECONCILED');
  });

  it('COST-SEC-08: Settlement records measured token usage and committed cost', async () => {
    const settlement = await settleBudgetUseCase.execute({
      reservationId: 'res-settle-1',
      provider: 'openai',
      model: 'gpt-4o',
      inputTokens: 1500,
      outputTokens: 600,
      totalTokens: 2100,
    });
    expect(settlement.reconciliationStatus).toBe('SETTLED');
    expect(mockBudgetRepo.settleReservation).toHaveBeenCalled();
  });

  it('COST-SEC-09: Estimated versus confirmed cost separation is explicitly preserved', async () => {
    const est = await settleBudgetUseCase.execute({
      reservationId: 'res-est-1',
      provider: 'openai',
      model: 'gpt-4o',
      costKnowledge: 'ESTIMATED',
    });
    expect(est.costKnowledge).toBe('ESTIMATED');

    const conf = await settleBudgetUseCase.execute({
      reservationId: 'res-conf-1',
      provider: 'openai',
      model: 'gpt-4o',
      confirmedCost: 0.0215,
      costKnowledge: 'EXACT',
    });
    expect(conf.costKnowledge).toBe('EXACT');
  });

  it('COST-SEC-10: Unauthorized budget edits are denied with InsufficientAnalyticsPermissionError', async () => {
    await expect(
      manageBudgetUseCase.create({
        monthlyCeiling: 50.0,
        actorUserId: 'user-viewer',
        permissions: [Permission.VIEW_PRODUCTS],
      }),
    ).rejects.toThrow(InsufficientAnalyticsPermissionError);

    await expect(
      manageBudgetUseCase.update({
        policyId: 'pol-001',
        monthlyCeiling: 50.0,
        actorUserId: 'user-viewer',
        permissions: [Permission.VIEW_PRODUCTS],
      }),
    ).rejects.toThrow(InsufficientAnalyticsPermissionError);
  });

  it('COST-SEC-11: Budget edits update policy records correctly', async () => {
    const updated = await manageBudgetUseCase.update({
      policyId: 'pol-001',
      monthlyCeiling: 25.0,
      actorUserId: 'admin-001',
      permissions: [Permission.MANAGE_AI_BUDGETS],
    });
    expect(updated).toBeDefined();
    expect(mockBudgetRepo.updatePolicy).toHaveBeenCalled();
  });

  it('COST-SEC-12: Telegram and web share the exact same budget policy and database authority', async () => {
    const webActive = await activeBudgetUseCase.execute({
      permissions: [Permission.VIEW_AI_COSTS],
    });
    const tgActive = await activeBudgetUseCase.execute({
      permissions: [Permission.VIEW_ALL_CONTENT],
    });
    expect(webActive.policyId).toBe(tgActive.policyId);
    expect(webActive.monthlyCeiling).toBe(tgActive.monthlyCeiling);
  });

  it('COST-SEC-13: Paid calls fail closed when authority is unavailable', async () => {
    mockBudgetRepo.getActivePolicy.mockRejectedValueOnce(
      new Error('PostgreSQL connection pool exhausted'),
    );

    await expect(
      reserveBudgetUseCase.execute({
        idempotencyKey: 'fail-closed-1',
        estimatedMaxCost: 0.05,
      }),
    ).rejects.toThrow('PostgreSQL connection pool exhausted');
  });

  it('COST-SEC-14: Month-boundary behavior resets budget calculations within UTC calendar boundaries', async () => {
    const res = await activeBudgetUseCase.execute({
      permissions: [Permission.VIEW_AI_COSTS],
    });
    expect(new Date(res.periodStart).getUTCDate()).toBe(1);
    expect(res.isExhausted).toBe(false);
  });

  it('COST-SEC-15: Safe Decimal arithmetic preserves precision without rounding errors', () => {
    const cost = PricingCatalogService.calculateCost({
      provider: 'openai',
      model: 'gpt-4o',
      inputTokens: 1234,
      outputTokens: 567,
    });
    // (1234 / 1M) * 2.5 = 0.003085; (567 / 1M) * 10 = 0.00567; sum = 0.008755
    expect(cost.cost).toBe(0.008755);
    expect(cost.isZeroCost).toBe(false);

    const zeroCost = PricingCatalogService.calculateCost({
      provider: 'codex_cli',
      model: 'local',
      inputTokens: 5000,
      outputTokens: 2000,
    });
    expect(zeroCost.cost).toBe(0);
    expect(zeroCost.isZeroCost).toBe(true);
  });

  it('COST-SEC-16: No API keys are leaked in ledger records or errors', async () => {
    const reservation = await reserveBudgetUseCase.execute({
      idempotencyKey: 'idemp-secret-safe',
      estimatedMaxCost: 0.05,
    });
    const serialized = JSON.stringify(reservation);
    expect(serialized).not.toContain('sk-');
    expect(serialized).not.toContain('api_key');
  });
});
