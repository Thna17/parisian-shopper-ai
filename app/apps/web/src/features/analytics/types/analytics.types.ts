export interface DateRangeParams {
  readonly startDate?: string;
  readonly endDate?: string;
  readonly timezone?: string;
}

export interface OperationalKpis {
  readonly totalContentJobs: number;
  readonly completedGenerations: number;
  readonly failedGenerations: number;
  readonly pendingReviews: number;
  readonly approvedVersions: number;
  readonly rejectedVersions: number;
  readonly activeCampaigns: number;
  readonly creativeProjects: number;
  readonly publicationsDelivered: number;
  readonly publicationsFailed: number;
  readonly totalAiCostUsd: number;
  readonly confirmedAiCostUsd: number;
  readonly reservedAiCostUsd: number;
  readonly asOf: string;
}

export interface ContentAnalytics {
  readonly totalJobs: number;
  readonly draftJobs: number;
  readonly generatingJobs: number;
  readonly pendingReviewJobs: number;
  readonly approvedJobs: number;
  readonly rejectedJobs: number;
  readonly totalAttempts: number;
  readonly successfulAttempts: number;
  readonly failedAttempts: number;
  readonly averageDurationMs: number;
  readonly dailyActivity: readonly {
    readonly date: string;
    readonly created: number;
    readonly succeeded: number;
    readonly failed: number;
  }[];
}

export interface CampaignSummaryItem {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: string;
  readonly productCount: number;
  readonly contentJobCount: number;
  readonly publicationCount: number;
}

export interface CampaignAnalytics {
  readonly totalCampaigns: number;
  readonly draftCampaigns: number;
  readonly plannedCampaigns: number;
  readonly activeCampaigns: number;
  readonly completedCampaigns: number;
  readonly archivedCampaigns: number;
  readonly totalProductsAssociated: number;
  readonly totalContentJobsAssociated: number;
  readonly campaignsSummary: readonly CampaignSummaryItem[];
}

export interface CreativeAnalytics {
  readonly totalCreativeProjects: number;
  readonly renderAttempts: number;
  readonly successfulRenders: number;
  readonly failedRenders: number;
  readonly approvedScenes: number;
  readonly rejectedScenes: number;
  readonly exportArtifacts: number;
  readonly byFormat: readonly {
    readonly format: string;
    readonly count: number;
  }[];
}

export interface PublishingAnalytics {
  readonly totalPublications: number;
  readonly draftPublications: number;
  readonly readyPublications: number;
  readonly queuedPublications: number;
  readonly processingPublications: number;
  readonly publishedCount: number;
  readonly failedCount: number;
  readonly cancelledCount: number;
  readonly unknownOutcomes: number;
  readonly byChannel: readonly {
    readonly channel: string;
    readonly total: number;
    readonly published: number;
    readonly failed: number;
  }[];
  readonly attemptSuccessRatePercent: number;
}

export interface AiUsageAnalytics {
  readonly totalAttempts: number;
  readonly successfulAttempts: number;
  readonly failedAttempts: number;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly totalTokens: number;
  readonly estimatedCostUsd: number;
  readonly confirmedCostUsd: number;
  readonly reservedCostUsd: number;
  readonly byProviderModel: readonly {
    readonly provider: string;
    readonly model: string;
    readonly requests: number;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly estimatedCostUsd: number;
    readonly confirmedCostUsd: number;
  }[];
  readonly dailyUsage: readonly {
    readonly date: string;
    readonly tokens: number;
    readonly estimatedCostUsd: number;
    readonly confirmedCostUsd: number;
    readonly requests: number;
  }[];
}

export interface BudgetUtilization {
  readonly policyId: string;
  readonly currency: string;
  readonly monthlyCeiling: number;
  readonly perRequestCeiling: number;
  readonly softAlertThreshold: number;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly settledCostUsd: number;
  readonly activeReservedCostUsd: number;
  readonly unreconciledExposureUsd: number;
  readonly totalCommittedCostUsd: number;
  readonly remainingHeadroomUsd: number;
  readonly utilizationPercent: number;
  readonly isExhausted: boolean;
  readonly isSoftAlertTriggered: boolean;
  readonly asOf: string;
}

export interface CostLedgerItem {
  readonly id: string;
  readonly type: 'RESERVATION' | 'USAGE';
  readonly referenceId: string;
  readonly provider: string;
  readonly model: string;
  readonly status: string;
  readonly costKnowledge: string;
  readonly amountUsd: number;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly idempotencyKey?: string;
  readonly createdAt: string;
}

export interface PaginatedCostLedger {
  readonly items: readonly CostLedgerItem[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
}

export interface UnreconciledUsage {
  readonly reservationId: string;
  readonly idempotencyKey: string;
  readonly contentJobId: string | null;
  readonly creativeJobId: string | null;
  readonly reservedAmount: number;
  readonly status: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly reason: string;
}

export interface CostLedgerFilterParams {
  readonly page?: number;
  readonly limit?: number;
  readonly provider?: string;
  readonly model?: string;
  readonly startDate?: string;
  readonly endDate?: string;
}

export interface CreateBudgetInput {
  readonly monthlyCeiling: number;
  readonly perRequestCeiling?: number;
  readonly softAlertThreshold?: number;
  readonly scope?: string;
  readonly currency?: string;
}

export interface UpdateBudgetInput {
  readonly monthlyCeiling?: number;
  readonly perRequestCeiling?: number;
  readonly softAlertThreshold?: number;
  readonly status?: string;
}

export interface ReconcileInput {
  readonly resolution: 'SETTLE_CONFIRMED' | 'RELEASE_UNBILLED' | 'MANUAL_ADJUSTMENT';
  readonly confirmedCost?: number;
  readonly notes: string;
}
