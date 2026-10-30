import { apiClient } from '../../../services/api/api-client.js';
import type {
  AiUsageAnalytics,
  BudgetUtilization,
  CampaignAnalytics,
  ContentAnalytics,
  CostLedgerFilterParams,
  CreateBudgetInput,
  CreativeAnalytics,
  DateRangeParams,
  OperationalKpis,
  PaginatedCostLedger,
  PublishingAnalytics,
  ReconcileInput,
  UnreconciledUsage,
  UpdateBudgetInput,
} from '../types/analytics.types.js';

function buildQuery(params?: DateRangeParams): string {
  if (!params) return '';
  const searchParams = new URLSearchParams();
  if (params.startDate) searchParams.set('startDate', params.startDate);
  if (params.endDate) searchParams.set('endDate', params.endDate);
  if (params.timezone) searchParams.set('timezone', params.timezone);
  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

export const analyticsApi = {
  getOverview: async (params?: DateRangeParams): Promise<OperationalKpis> => {
    return apiClient.get<OperationalKpis>(`/v1/analytics/overview${buildQuery(params)}`);
  },

  getContent: async (params?: DateRangeParams): Promise<ContentAnalytics> => {
    return apiClient.get<ContentAnalytics>(`/v1/analytics/content${buildQuery(params)}`);
  },

  getCampaigns: async (params?: DateRangeParams): Promise<CampaignAnalytics> => {
    return apiClient.get<CampaignAnalytics>(`/v1/analytics/campaigns${buildQuery(params)}`);
  },

  getCreative: async (params?: DateRangeParams): Promise<CreativeAnalytics> => {
    return apiClient.get<CreativeAnalytics>(`/v1/analytics/creative${buildQuery(params)}`);
  },

  getPublishing: async (params?: DateRangeParams): Promise<PublishingAnalytics> => {
    return apiClient.get<PublishingAnalytics>(`/v1/analytics/publishing${buildQuery(params)}`);
  },

  getAiUsage: async (params?: DateRangeParams): Promise<AiUsageAnalytics> => {
    return apiClient.get<AiUsageAnalytics>(`/v1/analytics/ai-usage${buildQuery(params)}`);
  },

  getBudgetUtilization: async (): Promise<BudgetUtilization> => {
    return apiClient.get<BudgetUtilization>('/v1/analytics/budgets');
  },

  createBudget: async (input: CreateBudgetInput): Promise<Record<string, unknown>> => {
    return apiClient.post('/v1/analytics/budgets', input);
  },

  updateBudget: async (id: string, input: UpdateBudgetInput): Promise<Record<string, unknown>> => {
    return apiClient.patch(`/v1/analytics/budgets/${encodeURIComponent(id)}`, input);
  },

  getCostLedger: async (params?: CostLedgerFilterParams): Promise<PaginatedCostLedger> => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.provider) searchParams.set('provider', params.provider);
    if (params?.model) searchParams.set('model', params.model);
    if (params?.startDate) searchParams.set('startDate', params.startDate);
    if (params?.endDate) searchParams.set('endDate', params.endDate);
    const qs = searchParams.toString();
    return apiClient.get<PaginatedCostLedger>(`/v1/analytics/cost-ledger${qs ? `?${qs}` : ''}`);
  },

  getUnreconciled: async (): Promise<readonly UnreconciledUsage[]> => {
    return apiClient.get<readonly UnreconciledUsage[]>('/v1/analytics/unreconciled');
  },

  reconcile: async (id: string, input: ReconcileInput): Promise<Record<string, unknown>> => {
    return apiClient.post(`/v1/analytics/cost-ledger/${encodeURIComponent(id)}/reconcile`, input);
  },
};
