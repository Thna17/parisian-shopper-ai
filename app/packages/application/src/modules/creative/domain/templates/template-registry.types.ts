import type { PosterAspectRatio } from '../poster-spec.js';

/**
 * The five canonical template family identifiers mandated by
 * Master Engineering Blueprint v3.0 §11.1, Implementation Plan v1.0 §W22,
 * and Approved Business Decision W03-DEC-006.
 */
export const CANONICAL_TEMPLATE_IDS = [
  'CENTERED_HERO',
  'EDITORIAL_SPLIT',
  'KHMER_SEASONAL',
  'SCENT_STORY',
  'PROMOTION_PRICE_CTA',
] as const;

export type CanonicalTemplateId = (typeof CANONICAL_TEMPLATE_IDS)[number];

/**
 * Immutable template version lifecycle states.
 * - DRAFT: Under development or evaluation; prohibited in production.
 * - APPROVED: Signed off by Brand Owner; eligible for production creative generation.
 * - DEPRECATED: Historical scenes remain valid; new production generation prohibited.
 * - RETIRED: Archived; preserved strictly for historical audit re-rendering.
 */
export const TEMPLATE_LIFECYCLE_STATES = ['DRAFT', 'APPROVED', 'DEPRECATED', 'RETIRED'] as const;

export type TemplateLifecycleState = (typeof TEMPLATE_LIFECYCLE_STATES)[number];

/**
 * Semantic version pattern for immutable template definitions.
 */
export type TemplateSemVer = `${number}.${number}.${number}`;

// ---------------------------------------------------------------------------
// Design Token Contracts
// ---------------------------------------------------------------------------

export interface TemplateSpacingTokens {
  readonly xs: number;
  readonly sm: number;
  readonly md: number;
  readonly lg: number;
  readonly xl: number;
  readonly xxl: number;
  readonly gutter: number;
  readonly section: number;
}

export interface SafeMarginTokens {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

export type TypographyRole =
  | 'HEADLINE'
  | 'SECONDARY_HEADLINE'
  | 'EYEBROW'
  | 'BODY'
  | 'PRICE'
  | 'PROMO_PRICE'
  | 'CTA'
  | 'LABEL'
  | 'CHIP';

export interface TypographyRoleToken {
  readonly role: TypographyRole;
  readonly fontFamily: 'Playfair Display' | 'Montserrat' | 'Noto Sans Khmer';
  readonly fontSize: number;
  readonly fontWeight: number;
  readonly lineHeight: number;
  readonly letterSpacing: number; // in pixels
  readonly minFontSize: number;
  readonly maxLines: number;
}

export interface ColorRoleTokens {
  readonly backgroundTint: string;
  readonly panelSurface: string;
  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly accentPrimary: string;
  readonly accentMuted: string;
  readonly borderSubtle: string;
  readonly ctaBackground: string;
  readonly ctaText: string;
  readonly discountBadgeBackground?: string | undefined;
  readonly discountBadgeText?: string | undefined;
}

export interface CornerRadiusTokens {
  readonly none: 0;
  readonly sm: number;
  readonly md: number;
  readonly lg: number;
  readonly pill: 9999;
}

export interface StrokeWeightTokens {
  readonly hairline: number;
  readonly thin: number;
  readonly medium: number;
  readonly thick: number;
}

export interface ShadowTokens {
  readonly contact: {
    readonly opacity: number;
    readonly blurRadius: number;
    readonly verticalOffset: number;
    readonly spreadMultiplier: number;
  };
  readonly elevation: {
    readonly opacity: number;
    readonly blurRadius: number;
    readonly verticalOffset: number;
  };
  readonly ambient: {
    readonly opacity: number;
    readonly blurRadius: number;
  };
}

export interface ProductScaleLimitTokens {
  readonly minHeroRatio: number;
  readonly maxHeroRatio: number;
  readonly idealHeroRatio: number;
  readonly maxHeroHeightPercent: number;
  readonly pedestalBaselinePercent: number;
  readonly opticalGrounding: 'CENTER' | 'LEFT' | 'RIGHT';
}

export interface LogoConstraintTokens {
  readonly maxWidth: number;
  readonly maxHeight: number;
  readonly clearSpace: number;
  readonly placement: 'TOP_LEFT' | 'TOP_CENTER' | 'TOP_RIGHT';
}

export type DecorationDensity = 'NONE' | 'MINIMAL' | 'BALANCED' | 'ORNATE';

export interface GridAlignmentTokens {
  readonly horizontalAlignment: 'LEFT' | 'CENTER' | 'RIGHT';
  readonly splitRatio: number; // e.g. 0.44 for editorial split, 0.50 for centered
  readonly columns: 1 | 2;
}

export interface NegativeSpaceTokens {
  readonly reservedNegativeSpacePercent: number; // e.g. 0.25 (minimum 25% negative space)
  readonly maxEdgeDensity: number; // max allowable edge frequency in reserved space
}

/**
 * Format-specific design tokens adapting the family between 1:1, 4:5, and 9:16.
 */
export interface FormatDesignTokens {
  readonly aspectRatio: PosterAspectRatio;
  readonly width: number;
  readonly height: number;
  readonly safeMargins: SafeMarginTokens;
  readonly productScale: ProductScaleLimitTokens;
  readonly logoConstraints: LogoConstraintTokens;
  readonly gridAlignment: GridAlignmentTokens;
  readonly negativeSpace: NegativeSpaceTokens;
  readonly typographyScaleOverrides?:
    Partial<Record<TypographyRole, Partial<TypographyRoleToken>>> | undefined;
}

/**
 * Complete, structured design token bundle governing a template family.
 */
export interface TemplateDesignTokens {
  readonly tokenSetVersion: string;
  readonly spacing: TemplateSpacingTokens;
  readonly cornerRadii: CornerRadiusTokens;
  readonly strokeWeights: StrokeWeightTokens;
  readonly shadows: ShadowTokens;
  readonly colorRoles: ColorRoleTokens;
  readonly decorationDensity: DecorationDensity;
  readonly baseTypographyRoles: Record<TypographyRole, TypographyRoleToken>;
  readonly formatAdaptations: Record<PosterAspectRatio, FormatDesignTokens>;
}

// ---------------------------------------------------------------------------
// Content Slot Contracts
// ---------------------------------------------------------------------------

export type TemplateSlotIdentifier =
  | 'brandLogo'
  | 'campaignEyebrow'
  | 'headline'
  | 'secondaryHeadline'
  | 'supportingText'
  | 'primaryPrice'
  | 'promotionalPrice'
  | 'productSpecs'
  | 'callToAction'
  | 'scentNotes'
  | 'decorativeFrame'
  | 'decorativeDivider'
  | 'decorativeOrnament';

export interface TemplateSlotDefinition {
  readonly slotId: TemplateSlotIdentifier;
  readonly required: boolean;
  readonly role: TypographyRole | 'GRAPHIC_LOGO' | 'DECORATIVE_ACCENT' | 'PRODUCT_CUTOUT';
  readonly maxLength?: number | undefined;
  readonly description: string;
}

// ---------------------------------------------------------------------------
// Template Provenance & Definition Contracts
// ---------------------------------------------------------------------------

export interface TemplateProvenance {
  readonly templateId: CanonicalTemplateId;
  readonly version: TemplateSemVer;
  readonly tokenSetVersion: string;
  readonly approvalState: TemplateLifecycleState;
  readonly approverRef?: string | null | undefined;
  readonly approvedAt?: string | null | undefined; // ISO 8601 UTC timestamp or null/undefined when DRAFT
  readonly sourceDecisionRef: string; // e.g. 'W03-DEC-006'
  readonly contentDigest: string; // SHA-256 of canonical JSON serialized definition
}

export interface ApproveTemplateInput {
  readonly templateId: CanonicalTemplateId;
  readonly version: TemplateSemVer;
  readonly tokenSetVersion: string;
  readonly contentDigest: string;
  readonly approverRef: string;
  readonly approvedAt: string;
  readonly sourceDecisionRef?: string | undefined;
}

export interface TemplateDefinition {
  readonly id: CanonicalTemplateId;
  readonly version: TemplateSemVer;
  readonly name: string;
  readonly description: string;
  readonly category: 'HERO' | 'EDITORIAL' | 'CULTURAL' | 'EDUCATIONAL' | 'COMMERCIAL';
  readonly supportedAspectRatios: readonly PosterAspectRatio[];
  readonly supportedLanguages: readonly ('EN' | 'KM' | 'BILINGUAL')[];
  readonly slots: readonly TemplateSlotDefinition[];
  readonly tokens: TemplateDesignTokens;
  readonly provenance: TemplateProvenance;
}

/**
 * Options for resolving templates from the registry.
 */
export interface ResolveTemplateOptions {
  readonly version?: TemplateSemVer | undefined;
  readonly allowNonApprovedForTesting?: boolean | undefined;
}
