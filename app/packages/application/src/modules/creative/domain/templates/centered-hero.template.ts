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
import { renderShapedTextLineSvg } from '../services/safe-svg-renderer.js';
import {
  InvalidPosterSpecError,
  PosterLayoutOverflowError,
  PosterCollisionError,
} from '../creative-errors.js';
import { ResponsiveConstraintEngine } from './responsive-constraint-engine.js';
import { type LayoutBoundingBox } from './responsive-constraint-engine.types.js';

/**
 * Production-quality v1.0.0 implementation of CENTERED_HERO canonical template family.
 *
 * Provides:
 * - Strong luxury-product focal point with controlled central symmetry
 * - Proportional zero-cropping hero zone and pedestal grounding
 * - Central typography hierarchy (eyebrow, headline, supporting text, price, CTA)
 * - Safe margins containment and collision-free bounds across 1:1, 4:5, and 9:16
 */
export function renderCenteredHeroTemplate(
  spec: PosterSpec,
  fontFaceCss: string,
  tokens?: TemplateDesignTokens,
  _options?: RenderPosterOptions,
): ComputedTemplateLayout {
  // Validate mandatory fields
  if (!spec.headline || spec.headline.trim().length === 0) {
    throw new InvalidPosterSpecError('Headline is required for Centered Hero template.');
  }
  if (!spec.price || spec.price.trim().length === 0) {
    throw new InvalidPosterSpecError('Price is required for Centered Hero template.');
  }
  if (!spec.cta || spec.cta.trim().length === 0) {
    throw new InvalidPosterSpecError(
      'Call to action (CTA) is required for Centered Hero template.',
    );
  }

  const { width, height, aspectRatio } = spec.outputFormat;
  const activeTokens = tokens ?? TemplateRegistry.getInstance().getTemplate('CENTERED_HERO').tokens;
  const formatTokens = activeTokens.formatAdaptations[aspectRatio];
  const margins = formatTokens.safeMargins;

  const elements: LayoutManifestElement[] = [];
  const svgParts: string[] = [];

  // 1. Background Gradients: Top and Bottom Vignette for Contrast
  svgParts.push(`
    <defs>
      <linearGradient id="centeredTopVignette" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0E0F12" stop-opacity="0.75" />
        <stop offset="60%" stop-color="#0E0F12" stop-opacity="0.30" />
        <stop offset="100%" stop-color="#0E0F12" stop-opacity="0.0" />
      </linearGradient>
      <linearGradient id="centeredBottomVignette" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0E0F12" stop-opacity="0.0" />
        <stop offset="50%" stop-color="#0E0F12" stop-opacity="0.35" />
        <stop offset="85%" stop-color="#0E0F12" stop-opacity="0.85" />
        <stop offset="100%" stop-color="#0E0F12" stop-opacity="0.95" />
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${width}" height="${Math.round(height * 0.32)}" fill="url(#centeredTopVignette)" />
    <rect x="0" y="${Math.round(height * 0.45)}" width="${width}" height="${Math.round(height * 0.55)}" fill="url(#centeredBottomVignette)" />
  `);

  // 2. Header Zone (Top): Campaign Eyebrow & Centered Headline
  let topY = margins.top;

  // 2.1 Campaign Eyebrow (Optional)
  if (spec.campaignLabel && spec.campaignLabel.trim().length > 0) {
    const eyebrowToken = activeTokens.baseTypographyRoles.EYEBROW;
    const eyebrowWrapped = TextLayoutEngine.wrapText({
      text: spec.campaignLabel.toUpperCase(),
      maxWidth: width - margins.left - margins.right,
      initialFontSize: eyebrowToken.fontSize,
      minFontSize: eyebrowToken.minFontSize,
      maxLines: 1,
      elementName: 'campaign_label',
      role: 'LABEL',
      preferredLatinFont: 'Montserrat',
      latinWeight: eyebrowToken.fontWeight,
      khmerWeight: 700,
      tracking: eyebrowToken.letterSpacing,
    });
    const labelBox: BoundingBox = {
      x: Math.round((width - eyebrowWrapped.actualBoundingBox.width) / 2),
      y: topY,
      width: eyebrowWrapped.actualBoundingBox.width,
      height: eyebrowWrapped.actualBoundingBox.height,
    };
    elements.push({
      id: 'campaign_label',
      type: 'TEXT',
      text: spec.campaignLabel,
      boundingBox: labelBox,
    });

    if (eyebrowWrapped.shapedLines[0]) {
      svgParts.push(
        renderShapedTextLineSvg({
          x: width / 2,
          baselineY: labelBox.y + eyebrowWrapped.shapedLines[0].baseline,
          runs: eyebrowWrapped.shapedLines[0].runs,
          color: spec.palette.accentColor,
          textAnchor: 'middle',
          mode: 'GLYPH_PATHS',
        }),
      );
    }
    topY += labelBox.height + activeTokens.spacing.xs;
  }

  // 2.2 Centered Headline (Mandatory)
  const headlineMaxW = width - margins.left - margins.right;
  const headlineRole = activeTokens.baseTypographyRoles.HEADLINE;
  const headlineWrapped: WrappedTextResult = TextLayoutEngine.wrapText({
    text: spec.headline,
    maxWidth: headlineMaxW,
    initialFontSize: headlineRole.fontSize,
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
  topY += headlineBox.height + activeTokens.spacing.sm;

  // 2.3 Secondary Headline (Optional)
  if (spec.secondaryHeadline && spec.secondaryHeadline.trim().length > 0) {
    const secRole = activeTokens.baseTypographyRoles.SECONDARY_HEADLINE;
    const secWrapped = TextLayoutEngine.wrapText({
      text: spec.secondaryHeadline,
      maxWidth: headlineMaxW,
      initialFontSize: secRole.fontSize,
      minFontSize: secRole.minFontSize,
      maxLines: 2,
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

  // 3. Footer Zone (Bottom): Sizing & CTA Button
  // Budget footer backwards from canvas bottom safe margin
  const ctaH = 48;
  const ctaW = 200;
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
    initialFontSize: 15,
    minFontSize: 12,
    maxLines: 1,
    elementName: 'cta_button',
    role: 'CTA',
    preferredLatinFont: 'Montserrat',
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
          x: ctaBox.x + ctaBox.width / 2,
          baselineY: ctaBaselineY,
          runs: firstCtaLine.runs,
          color: activeTokens.colorRoles.ctaText || '#0E0F12',
          textAnchor: 'middle',
          mode: 'GLYPH_PATHS',
        })
      : '';

  svgParts.push(`
    <g>
      <rect x="${ctaBox.x}" y="${ctaBox.y}" width="${ctaBox.width}" height="${ctaBox.height}" rx="24" fill="${spec.palette.accentColor}" />
      ${ctaContentSvg}
    </g>
  `);
  elements.push({ id: 'cta_button', type: 'BUTTON', text: spec.cta, boundingBox: ctaBox });

  // Pricing & Volume Pill
  const pricePillY = ctaBox.y - 48;
  const pricePillText = spec.promotionalPrice
    ? `${spec.promotionalPrice} (${spec.price})`
    : `${spec.currency} ${spec.price}`;
  const pillW = TextLayoutEngine.measureStringWidth(pricePillText, 16, 0, 'PRICE') + 36;
  const priceBox: BoundingBox = {
    x: Math.round((width - pillW) / 2),
    y: pricePillY,
    width: pillW,
    height: 32,
  };
  elements.push({
    id: 'price_badge',
    type: 'BADGE',
    text: pricePillText,
    boundingBox: priceBox,
  });

  const priceWrapped = TextLayoutEngine.wrapText({
    text: pricePillText,
    maxWidth: width - margins.left - margins.right,
    initialFontSize: 14,
    minFontSize: 12,
    maxLines: 1,
    elementName: 'price_badge',
    role: 'PRICE',
    preferredLatinFont: 'Montserrat',
    latinWeight: 600,
    khmerWeight: 700,
  });

  const priceFirstLine = priceWrapped.shapedLines[0];
  const priceBaselineY =
    priceFirstLine !== undefined
      ? priceBox.y +
        Math.round((priceBox.height + priceFirstLine.ascent - priceFirstLine.descent) / 2)
      : priceBox.y + Math.round(priceBox.height / 2);

  const priceContentSvg =
    priceFirstLine !== undefined
      ? renderShapedTextLineSvg({
          x: width / 2,
          baselineY: priceBaselineY,
          runs: priceFirstLine.runs,
          color: spec.palette.textColor,
          textAnchor: 'middle',
          mode: 'GLYPH_PATHS',
        })
      : '';

  svgParts.push(`
    <g>
      <rect x="${priceBox.x}" y="${priceBox.y}" width="${priceBox.width}" height="${priceBox.height}" rx="16" fill="${spec.palette.panelBackground || 'rgba(14, 15, 18, 0.78)'}" stroke="${spec.palette.accentColor}" stroke-opacity="0.3" stroke-width="1" />
      ${priceContentSvg}
    </g>
  `);

  // Supporting Text (Optional)
  let footerTopY = priceBox.y;
  if (spec.supportingText && spec.supportingText.trim().length > 0) {
    const bodyRole = activeTokens.baseTypographyRoles.BODY;
    const suppWrapped = TextLayoutEngine.wrapText({
      text: spec.supportingText,
      maxWidth: width - margins.left - margins.right - 80,
      initialFontSize: bodyRole.fontSize - 2,
      minFontSize: bodyRole.minFontSize,
      maxLines: 2,
      elementName: 'supporting_text',
      role: 'BODY',
      latinWeight: 400,
      khmerWeight: 400,
    });
    const suppH = suppWrapped.actualBoundingBox.height;
    const suppY = priceBox.y - suppH - activeTokens.spacing.xs;
    const suppBox: BoundingBox = {
      x: Math.round((width - suppWrapped.actualBoundingBox.width) / 2),
      y: suppY,
      width: suppWrapped.actualBoundingBox.width,
      height: suppH,
    };
    elements.push({
      id: 'supporting_text',
      type: 'TEXT',
      text: spec.supportingText,
      boundingBox: suppBox,
    });

    suppWrapped.shapedLines.forEach((shapedLine, idx) => {
      svgParts.push(
        renderShapedTextLineSvg({
          x: width / 2,
          baselineY: suppBox.y + shapedLine.baseline + idx * suppWrapped.lineHeight,
          runs: shapedLine.runs,
          color: spec.palette.secondaryTextColor,
          textAnchor: 'middle',
          mode: 'GLYPH_PATHS',
        }),
      );
    });
    footerTopY = suppY;
  }

  // 4. Center Hero Zone
  // The product hero zone occupies the space between the header bottom and footer top
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

  // 5. Invariant Assertions: Safe Area & Collisions
  const usableArea: LayoutBoundingBox = {
    x: margins.left,
    y: margins.top,
    width: width - margins.left - margins.right,
    height: height - margins.top - margins.bottom,
  };

  for (const el of elements) {
    if (el.type === 'PANEL') {
      continue;
    }
    if (!ResponsiveConstraintEngine.isContainedWithin(el.boundingBox, usableArea)) {
      throw new PosterLayoutOverflowError(
        el.id,
        `Element "${el.id}" breaches safe margins boundaries.`,
        { elementBox: el.boundingBox, usableArea },
      );
    }
  }

  // Verify no text/badge elements collide with product hero zone
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

  // 6. Build Final SVG Overlay & Manifest
  const svgOverlay = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <style>${fontFaceCss}</style>
      ${svgParts.join('\n')}
    </svg>
  `;

  const manifest: PosterLayoutManifest = {
    version: '1.0.0',
    templateId: 'CENTERED_HERO',
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
