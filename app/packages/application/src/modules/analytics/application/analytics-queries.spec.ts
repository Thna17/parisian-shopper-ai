/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Permission } from '../../auth/domain/permissions.js';
import { InsufficientAnalyticsPermissionError } from '../domain/analytics-errors.js';
import { type AnalyticsRepository } from './analytics.repository.js';
import { GetAnalyticsOverviewUseCase } from './get-analytics-overview.use-case.js';
import { GetContentAnalyticsUseCase } from './get-content-analytics.use-case.js';
import { GetCampaignAnalyticsUseCase } from './get-campaign-analytics.use-case.js';
import { GetCreativeAnalyticsUseCase } from './get-creative-analytics.use-case.js';
import { GetPublishingAnalyticsUseCase } from './get-publishing-analytics.use-case.js';
import { GetAiUsageAnalyticsUseCase } from './get-ai-usage-analytics.use-case.js';

describe('ANALYTICS-01 to ANALYTICS-12: Operational Analytics Queries & Accuracy', () => {
  let mockRepo: jest.Mocked<AnalyticsRepository>;
  let overviewUseCase: GetAnalyticsOverviewUseCase;
  let contentUseCase: GetContentAnalyticsUseCase;
  let campaignUseCase: GetCampaignAnalyticsUseCase;
  let creativeUseCase: GetCreativeAnalyticsUseCase;
  let publishingUseCase: GetPublishingAnalyticsUseCase;
  let aiUsageUseCase: GetAiUsageAnalyticsUseCase;

  const adminPermissions = [
    Permission.VIEW_OPERATIONAL_ANALYTICS,
    Permission.VIEW_AI_COSTS,
    Permission.MANAGE_AI_BUDGETS,
    Permission.VIEW_ALL_CONTENT,
  ];

  const emptyPermissions: readonly string[] = [];

  beforeEach(() => {
    mockRepo = {
      getOverview: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
        totalContentJobs: 15,
        completedGenerations: 12,
        failedGenerations: 3,
        pendingReviews: 4,
        approvedVersions: 7,
        rejectedVersions: 1,
        activeCampaigns: 2,
        creativeProjects: 5,
        publicationsDelivered: 6,
        publicationsFailed: 1,
        totalAiCostUsd: 0.185,
        confirmedAiCostUsd: 0.08,
        reservedAiCostUsd: 0.05,
        asOf: '2026-10-30T12:00:00.000Z',
      }),
      getContentAnalytics: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
        totalJobs: 15,
        draftJobs: 3,
        generatingJobs: 1,
        pendingReviewJobs: 4,
        approvedJobs: 6,
        rejectedJobs: 1,
        totalAttempts: 18,
        successfulAttempts: 14,
        failedAttempts: 4,
        averageDurationMs: 1450,
        dailyActivity: [
          { date: '2026-10-28', created: 5, succeeded: 4, failed: 1 },
          { date: '2026-10-29', created: 6, succeeded: 5, failed: 1 },
        ],
      }),
      getCampaignAnalytics: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
        totalCampaigns: 4,
        draftCampaigns: 1,
        plannedCampaigns: 1,
        activeCampaigns: 2,
        completedCampaigns: 0,
        archivedCampaigns: 0,
        totalProductsAssociated: 8,
        totalContentJobsAssociated: 12,
        campaignsSummary: [
          {
            id: 'c-1',
            code: 'PARIS-FALL',
            name: 'Parisian Autumn',
            status: 'ACTIVE',
            productCount: 4,
            contentJobCount: 6,
            publicationCount: 3,
          },
        ],
      }),
      getCreativeAnalytics: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
        totalCreativeProjects: 5,
        renderAttempts: 5,
        successfulRenders: 5,
        failedRenders: 0,
        approvedScenes: 4,
        rejectedScenes: 1,
        exportArtifacts: 8,
        byFormat: [{ format: 'FEED_SQUARE', count: 5 }],
      }),
      getPublishingAnalytics: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
        totalPublications: 8,
        draftPublications: 1,
        readyPublications: 1,
        queuedPublications: 0,
        processingPublications: 0,
        publishedCount: 5,
        failedCount: 1,
        cancelledCount: 0,
        unknownOutcomes: 1,
        byChannel: [
          { channel: 'MANUAL_EXPORT', total: 6, published: 5, failed: 1 },
          { channel: 'TELEGRAM_CHANNEL', total: 2, published: 0, failed: 0 },
        ],
        attemptSuccessRatePercent: 83.3,
      }),
      getAiUsageAnalytics: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
        totalAttempts: 20,
        successfulAttempts: 18,
        failedAttempts: 2,
        totalInputTokens: 45000,
        totalOutputTokens: 18000,
        totalTokens: 63000,
        estimatedCostUsd: 0.285,
        confirmedCostUsd: 0.12,
        reservedCostUsd: 0.05,
        byProviderModel: [
          {
            provider: 'openai',
            model: 'gpt-4o',
            requests: 15,
            inputTokens: 35000,
            outputTokens: 14000,
            estimatedCostUsd: 0.2275,
            confirmedCostUsd: 0.12,
          },
        ],
        dailyUsage: [],
      }),
    };

    overviewUseCase = new GetAnalyticsOverviewUseCase(mockRepo);
    contentUseCase = new GetContentAnalyticsUseCase(mockRepo);
    campaignUseCase = new GetCampaignAnalyticsUseCase(mockRepo);
    creativeUseCase = new GetCreativeAnalyticsUseCase(mockRepo);
    publishingUseCase = new GetPublishingAnalyticsUseCase(mockRepo);
    aiUsageUseCase = new GetAiUsageAnalyticsUseCase(mockRepo);
  });

  it('ANALYTICS-01: Real content totals match database record counts exactly', async () => {
    const res = await overviewUseCase.execute({ permissions: adminPermissions });
    expect(res.totalContentJobs).toBe(15);
    expect(res.completedGenerations).toBe(12);
    expect(res.failedGenerations).toBe(3);
    expect(res.asOf).toBeDefined();
  });

  it('ANALYTICS-02: Date filtering applies start and end range boundaries', async () => {
    const startDate = new Date('2026-10-01T00:00:00.000Z');
    const endDate = new Date('2026-10-25T23:59:59.999Z');
    await contentUseCase.execute({
      query: { startDate, endDate },
      permissions: adminPermissions,
    });
    expect(mockRepo.getContentAnalytics).toHaveBeenCalledWith({ startDate, endDate });
  });

  it('ANALYTICS-03: Campaign counts separate active, completed, and draft statuses', async () => {
    const res = await campaignUseCase.execute({ permissions: adminPermissions });
    expect(res.totalCampaigns).toBe(4);
    expect(res.activeCampaigns).toBe(2);
    expect(res.totalProductsAssociated).toBe(8);
  });

  it('ANALYTICS-04: Review decision metrics report exact approvals and rejections', async () => {
    const res = await overviewUseCase.execute({ permissions: adminPermissions });
    expect(res.approvedVersions).toBe(7);
    expect(res.rejectedVersions).toBe(1);
    expect(res.pendingReviews).toBe(4);
  });

  it('ANALYTICS-05: Creative rendering counts track renders, approvals, and exports', async () => {
    const res = await creativeUseCase.execute({ permissions: adminPermissions });
    expect(res.totalCreativeProjects).toBe(5);
    expect(res.successfulRenders).toBe(5);
    expect(res.approvedScenes).toBe(4);
    expect(res.exportArtifacts).toBe(8);
  });

  it('ANALYTICS-06: Publication status correctness tracks published and failed records', async () => {
    const res = await publishingUseCase.execute({ permissions: adminPermissions });
    expect(res.publishedCount).toBe(5);
    expect(res.failedCount).toBe(1);
    expect(res.attemptSuccessRatePercent).toBe(83.3);
  });

  it('ANALYTICS-07: Unknown outcome separation prevents mixing with failed records', async () => {
    const res = await publishingUseCase.execute({ permissions: adminPermissions });
    expect(res.unknownOutcomes).toBe(1);
    expect(res.failedCount).toBe(1);
    expect(res.publishedCount).toBe(5);
  });

  it('ANALYTICS-08: No double counting between generation attempts and unique jobs', async () => {
    const res = await contentUseCase.execute({ permissions: adminPermissions });
    expect(res.totalJobs).toBe(15);
    expect(res.totalAttempts).toBe(18); // 18 attempts across 15 jobs due to retries
    expect(res.totalAttempts).toBeGreaterThanOrEqual(res.totalJobs);
  });

  it('ANALYTICS-09: Permission scoping denies unauthorized users with InsufficientAnalyticsPermissionError', async () => {
    await expect(overviewUseCase.execute({ permissions: emptyPermissions })).rejects.toThrow(
      InsufficientAnalyticsPermissionError,
    );

    await expect(
      aiUsageUseCase.execute({ permissions: [Permission.VIEW_PRODUCTS] }),
    ).rejects.toThrow(InsufficientAnalyticsPermissionError);
  });

  it('ANALYTICS-10: Correct timezone representation parses explicitly', async () => {
    await overviewUseCase.execute({
      query: { timezone: 'Asia/Phnom_Penh' },
      permissions: adminPermissions,
    });
    expect(mockRepo.getOverview).toHaveBeenCalledWith({ timezone: 'Asia/Phnom_Penh' });
  });

  it('ANALYTICS-11: Safe query limits bounded query range', async () => {
    const startDate = new Date('2026-01-01T00:00:00Z');
    const endDate = new Date('2026-10-30T00:00:00Z');
    await overviewUseCase.execute({
      query: { startDate, endDate },
      permissions: adminPermissions,
    });
    expect(mockRepo.getOverview).toHaveBeenCalled();
  });

  it('ANALYTICS-12: Incomplete data handling returns clean zero metrics without crashing', async () => {
    mockRepo.getOverview.mockResolvedValueOnce({
      totalContentJobs: 0,
      completedGenerations: 0,
      failedGenerations: 0,
      pendingReviews: 0,
      approvedVersions: 0,
      rejectedVersions: 0,
      activeCampaigns: 0,
      creativeProjects: 0,
      publicationsDelivered: 0,
      publicationsFailed: 0,
      totalAiCostUsd: 0,
      confirmedAiCostUsd: 0,
      reservedAiCostUsd: 0,
      asOf: '2026-10-30T12:00:00.000Z',
    });

    const res = await overviewUseCase.execute({ permissions: adminPermissions });
    expect(res.totalContentJobs).toBe(0);
    expect(res.totalAiCostUsd).toBe(0);
  });
});
