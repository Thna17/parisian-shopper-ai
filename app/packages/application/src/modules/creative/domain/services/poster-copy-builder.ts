import {
  type PosterSpec,
  type PosterTemplateId,
  type PosterAspectRatio,
  type PosterLanguage,
  type ScentNoteItem,
  POSTER_LIMITS,
  POSTER_FORMATS,
  validatePosterSpec,
} from '../poster-spec.js';
import { POSTER_PALETTES } from '../poster-tokens.js';
import { TextLayoutEngine } from './text-layout-engine.js';

export interface ProductFactsInput {
  readonly id?: string;
  readonly sku: string;
  readonly title: string;
  readonly brand?: string;
  readonly priceAmount?: number | string;
  readonly currency?: string;
  readonly volumeMl?: number;
  readonly concentration?: string;
  readonly fragranceNotes?: {
    readonly top?: readonly string[];
    readonly heart?: readonly string[];
    readonly base?: readonly string[];
  };
}

export interface ValidatedContentInput {
  readonly headline?: string | undefined;
  readonly secondaryHeadline?: string | undefined;
  readonly bodyText?: string | undefined;
  readonly cta?: string | undefined;
  readonly language?: string | undefined;
}

export interface BuildPosterCopyOptions {
  readonly templateId?: PosterTemplateId;
  readonly aspectRatio?: PosterAspectRatio;
  readonly language?: PosterLanguage;
  readonly paletteId?: string;
  readonly campaignLabel?: string;
  readonly promotionalPrice?: string;
  readonly cta?: string;
}

export class PosterCopyBuilder {
  public static buildSpec(
    product: ProductFactsInput,
    content?: ValidatedContentInput,
    options: BuildPosterCopyOptions = {},
  ): PosterSpec {
    const rawHeadline = content?.headline || product.title;
    const headline = this.truncateToLimit(rawHeadline, POSTER_LIMITS.HEADLINE_MAX_LENGTH);

    // Determine language
    let language: PosterLanguage = 'EN';
    if (options.language) {
      language = options.language;
    } else if (
      content?.language?.toUpperCase() === 'KM' ||
      TextLayoutEngine.isKhmerText(rawHeadline)
    ) {
      language = 'KM';
    } else if (
      content?.secondaryHeadline &&
      TextLayoutEngine.isKhmerText(content.secondaryHeadline)
    ) {
      language = 'BILINGUAL';
    }

    // Secondary headline
    let secondaryHeadline: string | undefined = content?.secondaryHeadline;
    if (!secondaryHeadline && language === 'BILINGUAL') {
      secondaryHeadline = product.brand ? `Parfums ${product.brand}` : undefined;
    }
    if (secondaryHeadline) {
      secondaryHeadline = this.truncateToLimit(
        secondaryHeadline,
        POSTER_LIMITS.SECONDARY_HEADLINE_MAX_LENGTH,
      );
    }

    // Supporting line (concise, <= 90 chars)
    let supportingText: string | undefined;
    if (content?.bodyText) {
      const firstSentence = content.bodyText.split(/[.\n]/)[0]?.trim();
      if (firstSentence) {
        supportingText = this.truncateToLimit(
          firstSentence,
          POSTER_LIMITS.SUPPORTING_TEXT_MAX_LENGTH,
        );
      }
    } else if (product.fragranceNotes?.top && product.fragranceNotes.top.length > 0) {
      supportingText = `Notes of ${product.fragranceNotes.top.slice(0, 3).join(', ')}`;
      supportingText = this.truncateToLimit(
        supportingText,
        POSTER_LIMITS.SUPPORTING_TEXT_MAX_LENGTH,
      );
    }

    // Price formatting
    const currency = product.currency || 'USD';
    const numPrice =
      typeof product.priceAmount === 'number'
        ? product.priceAmount
        : parseFloat(String(product.priceAmount || '48'));
    const price = `$${Math.round(numPrice)}`;

    // Size & concentration
    const size = product.volumeMl ? `${product.volumeMl} ml` : undefined;
    const concentration = product.concentration || 'Eau de Parfum';

    // CTA
    const defaultCta = language === 'KM' ? 'ទិញឥឡូវនេះ' : 'Shop Now';
    const cta = this.truncateToLimit(
      options.cta || content?.cta || defaultCta,
      POSTER_LIMITS.CTA_MAX_LENGTH,
    );

    // Campaign label
    let campaignLabel = options.campaignLabel;
    if (!campaignLabel) {
      if (options.templateId === 'KHMER_SEASONAL') {
        campaignLabel = 'PCHUM BEN SPECIAL';
      } else if (product.brand) {
        campaignLabel = `${product.brand.toUpperCase()} PARIS`;
      }
    }
    if (campaignLabel) {
      campaignLabel = this.truncateToLimit(campaignLabel, POSTER_LIMITS.CAMPAIGN_LABEL_MAX_LENGTH);
    }

    // Template selection
    let templateId: PosterTemplateId = options.templateId || 'EDITORIAL_SPLIT';
    if (!options.templateId) {
      if (language === 'KM' || options.campaignLabel?.includes('KHMER')) {
        templateId = 'KHMER_SEASONAL';
      } else if (product.fragranceNotes && Object.keys(product.fragranceNotes).length >= 2) {
        templateId = 'SCENT_STORY';
      } else {
        templateId = 'EDITORIAL_SPLIT';
      }
    }

    // Placements
    const productPlacement = templateId === 'EDITORIAL_SPLIT' ? 'LEFT' : 'CENTER';
    const textPlacement = templateId === 'EDITORIAL_SPLIT' ? 'RIGHT' : 'CENTER';

    // Output format
    const aspectRatio: PosterAspectRatio = options.aspectRatio || '1:1';
    const outputFormat = POSTER_FORMATS[aspectRatio];

    // Palette selection
    const paletteKey =
      options.paletteId || (templateId === 'KHMER_SEASONAL' ? 'KHMER_ROYAL' : 'NOCTURNE_GOLD');
    const palette = POSTER_PALETTES[paletteKey] || POSTER_PALETTES.NOCTURNE_GOLD!;

    // Scent notes if available
    const scentNotes: ScentNoteItem[] = [];
    if (product.fragranceNotes) {
      if (product.fragranceNotes.top) {
        scentNotes.push(
          ...product.fragranceNotes.top
            .slice(0, 2)
            .map((name) => ({ name, category: 'TOP' as const })),
        );
      }
      if (product.fragranceNotes.heart) {
        scentNotes.push(
          ...product.fragranceNotes.heart
            .slice(0, 2)
            .map((name) => ({ name, category: 'HEART' as const })),
        );
      }
      if (product.fragranceNotes.base) {
        scentNotes.push(
          ...product.fragranceNotes.base
            .slice(0, 2)
            .map((name) => ({ name, category: 'BASE' as const })),
        );
      }
    }

    const candidateSpec: PosterSpec = {
      templateId,
      outputFormat,
      language,
      headline,
      secondaryHeadline,
      supportingText,
      price,
      promotionalPrice: options.promotionalPrice,
      currency,
      size,
      concentration,
      cta,
      campaignLabel,
      productPlacement,
      textPlacement,
      palette,
      decorativeSelection: {
        frame: templateId === 'KHMER_SEASONAL' ? 'CORNER_ACCENTS' : 'NONE',
        divider: templateId === 'KHMER_SEASONAL' ? 'LOTUS_ORNAMENT' : 'DIAMOND_DOT',
        badge: 'PILL',
        lotusOrnament: templateId === 'KHMER_SEASONAL',
        scentNotes: scentNotes.length > 0 ? scentNotes : undefined,
      },
      backgroundArtDirection: {
        darkenFactor: 0.35,
        panelOpacity: templateId === 'EDITORIAL_SPLIT' ? 0.75 : 0.65,
        gradientStyle: templateId === 'EDITORIAL_SPLIT' ? 'SIDE_PANEL' : 'BOTTOM_FADE',
      },
    };

    return validatePosterSpec(candidateSpec);
  }

  private static truncateToLimit(text: string, limit: number): string {
    const trimmed = text.trim();
    if (trimmed.length <= limit) return trimmed;
    return `${trimmed.slice(0, limit - 1).trim()}…`;
  }
}
