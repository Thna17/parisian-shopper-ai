/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PrismaAnalyticsRepository } from './prisma-analytics.repository.js';
import { PrismaBudgetLedgerRepository } from './prisma-budget-ledger.repository.js';

type AsyncMock<T = unknown> = jest.MockedFunction<(...args: unknown[]) => Promise<T>>;

describe('PrismaAnalyticsRepository & PrismaBudgetLedgerRepository', () => {
  let mockPrisma: any;
  let analyticsRepo: PrismaAnalyticsRepository;
  let budgetRepo: PrismaBudgetLedgerRepository;

  beforeEach(() => {
    mockPrisma = {
      contentJob: {
        count: jest.fn<AsyncMock>().mockResolvedValue(10),
        groupBy: jest.fn<AsyncMock>().mockResolvedValue([
          { status: 'DRAFT', _count: { id: 2 } },
          { status: 'APPROVED', _count: { id: 8 } },
        ]),
      },
      generationAttempt: {
        count: jest.fn<AsyncMock>().mockResolvedValue(8),
        groupBy: jest
          .fn<AsyncMock>()
          .mockResolvedValue([{ status: 'SUCCEEDED', _count: { id: 8 } }]),
        aggregate: jest.fn<AsyncMock>().mockResolvedValue({
          _avg: { latencyMs: 1200 },
          _sum: { estimatedCost: 0.15 },
        }),
        findMany: jest.fn<AsyncMock>().mockResolvedValue([]),
      },
      approvalEvent: {
        count: jest.fn<AsyncMock>().mockResolvedValue(5),
      },
      campaign: {
        count: jest.fn<AsyncMock>().mockResolvedValue(3),
        groupBy: jest.fn<AsyncMock>().mockResolvedValue([
          { status: 'ACTIVE', _count: { id: 2 } },
          { status: 'DRAFT', _count: { id: 1 } },
        ]),
        findMany: jest.fn<AsyncMock>().mockResolvedValue([]),
      },
      campaignProduct: {
        count: jest.fn<AsyncMock>().mockResolvedValue(6),
      },
      creativeJob: {
        count: jest.fn<AsyncMock>().mockResolvedValue(4),
      },
      visualAsset: {
        count: jest.fn<AsyncMock>().mockResolvedValue(4),
      },
      creativeApprovalEvent: {
        count: jest.fn<AsyncMock>().mockResolvedValue(3),
      },
      creativeExport: {
        count: jest.fn<AsyncMock>().mockResolvedValue(5),
        groupBy: jest
          .fn<AsyncMock>()
          .mockResolvedValue([{ format: 'FEED_SQUARE', _count: { id: 5 } }]),
      },
      publication: {
        count: jest.fn<AsyncMock>().mockResolvedValue(2),
        groupBy: jest.fn<AsyncMock>().mockResolvedValue([
          { status: 'PUBLISHED', _count: { id: 2 } },
          { destinationChannel: 'MANUAL_EXPORT', status: 'PUBLISHED', _count: { id: 2 } },
        ]),
      },
      publicationAttempt: {
        groupBy: jest
          .fn<AsyncMock>()
          .mockResolvedValue([{ status: 'PUBLISHED', _count: { id: 2 } }]),
      },
      aiUsageRecord: {
        aggregate: jest.fn<AsyncMock>().mockResolvedValue({
          _sum: { estimatedCost: 0.25, confirmedCost: 0.1 },
        }),
        findMany: jest.fn<AsyncMock>().mockResolvedValue([]),
        count: jest.fn<AsyncMock>().mockResolvedValue(0),
        create: jest.fn<AsyncMock>().mockResolvedValue({
          id: 'u-1',
          reservationId: 'res-1',
          provider: 'openai',
          model: 'gpt-4o',
          estimatedCost: 0.05,
          currency: 'USD',
          costKnowledge: 'ESTIMATED',
          reconciliationStatus: 'SETTLED',
          createdAt: new Date(),
          settledAt: new Date(),
        }),
        update: jest.fn<AsyncMock>().mockResolvedValue({}),
      },
      aiCostReservation: {
        aggregate: jest.fn<AsyncMock>().mockResolvedValue({
          _sum: { reservedAmount: 0.05 },
        }),
        findUnique: jest.fn<AsyncMock>().mockResolvedValue(null),
        findMany: jest.fn<AsyncMock>().mockResolvedValue([]),
        create: jest.fn<AsyncMock>().mockResolvedValue({
          id: 'res-1',
          budgetPolicyId: 'pol-1',
          idempotencyKey: 'idemp-1',
          reservedAmount: 0.05,
          currency: 'USD',
          status: 'PENDING',
          expiresAt: new Date(),
          settledAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        update: jest.fn<AsyncMock>().mockResolvedValue({}),
      },
      aiBudgetPolicy: {
        findFirst: jest.fn<AsyncMock>().mockResolvedValue({
          id: 'pol-1',
          scope: 'MONTHLY',
          currency: 'USD',
          monthlyCeiling: 20.0,
          perRequestCeiling: 2.0,
          softAlertThreshold: 80.0,
          effectiveFrom: new Date(),
          effectiveTo: null,
          status: 'ACTIVE',
          createdById: 'admin-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        findUnique: jest.fn<AsyncMock>().mockResolvedValue({
          id: 'pol-1',
          scope: 'MONTHLY',
          currency: 'USD',
          monthlyCeiling: 20.0,
          perRequestCeiling: 2.0,
          softAlertThreshold: 80.0,
          effectiveFrom: new Date(),
          effectiveTo: null,
          status: 'ACTIVE',
          createdById: 'admin-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        findMany: jest.fn<AsyncMock>().mockResolvedValue([]),
        create: jest.fn<AsyncMock>().mockResolvedValue({
          id: 'pol-1',
          scope: 'MONTHLY',
          currency: 'USD',
          monthlyCeiling: 20.0,
          perRequestCeiling: 2.0,
          softAlertThreshold: 80.0,
          effectiveFrom: new Date(),
          effectiveTo: null,
          status: 'ACTIVE',
          createdById: 'admin-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        update: jest.fn<AsyncMock>().mockResolvedValue({}),
      },
      $transaction: jest.fn<any>().mockImplementation(async (cb: any) => await cb(mockPrisma)),
    };

    analyticsRepo = new PrismaAnalyticsRepository(mockPrisma);
    budgetRepo = new PrismaBudgetLedgerRepository(mockPrisma);
  });

  it('aggregates overview metrics from database records', async () => {
    const kpis = await analyticsRepo.getOverview({});
    expect(kpis.totalContentJobs).toBe(10);
    expect(kpis.completedGenerations).toBe(8);
    expect(kpis.activeCampaigns).toBe(3);
    expect(kpis.publicationsDelivered).toBe(2);
    expect(kpis.totalAiCostUsd).toBe(0.25);
  });

  it('aggregates content studio analytics by status', async () => {
    const res = await analyticsRepo.getContentAnalytics({});
    expect(res.totalJobs).toBe(10);
    expect(res.approvedJobs).toBe(8);
    expect(res.draftJobs).toBe(2);
  });

  it('calculates budget utilization accurately', async () => {
    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));

    const util = await budgetRepo.getBudgetUtilization('pol-1', periodStart, periodEnd);
    expect(util.policyId).toBe('pol-1');
    expect(util.monthlyCeiling).toBe(20.0);
    expect(util.totalCommittedCostUsd).toBeGreaterThanOrEqual(0);
    expect(util.isExhausted).toBe(false);
  });

  it('atomically reserves budget in serializable transaction', async () => {
    const reservation = await budgetRepo.reserveBudget({
      idempotencyKey: 'idemp-atomic-1',
      estimatedMaxCost: 0.05,
    });
    expect(reservation.id).toBe('res-1');
    expect(reservation.status).toBe('PENDING');
  });

  it('settles reservation and writes usage ledger record', async () => {
    mockPrisma.aiCostReservation.findUnique.mockResolvedValueOnce({
      id: 'res-1',
      reservedAmount: 0.05,
    });

    const usage = await budgetRepo.settleReservation({
      reservationId: 'res-1',
      provider: 'openai',
      model: 'gpt-4o',
      actualCost: 0.035,
    });
    expect(usage.id).toBe('u-1');
    expect(usage.reconciliationStatus).toBe('SETTLED');
  });
});
