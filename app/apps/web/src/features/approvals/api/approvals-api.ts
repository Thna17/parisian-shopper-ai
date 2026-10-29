import { apiClient } from '../../../services/api/api-client.js';
import type {
  ApprovalDecisionResponse,
  ApprovePayload,
  ListReviewQueueParams,
  PaginatedReviewQueue,
  RejectPayload,
  ReviewDeskDetail,
} from '../types/approvals.types.js';

export const approvalsApi = {
  getQueue: async (params: ListReviewQueueParams = {}): Promise<PaginatedReviewQueue> => {
    const searchParams = new URLSearchParams();
    if (params.status) searchParams.set('status', params.status);
    if (params.productSnapshotId) searchParams.set('productSnapshotId', params.productSnapshotId);
    if (params.campaignId) searchParams.set('campaignId', params.campaignId);
    if (params.search) searchParams.set('search', params.search);
    if (params.page) searchParams.set('page', String(params.page));
    if (params.limit) searchParams.set('limit', String(params.limit));

    const qs = searchParams.toString();
    const endpoint = `/v1/approvals${qs ? `?${qs}` : ''}`;
    return apiClient.get<PaginatedReviewQueue>(endpoint);
  },

  getPending: async (
    params: Omit<ListReviewQueueParams, 'status'> = {},
  ): Promise<PaginatedReviewQueue> => {
    return approvalsApi.getQueue({ ...params, status: 'UNDER_REVIEW' });
  },

  getHistory: async (
    params: Omit<ListReviewQueueParams, 'status'> = {},
  ): Promise<PaginatedReviewQueue> => {
    return approvalsApi.getQueue({ ...params, status: 'HISTORY' });
  },

  getDetail: async (jobId: string, versionId?: string): Promise<ReviewDeskDetail> => {
    const qs = versionId ? `?versionId=${encodeURIComponent(versionId)}` : '';
    return apiClient.get<ReviewDeskDetail>(`/v1/approvals/${encodeURIComponent(jobId)}${qs}`);
  },

  approve: async (jobId: string, payload: ApprovePayload): Promise<ApprovalDecisionResponse> => {
    return apiClient.post<ApprovalDecisionResponse>(
      `/v1/approvals/${encodeURIComponent(jobId)}/approve`,
      payload,
    );
  },

  reject: async (jobId: string, payload: RejectPayload): Promise<ApprovalDecisionResponse> => {
    return apiClient.post<ApprovalDecisionResponse>(
      `/v1/approvals/${encodeURIComponent(jobId)}/reject`,
      payload,
    );
  },
};
