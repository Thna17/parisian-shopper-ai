import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { approvalsApi } from '../api/approvals-api.js';
import type {
  ApprovalDecisionResponse,
  ApprovePayload,
  ListReviewQueueParams,
  PaginatedReviewQueue,
  RejectPayload,
  ReviewDeskDetail,
} from '../types/approvals.types.js';

export const approvalKeys = {
  all: ['approvals'] as const,
  lists: () => [...approvalKeys.all, 'list'] as const,
  list: (params: ListReviewQueueParams) => [...approvalKeys.lists(), params] as const,
  pending: (params?: ListReviewQueueParams) => [...approvalKeys.all, 'pending', params] as const,
  history: (params?: ListReviewQueueParams) => [...approvalKeys.all, 'history', params] as const,
  details: () => [...approvalKeys.all, 'detail'] as const,
  detail: (id: string, versionId?: string) => [...approvalKeys.details(), id, versionId] as const,
};

export function usePendingReviews(
  params: Omit<ListReviewQueueParams, 'status'> = {},
): UseQueryResult<PaginatedReviewQueue, Error> {
  return useQuery({
    queryKey: approvalKeys.pending(params),
    queryFn: () => approvalsApi.getPending(params),
  });
}

export function useApprovalHistory(
  params: Omit<ListReviewQueueParams, 'status'> = {},
): UseQueryResult<PaginatedReviewQueue, Error> {
  return useQuery({
    queryKey: approvalKeys.history(params),
    queryFn: () => approvalsApi.getHistory(params),
  });
}

export function useReviewDeskDetail(
  jobId: string,
  versionId?: string,
): UseQueryResult<ReviewDeskDetail, Error> {
  return useQuery({
    queryKey: approvalKeys.detail(jobId, versionId),
    queryFn: () => approvalsApi.getDetail(jobId, versionId),
    enabled: Boolean(jobId),
  });
}

export function useApproveVersion(): UseMutationResult<
  ApprovalDecisionResponse,
  Error,
  { jobId: string; payload: ApprovePayload }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ jobId, payload }: { jobId: string; payload: ApprovePayload }) =>
      approvalsApi.approve(jobId, payload),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: approvalKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['content', 'jobs', variables.jobId] });
    },
  });
}

export function useRejectVersion(): UseMutationResult<
  ApprovalDecisionResponse,
  Error,
  { jobId: string; payload: RejectPayload }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ jobId, payload }: { jobId: string; payload: RejectPayload }) =>
      approvalsApi.reject(jobId, payload),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: approvalKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['content', 'jobs', variables.jobId] });
    },
  });
}
