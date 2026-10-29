import { apiClient } from '../../../services/api/api-client.js';
import type {
  CreativeProjectDetail,
  CreativeSceneRecord,
  CreativeSceneVersionRecord,
  ExportFormatOption,
  ExportResult,
  PaginatedCreativeProjects,
  PosterAspectRatio,
  RenderPreviewResult,
  SceneLanguage,
  SceneLayerDraft,
  SceneLayerRecord,
  SceneOperationCode,
  SceneTemplateId,
  TemplateDefinition,
  ValidationAssessmentResult,
} from '../types/creative.types.js';

export interface ListCreativeProjectsParams {
  readonly campaignId?: string;
  readonly search?: string;
  readonly page?: number;
  readonly limit?: number;
}

export interface CreateCreativeProjectPayload {
  readonly title: string;
  readonly productSnapshotId: string;
  readonly sourceContentVersionId: string;
  readonly templateId: SceneTemplateId;
  readonly aspectRatio: PosterAspectRatio;
  readonly language?: SceneLanguage;
  readonly campaignId?: string;
  readonly productAssetId?: string;
}

export interface ReviseCreativeProjectPayload {
  readonly expectedVersionNumber: number;
  readonly changeReason: string;
  readonly operationCode: SceneOperationCode;
  readonly layers: readonly SceneLayerDraft[];
  readonly safeMargins?: {
    readonly top: number;
    readonly bottom: number;
    readonly left: number;
    readonly right: number;
  };
}

export const creativeApi = {
  getTemplates: async (): Promise<TemplateDefinition[]> => {
    return apiClient.get<TemplateDefinition[]>('/v1/creative/templates');
  },

  getProjects: async (
    params: ListCreativeProjectsParams = {},
  ): Promise<PaginatedCreativeProjects> => {
    const searchParams = new URLSearchParams();
    if (params.campaignId) searchParams.set('campaignId', params.campaignId);
    if (params.search) searchParams.set('search', params.search);
    if (params.page) searchParams.set('page', String(params.page));
    if (params.limit) searchParams.set('limit', String(params.limit));

    const qs = searchParams.toString();
    const endpoint = `/v1/creative/projects${qs ? `?${qs}` : ''}`;
    return apiClient.get<PaginatedCreativeProjects>(endpoint);
  },

  getProjectById: async (id: string, versionNumber?: number): Promise<CreativeProjectDetail> => {
    const qs = versionNumber ? `?versionNumber=${versionNumber}` : '';
    return apiClient.get<CreativeProjectDetail>(
      `/v1/creative/projects/${encodeURIComponent(id)}${qs}`,
    );
  },

  createProject: async (
    payload: CreateCreativeProjectPayload,
  ): Promise<{ scene: CreativeSceneRecord; version: CreativeSceneVersionRecord }> => {
    return apiClient.post<{ scene: CreativeSceneRecord; version: CreativeSceneVersionRecord }>(
      '/v1/creative/projects',
      payload,
    );
  },

  reviseProject: async (
    id: string,
    payload: ReviseCreativeProjectPayload,
  ): Promise<CreativeSceneVersionRecord> => {
    return apiClient.patch<CreativeSceneVersionRecord>(
      `/v1/creative/projects/${encodeURIComponent(id)}`,
      payload,
    );
  },

  getProjectVersions: async (id: string): Promise<CreativeSceneVersionRecord[]> => {
    return apiClient.get<CreativeSceneVersionRecord[]>(
      `/v1/creative/projects/${encodeURIComponent(id)}/versions`,
    );
  },

  validateProject: async (
    id: string,
    payload: {
      versionNumber?: number;
      layers?: readonly (SceneLayerDraft | SceneLayerRecord)[];
    } = {},
  ): Promise<ValidationAssessmentResult> => {
    return apiClient.post<ValidationAssessmentResult>(
      `/v1/creative/projects/${encodeURIComponent(id)}/validate`,
      payload,
    );
  },

  renderPreview: async (
    id: string,
    payload: {
      versionNumber?: number;
      layers?: readonly (SceneLayerDraft | SceneLayerRecord)[];
    } = {},
  ): Promise<RenderPreviewResult> => {
    return apiClient.post<RenderPreviewResult>(
      `/v1/creative/projects/${encodeURIComponent(id)}/render`,
      payload,
    );
  },

  getRenderFileUrl: (visualAssetId: string): string => {
    return `/v1/creative/renders/${encodeURIComponent(visualAssetId)}/file`;
  },

  exportProject: async (id: string, payload: ExportFormatOption): Promise<ExportResult> => {
    return apiClient.post<ExportResult>(
      `/v1/creative/projects/${encodeURIComponent(id)}/export`,
      payload,
    );
  },
};
