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
import { renderShapedTextLineSvg, renderDividerSvg } from '../services/safe-svg-renderer.js';
import {
  InvalidPosterSpecError,
  PosterLayoutOverflowError,
  PosterCollisionError,
} from '../creative-errors.js';
import { ResponsiveConstraintEngine } from './responsive-constraint-engine.js';
import { type LayoutBoundingBox } from './responsive-constraint-engine.types.js';

/**
 * Production-quality v1.0.0 implementation of EDITORIAL_SPLIT canonical template family.
 *
 * Provides:
 * - Disciplined 2-column editorial grid (1:1 and 4:5) and responsive vertical stacking (9:16)
 * - Configurable left/right product placement
 * - Proportional zero-cropping product hero zone
 * - Multi-script HarfBuzz/Intl typography with NFC normalization and Coeng safety
 * - Optional slot collapse and fail-closed validation
 */
export function renderEditorialSplitTemplate(
  spec: PosterSpec,
  fontFaceCss: string,
  tokens?: TemplateDesignTokens,
  _options?: RenderPosterOptions,
): ComputedTemplateLayout {
  // Validate mandatory fields
  if (!spec.headline || spec.headline.trim().length === 0) {
    throw new InvalidPosterSpecError('Headline is required for Editorial Split template.');
  }
  if (!spec.price || spec.price.trim().length === 0) {
    throw new InvalidPosterSpecError('Price is required for Editorial Split template.');
  }
  if (!spec.cta || spec.cta.trim().length === 0) {
    throw new InvalidPosterSpecError(
      'Call to action (CTA) is required for Editorial Split template.',
    );
  }

  const { width, height, aspectRatio } = spec.outputFormat;
  const activeTokens =
    tokens ?? TemplateRegistry.getInstance().getTemplate('EDITORIAL_SPLIT').tokens;
  const formatTokens = activeTokens.formatAdaptations[aspectRatio];
  const margins = formatTokens.safeMargins;

  const elements: LayoutManifestElement[] = [];
  const svgParts: string[] = [];

  // 1. Grid & Zones Calculation
  let heroZone: LayoutBoundingBox;
  let panelZone: LayoutBoundingBox;
  const placement = spec.productPlacement === 'RIGHT' ? ('RIGHT' as const) : ('LEFT' as const);

  if (aspectRatio === '9:16') {
    // 9:16 Story Format: Responsive Vertical Stacking for maximum editorial clarity
    const heroHeight = Math.min(
      Math.round(height * 0.45),
      Math.round(height * formatTokens.productScale.maxHeroHeightPercent),
    );
    const usableW = width - margins.left - margins.right;

    heroZone = {
      x: margins.left,
      y: margins.top,
      width: usableW,
      height: heroHeight,
    };

    const panelY = margins.top + heroHeight + activeTokens.spacing.sm;
    const panelH = height - margins.bottom - panelY;

    panelZone = {
      x: margins.left,
      y: panelY,
      width: usableW,
      height: Math.max(0, panelH),
    };
  } else {
    // 1:1 and 4:5 Formats: Proportional 2-Column Split
    const splitRatio = formatTokens.gridAlignment.splitRatio;
    const gutter = activeTokens.spacing.gutter;

    if (placement === 'RIGHT') {
      const panelW = Math.round(width * (1 - splitRatio)) - margins.left - Math.round(gutter / 2);
      const heroX = margins.left + panelW + gutter;
      const heroW = width - heroX - margins.right;

      panelZone = {
        x: margins.left,
        y: margins.top,
        width: panelW,
        height: height - margins.top - margins.bottom,
      };

      heroZone = {
        x: heroX,
        y: margins.top,
        width: heroW,
        height: height - margins.top - margins.bottom,
      };
    } else {
      // Default: Product on LEFT, Editorial Panel on RIGHT
      const heroW = Math.round(width * splitRatio) - margins.left;
      const panelX = margins.left + heroW + gutter;
      const panelW = width - panelX - margins.right;

      heroZone = {
        x: margins.left,
        y: margins.top,
        width: heroW,
        height: height - margins.top - margins.bottom,
      };

      panelZone = {
        x: panelX,
        y: margins.top,
        width: panelW,
        height: height - margins.top - margins.bottom,
      };
    }
  }

  // Register Hero Zone
  const pedestalYPercent =
    aspectRatio === '9:16'
      ? Math.round(((margins.top + heroZone.height - 16) / height) * 1000) / 1000
      : formatTokens.productScale.pedestalBaselinePercent;

  const productHeroZone = {
    placement,
    pedestalYPercent,
    maxHeroWidth: heroZone.width,
    maxHeroHeight: heroZone.height,
    boundingBox: heroZone,
  };

  elements.push({
    id: 'product_hero_zone',
    type: 'PRODUCT',
    boundingBox: heroZone,
  });

  // Register Editorial Panel
  elements.push({
    id: 'editorial_panel',
    type: 'PANEL',
    boundingBox: panelZone,
  });

  // 2. Editorial Panel Contrast Background
  if (aspectRatio === '9:16') {
    svgParts.push(`
      <defs>
        <linearGradient id="editorialGrad916" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0E0F12" stop-opacity="0.0" />
          <stop offset="25%" stop-color="#0E0F12" stop-opacity="0.75" />
          <stop offset="100%" stop-color="#0E0F12" stop-opacity="0.94" />
        </linearGradient>
      </defs>
      <rect x="0" y="${panelZone.y - 40}" width="${width}" height="${height - panelZone.y + 40}" fill="url(#editorialGrad916)" />
    `);
  } else if (placement === 'RIGHT') {
    svgParts.push(`
      <defs>
        <linearGradient id="editorialGradLeft" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%" stop-color="#0E0F12" stop-opacity="0.0" />
          <stop offset="35%" stop-color="#0E0F12" stop-opacity="0.65" />
          <stop offset="100%" stop-color="#0E0F12" stop-opacity="0.88" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${panelZone.x + panelZone.width + 40}" height="${height}" fill="url(#editorialGradLeft)" />
    `);
  } else {
    svgParts.push(`
      <defs>
        <linearGradient id="editorialGradRight" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#0E0F12" stop-opacity="0.0" />
          <stop offset="35%" stop-color="#0E0F12" stop-opacity="0.65" />
          <stop offset="100%" stop-color="#0E0F12" stop-opacity="0.88" />
        </linearGradient>
      </defs>
      <rect x="${panelZone.x - 40}" y="0" width="${width - panelZone.x + 40}" height="${height}" fill="url(#editorialGradRight)" />
    `);
  }

  // 3. Sequential Reflow Inside Editorial Panel
  const textPadding = activeTokens.spacing.md;
  const contentW = panelZone.width - textPadding * 2;
  const startX = panelZone.x + textPadding;
  let currentY = panelZone.y + textPadding;

  // 3.1 Campaign Label (Optional)
  if (spec.campaignLabel && spec.campaignLabel.trim().length > 0) {
    const eyebrowToken = activeTokens.baseTypographyRoles.EYEBROW;
    const labelW = TextLayoutEngine.measureStringWidth(
      spec.campaignLabel,
      eyebrowToken.fontSize,
      eyebrowToken.letterSpacing,
      'LABEL',
      'Montserrat',
    );
    const labelBox: BoundingBox = {
      x: startX,
      y: currentY,
      width: Math.min(contentW, labelW),
      height: 20,
    };
    elements.push({
      id: 'campaign_label',
      type: 'TEXT',
      text: spec.campaignLabel,
      boundingBox: labelBox,
    });

    const eyebrowWrapped = TextLayoutEngine.wrapText({
      text: spec.campaignLabel.toUpperCase(),
      maxWidth: contentW,
      initialFontSize: eyebrowToken.fontSize,
      minFontSize: eyebrowToken.minFontSize,
      maxLines: 1,
      elementName: 'campaign_label',
      role: 'LABEL',
      preferredLatinFont: 'Montserrat',
      latinWeight: 600,
      khmerWeight: 700,
    });
    eyebrowWrapped.shapedLines.forEach((shapedLine, idx) => {
      svgParts.push(
        renderShapedTextLineSvg({
          x: labelBox.x,
          baselineY: labelBox.y + shapedLine.baseline + idx * eyebrowWrapped.lineHeight,
          runs: shapedLine.runs,
          color: spec.palette.accentColor,
          textAnchor: 'start',
          mode: 'GLYPH_PATHS',
        }),
      );
    });
    currentY += labelBox.height + activeTokens.spacing.xs;
  }

  // 3.2 Headline (Mandatory)
  const headlineRole = activeTokens.baseTypographyRoles.HEADLINE;
  const headlineWrapped: WrappedTextResult = TextLayoutEngine.wrapText({
    text: spec.headline,
    maxWidth: contentW,
    initialFontSize: headlineRole.fontSize,
    minFontSize: headlineRole.minFontSize,
    maxLines: headlineRole.maxLines,
    lineHeightMultiplier: headlineRole.lineHeight,
    tracking: headlineRole.letterSpacing,
    elementName: 'headline',
    role: 'HEADLINE',
    latinWeight: 700,
    khmerWeight: 700,
  });

  const headlineBox: BoundingBox = {
    x: startX,
    y: currentY,
    width: headlineWrapped.actualBoundingBox.width,
    height: headlineWrapped.actualBoundingBox.height,
  };
  elements.push({ id: 'headline', type: 'TEXT', text: spec.headline, boundingBox: headlineBox });

  headlineWrapped.shapedLines.forEach((shapedLine, idx) => {
    svgParts.push(
      renderShapedTextLineSvg({
        x: headlineBox.x,
        baselineY: headlineBox.y + shapedLine.baseline + idx * headlineWrapped.lineHeight,
        runs: shapedLine.runs,
        color: spec.palette.textColor,
        textAnchor: 'start',
        mode: 'GLYPH_PATHS',
      }),
    );
  });
  currentY += headlineBox.height + activeTokens.spacing.sm;

  // 3.3 Secondary Headline (Optional)
  if (spec.secondaryHeadline && spec.secondaryHeadline.trim().length > 0) {
    const secRole = activeTokens.baseTypographyRoles.SECONDARY_HEADLINE;
    const secWrapped = TextLayoutEngine.wrapText({
      text: spec.secondaryHeadline,
      maxWidth: contentW,
      initialFontSize: secRole.fontSize,
      minFontSize: secRole.minFontSize,
      maxLines: secRole.maxLines,
      lineHeightMultiplier: secRole.lineHeight,
      elementName: 'secondary_headline',
      role: 'SECONDARY_HEADLINE',
      latinWeight: 500,
      khmerWeight: 400,
    });
    const secBox: BoundingBox = {
      x: startX,
      y: currentY,
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
          x: secBox.x,
          baselineY: secBox.y + shapedLine.baseline + idx * secWrapped.lineHeight,
          runs: shapedLine.runs,
          color: spec.palette.accentColor,
          textAnchor: 'start',
          mode: 'GLYPH_PATHS',
        }),
      );
    });
    currentY += secBox.height + activeTokens.spacing.sm;
  }

  // 3.4 Decorative Divider
  const dividerBox: BoundingBox = {
    x: startX,
    y: currentY,
    width: Math.min(220, contentW),
    height: 4,
  };
  elements.push({ id: 'divider', type: 'DIVIDER', boundingBox: dividerBox });
  svgParts.push(
    renderDividerSvg({
      x1: dividerBox.x,
      x2: dividerBox.x + dividerBox.width,
      y: dividerBox.y + 2,
      color: spec.palette.accentColor,
      style: spec.decorativeSelection?.divider === 'DOUBLE_LINE' ? 'DOUBLE_LINE' : 'DIAMOND_DOT',
    }),
  );
  currentY += dividerBox.height + activeTokens.spacing.sm;

  // 3.5 Supporting Text (Optional)
  if (spec.supportingText && spec.supportingText.trim().length > 0) {
    const bodyRole = activeTokens.baseTypographyRoles.BODY;
    const suppWrapped = TextLayoutEngine.wrapText({
      text: spec.supportingText,
      maxWidth: contentW,
      initialFontSize: bodyRole.fontSize,
      minFontSize: bodyRole.minFontSize,
      maxLines: bodyRole.maxLines,
      lineHeightMultiplier: bodyRole.lineHeight,
      elementName: 'supporting_text',
      role: 'BODY',
      latinWeight: 400,
      khmerWeight: 400,
    });
    const suppBox: BoundingBox = {
      x: startX,
      y: currentY,
      width: suppWrapped.actualBoundingBox.width,
      height: suppWrapped.actualBoundingBox.height,
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
          x: suppBox.x,
          baselineY: suppBox.y + shapedLine.baseline + idx * suppWrapped.lineHeight,
          runs: shapedLine.runs,
          color: spec.palette.secondaryTextColor,
          textAnchor: 'start',
          mode: 'GLYPH_PATHS',
        }),
      );
    });
    currentY += suppBox.height + activeTokens.spacing.md;
  }

  // 3.6 Pricing & Specs Block
  const priceText = spec.price;
  const promoText = spec.promotionalPrice;
  const sizeSpecText = [spec.concentration, spec.size].filter(Boolean).join(' · ');

  const priceBox: BoundingBox = {
    x: startX,
    y: currentY,
    width: Math.min(260, contentW),
    height: 44,
  };
  elements.push({
    id: 'pricing_block',
    type: 'TEXT',
    text: `${priceText} ${promoText || ''}`,
    boundingBox: priceBox,
  });

  if (promoText) {
    const promoWrapped = TextLayoutEngine.wrapText({
      text: promoText,
      maxWidth: contentW,
      initialFontSize: 32,
      minFontSize: 24,
      maxLines: 1,
      elementName: 'promo_price',
      role: 'PRICE',
      preferredLatinFont: 'Playfair Display',
      latinWeight: 700,
      khmerWeight: 700,
    });
    const promoLine = promoWrapped.shapedLines[0];
    const promoW = promoWrapped.actualBoundingBox.width;
    if (promoLine) {
      svgParts.push(
        renderShapedTextLineSvg({
          x: priceBox.x,
          baselineY: priceBox.y + promoLine.baseline,
          runs: promoLine.runs,
          color: spec.palette.accentColor,
          textAnchor: 'start',
          mode: 'GLYPH_PATHS',
        }),
      );
    }

    const origX = priceBox.x + promoW + 16;
    const origWrapped = TextLayoutEngine.wrapText({
      text: priceText,
      maxWidth: Math.max(80, contentW - promoW - 16),
      initialFontSize: 20,
      minFontSize: 16,
      maxLines: 1,
      elementName: 'original_price',
      role: 'PRICE',
      preferredLatinFont: 'Montserrat',
      latinWeight: 400,
      khmerWeight: 400,
    });
    const origLine = origWrapped.shapedLines[0];
    if (origLine) {
      const origBaselineY = priceBox.y + (promoLine ? promoLine.baseline : 28);
      svgParts.push(
        renderShapedTextLineSvg({
          x: origX,
          baselineY: origBaselineY,
          runs: origLine.runs,
          color: spec.palette.secondaryTextColor,
          textAnchor: 'start',
          mode: 'GLYPH_PATHS',
        }),
      );
      const origW = origWrapped.actualBoundingBox.width;
      const strikeY = origBaselineY - Math.round(origLine.ascent * 0.35);
      svgParts.push(`
        <line x1="${origX}" y1="${strikeY}" x2="${origX + origW}" y2="${strikeY}" stroke="${spec.palette.secondaryTextColor}" stroke-width="1.5" stroke-linecap="round" />
      `);
    }
  } else {
    const fullPriceText = `${priceText} ${spec.currency || ''}`.trim();
    const fullPriceWrapped = TextLayoutEngine.wrapText({
      text: fullPriceText,
      maxWidth: contentW,
      initialFontSize: 34,
      minFontSize: 24,
      maxLines: 1,
      elementName: 'full_price',
      role: 'PRICE',
      preferredLatinFont: 'Playfair Display',
      latinWeight: 700,
      khmerWeight: 700,
    });
    const fullPriceLine = fullPriceWrapped.shapedLines[0];
    if (fullPriceLine) {
      svgParts.push(
        renderShapedTextLineSvg({
          x: priceBox.x,
          baselineY: priceBox.y + fullPriceLine.baseline,
          runs: fullPriceLine.runs,
          color: spec.palette.textColor,
          textAnchor: 'start',
          mode: 'GLYPH_PATHS',
        }),
      );
    }
  }

  if (sizeSpecText) {
    const sizeWrapped = TextLayoutEngine.wrapText({
      text: sizeSpecText,
      maxWidth: contentW,
      initialFontSize: 13,
      minFontSize: 11,
      maxLines: 1,
      elementName: 'size_spec',
      role: 'BODY',
      preferredLatinFont: 'Montserrat',
      latinWeight: 400,
      khmerWeight: 400,
    });
    const sizeLine = sizeWrapped.shapedLines[0];
    if (sizeLine) {
      svgParts.push(
        renderShapedTextLineSvg({
          x: priceBox.x,
          baselineY: priceBox.y + 44 + sizeLine.baseline,
          runs: sizeLine.runs,
          color: spec.palette.secondaryTextColor,
          textAnchor: 'start',
          mode: 'GLYPH_PATHS',
        }),
      );
    }
    currentY += 68;
  } else {
    currentY += 54;
  }

  // 3.7 Call To Action Button (Mandatory)
  const ctaW = Math.min(200, contentW);
  const ctaH = 48;
  const maxCtaY = height - margins.bottom - ctaH;
  let ctaY = Math.max(currentY + activeTokens.spacing.sm, maxCtaY);

  if (ctaY > maxCtaY) {
    if (currentY > maxCtaY) {
      throw new PosterLayoutOverflowError(
        'cta_button',
        `CTA button overflows available safe area: currentY=${currentY}, maxBottom=${height - margins.bottom}`,
      );
    }
    ctaY = maxCtaY;
  }

  const ctaBox: BoundingBox = {
    x: startX,
    y: ctaY,
    width: ctaW,
    height: ctaH,
  };
  elements.push({ id: 'cta_button', type: 'BUTTON', text: spec.cta, boundingBox: ctaBox });

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

  // 4. Safe Area & Collision Assertion
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
        `Element "${el.id}" breaches safe area boundaries.`,
        { elementBox: el.boundingBox, usableArea },
      );
    }
  }

  // Verify no text elements overlap the product hero zone
  for (const el of elements) {
    if (el.type === 'TEXT' || el.type === 'BUTTON') {
      if (ResponsiveConstraintEngine.checkCollision(el.boundingBox, heroZone, 0)) {
        throw new PosterCollisionError(el.id, 'product_hero_zone', {
          textBox: el.boundingBox,
          heroBox: heroZone,
        });
      }
    }
  }

  // 5. Build Final SVG and Manifest
  const svgOverlay = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <style>${fontFaceCss}</style>
      ${svgParts.join('\n')}
    </svg>
  `;

  const manifest: PosterLayoutManifest = {
    version: '1.0.0',
    templateId: 'EDITORIAL_SPLIT',
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
