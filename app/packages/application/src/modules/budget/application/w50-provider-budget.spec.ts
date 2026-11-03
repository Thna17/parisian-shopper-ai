/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/unbound-method */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  BudgetExceededError,
  DestructivePurgeBlockedError,
  DuplicateSettlementError,
  ExchangeRateUnavailableError,
  ProviderCircuitBrokenError,
  ReservationExpiredError,
  ReservationStateTransitionError,
  UnauthorizedProviderFallbackError,
  UnverifiedPricingError,
} from '../domain/budget-errors.js';
import type {
  BudgetPolicyRecord,
  ProviderAttemptRecord,
  ProviderCapabilityRegistrationRecord,
  ProviderPricingVersionRecord,
  UsageLedgerEntryRecord,
  UsageReservationRecord,
} from '../domain/budget.types.js';
import { CircuitBreakerService } from '../domain/circuit-breaker.js';
import { SafePromptDigestService } from '../domain/safe-prompt-digest.service.js';
import type { BudgetPolicyRepository } from './ports/budget-policy.repository.js';
import type { ProviderCapabilityRepository } from './ports/provider-capability.repository.js';
import type { ProviderPricingRepository } from './ports/provider-pricing.repository.js';
import type { UsageLedgerRepository } from './ports/usage-ledger.repository.js';
import { CancelReservationUseCase } from './use-cases/cancel-reservation.use-case.js';
import { DataPurgeGovernanceService } from './use-cases/data-purge-governance.service.js';
import { DispatchProviderAttemptUseCase } from './use-cases/dispatch-provider-attempt.use-case.js';
import { ProviderRouterService } from './use-cases/provider-router.service.js';
import { ReconcileHeldReservationUseCase } from './use-cases/reconcile-held-reservation.use-case.js';
import { ReserveBudgetUseCase } from './use-cases/reserve-budget.use-case.js';
import { SettleReservationUseCase } from './use-cases/settle-reservation.use-case.js';

describe('W50: Provider Routing, Atomic Budget Reservations & Immutable Usage Ledger (SEC-BUDGET-01 to SEC-BUDGET-20)', () => {
  let mockUsageLedgerRepo: jest.Mocked<UsageLedgerRepository>;
  let mockBudgetPolicyRepo: jest.Mocked<BudgetPolicyRepository>;
  let mockPricingRepo: jest.Mocked<ProviderPricingRepository>;
  let mockCapabilityRepo: jest.Mocked<ProviderCapabilityRepository>;
  let circuitBreaker: CircuitBreakerService;
  let digestService: SafePromptDigestService;

  let reserveBudgetUseCase: ReserveBudgetUseCase;
  let dispatchAttemptUseCase: DispatchProviderAttemptUseCase;
  let settleReservationUseCase: SettleReservationUseCase;
  let cancelReservationUseCase: CancelReservationUseCase;
  let reconcileHeldUseCase: ReconcileHeldReservationUseCase;
  let routerService: ProviderRouterService;
  let purgeGovernanceService: DataPurgeGovernanceService;

  const defaultPolicy: BudgetPolicyRecord = {
    id: 'pol-w50-001',
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
    effectiveFrom: new Date('2026-10-01T00:00:00Z'),
    effectiveTo: null,
    approvedByUserId: 'usr-admin-001',
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
  };

  const sampleReservation: UsageReservationRecord = {
    id: 'res-w50-001',
    idempotencyKey: 'idemp-sample-1',
    budgetPolicyVersionId: 'pol-w50-001',
    userId: 'usr-employee-001',
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
    expiresAt: new Date(Date.now() + 300_000),
    closedAt: null,
    version: 1,
  };

  const sampleAttempt: ProviderAttemptRecord = {
    id: 'att-w50-001',
    reservationId: 'res-w50-001',
    attemptNumber: 1,
    providerId: 'openai',
    modelId: 'gpt-4o',
    modality: 'TEXT',
    providerRequestId: 'req-upstream-123',
    dispatchedAt: new Date(),
    completedAt: null,
    operationalOutcome: 'IN_PROGRESS',
    retryRelationship: 'INITIAL_ATTEMPT',
    inputTokens: null,
    outputTokens: null,
    imageCount: null,
    resolutionTier: null,
    videoDurationSeconds: null,
    cancellationReason: null,
    durationMs: null,
    safePromptDigest: 'a'.repeat(64),
    digestAlgorithm: 'HMAC-SHA256',
    digestKeyVersion: '2026-v1',
    outputDigest: null,
    errorCode: null,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const samplePricing: ProviderPricingVersionRecord = {
    id: 'pricing-openai-v1',
    providerId: 'openai',
    modelId: 'gpt-4o',
    capability: 'TEXT_GENERATION',
    modality: 'TEXT',
    pricingUnit: 'PER_1M_TOKENS',
    inputTokenRate: 2.5,
    outputTokenRate: 10.0,
    imageRateByResolution: null,
    videoRateByDuration: null,
    subscriptionRules: null,
    currency: 'USD',
    source: 'Official OpenAI API Pricing',
    pricingSourceUrl: 'https://openai.com/pricing',
    sourceRetrievedAt: new Date('2026-10-01T00:00:00Z'),
    effectiveFrom: new Date('2026-10-01T00:00:00Z'),
    effectiveTo: null,
    approvalStatus: 'APPROVED',
    approvedByUserId: 'usr-admin-001',
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
  };

  const sampleCapability: ProviderCapabilityRegistrationRecord = {
    id: 'cap-openai-text',
    providerId: 'openai',
    modelId: 'gpt-4o',
    modality: 'TEXT',
    supportedCapabilities: ['TEXT_GENERATION', 'KHMER_REASONING'],
    environment: 'DEVELOPMENT',
    supportsIdempotency: true,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    circuitBreaker = new CircuitBreakerService({
      failureThreshold: 3,
      windowDurationMs: 120_000,
      probeIntervalMs: 60_000,
    });
    digestService = new SafePromptDigestService();

    mockUsageLedgerRepo = {
      createReservation: jest
        .fn<UsageLedgerRepository['createReservation']>()
        .mockResolvedValue(sampleReservation),
      findReservationById: jest
        .fn<UsageLedgerRepository['findReservationById']>()
        .mockResolvedValue(sampleReservation),
      findReservationByIdempotencyKey: jest
        .fn<UsageLedgerRepository['findReservationByIdempotencyKey']>()
        .mockResolvedValue(null),
      updateReservationState: jest
        .fn<UsageLedgerRepository['updateReservationState']>()
        .mockImplementation(async (id, state, version, closedAt, dispatchedAt) => ({
          ...sampleReservation,
          id,
          state,
          version: version + 1,
          closedAt: closedAt ?? null,
          dispatchedAt: dispatchedAt ?? null,
        })),
      listExpiredReservations: jest
        .fn<UsageLedgerRepository['listExpiredReservations']>()
        .mockResolvedValue([]),
      createAttempt: jest
        .fn<UsageLedgerRepository['createAttempt']>()
        .mockResolvedValue(sampleAttempt),
      findAttemptById: jest
        .fn<UsageLedgerRepository['findAttemptById']>()
        .mockResolvedValue(sampleAttempt),
      findAttemptByReservationAndNumber: jest
        .fn<UsageLedgerRepository['findAttemptByReservationAndNumber']>()
        .mockResolvedValue(sampleAttempt),
      updateAttempt: jest
        .fn<UsageLedgerRepository['updateAttempt']>()
        .mockImplementation(async (input) => ({
          ...sampleAttempt,
          id: input.attemptId,
          operationalOutcome: input.operationalOutcome,
          inputTokens: input.inputTokens ?? null,
          outputTokens: input.outputTokens ?? null,
          durationMs: input.durationMs ?? null,
          errorCode: input.errorCode ?? null,
          errorMessage: input.errorMessage ?? null,
        })),
      listAttemptsByReservationId: jest
        .fn<UsageLedgerRepository['listAttemptsByReservationId']>()
        .mockResolvedValue([sampleAttempt]),
      appendLedgerEntry: jest
        .fn<UsageLedgerRepository['appendLedgerEntry']>()
        .mockImplementation(async (draft) => ({
          id: 'ent-001',
          entryType: draft.entryType,
          reservationId: draft.reservationId,
          attemptId: draft.attemptId ?? null,
          settlementKey: draft.settlementKey,
          amount: draft.amount,
          currency: draft.currency,
          costKnowledge: draft.costKnowledge,
          pricingVersionId: draft.pricingVersionId ?? null,
          exchangeRate: draft.exchangeRate ?? null,
          exchangeRateSource: draft.exchangeRateSource ?? null,
          exchangeRateSourceRecordId: draft.exchangeRateSourceRecordId ?? null,
          exchangeRateEffectiveAt: draft.exchangeRateEffectiveAt ?? null,
          baseCurrency: draft.baseCurrency ?? null,
          quoteCurrency: draft.quoteCurrency ?? null,
          recordedAt: new Date(),
          reconciliationRef: draft.reconciliationRef ?? null,
          correctionOfEntryId: draft.correctionOfEntryId ?? null,
          actorUserId: draft.actorUserId ?? null,
          systemComponent: draft.systemComponent ?? 'usage-ledger-worker',
          createdAt: new Date(),
        })),
      findLedgerEntryBySettlementKey: jest
        .fn<UsageLedgerRepository['findLedgerEntryBySettlementKey']>()
        .mockResolvedValue(null),
      listLedgerEntriesByReservationId: jest
        .fn<UsageLedgerRepository['listLedgerEntriesByReservationId']>()
        .mockResolvedValue([]),
      listLedgerEntries: jest
        .fn<UsageLedgerRepository['listLedgerEntries']>()
        .mockResolvedValue({ items: [], total: 0 }),
      getAggregateSpend: jest
        .fn<UsageLedgerRepository['getAggregateSpend']>()
        .mockResolvedValue(5.0),
      getActiveReservedExposure: jest
        .fn<UsageLedgerRepository['getActiveReservedExposure']>()
        .mockResolvedValue(1.0),
      listHeldReservations: jest
        .fn<UsageLedgerRepository['listHeldReservations']>()
        .mockResolvedValue([]),
    };

    mockBudgetPolicyRepo = {
      getActivePolicy: jest
        .fn<BudgetPolicyRepository['getActivePolicy']>()
        .mockResolvedValue(defaultPolicy),
      getPolicyById: jest
        .fn<BudgetPolicyRepository['getPolicyById']>()
        .mockResolvedValue(defaultPolicy),
      listPolicies: jest
        .fn<BudgetPolicyRepository['listPolicies']>()
        .mockResolvedValue([defaultPolicy]),
      createPolicy: jest
        .fn<BudgetPolicyRepository['createPolicy']>()
        .mockResolvedValue(defaultPolicy),
      updatePolicy: jest
        .fn<BudgetPolicyRepository['updatePolicy']>()
        .mockResolvedValue(defaultPolicy),
    };

    mockPricingRepo = {
      findActivePricing: jest
        .fn<ProviderPricingRepository['findActivePricing']>()
        .mockResolvedValue(samplePricing),
      createPricingVersion: jest
        .fn<ProviderPricingRepository['createPricingVersion']>()
        .mockResolvedValue(samplePricing),
      listPricingVersions: jest
        .fn<ProviderPricingRepository['listPricingVersions']>()
        .mockResolvedValue([samplePricing]),
    };

    mockCapabilityRepo = {
      findCapability: jest
        .fn<ProviderCapabilityRepository['findCapability']>()
        .mockResolvedValue(sampleCapability),
      listActiveCapabilities: jest
        .fn<ProviderCapabilityRepository['listActiveCapabilities']>()
        .mockResolvedValue([
          sampleCapability,
          {
            id: 'cap-codex-cli-fallback',
            providerId: 'codex_cli',
            modelId: 'local',
            modality: 'TEXT',
            supportedCapabilities: ['TEXT_GENERATION'],
            environment: 'DEVELOPMENT',
            supportsIdempotency: true,
            active: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      registerCapability: jest
        .fn<ProviderCapabilityRepository['registerCapability']>()
        .mockResolvedValue(sampleCapability),
    };

    reserveBudgetUseCase = new ReserveBudgetUseCase(mockUsageLedgerRepo, mockBudgetPolicyRepo);
    dispatchAttemptUseCase = new DispatchProviderAttemptUseCase(
      mockUsageLedgerRepo,
      mockCapabilityRepo,
      circuitBreaker,
      digestService,
    );
    settleReservationUseCase = new SettleReservationUseCase(
      mockUsageLedgerRepo,
      mockPricingRepo,
      circuitBreaker,
    );
    cancelReservationUseCase = new CancelReservationUseCase(mockUsageLedgerRepo);
    reconcileHeldUseCase = new ReconcileHeldReservationUseCase(mockUsageLedgerRepo);
    routerService = new ProviderRouterService(
      mockCapabilityRepo,
      mockBudgetPolicyRepo,
      circuitBreaker,
    );
    purgeGovernanceService = new DataPurgeGovernanceService();
  });

  it('SEC-BUDGET-01: Every paid generation call requires an active UsageReservation in state RESERVED', async () => {
    // Attempting dispatch without a RESERVED reservation fails closed
    mockUsageLedgerRepo.findReservationById.mockResolvedValueOnce({
      ...sampleReservation,
      state: 'SETTLED',
    });

    await expect(
      dispatchAttemptUseCase.execute({
        reservationId: 'res-w50-001',
        attemptNumber: 1,
        providerId: 'openai',
        modelId: 'gpt-4o',
        modality: 'TEXT',
        promptText: 'Generate luxury perfume description',
      }),
    ).rejects.toThrow(ReservationStateTransitionError);
  });

  it('SEC-BUDGET-02: Concurrent requests exceeding daily or monthly ceilings defined in BudgetPolicy fail closed immediately', async () => {
    mockUsageLedgerRepo.getAggregateSpend.mockResolvedValueOnce(49.98); // monthly spend
    mockUsageLedgerRepo.getActiveReservedExposure.mockResolvedValueOnce(0.01);

    await expect(
      reserveBudgetUseCase.execute({
        idempotencyKey: 'exceeded-monthly-cap',
        estimatedCost: 0.05,
        providerId: 'openai',
        modelId: 'gpt-4o',
      }),
    ).rejects.toThrow(BudgetExceededError);
  });

  it('SEC-BUDGET-03: Soft warning alert threshold triggers operational warning when spend crosses percentage threshold', async () => {
    mockUsageLedgerRepo.getAggregateSpend.mockImplementation(async (_st, _si, fromDate) => {
      // Month start has 40.0 spend (80% of 50.0 ceiling); Day start has 5.0 spend (within 20.0 daily cap)
      return fromDate.getUTCDate() === 1 ? 40.0 : 5.0;
    });
    mockUsageLedgerRepo.getActiveReservedExposure.mockResolvedValue(0.5);

    const result = await reserveBudgetUseCase.execute({
      idempotencyKey: 'soft-alert-test',
      estimatedCost: 0.05,
      providerId: 'openai',
      modelId: 'gpt-4o',
    });

    expect(result.quotaStatus.isSoftAlertTriggered).toBe(true);
    expect(result.quotaStatus.remainingMonthlyHeadroom).toBeGreaterThan(0);
  });

  it('SEC-BUDGET-04: Duplicate reservation requests with identical idempotency keys return existing holds without double-allocating', async () => {
    mockUsageLedgerRepo.findReservationByIdempotencyKey.mockResolvedValueOnce(sampleReservation);

    const result = await reserveBudgetUseCase.execute({
      idempotencyKey: 'idemp-sample-1',
      estimatedCost: 0.05,
      providerId: 'openai',
      modelId: 'gpt-4o',
    });

    expect(result.reservation.id).toBe(sampleReservation.id);
    expect(mockUsageLedgerRepo.createReservation).not.toHaveBeenCalled();
  });

  it('SEC-BUDGET-05: Duplicate settlement requests with identical settlement keys do not double-debit the ledger', async () => {
    const existingEntry: UsageLedgerEntryRecord = {
      id: 'ent-prev',
      entryType: 'USAGE_COMMITTED',
      reservationId: sampleReservation.id,
      attemptId: sampleAttempt.id,
      settlementKey: 'settle-duplicate-key',
      amount: 0.04,
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
      actorUserId: null,
      systemComponent: 'usage-ledger-worker',
      createdAt: new Date(),
    };
    mockUsageLedgerRepo.findLedgerEntryBySettlementKey.mockResolvedValueOnce(existingEntry);

    await expect(
      settleReservationUseCase.execute({
        reservationId: sampleReservation.id,
        attemptId: sampleAttempt.id,
        settlementKey: 'settle-duplicate-key',
        outcome: 'SUCCEEDED',
        actualCost: 0.04,
      }),
    ).rejects.toThrow(DuplicateSettlementError);
  });

  it('SEC-BUDGET-06: Operational attempts begin at dispatch in IN_PROGRESS and transition exclusively to mutually exclusive terminal outcomes', async () => {
    mockUsageLedgerRepo.findReservationById.mockResolvedValueOnce({
      ...sampleReservation,
      state: 'DISPATCHED',
    });

    const res = await settleReservationUseCase.execute({
      reservationId: sampleReservation.id,
      attemptId: sampleAttempt.id,
      settlementKey: 'settle-succ-01',
      outcome: 'SUCCEEDED',
      actualCost: 0.035,
      costKnowledge: 'EXACT',
    });

    expect(res.attempt.operationalOutcome).toBe('SUCCEEDED');
    expect(res.reservation.state).toBe('SETTLED');
    expect(res.ledgerEntry.entryType).toBe('USAGE_COMMITTED');
  });

  it('SEC-BUDGET-07: Pre-dispatch cancellation is managed exclusively outside ProviderAttempt via UsageReservation (RESERVED -> RELEASED)', async () => {
    const res = await cancelReservationUseCase.execute({
      reservationId: sampleReservation.id,
      reason: 'User cancelled job prior to generation dispatch',
      actorUserId: 'usr-employee-001',
    });

    expect(res.reservation.state).toBe('RELEASED');
    expect(res.ledgerEntry.entryType).toBe('RESERVATION_RELEASED');
    expect(mockUsageLedgerRepo.createAttempt).not.toHaveBeenCalled();
  });

  it('SEC-BUDGET-08: Ambiguous or timed-out provider attempts enter UNKNOWN_OUTCOME and transition reservation to HELD_FOR_RECONCILIATION without uncoordinated retries', async () => {
    mockUsageLedgerRepo.findReservationById.mockResolvedValueOnce({
      ...sampleReservation,
      state: 'DISPATCHED',
    });

    const res = await settleReservationUseCase.execute({
      reservationId: sampleReservation.id,
      attemptId: sampleAttempt.id,
      settlementKey: 'timeout-settle-01',
      outcome: 'TIMED_OUT',
      durationMs: 30_000,
      errorCode: 'SOCKET_TIMEOUT',
    });

    expect(res.attempt.operationalOutcome).toBe('TIMED_OUT');
    expect(res.reservation.state).toBe('HELD_FOR_RECONCILIATION');
    expect(res.ledgerEntry.entryType).toBe('UNKNOWN_OUTCOME_HOLD');
    expect(res.ledgerEntry.costKnowledge).toBe('UNKNOWN');

    mockUsageLedgerRepo.findReservationById.mockResolvedValueOnce({
      ...sampleReservation,
      state: 'HELD_FOR_RECONCILIATION',
    });
    const reconciled = await reconcileHeldUseCase.execute({
      reservationId: sampleReservation.id,
      settlementKey: 'rec-settle-01',
      confirmedAmount: 0.05,
      isCharged: true,
      reconciliationRef: 'INV-1234',
      costKnowledge: 'EXACT',
      actorUserId: 'usr-admin-001',
    });
    expect(reconciled.reservation.state).toBe('SETTLED');
    expect(reconciled.ledgerEntry.entryType).toBe('RECONCILIATION_CONFIRMED');
  });

  it('SEC-BUDGET-09: Cancellation after dispatch requires confirmed zero charge before release, otherwise enters HELD_FOR_RECONCILIATION', async () => {
    mockUsageLedgerRepo.findReservationById.mockResolvedValueOnce({
      ...sampleReservation,
      state: 'DISPATCHED',
    });

    // Unknown provider charge -> enters reconciliation hold
    const heldRes = await cancelReservationUseCase.execute({
      reservationId: sampleReservation.id,
      reason: 'Cancelled while network socket in flight',
      actorUserId: 'usr-employee-001',
      isConfirmedZeroCharge: false,
    });
    expect(heldRes.reservation.state).toBe('HELD_FOR_RECONCILIATION');
    expect(heldRes.ledgerEntry.entryType).toBe('UNKNOWN_OUTCOME_HOLD');

    mockUsageLedgerRepo.findReservationById.mockResolvedValueOnce({
      ...sampleReservation,
      state: 'DISPATCHED',
    });

    // Confirmed zero charge -> released
    const releasedRes = await cancelReservationUseCase.execute({
      reservationId: sampleReservation.id,
      reason: 'Cancelled with provider confirmed 0 charge',
      actorUserId: 'usr-employee-001',
      isConfirmedZeroCharge: true,
    });
    expect(releasedRes.reservation.state).toBe('RELEASED');
    expect(releasedRes.ledgerEntry.entryType).toBe('RESERVATION_RELEASED');
  });

  it('SEC-BUDGET-10: Zero-confirmed cost (costKnowledge = ZERO_CONFIRMED) is explicitly distinguished from unknown cost (costKnowledge = UNKNOWN)', async () => {
    mockUsageLedgerRepo.findReservationById.mockResolvedValueOnce({
      ...sampleReservation,
      state: 'DISPATCHED',
    });

    const zeroRes = await settleReservationUseCase.execute({
      reservationId: sampleReservation.id,
      attemptId: sampleAttempt.id,
      settlementKey: 'settle-zero-cli',
      outcome: 'SUCCEEDED',
      actualCost: 0,
      costKnowledge: 'ZERO_CONFIRMED',
    });
    expect(zeroRes.ledgerEntry.costKnowledge).toBe('ZERO_CONFIRMED');
    expect(zeroRes.ledgerEntry.amount).toBe(0);

    mockUsageLedgerRepo.findReservationById.mockResolvedValueOnce({
      ...sampleReservation,
      state: 'DISPATCHED',
    });

    const unkRes = await settleReservationUseCase.execute({
      reservationId: sampleReservation.id,
      attemptId: sampleAttempt.id,
      settlementKey: 'settle-unk-net',
      outcome: 'UNKNOWN_OUTCOME',
    });
    expect(unkRes.ledgerEntry.costKnowledge).toBe('UNKNOWN');
    expect(unkRes.ledgerEntry.entryType).toBe('UNKNOWN_OUTCOME_HOLD');
  });

  it('SEC-BUDGET-11: Pricing schedules without verified retrieval source provenance block paid dispatch fail-closed', async () => {
    mockUsageLedgerRepo.findReservationById.mockResolvedValueOnce({
      ...sampleReservation,
      state: 'DISPATCHED',
    });
    mockPricingRepo.findActivePricing.mockResolvedValueOnce(null); // Unverified pricing

    await expect(
      settleReservationUseCase.execute({
        reservationId: sampleReservation.id,
        attemptId: sampleAttempt.id,
        settlementKey: 'settle-unverified-pricing',
        outcome: 'SUCCEEDED',
        actualCost: 0.05,
        pricingVersionId: 'unverified-pricing-id',
      }),
    ).rejects.toThrow(UnverifiedPricingError);
  });

  it('SEC-BUDGET-12: Converted foreign currency postings record verified exchange-rate provenance', async () => {
    mockUsageLedgerRepo.findReservationById.mockResolvedValueOnce({
      ...sampleReservation,
      state: 'DISPATCHED',
    });

    // Missing exchangeRateSource blocks conversion fail-closed
    await expect(
      settleReservationUseCase.execute({
        reservationId: sampleReservation.id,
        attemptId: sampleAttempt.id,
        settlementKey: 'settle-eur-fx',
        outcome: 'SUCCEEDED',
        actualCost: 0.04,
        baseCurrency: 'USD',
        quoteCurrency: 'EUR',
        exchangeRate: 0.92,
      }),
    ).rejects.toThrow(ExchangeRateUnavailableError);
  });

  it('SEC-BUDGET-13: Text edits (EDIT_TEXT) and deterministic layout adjustments cost $0.00', () => {
    const editCost = routerService.evaluateOperationCost('EDIT_TEXT');
    expect(editCost.estimatedCost).toBe(0);
    expect(editCost.costKnowledge).toBe('ZERO_CONFIRMED');
    expect(editCost.isZeroCost).toBe(true);

    const relayoutCost = routerService.evaluateOperationCost('RELAYOUT');
    expect(relayoutCost.estimatedCost).toBe(0);
    expect(relayoutCost.costKnowledge).toBe('ZERO_CONFIRMED');
    expect(relayoutCost.isZeroCost).toBe(true);
  });

  it('SEC-BUDGET-14: Fallback to alternate providers never occurs without explicit policy authorization', async () => {
    mockBudgetPolicyRepo.getActivePolicy.mockResolvedValueOnce({
      ...defaultPolicy,
      allowedProviders: ['openai'], // Only openai is authorized as primary
      allowedFallbacks: [], // No fallbacks permitted
    });
    circuitBreaker.recordFailure('openai', 'TEXT');
    circuitBreaker.recordFailure('openai', 'TEXT');
    circuitBreaker.recordFailure('openai', 'TEXT'); // Open circuit

    await expect(
      routerService.selectProvider({
        modality: 'TEXT',
        capability: 'TEXT_GENERATION',
        preferredProviderId: 'openai',
      }),
    ).rejects.toThrow(UnauthorizedProviderFallbackError);
  });

  it('SEC-BUDGET-15: Safe prompt digests use keyed HMAC-SHA256 resolving secret keys from managed storage and preserve prompt whitespace', () => {
    const rawPromptWithWhitespace = '  Luxury French Perfume:\n    Notes of Rose and Vanilla.  ';
    const { safePromptDigest, digestAlgorithm, digestKeyVersion } = digestService.computeDigest({
      promptText: rawPromptWithWhitespace,
      provider: 'openai',
      model: 'gpt-4o',
    });

    expect(safePromptDigest).toHaveLength(64);
    expect(digestAlgorithm).toBe('HMAC-SHA256');
    expect(digestKeyVersion).toBe('2026-v1');

    // Canonical serialization preserves internal meaningful whitespace
    const canonical = digestService.canonicalSerialize({
      promptText: rawPromptWithWhitespace,
    });
    expect(canonical).toContain('Notes of Rose and Vanilla');
    expect(canonical).not.toContain('NotesofRoseandVanilla');
  });

  it('SEC-BUDGET-16: Circuit breaker modality independence ensures image provider failures never trip text generation', () => {
    circuitBreaker.recordFailure('openai', 'IMAGE');
    circuitBreaker.recordFailure('openai', 'IMAGE');
    circuitBreaker.recordFailure('openai', 'IMAGE'); // Tripped for IMAGE

    expect(() => circuitBreaker.assertHealthy('openai', 'IMAGE')).toThrow(
      ProviderCircuitBrokenError,
    );
    // TEXT must remain healthy and closed!
    expect(() => circuitBreaker.assertHealthy('openai', 'TEXT')).not.toThrow();
  });

  it('SEC-BUDGET-17: Circuit breaker half-open probe and recovery', () => {
    const t0 = 1000;
    circuitBreaker.recordFailure('openai', 'TEXT', t0);
    circuitBreaker.recordFailure('openai', 'TEXT', t0 + 10);
    circuitBreaker.recordFailure('openai', 'TEXT', t0 + 20); // Trips OPEN

    expect(circuitBreaker.getCircuitState('openai', 'TEXT', t0 + 30)).toBe('OPEN');

    // After probe interval (60s), state becomes HALF_OPEN
    const tProbe = t0 + 65_000;
    expect(circuitBreaker.getCircuitState('openai', 'TEXT', tProbe)).toBe('HALF_OPEN');

    // Successful execution in HALF_OPEN recovers circuit to CLOSED
    circuitBreaker.recordSuccess('openai', 'TEXT');
    expect(circuitBreaker.getCircuitState('openai', 'TEXT', tProbe + 100)).toBe('CLOSED');
  });

  it('SEC-BUDGET-18: Optimistic locking concurrency control on reservation updates', async () => {
    mockUsageLedgerRepo.findReservationById.mockResolvedValueOnce({
      ...sampleReservation,
      expiresAt: new Date(Date.now() - 5000), // Expired!
    });

    await expect(
      dispatchAttemptUseCase.execute({
        reservationId: sampleReservation.id,
        attemptNumber: 1,
        providerId: 'openai',
        modelId: 'gpt-4o',
        modality: 'TEXT',
        promptText: 'Generate description',
      }),
    ).rejects.toThrow(ReservationExpiredError);

    expect(mockUsageLedgerRepo.updateReservationState).toHaveBeenCalledWith(
      sampleReservation.id,
      'EXPIRED',
      sampleReservation.version,
      expect.any(Date),
    );
  });

  it('SEC-BUDGET-19: All domain events conform to DomainEventEnvelope with causality and policy version provenance', async () => {
    const result = await reserveBudgetUseCase.execute({
      idempotencyKey: 'idemp-envelope-check',
      estimatedCost: 0.05,
      providerId: 'openai',
      modelId: 'gpt-4o',
    });

    const event = result.event;
    expect(event.eventId).toBeDefined();
    expect(event.eventType).toBe('usage.reservation.created');
    expect(event.eventVersion).toBe('1.0.0');
    expect(event.aggregateType).toBe('UsageReservation');
    expect(event.aggregateId).toBe(result.reservation.id);
    expect(event.tenantId).toBe(result.reservation.tenantId);
    expect(event.occurredAt).toBeDefined();
    expect(event.recordedAt).toBeDefined();
    expect(event.correlationId).toBe('idemp-envelope-check');
    expect(event.causationId).toBe('idemp-envelope-check');
    expect(event.idempotencyKey).toBe(result.reservation.id);
    expect(event.policyVersionId).toBe(defaultPolicy.id);
  });

  it('SEC-BUDGET-20: Automatic destructive purge of financial ledger records is disabled by default and blocked until W03-DEC-016 is formally approved', () => {
    expect(() => purgeGovernanceService.assertPurgeAllowed()).toThrow(DestructivePurgeBlockedError);

    const status = purgeGovernanceService.evaluatePurgeStatus();
    expect(status.isPurgeAllowed).toBe(false);
    expect(status.decisionStatus).toBe('PROPOSED');
  });
});
