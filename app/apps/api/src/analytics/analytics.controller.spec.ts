/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type {
  GetActiveBudgetUseCase,
  GetAiUsageAnalyticsUseCase,
  GetAnalyticsOverviewUseCase,
  GetCampaignAnalyticsUseCase,
  GetContentAnalyticsUseCase,
  GetCreativeAnalyticsUseCase,
  GetPublishingAnalyticsUseCase,
  ListCostLedgerUseCase,
  ListUnreconciledUsageUseCase,
  ManageBudgetUseCase,
  ReconcileAiUsageUseCase,
  SanitizedEmployeeDto,
} from '@parisian-shopper/application';
import { Permission } from '@parisian-shopper/application';
import { AnalyticsController } from './analytics.controller.js';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let mockOverviewUseCase: jest.Mocked<GetAnalyticsOverviewUseCase>;
  let mockContentAnalyticsUseCase: jest.Mocked<GetContentAnalyticsUseCase>;
  let mockCampaignAnalyticsUseCase: jest.Mocked<GetCampaignAnalyticsUseCase>;
  let mockCreativeAnalyticsUseCase: jest.Mocked<GetCreativeAnalyticsUseCase>;
  let mockPublishingAnalyticsUseCase: jest.Mocked<GetPublishingAnalyticsUseCase>;
  let mockAiUsageAnalyticsUseCase: jest.Mocked<GetAiUsageAnalyticsUseCase>;
  let mockActiveBudgetUseCase: jest.Mocked<GetActiveBudgetUseCase>;
  let mockManageBudgetUseCase: jest.Mocked<ManageBudgetUseCase>;
  let mockListCostLedgerUseCase: jest.Mocked<ListCostLedgerUseCase>;
  let mockListUnreconciledUsageUseCase: jest.Mocked<ListUnreconciledUsageUseCase>;
  let mockReconcileAiUsageUseCase: jest.Mocked<ReconcileAiUsageUseCase>;

  const mockAdminEmployee: SanitizedEmployeeDto = {
    id: 'emp-admin-001',
    displayName: 'Admin User',
    status: 'ACTIVE',
    roles: ['ADMIN'],
    permissions: [
      Permission.VIEW_OPERATIONAL_ANALYTICS,
      Permission.VIEW_AI_COSTS,
      Permission.MANAGE_AI_BUDGETS,
    ],
  };

  beforeEach(() => {
    mockOverviewUseCase = {
      execute: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
        totalContentJobs: 10,
        completedGenerations: 8,
        failedGenerations: 2,
        pendingReviews: 3,
        approvedVersions: 5,
        rejectedVersions: 1,
        activeCampaigns: 2,
        creativeProjects: 4,
        publicationsDelivered: 3,
        publicationsFailed: 0,
        totalAiCostUsd: 0.125,
        confirmedAiCostUsd: 0.05,
        reservedAiCostUsd: 0.05,
        asOf: '2026-10-30T10:00:00.000Z',
      }),
    } as any;

    mockContentAnalyticsUseCase = {
      execute: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
        totalJobs: 10,
        draftJobs: 2,
        generatingJobs: 0,
        pendingReviewJobs: 3,
        approvedJobs: 4,
        rejectedJobs: 1,
        totalAttempts: 12,
        successfulAttempts: 10,
        failedAttempts: 2,
        averageDurationMs: 1250,
        dailyActivity: [],
      }),
    } as any;

    mockCampaignAnalyticsUseCase = {
      execute: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
        totalCampaigns: 3,
        draftCampaigns: 1,
        plannedCampaigns: 0,
        activeCampaigns: 2,
        completedCampaigns: 0,
        archivedCampaigns: 0,
        totalProductsAssociated: 5,
        totalContentJobsAssociated: 8,
        campaignsSummary: [],
      }),
    } as any;

    mockCreativeAnalyticsUseCase = {
      execute: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
        totalCreativeProjects: 4,
        renderAttempts: 4,
        successfulRenders: 4,
        failedRenders: 0,
        approvedScenes: 3,
        rejectedScenes: 1,
        exportArtifacts: 6,
        byFormat: [],
      }),
    } as any;

    mockPublishingAnalyticsUseCase = {
      execute: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
        totalPublications: 5,
        draftPublications: 1,
        readyPublications: 1,
        queuedPublications: 0,
        processingPublications: 0,
        publishedCount: 3,
        failedCount: 0,
        cancelledCount: 0,
        unknownOutcomes: 0,
        byChannel: [],
        attemptSuccessRatePercent: 100,
      }),
    } as any;

    mockAiUsageAnalyticsUseCase = {
      execute: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
        totalAttempts: 15,
        successfulAttempts: 14,
        failedAttempts: 1,
        totalInputTokens: 30000,
        totalOutputTokens: 12000,
        totalTokens: 42000,
        estimatedCostUsd: 0.195,
        confirmedCostUsd: 0.08,
        reservedCostUsd: 0.05,
        byProviderModel: [],
        dailyUsage: [],
      }),
    } as any;

    mockActiveBudgetUseCase = {
      execute: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
        policyId: 'pol-001',
        currency: 'USD',
        monthlyCeiling: 20.0,
        perRequestCeiling: 2.0,
        softAlertThreshold: 80.0,
        periodStart: '2026-10-01T00:00:00.000Z',
        periodEnd: '2026-10-31T23:59:59.999Z',
        settledCostUsd: 1.45,
        activeReservedCostUsd: 0.1,
        unreconciledExposureUsd: 0,
        totalCommittedCostUsd: 1.55,
        remainingHeadroomUsd: 18.45,
        utilizationPercent: 7.75,
        isExhausted: false,
        isSoftAlertTriggered: false,
        asOf: '2026-10-30T10:00:00.000Z',
      }),
    } as any;

    mockManageBudgetUseCase = {
      create: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
        id: 'pol-002',
        scope: 'MONTHLY',
        currency: 'USD',
        monthlyCeiling: 25.0,
        perRequestCeiling: 2.5,
        softAlertThreshold: 85.0,
        effectiveFrom: new Date(),
        effectiveTo: null,
        status: 'ACTIVE',
        createdById: mockAdminEmployee.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      update: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
        id: 'pol-001',
        scope: 'MONTHLY',
        currency: 'USD',
        monthlyCeiling: 30.0,
        perRequestCeiling: 3.0,
        softAlertThreshold: 80.0,
        effectiveFrom: new Date(),
        effectiveTo: null,
        status: 'ACTIVE',
        createdById: mockAdminEmployee.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      list: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue([]),
    } as any;

    mockListCostLedgerUseCase = {
      execute: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      }),
    } as any;

    mockListUnreconciledUsageUseCase = {
      execute: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue([]),
    } as any;

    mockReconcileAiUsageUseCase = {
      execute: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
        id: 'rec-001',
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
    } as any;

    controller = new AnalyticsController(
      mockOverviewUseCase,
      mockContentAnalyticsUseCase,
      mockCampaignAnalyticsUseCase,
      mockCreativeAnalyticsUseCase,
      mockPublishingAnalyticsUseCase,
      mockAiUsageAnalyticsUseCase,
      mockActiveBudgetUseCase,
      mockManageBudgetUseCase,
      mockListCostLedgerUseCase,
      mockListUnreconciledUsageUseCase,
      mockReconcileAiUsageUseCase,
    );
  });

  it('GET /overview returns operational KPIs', async () => {
    const result = await controller.getOverview(mockAdminEmployee, {});
    expect(result.totalContentJobs).toBe(10);
    expect(result.completedGenerations).toBe(8);
    expect(mockOverviewUseCase.execute).toHaveBeenCalled();
  });

  it('GET /content returns content operations metrics', async () => {
    const result = await controller.getContent(mockAdminEmployee, {});
    expect(result.totalJobs).toBe(10);
    expect(result.approvedJobs).toBe(4);
    expect(mockContentAnalyticsUseCase.execute).toHaveBeenCalled();
  });

  it('GET /campaigns returns campaign metrics', async () => {
    const result = await controller.getCampaigns(mockAdminEmployee, {});
    expect(result.totalCampaigns).toBe(3);
    expect(result.activeCampaigns).toBe(2);
    expect(mockCampaignAnalyticsUseCase.execute).toHaveBeenCalled();
  });

  it('GET /creative returns creative studio metrics', async () => {
    const result = await controller.getCreative(mockAdminEmployee, {});
    expect(result.totalCreativeProjects).toBe(4);
    expect(result.approvedScenes).toBe(3);
    expect(mockCreativeAnalyticsUseCase.execute).toHaveBeenCalled();
  });

  it('GET /publishing returns distribution metrics', async () => {
    const result = await controller.getPublishing(mockAdminEmployee, {});
    expect(result.totalPublications).toBe(5);
    expect(result.publishedCount).toBe(3);
    expect(mockPublishingAnalyticsUseCase.execute).toHaveBeenCalled();
  });

  it('GET /ai-usage returns model and token metrics', async () => {
    const result = await controller.getAiUsage(mockAdminEmployee, {});
    expect(result.totalTokens).toBe(42000);
    expect(result.estimatedCostUsd).toBe(0.195);
    expect(mockAiUsageAnalyticsUseCase.execute).toHaveBeenCalled();
  });

  it('GET /budgets returns active policy and utilization', async () => {
    const result = await controller.getBudgetUtilization(mockAdminEmployee);
    expect(result.monthlyCeiling).toBe(20.0);
    expect(result.remainingHeadroomUsd).toBe(18.45);
    expect(result.isExhausted).toBe(false);
  });

  it('POST /budgets creates a new budget policy', async () => {
    const result = await controller.createBudget(mockAdminEmployee, {
      monthlyCeiling: 25.0,
      perRequestCeiling: 2.5,
    });
    expect(result.id).toBe('pol-002');
    expect(mockManageBudgetUseCase.create).toHaveBeenCalled();
  });

  it('PATCH /budgets/:id updates an existing budget policy', async () => {
    const result = await controller.updateBudget(mockAdminEmployee, 'pol-001', {
      monthlyCeiling: 30.0,
    });
    expect(result.id).toBe('pol-001');
    expect(mockManageBudgetUseCase.update).toHaveBeenCalled();
  });

  it('GET /cost-ledger returns paginated cost ledger', async () => {
    const result = await controller.getCostLedger(mockAdminEmployee, { page: 1, limit: 20 });
    expect(result.total).toBe(0);
    expect(mockListCostLedgerUseCase.execute).toHaveBeenCalled();
  });

  it('GET /unreconciled returns unreconciled usage records', async () => {
    const result = await controller.getUnreconciled(mockAdminEmployee);
    expect(Array.isArray(result)).toBe(true);
    expect(mockListUnreconciledUsageUseCase.execute).toHaveBeenCalled();
  });

  it('POST /cost-ledger/:id/reconcile reconciles an unreconciled usage record', async () => {
    const result = await controller.reconcile(mockAdminEmployee, 'rec-001', {
      resolution: 'MANUAL_ADJUSTMENT',
      confirmedCost: 0.04,
      notes: 'Reconciled from invoice',
    });
    expect(result.reconciliationStatus).toBe('MANUALLY_RECONCILED');
    expect(mockReconcileAiUsageUseCase.execute).toHaveBeenCalled();
  });
});
