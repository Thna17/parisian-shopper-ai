import { z } from 'zod';
import type { PosterAspectRatio } from '../poster-spec.js';
import type { SafeMargins } from '../poster-tokens.js';
import type { BoundingBox } from '../services/text-layout-engine.js';
import {
  APPROVED_POSTER_ASPECT_RATIOS,
  APPROVED_TYPOGRAPHY_FONTS,
  LAYER_Z_INDEX_RANGES,
  STANDARD_ASPECT_RATIO_DIMENSIONS,
  type LayerGroup,
  type ProductHeroPayload,
  type SceneLayerDraft,
  type SceneLayerRecord,
  type TypographyPayload,
  type TypographyTextElement,
} from './creative-scene.types.js';
import {
  InvalidSceneLayerError,
  InvalidSceneZIndexError,
  InvalidTypographyFontError,
  InvalidTypographyWeightError,
  NegativeCoordinateSpaceError,
  SceneContainmentError,
  UnsupportedAspectRatioError,
} from './creative-scene-errors.js';

// ============================================================================
// Runtime Strict Zod Schemas
// ============================================================================

export const BoundsSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite(),
    height: z.number().finite(),
  })
  .strict();

export const BlendModeSchema = z.enum([
  'NORMAL',
  'MULTIPLY',
  'SCREEN',
  'OVERLAY',
  'DARKEN',
  'LIGHTEN',
]);

export const GeneratedBackgroundPayloadSchema = z
  .object({
    assetType: z.literal('GENERATED_BACKGROUND'),
    casStorageKey: z.string().startsWith('cas/'),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    provider: z.string().min(1),
    model: z.string().min(1),
    promptVersion: z.string().min(1),
  })
  .strict();

export const StaticCasBackgroundPayloadSchema = z
  .object({
    assetType: z.literal('STATIC_CAS_BACKGROUND'),
    casStorageKey: z.string().startsWith('cas/'),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

export const SolidColorBackgroundPayloadSchema = z
  .object({
    assetType: z.literal('SOLID_COLOR_BACKGROUND'),
    color: z.string().min(1),
  })
  .strict();

export const GradientBackgroundPayloadSchema = z
  .object({
    assetType: z.literal('GRADIENT_BACKGROUND'),
    gradient: z
      .object({
        type: z.enum(['LINEAR', 'RADIAL']),
        stops: z
          .array(
            z
              .object({
                color: z.string().min(1),
                offset: z.number().finite().min(0).max(1),
              })
              .strict(),
          )
          .min(2),
      })
      .strict(),
  })
  .strict();

export const BackgroundPayloadSchema = z.discriminatedUnion('assetType', [
  GeneratedBackgroundPayloadSchema,
  StaticCasBackgroundPayloadSchema,
  SolidColorBackgroundPayloadSchema,
  GradientBackgroundPayloadSchema,
]);

export const ContactShadowPayloadSchema = z
  .object({
    shadowType: z.literal('CONTACT_SHADOW'),
    blurRadius: z.number().finite().nonnegative(),
    color: z.string().min(1),
    opacity: z.number().finite().min(0).max(1).optional(),
    offsetY: z.number().finite().optional(),
  })
  .strict();

export const PedestalSurfacePayloadSchema = z
  .object({
    shadowType: z.literal('PEDESTAL_SURFACE'),
    blurRadius: z.number().finite().nonnegative(),
    color: z.string().min(1),
    opacity: z.number().finite().min(0).max(1).optional(),
    offsetY: z.number().finite().optional(),
  })
  .strict();

export const DirectionalDropPayloadSchema = z
  .object({
    shadowType: z.literal('DIRECTIONAL_DROP'),
    blurRadius: z.number().finite().nonnegative(),
    color: z.string().min(1),
    opacity: z.number().finite().min(0).max(1).optional(),
    offsetY: z.number().finite().optional(),
  })
  .strict();

export const SurfaceShadowPayloadSchema = z.discriminatedUnion('shadowType', [
  ContactShadowPayloadSchema,
  PedestalSurfacePayloadSchema,
  DirectionalDropPayloadSchema,
]);

export const ProductHeroPayloadSchema = z
  .object({
    productSnapshotId: z.string().uuid(),
    productAssetId: z.string().uuid(),
    productAssetRegistrationId: z.string().uuid(),
    validationAssessmentId: z.string().uuid(),
    validatorVersion: z.string().min(1),
    rightsEventId: z.string().uuid(),
    approvalEventId: z.string().uuid(),
    assetRole: z.literal('HERO_CUTOUT'),
    casStorageKey: z.string().startsWith('cas/'),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    mimeType: z.enum(['image/png', 'image/webp']),
    format: z.string().min(1),
    byteSize: z.number().int().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    pixelCount: z.number().int().positive(),
    channels: z.number().int().positive(),
    hasAlpha: z.literal(true),
    transparencyRatio: z.number().finite().positive().max(1),
    rightsState: z.literal('VERIFIED'),
    approvalDecision: z.literal('APPROVED'),
    alphaEvidence: z
      .object({
        hasAlpha: z.literal(true),
        transparencyRatio: z.number().finite().positive().max(1),
      })
      .strict(),
    containmentConfig: z
      .object({
        x: z.number().finite().nonnegative(),
        y: z.number().finite().nonnegative(),
        width: z.number().finite().positive(),
        height: z.number().finite().positive(),
        containmentPassed: z.literal(true),
      })
      .strict(),
    scale: z.number().finite().positive().optional(),
    rotationDegrees: z.number().finite().optional(),
    shadow: z
      .object({
        shadowType: z.string().min(1),
        blurRadius: z.number().finite().nonnegative(),
        color: z.string().min(1),
      })
      .strict()
      .optional(),
  })
  .strict();

export const TypographyTextElementSchema = z
  .object({
    text: z.string().min(1),
    fontFamily: z.enum(['Playfair Display', 'Montserrat', 'Noto Sans Khmer']),
    fontWeight: z.number().int().positive(),
    fontSize: z.number().finite().positive(),
    color: z.string().min(1),
    lineHeight: z.number().finite().positive().optional(),
    letterSpacing: z.number().finite().optional(),
    textTransform: z.enum(['none', 'uppercase', 'lowercase', 'capitalize']).optional(),
  })
  .strict();

export const TypographyPriceBadgeSchema = z
  .object({
    regularPrice: z.string().min(1),
    promoPrice: z.string().optional(),
    currency: z.string().min(1),
    discountText: z.string().optional(),
    badgeBackground: z.string().optional(),
    badgeTextColor: z.string().optional(),
  })
  .strict();

export const TypographyCtaButtonSchema = z
  .object({
    text: z.string().min(1),
    fontFamily: z.enum(['Playfair Display', 'Montserrat', 'Noto Sans Khmer']),
    fontWeight: z.number().int().positive(),
    fontSize: z.number().finite().positive(),
    style: z.string().optional(),
    backgroundColor: z.string().optional(),
    textColor: z.string().optional(),
  })
  .strict();

export const TypographyPayloadSchema = z
  .object({
    headline: TypographyTextElementSchema,
    subheadline: TypographyTextElementSchema.optional(),
    secondaryHeadline: TypographyTextElementSchema.optional(),
    body: TypographyTextElementSchema.optional(),
    priceBadge: TypographyPriceBadgeSchema.optional(),
    cta: TypographyCtaButtonSchema.optional(),
    supportingText: TypographyTextElementSchema.optional(),
  })
  .strict();

export const BrandMarkPayloadSchema = z
  .object({
    logoType: z.enum(['VECTOR_EMBLEM', 'IMAGE_CAS', 'TEXT_MARK']),
    casStorageKey: z.string().startsWith('cas/').optional(),
    color: z.string().min(1).optional(),
    clearSpacePx: z.number().finite().nonnegative().optional(),
    text: z.string().min(1).optional(),
  })
  .strict();

export const BrandDividerPayloadSchema = z
  .object({
    divider: z.string().min(1),
    color: z.string().min(1),
    thicknessPx: z.number().finite().positive().optional(),
    widthPx: z.number().finite().positive().optional(),
  })
  .strict();

export const BrandFramePayloadSchema = z
  .object({
    frame: z.string().min(1),
    color: z.string().min(1),
    insetPx: z.number().finite().nonnegative().optional(),
    thicknessPx: z.number().finite().positive().optional(),
  })
  .strict();

export const BrandPayloadSchema = z.union([
  BrandMarkPayloadSchema,
  BrandDividerPayloadSchema,
  BrandFramePayloadSchema,
]);

export const SceneLayerSchema = z
  .object({
    id: z.string().uuid().optional(),
    layerKey: z.string().regex(/^[a-zA-Z0-9_-]+$/),
    layerGroup: z.enum([
      'BACKGROUND',
      'SURFACE_SHADOW',
      'PRODUCT_HERO',
      'TYPOGRAPHY',
      'BRAND_DECORATION',
    ]),
    layerType: z.string().min(1),
    name: z.string().min(1),
    zIndex: z.number().int(),
    visible: z.boolean(),
    opacity: z.number().finite().min(0).max(1),
    blendMode: BlendModeSchema,
    bounds: BoundsSchema,
    payloadSchemaVersion: z.number().int().positive(),
    sortOrder: z.number().int(),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

// ============================================================================
// Semantic & Domain Validations
// ============================================================================

export function assertFiniteNumber(value: number, fieldName: string, layerId: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || Number.isNaN(value)) {
    throw new InvalidSceneLayerError(
      layerId,
      `Field "${fieldName}" must be a finite number; got ${String(value)}`,
    );
  }
}

export function validateSafePathString(str: string, fieldName: string, layerId: string): void {
  if (!str || typeof str !== 'string') {
    throw new InvalidSceneLayerError(layerId, `Field "${fieldName}" must be a non-empty string`);
  }
  if (str.startsWith('/') || str.startsWith('\\')) {
    throw new InvalidSceneLayerError(
      layerId,
      `Field "${fieldName}" must not be an absolute path; got "${str}"`,
    );
  }
  if (str.includes('..')) {
    throw new InvalidSceneLayerError(
      layerId,
      `Field "${fieldName}" must not contain path traversal ".."; got "${str}"`,
    );
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(str)) {
    throw new InvalidSceneLayerError(
      layerId,
      `Field "${fieldName}" must not contain URL scheme; got "${str}"`,
    );
  }
}

export function validateCasStorageKey(casKey: string, layerId: string): void {
  validateSafePathString(casKey, 'casStorageKey', layerId);
  if (!casKey.startsWith('cas/')) {
    throw new InvalidSceneLayerError(
      layerId,
      `CAS storage key must start with "cas/"; got "${casKey}"`,
    );
  }
}

export function validateSha256Digest(digest: string, fieldName: string, layerId: string): void {
  if (!digest || typeof digest !== 'string') {
    throw new InvalidSceneLayerError(layerId, `Field "${fieldName}" must be a 64-character hex string`);
  }
  if (!/^[0-9a-f]{64}$/.test(digest)) {
    throw new InvalidSceneLayerError(
      layerId,
      `Field "${fieldName}" must be strictly lowercase 64-character hex SHA-256 digest; got "${digest}"`,
    );
  }
}

export function validateBoundingBox(bounds: BoundingBox, layerId: string): void {
  assertFiniteNumber(bounds.x, 'bounds.x', layerId);
  assertFiniteNumber(bounds.y, 'bounds.y', layerId);
  assertFiniteNumber(bounds.width, 'bounds.width', layerId);
  assertFiniteNumber(bounds.height, 'bounds.height', layerId);

  if (bounds.x < 0) {
    throw new NegativeCoordinateSpaceError(layerId, 'x', bounds.x);
  }
  if (bounds.y < 0) {
    throw new NegativeCoordinateSpaceError(layerId, 'y', bounds.y);
  }
  if (bounds.width <= 0) {
    throw new NegativeCoordinateSpaceError(layerId, 'width', bounds.width);
  }
  if (bounds.height <= 0) {
    throw new NegativeCoordinateSpaceError(layerId, 'height', bounds.height);
  }
}

export function validateLayerZIndex(layerId: string, group: LayerGroup, zIndex: number): void {
  assertFiniteNumber(zIndex, 'zIndex', layerId);
  if (!Number.isInteger(zIndex)) {
    throw new InvalidSceneZIndexError(
      layerId,
      group,
      zIndex,
      'integer',
    );
  }
  const range = LAYER_Z_INDEX_RANGES[group];
  if (zIndex < range.min || zIndex > range.max) {
    throw new InvalidSceneZIndexError(
      layerId,
      group,
      zIndex,
      `${range.min} - ${range.max}`,
    );
  }
}

export function validateTypographyFont(
  fontFamily: string,
  fontWeight: number,
  elementName: string,
  layerId: string,
): void {
  assertFiniteNumber(fontWeight, `${elementName}.fontWeight`, layerId);
  if (!Number.isInteger(fontWeight)) {
    throw new InvalidTypographyWeightError(
      fontFamily,
      fontWeight,
      `Font weight must be an integer; got ${fontWeight}`,
    );
  }

  if (!APPROVED_TYPOGRAPHY_FONTS.includes(fontFamily as (typeof APPROVED_TYPOGRAPHY_FONTS)[number])) {
    throw new InvalidTypographyFontError(fontFamily, APPROVED_TYPOGRAPHY_FONTS);
  }

  if (fontFamily === 'Playfair Display') {
    if (fontWeight < 400 || fontWeight > 900) {
      throw new InvalidTypographyWeightError(
        fontFamily,
        fontWeight,
        `Playfair Display display text requires weights 400-900 per W03-DEC-007; got ${fontWeight}`,
      );
    }
  } else if (fontFamily === 'Montserrat') {
    if (fontWeight < 100 || fontWeight > 900) {
      throw new InvalidTypographyWeightError(
        fontFamily,
        fontWeight,
        `Montserrat requires weights 100-900; got ${fontWeight}`,
      );
    }
  } else if (fontFamily === 'Noto Sans Khmer') {
    if (fontWeight !== 400 && fontWeight !== 700) {
      throw new InvalidTypographyWeightError(
        fontFamily,
        fontWeight,
        `Noto Sans Khmer strictly requires weights 400 or 700 per W03-DEC-007; got ${fontWeight}`,
      );
    }
  }
}

export function validateProductHero(payload: ProductHeroPayload, layerId: string): void {
  if (payload.assetRole !== 'HERO_CUTOUT') {
    throw new InvalidSceneLayerError(
      layerId,
      `Asset role must be "HERO_CUTOUT" per W03-DEC-004; got "${String(payload.assetRole)}"`,
      { assetRole: payload.assetRole },
    );
  }

  if (payload.mimeType !== 'image/png' && payload.mimeType !== 'image/webp') {
    throw new InvalidSceneLayerError(
      layerId,
      `MIME type must be transparent "image/png" or "image/webp" per W03-DEC-004; got "${String(payload.mimeType)}"`,
      { mimeType: payload.mimeType },
    );
  }

  validateCasStorageKey(payload.casStorageKey, layerId);
  validateSha256Digest(payload.sha256, 'sha256', layerId);

  if (!payload.productSnapshotId || !payload.productAssetId || !payload.productAssetRegistrationId) {
    throw new InvalidSceneLayerError(
      layerId,
      'Product hero requires valid productSnapshotId, productAssetId, and productAssetRegistrationId evidence bindings',
    );
  }

  if (!payload.validationAssessmentId || !payload.validatorVersion) {
    throw new InvalidSceneLayerError(
      layerId,
      'Product hero requires validationAssessmentId and validatorVersion evidence bindings',
    );
  }

  if (!payload.rightsEventId || !payload.approvalEventId) {
    throw new InvalidSceneLayerError(
      layerId,
      'Product hero requires rightsEventId and approvalEventId evidence bindings',
    );
  }

  if (!payload.alphaEvidence || !payload.alphaEvidence.hasAlpha || payload.alphaEvidence.transparencyRatio <= 0) {
    throw new InvalidSceneLayerError(
      layerId,
      'Product hero must have alpha transparency evidence per W03-DEC-004',
    );
  }

  assertFiniteNumber(payload.alphaEvidence.transparencyRatio, 'alphaEvidence.transparencyRatio', layerId);

  if (!payload.containmentConfig) {
    throw new SceneContainmentError(layerId, 'Product hero requires containmentConfig');
  }

  if (payload.containmentConfig.containmentPassed !== true) {
    throw new SceneContainmentError(
      layerId,
      'containmentPassed cannot be false: product hero must pass containment before scene approval or rendering',
    );
  }

  assertFiniteNumber(payload.containmentConfig.x, 'containmentConfig.x', layerId);
  assertFiniteNumber(payload.containmentConfig.y, 'containmentConfig.y', layerId);
  assertFiniteNumber(payload.containmentConfig.width, 'containmentConfig.width', layerId);
  assertFiniteNumber(payload.containmentConfig.height, 'containmentConfig.height', layerId);

  if (payload.scale !== undefined) {
    assertFiniteNumber(payload.scale, 'scale', layerId);
    if (payload.scale <= 0) {
      throw new InvalidSceneLayerError(layerId, 'Product hero scale must be positive');
    }
  }
}

export function validateTypographyElement(
  element: TypographyTextElement,
  elementName: string,
  layerId: string,
): void {
  if (!element.text || element.text.trim() === '') {
    throw new InvalidSceneLayerError(
      layerId,
      `Typography element "${elementName}" text cannot be empty`,
    );
  }
  assertFiniteNumber(element.fontSize, `${elementName}.fontSize`, layerId);
  if (element.fontSize <= 0) {
    throw new InvalidSceneLayerError(
      layerId,
      `Typography element "${elementName}" fontSize must be positive; got ${element.fontSize}`,
    );
  }
  validateTypographyFont(element.fontFamily, element.fontWeight, elementName, layerId);
}

export function validateTypography(payload: TypographyPayload, layerId: string): void {
  validateTypographyElement(payload.headline, 'headline', layerId);

  if (payload.subheadline !== undefined) {
    validateTypographyElement(payload.subheadline, 'subheadline', layerId);
  }
  if (payload.secondaryHeadline !== undefined) {
    validateTypographyElement(payload.secondaryHeadline, 'secondaryHeadline', layerId);
  }
  if (payload.body !== undefined) {
    validateTypographyElement(payload.body, 'body', layerId);
  }
  if (payload.supportingText !== undefined) {
    validateTypographyElement(payload.supportingText, 'supportingText', layerId);
  }
  if (payload.cta !== undefined) {
    if (!payload.cta.text || payload.cta.text.trim() === '') {
      throw new InvalidSceneLayerError(layerId, 'Typography cta text cannot be empty');
    }
    assertFiniteNumber(payload.cta.fontSize, 'cta.fontSize', layerId);
    validateTypographyFont(payload.cta.fontFamily, payload.cta.fontWeight, 'cta', layerId);
  }
}

export function validateCanvasGeometry(
  aspectRatio: string,
  width: number,
  height: number,
  safeMargins: SafeMargins,
): void {
  if (!APPROVED_POSTER_ASPECT_RATIOS.includes(aspectRatio as PosterAspectRatio)) {
    throw new UnsupportedAspectRatioError(aspectRatio, APPROVED_POSTER_ASPECT_RATIOS);
  }

  const expected = STANDARD_ASPECT_RATIO_DIMENSIONS[aspectRatio as PosterAspectRatio];
  if (width !== expected.width || height !== expected.height) {
    throw new InvalidSceneLayerError(
      'canvas',
      `Dimensions ${width}x${height} do not match standard ${expected.width}x${expected.height} for aspect ratio ${aspectRatio}`,
      { width, height, expectedWidth: expected.width, expectedHeight: expected.height, aspectRatio },
    );
  }

  assertFiniteNumber(safeMargins.top, 'safeMargins.top', 'canvas');
  assertFiniteNumber(safeMargins.bottom, 'safeMargins.bottom', 'canvas');
  assertFiniteNumber(safeMargins.left, 'safeMargins.left', 'canvas');
  assertFiniteNumber(safeMargins.right, 'safeMargins.right', 'canvas');

  if (safeMargins.top < 0 || safeMargins.bottom < 0 || safeMargins.left < 0 || safeMargins.right < 0) {
    throw new InvalidSceneLayerError('canvas', 'Safe margins must be non-negative numbers');
  }

  if (safeMargins.left + safeMargins.right >= width) {
    throw new InvalidSceneLayerError(
      'canvas',
      `Horizontal safe margins (${safeMargins.left} + ${safeMargins.right} = ${safeMargins.left + safeMargins.right}) cannot consume or exceed canvas width (${width})`,
    );
  }

  if (safeMargins.top + safeMargins.bottom >= height) {
    throw new InvalidSceneLayerError(
      'canvas',
      `Vertical safe margins (${safeMargins.top} + ${safeMargins.bottom} = ${safeMargins.top + safeMargins.bottom}) cannot consume or exceed canvas height (${height})`,
    );
  }
}

export function validateSceneLayerDiscrimination(layer: SceneLayerDraft | SceneLayerRecord): void {
  if (!layer.layerKey || !/^[a-zA-Z0-9_-]+$/.test(layer.layerKey)) {
    throw new InvalidSceneLayerError(
      layer.layerKey || 'unknown',
      `layerKey must be alphanumeric with dashes or underscores; got "${layer.layerKey}"`,
    );
  }

  switch (layer.layerGroup) {
    case 'BACKGROUND': {
      const validTypes = [
        'GENERATED_BACKGROUND',
        'STATIC_CAS_BACKGROUND',
        'SOLID_COLOR_BACKGROUND',
        'GRADIENT_BACKGROUND',
      ];
      if (!validTypes.includes(layer.layerType)) {
        throw new InvalidSceneLayerError(
          layer.layerKey,
          `Invalid layerType "${layer.layerType}" for group BACKGROUND. Expected one of: ${validTypes.join(', ')}`,
        );
      }
      break;
    }
    case 'SURFACE_SHADOW': {
      const validTypes = ['CONTACT_SHADOW', 'PEDESTAL_SURFACE', 'DIRECTIONAL_DROP'];
      if (!validTypes.includes(layer.layerType)) {
        throw new InvalidSceneLayerError(
          layer.layerKey,
          `Invalid layerType "${layer.layerType}" for group SURFACE_SHADOW. Expected one of: ${validTypes.join(', ')}`,
        );
      }
      break;
    }
    case 'PRODUCT_HERO': {
      if (layer.layerType !== 'HERO_CUTOUT') {
        throw new InvalidSceneLayerError(
          layer.layerKey,
          `Invalid layerType "${layer.layerType}" for group PRODUCT_HERO. Expected HERO_CUTOUT`,
        );
      }
      break;
    }
    case 'TYPOGRAPHY': {
      if (layer.layerType !== 'TYPOGRAPHY_BLOCK') {
        throw new InvalidSceneLayerError(
          layer.layerKey,
          `Invalid layerType "${layer.layerType}" for group TYPOGRAPHY. Expected TYPOGRAPHY_BLOCK`,
        );
      }
      break;
    }
    case 'BRAND_DECORATION': {
      const validTypes = ['BRAND_MARK', 'BRAND_DIVIDER', 'BRAND_FRAME'];
      if (!validTypes.includes(layer.layerType)) {
        throw new InvalidSceneLayerError(
          layer.layerKey,
          `Invalid layerType "${layer.layerType}" for group BRAND_DECORATION. Expected one of: ${validTypes.join(', ')}`,
        );
      }
      break;
    }
    default: {
      throw new InvalidSceneLayerError(
        layer.layerKey,
        `Unknown layerGroup: "${String(layer.layerGroup)}"`,
      );
    }
  }
}

export function validateSceneLayerPayloadByType(
  layerType: string,
  layerGroup: LayerGroup,
  payload: unknown,
  layerKey: string,
): void {
  switch (layerType) {
    case 'GENERATED_BACKGROUND': {
      if (layerGroup !== 'BACKGROUND') {
        throw new InvalidSceneLayerError(
          layerKey,
          `Layer type "${layerType}" belongs to group BACKGROUND, not "${layerGroup}"`,
        );
      }
      const res = GeneratedBackgroundPayloadSchema.safeParse(payload);
      if (!res.success) {
        throw new InvalidSceneLayerError(
          layerKey,
          `GENERATED_BACKGROUND payload validation failed: ${res.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
          { issues: res.error.issues },
        );
      }
      break;
    }
    case 'STATIC_CAS_BACKGROUND': {
      if (layerGroup !== 'BACKGROUND') {
        throw new InvalidSceneLayerError(
          layerKey,
          `Layer type "${layerType}" belongs to group BACKGROUND, not "${layerGroup}"`,
        );
      }
      const res = StaticCasBackgroundPayloadSchema.safeParse(payload);
      if (!res.success) {
        throw new InvalidSceneLayerError(
          layerKey,
          `STATIC_CAS_BACKGROUND payload validation failed: ${res.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
          { issues: res.error.issues },
        );
      }
      break;
    }
    case 'SOLID_COLOR_BACKGROUND': {
      if (layerGroup !== 'BACKGROUND') {
        throw new InvalidSceneLayerError(
          layerKey,
          `Layer type "${layerType}" belongs to group BACKGROUND, not "${layerGroup}"`,
        );
      }
      const res = SolidColorBackgroundPayloadSchema.safeParse(payload);
      if (!res.success) {
        throw new InvalidSceneLayerError(
          layerKey,
          `SOLID_COLOR_BACKGROUND payload validation failed: ${res.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
          { issues: res.error.issues },
        );
      }
      break;
    }
    case 'GRADIENT_BACKGROUND': {
      if (layerGroup !== 'BACKGROUND') {
        throw new InvalidSceneLayerError(
          layerKey,
          `Layer type "${layerType}" belongs to group BACKGROUND, not "${layerGroup}"`,
        );
      }
      const res = GradientBackgroundPayloadSchema.safeParse(payload);
      if (!res.success) {
        throw new InvalidSceneLayerError(
          layerKey,
          `GRADIENT_BACKGROUND payload validation failed: ${res.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
          { issues: res.error.issues },
        );
      }
      break;
    }
    case 'CONTACT_SHADOW': {
      if (layerGroup !== 'SURFACE_SHADOW') {
        throw new InvalidSceneLayerError(
          layerKey,
          `Layer type "${layerType}" belongs to group SURFACE_SHADOW, not "${layerGroup}"`,
        );
      }
      const res = ContactShadowPayloadSchema.safeParse(payload);
      if (!res.success) {
        throw new InvalidSceneLayerError(
          layerKey,
          `CONTACT_SHADOW payload validation failed: ${res.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
          { issues: res.error.issues },
        );
      }
      break;
    }
    case 'PEDESTAL_SURFACE': {
      if (layerGroup !== 'SURFACE_SHADOW') {
        throw new InvalidSceneLayerError(
          layerKey,
          `Layer type "${layerType}" belongs to group SURFACE_SHADOW, not "${layerGroup}"`,
        );
      }
      const res = PedestalSurfacePayloadSchema.safeParse(payload);
      if (!res.success) {
        throw new InvalidSceneLayerError(
          layerKey,
          `PEDESTAL_SURFACE payload validation failed: ${res.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
          { issues: res.error.issues },
        );
      }
      break;
    }
    case 'DIRECTIONAL_DROP': {
      if (layerGroup !== 'SURFACE_SHADOW') {
        throw new InvalidSceneLayerError(
          layerKey,
          `Layer type "${layerType}" belongs to group SURFACE_SHADOW, not "${layerGroup}"`,
        );
      }
      const res = DirectionalDropPayloadSchema.safeParse(payload);
      if (!res.success) {
        throw new InvalidSceneLayerError(
          layerKey,
          `DIRECTIONAL_DROP payload validation failed: ${res.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
          { issues: res.error.issues },
        );
      }
      break;
    }
    case 'HERO_CUTOUT': {
      if (layerGroup !== 'PRODUCT_HERO') {
        throw new InvalidSceneLayerError(
          layerKey,
          `Layer type "${layerType}" belongs to group PRODUCT_HERO, not "${layerGroup}"`,
        );
      }
      const res = ProductHeroPayloadSchema.safeParse(payload);
      if (!res.success) {
        throw new InvalidSceneLayerError(
          layerKey,
          `HERO_CUTOUT payload validation failed: ${res.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
          { issues: res.error.issues },
        );
      }
      validateProductHero(payload as ProductHeroPayload, layerKey);
      break;
    }
    case 'TYPOGRAPHY_BLOCK': {
      if (layerGroup !== 'TYPOGRAPHY') {
        throw new InvalidSceneLayerError(
          layerKey,
          `Layer type "${layerType}" belongs to group TYPOGRAPHY, not "${layerGroup}"`,
        );
      }
      const res = TypographyPayloadSchema.safeParse(payload);
      if (!res.success) {
        throw new InvalidSceneLayerError(
          layerKey,
          `TYPOGRAPHY_BLOCK payload validation failed: ${res.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
          { issues: res.error.issues },
        );
      }
      validateTypography(payload as TypographyPayload, layerKey);
      break;
    }
    case 'BRAND_MARK': {
      if (layerGroup !== 'BRAND_DECORATION') {
        throw new InvalidSceneLayerError(
          layerKey,
          `Layer type "${layerType}" belongs to group BRAND_DECORATION, not "${layerGroup}"`,
        );
      }
      const res = BrandMarkPayloadSchema.safeParse(payload);
      if (!res.success) {
        throw new InvalidSceneLayerError(
          layerKey,
          `BRAND_MARK payload validation failed: ${res.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
          { issues: res.error.issues },
        );
      }
      break;
    }
    case 'BRAND_DIVIDER': {
      if (layerGroup !== 'BRAND_DECORATION') {
        throw new InvalidSceneLayerError(
          layerKey,
          `Layer type "${layerType}" belongs to group BRAND_DECORATION, not "${layerGroup}"`,
        );
      }
      const res = BrandDividerPayloadSchema.safeParse(payload);
      if (!res.success) {
        throw new InvalidSceneLayerError(
          layerKey,
          `BRAND_DIVIDER payload validation failed: ${res.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
          { issues: res.error.issues },
        );
      }
      break;
    }
    case 'BRAND_FRAME': {
      if (layerGroup !== 'BRAND_DECORATION') {
        throw new InvalidSceneLayerError(
          layerKey,
          `Layer type "${layerType}" belongs to group BRAND_DECORATION, not "${layerGroup}"`,
        );
      }
      const res = BrandFramePayloadSchema.safeParse(payload);
      if (!res.success) {
        throw new InvalidSceneLayerError(
          layerKey,
          `BRAND_FRAME payload validation failed: ${res.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
          { issues: res.error.issues },
        );
      }
      break;
    }
    default: {
      throw new InvalidSceneLayerError(
        layerKey,
        `Unknown or unsupported layerType: "${layerType}" for group "${layerGroup}"`,
      );
    }
  }
}

export function validateSceneLayer(
  layer: SceneLayerDraft | SceneLayerRecord,
  canvasWidth: number,
  canvasHeight: number,
  safeMargins: SafeMargins,
): void {
  // 1. Strict schema parse of layer structure
  const layerParseResult = SceneLayerSchema.safeParse(layer);
  if (!layerParseResult.success) {
    const errorDetails = layerParseResult.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new InvalidSceneLayerError(
      layer.layerKey || 'unknown',
      `Layer schema validation failed: ${errorDetails}`,
      { issues: layerParseResult.error.issues },
    );
  }

  // 2. Strict discrimination and payload schema check by layerType
  validateSceneLayerDiscrimination(layer);
  validateSceneLayerPayloadByType(layer.layerType, layer.layerGroup, layer.payload, layer.layerKey);

  // 3. Coordinate bounds and Z-index boundaries
  validateSceneLayerDiscrimination(layer);
  validateBoundingBox(layer.bounds, layer.layerKey);
  validateLayerZIndex(layer.layerKey, layer.layerGroup, layer.zIndex);

  // 4. Geometry rules
  if (layer.layerGroup === 'BACKGROUND') {
    if (
      layer.bounds.x !== 0 ||
      layer.bounds.y !== 0 ||
      layer.bounds.width !== canvasWidth ||
      layer.bounds.height !== canvasHeight
    ) {
      throw new InvalidSceneLayerError(
        layer.layerKey,
        `Background layer must cover 100% of canvas (0,0 ${canvasWidth}x${canvasHeight}); got (${layer.bounds.x},${layer.bounds.y} ${layer.bounds.width}x${layer.bounds.height})`,
      );
    }
  } else {
    if (layer.bounds.x + layer.bounds.width > canvasWidth) {
      throw new InvalidSceneLayerError(
        layer.layerKey,
        `Layer bounds exceed canvas width (${layer.bounds.x} + ${layer.bounds.width} > ${canvasWidth})`,
      );
    }
    if (layer.bounds.y + layer.bounds.height > canvasHeight) {
      throw new InvalidSceneLayerError(
        layer.layerKey,
        `Layer bounds exceed canvas height (${layer.bounds.y} + ${layer.bounds.height} > ${canvasHeight})`,
      );
    }
  }

  // 5. Typography and critical brand decoration safe margins
  if (layer.layerGroup === 'TYPOGRAPHY' || layer.layerType === 'BRAND_MARK') {
    const minX = safeMargins.left;
    const minY = safeMargins.top;
    const maxX = canvasWidth - safeMargins.right;
    const maxY = canvasHeight - safeMargins.bottom;

    if (
      layer.bounds.x < minX ||
      layer.bounds.y < minY ||
      layer.bounds.x + layer.bounds.width > maxX ||
      layer.bounds.y + layer.bounds.height > maxY
    ) {
      throw new InvalidSceneLayerError(
        layer.layerKey,
        `Layer of group "${layer.layerGroup}" violates safe area boundaries. Expected within [${minX}, ${minY}, ${maxX}, ${maxY}]; got [${layer.bounds.x}, ${layer.bounds.y}, ${layer.bounds.x + layer.bounds.width}, ${layer.bounds.y + layer.bounds.height}]`,
      );
    }
  }
}

export function validateSceneGraph(
  layers: readonly (SceneLayerDraft | SceneLayerRecord)[],
  aspectRatio: string,
  width: number,
  height: number,
  safeMargins: SafeMargins,
): void {
  validateCanvasGeometry(aspectRatio, width, height, safeMargins);

  if (!layers || layers.length === 0) {
    throw new InvalidSceneLayerError('scene', 'Scene must contain at least one layer');
  }

  const seenKeys = new Set<string>();
  const seenZIndexes = new Set<number>();
  const seenSortOrders = new Set<number>();
  let hasBackground = false;
  let hasHero = false;
  let hasTypography = false;

  for (const layer of layers) {
    if (seenKeys.has(layer.layerKey)) {
      throw new InvalidSceneLayerError(
        layer.layerKey,
        `Duplicate layerKey: "${layer.layerKey}"`,
      );
    }
    seenKeys.add(layer.layerKey);

    if (seenZIndexes.has(layer.zIndex)) {
      throw new InvalidSceneLayerError(
        layer.layerKey,
        `Duplicate zIndex: ${layer.zIndex} for layer "${layer.layerKey}"`,
      );
    }
    seenZIndexes.add(layer.zIndex);

    if (seenSortOrders.has(layer.sortOrder)) {
      throw new InvalidSceneLayerError(
        layer.layerKey,
        `Duplicate sortOrder: ${layer.sortOrder} for layer "${layer.layerKey}"`,
      );
    }
    seenSortOrders.add(layer.sortOrder);

    validateSceneLayer(layer, width, height, safeMargins);

    if (layer.layerGroup === 'BACKGROUND') hasBackground = true;
    if (layer.layerGroup === 'PRODUCT_HERO') hasHero = true;
    if (layer.layerGroup === 'TYPOGRAPHY') hasTypography = true;
  }

  if (!hasBackground) {
    throw new InvalidSceneLayerError('scene', 'Scene must contain at least one BACKGROUND layer');
  }
  if (!hasHero) {
    throw new InvalidSceneLayerError('scene', 'Scene must contain at least one PRODUCT_HERO layer');
  }
  if (!hasTypography) {
    throw new InvalidSceneLayerError('scene', 'Scene must contain at least one TYPOGRAPHY layer');
  }
}
