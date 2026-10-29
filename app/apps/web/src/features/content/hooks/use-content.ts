import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { contentApi } from '../api/content-api.js';
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

export const contentKeys = {
  all: ['content-jobs'] as const,
  lists: () => [...contentKeys.all, 'list'] as const,
  list: (params: ListContentJobsParams) => [...contentKeys.lists(), params] as const,
  details: () => [...contentKeys.all, 'detail'] as const,
  detail: (id: string) => [...contentKeys.details(), id] as const,
  versions: (id: string) => [...contentKeys.detail(id), 'versions'] as const,
};

export function useContentJobs(
  params: ListContentJobsParams = {},
): UseQueryResult<PaginatedContentJobs, Error> {
  return useQuery<PaginatedContentJobs, Error>({
    queryKey: contentKeys.list(params),
    queryFn: () => contentApi.getJobs(params),
    staleTime: 30 * 1000,
    placeholderData: (previousData) => previousData,
  });
}

export function useContentJobDetail(
  id: string | undefined,
): UseQueryResult<ContentJobDetail, Error> {
  return useQuery<ContentJobDetail, Error>({
    queryKey: contentKeys.detail(id ?? ''),
    queryFn: () => contentApi.getJobById(id!),
    enabled: Boolean(id),
    staleTime: 10 * 1000,
    refetchInterval: (query) => {
      const status = query.state.data?.job.status;
      if (status === 'REQUESTED' || status === 'GENERATING') {
        return 2000;
      }
      return false;
    },
  });
}

export function useCreateContentJob(): UseMutationResult<
  ContentJob,
  Error,
  CreateContentJobPayload
> {
  const queryClient = useQueryClient();

  return useMutation<ContentJob, Error, CreateContentJobPayload>({
    mutationFn: (payload) => contentApi.createJob(payload),
    onSuccess: (newJob) => {
      void queryClient.invalidateQueries({ queryKey: contentKeys.lists() });
      queryClient.setQueryData(contentKeys.detail(newJob.id), {
        job: newJob,
        attempts: [],
        versions: [],
        currentVersion: null,
        latestValidationResult: null,
      });
    },
  });
}

export function useReviseContent(
  jobId: string,
): UseMutationResult<
  { version: ContentVersion; validationResult: ValidationResult },
  Error,
  ManualRevisePayload
> {
  const queryClient = useQueryClient();

  return useMutation<
    { version: ContentVersion; validationResult: ValidationResult },
    Error,
    ManualRevisePayload
  >({
    mutationFn: (payload) => contentApi.reviseManual(jobId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: contentKeys.detail(jobId) });
      void queryClient.invalidateQueries({ queryKey: contentKeys.lists() });
    },
  });
}

export function useSubmitContentForReview(
  jobId: string,
): UseMutationResult<ContentJob, Error, string> {
  const queryClient = useQueryClient();

  return useMutation<ContentJob, Error, string>({
    mutationFn: (versionId) => contentApi.submitForReview(jobId, versionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: contentKeys.detail(jobId) });
      void queryClient.invalidateQueries({ queryKey: contentKeys.lists() });
    },
  });
}
