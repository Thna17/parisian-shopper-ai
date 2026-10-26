import { createHash } from 'node:crypto';
import {
  type CanonicalTemplateId,
  type TemplateDefinition,
  type TemplateProvenance,
  type TemplateSemVer,
  type TemplateDesignTokens,
  type ApproveTemplateInput,
  CANONICAL_TEMPLATE_IDS,
} from './template-registry.types.js';
import {
  TemplateNotFoundError,
  TemplateNotEligibleForProductionError,
  InvalidTemplateDefinitionError,
  DuplicateTemplateRegistrationError,
  TemplateDigestMismatchError,
} from '../creative-errors.js';

/**
 * Deep-freezes an object and all its nested properties to guarantee complete immutability.
 */
function deepFreeze<T extends object>(obj: T): Readonly<T> {
  const propNames = Object.getOwnPropertyNames(obj);
  for (const name of propNames) {
    const value = (obj as Record<string, unknown>)[name];
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return Object.freeze(obj);
}

/**
 * Canonical JSON serializer for deterministic content hashing.
 * Sorts object keys recursively, standardizes numbers, and excludes undefined.
 */
function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalStringify).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  const entries: string[] = [];
  for (const k of keys) {
    const v = (value as Record<string, unknown>)[k];
    if (v !== undefined) {
      entries.push(JSON.stringify(k) + ':' + canonicalStringify(v));
    }
  }
  return '{' + entries.join(',') + '}';
}

/**
 * Computes deterministic SHA-256 digest of a template definition (excluding any existing contentDigest).
 */
export function computeTemplateDefinitionDigest(
  def: Omit<TemplateDefinition, 'provenance'> & {
    readonly provenance: Omit<TemplateProvenance, 'contentDigest'>;
  },
): string {
  const canonical = canonicalStringify({
    id: def.id,
    version: def.version,
    name: def.name,
    description: def.description,
    category: def.category,
    supportedAspectRatios: def.supportedAspectRatios,
    supportedLanguages: def.supportedLanguages,
    slots: def.slots,
    tokens: def.tokens,
    provenance: {
      templateId: def.provenance.templateId,
      version: def.provenance.version,
      tokenSetVersion: def.provenance.tokenSetVersion,
      sourceDecisionRef: def.provenance.sourceDecisionRef,
    },
  });
  return createHash('sha256').update(canonical).digest('hex');
}

// ---------------------------------------------------------------------------
// Canonical Approved v1.0.0 Design Tokens (Reference Design Tokens)
// ---------------------------------------------------------------------------

function buildCanonicalTokens(options: {
  readonly alignment: 'LEFT' | 'CENTER';
  readonly splitRatio: number;
  readonly idealHeroRatio: number;
  readonly pedestalPercent: number;
  readonly decorationDensity: 'NONE' | 'MINIMAL' | 'BALANCED' | 'ORNATE';
}): TemplateDesignTokens {
  const { alignment, splitRatio, idealHeroRatio, pedestalPercent, decorationDensity } = options;

  return {
    tokenSetVersion: '2026.1',
    spacing: {
      xs: 8,
      sm: 16,
      md: 24,
      lg: 32,
      xl: 48,
      xxl: 64,
      gutter: 24,
      section: 40,
    },
    cornerRadii: {
      none: 0,
      sm: 4,
      md: 12,
      lg: 16,
      pill: 9999,
    },
    strokeWeights: {
      hairline: 0.8,
      thin: 1.2,
      medium: 1.5,
      thick: 2.5,
    },
    shadows: {
      contact: {
        opacity: 0.35,
        blurRadius: 4,
        verticalOffset: 0,
        spreadMultiplier: 1.05,
      },
      elevation: {
        opacity: 0.2,
        blurRadius: 12,
        verticalOffset: 6,
      },
      ambient: {
        opacity: 0.12,
        blurRadius: 24,
      },
    },
    colorRoles: {
      backgroundTint: '#0E0F12',
      panelSurface: 'rgba(14, 15, 18, 0.78)',
      textPrimary: '#FFFFFF',
      textSecondary: '#A0A4AB',
      accentPrimary: '#E5C07B',
      accentMuted: '#C5A059',
      borderSubtle: 'rgba(229, 192, 123, 0.24)',
      ctaBackground: '#E5C07B',
      ctaText: '#0E0F12',
      discountBadgeBackground: 'rgba(229, 192, 123, 0.18)',
      discountBadgeText: '#E5C07B',
    },
    decorationDensity,
    baseTypographyRoles: {
      HEADLINE: {
        role: 'HEADLINE',
        fontFamily: 'Playfair Display',
        fontSize: 54,
        fontWeight: 700,
        lineHeight: 1.15,
        letterSpacing: -0.5,
        minFontSize: 28,
        maxLines: 3,
      },
      SECONDARY_HEADLINE: {
        role: 'SECONDARY_HEADLINE',
        fontFamily: 'Noto Sans Khmer',
        fontSize: 24,
        fontWeight: 700,
        lineHeight: 1.3,
        letterSpacing: 0,
        minFontSize: 16,
        maxLines: 2,
      },
      EYEBROW: {
        role: 'EYEBROW',
        fontFamily: 'Montserrat',
        fontSize: 13,
        fontWeight: 600,
        lineHeight: 1.2,
        letterSpacing: 2.0,
        minFontSize: 11,
        maxLines: 1,
      },
      BODY: {
        role: 'BODY',
        fontFamily: 'Montserrat',
        fontSize: 18,
        fontWeight: 400,
        lineHeight: 1.4,
        letterSpacing: 0,
        minFontSize: 14,
        maxLines: 3,
      },
      PRICE: {
        role: 'PRICE',
        fontFamily: 'Montserrat',
        fontSize: 28,
        fontWeight: 700,
        lineHeight: 1.2,
        letterSpacing: -0.2,
        minFontSize: 20,
        maxLines: 1,
      },
      PROMO_PRICE: {
        role: 'PROMO_PRICE',
        fontFamily: 'Montserrat',
        fontSize: 32,
        fontWeight: 700,
        lineHeight: 1.2,
        letterSpacing: -0.2,
        minFontSize: 22,
        maxLines: 1,
      },
      CTA: {
        role: 'CTA',
        fontFamily: 'Montserrat',
        fontSize: 15,
        fontWeight: 600,
        lineHeight: 1.0,
        letterSpacing: 0.5,
        minFontSize: 13,
        maxLines: 1,
      },
      LABEL: {
        role: 'LABEL',
        fontFamily: 'Montserrat',
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 1.2,
        letterSpacing: 1.5,
        minFontSize: 10,
        maxLines: 1,
      },
      CHIP: {
        role: 'CHIP',
        fontFamily: 'Montserrat',
        fontSize: 13,
        fontWeight: 500,
        lineHeight: 1.2,
        letterSpacing: 0.2,
        minFontSize: 11,
        maxLines: 1,
      },
    },
    formatAdaptations: {
      '1:1': {
        aspectRatio: '1:1',
        width: 1080,
        height: 1080,
        safeMargins: { top: 76, bottom: 88, left: 65, right: 65 },
        productScale: {
          minHeroRatio: 0.28,
          maxHeroRatio: 0.55,
          idealHeroRatio: idealHeroRatio * 0.92,
          maxHeroHeightPercent: 0.5,
          pedestalBaselinePercent: pedestalPercent,
          opticalGrounding: alignment,
        },
        logoConstraints: {
          maxWidth: 140,
          maxHeight: 40,
          clearSpace: 20,
          placement: alignment === 'CENTER' ? 'TOP_CENTER' : 'TOP_LEFT',
        },
        gridAlignment: {
          horizontalAlignment: alignment,
          splitRatio,
          columns: 1,
        },
        negativeSpace: {
          reservedNegativeSpacePercent: 0.22,
          maxEdgeDensity: 32,
        },
        typographyScaleOverrides: {
          HEADLINE: { fontSize: 44, minFontSize: 24 },
          SECONDARY_HEADLINE: { fontSize: 20, minFontSize: 14 },
        },
      },
      '4:5': {
        aspectRatio: '4:5',
        width: 1080,
        height: 1350,
        safeMargins: { top: 95, bottom: 108, left: 65, right: 65 },
        productScale: {
          minHeroRatio: 0.32,
          maxHeroRatio: 0.62,
          idealHeroRatio,
          maxHeroHeightPercent: 0.58,
          pedestalBaselinePercent: pedestalPercent,
          opticalGrounding: alignment,
        },
        logoConstraints: {
          maxWidth: 160,
          maxHeight: 48,
          clearSpace: 24,
          placement: alignment === 'CENTER' ? 'TOP_CENTER' : 'TOP_LEFT',
        },
        gridAlignment: {
          horizontalAlignment: alignment,
          splitRatio,
          columns: 1,
        },
        negativeSpace: {
          reservedNegativeSpacePercent: 0.26,
          maxEdgeDensity: 30,
        },
      },
      '9:16': {
        aspectRatio: '9:16',
        width: 1080,
        height: 1920,
        safeMargins: { top: 140, bottom: 180, left: 75, right: 75 },
        productScale: {
          minHeroRatio: 0.35,
          maxHeroRatio: 0.65,
          idealHeroRatio: idealHeroRatio * 1.05,
          maxHeroHeightPercent: 0.62,
          pedestalBaselinePercent: pedestalPercent * 0.95,
          opticalGrounding: alignment,
        },
        logoConstraints: {
          maxWidth: 180,
          maxHeight: 52,
          clearSpace: 28,
          placement: alignment === 'CENTER' ? 'TOP_CENTER' : 'TOP_LEFT',
        },
        gridAlignment: {
          horizontalAlignment: alignment,
          splitRatio,
          columns: 1,
        },
        negativeSpace: {
          reservedNegativeSpacePercent: 0.34,
          maxEdgeDensity: 24,
        },
        typographyScaleOverrides: {
          HEADLINE: { fontSize: 58, minFontSize: 30 },
          SECONDARY_HEADLINE: { fontSize: 26, minFontSize: 18 },
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Canonical Approved v1.0.0 Template Definitions (APPROVED State)
// ---------------------------------------------------------------------------

export function createDraftTemplate(
  base: Omit<TemplateDefinition, 'provenance'>,
): TemplateDefinition {
  const provenanceDraft: Omit<TemplateProvenance, 'contentDigest'> = {
    templateId: base.id,
    version: base.version,
    tokenSetVersion: base.tokens.tokenSetVersion,
    approvalState: 'DRAFT',
    approverRef: null,
    approvedAt: null,
    sourceDecisionRef: 'W03-DEC-006',
  };
  const contentDigest = computeTemplateDefinitionDigest({
    ...base,
    provenance: provenanceDraft,
  });
  return deepFreeze({
    ...base,
    provenance: {
      ...provenanceDraft,
      contentDigest,
    },
  });
}

export function createApprovedTemplate(
  base: Omit<TemplateDefinition, 'provenance'>,
  approval: {
    readonly approverRef: string;
    readonly approvedAt: string;
    readonly sourceDecisionRef?: string;
  } = {
    approverRef: 'Project Owner Brathna',
    approvedAt: '2026-10-26T10:53:59.000Z',
    sourceDecisionRef: 'W03-DEC-006',
  },
): TemplateDefinition {
  const provenance: Omit<TemplateProvenance, 'contentDigest'> = {
    templateId: base.id,
    version: base.version,
    tokenSetVersion: base.tokens.tokenSetVersion,
    approvalState: 'APPROVED',
    approverRef: approval.approverRef,
    approvedAt: approval.approvedAt,
    sourceDecisionRef: approval.sourceDecisionRef ?? 'W03-DEC-006',
  };
  const contentDigest = computeTemplateDefinitionDigest({
    ...base,
    provenance,
  });
  return deepFreeze({
    ...base,
    provenance: {
      ...provenance,
      contentDigest,
    },
  });
}

export const CANONICAL_APPROVED_TEMPLATES: readonly TemplateDefinition[] = [
  // 1. CENTERED_HERO
  createApprovedTemplate({
    id: 'CENTERED_HERO',
    version: '1.0.0',
    name: 'Centered Luxury Product Hero',
    description:
      'Symmetrical luxury flacon presentation centered on a grounded pedestal with balanced top brand lockup and bottom conversion tier.',
    category: 'HERO',
    supportedAspectRatios: ['1:1', '4:5', '9:16'],
    supportedLanguages: ['EN', 'KM', 'BILINGUAL'],
    slots: [
      {
        slotId: 'headline',
        required: true,
        role: 'HEADLINE',
        maxLength: 45,
        description: 'Primary display title',
      },
      {
        slotId: 'primaryPrice',
        required: true,
        role: 'PRICE',
        maxLength: 20,
        description: 'Retail price tag',
      },
      {
        slotId: 'callToAction',
        required: true,
        role: 'CTA',
        maxLength: 28,
        description: 'Pill CTA button',
      },
      {
        slotId: 'campaignEyebrow',
        required: false,
        role: 'EYEBROW',
        maxLength: 24,
        description: 'Top label',
      },
      {
        slotId: 'secondaryHeadline',
        required: false,
        role: 'SECONDARY_HEADLINE',
        maxLength: 55,
        description: 'Bilingual subtitle',
      },
      {
        slotId: 'supportingText',
        required: false,
        role: 'BODY',
        maxLength: 90,
        description: 'Descriptive summary',
      },
      {
        slotId: 'promotionalPrice',
        required: false,
        role: 'PROMO_PRICE',
        maxLength: 20,
        description: 'Discount price',
      },
      {
        slotId: 'productSpecs',
        required: false,
        role: 'LABEL',
        maxLength: 40,
        description: 'Size and volume specs',
      },
      { slotId: 'brandLogo', required: false, role: 'GRAPHIC_LOGO', description: 'Brand crest' },
      {
        slotId: 'decorativeDivider',
        required: false,
        role: 'DECORATIVE_ACCENT',
        description: 'Subtle separator',
      },
    ],
    tokens: buildCanonicalTokens({
      alignment: 'CENTER',
      splitRatio: 0.5,
      idealHeroRatio: 0.56,
      pedestalPercent: 0.72,
      decorationDensity: 'MINIMAL',
    }),
  }),

  // 2. EDITORIAL_SPLIT
  createApprovedTemplate({
    id: 'EDITORIAL_SPLIT',
    version: '1.0.0',
    name: 'Editorial Split Layout',
    description:
      'Asymmetric Parisian editorial presentation featuring full-height hero product in left column and dark-tint typography panel in right column.',
    category: 'EDITORIAL',
    supportedAspectRatios: ['1:1', '4:5', '9:16'],
    supportedLanguages: ['EN', 'KM', 'BILINGUAL'],
    slots: [
      {
        slotId: 'headline',
        required: true,
        role: 'HEADLINE',
        maxLength: 45,
        description: 'Editorial headline',
      },
      {
        slotId: 'primaryPrice',
        required: true,
        role: 'PRICE',
        maxLength: 20,
        description: 'Product price',
      },
      {
        slotId: 'callToAction',
        required: true,
        role: 'CTA',
        maxLength: 28,
        description: 'Panel CTA button',
      },
      {
        slotId: 'campaignEyebrow',
        required: false,
        role: 'EYEBROW',
        maxLength: 24,
        description: 'Editorial eyebrow',
      },
      {
        slotId: 'secondaryHeadline',
        required: false,
        role: 'SECONDARY_HEADLINE',
        maxLength: 55,
        description: 'Khmer sub-headline',
      },
      {
        slotId: 'supportingText',
        required: false,
        role: 'BODY',
        maxLength: 90,
        description: 'Body description',
      },
      {
        slotId: 'promotionalPrice',
        required: false,
        role: 'PROMO_PRICE',
        maxLength: 20,
        description: 'Special price',
      },
      {
        slotId: 'productSpecs',
        required: false,
        role: 'LABEL',
        maxLength: 40,
        description: 'Fragrance concentration',
      },
      { slotId: 'brandLogo', required: false, role: 'GRAPHIC_LOGO', description: 'Logo mark' },
      {
        slotId: 'decorativeDivider',
        required: false,
        role: 'DECORATIVE_ACCENT',
        description: 'Divider line',
      },
    ],
    tokens: buildCanonicalTokens({
      alignment: 'LEFT',
      splitRatio: 0.44,
      idealHeroRatio: 0.44,
      pedestalPercent: 0.74,
      decorationDensity: 'MINIMAL',
    }),
  }),

  // 3. KHMER_SEASONAL
  createApprovedTemplate({
    id: 'KHMER_SEASONAL',
    version: '1.0.0',
    name: 'Khmer Cultural & Seasonal Campaign',
    description:
      'Celebratory Cambodian cultural composition honoring festive traditions with regal gold framing, ceremonial lotus crest, and prominent Khmer typography.',
    category: 'CULTURAL',
    supportedAspectRatios: ['1:1', '4:5', '9:16'],
    supportedLanguages: ['KM', 'BILINGUAL', 'EN'],
    slots: [
      {
        slotId: 'headline',
        required: true,
        role: 'HEADLINE',
        maxLength: 45,
        description: 'Khmer festival title',
      },
      {
        slotId: 'primaryPrice',
        required: true,
        role: 'PRICE',
        maxLength: 20,
        description: 'Price in Riel / USD',
      },
      {
        slotId: 'callToAction',
        required: true,
        role: 'CTA',
        maxLength: 28,
        description: 'Seasonal action button',
      },
      {
        slotId: 'campaignEyebrow',
        required: false,
        role: 'EYEBROW',
        maxLength: 24,
        description: 'Festive occasion tag',
      },
      {
        slotId: 'secondaryHeadline',
        required: false,
        role: 'SECONDARY_HEADLINE',
        maxLength: 55,
        description: 'Blessing or secondary title',
      },
      {
        slotId: 'supportingText',
        required: false,
        role: 'BODY',
        maxLength: 90,
        description: 'Gift set description',
      },
      {
        slotId: 'promotionalPrice',
        required: false,
        role: 'PROMO_PRICE',
        maxLength: 20,
        description: 'Festive offer price',
      },
      {
        slotId: 'productSpecs',
        required: false,
        role: 'LABEL',
        maxLength: 40,
        description: 'Product sizing',
      },
      { slotId: 'brandLogo', required: false, role: 'GRAPHIC_LOGO', description: 'Royal insignia' },
      {
        slotId: 'decorativeOrnament',
        required: false,
        role: 'DECORATIVE_ACCENT',
        description: 'Lotus crest ornament',
      },
      {
        slotId: 'decorativeFrame',
        required: false,
        role: 'DECORATIVE_ACCENT',
        description: 'Gold corner borders',
      },
    ],
    tokens: buildCanonicalTokens({
      alignment: 'CENTER',
      splitRatio: 0.5,
      idealHeroRatio: 0.48,
      pedestalPercent: 0.74,
      decorationDensity: 'ORNATE',
    }),
  }),

  // 4. SCENT_STORY
  createApprovedTemplate({
    id: 'SCENT_STORY',
    version: '1.0.0',
    name: 'Scent Pyramid & Olfactory Education',
    description:
      'Educational luxury layout highlighting fragrance notes architecture (Top, Heart, Base) alongside the master flacon on a mineral surface.',
    category: 'EDUCATIONAL',
    supportedAspectRatios: ['1:1', '4:5', '9:16'],
    supportedLanguages: ['EN', 'KM', 'BILINGUAL'],
    slots: [
      {
        slotId: 'headline',
        required: true,
        role: 'HEADLINE',
        maxLength: 45,
        description: 'Fragrance name',
      },
      {
        slotId: 'primaryPrice',
        required: true,
        role: 'PRICE',
        maxLength: 20,
        description: 'Flacon price',
      },
      {
        slotId: 'callToAction',
        required: true,
        role: 'CTA',
        maxLength: 28,
        description: 'Discover button',
      },
      {
        slotId: 'scentNotes',
        required: true,
        role: 'CHIP',
        description: 'Top/Heart/Base olfactory ingredients',
      },
      {
        slotId: 'campaignEyebrow',
        required: false,
        role: 'EYEBROW',
        maxLength: 24,
        description: 'Fragrance family label',
      },
      {
        slotId: 'secondaryHeadline',
        required: false,
        role: 'SECONDARY_HEADLINE',
        maxLength: 55,
        description: 'Artisan sub-headline',
      },
      {
        slotId: 'supportingText',
        required: false,
        role: 'BODY',
        maxLength: 90,
        description: 'Nose & perfumer notes',
      },
      {
        slotId: 'promotionalPrice',
        required: false,
        role: 'PROMO_PRICE',
        maxLength: 20,
        description: 'Discovery price',
      },
      {
        slotId: 'productSpecs',
        required: false,
        role: 'LABEL',
        maxLength: 40,
        description: 'Concentration grade',
      },
      { slotId: 'brandLogo', required: false, role: 'GRAPHIC_LOGO', description: 'Maison crest' },
      {
        slotId: 'decorativeDivider',
        required: false,
        role: 'DECORATIVE_ACCENT',
        description: 'Divider',
      },
    ],
    tokens: buildCanonicalTokens({
      alignment: 'LEFT',
      splitRatio: 0.42,
      idealHeroRatio: 0.42,
      pedestalPercent: 0.72,
      decorationDensity: 'BALANCED',
    }),
  }),

  // 5. PROMOTION_PRICE_CTA
  createApprovedTemplate({
    id: 'PROMOTION_PRICE_CTA',
    version: '1.0.0',
    name: 'Promotion, Price & CTA Conversion',
    description:
      'High-conversion retail promotion layout featuring high-contrast discount badges, dual strike-through pricing lockups, and an attention-optimized CTA button.',
    category: 'COMMERCIAL',
    supportedAspectRatios: ['1:1', '4:5', '9:16'],
    supportedLanguages: ['EN', 'KM', 'BILINGUAL'],
    slots: [
      {
        slotId: 'headline',
        required: true,
        role: 'HEADLINE',
        maxLength: 45,
        description: 'Promotional offer title',
      },
      {
        slotId: 'primaryPrice',
        required: true,
        role: 'PRICE',
        maxLength: 20,
        description: 'Original strike-through price',
      },
      {
        slotId: 'promotionalPrice',
        required: true,
        role: 'PROMO_PRICE',
        maxLength: 20,
        description: 'Active discounted price',
      },
      {
        slotId: 'callToAction',
        required: true,
        role: 'CTA',
        maxLength: 28,
        description: 'Urgent conversion CTA button',
      },
      {
        slotId: 'campaignEyebrow',
        required: false,
        role: 'EYEBROW',
        maxLength: 24,
        description: 'Discount percentage or flash badge',
      },
      {
        slotId: 'secondaryHeadline',
        required: false,
        role: 'SECONDARY_HEADLINE',
        maxLength: 55,
        description: 'Offer terms / validity',
      },
      {
        slotId: 'supportingText',
        required: false,
        role: 'BODY',
        maxLength: 90,
        description: 'Product bundle details',
      },
      {
        slotId: 'productSpecs',
        required: false,
        role: 'LABEL',
        maxLength: 40,
        description: 'Volume',
      },
      { slotId: 'brandLogo', required: false, role: 'GRAPHIC_LOGO', description: 'Store logo' },
      {
        slotId: 'decorativeDivider',
        required: false,
        role: 'DECORATIVE_ACCENT',
        description: 'Separator',
      },
    ],
    tokens: buildCanonicalTokens({
      alignment: 'CENTER',
      splitRatio: 0.5,
      idealHeroRatio: 0.5,
      pedestalPercent: 0.68,
      decorationDensity: 'MINIMAL',
    }),
  }),
];

// Alias for candidate templates during transition
export const CANONICAL_CANDIDATE_TEMPLATES = CANONICAL_APPROVED_TEMPLATES;

// ---------------------------------------------------------------------------
// TemplateRegistry Domain Service
// ---------------------------------------------------------------------------

export class TemplateRegistry {
  private static instance: TemplateRegistry | null = null;
  private readonly templatesByKey = new Map<string, Readonly<TemplateDefinition>>();

  public constructor(seedCanonicalDefaults = true) {
    if (seedCanonicalDefaults) {
      for (const tpl of CANONICAL_APPROVED_TEMPLATES) {
        this.registerTemplate(tpl);
      }
    }
  }

  public static getInstance(): TemplateRegistry {
    if (!TemplateRegistry.instance) {
      TemplateRegistry.instance = new TemplateRegistry(true);
    }
    return TemplateRegistry.instance;
  }

  public static clearInstanceForTesting(): void {
    TemplateRegistry.instance = null;
  }

  private makeKey(templateId: string, version: string): string {
    return `${templateId}@${version}`;
  }

  /**
   * Registers a new template definition.
   * Enforces immutability: Re-registering an existing (templateId, version) throws DuplicateTemplateRegistrationError.
   */
  public registerTemplate(definition: TemplateDefinition): void {
    this.validateTemplateDefinition(definition);

    const key = this.makeKey(definition.id, definition.version);
    if (this.templatesByKey.has(key)) {
      throw new DuplicateTemplateRegistrationError(definition.id, definition.version);
    }

    const frozen = deepFreeze({ ...definition });
    this.templatesByKey.set(key, frozen);
  }

  /**
   * Approves a candidate template definition for production creative generation.
   * Enforces:
   * 1. Attributable approver reference and valid ISO timestamp.
   * 2. Bit-exact cryptographic contentDigest matching the registered template.
   * 3. Non-destructive transition: returns a new deep-frozen approved definition without mutating the old in place.
   */
  public approveTemplate(input: ApproveTemplateInput): Readonly<TemplateDefinition> {
    if (!input.approverRef || input.approverRef.trim().length === 0) {
      throw new InvalidTemplateDefinitionError(
        'Approver reference is required to approve a template.',
      );
    }
    if (!input.approvedAt || isNaN(Date.parse(input.approvedAt))) {
      throw new InvalidTemplateDefinitionError(
        'Valid ISO timestamp approvedAt is required to approve a template.',
      );
    }

    const key = this.makeKey(input.templateId, input.version);
    const existing = this.templatesByKey.get(key);
    if (!existing) {
      throw new TemplateNotFoundError(input.templateId, input.version);
    }

    if (existing.tokens.tokenSetVersion !== input.tokenSetVersion) {
      throw new InvalidTemplateDefinitionError(
        `Token set version mismatch: expected ${existing.tokens.tokenSetVersion}, got ${input.tokenSetVersion}`,
      );
    }

    if (existing.provenance.contentDigest.toLowerCase() !== input.contentDigest.toLowerCase()) {
      throw new TemplateDigestMismatchError(
        input.templateId,
        input.version,
        existing.provenance.contentDigest,
        input.contentDigest,
      );
    }

    const approvedDef: TemplateDefinition = deepFreeze({
      ...existing,
      provenance: {
        ...existing.provenance,
        approvalState: 'APPROVED',
        approverRef: input.approverRef.trim(),
        approvedAt: input.approvedAt,
        sourceDecisionRef: input.sourceDecisionRef ?? existing.provenance.sourceDecisionRef,
      },
    });

    this.templatesByKey.set(key, approvedDef);
    return approvedDef;
  }

  /**
   * Validates structural and semantic invariants of a template definition.
   */
  public validateTemplateDefinition(definition: TemplateDefinition): void {
    if (!definition.id || !CANONICAL_TEMPLATE_IDS.includes(definition.id)) {
      throw new InvalidTemplateDefinitionError(
        `Template ID "${definition.id}" is not one of the approved canonical template families: ${CANONICAL_TEMPLATE_IDS.join(', ')}`,
      );
    }

    if (!definition.version || !/^\d+\.\d+\.\d+$/.test(definition.version)) {
      throw new InvalidTemplateDefinitionError(
        `Template version "${definition.version}" must conform to semantic versioning (X.Y.Z).`,
      );
    }

    if (!definition.slots || definition.slots.length === 0) {
      throw new InvalidTemplateDefinitionError('Template must define at least one content slot.');
    }

    const hasHeadline = definition.slots.some((s) => s.slotId === 'headline' && s.required);
    if (!hasHeadline) {
      throw new InvalidTemplateDefinitionError('Template must require the "headline" slot.');
    }

    if (!definition.tokens || !definition.tokens.formatAdaptations) {
      throw new InvalidTemplateDefinitionError(
        'Template must provide design tokens with format adaptations.',
      );
    }

    for (const ratio of ['1:1', '4:5', '9:16'] as const) {
      if (!definition.tokens.formatAdaptations[ratio]) {
        throw new InvalidTemplateDefinitionError(
          `Template tokens missing adaptation for aspect ratio "${ratio}".`,
        );
      }
    }

    if (!definition.provenance) {
      throw new InvalidTemplateDefinitionError('Template must include authoritative provenance.');
    }
  }

  /**
   * Resolves a template definition for production use.
   * Fail-Closed Policy: Strictly requires approvalState === 'APPROVED'.
   * Draft, Deprecated, and Retired templates throw TemplateNotEligibleForProductionError.
   */
  public resolveProductionTemplate(
    templateId: CanonicalTemplateId,
    version?: TemplateSemVer,
    options?: { allowNonApprovedForTesting?: boolean },
  ): Readonly<TemplateDefinition> {
    const template = this.getTemplate(templateId, version);

    // Verify cryptographic integrity of registered definition
    const recomputedDigest = computeTemplateDefinitionDigest(template);
    if (template.provenance.contentDigest !== recomputedDigest) {
      throw new TemplateDigestMismatchError(
        template.id,
        template.version,
        template.provenance.contentDigest,
        recomputedDigest,
      );
    }

    if (template.provenance.approvalState !== 'APPROVED' && !options?.allowNonApprovedForTesting) {
      throw new TemplateNotEligibleForProductionError(
        template.id,
        template.version,
        template.provenance.approvalState,
      );
    }

    if (template.provenance.approvalState === 'APPROVED') {
      if (!template.provenance.approverRef || !template.provenance.approvedAt) {
        throw new InvalidTemplateDefinitionError(
          `Approved template ${template.id}@${template.version} has incomplete approval provenance.`,
        );
      }
    }

    return template;
  }

  /**
   * Resolves a template definition by ID and optional version.
   * If version is omitted, returns the latest registered version matching the requested state.
   */
  public getTemplate(
    templateId: CanonicalTemplateId,
    version?: TemplateSemVer,
  ): Readonly<TemplateDefinition> {
    if (version) {
      const key = this.makeKey(templateId, version);
      const found = this.templatesByKey.get(key);
      if (!found) {
        throw new TemplateNotFoundError(templateId, version);
      }
      return found;
    }

    // Version omitted: find all versions for this template ID
    const candidates: TemplateDefinition[] = [];
    for (const [k, tpl] of this.templatesByKey.entries()) {
      if (k.startsWith(`${templateId}@`)) {
        candidates.push(tpl);
      }
    }

    if (candidates.length === 0) {
      throw new TemplateNotFoundError(templateId);
    }

    // Prefer latest APPROVED version; fallback to latest version
    const approved = candidates.filter((c) => c.provenance.approvalState === 'APPROVED');
    const pool = approved.length > 0 ? approved : candidates;

    pool.sort((a, b) => this.compareSemVer(b.version, a.version));
    return pool[0]!;
  }

  public hasTemplate(templateId: CanonicalTemplateId, version?: TemplateSemVer): boolean {
    if (version) {
      return this.templatesByKey.has(this.makeKey(templateId, version));
    }
    for (const k of this.templatesByKey.keys()) {
      if (k.startsWith(`${templateId}@`)) {
        return true;
      }
    }
    return false;
  }

  public getAllTemplates(): readonly Readonly<TemplateDefinition>[] {
    return Object.freeze(Array.from(this.templatesByKey.values()));
  }

  public getApprovedTemplates(): readonly Readonly<TemplateDefinition>[] {
    return Object.freeze(
      Array.from(this.templatesByKey.values()).filter(
        (t) => t.provenance.approvalState === 'APPROVED',
      ),
    );
  }

  private compareSemVer(v1: string, v2: string): number {
    const p1 = v1.split('.').map(Number);
    const p2 = v2.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      const num1 = p1[i] ?? 0;
      const num2 = p2[i] ?? 0;
      if (num1 !== num2) {
        return num1 - num2;
      }
    }
    return 0;
  }
}
