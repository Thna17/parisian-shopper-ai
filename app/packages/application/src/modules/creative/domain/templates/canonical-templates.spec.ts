import { beforeAll, describe, expect, it } from '@jest/globals';
import { createHash } from 'node:crypto';
import { PosterTemplateRenderer } from '../poster-templates.js';
import { renderCenteredHeroTemplate } from './centered-hero.template.js';
import { renderEditorialSplitTemplate } from './editorial-split.template.js';
import { renderKhmerSeasonalTemplate } from './khmer-seasonal.template.js';
import { renderScentStoryTemplate } from './scent-story.template.js';
import { renderPromotionPriceCtaTemplate } from './promotion-price-cta.template.js';
import { TextLayoutEngine } from '../services/text-layout-engine.js';
import { FontRegistry } from '../../infrastructure/fonts/font-registry.js';
import { HarfBuzzShapingService } from '../../infrastructure/fonts/harfbuzz-shaping-service.js';
import {
  InvalidPosterSpecError,
  PosterLayoutOverflowError,
  TemplateNotEligibleForProductionError,
  TemplateNotFoundError,
  UnverifiedCommercialFactError,
} from '../creative-errors.js';
import {
  GOLDEN_TEMPLATE_VECTORS,
  type GoldenTemplateVector,
} from './__fixtures__/golden-templates.fixture.js';
import { TemplateRegistry, createDraftTemplate } from './template-registry.js';
import type { CanonicalTemplateId } from './template-registry.types.js';

describe('Canonical Template Families: W22-D, W22-E & W22-F Production Suites', () => {
  let fontFaceCss: string;

  beforeAll(() => {
    const fontRegistry = FontRegistry.getInstance();
    TextLayoutEngine.setDefaultShaper(new HarfBuzzShapingService(fontRegistry));
    fontFaceCss = fontRegistry.getFontFaceCss();
  });

  describe('1. Authoritative Golden Corpus Verification (50 Multi-Script Vectors)', () => {
    it('fails closed when attempting to render unapproved candidate templates without allowNonApprovedForTesting flag', () => {
      const draftTpl = createDraftTemplate({
        ...TemplateRegistry.getInstance().getTemplate('CENTERED_HERO', '1.0.0'),
        version: '1.0.9',
      });
      TemplateRegistry.getInstance().registerTemplate(draftTpl);

      const vector = GOLDEN_TEMPLATE_VECTORS[0]!;
      const unapprovedSpec = { ...vector.spec, templateVersion: '1.0.9' as const };
      expect(() => PosterTemplateRenderer.renderTemplate(unapprovedSpec, fontFaceCss)).toThrow(
        TemplateNotEligibleForProductionError,
      );
    });

    it('successfully renders approved canonical templates in production mode without allowNonApprovedForTesting flag', () => {
      const vector = GOLDEN_TEMPLATE_VECTORS[0]!;
      const result = PosterTemplateRenderer.renderTemplate(vector.spec, fontFaceCss);
      expect(result).toBeDefined();
      expect(result.svgOverlay).toContain('<svg');
    });

    it('fails closed when attempting to render unknown template ID (no silent fallback to EDITORIAL_SPLIT)', () => {
      const invalidSpec = {
        ...GOLDEN_TEMPLATE_VECTORS[0]!.spec,
        templateId: 'UNKNOWN_TEMPLATE_ID' as unknown as CanonicalTemplateId,
      };
      expect(() =>
        PosterTemplateRenderer.renderTemplate(invalidSpec, fontFaceCss, {
          allowNonApprovedForTesting: true,
        }),
      ).toThrow(TemplateNotFoundError);
    });

    it('verifies all 50 golden vectors render with ZERO visible <text> or <tspan> elements (pure W21 glyph paths)', () => {
      for (const vector of GOLDEN_TEMPLATE_VECTORS) {
        const result = PosterTemplateRenderer.renderTemplate(vector.spec, fontFaceCss, {
          allowNonApprovedForTesting: true,
        });
        expect(result.svgOverlay).not.toMatch(/<text(?![^>]*opacity="0")[^>]*>/i);
        expect(result.svgOverlay).not.toMatch(/<tspan/i);
        expect(result.svgOverlay).not.toContain('text-decoration="line-through"');
      }
    });

    it.each(GOLDEN_TEMPLATE_VECTORS)(
      'renders golden vector $id ($templateId, $language, $aspectRatio)',
      (vector: GoldenTemplateVector) => {
        const result = PosterTemplateRenderer.renderTemplate(vector.spec, fontFaceCss, {
          allowNonApprovedForTesting: true,
        });

        expect(result).toBeDefined();
        expect(result.svgOverlay).toContain('<svg');
        expect(result.svgOverlay).toContain('</svg>');
        expect(result.manifest.elements.length).toBeGreaterThanOrEqual(4);

        const { width, height } = result.manifest.dimensions;
        const { top, bottom, left, right } = result.manifest.safeMargins;

        // Verify product hero zone
        expect(result.productHeroZone.maxHeroWidth).toBeGreaterThan(200);
        expect(result.productHeroZone.maxHeroHeight).toBeGreaterThan(200);
        expect(result.productHeroZone.pedestalYPercent).toBeGreaterThan(0.4);
        expect(result.productHeroZone.pedestalYPercent).toBeLessThan(0.85);

        // Verify each layout manifest element
        for (const el of result.manifest.elements) {
          const b = el.boundingBox;
          expect(b.width).toBeGreaterThan(0);
          expect(b.height).toBeGreaterThan(0);
          expect(b.x).toBeGreaterThanOrEqual(0);
          expect(b.y).toBeGreaterThanOrEqual(0);
          expect(b.x + b.width).toBeLessThanOrEqual(width);
          expect(b.y + b.height).toBeLessThanOrEqual(height);

          // Content and interactive elements must respect safe area
          if (el.type === 'TEXT' || el.type === 'BUTTON' || el.type === 'BADGE') {
            expect(b.x).toBeGreaterThanOrEqual(left - 1);
            expect(b.x + b.width).toBeLessThanOrEqual(width - right + 1);
            expect(b.y).toBeGreaterThanOrEqual(top - 1);
            expect(b.y + b.height).toBeLessThanOrEqual(height - bottom + 1);
          }
        }
      },
    );
  });

  describe('2. CENTERED_HERO Production Characteristics', () => {
    it.each(['1:1', '4:5', '9:16'] as const)(
      'guarantees controlled central symmetry and governed hero bounds for format %s',
      (ratio) => {
        const vector = GOLDEN_TEMPLATE_VECTORS.find(
          (v) => v.templateId === 'CENTERED_HERO' && v.aspectRatio === ratio && v.language === 'EN',
        )!;

        const result = renderCenteredHeroTemplate(vector.spec, fontFaceCss);
        const { width } = result.manifest.dimensions;

        // Verify central symmetry: headline and CTA centers align with canvas horizontal center
        const headlineEl = result.manifest.elements.find((e) => e.id === 'headline')!;
        const ctaEl = result.manifest.elements.find((e) => e.id === 'cta_button')!;

        const headlineCenter = headlineEl.boundingBox.x + headlineEl.boundingBox.width / 2;
        const ctaCenter = ctaEl.boundingBox.x + ctaEl.boundingBox.width / 2;

        expect(Math.abs(headlineCenter - width / 2)).toBeLessThanOrEqual(2);
        expect(Math.abs(ctaCenter - width / 2)).toBeLessThanOrEqual(2);

        // Verify product hero zone is centered
        expect(result.productHeroZone.placement).toBe('CENTER');
        const heroCenter =
          result.productHeroZone.boundingBox.x + result.productHeroZone.boundingBox.width / 2;
        expect(Math.abs(heroCenter - width / 2)).toBeLessThanOrEqual(2);
        expect(result.productHeroZone.boundingBox.x).toBeGreaterThanOrEqual(
          result.manifest.safeMargins.left,
        );
        expect(
          result.productHeroZone.boundingBox.x + result.productHeroZone.boundingBox.width,
        ).toBeLessThanOrEqual(width - result.manifest.safeMargins.right);
      },
    );

    it('collapses optional slots cleanly without leaving orphaned empty space', () => {
      const baseVector = GOLDEN_TEMPLATE_VECTORS.find(
        (v) => v.templateId === 'CENTERED_HERO' && v.aspectRatio === '1:1',
      )!;

      const minimalSpec = {
        ...baseVector.spec,
        campaignLabel: undefined,
        secondaryHeadline: undefined,
        supportingText: undefined,
        concentration: undefined,
        size: undefined,
      };

      const result = renderCenteredHeroTemplate(minimalSpec, fontFaceCss);

      // Verify that omitted elements are not present in manifest
      const elementIds = result.manifest.elements.map((e) => e.id);
      expect(elementIds).not.toContain('campaign_label');
      expect(elementIds).not.toContain('secondary_headline');
      expect(elementIds).not.toContain('supporting_text');

      // Mandatory elements remain intact and valid
      expect(elementIds).toContain('headline');
      expect(elementIds).toContain('price_badge');
      expect(elementIds).toContain('cta_button');
      expect(elementIds).toContain('product_hero_zone');
    });
  });

  describe('3. EDITORIAL_SPLIT Production Characteristics', () => {
    it('supports configurable left/right orientation', () => {
      const baseVector = GOLDEN_TEMPLATE_VECTORS.find(
        (v) => v.templateId === 'EDITORIAL_SPLIT' && v.aspectRatio === '1:1',
      )!;

      // Case 1: Product on LEFT (Default)
      const leftResult = renderEditorialSplitTemplate(
        { ...baseVector.spec, productPlacement: 'LEFT' },
        fontFaceCss,
      );
      const leftHero = leftResult.manifest.elements.find((e) => e.id === 'product_hero_zone')!;
      const leftPanel = leftResult.manifest.elements.find((e) => e.id === 'editorial_panel')!;
      expect(leftHero.boundingBox.x).toBeLessThan(leftPanel.boundingBox.x);
      expect(leftResult.productHeroZone.placement).toBe('LEFT');

      // Case 2: Product on RIGHT (Flipped)
      const rightResult = renderEditorialSplitTemplate(
        { ...baseVector.spec, productPlacement: 'RIGHT' },
        fontFaceCss,
      );
      const rightHero = rightResult.manifest.elements.find((e) => e.id === 'product_hero_zone')!;
      const rightPanel = rightResult.manifest.elements.find((e) => e.id === 'editorial_panel')!;
      expect(rightPanel.boundingBox.x).toBeLessThan(rightHero.boundingBox.x);
      expect(rightResult.productHeroZone.placement).toBe('RIGHT');
    });

    it('adapts to clean responsive vertical stacking in 9:16 format', () => {
      const vector916 = GOLDEN_TEMPLATE_VECTORS.find(
        (v) => v.templateId === 'EDITORIAL_SPLIT' && v.aspectRatio === '9:16',
      )!;

      const result = renderEditorialSplitTemplate(vector916.spec, fontFaceCss);
      const hero = result.manifest.elements.find((e) => e.id === 'product_hero_zone')!;
      const panel = result.manifest.elements.find((e) => e.id === 'editorial_panel')!;

      // In 9:16 vertical stack, hero is above panel
      expect(hero.boundingBox.y).toBeLessThan(panel.boundingBox.y);
      // Both hero and panel take full usable width
      const usableW =
        result.manifest.dimensions.width -
        result.manifest.safeMargins.left -
        result.manifest.safeMargins.right;
      expect(hero.boundingBox.width).toBe(usableW);
      expect(panel.boundingBox.width).toBe(usableW);
    });

    it('collapses optional slots cleanly in Editorial Split', () => {
      const baseVector = GOLDEN_TEMPLATE_VECTORS.find(
        (v) => v.templateId === 'EDITORIAL_SPLIT' && v.aspectRatio === '4:5',
      )!;

      const minimalSpec = {
        ...baseVector.spec,
        campaignLabel: undefined,
        secondaryHeadline: undefined,
        supportingText: undefined,
        promotionalPrice: undefined,
      };

      const result = renderEditorialSplitTemplate(minimalSpec, fontFaceCss);
      const elementIds = result.manifest.elements.map((e) => e.id);

      expect(elementIds).not.toContain('campaign_label');
      expect(elementIds).not.toContain('secondary_headline');
      expect(elementIds).not.toContain('supporting_text');

      expect(elementIds).toContain('headline');
      expect(elementIds).toContain('pricing_block');
      expect(elementIds).toContain('cta_button');
    });
  });

  describe('4. KHMER_SEASONAL Cultural Safeguards & Characteristics (W22-E)', () => {
    it.each(['1:1', '4:5', '9:16'] as const)(
      'renders governed lotus ornament and corner accents for format %s',
      (ratio) => {
        const vector = GOLDEN_TEMPLATE_VECTORS.find(
          (v) =>
            v.templateId === 'KHMER_SEASONAL' && v.aspectRatio === ratio && v.language === 'KM',
        )!;

        const result = renderKhmerSeasonalTemplate(vector.spec, fontFaceCss);
        const { width } = result.manifest.dimensions;

        // Verify lotus ornament
        const lotusEl = result.manifest.elements.find((e) => e.id === 'lotus_ornament')!;
        expect(lotusEl).toBeDefined();
        expect(result.svgOverlay).toContain('d="M 0,-18 C -5,-10 -6,-2 0,6');

        // Verify corner accents
        expect(result.svgOverlay).toContain('stroke-width="1.5" fill="none" stroke-opacity="0.75"');

        // Verify Khmer headline
        const headlineEl = result.manifest.elements.find((e) => e.id === 'headline')!;
        expect(headlineEl.text).toBe(vector.spec.headline);

        // Verify Khmer price tag
        const priceEl = result.manifest.elements.find((e) => e.id === 'pricing_tag')!;
        expect(priceEl.text).toContain('តម្លៃ');

        // Verify product hero zone is centered and properly bounded
        expect(result.productHeroZone.placement).toBe('CENTER');
        const heroCenter =
          result.productHeroZone.boundingBox.x + result.productHeroZone.boundingBox.width / 2;
        expect(Math.abs(heroCenter - width / 2)).toBeLessThanOrEqual(2);
        expect(result.productHeroZone.pedestalYPercent).toBeGreaterThan(0.5);
        expect(result.productHeroZone.pedestalYPercent).toBeLessThan(0.85);
      },
    );

    it('omits lotus ornament when explicitly disabled in decorative selection', () => {
      const baseVector = GOLDEN_TEMPLATE_VECTORS.find(
        (v) => v.templateId === 'KHMER_SEASONAL' && v.aspectRatio === '1:1',
      )!;

      const specWithoutLotus = {
        ...baseVector.spec,
        decorativeSelection: {
          ...baseVector.spec.decorativeSelection,
          lotusOrnament: false,
        },
      };

      const result = renderKhmerSeasonalTemplate(specWithoutLotus, fontFaceCss);
      const elementIds = result.manifest.elements.map((e) => e.id);
      expect(elementIds).not.toContain('lotus_ornament');
    });

    it('collapses optional secondary headline cleanly', () => {
      const baseVector = GOLDEN_TEMPLATE_VECTORS.find(
        (v) => v.templateId === 'KHMER_SEASONAL' && v.aspectRatio === '4:5',
      )!;

      const specWithoutSec = {
        ...baseVector.spec,
        campaignLabel: undefined,
        secondaryHeadline: undefined,
      };

      const result = renderKhmerSeasonalTemplate(specWithoutSec, fontFaceCss);
      const elementIds = result.manifest.elements.map((e) => e.id);
      expect(elementIds).not.toContain('campaign_label');
      expect(elementIds).not.toContain('secondary_headline');
      expect(elementIds).toContain('headline');
      expect(elementIds).toContain('pricing_tag');
      expect(elementIds).toContain('cta_button');
    });
  });

  describe('5. SCENT_STORY Olfactory Education & Truncation Characteristics (W22-E)', () => {
    it.each(['1:1', '4:5'] as const)(
      'renders 2-column split with olfactory pyramid on left and product on right for format %s',
      (ratio) => {
        const vector = GOLDEN_TEMPLATE_VECTORS.find(
          (v) => v.templateId === 'SCENT_STORY' && v.aspectRatio === ratio && v.language === 'EN',
        )!;

        const result = renderScentStoryTemplate(vector.spec, fontFaceCss);
        const { width } = result.manifest.dimensions;

        // Verify product hero is placed on RIGHT
        expect(result.productHeroZone.placement).toBe('RIGHT');
        expect(result.productHeroZone.boundingBox.x).toBeGreaterThan(width * 0.4);

        // Verify panel is on LEFT
        const panelEl = result.manifest.elements.find((e) => e.id === 'scent_panel')!;
        expect(panelEl.boundingBox.x).toBe(result.manifest.safeMargins.left);

        // Verify olfactory notes elements exist with note_ prefix
        const noteElements = result.manifest.elements.filter((e) => e.id.startsWith('note_'));
        expect(noteElements.length).toBeGreaterThanOrEqual(3);

        // Verify Top, Heart, Base tiers
        const elementIds = result.manifest.elements.map((e) => e.id);
        expect(elementIds).toContain('note_top');
        expect(elementIds).toContain('note_heart');
        expect(elementIds).toContain('note_base');
      },
    );

    it('adapts to responsive vertical stacking in 9:16 format with zero collision', () => {
      const vector916 = GOLDEN_TEMPLATE_VECTORS.find(
        (v) => v.templateId === 'SCENT_STORY' && v.aspectRatio === '9:16',
      )!;

      const result = renderScentStoryTemplate(vector916.spec, fontFaceCss);
      expect(result.productHeroZone.placement).toBe('CENTER');

      const hero = result.manifest.elements.find((e) => e.id === 'product_hero_zone')!;
      const panel = result.manifest.elements.find((e) => e.id === 'scent_panel')!;

      // In 9:16 story stack, hero is placed in upper half, panel in lower half
      expect(hero.boundingBox.y).toBeLessThan(panel.boundingBox.y);
      expect(hero.boundingBox.y + hero.boundingBox.height).toBeLessThanOrEqual(panel.boundingBox.y);
    });

    it('truncates long scent notes list according to explicit policy (max 3 per tier)', () => {
      const baseVector = GOLDEN_TEMPLATE_VECTORS.find(
        (v) => v.templateId === 'SCENT_STORY' && v.aspectRatio === '1:1',
      )!;

      const longNotesSpec = {
        ...baseVector.spec,
        decorativeSelection: {
          scentNotes: [
            { name: 'Note 1', category: 'TOP' as const },
            { name: 'Note 2', category: 'TOP' as const },
            { name: 'Note 3', category: 'TOP' as const },
            { name: 'Note 4 Excessive', category: 'TOP' as const },
            { name: 'Note 5 Excessive', category: 'TOP' as const },
            { name: 'Heart Note 1', category: 'HEART' as const },
            { name: 'Base Note 1', category: 'BASE' as const },
          ],
        },
      };

      const result = renderScentStoryTemplate(longNotesSpec, fontFaceCss);
      const topNoteEl = result.manifest.elements.find((e) => e.id === 'note_top')!;
      expect(topNoteEl.text).toContain('Note 1');
      expect(topNoteEl.text).toContain('Note 2');
      expect(topNoteEl.text).toContain('Note 3');
      expect(topNoteEl.text).not.toContain('Note 4 Excessive');
      expect(topNoteEl.text).not.toContain('Note 5 Excessive');
    });

    it('collapses unprovided olfactory tiers cleanly without orphaned space', () => {
      const baseVector = GOLDEN_TEMPLATE_VECTORS.find(
        (v) => v.templateId === 'SCENT_STORY' && v.aspectRatio === '1:1',
      )!;

      // Only TOP and BASE provided; HEART is omitted
      const twoTierSpec = {
        ...baseVector.spec,
        decorativeSelection: {
          scentNotes: [
            { name: 'Calabrian Bergamot', category: 'TOP' as const },
            { name: 'White Sandalwood', category: 'BASE' as const },
          ],
        },
      };

      const result = renderScentStoryTemplate(twoTierSpec, fontFaceCss);
      const elementIds = result.manifest.elements.map((e) => e.id);
      expect(elementIds).toContain('note_top');
      expect(elementIds).not.toContain('note_heart');
      expect(elementIds).toContain('note_base');
    });

    it('supports bilingual olfactory labels in BILINGUAL mode', () => {
      const bilingualVector = GOLDEN_TEMPLATE_VECTORS.find(
        (v) => v.templateId === 'SCENT_STORY' && v.language === 'BILINGUAL',
      )!;

      const result = renderScentStoryTemplate(bilingualVector.spec, fontFaceCss);
      const topLabelEl = result.manifest.elements.find((e) => e.id === 'note_top_label')!;
      expect(topLabelEl.text).toContain('TOP NOTE');
      expect(topLabelEl.text).toContain('ក្លិនដើម');
    });
  });

  describe('6. PROMOTION_PRICE_CTA Production Characteristics (W22-F)', () => {
    it.each(['1:1', '4:5', '9:16'] as const)(
      'renders standard promotion with dual price lockup for format %s',
      (ratio) => {
        const vector = GOLDEN_TEMPLATE_VECTORS.find(
          (v) =>
            v.templateId === 'PROMOTION_PRICE_CTA' &&
            v.aspectRatio === ratio &&
            v.language === 'EN',
        )!;

        const result = renderPromotionPriceCtaTemplate(vector.spec, fontFaceCss);
        const { width } = result.manifest.dimensions;

        // Verify product hero is centered
        expect(result.productHeroZone.placement).toBe('CENTER');
        const heroCenter =
          result.productHeroZone.boundingBox.x + result.productHeroZone.boundingBox.width / 2;
        expect(Math.abs(heroCenter - width / 2)).toBeLessThanOrEqual(2);

        // Verify elements in manifest
        const elementIds = result.manifest.elements.map((e) => e.id);
        expect(elementIds).toContain('headline');
        expect(elementIds).toContain('pricing_block');
        expect(elementIds).toContain('cta_button');
        expect(elementIds).toContain('product_hero_zone');

        // Verify dual price lockup in SVG overlay (vector strikethrough line)
        expect(result.svgOverlay).toMatch(/<line[^>]+stroke=/i);
        expect(result.svgOverlay).not.toContain('text-decoration="line-through"');
      },
    );

    it('renders promotion without original price when not verified (no invented strikethrough)', () => {
      const vector = GOLDEN_TEMPLATE_VECTORS.find((v) => v.id === 'promo_no_original_price_1_1')!;

      const result = renderPromotionPriceCtaTemplate(vector.spec, fontFaceCss);
      expect(result.svgOverlay).not.toContain('text-decoration="line-through"');
      expect(result.svgOverlay).not.toMatch(/<line[^>]+stroke=/i);

      const priceEl = result.manifest.elements.find((e) => e.id === 'pricing_block')!;
      expect(priceEl.text).toBe('$160');
    });

    it('omits strikethrough when promotionalPrice equals original price (unverified savings)', () => {
      const vector = GOLDEN_TEMPLATE_VECTORS.find((v) => v.id === 'promo_unverified_discount_1_1')!;

      const result = renderPromotionPriceCtaTemplate(vector.spec, fontFaceCss);
      expect(result.svgOverlay).not.toContain('text-decoration="line-through"');
      expect(result.svgOverlay).not.toMatch(/<line[^>]+stroke=/i);
    });

    it('renders Cambodian Riel currency price format accurately', () => {
      const vector = GOLDEN_TEMPLATE_VECTORS.find((v) => v.id === 'promo_khmer_price_km_1_1')!;

      const result = renderPromotionPriceCtaTemplate(vector.spec, fontFaceCss);
      const priceEl = result.manifest.elements.find((e) => e.id === 'pricing_block')!;
      expect(priceEl.text).toContain('580,000 ៛');
      expect(priceEl.text).toContain('780,000 ៛');
      expect(result.svgOverlay).toContain('580,000 ៛');
      expect(result.svgOverlay).toContain('780,000 ៛');
    });

    it('renders extreme price length in Cambodian Riel within safe boundaries', () => {
      const vector = GOLDEN_TEMPLATE_VECTORS.find(
        (v) => v.id === 'promo_extreme_price_length_9_16',
      )!;

      const result = renderPromotionPriceCtaTemplate(vector.spec, fontFaceCss);
      const priceEl = result.manifest.elements.find((e) => e.id === 'pricing_block')!;
      expect(priceEl.boundingBox.x).toBeGreaterThanOrEqual(result.manifest.safeMargins.left - 1);
      expect(priceEl.boundingBox.x + priceEl.boundingBox.width).toBeLessThanOrEqual(
        result.manifest.dimensions.width - result.manifest.safeMargins.right + 1,
      );
    });

    it('collapses optional promotion slots cleanly without orphaned space', () => {
      const vector = GOLDEN_TEMPLATE_VECTORS.find(
        (v) => v.id === 'promo_missing_optional_copy_4_5',
      )!;

      const result = renderPromotionPriceCtaTemplate(vector.spec, fontFaceCss);
      const elementIds = result.manifest.elements.map((e) => e.id);

      expect(elementIds).not.toContain('campaign_label');
      expect(elementIds).not.toContain('secondary_headline');
      expect(elementIds).not.toContain('supporting_text');

      expect(elementIds).toContain('headline');
      expect(elementIds).toContain('pricing_block');
      expect(elementIds).toContain('cta_button');
      expect(elementIds).toContain('product_hero_zone');
    });

    it('scales down long product headline gracefully within 2 lines', () => {
      const vector = GOLDEN_TEMPLATE_VECTORS.find((v) => v.id === 'promo_long_product_name_1_1')!;

      const result = renderPromotionPriceCtaTemplate(vector.spec, fontFaceCss);
      const headlineEl = result.manifest.elements.find((e) => e.id === 'headline')!;
      expect(headlineEl).toBeDefined();
      expect(headlineEl.boundingBox.height).toBeLessThanOrEqual(100);
    });

    it('integrates Haussmann Luxe style preset as a governed optional treatment without creating a sixth template', () => {
      const vector = GOLDEN_TEMPLATE_VECTORS.find((v) => v.id === 'promo_standard_en_1_1')!;

      const result = renderPromotionPriceCtaTemplate(vector.spec, fontFaceCss);
      expect(result.svgOverlay).toContain('<!-- Haussmann Outer Border -->');
      expect(result.svgOverlay).toContain('<!-- Haussmann Inset Line -->');
      expect(result.manifest.templateId).toBe('PROMOTION_PRICE_CTA');
    });

    it('enforces commercial fact provenance in production rendering mode', () => {
      const vector = GOLDEN_TEMPLATE_VECTORS.find((v) => v.id === 'promo_standard_en_1_1')!;

      // 1. Missing provenance in production fails closed
      const specWithoutProv = { ...vector.spec, commercialProvenance: undefined };
      expect(() =>
        renderPromotionPriceCtaTemplate(specWithoutProv, fontFaceCss, undefined, {
          allowNonApprovedForTesting: false,
        }),
      ).toThrow(UnverifiedCommercialFactError);

      // 2. Price mismatch between spec and provenance fails closed
      const specPriceMismatch = {
        ...vector.spec,
        price: '199',
        commercialProvenance: {
          productSnapshotId: 'snap-1',
          snapshotDigest: 'a'.repeat(64),
          priceValue: '120',
          currency: 'USD',
          originalPriceAuthorized: true,
        },
      };
      expect(() =>
        renderPromotionPriceCtaTemplate(specPriceMismatch, fontFaceCss, undefined, {
          allowNonApprovedForTesting: false,
        }),
      ).toThrow(UnverifiedCommercialFactError);

      // 3. Strikethrough price without authorization fails closed
      const specUnauthorizedStrikethrough = {
        ...vector.spec,
        promotionalPrice: '99',
        price: '150',
        commercialProvenance: {
          productSnapshotId: 'snap-1',
          snapshotDigest: 'a'.repeat(64),
          priceValue: '150',
          currency: 'USD',
          originalPriceAuthorized: false,
        },
      };
      expect(() =>
        renderPromotionPriceCtaTemplate(specUnauthorizedStrikethrough, fontFaceCss, undefined, {
          allowNonApprovedForTesting: false,
        }),
      ).toThrow(UnverifiedCommercialFactError);

      // 4. Prohibited fake urgency phrase fails closed
      const specUrgency = {
        ...vector.spec,
        headline: 'Flash Sale! Only 2 left in stock',
        commercialProvenance: {
          productSnapshotId: 'snap-1',
          snapshotDigest: 'a'.repeat(64),
          priceValue: vector.spec.price,
          currency: vector.spec.currency,
          originalPriceAuthorized: true,
          campaignLabelAuthorized: false,
        },
      };
      expect(() =>
        renderPromotionPriceCtaTemplate(specUrgency, fontFaceCss, undefined, {
          allowNonApprovedForTesting: false,
        }),
      ).toThrow(UnverifiedCommercialFactError);
    });
  });

  describe('7. Fail-Closed Invariants & Typed Errors (All Templates)', () => {
    it('throws InvalidPosterSpecError when mandatory headline is empty', () => {
      const vector = GOLDEN_TEMPLATE_VECTORS[0]!;
      expect(() =>
        renderCenteredHeroTemplate({ ...vector.spec, headline: '' }, fontFaceCss),
      ).toThrow(InvalidPosterSpecError);
      expect(() =>
        renderEditorialSplitTemplate({ ...vector.spec, headline: '   ' }, fontFaceCss),
      ).toThrow(InvalidPosterSpecError);
      expect(() =>
        renderKhmerSeasonalTemplate({ ...vector.spec, headline: '' }, fontFaceCss),
      ).toThrow(InvalidPosterSpecError);
      expect(() => renderScentStoryTemplate({ ...vector.spec, headline: '' }, fontFaceCss)).toThrow(
        InvalidPosterSpecError,
      );
      expect(() =>
        renderPromotionPriceCtaTemplate({ ...vector.spec, headline: '' }, fontFaceCss),
      ).toThrow(InvalidPosterSpecError);
    });

    it('throws InvalidPosterSpecError when mandatory price is empty', () => {
      const vector = GOLDEN_TEMPLATE_VECTORS[0]!;
      expect(() => renderCenteredHeroTemplate({ ...vector.spec, price: '' }, fontFaceCss)).toThrow(
        InvalidPosterSpecError,
      );
      expect(() =>
        renderEditorialSplitTemplate({ ...vector.spec, price: '  ' }, fontFaceCss),
      ).toThrow(InvalidPosterSpecError);
      expect(() => renderKhmerSeasonalTemplate({ ...vector.spec, price: '' }, fontFaceCss)).toThrow(
        InvalidPosterSpecError,
      );
      expect(() => renderScentStoryTemplate({ ...vector.spec, price: '' }, fontFaceCss)).toThrow(
        InvalidPosterSpecError,
      );
      expect(() =>
        renderPromotionPriceCtaTemplate(
          { ...vector.spec, price: '', promotionalPrice: undefined },
          fontFaceCss,
        ),
      ).toThrow(InvalidPosterSpecError);
    });

    it('throws InvalidPosterSpecError when mandatory cta is empty', () => {
      const vector = GOLDEN_TEMPLATE_VECTORS[0]!;
      expect(() => renderCenteredHeroTemplate({ ...vector.spec, cta: '' }, fontFaceCss)).toThrow(
        InvalidPosterSpecError,
      );
      expect(() => renderEditorialSplitTemplate({ ...vector.spec, cta: '' }, fontFaceCss)).toThrow(
        InvalidPosterSpecError,
      );
      expect(() => renderKhmerSeasonalTemplate({ ...vector.spec, cta: '' }, fontFaceCss)).toThrow(
        InvalidPosterSpecError,
      );
      expect(() => renderScentStoryTemplate({ ...vector.spec, cta: '' }, fontFaceCss)).toThrow(
        InvalidPosterSpecError,
      );
      expect(() =>
        renderPromotionPriceCtaTemplate({ ...vector.spec, cta: '' }, fontFaceCss),
      ).toThrow(InvalidPosterSpecError);
    });

    it('throws InvalidPosterSpecError when scentNotes array is explicitly empty in SCENT_STORY', () => {
      const scentVector = GOLDEN_TEMPLATE_VECTORS.find((v) => v.templateId === 'SCENT_STORY')!;
      expect(() =>
        renderScentStoryTemplate(
          { ...scentVector.spec, decorativeSelection: { scentNotes: [] } },
          fontFaceCss,
        ),
      ).toThrow(InvalidPosterSpecError);

      expect(() =>
        renderScentStoryTemplate(
          {
            ...scentVector.spec,
            decorativeSelection: { scentNotes: [{ name: '   ', category: 'TOP' }] },
          },
          fontFaceCss,
        ),
      ).toThrow(InvalidPosterSpecError);
    });

    it('throws PosterLayoutOverflowError when container is impossibly constrained', () => {
      const vector = GOLDEN_TEMPLATE_VECTORS[0]!;
      const tinySpec = {
        ...vector.spec,
        outputFormat: { aspectRatio: '1:1' as const, width: 200, height: 100 },
      };

      expect(() => renderCenteredHeroTemplate(tinySpec, fontFaceCss)).toThrow(
        PosterLayoutOverflowError,
      );
      expect(() => renderKhmerSeasonalTemplate(tinySpec, fontFaceCss)).toThrow(
        PosterLayoutOverflowError,
      );
      expect(() => renderPromotionPriceCtaTemplate(tinySpec, fontFaceCss)).toThrow(
        PosterLayoutOverflowError,
      );
    });
  });

  describe('8. Repeat-Render Determinism (All 50 Canonical Golden Vectors)', () => {
    it('guarantees bit-exact repeat render determinism for all 5 templates across all formats', () => {
      for (const vector of GOLDEN_TEMPLATE_VECTORS) {
        const render1 = PosterTemplateRenderer.renderTemplate(vector.spec, fontFaceCss, {
          allowNonApprovedForTesting: true,
        });
        const render2 = PosterTemplateRenderer.renderTemplate(vector.spec, fontFaceCss, {
          allowNonApprovedForTesting: true,
        });

        const hash1 = createHash('sha256').update(render1.svgOverlay).digest('hex');
        const hash2 = createHash('sha256').update(render2.svgOverlay).digest('hex');

        expect(hash1).toBe(hash2);
        expect(render1.manifest).toEqual(render2.manifest);
        expect(render1.productHeroZone).toEqual(render2.productHeroZone);
      }
    });
  });
});
