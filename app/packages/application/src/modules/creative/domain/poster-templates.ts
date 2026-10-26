import { type PosterSpec } from './poster-spec.js';
import { type SafeMargins } from './poster-tokens.js';
import { type BoundingBox } from './services/text-layout-engine.js';
import { renderEditorialSplitTemplate } from './templates/editorial-split.template.js';
import { renderCenteredHeroTemplate } from './templates/centered-hero.template.js';
import { renderKhmerSeasonalTemplate } from './templates/khmer-seasonal.template.js';
import { renderScentStoryTemplate } from './templates/scent-story.template.js';
import { renderPromotionPriceCtaTemplate } from './templates/promotion-price-cta.template.js';
import { TemplateRegistry } from './templates/template-registry.js';
import {
  CANONICAL_TEMPLATE_IDS,
  type TemplateSemVer,
} from './templates/template-registry.types.js';
import { TemplateNotFoundError, InvalidPosterSpecError } from './creative-errors.js';

export interface LayoutManifestElement {
  readonly id: string;
  readonly type:
    'PRODUCT' | 'SHADOW' | 'TEXT' | 'BADGE' | 'BUTTON' | 'DIVIDER' | 'ORNAMENT' | 'LOGO' | 'PANEL';
  readonly boundingBox: BoundingBox;
  readonly text?: string;
}

export interface PosterLayoutManifest {
  readonly version: string;
  readonly templateId: string;
  readonly dimensions: { readonly width: number; readonly height: number };
  readonly safeMargins: SafeMargins;
  readonly elements: readonly LayoutManifestElement[];
}

export interface ComputedTemplateLayout {
  readonly svgOverlay: string;
  readonly productHeroZone: {
    readonly placement: 'LEFT' | 'CENTER' | 'RIGHT';
    readonly pedestalYPercent: number;
    readonly maxHeroWidth: number;
    readonly maxHeroHeight: number;
    readonly boundingBox: BoundingBox;
  };
  readonly manifest: PosterLayoutManifest;
}

export interface RenderPosterOptions {
  readonly allowNonApprovedForTesting?: boolean | undefined;
}

export class PosterTemplateRenderer {
  public static renderTemplate(
    spec: PosterSpec,
    fontFaceCss: string,
    options?: RenderPosterOptions,
  ): ComputedTemplateLayout {
    // 1. Resolve through TemplateRegistry to enforce production eligibility
    const registry = TemplateRegistry.getInstance();
    if (!CANONICAL_TEMPLATE_IDS.includes(spec.templateId)) {
      throw new TemplateNotFoundError(spec.templateId);
    }

    const templateDef = registry.resolveProductionTemplate(
      spec.templateId,
      (spec.templateVersion as TemplateSemVer) ?? '1.0.0',
      options?.allowNonApprovedForTesting !== undefined
        ? { allowNonApprovedForTesting: options.allowNonApprovedForTesting }
        : undefined,
    );

    // 2. Enforce format support
    const format = spec.outputFormat.aspectRatio;
    if (!templateDef.supportedAspectRatios.includes(format)) {
      throw new InvalidPosterSpecError(
        `Aspect ratio "${format}" is not supported by template "${spec.templateId}". Supported: ${templateDef.supportedAspectRatios.join(', ')}`,
      );
    }

    // 3. Enforce language support
    if (!templateDef.supportedLanguages.includes(spec.language)) {
      throw new InvalidPosterSpecError(
        `Language "${spec.language}" is not supported by template "${spec.templateId}". Supported: ${templateDef.supportedLanguages.join(', ')}`,
      );
    }

    // 4. Dispatch to template renderer with resolved tokens and options
    switch (spec.templateId) {
      case 'EDITORIAL_SPLIT':
        return renderEditorialSplitTemplate(spec, fontFaceCss, templateDef.tokens, options);
      case 'CENTERED_HERO':
        return renderCenteredHeroTemplate(spec, fontFaceCss, templateDef.tokens, options);
      case 'SCENT_STORY':
        return renderScentStoryTemplate(spec, fontFaceCss, templateDef.tokens, options);
      case 'KHMER_SEASONAL':
        return renderKhmerSeasonalTemplate(spec, fontFaceCss, templateDef.tokens, options);
      case 'PROMOTION_PRICE_CTA':
        return renderPromotionPriceCtaTemplate(spec, fontFaceCss, templateDef.tokens, {
          allowNonApprovedForTesting: options?.allowNonApprovedForTesting ?? false,
        });
      default:
        throw new TemplateNotFoundError(spec.templateId);
    }
  }
}
