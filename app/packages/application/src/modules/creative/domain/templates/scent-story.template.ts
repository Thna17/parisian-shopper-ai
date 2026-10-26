import type { PosterSpec, ScentNoteItem } from '../poster-spec.js';
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

interface TierDefinition {
  readonly category: 'TOP' | 'HEART' | 'BASE';
  readonly label: string;
  readonly items: string[];
}

/**
 * Production-quality v1.0.0 implementation of SCENT_STORY canonical template family.
 *
 * Olfactory Education & Luxury Layout Requirements:
 * - Structured Top, Heart, and Base fragrance note architecture
 * - Flacon hero product remains prominent commercial focal point
 * - Clean collapse of unprovided olfactory tiers
 * - Explicit truncation policy: max 3 notes per tier (slice(0, 3)), max 3 tiers
 * - Multi-script HarfBuzz/Intl support for EN, KM, and BILINGUAL modes
 * - Strict non-collision between olfactory copy and product hero zone
 * - Safe margin containment across 1:1, 4:5, and 9:16
 */
export function renderScentStoryTemplate(
  spec: PosterSpec,
  fontFaceCss: string,
  tokens?: TemplateDesignTokens,
  _options?: RenderPosterOptions,
): ComputedTemplateLayout {
  // 1. Mandatory Fields Validation
  if (!spec.headline || spec.headline.trim().length === 0) {
    throw new InvalidPosterSpecError('Headline is required for Scent Story template.');
  }
  if (!spec.price || spec.price.trim().length === 0) {
    throw new InvalidPosterSpecError('Price is required for Scent Story template.');
  }
  if (!spec.cta || spec.cta.trim().length === 0) {
    throw new InvalidPosterSpecError('Call to action (CTA) is required for Scent Story template.');
  }

  // Fail closed if explicitly empty scent notes array was provided
  if (spec.decorativeSelection?.scentNotes && spec.decorativeSelection.scentNotes.length === 0) {
    throw new InvalidPosterSpecError('Scent notes array cannot be empty for Scent Story template.');
  }

  // Canonical Approved Default Olfactory Architecture (Haussmann Luxe Provenance)
  const CANONICAL_APPROVED_SCENT_NOTES: readonly ScentNoteItem[] = [
    { name: 'Calabrian Bergamot, Neroli', category: 'TOP' },
    { name: 'French Rose, Iris Pallida', category: 'HEART' },
    { name: 'Indonesian Patchouli, Amber', category: 'BASE' },
  ];

  const rawNotes: readonly ScentNoteItem[] =
    spec.decorativeSelection?.scentNotes && spec.decorativeSelection.scentNotes.length > 0
      ? spec.decorativeSelection.scentNotes
      : CANONICAL_APPROVED_SCENT_NOTES;

  // 2. Olfactory Pyramid Tier Processing & Policy-Governed Truncation
  const topList: string[] = [];
  const heartList: string[] = [];
  const baseList: string[] = [];

  for (const note of rawNotes) {
    const trimmed = (note.name || '').trim();
    if (trimmed.length === 0) continue;

    if (note.category === 'TOP') {
      topList.push(trimmed);
    } else if (note.category === 'HEART') {
      heartList.push(trimmed);
    } else if (note.category === 'BASE') {
      baseList.push(trimmed);
    } else {
      // Gracefully categorize uncategorized notes sequentially into empty tiers
      if (topList.length === 0) {
        topList.push(trimmed);
      } else if (heartList.length === 0) {
        heartList.push(trimmed);
      } else if (baseList.length === 0) {
        baseList.push(trimmed);
      } else {
        heartList.push(trimmed);
      }
    }
  }

  const isKm = spec.language === 'KM';
  const isBilingual = spec.language === 'BILINGUAL';

  const tierDefinitions: TierDefinition[] = [
    {
      category: 'TOP',
      label: isKm ? 'ក្លិនដើម (Top Note)' : isBilingual ? 'TOP NOTE · ក្លិនដើម' : 'TOP NOTE',
      items: topList.slice(0, 3), // Explicit policy: max 3 notes per tier
    },
    {
      category: 'HEART',
      label: isKm
        ? 'ក្លិនកណ្តាល (Heart Note)'
        : isBilingual
          ? 'HEART NOTE · ក្លិនកណ្តាល'
          : 'HEART NOTE',
      items: heartList.slice(0, 3),
    },
    {
      category: 'BASE',
      label: isKm ? 'ក្លិនបាត (Base Note)' : isBilingual ? 'BASE NOTE · ក្លិនបាត' : 'BASE NOTE',
      items: baseList.slice(0, 3),
    },
  ];

  // Clean collapse: drop tiers with zero items
  const activeTiers = tierDefinitions.filter((t) => t.items.length > 0);
  if (activeTiers.length === 0) {
    throw new InvalidPosterSpecError(
      'At least one valid non-empty scent note is required for Scent Story template.',
    );
  }

  const { width, height, aspectRatio } = spec.outputFormat;
  const activeTokens = tokens ?? TemplateRegistry.getInstance().getTemplate('SCENT_STORY').tokens;
  const formatTokens = activeTokens.formatAdaptations[aspectRatio];
  const margins = formatTokens.safeMargins;

  const elements: LayoutManifestElement[] = [];
  const svgParts: string[] = [];

  // 3. Grid & Zones Calculation
  let heroZone: LayoutBoundingBox;
  let panelZone: LayoutBoundingBox;
  let pedestalYPercent: number;

  if (aspectRatio === '9:16') {
    // 9:16 Story Format: Vertical Stacking (Hero in upper zone, Olfactory panel below)
    const heroHeight = Math.min(
      Math.round(height * 0.38),
      Math.round(height * formatTokens.productScale.maxHeroHeightPercent),
    );
    const usableW = width - margins.left - margins.right;

    heroZone = {
      x: margins.left,
      y: margins.top,
      width: usableW,
      height: heroHeight,
    };

    pedestalYPercent = Math.round(((margins.top + heroHeight - 16) / height) * 1000) / 1000;

    const panelY = margins.top + heroHeight + activeTokens.spacing.sm;
    const panelH = height - margins.bottom - panelY;

    panelZone = {
      x: margins.left,
      y: panelY,
      width: usableW,
      height: Math.max(0, panelH),
    };

    svgParts.push(`
      <defs>
        <linearGradient id="scentGrad916" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0E0F12" stop-opacity="0.0" />
          <stop offset="25%" stop-color="#0E0F12" stop-opacity="0.75" />
          <stop offset="100%" stop-color="#0E0F12" stop-opacity="0.94" />
        </linearGradient>
      </defs>
      <rect x="0" y="${panelZone.y - 30}" width="${width}" height="${height - panelZone.y + 30}" fill="url(#scentGrad916)" />
    `);
  } else {
    // 1:1 and 4:5 Formats: 2-Column Split (Scent Story Panel on LEFT, Flacon Hero on RIGHT)
    const panelW = Math.round(width * 0.48) - margins.left;
    const gutter = activeTokens.spacing.gutter;
    const heroX = margins.left + panelW + gutter;
    const heroW = width - heroX - margins.right;
    const heroH = height - margins.top - margins.bottom;

    panelZone = {
      x: margins.left,
      y: margins.top,
      width: panelW,
      height: heroH,
    };

    heroZone = {
      x: heroX,
      y: margins.top,
      width: heroW,
      height: heroH,
    };

    pedestalYPercent = formatTokens.productScale.pedestalBaselinePercent;

    svgParts.push(`
      <defs>
        <linearGradient id="scentGradLeft" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%" stop-color="#0E0F12" stop-opacity="0.0" />
          <stop offset="30%" stop-color="#0E0F12" stop-opacity="0.65" />
          <stop offset="100%" stop-color="#0E0F12" stop-opacity="0.88" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${panelZone.x + panelZone.width + 40}" height="${height}" fill="url(#scentGradLeft)" />
    `);
  }

  // Register Hero Zone & Panel
  const productHeroZone = {
    placement: aspectRatio === '9:16' ? ('CENTER' as const) : ('RIGHT' as const),
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

  elements.push({
    id: 'scent_panel',
    type: 'PANEL',
    boundingBox: panelZone,
  });

  // 4. Sequential Reflow Inside Scent Story Panel
  const textPadding = activeTokens.spacing.sm;
  const contentW = panelZone.width - textPadding * 2;
  const startX = panelZone.x + textPadding;
  let currentY = panelZone.y + textPadding;

  // 4.1 Campaign Label / Eyebrow (Optional)
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

  // 4.2 Headline (Mandatory: Fragrance Name)
  const headlineRole = activeTokens.baseTypographyRoles.HEADLINE;
  const headlineWrapped: WrappedTextResult = TextLayoutEngine.wrapText({
    text: spec.headline,
    maxWidth: contentW,
    initialFontSize: Math.min(36, headlineRole.fontSize),
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
  currentY += headlineBox.height + activeTokens.spacing.xs;

  // 4.3 Secondary Headline (Optional)
  if (spec.secondaryHeadline && spec.secondaryHeadline.trim().length > 0) {
    const secRole = activeTokens.baseTypographyRoles.SECONDARY_HEADLINE;
    const secWrapped = TextLayoutEngine.wrapText({
      text: spec.secondaryHeadline,
      maxWidth: contentW,
      initialFontSize: secRole.fontSize,
      minFontSize: secRole.minFontSize,
      maxLines: 1,
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
    currentY += secBox.height + activeTokens.spacing.xs;
  }

  // 4.4 Decorative Accent Divider
  const dividerBox: BoundingBox = {
    x: startX,
    y: currentY,
    width: Math.min(200, contentW),
    height: 4,
  };
  elements.push({ id: 'divider', type: 'DIVIDER', boundingBox: dividerBox });
  svgParts.push(
    renderDividerSvg({
      x1: dividerBox.x,
      x2: dividerBox.x + dividerBox.width,
      y: dividerBox.y + 2,
      color: spec.palette.accentColor,
      style: 'DIAMOND_DOT',
    }),
  );
  currentY += dividerBox.height + activeTokens.spacing.sm;

  // 4.5 Olfactory Pyramid Architecture (Clean Collapsing Tiers)
  for (const tier of activeTiers) {
    // Tier Sub-header (e.g. "TOP NOTE · ក្លិនដើម")
    const tierLabelBox: BoundingBox = {
      x: startX,
      y: currentY,
      width: contentW,
      height: 18,
    };
    elements.push({
      id: `note_${tier.category.toLowerCase()}_label`,
      type: 'TEXT',
      text: tier.label,
      boundingBox: tierLabelBox,
    });

    const tierLabelWrapped = TextLayoutEngine.wrapText({
      text: tier.label.toUpperCase(),
      maxWidth: contentW,
      initialFontSize: 12,
      minFontSize: 10,
      maxLines: 1,
      elementName: `note_${tier.category.toLowerCase()}_label`,
      role: 'LABEL',
      preferredLatinFont: 'Montserrat',
      latinWeight: 600,
      khmerWeight: 700,
    });
    tierLabelWrapped.shapedLines.forEach((shapedLine, idx) => {
      svgParts.push(
        renderShapedTextLineSvg({
          x: tierLabelBox.x,
          baselineY: tierLabelBox.y + shapedLine.baseline + idx * tierLabelWrapped.lineHeight,
          runs: shapedLine.runs,
          color: spec.palette.accentColor,
          textAnchor: 'start',
          mode: 'GLYPH_PATHS',
        }),
      );
    });
    currentY += tierLabelBox.height + 4;

    // Tier Ingredient Notes (e.g. "Bergamot · Pink Pepper · Lemon")
    const notesJoined = tier.items.join('  ·  ');
    const notesWrapped = TextLayoutEngine.wrapText({
      text: notesJoined,
      maxWidth: contentW,
      initialFontSize: 14,
      minFontSize: 11,
      maxLines: 2,
      lineHeightMultiplier: 1.3,
      elementName: `note_${tier.category.toLowerCase()}`,
      role: 'LABEL',
      preferredLatinFont: 'Montserrat',
      latinWeight: 400,
      khmerWeight: 400,
    });

    const notesBox: BoundingBox = {
      x: startX,
      y: currentY,
      width: notesWrapped.actualBoundingBox.width,
      height: notesWrapped.actualBoundingBox.height,
    };
    elements.push({
      id: `note_${tier.category.toLowerCase()}`,
      type: 'BADGE',
      text: notesJoined,
      boundingBox: notesBox,
    });

    notesWrapped.shapedLines.forEach((shapedLine, idx) => {
      svgParts.push(
        renderShapedTextLineSvg({
          x: notesBox.x,
          baselineY: notesBox.y + shapedLine.baseline + idx * notesWrapped.lineHeight,
          runs: shapedLine.runs,
          color: spec.palette.textColor,
          textAnchor: 'start',
          mode: 'GLYPH_PATHS',
        }),
      );
    });
    currentY += notesBox.height + activeTokens.spacing.sm;
  }

  // 4.6 Supporting Text (Optional Perfumer Notes)
  if (spec.supportingText && spec.supportingText.trim().length > 0) {
    const bodyRole = activeTokens.baseTypographyRoles.BODY;
    const suppWrapped = TextLayoutEngine.wrapText({
      text: spec.supportingText,
      maxWidth: contentW,
      initialFontSize: Math.min(15, bodyRole.fontSize),
      minFontSize: 11,
      maxLines: 2,
      lineHeightMultiplier: 1.3,
      elementName: 'supporting_text',
      role: 'BODY',
      preferredLatinFont: 'Montserrat',
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
    currentY += suppBox.height + activeTokens.spacing.sm;
  }

  // 4.7 Pricing & Specs Block
  const priceText = spec.price;
  const promoText = spec.promotionalPrice;
  const sizeSpecText = [spec.concentration, spec.size].filter(Boolean).join(' · ');

  const priceBox: BoundingBox = {
    x: startX,
    y: currentY,
    width: Math.min(260, contentW),
    height: 38,
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
      initialFontSize: 28,
      minFontSize: 22,
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

    const origX = priceBox.x + promoW + 14;
    const origWrapped = TextLayoutEngine.wrapText({
      text: priceText,
      maxWidth: Math.max(70, contentW - promoW - 14),
      initialFontSize: 18,
      minFontSize: 14,
      maxLines: 1,
      elementName: 'original_price',
      role: 'PRICE',
      preferredLatinFont: 'Montserrat',
      latinWeight: 400,
      khmerWeight: 400,
    });
    const origLine = origWrapped.shapedLines[0];
    if (origLine) {
      const origBaselineY = priceBox.y + (promoLine ? promoLine.baseline : 26);
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
      initialFontSize: 30,
      minFontSize: 22,
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
      initialFontSize: 12,
      minFontSize: 10,
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
          baselineY: priceBox.y + 38 + sizeLine.baseline,
          runs: sizeLine.runs,
          color: spec.palette.secondaryTextColor,
          textAnchor: 'start',
          mode: 'GLYPH_PATHS',
        }),
      );
    }
    currentY += 56;
  } else {
    currentY += 46;
  }

  // 4.8 Call To Action Button (Mandatory)
  const ctaW = Math.min(190, contentW);
  const ctaH = 44;
  const maxCtaY = height - margins.bottom - ctaH;
  let ctaY = Math.max(currentY + activeTokens.spacing.xs, maxCtaY);

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
    initialFontSize: 14,
    minFontSize: 11,
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
      <rect x="${ctaBox.x}" y="${ctaBox.y}" width="${ctaBox.width}" height="${ctaBox.height}" rx="22" fill="${spec.palette.accentColor}" />
      ${ctaContentSvg}
    </g>
  `);

  // 5. Invariant & Safe Margin Verification
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

  // Verify non-collision with Product Hero Zone
  for (const el of elements) {
    if (el.type === 'TEXT' || el.type === 'BADGE' || el.type === 'BUTTON' || el.id === 'divider') {
      if (ResponsiveConstraintEngine.checkCollision(el.boundingBox, heroZone, 0)) {
        throw new PosterCollisionError(el.id, 'product_hero_zone', {
          elementBox: el.boundingBox,
          heroBox: heroZone,
        });
      }
    }
  }

  // 6. Build Final SVG Overlay & Layout Manifest
  const svgOverlay = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <style>${fontFaceCss}</style>
      ${svgParts.join('\n')}
    </svg>
  `;

  const manifest: PosterLayoutManifest = {
    version: '1.0.0',
    templateId: 'SCENT_STORY',
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
