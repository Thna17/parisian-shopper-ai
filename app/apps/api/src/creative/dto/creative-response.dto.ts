import type {
  CreativeProjectDetailResult,
  CreativeSceneSummary,
  PaginatedCreativeScenes,
  TemplateDefinition,
  ValidateCreativeProjectResult,
} from '@parisian-shopper/application';

export type TemplateListResponseDto = readonly TemplateDefinition[];

export type PaginatedCreativeProjectsResponseDto = PaginatedCreativeScenes;

export type CreativeProjectSummaryDto = CreativeSceneSummary;

export type CreativeProjectDetailResponseDto = CreativeProjectDetailResult;

export type ValidationResponseDto = ValidateCreativeProjectResult;

export interface RenderPreviewResponseDto {
  readonly visualAssetId: string;
  readonly storageKey: string;
  readonly width: number;
  readonly height: number;
  readonly sha256: string;
  readonly byteSize: number;
  readonly mimeType: 'image/png';
  readonly validationStatus: 'PASSED' | 'PASSED_WITH_WARNINGS' | 'FAILED';
  readonly isPassed: boolean;
  readonly findings: readonly {
    readonly code: string;
    readonly severity: string;
    readonly message: string;
    readonly field: string;
  }[];
  readonly aestheticScore?: number | undefined;
  readonly previewUrl: string;
}

export interface ExportResponseDto {
  readonly exportId?: string | undefined;
  readonly storageKey?: string | undefined;
  readonly filename: string;
  readonly width: number;
  readonly height: number;
  readonly sha256: string;
  readonly byteSize: number;
  readonly mimeType: 'image/png' | 'image/jpeg';
  readonly downloadUrl: string;
}

export interface CreativeApprovalResponseDto {
  readonly approvalEventId: string;
  readonly creativeJobId: string;
  readonly visualAssetId: string;
  readonly sceneVersionId?: string | undefined;
  readonly decision: 'CREATIVE_APPROVED' | 'CREATIVE_REJECTED';
  readonly approverUserId: string;
  readonly approverDisplayName?: string | undefined;
  readonly comment?: string | undefined;
  readonly createdAt: string;
}
