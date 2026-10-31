import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { analyticsApi } from '../api/analytics-api.js';
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

export function useAnalyticsOverview(
  params?: DateRangeParams,
): UseQueryResult<OperationalKpis, Error> {
  return useQuery({
    queryKey: ['analytics-overview', params],
    queryFn: () => analyticsApi.getOverview(params),
  });
}

export function useContentAnalytics(
  params?: DateRangeParams,
): UseQueryResult<ContentAnalytics, Error> {
  return useQuery({
    queryKey: ['analytics-content', params],
    queryFn: () => analyticsApi.getContent(params),
  });
}

export function useCampaignAnalytics(
  params?: DateRangeParams,
): UseQueryResult<CampaignAnalytics, Error> {
  return useQuery({
    queryKey: ['analytics-campaigns', params],
    queryFn: () => analyticsApi.getCampaigns(params),
  });
}

export function useCreativeAnalytics(
  params?: DateRangeParams,
): UseQueryResult<CreativeAnalytics, Error> {
  return useQuery({
    queryKey: ['analytics-creative', params],
    queryFn: () => analyticsApi.getCreative(params),
  });
}

export function usePublishingAnalytics(
  params?: DateRangeParams,
): UseQueryResult<PublishingAnalytics, Error> {
  return useQuery({
    queryKey: ['analytics-publishing', params],
    queryFn: () => analyticsApi.getPublishing(params),
  });
}

export function useAiUsageAnalytics(
  params?: DateRangeParams,
): UseQueryResult<AiUsageAnalytics, Error> {
  return useQuery({
    queryKey: ['analytics-ai-usage', params],
    queryFn: () => analyticsApi.getAiUsage(params),
  });
}

export function useBudgetUtilization(): UseQueryResult<BudgetUtilization, Error> {
  return useQuery({
    queryKey: ['analytics-budgets'],
    queryFn: () => analyticsApi.getBudgetUtilization(),
  });
}

export function useCostLedger(
  params?: CostLedgerFilterParams,
): UseQueryResult<PaginatedCostLedger, Error> {
  return useQuery({
    queryKey: ['analytics-cost-ledger', params],
    queryFn: () => analyticsApi.getCostLedger(params),
  });
}

export function useUnreconciledUsage(): UseQueryResult<readonly UnreconciledUsage[], Error> {
  return useQuery({
    queryKey: ['analytics-unreconciled'],
    queryFn: () => analyticsApi.getUnreconciled(),
  });
}

export function useCreateBudget(): UseMutationResult<
  Record<string, unknown>,
  Error,
  CreateBudgetInput
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBudgetInput) => analyticsApi.createBudget(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['analytics-budgets'] });
    },
  });
}

export function useUpdateBudget(): UseMutationResult<
  Record<string, unknown>,
  Error,
  { id: string; input: UpdateBudgetInput }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateBudgetInput }) =>
      analyticsApi.updateBudget(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['analytics-budgets'] });
    },
  });
}

export function useReconcileUsage(): UseMutationResult<
  Record<string, unknown>,
  Error,
  { id: string; input: ReconcileInput }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ReconcileInput }) =>
      analyticsApi.reconcile(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['analytics-unreconciled'] });
      void queryClient.invalidateQueries({ queryKey: ['analytics-cost-ledger'] });
      void queryClient.invalidateQueries({ queryKey: ['analytics-budgets'] });
    },
  });
}
