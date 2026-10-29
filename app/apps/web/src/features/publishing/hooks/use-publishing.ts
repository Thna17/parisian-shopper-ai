import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { publishingApi } from '../api/publishing-api.js';
import type {
  ChannelCapability,
  CreatePublicationInput,
  EligibleAsset,
  PaginatedPublications,
  PublicationDetail,
  PublicationRecord,
  PublishingFilterParams,
} from '../types/publishing.types.js';

export function usePublications(
  params: PublishingFilterParams = {},
): UseQueryResult<PaginatedPublications, Error> {
  return useQuery({
    queryKey: ['publications', params],
    queryFn: () => publishingApi.getPublications(params),
  });
}

export function usePublicationDetail(
  id: string | undefined,
): UseQueryResult<PublicationDetail, Error> {
  return useQuery({
    queryKey: ['publication', id],
    queryFn: () => publishingApi.getPublicationById(id!),
    enabled: !!id,
  });
}

export function useEligibleAssets(
  params: { page?: number; limit?: number } = {},
): UseQueryResult<{ items: EligibleAsset[]; total: number }, Error> {
  return useQuery({
    queryKey: ['eligible-assets', params],
    queryFn: () => publishingApi.getEligibleAssets(params),
  });
}

export function useDestinations(): UseQueryResult<ChannelCapability[], Error> {
  return useQuery({
    queryKey: ['publishing-destinations'],
    queryFn: () => publishingApi.getDestinations(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreatePublication(): UseMutationResult<
  PublicationRecord,
  Error,
  CreatePublicationInput
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePublicationInput) => publishingApi.createPublication(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['publications'] });
    },
  });
}

export function useConfirmPublication(): UseMutationResult<PublicationRecord, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => publishingApi.confirmPublication(id),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: ['publications'] });
      void queryClient.invalidateQueries({ queryKey: ['publication', id] });
    },
  });
}

export function useRetryPublication(): UseMutationResult<PublicationRecord, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => publishingApi.retryPublication(id),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: ['publications'] });
      void queryClient.invalidateQueries({ queryKey: ['publication', id] });
    },
  });
}

export function useCancelPublication(): UseMutationResult<
  PublicationRecord,
  Error,
  { id: string; reason: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      publishingApi.cancelPublication(id, reason),
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ['publications'] });
      void queryClient.invalidateQueries({ queryKey: ['publication', id] });
    },
  });
}
