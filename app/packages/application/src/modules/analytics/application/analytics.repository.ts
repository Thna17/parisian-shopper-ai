import type {
  AnalyticsDateRangeQuery,
  CampaignAnalytics,
  ContentAnalytics,
  CreativeAnalytics,
  OperationalKpis,
  PublishingAnalytics,
  AiUsageAnalytics,
} from '../domain/analytics.types.js';

export const ANALYTICS_REPOSITORY = Symbol('ANALYTICS_REPOSITORY');

export interface AnalyticsRepository {
  getOverview(query: AnalyticsDateRangeQuery): Promise<OperationalKpis>;
  getContentAnalytics(query: AnalyticsDateRangeQuery): Promise<ContentAnalytics>;
  getCampaignAnalytics(query: AnalyticsDateRangeQuery): Promise<CampaignAnalytics>;
  getCreativeAnalytics(query: AnalyticsDateRangeQuery): Promise<CreativeAnalytics>;
  getPublishingAnalytics(query: AnalyticsDateRangeQuery): Promise<PublishingAnalytics>;
  getAiUsageAnalytics(query: AnalyticsDateRangeQuery): Promise<AiUsageAnalytics>;
}
