import { apiClient } from '../../../services/api/api-client.js';
import type {
  ChannelCapability,
  CreatePublicationInput,
  EligibleAsset,
  PaginatedPublications,
  PublicationDetail,
  PublicationRecord,
  PublishingFilterParams,
} from '../types/publishing.types.js';

export const publishingApi = {
  getPublications: async (params: PublishingFilterParams = {}): Promise<PaginatedPublications> => {
    const searchParams = new URLSearchParams();
    if (params.status) searchParams.set('status', params.status);
    if (params.channel) searchParams.set('channel', params.channel);
    if (params.page !== undefined) searchParams.set('page', String(params.page));
    if (params.limit !== undefined) searchParams.set('limit', String(params.limit));

    const qs = searchParams.toString();
    const endpoint = `/v1/publishing${qs ? `?${qs}` : ''}`;
    return apiClient.get<PaginatedPublications>(endpoint);
  },

  getPublicationById: async (id: string): Promise<PublicationDetail> => {
    return apiClient.get<PublicationDetail>(`/v1/publishing/${encodeURIComponent(id)}`);
  },

  createPublication: async (input: CreatePublicationInput): Promise<PublicationRecord> => {
    return apiClient.post<PublicationRecord>('/v1/publishing', input);
  },

  confirmPublication: async (id: string): Promise<PublicationRecord> => {
    return apiClient.post<PublicationRecord>(`/v1/publishing/${encodeURIComponent(id)}/confirm`);
  },

  retryPublication: async (id: string): Promise<PublicationRecord> => {
    return apiClient.post<PublicationRecord>(`/v1/publishing/${encodeURIComponent(id)}/retry`);
  },

  cancelPublication: async (id: string, reason: string): Promise<PublicationRecord> => {
    return apiClient.post<PublicationRecord>(`/v1/publishing/${encodeURIComponent(id)}/cancel`, {
      reason,
    });
  },

  getEligibleAssets: async (
    params: { page?: number; limit?: number } = {},
  ): Promise<{ items: EligibleAsset[]; total: number }> => {
    const searchParams = new URLSearchParams();
    if (params.page !== undefined) searchParams.set('page', String(params.page));
    if (params.limit !== undefined) searchParams.set('limit', String(params.limit));

    const qs = searchParams.toString();
    const endpoint = `/v1/publishing/eligible-assets${qs ? `?${qs}` : ''}`;
    return apiClient.get<{ items: EligibleAsset[]; total: number }>(endpoint);
  },

  getDestinations: async (): Promise<ChannelCapability[]> => {
    return apiClient.get<ChannelCapability[]>('/v1/publishing/destinations');
  },
};
