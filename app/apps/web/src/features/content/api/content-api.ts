import { apiClient } from '../../../services/api/api-client.js';
import type {
  ContentJob,
  ContentJobDetail,
  ContentVersion,
  CreateContentJobPayload,
  ListContentJobsParams,
  ManualRevisePayload,
  PaginatedContentJobs,
  ValidationResult,
} from '../types/content.types.js';

export const contentApi = {
  getJobs: async (params: ListContentJobsParams = {}): Promise<PaginatedContentJobs> => {
    const searchParams = new URLSearchParams();
    if (params.status) searchParams.set('status', params.status);
    if (params.productSnapshotId) searchParams.set('productSnapshotId', params.productSnapshotId);
    if (params.campaignId) searchParams.set('campaignId', params.campaignId);
    if (params.page) searchParams.set('page', String(params.page));
    if (params.limit) searchParams.set('limit', String(params.limit));

    const qs = searchParams.toString();
    const endpoint = `/v1/content/jobs${qs ? `?${qs}` : ''}`;
    return apiClient.get<PaginatedContentJobs>(endpoint);
  },

  getJobById: async (id: string): Promise<ContentJobDetail> => {
    return apiClient.get<ContentJobDetail>(`/v1/content/jobs/${encodeURIComponent(id)}`);
  },

  createJob: async (payload: CreateContentJobPayload): Promise<ContentJob> => {
    return apiClient.post<ContentJob>('/v1/content/jobs', payload);
  },

  getJobVersions: async (jobId: string): Promise<ContentVersion[]> => {
    return apiClient.get<ContentVersion[]>(
      `/v1/content/jobs/${encodeURIComponent(jobId)}/versions`,
    );
  },

  getVersionById: async (
    versionId: string,
  ): Promise<{ version: ContentVersion; validationResult: ValidationResult | null }> => {
    return apiClient.get<{ version: ContentVersion; validationResult: ValidationResult | null }>(
      `/v1/content/versions/${encodeURIComponent(versionId)}`,
    );
  },

  reviseManual: async (
    jobId: string,
    payload: ManualRevisePayload,
  ): Promise<{ version: ContentVersion; validationResult: ValidationResult }> => {
    return apiClient.post<{ version: ContentVersion; validationResult: ValidationResult }>(
      `/v1/content/jobs/${encodeURIComponent(jobId)}/revise/manual`,
      payload,
    );
  },

  submitForReview: async (jobId: string, contentVersionId: string): Promise<ContentJob> => {
    return apiClient.post<ContentJob>(
      `/v1/content/jobs/${encodeURIComponent(jobId)}/submit-for-review`,
      { contentVersionId },
    );
  },
};
