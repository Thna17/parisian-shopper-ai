import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import {
  creativeApi,
  type CreateCreativeProjectPayload,
  type ListCreativeProjectsParams,
  type ReviseCreativeProjectPayload,
} from '../api/creative-api.js';
import type {
  CreativeProjectDetail,
  CreativeSceneRecord,
  CreativeSceneVersionRecord,
  ExportFormatOption,
  ExportResult,
  PaginatedCreativeProjects,
  RenderPreviewResult,
  SceneLayerDraft,
  SceneLayerRecord,
  TemplateDefinition,
  ValidationAssessmentResult,
} from '../types/creative.types.js';

export const creativeKeys = {
  all: ['creative-projects'] as const,
  templates: ['creative-templates'] as const,
  lists: () => [...creativeKeys.all, 'list'] as const,
  list: (params: ListCreativeProjectsParams) => [...creativeKeys.lists(), params] as const,
  details: () => [...creativeKeys.all, 'detail'] as const,
  detail: (id: string, ver?: number) => [...creativeKeys.details(), id, ver ?? 'latest'] as const,
  versions: (id: string) => [...creativeKeys.details(), id, 'versions'] as const,
};

export function useCreativeTemplates(): UseQueryResult<TemplateDefinition[], Error> {
  return useQuery<TemplateDefinition[], Error>({
    queryKey: creativeKeys.templates,
    queryFn: () => creativeApi.getTemplates(),
    staleTime: 60 * 1000,
  });
}

export function useCreativeProjects(
  params: ListCreativeProjectsParams = {},
): UseQueryResult<PaginatedCreativeProjects, Error> {
  return useQuery<PaginatedCreativeProjects, Error>({
    queryKey: creativeKeys.list(params),
    queryFn: () => creativeApi.getProjects(params),
    staleTime: 15 * 1000,
    placeholderData: (previousData) => previousData,
  });
}

export function useCreativeProjectDetail(
  id: string | undefined,
  versionNumber?: number,
): UseQueryResult<CreativeProjectDetail, Error> {
  return useQuery<CreativeProjectDetail, Error>({
    queryKey: creativeKeys.detail(id ?? '', versionNumber),
    queryFn: () => creativeApi.getProjectById(id!, versionNumber),
    enabled: Boolean(id),
    staleTime: 5 * 1000,
  });
}

export function useCreativeProjectVersions(
  id: string | undefined,
): UseQueryResult<CreativeSceneVersionRecord[], Error> {
  return useQuery<CreativeSceneVersionRecord[], Error>({
    queryKey: creativeKeys.versions(id ?? ''),
    queryFn: () => creativeApi.getProjectVersions(id!),
    enabled: Boolean(id),
    staleTime: 5 * 1000,
  });
}

export function useCreateCreativeProject(): UseMutationResult<
  { scene: CreativeSceneRecord; version: CreativeSceneVersionRecord },
  Error,
  CreateCreativeProjectPayload
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => creativeApi.createProject(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: creativeKeys.lists() });
    },
  });
}

export function useReviseCreativeProject(
  sceneId: string,
): UseMutationResult<CreativeSceneVersionRecord, Error, ReviseCreativeProjectPayload> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => creativeApi.reviseProject(sceneId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: creativeKeys.detail(sceneId) });
      void queryClient.invalidateQueries({ queryKey: creativeKeys.versions(sceneId) });
      void queryClient.invalidateQueries({ queryKey: creativeKeys.lists() });
    },
  });
}

export function useValidateCreativeProject(
  sceneId: string,
): UseMutationResult<
  ValidationAssessmentResult,
  Error,
  { versionNumber?: number; layers?: readonly (SceneLayerDraft | SceneLayerRecord)[] }
> {
  return useMutation({
    mutationFn: (payload) => creativeApi.validateProject(sceneId, payload),
  });
}

export function useRenderCreativePreview(
  sceneId: string,
): UseMutationResult<
  RenderPreviewResult,
  Error,
  { versionNumber?: number; layers?: readonly (SceneLayerDraft | SceneLayerRecord)[] }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => creativeApi.renderPreview(sceneId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: creativeKeys.detail(sceneId) });
    },
  });
}

export function useExportCreativeProject(
  sceneId: string,
): UseMutationResult<ExportResult, Error, ExportFormatOption> {
  return useMutation({
    mutationFn: (payload) => creativeApi.exportProject(sceneId, payload),
  });
}
