import { apiClient } from '../../../services/api/api-client.js';
import type {
  AssociateProductInput,
  CampaignDetail,
  CampaignFilterParams,
  CampaignProduct,
  CampaignStatus,
  CreateCampaignInput,
  PaginatedCampaignsResponse,
  UpdateCampaignInput,
} from '../types/campaign.types.js';

export const campaignsApi = {
  getCampaigns: async (params: CampaignFilterParams = {}): Promise<PaginatedCampaignsResponse> => {
    const searchParams = new URLSearchParams();
    if (params.search) searchParams.set('search', params.search);
    if (params.status) searchParams.set('status', params.status);
    if (params.page) searchParams.set('page', String(params.page));
    if (params.limit) searchParams.set('limit', String(params.limit));

    const qs = searchParams.toString();
    const endpoint = `/v1/campaigns${qs ? `?${qs}` : ''}`;
    return apiClient.get<PaginatedCampaignsResponse>(endpoint);
  },

  getCampaignById: async (idOrCode: string): Promise<CampaignDetail> => {
    return apiClient.get<CampaignDetail>(`/v1/campaigns/${encodeURIComponent(idOrCode)}`);
  },

  createCampaign: async (input: CreateCampaignInput): Promise<CampaignDetail> => {
    return apiClient.post<CampaignDetail>('/v1/campaigns', input);
  },

  updateCampaign: async (id: string, input: UpdateCampaignInput): Promise<CampaignDetail> => {
    return apiClient.patch<CampaignDetail>(`/v1/campaigns/${encodeURIComponent(id)}`, input);
  },

  changeCampaignStatus: async (id: string, status: CampaignStatus): Promise<CampaignDetail> => {
    return apiClient.post<CampaignDetail>(`/v1/campaigns/${encodeURIComponent(id)}/status`, {
      status,
    });
  },

  associateProduct: async (
    campaignId: string,
    input: AssociateProductInput,
  ): Promise<CampaignProduct> => {
    return apiClient.post<CampaignProduct>(
      `/v1/campaigns/${encodeURIComponent(campaignId)}/products`,
      input,
    );
  },

  removeProduct: async (campaignId: string, productId: string): Promise<void> => {
    return apiClient.delete<void>(
      `/v1/campaigns/${encodeURIComponent(campaignId)}/products/${encodeURIComponent(productId)}`,
    );
  },
};
