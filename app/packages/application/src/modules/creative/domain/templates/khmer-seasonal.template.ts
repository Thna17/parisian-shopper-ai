import type { PosterSpec } from '../poster-spec.js';
import type {
  ComputedTemplateLayout,
  LayoutManifestElement,
  PosterLayoutManifest,
  RenderPosterOptions,
} from '../poster-templates.js';
import type { TemplateDesignTokens } from './template-registry.types.js';
import { TemplateRegistry } from './template-registry.js';
import {
  TextLayoutEngine,
  type BoundingBox,
  type WrappedTextResult,
} from '../services/text-layout-engine.js';
import {
  renderShapedTextLineSvg,
  renderCornerAccentsSvg,
  renderLotusOrnamentSvg,
} from '../services/safe-svg-renderer.js';
import {
  InvalidPosterSpecError,
  PosterLayoutOverflowError,
  PosterCollisionError,
} from '../creative-errors.js';
import { ResponsiveConstraintEngine } from './responsive-constraint-engine.js';
import { type LayoutBoundingBox } from './responsive-constraint-engine.types.js';

/**
 * Production-quality v1.0.0 implementation of KHMER_SEASONAL canonical template family.
 *
 * Cultural Safeguards & Design Requirements:
 * - Khmer-first visual hierarchy with Noto Sans Khmer OpenType shaping (W21)
 * - Culturally respectful composition: governed ceremonial lotus crest & traditional corner accents
 * - Strict prohibition of random sacred symbols or invented religious claims
 * - Strong, uncompromised product prominence with pedestal baseline grounding
 * - Controlled decoration density with zero visual clutter
 * - Fail-closed validation and safe margin containment across 1:1, 4:5, and 9:16
 */
export function renderKhmerSeasonalTemplate(
  spec: PosterSpec,
  fontFaceCss: string,
  tokens?: TemplateDesignTokens,
  _options?: RenderPosterOptions,
): ComputedTemplateLayout {
  // 1. Mandatory Fields Validation
  if (!spec.headline || spec.headline.trim().length === 0) {
    throw new InvalidPosterSpecError('Headline is required for Khmer Seasonal template.');
  }
  if (!spec.price || spec.price.trim().length === 0) {
    throw new InvalidPosterSpecError('Price is required for Khmer Seasonal template.');
  }
  if (!spec.cta || spec.cta.trim().length === 0) {
    throw new InvalidPosterSpecError(
      'Call to action (CTA) is required for Khmer Seasonal template.',
    );
  }

  const { width, height, aspectRatio } = spec.outputFormat;
  const activeTokens =
    tokens ?? TemplateRegistry.getInstance().getTemplate('KHMER_SEASONAL').tokens;
  const formatTokens = activeTokens.formatAdaptations[aspectRatio];
  const margins = formatTokens.safeMargins;

  const elements: LayoutManifestElement[] = [];
  const svgParts: string[] = [];

  // 2. Subtle Traditional Corner Accents (Culturally Governed Frame)
  svgParts.push(
    renderCornerAccentsSvg({
      width,
      height,
      margin: margins.left - 18,
      color: spec.palette.accentColor,
    }),
  );

  // 3. Header Zone (Top): Lotus Crest, Optional Campaign Eyebrow, Khmer Headline & Subtitle
  let topY = margins.top;

  // 3.1 Lotus Ornament (Ceremonial Festive Crest)
  const showLotus = spec.decorativeSelection?.lotusOrnament !== false;
  if (showLotus) {
    const lotusBox: BoundingBox = {
      x: Math.round(width / 2) - 30,
      y: topY,
      width: 60,
      height: 36,
    };
    elements.push({ id: 'lotus_ornament', type: 'ORNAMENT', boundingBox: lotusBox });
    svgParts.push(
      renderLotusOrnamentSvg({
        centerX: width / 2,
        centerY: topY + 18,
        color: spec.palette.accentColor,
        scale: 1.1,
      }),
    );
    topY += 46;
  }

  // 3.2 Campaign Eyebrow (Optional)
  if (spec.campaignLabel && spec.campaignLabel.trim().length > 0) {
    const eyebrowToken = activeTokens.baseTypographyRoles.EYEBROW;
    const labelW = TextLayoutEngine.measureStringWidth(
      spec.campaignLabel,
      eyebrowToken.fontSize,
      eyebrowToken.letterSpacing,
      'LABEL',
    );
    const labelBox: BoundingBox = {
      x: Math.round((width - labelW) / 2),
      y: topY,
      width: Math.min(width - margins.left - margins.right, labelW),
      height: 20,
    };
    elements.push({
      id: 'campaign_label',
      type: 'TEXT',
      text: spec.campaignLabel,
      boundingBox: labelBox,
    });

    const eyebrowWrapped = TextLayoutEngine.wrapText({
      text: spec.campaignLabel,
      maxWidth: width - margins.left - margins.right,
      initialFontSize: eyebrowToken.fontSize,
      minFontSize: eyebrowToken.minFontSize,
      maxLines: 1,
      elementName: 'campaign_label',
      role: 'LABEL',
      latinWeight: 600,
      khmerWeight: 700,
    });
    eyebrowWrapped.shapedLines.forEach((shapedLine, idx) => {
      svgParts.push(
        renderShapedTextLineSvg({
          x: width / 2,
          baselineY: labelBox.y + shapedLine.baseline + idx * eyebrowWrapped.lineHeight,
          runs: shapedLine.runs,
          color: spec.palette.accentColor,
          textAnchor: 'middle',
          mode: 'GLYPH_PATHS',
        }),
      );
    });
    topY += labelBox.height + activeTokens.spacing.xs;
  }

  // 3.3 Prominent Khmer Headline (Mandatory)
  const maxHeadlineW = width - margins.left - margins.right - 40;
  const headlineRole = activeTokens.baseTypographyRoles.HEADLINE;
  const headlineWrapped: WrappedTextResult = TextLayoutEngine.wrapText({
    text: spec.headline,
    maxWidth: maxHeadlineW,
    initialFontSize: Math.min(42, headlineRole.fontSize),
    minFontSize: headlineRole.minFontSize,
    maxLines: 2,
    elementName: 'headline',
    role: 'HEADLINE',
    latinWeight: 700,
    khmerWeight: 700,
  });

  const headlineBox: BoundingBox = {
    x: Math.round((width - headlineWrapped.actualBoundingBox.width) / 2),
    y: topY,
    width: headlineWrapped.actualBoundingBox.width,
    height: headlineWrapped.actualBoundingBox.height,
  };
  elements.push({ id: 'headline', type: 'TEXT', text: spec.headline, boundingBox: headlineBox });

  headlineWrapped.shapedLines.forEach((shapedLine, idx) => {
    svgParts.push(
      renderShapedTextLineSvg({
        x: width / 2,
        baselineY: headlineBox.y + shapedLine.baseline + idx * headlineWrapped.lineHeight,
        runs: shapedLine.runs,
        color: spec.palette.textColor,
        textAnchor: 'middle',
        mode: 'GLYPH_PATHS',
      }),
    );
  });
  topY += headlineBox.height + activeTokens.spacing.xs;

  // 3.4 Secondary Headline (Optional Bilingual Subtitle)
  if (spec.secondaryHeadline && spec.secondaryHeadline.trim().length > 0) {
    const secRole = activeTokens.baseTypographyRoles.SECONDARY_HEADLINE;
    const secWrapped = TextLayoutEngine.wrapText({
      text: spec.secondaryHeadline,
      maxWidth: maxHeadlineW,
      initialFontSize: secRole.fontSize,
      minFontSize: secRole.minFontSize,
      maxLines: 1,
      elementName: 'secondary_headline',
      role: 'SECONDARY_HEADLINE',
      latinWeight: 500,
      khmerWeight: 400,
    });
    const secBox: BoundingBox = {
      x: Math.round((width - secWrapped.actualBoundingBox.width) / 2),
      y: topY,
      width: secWrapped.actualBoundingBox.width,
      height: secWrapped.actualBoundingBox.height,
    };
    elements.push({
      id: 'secondary_headline',
      type: 'TEXT',
      text: spec.secondaryHeadline,
      boundingBox: secBox,
    });

    secWrapped.shapedLines.forEach((shapedLine, idx) => {
      svgParts.push(
        renderShapedTextLineSvg({
          x: width / 2,
          baselineY: secBox.y + shapedLine.baseline + idx * secWrapped.lineHeight,
          runs: shapedLine.runs,
          color: spec.palette.accentColor,
          textAnchor: 'middle',
          mode: 'GLYPH_PATHS',
        }),
      );
    });
    topY += secBox.height + activeTokens.spacing.sm;
  }

  // 4. Footer Zone (Bottom): CTA Button & Khmer Price Tag
  const ctaW = 200;
  const ctaH = 46;
  const ctaY = height - margins.bottom - ctaH;
  const ctaBox: BoundingBox = {
    x: Math.round((width - ctaW) / 2),
    y: ctaY,
    width: ctaW,
    height: ctaH,
  };

  const ctaWrapped = TextLayoutEngine.wrapText({
    text: spec.cta,
    maxWidth: ctaW - 16,
    initialFontSize: 16,
    minFontSize: 12,
    maxLines: 1,
    elementName: 'cta_button',
    role: 'CTA',
    latinWeight: 600,
    khmerWeight: 700,
  });

  const firstCtaLine = ctaWrapped.shapedLines[0];
  const ctaBaselineY =
    firstCtaLine !== undefined
      ? ctaBox.y + Math.round((ctaBox.height + firstCtaLine.ascent - firstCtaLine.descent) / 2)
      : ctaBox.y + Math.round(ctaBox.height / 2);

  const ctaContentSvg =
    firstCtaLine !== undefined
      ? renderShapedTextLineSvg({
          x: width / 2,
          baselineY: ctaBaselineY,
          runs: firstCtaLine.runs,
          color: '#0E0F12',
          textAnchor: 'middle',
          mode: 'GLYPH_PATHS',
        })
      : '';

  svgParts.push(`
    <g>
      <rect x="${ctaBox.x}" y="${ctaBox.y}" width="${ctaBox.width}" height="${ctaBox.height}" rx="23" fill="${spec.palette.textColor}" />
      ${ctaContentSvg}
    </g>
  `);
  elements.push({ id: 'cta_button', type: 'BUTTON', text: spec.cta, boundingBox: ctaBox });

  // 4.2 Khmer Price Tag Badge
  const isKhmerLang = spec.language === 'KM';
  const priceTag = spec.promotionalPrice
    ? isKhmerLang
      ? `តម្លៃពិសេស៖ ${spec.promotionalPrice} ${spec.currency}`
      : `Special: ${spec.currency}${spec.promotionalPrice}`
    : isKhmerLang
      ? `តម្លៃ៖ ${spec.price} ${spec.currency}`
      : `Price: ${spec.currency}${spec.price}`;

  const priceW = TextLayoutEngine.measureStringWidth(priceTag, 17, 0, 'PRICE') + 36;
  const pricePillY = ctaBox.y - 48;
  const priceBox: BoundingBox = {
    x: Math.round((width - priceW) / 2),
    y: pricePillY,
    width: priceW,
    height: 38,
  };
  elements.push({ id: 'pricing_tag', type: 'BADGE', text: priceTag, boundingBox: priceBox });

  const priceWrapped = TextLayoutEngine.wrapText({
    text: priceTag,
    maxWidth: width - margins.left - margins.right,
    initialFontSize: 16,
    minFontSize: 13,
    maxLines: 1,
    elementName: 'pricing_tag',
    role: 'PRICE',
    latinWeight: 600,
    khmerWeight: 700,
  });
  const priceLine = priceWrapped.shapedLines[0];
  const priceBaselineY =
    priceLine !== undefined
      ? priceBox.y + Math.round((priceBox.height + priceLine.ascent - priceLine.descent) / 2)
      : priceBox.y + Math.round(priceBox.height / 2);
  const priceContentSvg =
    priceLine !== undefined
      ? renderShapedTextLineSvg({
          x: width / 2,
          baselineY: priceBaselineY,
          runs: priceLine.runs,
          color: spec.palette.accentColor,
          textAnchor: 'middle',
          mode: 'GLYPH_PATHS',
        })
      : '';

  svgParts.push(`
    <g>
      <rect x="${priceBox.x}" y="${priceBox.y}" width="${priceBox.width}" height="${priceBox.height}" rx="19" fill="${spec.palette.badgeBackground || 'rgba(226,179,87,0.2)'}" stroke="${spec.palette.accentColor}" stroke-width="1.2" />
      ${priceContentSvg}
    </g>
  `);

  const footerTopY = priceBox.y;

  // 5. Center Hero Zone on Pedestal
  // Calculate dynamic pedestal baseline guaranteeing zero collision with header and footer
  const pedestalBaselineY = footerTopY - activeTokens.spacing.sm;
  const pedestalYPercent = Math.round((pedestalBaselineY / height) * 1000) / 1000;

  const maxHeroH = Math.min(
    Math.round(height * formatTokens.productScale.maxHeroHeightPercent),
    pedestalBaselineY - topY - activeTokens.spacing.sm,
  );

  if (maxHeroH <= 50) {
    throw new PosterLayoutOverflowError(
      'product_hero_zone',
      `Insufficient vertical space for product hero: topHeader=${topY}, footerTop=${footerTopY}, maxHeroH=${maxHeroH}`,
    );
  }

  const heroW = Math.round(width * formatTokens.productScale.maxHeroRatio);
  const heroZone: LayoutBoundingBox = {
    x: Math.round((width - heroW) / 2),
    y: topY + activeTokens.spacing.sm,
    width: heroW,
    height: maxHeroH,
  };

  const productHeroZone = {
    placement: 'CENTER' as const,
    pedestalYPercent,
    maxHeroWidth: heroW,
    maxHeroHeight: maxHeroH,
    boundingBox: heroZone,
  };
  elements.push({ id: 'product_hero_zone', type: 'PRODUCT', boundingBox: heroZone });

  // 6. Invariant & Safe Margin Verification
  const usableArea: LayoutBoundingBox = {
    x: margins.left,
    y: margins.top,
    width: width - margins.left - margins.right,
    height: height - margins.top - margins.bottom,
  };

  for (const el of elements) {
    if (el.type === 'PANEL' || el.type === 'ORNAMENT') {
      continue;
    }
    if (!ResponsiveConstraintEngine.isContainedWithin(el.boundingBox, usableArea)) {
      throw new PosterLayoutOverflowError(
        el.id,
        `Element "${el.id}" breaches safe area boundaries.`,
        { elementBox: el.boundingBox, usableArea },
      );
    }
  }

  // Verify no text elements overlap the product hero zone
  for (const el of elements) {
    if (el.type === 'TEXT' || el.type === 'BADGE' || el.type === 'BUTTON') {
      if (ResponsiveConstraintEngine.checkCollision(el.boundingBox, heroZone, 0)) {
        throw new PosterCollisionError(el.id, 'product_hero_zone', {
          elementBox: el.boundingBox,
          heroBox: heroZone,
        });
      }
    }
  }

  // 7. Build Final SVG Overlay & Manifest
  const svgOverlay = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <style>${fontFaceCss}</style>
      ${svgParts.join('\n')}
    </svg>
  `;

  const manifest: PosterLayoutManifest = {
    version: '1.0.0',
    templateId: 'KHMER_SEASONAL',
    dimensions: { width, height },
    safeMargins: margins,
    elements,
  };

  return {
    svgOverlay,
    productHeroZone,
    manifest,
  };
}
