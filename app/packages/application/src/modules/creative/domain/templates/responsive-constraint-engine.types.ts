import type { PosterAspectRatio } from '../poster-spec.js';
import type {
  SafeMarginTokens,
  TypographyRole,
  TemplateSlotIdentifier,
} from './template-registry.types.js';
import type { WrappedTextResult } from '../services/text-layout-engine.js';
import type { LayoutManifestElement, PosterLayoutManifest } from '../poster-templates.js';

/**
 * 2D Bounding box with integer coordinates and dimensions.
 */
export interface LayoutBoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Explicit Z-order tiers governing deterministic visual depth.
 */
export const LAYOUT_Z_TIERS = {
  BACKGROUND_PANEL: 10,
  DECORATIVE_FRAME: 20,
  DECORATIVE_ORNAMENT: 30,
  PRODUCT_SHADOW: 40,
  PRODUCT_HERO: 50,
  DECORATIVE_DIVIDER: 60,
  TYPOGRAPHY: 70,
  CALL_TO_ACTION: 80,
  BRAND_LOGO: 90,
} as const;

export type LayoutZTier = (typeof LAYOUT_Z_TIERS)[keyof typeof LAYOUT_Z_TIERS];

/**
 * Geometric canvas and safe margins state.
 */
export interface CanvasGeometry {
  readonly width: number;
  readonly height: number;
  readonly aspectRatio: PosterAspectRatio;
  readonly safeMargins: SafeMarginTokens;
  readonly usableArea: LayoutBoundingBox;
}

/**
 * Column allocation within responsive grid.
 */
export interface GridColumnGeometry {
  readonly columnIndex: number;
  readonly bounds: LayoutBoundingBox;
}

/**
 * Computed responsive grid zones.
 */
export interface ResponsiveGridGeometry {
  readonly columns: readonly GridColumnGeometry[];
  readonly gutter: number;
  readonly splitRatio: number;
  readonly heroZone: LayoutBoundingBox;
  readonly contentZone: LayoutBoundingBox;
}

/**
 * Input dimensions for product cutout asset.
 */
export interface ProductBoundsInput {
  readonly originalWidth: number;
  readonly originalHeight: number;
}

/**
 * Computed product placement adhering to zero-cropping and optical grounding invariants.
 */
export interface ProductFitResult {
  readonly boundingBox: LayoutBoundingBox;
  readonly pedestalY: number;
  readonly scale: number;
  readonly contactShadowBox: LayoutBoundingBox;
  readonly opticalGrounding: 'CENTER' | 'LEFT' | 'RIGHT';
}

/**
 * Computed logo placement with non-intrusive clear space zone.
 */
export interface LogoSafeZone {
  readonly boundingBox: LayoutBoundingBox;
  readonly clearArea: LayoutBoundingBox;
  readonly placement: 'TOP_LEFT' | 'TOP_CENTER' | 'TOP_RIGHT';
}

/**
 * Input parameters for single slot reflow and wrapping.
 */
export interface ReflowSlotInput {
  readonly slotId: TemplateSlotIdentifier;
  readonly text?: string | undefined;
  readonly required: boolean;
  readonly role?: TypographyRole | undefined;
  readonly spacingAfter?: number | undefined;
}

/**
 * Result of slot reflow, recording visibility, bounds, and wrapped text lines.
 */
export interface ReflowSlotResult {
  readonly slotId: TemplateSlotIdentifier;
  readonly visible: boolean;
  readonly boundingBox: LayoutBoundingBox;
  readonly wrappedText?: WrappedTextResult | undefined;
  readonly text?: string | undefined;
}

/**
 * Diagnostic record when two bounding boxes violate separation constraints.
 */
export interface CollisionViolation {
  readonly elementA: string;
  readonly elementB: string;
  readonly boxA: LayoutBoundingBox;
  readonly boxB: LayoutBoundingBox;
  readonly minSeparation: number;
  readonly actualOverlap: {
    readonly xOverlap: number;
    readonly yOverlap: number;
  };
}

/**
 * Audit verifying compliance with minimum negative space tokens.
 */
export interface NegativeSpaceAudit {
  readonly totalCanvasArea: number;
  readonly totalUsableArea: number;
  readonly occupiedArea: number;
  readonly negativeSpaceArea: number;
  readonly negativeSpaceRatio: number;
  readonly minRequiredRatio: number;
  readonly compliant: boolean;
}

/**
 * Unified resolved layout element with explicit Z-index and bounding box.
 */
export interface ResolvedLayoutElement {
  readonly id: string;
  readonly type: LayoutManifestElement['type'];
  readonly zIndex: number;
  readonly boundingBox: LayoutBoundingBox;
  readonly text?: string | undefined;
  readonly role?: TypographyRole | undefined;
}

/**
 * Complete, verified responsive layout solution produced by the constraint engine.
 */
export interface ResponsiveLayoutSolution {
  readonly canvas: CanvasGeometry;
  readonly grid: ResponsiveGridGeometry;
  readonly product: ProductFitResult;
  readonly logo?: LogoSafeZone | undefined;
  readonly slots: readonly ReflowSlotResult[];
  readonly elements: readonly ResolvedLayoutElement[];
  readonly negativeSpace: NegativeSpaceAudit;
  readonly manifest: PosterLayoutManifest;
}
