import { z } from 'zod';
import { InvalidPosterSpecError } from './creative-errors.js';

export type PosterTemplateId =
  'EDITORIAL_SPLIT' | 'CENTERED_HERO' | 'SCENT_STORY' | 'KHMER_SEASONAL' | 'PROMOTION_PRICE_CTA';

export type PosterAspectRatio = '1:1' | '4:5' | '9:16';
export type PosterLanguage = 'EN' | 'KM' | 'BILINGUAL';
export type PosterHorizontalPlacement = 'LEFT' | 'CENTER' | 'RIGHT';

export interface PosterPalette {
  readonly id: string;
  readonly textColor: string;
  readonly accentColor: string;
  readonly secondaryTextColor: string;
  readonly panelBackground?: string | undefined;
  readonly badgeBackground?: string | undefined;
  readonly badgeTextColor?: string | undefined;
}

export interface PosterLogoRef {
  readonly storageKey?: string | undefined;
  readonly brandName?: string | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
}

export interface ScentNoteItem {
  readonly name: string;
  readonly category?: 'TOP' | 'HEART' | 'BASE' | undefined;
}

export interface PosterDecorativeSelection {
  readonly frame?: 'NONE' | 'ELEGANT_BORDER' | 'CORNER_ACCENTS' | 'HAUSSMANN_FRAME' | undefined;
  readonly divider?:
    'NONE' | 'SOLID_LINE' | 'DOUBLE_LINE' | 'DIAMOND_DOT' | 'LOTUS_ORNAMENT' | undefined;
  readonly badge?: 'NONE' | 'PILL' | 'MINIMAL_RECT' | 'OUTLINE_BADGE' | undefined;
  readonly lotusOrnament?: boolean | undefined;
  readonly scentNotes?: readonly ScentNoteItem[] | undefined;
}

export interface PosterBackgroundArtDirection {
  readonly darkenFactor?: number | undefined;
  readonly panelOpacity?: number | undefined;
  readonly gradientStyle?: 'BOTTOM_FADE' | 'RADIAL_VIGNETTE' | 'SIDE_PANEL' | 'NONE' | undefined;
  readonly presetId?: string | undefined;
}

export interface PosterOutputFormat {
  readonly aspectRatio: PosterAspectRatio;
  readonly width: number;
  readonly height: number;
}

export interface CommercialFactProvenance {
  readonly productSnapshotId: string;
  readonly snapshotDigest: string;
  readonly priceValue: string;
  readonly currency: string;
  readonly promotionalPriceValue?: string | undefined;
  readonly originalPriceAuthorized?: boolean | undefined;
  readonly campaignLabelAuthorized?: boolean | undefined;
  readonly verifiedAt?: string | undefined;
  readonly sourceFieldRef?: string | undefined;
  readonly isFixture?: boolean | undefined;
}

export interface PosterSpec {
  readonly templateId: PosterTemplateId;
  readonly templateVersion?: string | undefined;
  readonly outputFormat: PosterOutputFormat;
  readonly language: PosterLanguage;
  readonly headline: string;
  readonly secondaryHeadline?: string | undefined;
  readonly supportingText?: string | undefined;
  readonly price: string;
  readonly promotionalPrice?: string | undefined;
  readonly currency: string;
  readonly size?: string | undefined;
  readonly concentration?: string | undefined;
  readonly cta: string;
  readonly campaignLabel?: string | undefined;
  readonly productPlacement: PosterHorizontalPlacement;
  readonly textPlacement: PosterHorizontalPlacement;
  readonly palette: PosterPalette;
  readonly logoAssetRef?: PosterLogoRef | undefined;
  readonly decorativeSelection?: PosterDecorativeSelection | undefined;
  readonly backgroundArtDirection?: PosterBackgroundArtDirection | undefined;
  readonly layoutIntent?: unknown;
  readonly commercialProvenance?: CommercialFactProvenance | undefined;
}

export const POSTER_LIMITS = {
  CAMPAIGN_LABEL_MAX_LENGTH: 24,
  HEADLINE_MAX_LENGTH: 45,
  SECONDARY_HEADLINE_MAX_LENGTH: 55,
  SUPPORTING_TEXT_MAX_LENGTH: 90,
  CTA_MAX_LENGTH: 28,
  PRICE_MAX_LENGTH: 20,
  SIZE_MAX_LENGTH: 24,
  CONCENTRATION_MAX_LENGTH: 30,
  MAX_MAJOR_TEXT_GROUPS: 5,
} as const;

export const POSTER_FORMATS: Record<PosterAspectRatio, PosterOutputFormat> = {
  '1:1': { aspectRatio: '1:1', width: 1080, height: 1080 },
  '4:5': { aspectRatio: '4:5', width: 1080, height: 1350 },
  '9:16': { aspectRatio: '9:16', width: 1080, height: 1920 },
};

const PosterSpecSchema = z.object({
  templateId: z.enum([
    'EDITORIAL_SPLIT',
    'CENTERED_HERO',
    'SCENT_STORY',
    'KHMER_SEASONAL',
    'PROMOTION_PRICE_CTA',
  ]),
  templateVersion: z.string().optional(),
  outputFormat: z.object({
    aspectRatio: z.enum(['1:1', '4:5', '9:16']),
    width: z.number().int().min(400).max(4096),
    height: z.number().int().min(400).max(4096),
  }),
  language: z.enum(['EN', 'KM', 'BILINGUAL']),
  headline: z.string().trim().min(1).max(POSTER_LIMITS.HEADLINE_MAX_LENGTH),
  secondaryHeadline: z.string().trim().max(POSTER_LIMITS.SECONDARY_HEADLINE_MAX_LENGTH).optional(),
  supportingText: z.string().trim().max(POSTER_LIMITS.SUPPORTING_TEXT_MAX_LENGTH).optional(),
  price: z.string().trim().min(1).max(POSTER_LIMITS.PRICE_MAX_LENGTH),
  promotionalPrice: z.string().trim().max(POSTER_LIMITS.PRICE_MAX_LENGTH).optional(),
  currency: z.string().trim().min(1).max(10).default('USD'),
  size: z.string().trim().max(POSTER_LIMITS.SIZE_MAX_LENGTH).optional(),
  concentration: z.string().trim().max(POSTER_LIMITS.CONCENTRATION_MAX_LENGTH).optional(),
  cta: z.string().trim().min(1).max(POSTER_LIMITS.CTA_MAX_LENGTH),
  campaignLabel: z.string().trim().max(POSTER_LIMITS.CAMPAIGN_LABEL_MAX_LENGTH).optional(),
  productPlacement: z.enum(['LEFT', 'CENTER', 'RIGHT']),
  textPlacement: z.enum(['LEFT', 'CENTER', 'RIGHT']),
  palette: z.object({
    id: z.string(),
    textColor: z.string(),
    accentColor: z.string(),
    secondaryTextColor: z.string(),
    panelBackground: z.string().optional(),
    badgeBackground: z.string().optional(),
    badgeTextColor: z.string().optional(),
  }),
  logoAssetRef: z
    .object({
      storageKey: z.string().optional(),
      brandName: z.string().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
    })
    .optional(),
  decorativeSelection: z
    .object({
      frame: z.enum(['NONE', 'ELEGANT_BORDER', 'CORNER_ACCENTS', 'HAUSSMANN_FRAME']).optional(),
      divider: z
        .enum(['NONE', 'SOLID_LINE', 'DOUBLE_LINE', 'DIAMOND_DOT', 'LOTUS_ORNAMENT'])
        .optional(),
      badge: z.enum(['NONE', 'PILL', 'MINIMAL_RECT', 'OUTLINE_BADGE']).optional(),
      lotusOrnament: z.boolean().optional(),
      scentNotes: z
        .array(
          z.object({
            name: z.string(),
            category: z.enum(['TOP', 'HEART', 'BASE']).optional(),
          }),
        )
        .optional(),
    })
    .optional(),
  backgroundArtDirection: z
    .object({
      darkenFactor: z.number().min(0).max(1).optional(),
      panelOpacity: z.number().min(0).max(1).optional(),
      gradientStyle: z.enum(['BOTTOM_FADE', 'RADIAL_VIGNETTE', 'SIDE_PANEL', 'NONE']).optional(),
      presetId: z.string().optional(),
    })
    .optional(),
});

export function validatePosterSpec(input: unknown): PosterSpec {
  const result = PosterSpecSchema.safeParse(input);
  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ');
    throw new InvalidPosterSpecError(errorDetails, { issues: result.error.issues });
  }

  const spec = result.data as PosterSpec;

  // Verify major text groups limit
  let majorTextGroups = 0;
  if (spec.campaignLabel) majorTextGroups++;
  if (spec.headline || spec.secondaryHeadline) majorTextGroups++;
  if (spec.supportingText) majorTextGroups++;
  if (spec.price || spec.promotionalPrice || spec.size || spec.concentration) majorTextGroups++;
  if (spec.cta) majorTextGroups++;

  if (majorTextGroups > POSTER_LIMITS.MAX_MAJOR_TEXT_GROUPS) {
    throw new InvalidPosterSpecError(
      `Major text groups (${majorTextGroups}) exceed maximum allowed (${POSTER_LIMITS.MAX_MAJOR_TEXT_GROUPS})`,
    );
  }

  return spec;
}
