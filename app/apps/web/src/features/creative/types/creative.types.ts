export type PosterAspectRatio = '1:1' | '4:5' | '9:16';

export type SceneTemplateId =
  'EDITORIAL_SPLIT' | 'CENTERED_HERO' | 'KHMER_SEASONAL' | 'SCENT_STORY' | 'PROMOTION_PRICE_CTA';

export type SceneLanguage = 'EN' | 'KM' | 'BILINGUAL';

export type LayerGroup =
  'BACKGROUND' | 'SURFACE_SHADOW' | 'PRODUCT_HERO' | 'TYPOGRAPHY' | 'BRAND_DECORATION';

export type SceneLayerType =
  | 'GENERATED_BACKGROUND'
  | 'SOLID_COLOR'
  | 'GRADIENT'
  | 'HERO_CUTOUT'
  | 'SHADOW_BASE'
  | 'TYPOGRAPHY_BLOCK'
  | 'BRAND_MARK'
  | 'DECORATIVE_FRAME';

export type SceneOperationCode =
  | 'INITIAL_DRAFT'
  | 'REPLACE_HERO'
  | 'REPLACE_BACKGROUND'
  | 'EDIT_TYPOGRAPHY'
  | 'EDIT_LAYOUT'
  | 'APPLY_PRESET'
  | 'UPDATE_COPY'
  | 'TRANSLATE'
  | 'RELAYOUT_ASPECT';

export type CreativeJobStatus =
  | 'REQUESTED'
  | 'GENERATING'
  | 'DRAFT'
  | 'READY_FOR_REVIEW'
  | 'UNDER_REVIEW'
  | 'REVISION_REQUESTED'
  | 'CREATIVE_APPROVED'
  | 'REJECTED'
  | 'FAILED';

export interface BoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SafeMargins {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

export interface TypographyTextElement {
  readonly text: string;
  readonly fontFamily: 'Playfair Display' | 'Montserrat' | 'Noto Sans Khmer';
  readonly fontWeight: number;
  readonly fontSize: number;
  readonly color: string;
  readonly lineHeight?: number;
  readonly letterSpacing?: number;
  readonly textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
}

export interface TypographyPriceBadge {
  readonly regularPrice: string;
  readonly promoPrice?: string;
  readonly currency: string;
  readonly discountText?: string;
}

export interface TypographyPayload {
  readonly headline: TypographyTextElement;
  readonly subheadline?: TypographyTextElement;
  readonly secondaryHeadline?: TypographyTextElement;
  readonly body?: TypographyTextElement;
  readonly priceBadge?: TypographyPriceBadge;
  readonly cta?: {
    readonly text: string;
    readonly fontFamily: 'Playfair Display' | 'Montserrat' | 'Noto Sans Khmer';
    readonly fontWeight: number;
    readonly fontSize: number;
    readonly style?: string;
    readonly backgroundColor?: string;
    readonly textColor?: string;
  };
}

export interface ProductHeroPayload {
  readonly productSnapshotId: string;
  readonly productAssetId: string;
  readonly productAssetRegistrationId: string;
  readonly validationAssessmentId: string;
  readonly validatorVersion: string;
  readonly rightsEventId: string;
  readonly approvalEventId: string;
  readonly assetRole: string;
  readonly casStorageKey: string;
  readonly sha256: string;
  readonly mimeType: 'image/png' | 'image/webp';
  readonly format: 'png' | 'webp';
  readonly byteSize: number;
  readonly width: number;
  readonly height: number;
  readonly pixelCount: number;
  readonly channels: number;
  readonly hasAlpha: boolean;
  readonly transparencyRatio: number;
  readonly rightsState: 'VERIFIED' | 'REVOKED';
  readonly approvalDecision: 'APPROVED' | 'REJECTED';
}

export interface SceneLayerDraft {
  readonly id?: string;
  readonly layerKey: string;
  readonly layerGroup: LayerGroup;
  readonly layerType: SceneLayerType;
  readonly name: string;
  readonly zIndex: number;
  readonly visible: boolean;
  readonly opacity: number;
  readonly blendMode: 'NORMAL' | 'MULTIPLY' | 'SCREEN' | 'OVERLAY' | 'DARKEN' | 'LIGHTEN';
  readonly bounds: BoundingBox;
  readonly payloadSchemaVersion: number;
  readonly sortOrder: number;
  readonly payload: Record<string, unknown>;
}

export interface SceneLayerRecord extends SceneLayerDraft {
  readonly id: string;
  readonly sceneVersionId: string;
  readonly layerHash: string;
  readonly createdAt: string;
}

export interface CreativeSceneVersionRecord {
  readonly id: string;
  readonly sceneId: string;
  readonly versionNumber: number;
  readonly parentVersionId: string | null;
  readonly aspectRatio: PosterAspectRatio;
  readonly width: number;
  readonly height: number;
  readonly templateId: SceneTemplateId;
  readonly templateVersion: string;
  readonly stylePresetId: string | null;
  readonly language: SceneLanguage;
  readonly safeMargins: SafeMargins;
  readonly brandProfileVersionId: string;
  readonly sourceContentVersionId: string;
  readonly productSnapshotId: string;
  readonly sceneHash: string;
  readonly dependencyHash: string;
  readonly changeReason: string;
  readonly operationCode: SceneOperationCode;
  readonly requestedByUserId: string;
  readonly metadata: Record<string, unknown> | null;
  readonly createdAt: string;
  readonly layers: readonly SceneLayerRecord[];
}

export interface CreativeSceneRecord {
  readonly id: string;
  readonly creativeJobId: string;
  readonly campaignId: string | null;
  readonly title: string;
  readonly currentVersionNumber: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreativeJobRecord {
  readonly id: string;
  readonly contentVersionId: string;
  readonly productSnapshotId: string;
  readonly brandRuleVersionId: string;
  readonly requestedByUserId: string;
  readonly status: CreativeJobStatus;
  readonly targetPlatform: string;
  readonly aspectRatio: string;
  readonly creativeProfile: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreativeProjectSummary {
  readonly scene: CreativeSceneRecord;
  readonly latestVersion: CreativeSceneVersionRecord;
  readonly productSnapshot: {
    readonly id: string;
    readonly sku: string;
    readonly productName: string;
    readonly brand: string;
    readonly price: number;
  };
}

export interface PaginatedCreativeProjects {
  readonly items: readonly CreativeProjectSummary[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
}

export interface CreativeProjectDetail {
  readonly project: CreativeSceneRecord;
  readonly currentVersion: CreativeSceneVersionRecord;
  readonly productSnapshot: {
    readonly id: string;
    readonly sku: string;
    readonly productName: string;
    readonly brand: string;
    readonly price: number;
    readonly currency: string;
  };
  readonly campaign: {
    readonly id: string;
    readonly code: string;
    readonly name: string;
  } | null;
  readonly availableHeroAssets: readonly {
    readonly assetId: string;
    readonly registrationId: string;
    readonly role: string;
    readonly width: number;
    readonly height: number;
    readonly rightsState: string;
    readonly approvalDecision: string;
  }[];
  readonly canEdit: boolean;
  readonly canApprove: boolean;
  readonly canExport: boolean;
}

export interface ValidationFinding {
  readonly code: string;
  readonly severity: 'BLOCKING' | 'WARNING' | 'INFO';
  readonly message: string;
  readonly field?: string;
}

export interface ValidationAssessmentResult {
  readonly isPassed: boolean;
  readonly blockingCount: number;
  readonly warningCount: number;
  readonly infoCount: number;
  readonly findings: readonly ValidationFinding[];
  readonly aestheticScore: number;
  readonly scoreBreakdown: {
    readonly typographyLegibility: number;
    readonly spatialBalance: number;
    readonly focalProminence: number;
    readonly brandDignity: number;
    readonly colorHarmony: number;
  };
}

export interface RenderPreviewResult {
  readonly visualAssetId: string;
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
  readonly sha256: string;
  readonly previewUrl: string;
  readonly validation: ValidationAssessmentResult;
}

export interface ExportFormatOption {
  readonly format: 'SQUARE_1080' | 'PORTRAIT_4_5' | 'STORY_9_16';
  readonly encoding: 'PNG' | 'JPEG' | 'WEBP';
  readonly quality?: number;
}

export interface ExportResult {
  readonly exportJobId: string;
  readonly assetId: string;
  readonly format: string;
  readonly encoding: string;
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
  readonly sha256: string;
  readonly downloadToken: string;
  readonly downloadUrl: string;
  readonly expiresAt: string;
}

export interface TemplateDefinition {
  readonly id: SceneTemplateId;
  readonly name: string;
  readonly description: string;
  readonly supportedAspectRatios: readonly PosterAspectRatio[];
  readonly defaultLanguage: SceneLanguage;
  readonly version: string;
}
