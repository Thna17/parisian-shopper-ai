import type { PosterAspectRatio } from '../poster-spec.js';
import type { SafeMargins } from '../poster-tokens.js';
import type { BoundingBox } from '../services/text-layout-engine.js';

export type { PosterAspectRatio, SafeMargins, BoundingBox };

export type LayerGroup =
  | 'BACKGROUND'
  | 'SURFACE_SHADOW'
  | 'PRODUCT_HERO'
  | 'TYPOGRAPHY'
  | 'BRAND_DECORATION';

export type BackgroundLayerType =
  | 'GENERATED_BACKGROUND'
  | 'STATIC_CAS_BACKGROUND'
  | 'SOLID_COLOR_BACKGROUND'
  | 'GRADIENT_BACKGROUND';

export type SurfaceShadowLayerType =
  | 'CONTACT_SHADOW'
  | 'PEDESTAL_SURFACE'
  | 'DIRECTIONAL_DROP';

export type ProductHeroLayerType = 'HERO_CUTOUT';

export type TypographyLayerType = 'TYPOGRAPHY_BLOCK';

export type BrandDecorationLayerType =
  | 'BRAND_MARK'
  | 'BRAND_DIVIDER'
  | 'BRAND_FRAME';

export type SceneLayerType =
  | BackgroundLayerType
  | SurfaceShadowLayerType
  | ProductHeroLayerType
  | TypographyLayerType
  | BrandDecorationLayerType;

export type BlendMode =
  | 'NORMAL'
  | 'MULTIPLY'
  | 'SCREEN'
  | 'OVERLAY'
  | 'DARKEN'
  | 'LIGHTEN';

export interface CanvasDimensions {
  readonly width: number;
  readonly height: number;
}

export const APPROVED_POSTER_ASPECT_RATIOS = ['1:1', '4:5', '9:16'] as const;

export const STANDARD_ASPECT_RATIO_DIMENSIONS: Record<PosterAspectRatio, CanvasDimensions> = {
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '9:16': { width: 1080, height: 1920 },
};

export type SceneTemplateId =
  | 'CENTERED_HERO'
  | 'EDITORIAL_SPLIT'
  | 'KHMER_SEASONAL'
  | 'SCENT_STORY'
  | 'PROMOTION_PRICE_CTA';

export const CANONICAL_SCENE_TEMPLATES: readonly SceneTemplateId[] = [
  'CENTERED_HERO',
  'EDITORIAL_SPLIT',
  'KHMER_SEASONAL',
  'SCENT_STORY',
  'PROMOTION_PRICE_CTA',
] as const;

export type SceneLanguage = 'EN' | 'KM' | 'BILINGUAL';

export type SceneStatus =
  | 'DRAFT'
  | 'VALIDATED'
  | 'APPROVED'
  | 'SUPERSEDED'
  | 'INVALIDATED'
  | 'RENDER_FAILED'
  | 'GATES_FAILED'
  | 'STALE_FACTS';

export type SceneOperationCode =
  | 'INITIAL_DRAFT'
  | 'EDIT_TEXT'
  | 'EDIT_LAYOUT'
  | 'CHANGE_STYLE'
  | 'NEW_BACKGROUND'
  | 'CHANGE_PRODUCT'
  | 'REPROFILE'
  | 'MIGRATION';

export const LAYER_Z_INDEX_RANGES: Readonly<Record<LayerGroup, { readonly min: number; readonly max: number }>> = {
  BACKGROUND: { min: 0, max: 99 },
  SURFACE_SHADOW: { min: 100, max: 199 },
  PRODUCT_HERO: { min: 200, max: 299 },
  TYPOGRAPHY: { min: 300, max: 399 },
  BRAND_DECORATION: { min: 400, max: 499 },
} as const;

export const APPROVED_TYPOGRAPHY_FONTS = [
  'Playfair Display',
  'Montserrat',
  'Noto Sans Khmer',
] as const;

export type ApprovedTypographyFont = (typeof APPROVED_TYPOGRAPHY_FONTS)[number];

export interface GeneratedBackgroundPayload {
  readonly assetType: 'GENERATED_BACKGROUND';
  readonly casStorageKey: string;
  readonly sha256: string;
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: string;
}

export interface StaticCasBackgroundPayload {
  readonly assetType: 'STATIC_CAS_BACKGROUND';
  readonly casStorageKey: string;
  readonly sha256: string;
}

export interface SolidColorBackgroundPayload {
  readonly assetType: 'SOLID_COLOR_BACKGROUND';
  readonly color: string;
}

export interface GradientBackgroundPayload {
  readonly assetType: 'GRADIENT_BACKGROUND';
  readonly gradient: {
    readonly type: 'LINEAR' | 'RADIAL';
    readonly stops: readonly { readonly color: string; readonly offset: number }[];
  };
}

export type BackgroundPayload =
  | GeneratedBackgroundPayload
  | StaticCasBackgroundPayload
  | SolidColorBackgroundPayload
  | GradientBackgroundPayload;

export interface ContactShadowPayload {
  readonly shadowType: 'CONTACT_SHADOW';
  readonly blurRadius: number;
  readonly color: string;
  readonly opacity?: number | undefined;
  readonly offsetY?: number | undefined;
}

export interface PedestalSurfacePayload {
  readonly shadowType: 'PEDESTAL_SURFACE';
  readonly blurRadius: number;
  readonly color: string;
  readonly opacity?: number | undefined;
  readonly offsetY?: number | undefined;
}

export interface DirectionalDropPayload {
  readonly shadowType: 'DIRECTIONAL_DROP';
  readonly blurRadius: number;
  readonly color: string;
  readonly opacity?: number | undefined;
  readonly offsetY?: number | undefined;
}

export type SurfaceShadowPayload =
  | ContactShadowPayload
  | PedestalSurfacePayload
  | DirectionalDropPayload;

export interface ProductHeroPayload {
  readonly productSnapshotId: string;
  readonly productAssetId: string;
  readonly productAssetRegistrationId: string;
  readonly validationAssessmentId: string;
  readonly validatorVersion: string;
  readonly rightsEventId: string;
  readonly approvalEventId: string;
  readonly assetRole: 'HERO_CUTOUT';
  readonly casStorageKey: string;
  readonly sha256: string; // strictly lowercase 64-char hex
  readonly mimeType: 'image/png' | 'image/webp';
  readonly format: string;
  readonly byteSize: number;
  readonly width: number;
  readonly height: number;
  readonly pixelCount: number;
  readonly channels: number;
  readonly hasAlpha: true;
  readonly transparencyRatio: number;
  readonly rightsState: 'VERIFIED';
  readonly approvalDecision: 'APPROVED';
  readonly alphaEvidence: {
    readonly hasAlpha: boolean;
    readonly transparencyRatio: number;
  };
  readonly containmentConfig: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly containmentPassed: boolean;
  };
  readonly scale?: number | undefined;
  readonly rotationDegrees?: number | undefined;
  readonly shadow?: {
    readonly shadowType: string;
    readonly blurRadius: number;
    readonly color: string;
  } | undefined;
}

export interface TypographyTextElement {
  readonly text: string;
  readonly fontFamily: string;
  readonly fontWeight: number;
  readonly fontSize: number;
  readonly color: string;
  readonly lineHeight?: number | undefined;
  readonly letterSpacing?: number | undefined;
  readonly textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize' | undefined;
}

export interface TypographyPriceBadge {
  readonly regularPrice: string;
  readonly promoPrice?: string | undefined;
  readonly currency: string;
  readonly discountText?: string | undefined;
  readonly badgeBackground?: string | undefined;
  readonly badgeTextColor?: string | undefined;
}

export interface TypographyCtaButton {
  readonly text: string;
  readonly fontFamily: string;
  readonly fontWeight: number;
  readonly fontSize: number;
  readonly style?: string | undefined;
  readonly backgroundColor?: string | undefined;
  readonly textColor?: string | undefined;
}

export interface TypographyPayload {
  readonly headline: TypographyTextElement;
  readonly subheadline?: TypographyTextElement | undefined;
  readonly secondaryHeadline?: TypographyTextElement | undefined;
  readonly body?: TypographyTextElement | undefined;
  readonly priceBadge?: TypographyPriceBadge | undefined;
  readonly cta?: TypographyCtaButton | undefined;
  readonly supportingText?: TypographyTextElement | undefined;
}

export interface BrandMarkPayload {
  readonly logoType: 'VECTOR_EMBLEM' | 'IMAGE_CAS' | 'TEXT_MARK';
  readonly casStorageKey?: string | undefined;
  readonly color?: string | undefined;
  readonly clearSpacePx?: number | undefined;
  readonly text?: string | undefined;
}

export interface BrandDividerPayload {
  readonly divider: string;
  readonly color: string;
  readonly thicknessPx?: number | undefined;
  readonly widthPx?: number | undefined;
}

export interface BrandFramePayload {
  readonly frame: string;
  readonly color: string;
  readonly insetPx?: number | undefined;
  readonly thicknessPx?: number | undefined;
}

export type BrandPayload =
  | BrandMarkPayload
  | BrandDividerPayload
  | BrandFramePayload;

export type SceneLayerPayload =
  | BackgroundPayload
  | SurfaceShadowPayload
  | ProductHeroPayload
  | TypographyPayload
  | BrandPayload;

export interface LayerDependencyDraft {
  readonly id?: string | undefined;
  readonly sceneLayerId?: string | null | undefined;
  readonly sceneLayerKey?: string | null | undefined;
  readonly dependencyType:
    | 'PRODUCT_SNAPSHOT'
    | 'PRODUCT_ASSET'
    | 'PRODUCT_ASSET_REGISTRATION'
    | 'VALIDATION_ASSESSMENT'
    | 'RIGHTS_EVENT'
    | 'APPROVAL_EVENT'
    | 'CONTENT_VERSION'
    | 'BRAND_PROFILE'
    | 'FONT_ASSET'
    | 'TYPOGRAPHY_POLICY';
  readonly dependencyIdentifier: string;
  readonly evidenceIdentifier?: string | null | undefined;
  readonly immutableDigest: string;
  readonly sortOrder: number;
}

export interface LayerDependencyRecord {
  readonly id: string;
  readonly sceneVersionId: string;
  readonly sceneLayerId?: string | null | undefined;
  readonly dependencyType: string;
  readonly dependencyIdentifier: string;
  readonly evidenceIdentifier?: string | null | undefined;
  readonly immutableDigest: string;
  readonly sortOrder: number;
  readonly createdAt: Date;
}

export interface SceneLayerDraft {
  readonly id?: string | undefined;
  readonly layerKey: string;
  readonly layerGroup: LayerGroup;
  readonly layerType: SceneLayerType;
  readonly name: string;
  readonly zIndex: number;
  readonly visible: boolean;
  readonly opacity: number;
  readonly blendMode: BlendMode;
  readonly bounds: BoundingBox;
  readonly payload: SceneLayerPayload;
  readonly payloadSchemaVersion: number;
  readonly sortOrder: number;
  readonly dependencies?: readonly LayerDependencyDraft[] | undefined;
}

export interface SceneLayerRecord {
  readonly id: string;
  readonly sceneVersionId: string;
  readonly layerKey: string;
  readonly layerGroup: LayerGroup;
  readonly layerType: SceneLayerType;
  readonly name: string;
  readonly zIndex: number;
  readonly visible: boolean;
  readonly opacity: number;
  readonly blendMode: BlendMode;
  readonly bounds: BoundingBox;
  readonly payload: SceneLayerPayload;
  readonly payloadSchemaVersion: number;
  readonly layerHash: string;
  readonly sortOrder: number;
  readonly createdAt: Date;
  readonly dependencies?: readonly LayerDependencyRecord[] | undefined;
}

// Alias SceneLayer to SceneLayerRecord for convenience
export type SceneLayer = SceneLayerRecord;

export interface SceneVersionStateRecord {
  readonly id: string;
  readonly sceneVersionId: string;
  readonly status: SceneStatus;
  readonly isExportEligible: boolean;
  readonly invalidationReason?: string | null | undefined;
  readonly invalidatedAt?: Date | null | undefined;
  readonly updatedAt: Date;
}

export interface SceneInvalidationEventRecord {
  readonly id: string;
  readonly sceneVersionId: string;
  readonly reason: string;
  readonly divergedDependencyType: string;
  readonly expectedDigest: string;
  readonly actualDigest: string;
  readonly recordedByUserId?: string | null | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | null | undefined;
  readonly recordedAt: Date;
}

export interface CreativeSceneRecord {
  readonly id: string;
  readonly creativeJobId: string;
  readonly campaignId?: string | null | undefined;
  readonly title: string;
  readonly currentVersionNumber: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreativeSceneVersionRecord {
  readonly id: string;
  readonly sceneId: string;
  readonly versionNumber: number;
  readonly parentVersionId?: string | null | undefined;
  readonly aspectRatio: PosterAspectRatio;
  readonly width: number;
  readonly height: number;
  readonly templateId: SceneTemplateId;
  readonly templateVersion: string;
  readonly stylePresetId?: string | null | undefined;
  readonly language: SceneLanguage;
  readonly safeMargins: SafeMargins;
  readonly brandProfileVersionId: string;
  readonly sourceContentVersionId: string;
  readonly productSnapshotId: string;
  readonly sceneHash: string;
  readonly dependencyHash: string;
  readonly changeReason?: string | null | undefined;
  readonly operationCode?: SceneOperationCode | null | undefined;
  readonly requestedByUserId?: string | null | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | null | undefined;
  readonly createdAt: Date;
  readonly layers: readonly SceneLayerRecord[];
  readonly dependencies: readonly LayerDependencyRecord[];
  readonly state?: SceneVersionStateRecord | undefined;
}

export interface CreateInitialSceneInput {
  readonly creativeJobId: string;
  readonly campaignId?: string | null | undefined;
  readonly title: string;
  readonly aspectRatio: PosterAspectRatio;
  readonly templateId: SceneTemplateId;
  readonly templateVersion: string;
  readonly stylePresetId?: string | null | undefined;
  readonly language: SceneLanguage;
  readonly safeMargins: SafeMargins;
  readonly brandProfileVersionId: string;
  readonly sourceContentVersionId: string;
  readonly productSnapshotId: string;
  readonly layers: readonly SceneLayerDraft[];
  readonly requesterUserId: string;
  readonly requesterRoles: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>> | null | undefined;
}

export interface ReviseSceneInput {
  readonly sceneId: string;
  readonly expectedVersionNumber: number;
  readonly changeReason: string;
  readonly operationCode: SceneOperationCode;
  readonly requesterUserId: string;
  readonly requesterRoles: readonly string[];
  readonly templateId?: SceneTemplateId | undefined;
  readonly templateVersion?: string | undefined;
  readonly stylePresetId?: string | null | undefined;
  readonly language?: SceneLanguage | undefined;
  readonly safeMargins?: SafeMargins | undefined;
  readonly brandProfileVersionId?: string | undefined;
  readonly sourceContentVersionId?: string | undefined;
  readonly productSnapshotId?: string | undefined;
  readonly layers: readonly SceneLayerDraft[];
  readonly metadata?: Readonly<Record<string, unknown>> | null | undefined;
}

export interface OutboxEventDraft {
  readonly topic: string;
  readonly schemaVersion: number;
  readonly idempotencyKey: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly occurredAt: Date;
  readonly availableAt: Date;
}
