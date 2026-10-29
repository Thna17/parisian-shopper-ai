import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { campaignsApi } from '../api/campaigns-api.js';
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

export const campaignKeys = {
  all: ['campaigns'] as const,
  lists: () => [...campaignKeys.all, 'list'] as const,
  list: (params: CampaignFilterParams) => [...campaignKeys.lists(), params] as const,
  details: () => [...campaignKeys.all, 'detail'] as const,
  detail: (id: string) => [...campaignKeys.details(), id] as const,
};

export function useCampaigns(
  params: CampaignFilterParams = {},
): UseQueryResult<PaginatedCampaignsResponse, Error> {
  return useQuery<PaginatedCampaignsResponse, Error>({
    queryKey: campaignKeys.list(params),
    queryFn: () => campaignsApi.getCampaigns(params),
    staleTime: 60 * 1000,
    placeholderData: (previousData) => previousData,
  });
}

export function useCampaignDetail(
  idOrCode: string | undefined,
): UseQueryResult<CampaignDetail, Error> {
  return useQuery<CampaignDetail, Error>({
    queryKey: campaignKeys.detail(idOrCode ?? ''),
    queryFn: () => campaignsApi.getCampaignById(idOrCode!),
    enabled: Boolean(idOrCode),
    staleTime: 30 * 1000,
  });
}

export function useCreateCampaign(): UseMutationResult<CampaignDetail, Error, CreateCampaignInput> {
  const queryClient = useQueryClient();
  return useMutation<CampaignDetail, Error, CreateCampaignInput>({
    mutationFn: (input: CreateCampaignInput) => campaignsApi.createCampaign(input),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: campaignKeys.lists() });
      queryClient.setQueryData(campaignKeys.detail(data.id), data);
      queryClient.setQueryData(campaignKeys.detail(data.code), data);
    },
  });
}

export function useUpdateCampaign(
  campaignId: string,
): UseMutationResult<CampaignDetail, Error, UpdateCampaignInput> {
  const queryClient = useQueryClient();
  return useMutation<CampaignDetail, Error, UpdateCampaignInput>({
    mutationFn: (input: UpdateCampaignInput) => campaignsApi.updateCampaign(campaignId, input),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: campaignKeys.lists() });
      queryClient.setQueryData(campaignKeys.detail(campaignId), data);
      queryClient.setQueryData(campaignKeys.detail(data.id), data);
      queryClient.setQueryData(campaignKeys.detail(data.code), data);
    },
  });
}

export function useChangeCampaignStatus(
  campaignId: string,
): UseMutationResult<CampaignDetail, Error, CampaignStatus> {
  const queryClient = useQueryClient();
  return useMutation<CampaignDetail, Error, CampaignStatus>({
    mutationFn: (status: CampaignStatus) => campaignsApi.changeCampaignStatus(campaignId, status),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: campaignKeys.lists() });
      queryClient.setQueryData(campaignKeys.detail(campaignId), data);
      queryClient.setQueryData(campaignKeys.detail(data.id), data);
      queryClient.setQueryData(campaignKeys.detail(data.code), data);
    },
  });
}

export function useAssociateCampaignProduct(
  campaignId: string,
): UseMutationResult<CampaignProduct, Error, AssociateProductInput> {
  const queryClient = useQueryClient();
  return useMutation<CampaignProduct, Error, AssociateProductInput>({
    mutationFn: (input: AssociateProductInput) => campaignsApi.associateProduct(campaignId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: campaignKeys.detail(campaignId) });
      void queryClient.invalidateQueries({ queryKey: campaignKeys.lists() });
    },
  });
}

export function useRemoveCampaignProduct(
  campaignId: string,
): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (productId: string) => campaignsApi.removeProduct(campaignId, productId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: campaignKeys.detail(campaignId) });
      void queryClient.invalidateQueries({ queryKey: campaignKeys.lists() });
    },
  });
}
