import { Injectable } from '@nestjs/common';
import type {
  AnalyticsDateRangeQuery,
  AnalyticsRepository,
  CampaignAnalytics,
  ContentAnalytics,
  CreativeAnalytics,
  OperationalKpis,
  PublishingAnalytics,
  AiUsageAnalytics,
} from '@parisian-shopper/application';
import { PrismaService } from '../prisma.service.js';

@Injectable()
export class PrismaAnalyticsRepository implements AnalyticsRepository {
  public constructor(private readonly prisma: PrismaService) {}

  private parseDateRange(query: AnalyticsDateRangeQuery): { startDate: Date; endDate: Date } {
    const now = new Date();
    // Default to last 30 days
    const defaultStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startDate = query.startDate ? new Date(query.startDate) : defaultStart;
    const endDate = query.endDate ? new Date(query.endDate) : now;

    // Safety bound: maximum 90 days query window to prevent denial-of-service
    const maxWindowMs = 90 * 24 * 60 * 60 * 1000;
    const adjustedEnd =
      endDate.getTime() - startDate.getTime() > maxWindowMs
        ? new Date(startDate.getTime() + maxWindowMs)
        : endDate;

    return { startDate, endDate: adjustedEnd };
  }

  public async getOverview(query: AnalyticsDateRangeQuery): Promise<OperationalKpis> {
    const { startDate, endDate } = this.parseDateRange(query);
    const dateFilter = { gte: startDate, lte: endDate };

    const [
      totalContentJobs,
      completedGenerations,
      failedGenerations,
      pendingReviews,
      approvedVersions,
      rejectedVersions,
      activeCampaigns,
      creativeProjects,
      publicationsDelivered,
      publicationsFailed,
      aiUsageAgg,
      aiReservationAgg,
      attemptUsageAgg,
    ] = await Promise.all([
      this.prisma.contentJob.count({ where: { createdAt: dateFilter } }),
      this.prisma.generationAttempt.count({
        where: { status: 'SUCCEEDED', startedAt: dateFilter },
      }),
      this.prisma.generationAttempt.count({
        where: { status: { in: ['FAILED', 'TIMED_OUT'] }, startedAt: dateFilter },
      }),
      this.prisma.contentJob.count({ where: { status: 'UNDER_REVIEW' } }),
      this.prisma.approvalEvent.count({
        where: { decision: 'APPROVED', createdAt: dateFilter },
      }),
      this.prisma.approvalEvent.count({
        where: { decision: 'REJECTED', createdAt: dateFilter },
      }),
      this.prisma.campaign.count({ where: { status: 'ACTIVE' } }),
      this.prisma.creativeJob.count({ where: { createdAt: dateFilter } }),
      this.prisma.publication.count({
        where: { status: 'PUBLISHED', publishedAt: dateFilter },
      }),
      this.prisma.publication.count({
        where: { status: 'FAILED', createdAt: dateFilter },
      }),
      this.prisma.aiUsageRecord.aggregate({
        where: { createdAt: dateFilter },
        _sum: { estimatedCost: true, confirmedCost: true },
      }),
      this.prisma.aiCostReservation.aggregate({
        where: { status: 'PENDING', expiresAt: { gt: new Date() } },
        _sum: { reservedAmount: true },
      }),
      this.prisma.generationAttempt.aggregate({
        where: { status: 'SUCCEEDED', startedAt: dateFilter },
        _sum: { estimatedCost: true },
      }),
    ]);

    const totalUsageEstimated =
      Number(aiUsageAgg._sum.estimatedCost ?? 0) || Number(attemptUsageAgg._sum.estimatedCost ?? 0);
    const confirmedAiCostUsd = Number(aiUsageAgg._sum.confirmedCost ?? 0);
    const reservedAiCostUsd = Number(aiReservationAgg._sum.reservedAmount ?? 0);

    return {
      totalContentJobs,
      completedGenerations,
      failedGenerations,
      pendingReviews,
      approvedVersions,
      rejectedVersions,
      activeCampaigns,
      creativeProjects,
      publicationsDelivered,
      publicationsFailed,
      totalAiCostUsd: totalUsageEstimated,
      confirmedAiCostUsd,
      reservedAiCostUsd,
      asOf: new Date().toISOString(),
    };
  }

  public async getContentAnalytics(query: AnalyticsDateRangeQuery): Promise<ContentAnalytics> {
    const { startDate, endDate } = this.parseDateRange(query);
    const dateFilter = { gte: startDate, lte: endDate };

    const [jobsByStatus, attemptStats, avgDuration, recentAttempts] = await Promise.all([
      this.prisma.contentJob.groupBy({
        by: ['status'],
        where: { createdAt: dateFilter },
        _count: { id: true },
      }),
      this.prisma.generationAttempt.groupBy({
        by: ['status'],
        where: { startedAt: dateFilter },
        _count: { id: true },
      }),
      this.prisma.generationAttempt.aggregate({
        where: { status: 'SUCCEEDED', startedAt: dateFilter },
        _avg: { latencyMs: true },
      }),
      this.prisma.generationAttempt.findMany({
        where: { startedAt: dateFilter },
        select: { startedAt: true, status: true },
        orderBy: { startedAt: 'asc' },
        take: 1000,
      }),
    ]);

    let totalJobs = 0;
    let draftJobs = 0;
    let generatingJobs = 0;
    let pendingReviewJobs = 0;
    let approvedJobs = 0;
    let rejectedJobs = 0;

    for (const item of jobsByStatus) {
      totalJobs += item._count.id;
      if (item.status === 'DRAFT') draftJobs = item._count.id;
      else if (item.status === 'GENERATING') generatingJobs = item._count.id;
      else if (item.status === 'UNDER_REVIEW') pendingReviewJobs = item._count.id;
      else if (item.status === 'APPROVED') approvedJobs = item._count.id;
      else if (item.status === 'REJECTED') rejectedJobs = item._count.id;
    }

    let totalAttempts = 0;
    let successfulAttempts = 0;
    let failedAttempts = 0;

    for (const item of attemptStats) {
      totalAttempts += item._count.id;
      if (item.status === 'SUCCEEDED') successfulAttempts = item._count.id;
      else if (item.status === 'FAILED' || item.status === 'TIMED_OUT')
        failedAttempts += item._count.id;
    }

    // Daily grouping
    const dailyMap = new Map<string, { created: number; succeeded: number; failed: number }>();
    for (const att of recentAttempts) {
      const day = att.startedAt.toISOString().slice(0, 10);
      const curr = dailyMap.get(day) ?? { created: 0, succeeded: 0, failed: 0 };
      curr.created += 1;
      if (att.status === 'SUCCEEDED') curr.succeeded += 1;
      else if (att.status === 'FAILED' || att.status === 'TIMED_OUT') curr.failed += 1;
      dailyMap.set(day, curr);
    }

    const dailyActivity = Array.from(dailyMap.entries()).map(([date, counts]) => ({
      date,
      created: counts.created,
      succeeded: counts.succeeded,
      failed: counts.failed,
    }));

    return {
      totalJobs,
      draftJobs,
      generatingJobs,
      pendingReviewJobs,
      approvedJobs,
      rejectedJobs,
      totalAttempts,
      successfulAttempts,
      failedAttempts,
      averageDurationMs: Math.round(avgDuration._avg.latencyMs ?? 0),
      dailyActivity,
    };
  }

  public async getCampaignAnalytics(query: AnalyticsDateRangeQuery): Promise<CampaignAnalytics> {
    const { startDate, endDate } = this.parseDateRange(query);
    const dateFilter = { gte: startDate, lte: endDate };

    const [campaignsByStatus, totalProducts, totalJobs, campaigns] = await Promise.all([
      this.prisma.campaign.groupBy({
        by: ['status'],
        where: { createdAt: dateFilter },
        _count: { id: true },
      }),
      this.prisma.campaignProduct.count(),
      this.prisma.contentJob.count({ where: { campaignId: { not: null } } }),
      this.prisma.campaign.findMany({
        where: { createdAt: dateFilter },
        include: {
          _count: {
            select: { products: true, contentJobs: true, publications: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    let totalCampaigns = 0;
    let draftCampaigns = 0;
    let plannedCampaigns = 0;
    let activeCampaigns = 0;
    let completedCampaigns = 0;
    let archivedCampaigns = 0;

    for (const item of campaignsByStatus) {
      totalCampaigns += item._count.id;
      if (item.status === 'DRAFT') draftCampaigns = item._count.id;
      else if (item.status === 'PLANNED') plannedCampaigns = item._count.id;
      else if (item.status === 'ACTIVE') activeCampaigns = item._count.id;
      else if (item.status === 'COMPLETED') completedCampaigns = item._count.id;
      else if (item.status === 'ARCHIVED') archivedCampaigns = item._count.id;
    }

    return {
      totalCampaigns,
      draftCampaigns,
      plannedCampaigns,
      activeCampaigns,
      completedCampaigns,
      archivedCampaigns,
      totalProductsAssociated: totalProducts,
      totalContentJobsAssociated: totalJobs,
      campaignsSummary: campaigns.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        status: c.status,
        productCount: c._count.products,
        contentJobCount: c._count.contentJobs,
        publicationCount: c._count.publications,
      })),
    };
  }

  public async getCreativeAnalytics(query: AnalyticsDateRangeQuery): Promise<CreativeAnalytics> {
    const { startDate, endDate } = this.parseDateRange(query);
    const dateFilter = { gte: startDate, lte: endDate };

    const [
      totalProjects,
      successfulRenders,
      failedRenders,
      approvedScenes,
      rejectedScenes,
      exportArtifacts,
      byFormatAgg,
    ] = await Promise.all([
      this.prisma.creativeJob.count({ where: { createdAt: dateFilter } }),
      this.prisma.visualAsset.count({ where: { createdAt: dateFilter } }),
      this.prisma.creativeJob.count({ where: { status: 'FAILED', createdAt: dateFilter } }),
      this.prisma.creativeApprovalEvent.count({
        where: { decision: 'CREATIVE_APPROVED', createdAt: dateFilter },
      }),
      this.prisma.creativeApprovalEvent.count({
        where: { decision: 'CREATIVE_REJECTED', createdAt: dateFilter },
      }),
      this.prisma.creativeExport.count({ where: { createdAt: dateFilter } }),
      this.prisma.creativeExport.groupBy({
        by: ['format'],
        where: { createdAt: dateFilter },
        _count: { id: true },
      }),
    ]);

    return {
      totalCreativeProjects: totalProjects,
      renderAttempts: totalProjects,
      successfulRenders,
      failedRenders,
      approvedScenes,
      rejectedScenes,
      exportArtifacts,
      byFormat: byFormatAgg.map((item) => ({
        format: item.format,
        count: item._count.id,
      })),
    };
  }

  public async getPublishingAnalytics(
    query: AnalyticsDateRangeQuery,
  ): Promise<PublishingAnalytics> {
    const { startDate, endDate } = this.parseDateRange(query);
    const dateFilter = { gte: startDate, lte: endDate };

    const [byStatusAgg, byChannelAgg, attemptStats] = await Promise.all([
      this.prisma.publication.groupBy({
        by: ['status'],
        where: { createdAt: dateFilter },
        _count: { id: true },
      }),
      this.prisma.publication.groupBy({
        by: ['destinationChannel', 'status'],
        where: { createdAt: dateFilter },
        _count: { id: true },
      }),
      this.prisma.publicationAttempt.groupBy({
        by: ['status'],
        where: { startedAt: dateFilter },
        _count: { id: true },
      }),
    ]);

    let totalPublications = 0;
    let draftPublications = 0;
    let readyPublications = 0;
    let queuedPublications = 0;
    let processingPublications = 0;
    let publishedCount = 0;
    let failedCount = 0;
    let cancelledCount = 0;
    let unknownOutcomes = 0;

    for (const item of byStatusAgg) {
      totalPublications += item._count.id;
      if (item.status === 'DRAFT') draftPublications = item._count.id;
      else if (item.status === 'READY') readyPublications = item._count.id;
      else if (item.status === 'QUEUED') queuedPublications = item._count.id;
      else if (item.status === 'PROCESSING') processingPublications = item._count.id;
      else if (item.status === 'PUBLISHED') publishedCount = item._count.id;
      else if (item.status === 'FAILED') failedCount = item._count.id;
      else if (item.status === 'CANCELLED') cancelledCount = item._count.id;
      else if (item.status === 'UNKNOWN_OUTCOME') unknownOutcomes = item._count.id;
    }

    const channelMap = new Map<string, { total: number; published: number; failed: number }>();
    for (const item of byChannelAgg) {
      const channel = item.destinationChannel;
      const curr = channelMap.get(channel) ?? { total: 0, published: 0, failed: 0 };
      curr.total += item._count.id;
      if (item.status === 'PUBLISHED') curr.published += item._count.id;
      else if (item.status === 'FAILED') curr.failed += item._count.id;
      channelMap.set(channel, curr);
    }

    const byChannel = Array.from(channelMap.entries()).map(([channel, stats]) => ({
      channel,
      total: stats.total,
      published: stats.published,
      failed: stats.failed,
    }));

    let attemptSuccess = 0;
    let attemptTotal = 0;
    for (const item of attemptStats) {
      attemptTotal += item._count.id;
      if (item.status === 'PUBLISHED') attemptSuccess += item._count.id;
    }

    const attemptSuccessRatePercent =
      attemptTotal > 0 ? Math.round((attemptSuccess / attemptTotal) * 1000) / 10 : 100;

    return {
      totalPublications,
      draftPublications,
      readyPublications,
      queuedPublications,
      processingPublications,
      publishedCount,
      failedCount,
      cancelledCount,
      unknownOutcomes,
      byChannel,
      attemptSuccessRatePercent,
    };
  }

  public async getAiUsageAnalytics(query: AnalyticsDateRangeQuery): Promise<AiUsageAnalytics> {
    const { startDate, endDate } = this.parseDateRange(query);
    const dateFilter = { gte: startDate, lte: endDate };

    const [attempts, aiUsageRecords, reservationAgg] = await Promise.all([
      this.prisma.generationAttempt.findMany({
        where: { startedAt: dateFilter },
        select: {
          id: true,
          provider: true,
          model: true,
          status: true,
          inputTokenCount: true,
          outputTokenCount: true,
          totalTokenCount: true,
          estimatedCost: true,
          startedAt: true,
        },
        orderBy: { startedAt: 'asc' },
        take: 2000,
      }),
      this.prisma.aiUsageRecord.findMany({
        where: { createdAt: dateFilter },
        select: {
          provider: true,
          model: true,
          inputTokens: true,
          outputTokens: true,
          totalTokens: true,
          estimatedCost: true,
          confirmedCost: true,
          costKnowledge: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
        take: 2000,
      }),
      this.prisma.aiCostReservation.aggregate({
        where: { status: 'PENDING', expiresAt: { gt: new Date() } },
        _sum: { reservedAmount: true },
      }),
    ]);

    const totalAttempts = attempts.length;
    let successfulAttempts = 0;
    let failedAttempts = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalTokens = 0;
    let estimatedCostUsd = 0;
    let confirmedCostUsd = 0;

    const providerModelMap = new Map<
      string,
      {
        provider: string;
        model: string;
        requests: number;
        inputTokens: number;
        outputTokens: number;
        estimatedCostUsd: number;
        confirmedCostUsd: number;
      }
    >();

    const dailyMap = new Map<
      string,
      { tokens: number; estimatedCostUsd: number; confirmedCostUsd: number; requests: number }
    >();

    // Process generation attempts
    for (const att of attempts) {
      if (att.status === 'SUCCEEDED') successfulAttempts += 1;
      else if (att.status === 'FAILED' || att.status === 'TIMED_OUT') failedAttempts += 1;

      const inputTok = att.inputTokenCount ?? 0;
      const outputTok = att.outputTokenCount ?? 0;
      const totalTok = att.totalTokenCount ?? inputTok + outputTok;
      const estCost = Number(att.estimatedCost ?? 0);

      totalInputTokens += inputTok;
      totalOutputTokens += outputTok;
      totalTokens += totalTok;
      estimatedCostUsd += estCost;

      const key = `${att.provider}:${att.model}`;
      const curr = providerModelMap.get(key) ?? {
        provider: att.provider,
        model: att.model,
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
        confirmedCostUsd: 0,
      };
      curr.requests += 1;
      curr.inputTokens += inputTok;
      curr.outputTokens += outputTok;
      curr.estimatedCostUsd += estCost;
      providerModelMap.set(key, curr);

      const day = att.startedAt.toISOString().slice(0, 10);
      const dayCurr = dailyMap.get(day) ?? {
        tokens: 0,
        estimatedCostUsd: 0,
        confirmedCostUsd: 0,
        requests: 0,
      };
      dayCurr.tokens += totalTok;
      dayCurr.estimatedCostUsd += estCost;
      dayCurr.requests += 1;
      dailyMap.set(day, dayCurr);
    }

    // Overlay usage records for confirmed costs and extra models
    for (const rec of aiUsageRecords) {
      const recConf = Number(rec.confirmedCost ?? 0);
      confirmedCostUsd += recConf;

      const key = `${rec.provider}:${rec.model}`;
      const curr = providerModelMap.get(key);
      if (curr) {
        curr.confirmedCostUsd += recConf;
      }

      const day = rec.createdAt.toISOString().slice(0, 10);
      const dayCurr = dailyMap.get(day);
      if (dayCurr) {
        dayCurr.confirmedCostUsd += recConf;
      }
    }

    return {
      totalAttempts,
      successfulAttempts,
      failedAttempts,
      totalInputTokens,
      totalOutputTokens,
      totalTokens,
      estimatedCostUsd: Math.round(estimatedCostUsd * 10000) / 10000,
      confirmedCostUsd: Math.round(confirmedCostUsd * 10000) / 10000,
      reservedCostUsd: Number(reservationAgg._sum.reservedAmount ?? 0),
      byProviderModel: Array.from(providerModelMap.values()),
      dailyUsage: Array.from(dailyMap.entries()).map(([date, d]) => ({
        date,
        tokens: d.tokens,
        estimatedCostUsd: Math.round(d.estimatedCostUsd * 10000) / 10000,
        confirmedCostUsd: Math.round(d.confirmedCostUsd * 10000) / 10000,
        requests: d.requests,
      })),
    };
  }
}
