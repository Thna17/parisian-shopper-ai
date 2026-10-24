import { type PosterSpec } from './poster-spec.js';
import {
  type SafeMargins,
  calculateSafeMargins,
  SPACING,
  POSTER_DESIGN_TOKENS,
  TYPOGRAPHY_SCALE,
} from './poster-tokens.js';
import {
  type BoundingBox,
  TextLayoutEngine,
  type WrappedTextResult,
} from './services/text-layout-engine.js';
import {
  escapeXml,
  renderLotusOrnamentSvg,
  renderDividerSvg,
  renderCornerAccentsSvg,
} from './services/safe-svg-renderer.js';

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

export class PosterTemplateRenderer {
  public static renderTemplate(spec: PosterSpec, fontFaceCss: string): ComputedTemplateLayout {
    switch (spec.templateId) {
      case 'EDITORIAL_SPLIT':
        return this.renderEditorialSplit(spec, fontFaceCss);
      case 'CENTERED_HERO':
        return this.renderCenteredHero(spec, fontFaceCss);
      case 'SCENT_STORY':
        return this.renderScentStory(spec, fontFaceCss);
      case 'KHMER_SEASONAL':
        return this.renderKhmerSeasonal(spec, fontFaceCss);
      default:
        return this.renderEditorialSplit(spec, fontFaceCss);
    }
  }

  // 1. EDITORIAL SPLIT TEMPLATE
  private static renderEditorialSplit(
    spec: PosterSpec,
    fontFaceCss: string,
  ): ComputedTemplateLayout {
    const { width, height } = spec.outputFormat;
    const margins = calculateSafeMargins(width, height);
    const elements: LayoutManifestElement[] = [];

    // Left Zone: Product Hero
    const heroWidth = Math.round(width * 0.44);
    const heroX = margins.left;
    const heroY = margins.top;
    const heroHeight = height - margins.top - margins.bottom;
    const pedestalYPercent = 0.74;

    const productHeroZone = {
      placement: 'LEFT' as const,
      pedestalYPercent,
      maxHeroWidth: heroWidth,
      maxHeroHeight: heroHeight,
      boundingBox: { x: heroX, y: heroY, width: heroWidth, height: heroHeight },
    };
    elements.push({
      id: 'product_hero_zone',
      type: 'PRODUCT',
      boundingBox: productHeroZone.boundingBox,
    });

    // Right Zone: Editorial Panel
    const panelX = Math.round(width * 0.5);
    const panelW = width - panelX - margins.right;
    const panelY = margins.top;
    const panelH = height - margins.top - margins.bottom;

    elements.push({
      id: 'editorial_panel',
      type: 'PANEL',
      boundingBox: { x: panelX, y: panelY, width: panelW, height: panelH },
    });

    // Internal text layouts within panel
    const textPadding = SPACING.md;
    const textContentW = panelW - textPadding * 2;
    let currentY = panelY + textPadding;

    const svgParts: string[] = [];

    // Background Gradient / Contrast Panel
    svgParts.push(`
      <defs>
        <linearGradient id="splitPanelGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#0E0F12" stop-opacity="0.0" />
          <stop offset="35%" stop-color="#0E0F12" stop-opacity="0.65" />
          <stop offset="100%" stop-color="#0E0F12" stop-opacity="0.88" />
        </linearGradient>
      </defs>
      <rect x="${panelX - 40}" y="0" width="${width - panelX + 40}" height="${height}" fill="url(#splitPanelGrad)" />
    `);

    // Campaign Label
    if (spec.campaignLabel) {
      const labelW = TextLayoutEngine.measureStringWidth(
        spec.campaignLabel,
        TYPOGRAPHY_SCALE.label.fontSize,
        TYPOGRAPHY_SCALE.label.letterSpacing,
      );
      const labelBox: BoundingBox = {
        x: panelX + textPadding,
        y: currentY,
        width: Math.min(textContentW, labelW),
        height: 24,
      };
      elements.push({
        id: 'campaign_label',
        type: 'TEXT',
        text: spec.campaignLabel,
        boundingBox: labelBox,
      });

      svgParts.push(`
        <text x="${labelBox.x}" y="${labelBox.y + 16}" font-family="${POSTER_DESIGN_TOKENS.fontFamilies.latinBody}" font-size="${TYPOGRAPHY_SCALE.label.fontSize}" font-weight="${TYPOGRAPHY_SCALE.label.fontWeight}" letter-spacing="${TYPOGRAPHY_SCALE.label.letterSpacing}px" fill="${spec.palette.accentColor}">
          ${escapeXml(spec.campaignLabel.toUpperCase())}
        </text>
      `);
      currentY += 34;
    }

    // Headline
    const headlineWrapped: WrappedTextResult = TextLayoutEngine.wrapText({
      text: spec.headline,
      maxWidth: textContentW,
      initialFontSize: TYPOGRAPHY_SCALE.displayMedium.fontSize,
      minFontSize: 28,
      maxLines: 3,
      elementName: 'headline',
    });

    const headlineBox: BoundingBox = {
      x: panelX + textPadding,
      y: currentY,
      width: headlineWrapped.totalWidth,
      height: headlineWrapped.totalHeight,
    };
    elements.push({ id: 'headline', type: 'TEXT', text: spec.headline, boundingBox: headlineBox });

    const headlineFont = TextLayoutEngine.isKhmerText(spec.headline)
      ? POSTER_DESIGN_TOKENS.fontFamilies.khmer
      : POSTER_DESIGN_TOKENS.fontFamilies.latinDisplay;

    headlineWrapped.lines.forEach((line, idx) => {
      svgParts.push(`
        <text x="${headlineBox.x}" y="${currentY + (idx + 1) * headlineWrapped.lineHeight - 6}" font-family="${headlineFont}" font-size="${headlineWrapped.fontSize}" font-weight="700" fill="${spec.palette.textColor}">
          ${escapeXml(line)}
        </text>
      `);
    });
    currentY += headlineWrapped.totalHeight + SPACING.sm;

    // Secondary Headline (Khmer or brand)
    if (spec.secondaryHeadline) {
      const secWrapped = TextLayoutEngine.wrapText({
        text: spec.secondaryHeadline,
        maxWidth: textContentW,
        initialFontSize: 22,
        minFontSize: 16,
        maxLines: 2,
        elementName: 'secondary_headline',
      });
      const secBox: BoundingBox = {
        x: panelX + textPadding,
        y: currentY,
        width: secWrapped.totalWidth,
        height: secWrapped.totalHeight,
      };
      elements.push({
        id: 'secondary_headline',
        type: 'TEXT',
        text: spec.secondaryHeadline,
        boundingBox: secBox,
      });

      const secFont = TextLayoutEngine.isKhmerText(spec.secondaryHeadline)
        ? POSTER_DESIGN_TOKENS.fontFamilies.khmer
        : POSTER_DESIGN_TOKENS.fontFamilies.latinDisplay;

      secWrapped.lines.forEach((line, idx) => {
        svgParts.push(`
          <text x="${secBox.x}" y="${currentY + (idx + 1) * secWrapped.lineHeight - 4}" font-family="${secFont}" font-size="${secWrapped.fontSize}" font-weight="500" fill="${spec.palette.accentColor}">
            ${escapeXml(line)}
          </text>
        `);
      });
      currentY += secWrapped.totalHeight + SPACING.md;
    }

    // Divider
    const dividerBox: BoundingBox = {
      x: panelX + textPadding,
      y: currentY,
      width: Math.min(220, textContentW),
      height: 6,
    };
    elements.push({ id: 'divider', type: 'DIVIDER', boundingBox: dividerBox });
    svgParts.push(
      renderDividerSvg({
        x1: dividerBox.x,
        x2: dividerBox.x + dividerBox.width,
        y: dividerBox.y + 3,
        color: spec.palette.accentColor,
        style: spec.decorativeSelection?.divider === 'DOUBLE_LINE' ? 'DOUBLE_LINE' : 'DIAMOND_DOT',
      }),
    );
    currentY += SPACING.md;

    // Supporting Text
    if (spec.supportingText) {
      const suppWrapped = TextLayoutEngine.wrapText({
        text: spec.supportingText,
        maxWidth: textContentW,
        initialFontSize: TYPOGRAPHY_SCALE.body.fontSize,
        minFontSize: 15,
        maxLines: 3,
        elementName: 'supporting_text',
      });
      const suppBox: BoundingBox = {
        x: panelX + textPadding,
        y: currentY,
        width: suppWrapped.totalWidth,
        height: suppWrapped.totalHeight,
      };
      elements.push({
        id: 'supporting_text',
        type: 'TEXT',
        text: spec.supportingText,
        boundingBox: suppBox,
      });

      const suppFont = TextLayoutEngine.isKhmerText(spec.supportingText)
        ? POSTER_DESIGN_TOKENS.fontFamilies.khmer
        : POSTER_DESIGN_TOKENS.fontFamilies.latinBody;

      suppWrapped.lines.forEach((line, idx) => {
        svgParts.push(`
          <text x="${suppBox.x}" y="${currentY + (idx + 1) * suppWrapped.lineHeight - 3}" font-family="${suppFont}" font-size="${suppWrapped.fontSize}" font-weight="400" fill="${spec.palette.secondaryTextColor}">
            ${escapeXml(line)}
          </text>
        `);
      });
      currentY += suppWrapped.totalHeight + SPACING.lg;
    }

    // Price Block & Size
    const priceText = spec.price;
    const promoText = spec.promotionalPrice;
    const sizeSpecText = [spec.concentration, spec.size].filter(Boolean).join(' · ');

    const priceBox: BoundingBox = {
      x: panelX + textPadding,
      y: currentY,
      width: 260,
      height: 48,
    };
    elements.push({
      id: 'pricing_block',
      type: 'TEXT',
      text: `${priceText} ${promoText || ''}`,
      boundingBox: priceBox,
    });

    if (promoText) {
      svgParts.push(`
        <text x="${priceBox.x}" y="${priceBox.y + 32}" font-family="${POSTER_DESIGN_TOKENS.fontFamilies.latinDisplay}" font-size="34" font-weight="700" fill="${spec.palette.accentColor}">
          ${escapeXml(promoText)}
        </text>
        <text x="${priceBox.x + 105}" y="${priceBox.y + 30}" font-family="${POSTER_DESIGN_TOKENS.fontFamilies.latinBody}" font-size="22" font-weight="400" fill="${spec.palette.secondaryTextColor}" text-decoration="line-through">
          ${escapeXml(priceText)}
        </text>
      `);
    } else {
      svgParts.push(`
        <text x="${priceBox.x}" y="${priceBox.y + 32}" font-family="${POSTER_DESIGN_TOKENS.fontFamilies.latinDisplay}" font-size="36" font-weight="700" fill="${spec.palette.textColor}">
          ${escapeXml(priceText)}
        </text>
        <text x="${priceBox.x + 95}" y="${priceBox.y + 30}" font-family="${POSTER_DESIGN_TOKENS.fontFamilies.latinBody}" font-size="16" font-weight="500" fill="${spec.palette.secondaryTextColor}">
          ${escapeXml(spec.currency)}
        </text>
      `);
    }

    if (sizeSpecText) {
      svgParts.push(`
        <text x="${priceBox.x}" y="${priceBox.y + 58}" font-family="${POSTER_DESIGN_TOKENS.fontFamilies.latinBody}" font-size="14" font-weight="400" fill="${spec.palette.secondaryTextColor}">
          ${escapeXml(sizeSpecText)}
        </text>
      `);
      currentY += 76;
    } else {
      currentY += 60;
    }

    // CTA Button
    const ctaW = 190;
    const ctaH = POSTER_DESIGN_TOKENS.ctaHeight;
    const ctaBox: BoundingBox = {
      x: panelX + textPadding,
      y: Math.max(currentY + SPACING.sm, height - margins.bottom - ctaH),
      width: ctaW,
      height: ctaH,
    };
    elements.push({ id: 'cta_button', type: 'BUTTON', text: spec.cta, boundingBox: ctaBox });

    const ctaFont = TextLayoutEngine.isKhmerText(spec.cta)
      ? POSTER_DESIGN_TOKENS.fontFamilies.khmer
      : POSTER_DESIGN_TOKENS.fontFamilies.latinBody;

    svgParts.push(`
      <g>
        <rect x="${ctaBox.x}" y="${ctaBox.y}" width="${ctaBox.width}" height="${ctaBox.height}" rx="${POSTER_DESIGN_TOKENS.ctaBorderRadius}" fill="${spec.palette.accentColor}" />
        <text x="${ctaBox.x + ctaBox.width / 2}" y="${ctaBox.y + 30}" font-family="${ctaFont}" font-size="15" font-weight="600" fill="#0E0F12" text-anchor="middle">
          ${escapeXml(spec.cta)}
        </text>
      </g>
    `);

    const svgOverlay = `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <style>${fontFaceCss}</style>
        ${svgParts.join('\n')}
      </svg>
    `;

    return {
      svgOverlay,
      productHeroZone,
      manifest: {
        version: 'poster-layout-v1',
        templateId: 'EDITORIAL_SPLIT',
        dimensions: { width, height },
        safeMargins: margins,
        elements,
      },
    };
  }

  // 2. CENTERED HERO TEMPLATE
  private static renderCenteredHero(spec: PosterSpec, fontFaceCss: string): ComputedTemplateLayout {
    const { width, height } = spec.outputFormat;
    const margins = calculateSafeMargins(width, height);
    const elements: LayoutManifestElement[] = [];
    const svgParts: string[] = [];

    // Background Gradients: Top and Bottom Vignette for text contrast
    svgParts.push(`
      <defs>
        <linearGradient id="topFadeGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0E0F12" stop-opacity="0.72" />
          <stop offset="60%" stop-color="#0E0F12" stop-opacity="0.30" />
          <stop offset="100%" stop-color="#0E0F12" stop-opacity="0.0" />
        </linearGradient>
        <linearGradient id="bottomFadeGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0E0F12" stop-opacity="0.0" />
          <stop offset="55%" stop-color="#0E0F12" stop-opacity="0.25" />
          <stop offset="85%" stop-color="#0E0F12" stop-opacity="0.82" />
          <stop offset="100%" stop-color="#0E0F12" stop-opacity="0.94" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${width}" height="${Math.round(height * 0.32)}" fill="url(#topFadeGrad)" />
      <rect x="0" y="${Math.round(height * 0.45)}" width="${width}" height="${Math.round(height * 0.55)}" fill="url(#bottomFadeGrad)" />
    `);

    // Top Header: Centered Campaign Eyebrow & Headline
    let topY = margins.top;

    if (spec.campaignLabel) {
      const labelW = TextLayoutEngine.measureStringWidth(
        spec.campaignLabel,
        TYPOGRAPHY_SCALE.label.fontSize,
        TYPOGRAPHY_SCALE.label.letterSpacing,
      );
      const labelBox: BoundingBox = {
        x: Math.round((width - labelW) / 2),
        y: topY,
        width: labelW,
        height: 24,
      };
      elements.push({
        id: 'campaign_label',
        type: 'TEXT',
        text: spec.campaignLabel,
        boundingBox: labelBox,
      });

      svgParts.push(`
        <text x="${width / 2}" y="${topY + 16}" font-family="${POSTER_DESIGN_TOKENS.fontFamilies.latinBody}" font-size="${TYPOGRAPHY_SCALE.label.fontSize}" font-weight="${TYPOGRAPHY_SCALE.label.fontWeight}" letter-spacing="${TYPOGRAPHY_SCALE.label.letterSpacing}px" fill="${spec.palette.accentColor}" text-anchor="middle">
          ${escapeXml(spec.campaignLabel.toUpperCase())}
        </text>
      `);
      topY += 34;
    }

    // Centered Headline
    const headlineMaxW = width - margins.left - margins.right;
    const headlineWrapped = TextLayoutEngine.wrapText({
      text: spec.headline,
      maxWidth: headlineMaxW,
      initialFontSize: TYPOGRAPHY_SCALE.displayLarge.fontSize,
      minFontSize: 32,
      maxLines: 2,
      elementName: 'headline',
    });

    const headlineBox: BoundingBox = {
      x: Math.round((width - headlineWrapped.totalWidth) / 2),
      y: topY,
      width: headlineWrapped.totalWidth,
      height: headlineWrapped.totalHeight,
    };
    elements.push({ id: 'headline', type: 'TEXT', text: spec.headline, boundingBox: headlineBox });

    const headlineFont = TextLayoutEngine.isKhmerText(spec.headline)
      ? POSTER_DESIGN_TOKENS.fontFamilies.khmer
      : POSTER_DESIGN_TOKENS.fontFamilies.latinDisplay;

    headlineWrapped.lines.forEach((line, idx) => {
      svgParts.push(`
        <text x="${width / 2}" y="${topY + (idx + 1) * headlineWrapped.lineHeight - 6}" font-family="${headlineFont}" font-size="${headlineWrapped.fontSize}" font-weight="700" fill="${spec.palette.textColor}" text-anchor="middle">
          ${escapeXml(line)}
        </text>
      `);
    });
    topY += headlineWrapped.totalHeight + SPACING.sm;

    // Optional Secondary Headline
    if (spec.secondaryHeadline) {
      const secWrapped = TextLayoutEngine.wrapText({
        text: spec.secondaryHeadline,
        maxWidth: headlineMaxW,
        initialFontSize: 20,
        minFontSize: 16,
        maxLines: 1,
        elementName: 'secondary_headline',
      });
      const secBox: BoundingBox = {
        x: Math.round((width - secWrapped.totalWidth) / 2),
        y: topY,
        width: secWrapped.totalWidth,
        height: secWrapped.totalHeight,
      };
      elements.push({
        id: 'secondary_headline',
        type: 'TEXT',
        text: spec.secondaryHeadline,
        boundingBox: secBox,
      });

      const secFont = TextLayoutEngine.isKhmerText(spec.secondaryHeadline)
        ? POSTER_DESIGN_TOKENS.fontFamilies.khmer
        : POSTER_DESIGN_TOKENS.fontFamilies.latinDisplay;

      svgParts.push(`
        <text x="${width / 2}" y="${topY + 18}" font-family="${secFont}" font-size="${secWrapped.fontSize}" font-weight="500" fill="${spec.palette.accentColor}" text-anchor="middle">
          ${escapeXml(spec.secondaryHeadline)}
        </text>
      `);
      topY += 32;
    }

    // Center Product Zone
    const pedestalYPercent = 0.74;
    const heroW = Math.round(width * 0.48);
    const heroH = Math.round(height * 0.52);
    const heroX = Math.round((width - heroW) / 2);
    const heroY = topY + SPACING.sm;

    const productHeroZone = {
      placement: 'CENTER' as const,
      pedestalYPercent,
      maxHeroWidth: heroW,
      maxHeroHeight: heroH,
      boundingBox: { x: heroX, y: heroY, width: heroW, height: heroH },
    };
    elements.push({
      id: 'product_hero_zone',
      type: 'PRODUCT',
      boundingBox: productHeroZone.boundingBox,
    });

    // Bottom Zone: Supporting Copy, Price Pill & CTA
    let bottomY = Math.round(height * pedestalYPercent) + SPACING.sm;

    if (spec.supportingText) {
      const suppWrapped = TextLayoutEngine.wrapText({
        text: spec.supportingText,
        maxWidth: width - margins.left - margins.right - 80,
        initialFontSize: 17,
        minFontSize: 14,
        maxLines: 2,
        elementName: 'supporting_text',
      });
      const suppBox: BoundingBox = {
        x: Math.round((width - suppWrapped.totalWidth) / 2),
        y: bottomY,
        width: suppWrapped.totalWidth,
        height: suppWrapped.totalHeight,
      };
      elements.push({
        id: 'supporting_text',
        type: 'TEXT',
        text: spec.supportingText,
        boundingBox: suppBox,
      });

      const suppFont = TextLayoutEngine.isKhmerText(spec.supportingText)
        ? POSTER_DESIGN_TOKENS.fontFamilies.khmer
        : POSTER_DESIGN_TOKENS.fontFamilies.latinBody;

      suppWrapped.lines.forEach((line, idx) => {
        svgParts.push(`
          <text x="${width / 2}" y="${bottomY + (idx + 1) * suppWrapped.lineHeight - 2}" font-family="${suppFont}" font-size="${suppWrapped.fontSize}" font-weight="400" fill="${spec.palette.secondaryTextColor}" text-anchor="middle">
            ${escapeXml(line)}
          </text>
        `);
      });
      bottomY += suppWrapped.totalHeight + SPACING.md;
    }

    // Price Pill and CTA
    const pricePillText = `${spec.price} ${spec.currency}${spec.size ? ` · ${spec.size}` : ''}`;
    const pillW = TextLayoutEngine.measureStringWidth(pricePillText, 16, 0) + 36;
    const pillBox: BoundingBox = {
      x: Math.round((width - pillW) / 2),
      y: bottomY,
      width: pillW,
      height: 36,
    };
    elements.push({ id: 'price_pill', type: 'BADGE', text: pricePillText, boundingBox: pillBox });

    svgParts.push(`
      <g>
        <rect x="${pillBox.x}" y="${pillBox.y}" width="${pillBox.width}" height="${pillBox.height}" rx="18" fill="${spec.palette.badgeBackground || 'rgba(229,192,123,0.16)'}" stroke="${spec.palette.accentColor}" stroke-width="1" />
        <text x="${width / 2}" y="${pillBox.y + 24}" font-family="${POSTER_DESIGN_TOKENS.fontFamilies.latinBody}" font-size="16" font-weight="600" fill="${spec.palette.accentColor}" text-anchor="middle">
          ${escapeXml(pricePillText)}
        </text>
      </g>
    `);
    bottomY += 48;

    // CTA Button
    const ctaW = 180;
    const ctaH = 44;
    const ctaBox: BoundingBox = {
      x: Math.round((width - ctaW) / 2),
      y: Math.min(bottomY, height - margins.bottom - ctaH),
      width: ctaW,
      height: ctaH,
    };
    elements.push({ id: 'cta_button', type: 'BUTTON', text: spec.cta, boundingBox: ctaBox });

    const ctaFont = TextLayoutEngine.isKhmerText(spec.cta)
      ? POSTER_DESIGN_TOKENS.fontFamilies.khmer
      : POSTER_DESIGN_TOKENS.fontFamilies.latinBody;

    svgParts.push(`
      <g>
        <rect x="${ctaBox.x}" y="${ctaBox.y}" width="${ctaBox.width}" height="${ctaBox.height}" rx="22" fill="${spec.palette.textColor}" />
        <text x="${width / 2}" y="${ctaBox.y + 28}" font-family="${ctaFont}" font-size="15" font-weight="600" fill="#0E0F12" text-anchor="middle">
          ${escapeXml(spec.cta)}
        </text>
      </g>
    `);

    const svgOverlay = `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <style>${fontFaceCss}</style>
        ${svgParts.join('\n')}
      </svg>
    `;

    return {
      svgOverlay,
      productHeroZone,
      manifest: {
        version: 'poster-layout-v1',
        templateId: 'CENTERED_HERO',
        dimensions: { width, height },
        safeMargins: margins,
        elements,
      },
    };
  }

  // 3. SCENT STORY TEMPLATE
  private static renderScentStory(spec: PosterSpec, fontFaceCss: string): ComputedTemplateLayout {
    const { width, height } = spec.outputFormat;
    const margins = calculateSafeMargins(width, height);
    const elements: LayoutManifestElement[] = [];
    const svgParts: string[] = [];
    // Background Contrast Gradient on Left Side
    svgParts.push(`
      <defs>
        <linearGradient id="scentStoryLeftGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#0E0F12" stop-opacity="0.85" />
          <stop offset="42%" stop-color="#0E0F12" stop-opacity="0.65" />
          <stop offset="68%" stop-color="#0E0F12" stop-opacity="0.20" />
          <stop offset="100%" stop-color="#0E0F12" stop-opacity="0.0" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${Math.round(width * 0.65)}" height="${height}" fill="url(#scentStoryLeftGrad)" />
    `);

    // Header Zone
    let topY = margins.top;
    if (spec.campaignLabel) {
      svgParts.push(`
        <text x="${margins.left}" y="${topY + 16}" font-family="${POSTER_DESIGN_TOKENS.fontFamilies.latinBody}" font-size="${TYPOGRAPHY_SCALE.label.fontSize}" font-weight="${TYPOGRAPHY_SCALE.label.fontWeight}" letter-spacing="${TYPOGRAPHY_SCALE.label.letterSpacing}px" fill="${spec.palette.accentColor}">
          ${escapeXml(spec.campaignLabel.toUpperCase())}
        </text>
      `);
      topY += 32;
    }

    const headlineWrapped = TextLayoutEngine.wrapText({
      text: spec.headline,
      maxWidth: Math.round(width * 0.48),
      initialFontSize: 36,
      minFontSize: 26,
      maxLines: 2,
      elementName: 'headline',
    });
    const headlineBox: BoundingBox = {
      x: margins.left,
      y: topY,
      width: headlineWrapped.totalWidth,
      height: headlineWrapped.totalHeight,
    };
    elements.push({ id: 'headline', type: 'TEXT', text: spec.headline, boundingBox: headlineBox });

    headlineWrapped.lines.forEach((line, idx) => {
      svgParts.push(`
        <text x="${margins.left}" y="${topY + (idx + 1) * headlineWrapped.lineHeight - 6}" font-family="${POSTER_DESIGN_TOKENS.fontFamilies.latinDisplay}" font-size="${headlineWrapped.fontSize}" font-weight="700" fill="${spec.palette.textColor}">
          ${escapeXml(line)}
        </text>
      `);
    });

    // Product zone placed on right-center
    const pedestalYPercent = 0.74;
    const heroW = Math.round(width * 0.46);
    const heroH = Math.round(height * 0.58);
    const heroX = Math.round(width * 0.5);
    const heroY = margins.top + 40;

    const productHeroZone = {
      placement: 'RIGHT' as const,
      pedestalYPercent,
      maxHeroWidth: heroW,
      maxHeroHeight: heroH,
      boundingBox: { x: heroX, y: heroY, width: heroW, height: heroH },
    };
    elements.push({
      id: 'product_hero_zone',
      type: 'PRODUCT',
      boundingBox: productHeroZone.boundingBox,
    });

    // Left Notes Perimeter: Top, Heart, Base Notes
    const notesYStart = topY + headlineWrapped.totalHeight + SPACING.lg;
    const scentNotes = spec.decorativeSelection?.scentNotes || [
      { name: 'Italian Bergamot, Apple', category: 'TOP' as const },
      { name: 'French Lavender, Elemi', category: 'HEART' as const },
      { name: 'Ambergris, Haitian Vetiver', category: 'BASE' as const },
    ];

    let noteY = notesYStart;
    scentNotes.slice(0, 3).forEach((note, index) => {
      const catLabel =
        note.category || (index === 0 ? 'TOP NOTE' : index === 1 ? 'HEART NOTE' : 'BASE NOTE');
      const box: BoundingBox = {
        x: margins.left,
        y: noteY,
        width: Math.round(width * 0.4),
        height: 52,
      };
      elements.push({
        id: `note_${catLabel.toLowerCase()}`,
        type: 'BADGE',
        text: `${catLabel}: ${note.name}`,
        boundingBox: box,
      });

      svgParts.push(`
        <g>
          <text x="${box.x}" y="${box.y + 16}" font-family="${POSTER_DESIGN_TOKENS.fontFamilies.latinBody}" font-size="12" font-weight="600" letter-spacing="1.5px" fill="${spec.palette.accentColor}">
            ${escapeXml(catLabel.toUpperCase())}
          </text>
          <text x="${box.x}" y="${box.y + 36}" font-family="${POSTER_DESIGN_TOKENS.fontFamilies.latinBody}" font-size="15" font-weight="400" fill="${spec.palette.textColor}">
            ${escapeXml(note.name)}
          </text>
          <line x1="${box.x}" y1="${box.y + 46}" x2="${box.x + box.width - 20}" y2="${box.y + 46}" stroke="${spec.palette.accentColor}" stroke-width="0.8" stroke-opacity="0.4" />
        </g>
      `);
      noteY += 64;
    });

    // Bottom Left: Price & CTA
    const bottomY = Math.max(noteY + SPACING.md, height - margins.bottom - 70);
    const priceBox: BoundingBox = {
      x: margins.left,
      y: bottomY,
      width: 140,
      height: 48,
    };
    elements.push({ id: 'pricing_block', type: 'TEXT', text: spec.price, boundingBox: priceBox });

    svgParts.push(`
      <text x="${priceBox.x}" y="${priceBox.y + 34}" font-family="${POSTER_DESIGN_TOKENS.fontFamilies.latinDisplay}" font-size="34" font-weight="700" fill="${spec.palette.accentColor}">
        ${escapeXml(spec.price)}
      </text>
      <text x="${priceBox.x + 85}" y="${priceBox.y + 32}" font-family="${POSTER_DESIGN_TOKENS.fontFamilies.latinBody}" font-size="14" font-weight="500" fill="${spec.palette.secondaryTextColor}">
        ${escapeXml(spec.currency)}
      </text>
    `);

    const ctaW = 160;
    const ctaH = 44;
    const ctaBox: BoundingBox = {
      x: margins.left + 140,
      y: bottomY,
      width: ctaW,
      height: ctaH,
    };
    elements.push({ id: 'cta_button', type: 'BUTTON', text: spec.cta, boundingBox: ctaBox });

    svgParts.push(`
      <g>
        <rect x="${ctaBox.x}" y="${ctaBox.y}" width="${ctaBox.width}" height="${ctaBox.height}" rx="22" fill="${spec.palette.textColor}" />
        <text x="${ctaBox.x + ctaW / 2}" y="${ctaBox.y + 28}" font-family="${POSTER_DESIGN_TOKENS.fontFamilies.latinBody}" font-size="14" font-weight="600" fill="#0E0F12" text-anchor="middle">
          ${escapeXml(spec.cta)}
        </text>
      </g>
    `);

    const svgOverlay = `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <style>${fontFaceCss}</style>
        ${svgParts.join('\n')}
      </svg>
    `;

    return {
      svgOverlay,
      productHeroZone,
      manifest: {
        version: 'poster-layout-v1',
        templateId: 'SCENT_STORY',
        dimensions: { width, height },
        safeMargins: margins,
        elements,
      },
    };
  }

  // 4. KHMER SEASONAL TEMPLATE
  private static renderKhmerSeasonal(
    spec: PosterSpec,
    fontFaceCss: string,
  ): ComputedTemplateLayout {
    const { width, height } = spec.outputFormat;
    const margins = calculateSafeMargins(width, height);
    const elements: LayoutManifestElement[] = [];
    const svgParts: string[] = [];

    // Subtle Corner Accents (OFL / tasteful traditional line motif)
    svgParts.push(
      renderCornerAccentsSvg({
        width,
        height,
        margin: margins.left - 18,
        color: spec.palette.accentColor,
      }),
    );

    // Top Header: Centered Lotus Ornament & Khmer Headline
    let topY = margins.top;

    // Lotus Ornament
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

    // Campaign Eyebrow (Khmer or English)
    if (spec.campaignLabel) {
      svgParts.push(`
        <text x="${width / 2}" y="${topY + 16}" font-family="${POSTER_DESIGN_TOKENS.fontFamilies.khmer}" font-size="14" font-weight="600" letter-spacing="1px" fill="${spec.palette.accentColor}" text-anchor="middle">
          ${escapeXml(spec.campaignLabel)}
        </text>
      `);
      topY += 28;
    }

    // Prominent Khmer Headline
    const headlineWrapped = TextLayoutEngine.wrapText({
      text: spec.headline,
      maxWidth: width - margins.left - margins.right - 60,
      initialFontSize: 40,
      minFontSize: 28,
      maxLines: 2,
      elementName: 'headline_km',
    });
    const headlineBox: BoundingBox = {
      x: Math.round((width - headlineWrapped.totalWidth) / 2),
      y: topY,
      width: headlineWrapped.totalWidth,
      height: headlineWrapped.totalHeight,
    };
    elements.push({ id: 'headline', type: 'TEXT', text: spec.headline, boundingBox: headlineBox });

    headlineWrapped.lines.forEach((line, idx) => {
      svgParts.push(`
        <text x="${width / 2}" y="${topY + (idx + 1) * headlineWrapped.lineHeight - 6}" font-family="${POSTER_DESIGN_TOKENS.fontFamilies.khmer}" font-size="${headlineWrapped.fontSize}" font-weight="700" fill="${spec.palette.textColor}" text-anchor="middle">
          ${escapeXml(line)}
        </text>
      `);
    });
    topY += headlineWrapped.totalHeight + SPACING.xs;

    // Secondary English Headline
    if (spec.secondaryHeadline) {
      svgParts.push(`
        <text x="${width / 2}" y="${topY + 18}" font-family="${POSTER_DESIGN_TOKENS.fontFamilies.latinDisplay}" font-size="20" font-weight="500" fill="${spec.palette.accentColor}" text-anchor="middle">
          ${escapeXml(spec.secondaryHeadline)}
        </text>
      `);
      topY += 28;
    }

    // Center Product Zone on pedestal
    const pedestalYPercent = 0.74;
    const heroW = Math.round(width * 0.48);
    const heroH = Math.round(height * 0.52);
    const heroX = Math.round((width - heroW) / 2);
    const heroY = topY + 10;

    const productHeroZone = {
      placement: 'CENTER' as const,
      pedestalYPercent,
      maxHeroWidth: heroW,
      maxHeroHeight: heroH,
      boundingBox: { x: heroX, y: heroY, width: heroW, height: heroH },
    };
    elements.push({
      id: 'product_hero_zone',
      type: 'PRODUCT',
      boundingBox: productHeroZone.boundingBox,
    });

    // Bottom Zone: Khmer Price Tag & CTA
    let bottomY = Math.round(height * pedestalYPercent) + SPACING.sm;

    const priceTag = spec.promotionalPrice
      ? `តម្លៃពិសេស៖ ${spec.promotionalPrice} ${spec.currency}`
      : `តម្លៃ៖ ${spec.price} ${spec.currency}`;

    const priceW = TextLayoutEngine.measureStringWidth(priceTag, 18, 0) + 36;
    const priceBox: BoundingBox = {
      x: Math.round((width - priceW) / 2),
      y: bottomY,
      width: priceW,
      height: 38,
    };
    elements.push({ id: 'pricing_tag', type: 'BADGE', text: priceTag, boundingBox: priceBox });

    svgParts.push(`
      <g>
        <rect x="${priceBox.x}" y="${priceBox.y}" width="${priceBox.width}" height="${priceBox.height}" rx="19" fill="${spec.palette.badgeBackground || 'rgba(226,179,87,0.2)'}" stroke="${spec.palette.accentColor}" stroke-width="1.2" />
        <text x="${width / 2}" y="${priceBox.y + 25}" font-family="${POSTER_DESIGN_TOKENS.fontFamilies.khmer}" font-size="18" font-weight="600" fill="${spec.palette.accentColor}" text-anchor="middle">
          ${escapeXml(priceTag)}
        </text>
      </g>
    `);
    bottomY += 50;

    // CTA Button
    const ctaW = 190;
    const ctaH = 46;
    const ctaBox: BoundingBox = {
      x: Math.round((width - ctaW) / 2),
      y: Math.min(bottomY, height - margins.bottom - ctaH),
      width: ctaW,
      height: ctaH,
    };
    elements.push({ id: 'cta_button', type: 'BUTTON', text: spec.cta, boundingBox: ctaBox });

    svgParts.push(`
      <g>
        <rect x="${ctaBox.x}" y="${ctaBox.y}" width="${ctaBox.width}" height="${ctaBox.height}" rx="23" fill="${spec.palette.textColor}" />
        <text x="${width / 2}" y="${ctaBox.y + 29}" font-family="${POSTER_DESIGN_TOKENS.fontFamilies.khmer}" font-size="16" font-weight="700" fill="#0E0F12" text-anchor="middle">
          ${escapeXml(spec.cta)}
        </text>
      </g>
    `);

    const svgOverlay = `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <style>${fontFaceCss}</style>
        ${svgParts.join('\n')}
      </svg>
    `;

    return {
      svgOverlay,
      productHeroZone,
      manifest: {
        version: 'poster-layout-v1',
        templateId: 'KHMER_SEASONAL',
        dimensions: { width, height },
        safeMargins: margins,
        elements,
      },
    };
  }
}
