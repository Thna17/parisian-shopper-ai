/* eslint-disable @typescript-eslint/unbound-method */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type {
  BudgetPolicyRecord,
  BudgetPolicyRepository,
  CancelReservationUseCase,
  ProviderRouterService,
  ReconcileHeldReservationUseCase,
  ReserveBudgetUseCase,
  SanitizedEmployeeDto,
  SettleReservationUseCase,
  UsageLedgerEntryRecord,
  UsageLedgerRepository,
  UsageReservationRecord,
} from '@parisian-shopper/application';
import { BudgetController } from './budget.controller.js';

describe('BudgetController', () => {
  let controller: BudgetController;
  let mockReserveUseCase: jest.Mocked<ReserveBudgetUseCase>;
  let mockSettleUseCase: jest.Mocked<SettleReservationUseCase>;
  let mockCancelUseCase: jest.Mocked<CancelReservationUseCase>;
  let mockReconcileUseCase: jest.Mocked<ReconcileHeldReservationUseCase>;
  let mockRouterService: jest.Mocked<ProviderRouterService>;
  let mockBudgetPolicyRepo: jest.Mocked<BudgetPolicyRepository>;
  let mockUsageLedgerRepo: jest.Mocked<UsageLedgerRepository>;

  const mockUser: SanitizedEmployeeDto = {
    id: 'usr-admin-01',
    displayName: 'Admin User',
    roles: ['ADMIN'],
    permissions: ['VIEW_AI_COSTS', 'MANAGE_AI_BUDGETS'],
    status: 'ACTIVE',
  };

  const samplePolicy: BudgetPolicyRecord = {
    id: 'pol-001',
    version: '1.0.0',
    scopeType: 'GLOBAL',
    scopeId: 'GLOBAL',
    currency: 'USD',
    monthlyCeiling: 50.0,
    dailyCeiling: 20.0,
    perOperationMax: 2.0,
    softAlertThreshold: 0.8,
    enforceHardCap: true,
    maxDailyRetries: 3,
    reservationTtlSeconds: 300,
    rollingQuotaLimits: null,
    allowedProviders: ['openai', 'codex_cli', 'fake'],
    allowedFallbacks: ['codex_cli', 'fake'],
    effectiveFrom: new Date(),
    effectiveTo: null,
    approvedByUserId: 'usr-admin-01',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleReservation: UsageReservationRecord = {
    id: 'res-001',
    idempotencyKey: 'idemp-001',
    budgetPolicyVersionId: 'pol-001',
    userId: 'usr-admin-01',
    tenantId: 'parisian-shopper-default',
    creativeJobId: null,
    contentJobId: null,
    campaignId: null,
    providerId: 'openai',
    modelId: 'gpt-4o',
    estimatedCost: 0.05,
    currency: 'USD',
    capacityUnits: null,
    state: 'RESERVED',
    createdAt: new Date(),
    dispatchedAt: null,
    expiresAt: new Date(),
    closedAt: null,
    version: 1,
  };

  const sampleLedgerEntry: UsageLedgerEntryRecord = {
    id: 'entry-001',
    entryType: 'USAGE_COMMITTED',
    reservationId: 'res-001',
    attemptId: 'att-001',
    settlementKey: 'settle-001',
    amount: 0.045,
    currency: 'USD',
    costKnowledge: 'EXACT',
    pricingVersionId: null,
    exchangeRate: null,
    exchangeRateSource: null,
    exchangeRateSourceRecordId: null,
    exchangeRateEffectiveAt: null,
    baseCurrency: null,
    quoteCurrency: null,
    recordedAt: new Date(),
    reconciliationRef: null,
    correctionOfEntryId: null,
    actorUserId: 'usr-admin-01',
    systemComponent: 'usage-ledger-worker',
    createdAt: new Date(),
  };

  beforeEach(() => {
    mockReserveUseCase = {
      execute: jest.fn<ReserveBudgetUseCase['execute']>().mockResolvedValue({
        reservation: sampleReservation,
        quotaStatus: {
          policyId: 'pol-001',
          policyVersion: '1.0.0',
          scopeType: 'GLOBAL',
          scopeId: 'GLOBAL',
          currency: 'USD',
          monthlyCeiling: 50.0,
          dailyCeiling: 20.0,
          perOperationMax: 2.0,
          softAlertThreshold: 0.8,
          totalSettledSpendMonth: 5.0,
          totalSettledSpendDay: 1.0,
          activeReservedExposure: 0.5,
          remainingMonthlyHeadroom: 44.5,
          remainingDailyHeadroom: 18.5,
          isMonthlyCeilingExhausted: false,
          isDailyCeilingExhausted: false,
          isSoftAlertTriggered: false,
          asOf: new Date().toISOString(),
        },
        event: {
          eventId: 'evt-001',
          eventType: 'usage.reservation.created',
          eventVersion: '1.0.0',
          aggregateType: 'UsageReservation',
          aggregateId: sampleReservation.id,
          tenantId: sampleReservation.tenantId,
          occurredAt: new Date().toISOString(),
          recordedAt: new Date().toISOString(),
          correlationId: 'idemp-001',
          causationId: 'idemp-001',
          idempotencyKey: sampleReservation.id,
          actorType: 'USER',
          actorId: sampleReservation.userId,
          policyVersionId: sampleReservation.budgetPolicyVersionId,
          payload: {
            reservationId: sampleReservation.id,
            userId: sampleReservation.userId,
            estimatedCost: sampleReservation.estimatedCost,
            currency: sampleReservation.currency,
            expiresAt: sampleReservation.expiresAt.toISOString(),
            policyVersionId: sampleReservation.budgetPolicyVersionId,
          },
        },
      }),
    } as unknown as jest.Mocked<ReserveBudgetUseCase>;

    mockSettleUseCase = {
      execute: jest.fn<SettleReservationUseCase['execute']>().mockResolvedValue({
        reservation: { ...sampleReservation, state: 'SETTLED' },
        attempt: {
          id: 'att-001',
          reservationId: sampleReservation.id,
          attemptNumber: 1,
          providerId: 'openai',
          modelId: 'gpt-4o',
          modality: 'TEXT',
          operationalOutcome: 'SUCCEEDED',
          retryRelationship: 'INITIAL_ATTEMPT',
          safePromptDigest: 'a'.repeat(64),
          digestAlgorithm: 'HMAC-SHA256',
          digestKeyVersion: '2026-v1',
          dispatchedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        ledgerEntry: sampleLedgerEntry,
        event: {} as never,
      }),
    } as unknown as jest.Mocked<SettleReservationUseCase>;

    mockCancelUseCase = {
      execute: jest.fn<CancelReservationUseCase['execute']>().mockResolvedValue({
        reservation: { ...sampleReservation, state: 'RELEASED' },
        ledgerEntry: sampleLedgerEntry,
        event: {} as never,
      }),
    } as unknown as jest.Mocked<CancelReservationUseCase>;

    mockReconcileUseCase = {
      execute: jest.fn<ReconcileHeldReservationUseCase['execute']>().mockResolvedValue({
        reservation: { ...sampleReservation, state: 'SETTLED' },
        ledgerEntry: sampleLedgerEntry,
        event: {} as never,
      }),
    } as unknown as jest.Mocked<ReconcileHeldReservationUseCase>;

    mockRouterService = {
      selectProvider: jest.fn<ProviderRouterService['selectProvider']>().mockResolvedValue({
        providerId: 'openai',
        modelId: 'gpt-4o',
        estimatedCost: 0.05,
        costKnowledge: 'ESTIMATED',
        isZeroCost: false,
        isFallback: false,
        capability: {
          id: 'cap-001',
          providerId: 'openai',
          modelId: 'gpt-4o',
          modality: 'TEXT',
          supportedCapabilities: ['TEXT_GENERATION'],
          environment: 'DEVELOPMENT',
          supportsIdempotency: true,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }),
      evaluateOperationCost: jest
        .fn<ProviderRouterService['evaluateOperationCost']>()
        .mockReturnValue({
          estimatedCost: 0.05,
          costKnowledge: 'ESTIMATED',
          isZeroCost: false,
        }),
    } as unknown as jest.Mocked<ProviderRouterService>;

    mockBudgetPolicyRepo = {
      getActivePolicy: jest
        .fn<BudgetPolicyRepository['getActivePolicy']>()
        .mockResolvedValue(samplePolicy),
      getPolicyById: jest
        .fn<BudgetPolicyRepository['getPolicyById']>()
        .mockResolvedValue(samplePolicy),
      listPolicies: jest
        .fn<BudgetPolicyRepository['listPolicies']>()
        .mockResolvedValue([samplePolicy]),
      createPolicy: jest
        .fn<BudgetPolicyRepository['createPolicy']>()
        .mockResolvedValue(samplePolicy),
      updatePolicy: jest
        .fn<BudgetPolicyRepository['updatePolicy']>()
        .mockResolvedValue(samplePolicy),
    };

    mockUsageLedgerRepo = {
      getAggregateSpend: jest
        .fn<UsageLedgerRepository['getAggregateSpend']>()
        .mockResolvedValue(10.0),
      getActiveReservedExposure: jest
        .fn<UsageLedgerRepository['getActiveReservedExposure']>()
        .mockResolvedValue(1.0),
      listLedgerEntries: jest.fn<UsageLedgerRepository['listLedgerEntries']>().mockResolvedValue({
        items: [sampleLedgerEntry],
        total: 1,
      }),
      listHeldReservations: jest
        .fn<UsageLedgerRepository['listHeldReservations']>()
        .mockResolvedValue([sampleReservation]),
    } as unknown as jest.Mocked<UsageLedgerRepository>;

    controller = new BudgetController(
      mockReserveUseCase,
      mockSettleUseCase,
      mockCancelUseCase,
      mockReconcileUseCase,
      mockRouterService,
      mockBudgetPolicyRepo,
      mockUsageLedgerRepo,
    );
  });

  it('GET /v1/ai/budget/active returns active policy and quota report', async () => {
    const res = await controller.getActiveBudget();
    expect(res.policy?.id).toBe(samplePolicy.id);
    expect(res.quota?.remainingMonthlyHeadroom).toBeGreaterThan(0);
  });

  it('GET /v1/ai/budget/policies returns list of budget policies', async () => {
    const list = await controller.listPolicies();
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(samplePolicy.id);
  });

  it('POST /v1/ai/budget/policies creates new budget policy revision', async () => {
    const created = await controller.createPolicy(mockUser, {
      monthlyCeiling: 60.0,
      dailyCeiling: 25.0,
    });
    expect(created.id).toBe(samplePolicy.id);
    expect(mockBudgetPolicyRepo.createPolicy).toHaveBeenCalled();
  });

  it('PATCH /v1/ai/budget/policies/:id updates policy', async () => {
    const updated = await controller.updatePolicy(mockUser, 'pol-001', {
      monthlyCeiling: 70.0,
    });
    expect(updated.id).toBe(samplePolicy.id);
    expect(mockBudgetPolicyRepo.updatePolicy).toHaveBeenCalled();
  });

  it('POST /v1/ai/budget/reservations creates reservation hold', async () => {
    const res = await controller.reserveBudget(mockUser, {
      idempotencyKey: 'idemp-001',
      estimatedCost: 0.05,
      providerId: 'openai',
      modelId: 'gpt-4o',
    });
    expect(res.id).toBe(sampleReservation.id);
    expect(mockReserveUseCase.execute).toHaveBeenCalled();
  });

  it('POST /v1/ai/budget/reservations/:id/release releases reservation hold', async () => {
    const res = await controller.releaseReservation(mockUser, 'res-001', {
      reason: 'User cancelled before generation',
      isConfirmedZeroCharge: true,
    });
    expect(res.state).toBe('RELEASED');
  });

  it('POST /v1/ai/budget/reservations/:id/settle settles reservation', async () => {
    const res = await controller.settleReservation('res-001', {
      settlementKey: 'settle-001',
      attemptId: 'att-001',
      outcome: 'SUCCEEDED',
      actualCost: 0.045,
    });
    expect(res.entryType).toBe('USAGE_COMMITTED');
  });

  it('GET /v1/ai/ledger/entries lists ledger records', async () => {
    const res = await controller.listLedger(20, 0);
    expect(res.items).toHaveLength(1);
    expect(res.total).toBe(1);
  });

  it('GET /v1/ai/ledger/unreconciled lists held reservations', async () => {
    const res = await controller.listUnreconciled(20, 0);
    expect(res).toHaveLength(1);
  });

  it('POST /v1/ai/ledger/reconcile/:reservationId reconciles held reservation', async () => {
    const res = await controller.reconcileReservation(mockUser, 'res-001', {
      settlementKey: 'rec-settle-01',
      confirmedAmount: 0.05,
      isCharged: true,
      reconciliationRef: 'INV-1234',
      costKnowledge: 'EXACT',
    });
    expect(res.id).toBe(sampleLedgerEntry.id);
  });

  it('GET /v1/ai/router/capabilities evaluates provider capability routing', async () => {
    const res = await controller.routeCapability({
      modality: 'TEXT',
      capability: 'TEXT_GENERATION',
    });
    expect(res).toBeDefined();
    expect(mockRouterService.selectProvider).toHaveBeenCalled();
  });
});
