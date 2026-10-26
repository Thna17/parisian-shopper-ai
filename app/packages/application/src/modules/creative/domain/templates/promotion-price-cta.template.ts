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
  renderHaussmannFrameSvg,
} from '../services/safe-svg-renderer.js';
import {
  InvalidPosterSpecError,
  PosterLayoutOverflowError,
  PosterCollisionError,
  UnverifiedCommercialFactError,
} from '../creative-errors.js';
import { ResponsiveConstraintEngine } from './responsive-constraint-engine.js';
import { type LayoutBoundingBox } from './responsive-constraint-engine.types.js';

/**
 * Formats a verified price string with explicit atomic currency formatting.
 */
function formatPriceDisplay(value: string, currency: string): string {
  const trimmed = value.trim();
  const curr = (currency || 'USD').trim();

  // If already prefixed with currency symbol or code, return trimmed value
  if (
    trimmed.startsWith('$') ||
    trimmed.startsWith('€') ||
    trimmed.startsWith('£') ||
    trimmed.endsWith('៛') ||
    trimmed.endsWith('KHR') ||
    trimmed.endsWith('USD')
  ) {
    return trimmed;
  }

  if (curr === '$' || curr === 'USD') return `$${trimmed}`;
  if (curr === '€' || curr === 'EUR') return `€${trimmed}`;
  if (curr === '£' || curr === 'GBP') return `£${trimmed}`;
  if (curr === '៛' || curr === 'KHR') return `${trimmed} ៛`;

  return `${trimmed} ${curr}`;
}

/**
 * Production-quality v1.0.0 implementation of PROMOTION_PRICE_CTA canonical template family.
 *
 * Required Hierarchy:
 * 1. Verified product (commercial focal point, uncompromised aspect ratio)
 * 2. Promotion message (headline)
 * 3. Current promotional price
 * 4. Original price, only when verified and applicable (strikethrough)
 * 5. CTA (attention-optimized pill button)
 * 6. Optional campaign label / discount badge
 * 7. Optional supporting copy
 * 8. Logo-safe region
 *
 * Safeguards:
 * - Prices must come only from verified ProductSnapshot facts
 * - Currency must be explicit and correctly formatted (USD, KHR, EUR, GBP)
 * - Never calculate or display an unverified discount percentage
 * - Never create fake urgency, stock claims, countdowns, or savings
 * - Original price must not appear without verified provenance
 * - Price and SKU tokens remain atomic
 * - Promotion must not hide or distort the product
 * - Clean collapse of optional fields
 * - Fail-closed on missing required fields or unsatisfiable geometry
 */
export function renderPromotionPriceCtaTemplate(
  spec: PosterSpec,
  fontFaceCss: string,
  tokens?: TemplateDesignTokens,
  options?: RenderPosterOptions,
): ComputedTemplateLayout {
  // 1. Mandatory Fields Validation
  if (!spec.headline || spec.headline.trim().length === 0) {
    throw new InvalidPosterSpecError('Headline is required for Promotion Price CTA template.');
  }

  // Price validation: current promotional price or primary price is required
  const rawCurrentPrice = spec.promotionalPrice?.trim() || spec.price?.trim();
  if (!rawCurrentPrice || rawCurrentPrice.length === 0) {
    throw new InvalidPosterSpecError('Price is required for Promotion Price CTA template.');
  }

  if (!spec.cta || spec.cta.trim().length === 0) {
    throw new InvalidPosterSpecError(
      'Call to action (CTA) is required for Promotion Price CTA template.',
    );
  }

  // 1.1 Commercial Fact Provenance Safeguards
  const isExplicitProduction = options?.allowNonApprovedForTesting === false;
  const isFixture = spec.commercialProvenance?.isFixture === true;

  if (isExplicitProduction && !isFixture) {
    if (!spec.commercialProvenance) {
      throw new UnverifiedCommercialFactError(
        'Commercial fact provenance is required for PROMOTION_PRICE_CTA in production.',
      );
    }
  }

  if (spec.commercialProvenance && !isFixture) {
    if (spec.commercialProvenance.priceValue !== spec.price) {
      throw new UnverifiedCommercialFactError(
        `Price mismatch between spec ("${spec.price}") and verified provenance ("${spec.commercialProvenance.priceValue}").`,
      );
    }
    if (
      spec.commercialProvenance.currency &&
      spec.commercialProvenance.currency !== spec.currency
    ) {
      throw new UnverifiedCommercialFactError(
        `Currency mismatch between spec ("${spec.currency}") and verified provenance ("${spec.commercialProvenance.currency}").`,
      );
    }
    if (
      spec.promotionalPrice &&
      spec.price &&
      spec.commercialProvenance.originalPriceAuthorized !== true
    ) {
      throw new UnverifiedCommercialFactError(
        'Displaying original strikethrough price is not authorized without explicit verified provenance.',
      );
    }
  }

  // Unverified urgency/countdown/stock claim checks:
  const textToCheck = [
    spec.headline,
    spec.secondaryHeadline,
    spec.campaignLabel,
    spec.supportingText,
  ]
    .filter(Boolean)
    .join(' ');

  const prohibitedUrgencyPatterns = [
    /\b(only\s+\d+\s+left)\b/i,
    /\b(today\s+only)\b/i,
    /\b(ends\s+today)\b/i,
    /\b(hurry)\b/i,
    /\b(limited\s+stock)\b/i,
    /\b(save\s+\d+%)\b/i,
    /\b(\d+%\s+off)\b/i,
    /\b(flash\s+sale)\b/i,
  ];

  for (const pattern of prohibitedUrgencyPatterns) {
    const match = textToCheck.match(pattern);
    if (match) {
      const isAuthorized = spec.commercialProvenance?.campaignLabelAuthorized === true;
      if (!isAuthorized && (isExplicitProduction || !isFixture)) {
        throw new UnverifiedCommercialFactError(
          `Unverified urgency or discount claim detected: "${match[0]}". Prohibited without verified business authorization.`,
        );
      }
    }
  }

  const { width, height, aspectRatio } = spec.outputFormat;
  const activeTokens =
    tokens ?? TemplateRegistry.getInstance().getTemplate('PROMOTION_PRICE_CTA').tokens;
  const formatTokens = activeTokens.formatAdaptations[aspectRatio];
  const margins = formatTokens.safeMargins;

  const elements: LayoutManifestElement[] = [];
  const svgParts: string[] = [];

  // 2. Governed Optional Frame Treatment (Haussmann Luxe or Corner Accents)
  if (spec.decorativeSelection?.frame === 'HAUSSMANN_FRAME') {
    svgParts.push(
      renderHaussmannFrameSvg({
        width,
        height,
        margin: margins.left - 18,
        color: spec.palette.accentColor,
      }),
    );
  } else if (spec.decorativeSelection?.frame === 'CORNER_ACCENTS') {
    svgParts.push(
      renderCornerAccentsSvg({
        width,
        height,
        margin: margins.left - 18,
        color: spec.palette.accentColor,
      }),
    );
  }

  // 3. Top Header Zone: Brand Logo & Campaign Label / Discount Badge
  let topY = margins.top;

  // 3.1 Brand Logo Safe Region (Optional)
  if (spec.logoAssetRef?.brandName && spec.logoAssetRef.brandName.trim().length > 0) {
    const brandName = spec.logoAssetRef.brandName.trim().toUpperCase();
    const logoW = Math.min(180, width - margins.left - margins.right);
    const logoBox: BoundingBox = {
      x: Math.round((width - logoW) / 2),
      y: topY,
      width: logoW,
      height: 22,
    };
    elements.push({ id: 'brand_logo', type: 'LOGO', text: brandName, boundingBox: logoBox });

    const logoWrapped = TextLayoutEngine.wrapText({
      text: brandName,
      maxWidth: logoW,
      initialFontSize: 13,
      minFontSize: 10,
      maxLines: 1,
      elementName: 'brand_logo',
      role: 'LABEL',
      preferredLatinFont: 'Montserrat',
      latinWeight: 600,
      khmerWeight: 700,
    });
    const logoLine = logoWrapped.shapedLines[0];
    if (logoLine) {
      svgParts.push(
        renderShapedTextLineSvg({
          x: width / 2,
          baselineY: logoBox.y + logoLine.baseline,
          runs: logoLine.runs,
          color: spec.palette.secondaryTextColor,
          textAnchor: 'middle',
          mode: 'GLYPH_PATHS',
        }),
      );
    }
    topY += logoBox.height + activeTokens.spacing.xs;
  }

  // 3.2 Campaign Eyebrow / Promotion Badge (Optional)
  if (spec.campaignLabel && spec.campaignLabel.trim().length > 0) {
    const eyebrowToken = activeTokens.baseTypographyRoles.EYEBROW;
    const labelText = spec.campaignLabel.trim();
    const labelW = TextLayoutEngine.measureStringWidth(
      labelText,
      eyebrowToken.fontSize,
      eyebrowToken.letterSpacing,
      'LABEL',
    );

    const badgeW = Math.min(width - margins.left - margins.right, Math.max(120, labelW + 32));
    const badgeH = 32;
    const badgeBox: BoundingBox = {
      x: Math.round((width - badgeW) / 2),
      y: topY,
      width: badgeW,
      height: badgeH,
    };
    elements.push({
      id: 'campaign_label',
      type: 'BADGE',
      text: labelText,
      boundingBox: badgeBox,
    });

    const badgeWrapped = TextLayoutEngine.wrapText({
      text: labelText.toUpperCase(),
      maxWidth: badgeW - 16,
      initialFontSize: eyebrowToken.fontSize,
      minFontSize: eyebrowToken.minFontSize,
      maxLines: 1,
      elementName: 'campaign_label',
      role: 'LABEL',
      preferredLatinFont: 'Montserrat',
      latinWeight: 600,
      khmerWeight: 700,
    });
    const badgeLine = badgeWrapped.shapedLines[0];
    const badgeBaselineY =
      badgeLine !== undefined
        ? badgeBox.y + Math.round((badgeBox.height + badgeLine.ascent - badgeLine.descent) / 2)
        : badgeBox.y + Math.round(badgeBox.height / 2);
    const badgeSvg =
      badgeLine !== undefined
        ? renderShapedTextLineSvg({
            x: width / 2,
            baselineY: badgeBaselineY,
            runs: badgeLine.runs,
            color: spec.palette.accentColor,
            textAnchor: 'middle',
            mode: 'GLYPH_PATHS',
          })
        : '';

    svgParts.push(`
      <g>
        <rect x="${badgeBox.x}" y="${badgeBox.y}" width="${badgeBox.width}" height="${badgeBox.height}" rx="16" fill="${spec.palette.badgeBackground || 'rgba(226,179,87,0.22)'}" stroke="${spec.palette.accentColor}" stroke-width="1.2" />
        ${badgeSvg}
      </g>
    `);
    topY += badgeBox.height + activeTokens.spacing.sm;
  }

  // 4. Bottom Commercial Conversion Block (Calculated Bottom-Up for Collision Prevention)
  const maxContentW = width - margins.left - margins.right;

  // 4.1 CTA Button (Mandatory)
  const ctaW = Math.min(260, maxContentW - 40);
  const ctaH = 50;
  const ctaY = height - margins.bottom - ctaH;
  const ctaBox: BoundingBox = {
    x: Math.round((width - ctaW) / 2),
    y: ctaY,
    width: ctaW,
    height: ctaH,
  };
  elements.push({ id: 'cta_button', type: 'BUTTON', text: spec.cta, boundingBox: ctaBox });

  const ctaWrapped = TextLayoutEngine.wrapText({
    text: spec.cta,
    maxWidth: ctaW - 20,
    initialFontSize: 16,
    minFontSize: 12,
    maxLines: 1,
    elementName: 'cta_button',
    role: 'CTA',
    preferredLatinFont: 'Montserrat',
    latinWeight: 700,
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
          color: activeTokens.colorRoles.ctaText || '#0E0F12',
          textAnchor: 'middle',
          mode: 'GLYPH_PATHS',
        })
      : '';

  svgParts.push(`
    <g>
      <rect x="${ctaBox.x}" y="${ctaBox.y}" width="${ctaBox.width}" height="${ctaBox.height}" rx="25" fill="${spec.palette.accentColor}" />
      ${ctaContentSvg}
    </g>
  `);

  // 4.2 Verified Dual-Pricing Lockup
  // Current promotional price is highlighted; original verified price is strikethrough if present
  const currentFormatted = formatPriceDisplay(rawCurrentPrice, spec.currency);
  const hasOriginalPrice =
    spec.promotionalPrice &&
    spec.price &&
    spec.price.trim().length > 0 &&
    spec.price.trim() !== spec.promotionalPrice.trim();

  const originalFormatted = hasOriginalPrice
    ? formatPriceDisplay(spec.price, spec.currency)
    : undefined;

  const promoFontSize = 36;
  const origFontSize = 22;
  const promoW = TextLayoutEngine.measureStringWidth(currentFormatted, promoFontSize, 0, 'PRICE');
  const origW = originalFormatted
    ? TextLayoutEngine.measureStringWidth(originalFormatted, origFontSize, 0, 'PRICE')
    : 0;

  const priceSpacing = 16;
  const totalPricingW = Math.min(
    maxContentW,
    hasOriginalPrice ? promoW + origW + priceSpacing : promoW,
  );
  const priceH = 44;
  const priceY = ctaBox.y - activeTokens.spacing.sm - priceH;

  const priceBox: BoundingBox = {
    x: Math.round((width - totalPricingW) / 2),
    y: priceY,
    width: totalPricingW,
    height: priceH,
  };
  elements.push({
    id: 'pricing_block',
    type: 'BADGE',
    text: hasOriginalPrice ? `${currentFormatted} was ${originalFormatted}` : currentFormatted,
    boundingBox: priceBox,
  });

  if (hasOriginalPrice && originalFormatted) {
    const promoWrapped = TextLayoutEngine.wrapText({
      text: currentFormatted,
      maxWidth: maxContentW,
      initialFontSize: promoFontSize,
      minFontSize: 24,
      maxLines: 1,
      elementName: 'promotional_price',
      role: 'PRICE',
      preferredLatinFont: 'Playfair Display',
      latinWeight: 700,
      khmerWeight: 700,
    });
    const promoLine = promoWrapped.shapedLines[0];
    const actualPromoW = promoWrapped.actualBoundingBox.width;

    const origWrapped = TextLayoutEngine.wrapText({
      text: originalFormatted,
      maxWidth: maxContentW,
      initialFontSize: origFontSize,
      minFontSize: 16,
      maxLines: 1,
      elementName: 'original_price',
      role: 'PRICE',
      preferredLatinFont: 'Montserrat',
      latinWeight: 500,
      khmerWeight: 400,
    });
    const origLine = origWrapped.shapedLines[0];
    const actualOrigW = origWrapped.actualBoundingBox.width;

    const lockupW = actualPromoW + priceSpacing + actualOrigW;
    const startPricingX = Math.round((width - lockupW) / 2);
    const promoX = startPricingX;
    const origX = startPricingX + actualPromoW + priceSpacing;

    const promoSvg = promoLine
      ? renderShapedTextLineSvg({
          x: promoX,
          baselineY: priceBox.y + promoLine.baseline,
          runs: promoLine.runs,
          color: spec.palette.accentColor,
          textAnchor: 'start',
          mode: 'GLYPH_PATHS',
        })
      : '';

    const origBaselineY = priceBox.y + (promoLine ? promoLine.baseline : 30);
    const origSvg = origLine
      ? renderShapedTextLineSvg({
          x: origX,
          baselineY: origBaselineY,
          runs: origLine.runs,
          color: spec.palette.secondaryTextColor,
          textAnchor: 'start',
          mode: 'GLYPH_PATHS',
        })
      : '';

    const strikeY = origLine ? origBaselineY - Math.round(origLine.ascent * 0.35) : priceBox.y + 20;

    svgParts.push(`
      <g>
        ${promoSvg}
        ${origSvg}
        <line x1="${origX}" y1="${strikeY}" x2="${origX + actualOrigW}" y2="${strikeY}" stroke="${spec.palette.secondaryTextColor}" stroke-width="1.5" stroke-linecap="round" />
      </g>
    `);
  } else {
    const fullPriceWrapped = TextLayoutEngine.wrapText({
      text: currentFormatted,
      maxWidth: maxContentW,
      initialFontSize: promoFontSize,
      minFontSize: 24,
      maxLines: 1,
      elementName: 'promotional_price',
      role: 'PRICE',
      preferredLatinFont: 'Playfair Display',
      latinWeight: 700,
      khmerWeight: 700,
    });
    const fullPriceLine = fullPriceWrapped.shapedLines[0];
    const fullPriceSvg = fullPriceLine
      ? renderShapedTextLineSvg({
          x: width / 2,
          baselineY: priceBox.y + fullPriceLine.baseline,
          runs: fullPriceLine.runs,
          color: spec.palette.textColor,
          textAnchor: 'middle',
          mode: 'GLYPH_PATHS',
        })
      : '';
    svgParts.push(fullPriceSvg);
  }

  let reflowCurrentY = priceBox.y;

  // 4.3 Supporting Text (Optional Offer Details / Delivery Notes)
  if (spec.supportingText && spec.supportingText.trim().length > 0) {
    const bodyRole = activeTokens.baseTypographyRoles.BODY;
    const suppWrapped = TextLayoutEngine.wrapText({
      text: spec.supportingText,
      maxWidth: maxContentW - 60,
      initialFontSize: Math.min(15, bodyRole.fontSize),
      minFontSize: 11,
      maxLines: 2,
      lineHeightMultiplier: 1.3,
      elementName: 'supporting_text',
      role: 'BODY',
      latinWeight: 400,
      khmerWeight: 400,
    });

    const suppBox: BoundingBox = {
      x: Math.round((width - suppWrapped.actualBoundingBox.width) / 2),
      y: reflowCurrentY - activeTokens.spacing.xs - suppWrapped.actualBoundingBox.height,
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
          x: width / 2,
          baselineY: suppBox.y + shapedLine.baseline + idx * suppWrapped.lineHeight,
          runs: shapedLine.runs,
          color: spec.palette.secondaryTextColor,
          textAnchor: 'middle',
          mode: 'GLYPH_PATHS',
        }),
      );
    });
    reflowCurrentY = suppBox.y;
  }

  // 4.4 Secondary Headline (Optional Terms / Batch Note)
  if (spec.secondaryHeadline && spec.secondaryHeadline.trim().length > 0) {
    const secRole = activeTokens.baseTypographyRoles.SECONDARY_HEADLINE;
    const secWrapped = TextLayoutEngine.wrapText({
      text: spec.secondaryHeadline,
      maxWidth: maxContentW - 40,
      initialFontSize: Math.min(20, secRole.fontSize),
      minFontSize: 13,
      maxLines: 1,
      lineHeightMultiplier: secRole.lineHeight,
      elementName: 'secondary_headline',
      role: 'SECONDARY_HEADLINE',
      latinWeight: 500,
      khmerWeight: 400,
    });

    const secBox: BoundingBox = {
      x: Math.round((width - secWrapped.actualBoundingBox.width) / 2),
      y: reflowCurrentY - activeTokens.spacing.xs - secWrapped.actualBoundingBox.height,
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
    reflowCurrentY = secBox.y;
  }

  // 4.5 Promotion Headline (Mandatory Offer Title)
  const headlineRole = activeTokens.baseTypographyRoles.HEADLINE;
  const headlineWrapped: WrappedTextResult = TextLayoutEngine.wrapText({
    text: spec.headline,
    maxWidth: maxContentW - 40,
    initialFontSize: Math.min(38, headlineRole.fontSize),
    minFontSize: headlineRole.minFontSize,
    maxLines: 2,
    lineHeightMultiplier: headlineRole.lineHeight,
    tracking: headlineRole.letterSpacing,
    elementName: 'headline',
    role: 'HEADLINE',
    latinWeight: 700,
    khmerWeight: 700,
  });

  const headlineBox: BoundingBox = {
    x: Math.round((width - headlineWrapped.actualBoundingBox.width) / 2),
    y: reflowCurrentY - activeTokens.spacing.sm - headlineWrapped.actualBoundingBox.height,
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

  const footerTopY = headlineBox.y;

  // 5. Center Product Hero Zone on Pedestal Baseline
  // Dynamically calculate pedestal baseline guaranteed to prevent overlap with footer block
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
    y: topY + activeTokens.spacing.xs,
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

  // Verify non-collision between text elements and Product Hero Zone
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

  // 7. Assemble Final SVG Overlay & Layout Manifest
  const svgOverlay = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <style>${fontFaceCss}</style>
      ${svgParts.join('\n')}
    </svg>
  `;

  const manifest: PosterLayoutManifest = {
    version: '1.0.0',
    templateId: 'PROMOTION_PRICE_CTA',
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
