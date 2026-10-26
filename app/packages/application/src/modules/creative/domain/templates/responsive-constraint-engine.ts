import type {
  PosterAspectRatio,
  PosterOutputFormat,
  PosterSpec,
  PosterLogoRef,
} from '../poster-spec.js';
import type {
  TemplateDesignTokens,
  FormatDesignTokens,
  TemplateDefinition,
  SafeMarginTokens,
  TypographyRoleToken,
  TypographyRole,
} from './template-registry.types.js';
import {
  type LayoutBoundingBox,
  type CanvasGeometry,
  type GridColumnGeometry,
  type ResponsiveGridGeometry,
  type ProductBoundsInput,
  type ProductFitResult,
  type LogoSafeZone,
  type ReflowSlotInput,
  type ReflowSlotResult,
  type CollisionViolation,
  type NegativeSpaceAudit,
  type ResolvedLayoutElement,
  type ResponsiveLayoutSolution,
  LAYOUT_Z_TIERS,
} from './responsive-constraint-engine.types.js';
import { TextLayoutEngine, type WrappedTextResult } from '../services/text-layout-engine.js';
import type { TextRole } from '../services/script-run-resolver.js';
import type { LayoutManifestElement, PosterLayoutManifest } from '../poster-templates.js';

function mapTypographyRoleToTextRole(role?: TypographyRole): TextRole | undefined {
  if (!role) {
    return undefined;
  }
  switch (role) {
    case 'HEADLINE':
      return 'HEADLINE';
    case 'SECONDARY_HEADLINE':
      return 'SECONDARY_HEADLINE';
    case 'EYEBROW':
    case 'LABEL':
    case 'CHIP':
      return 'LABEL';
    case 'BODY':
      return 'BODY';
    case 'PRICE':
    case 'PROMO_PRICE':
      return 'PRICE';
    case 'CTA':
      return 'CTA';
    default:
      return 'BODY';
  }
}
import {
  PosterLayoutOverflowError,
  PosterCollisionError,
  InvalidPosterSpecError,
  UnsatisfiableLayoutConstraintError,
} from '../creative-errors.js';

/**
 * Shared deterministic responsive constraint engine used by all five canonical template families.
 *
 * Replaces one-off magic numbers and heuristics with mathematically verified layout bounds,
 * aspect-ratio adaptations (1:1, 4:5, 9:16), collision avoidance, slot collapse, and fail-closed safety.
 */
export class ResponsiveConstraintEngine {
  /**
   * Computes canvas geometry and validates safe margins.
   */
  public static computeCanvasGeometry(
    format: PosterOutputFormat,
    safeMargins: SafeMarginTokens,
  ): CanvasGeometry {
    if (format.width <= 0 || format.height <= 0) {
      throw new UnsatisfiableLayoutConstraintError(
        'canvasDimensions',
        `Canvas dimensions must be positive integers: width=${format.width}, height=${format.height}`,
      );
    }

    const usableWidth = format.width - safeMargins.left - safeMargins.right;
    const usableHeight = format.height - safeMargins.top - safeMargins.bottom;

    if (usableWidth <= 0 || usableHeight <= 0) {
      throw new UnsatisfiableLayoutConstraintError(
        'safeMargins',
        `Safe margins exceed canvas bounds: usableWidth=${usableWidth}, usableHeight=${usableHeight}`,
        { format, safeMargins },
      );
    }

    return {
      width: format.width,
      height: format.height,
      aspectRatio: format.aspectRatio,
      safeMargins,
      usableArea: {
        x: safeMargins.left,
        y: safeMargins.top,
        width: usableWidth,
        height: usableHeight,
      },
    };
  }

  /**
   * Computes responsive grid columns, hero zone, and content zone based on format tokens and column count.
   */
  public static computeGridGeometry(
    canvas: CanvasGeometry,
    tokens: FormatDesignTokens,
    columns: 1 | 2 = 1,
  ): ResponsiveGridGeometry {
    const gutter = tokens.gridAlignment.splitRatio > 0 ? 32 : 0;
    const splitRatio = tokens.gridAlignment.splitRatio;

    if (columns === 2) {
      const leftColWidth = Math.round(canvas.width * splitRatio) - canvas.safeMargins.left;
      const rightColX = canvas.safeMargins.left + leftColWidth + gutter;
      const rightColWidth = canvas.width - rightColX - canvas.safeMargins.right;

      if (leftColWidth <= 0 || rightColWidth <= 0) {
        throw new UnsatisfiableLayoutConstraintError(
          'twoColumnSplit',
          `Cannot fit 2 columns within usable canvas: leftCol=${leftColWidth}px, rightCol=${rightColWidth}px`,
          { canvas, tokens },
        );
      }

      const col1: GridColumnGeometry = {
        columnIndex: 0,
        bounds: {
          x: canvas.safeMargins.left,
          y: canvas.safeMargins.top,
          width: leftColWidth,
          height: canvas.usableArea.height,
        },
      };

      const col2: GridColumnGeometry = {
        columnIndex: 1,
        bounds: {
          x: rightColX,
          y: canvas.safeMargins.top,
          width: rightColWidth,
          height: canvas.usableArea.height,
        },
      };

      return {
        columns: [col1, col2],
        gutter,
        splitRatio,
        heroZone: col1.bounds,
        contentZone: col2.bounds,
      };
    }

    // 1-Column Layout: Hero and Content are stacked vertically
    const heroHeight = Math.round(
      canvas.usableArea.height * tokens.productScale.maxHeroHeightPercent,
    );
    const heroZone: LayoutBoundingBox = {
      x: canvas.usableArea.x,
      y: canvas.usableArea.y,
      width: canvas.usableArea.width,
      height: heroHeight,
    };

    const contentY = canvas.usableArea.y + heroHeight + 16;
    const contentHeight = canvas.usableArea.height - heroHeight - 16;

    const contentZone: LayoutBoundingBox = {
      x: canvas.usableArea.x,
      y: contentY,
      width: canvas.usableArea.width,
      height: Math.max(0, contentHeight),
    };

    const singleCol: GridColumnGeometry = {
      columnIndex: 0,
      bounds: canvas.usableArea,
    };

    return {
      columns: [singleCol],
      gutter: 0,
      splitRatio: 1.0,
      heroZone,
      contentZone,
    };
  }

  /**
   * Fits a product cutout within the hero zone strictly without cropping.
   * Enforces minHeroRatio, maxHeroRatio, and optical grounding at pedestal baseline.
   */
  public static computeProductBounds(
    input: ProductBoundsInput,
    heroZone: LayoutBoundingBox,
    tokens: FormatDesignTokens,
    shadowSpreadMultiplier = 1.05,
  ): ProductFitResult {
    if (input.originalWidth <= 0 || input.originalHeight <= 0) {
      throw new UnsatisfiableLayoutConstraintError(
        'productDimensions',
        `Product dimensions must be positive integers: width=${input.originalWidth}, height=${input.originalHeight}`,
      );
    }

    const aspect = input.originalWidth / input.originalHeight;
    const maxHeroW = Math.round(heroZone.width * tokens.productScale.maxHeroRatio);
    const maxHeroH = Math.round(heroZone.height * tokens.productScale.maxHeroRatio);

    let scaledW: number;
    let scaledH: number;

    // object-fit: contain (scale proportionally without cropping)
    if (aspect > maxHeroW / maxHeroH) {
      scaledW = maxHeroW;
      scaledH = Math.max(1, Math.round(scaledW / aspect));
    } else {
      scaledH = maxHeroH;
      scaledW = Math.max(1, Math.round(scaledH * aspect));
    }

    // Bounded minHeroRatio enforcement
    const minHeroW = Math.round(heroZone.width * tokens.productScale.minHeroRatio);
    const minHeroH = Math.round(heroZone.height * tokens.productScale.minHeroRatio);

    if (scaledW < minHeroW && Math.round(minHeroW / aspect) <= maxHeroH) {
      scaledW = minHeroW;
      scaledH = Math.round(scaledW / aspect);
    } else if (scaledH < minHeroH && Math.round(minHeroH * aspect) <= maxHeroW) {
      scaledH = minHeroH;
      scaledW = Math.round(scaledH * aspect);
    }

    // Pedestal baseline grounding
    const pedestalY =
      heroZone.y + Math.round(heroZone.height * tokens.productScale.pedestalBaselinePercent);
    let productY = pedestalY - scaledH;

    if (productY < heroZone.y) {
      productY = heroZone.y;
    }
    if (productY + scaledH > heroZone.y + heroZone.height) {
      productY = heroZone.y + heroZone.height - scaledH;
    }

    let productX: number;
    if (tokens.productScale.opticalGrounding === 'LEFT') {
      productX = heroZone.x;
    } else if (tokens.productScale.opticalGrounding === 'RIGHT') {
      productX = heroZone.x + heroZone.width - scaledW;
    } else {
      productX = heroZone.x + Math.round((heroZone.width - scaledW) / 2);
    }

    const boundingBox: LayoutBoundingBox = {
      x: productX,
      y: productY,
      width: scaledW,
      height: scaledH,
    };

    // Contact shadow geometry under product
    const shadowW = Math.round(scaledW * shadowSpreadMultiplier);
    const shadowH = Math.max(12, Math.round(scaledW * 0.12));
    const shadowX = productX + Math.round((scaledW - shadowW) / 2);
    const shadowY = pedestalY - Math.round(shadowH / 2);

    const contactShadowBox: LayoutBoundingBox = {
      x: shadowX,
      y: shadowY,
      width: shadowW,
      height: shadowH,
    };

    return {
      boundingBox,
      pedestalY,
      scale: scaledW / input.originalWidth,
      contactShadowBox,
      opticalGrounding: tokens.productScale.opticalGrounding,
    };
  }

  /**
   * Computes brand logo bounding box and non-intrusive safe clear space.
   */
  public static computeLogoZone(
    canvas: CanvasGeometry,
    tokens: FormatDesignTokens,
    logoRef?: PosterLogoRef,
  ): LogoSafeZone | undefined {
    if (!logoRef || (!logoRef.brandName && !logoRef.storageKey)) {
      return undefined;
    }

    const { maxWidth, maxHeight, clearSpace, placement } = tokens.logoConstraints;

    let logoW = logoRef.width ?? 140;
    let logoH = logoRef.height ?? 40;

    // Constrain within token limits preserving aspect ratio
    if (logoW > maxWidth) {
      const scale = maxWidth / logoW;
      logoW = maxWidth;
      logoH = Math.round(logoH * scale);
    }
    if (logoH > maxHeight) {
      const scale = maxHeight / logoH;
      logoH = maxHeight;
      logoW = Math.round(logoW * scale);
    }

    let x: number;
    const y = canvas.safeMargins.top;

    if (placement === 'TOP_CENTER') {
      x = canvas.safeMargins.left + Math.round((canvas.usableArea.width - logoW) / 2);
    } else if (placement === 'TOP_RIGHT') {
      x = canvas.width - canvas.safeMargins.right - logoW;
    } else {
      x = canvas.safeMargins.left;
    }

    const boundingBox: LayoutBoundingBox = { x, y, width: logoW, height: logoH };
    const clearArea: LayoutBoundingBox = {
      x: x - clearSpace,
      y: y - clearSpace,
      width: logoW + 2 * clearSpace,
      height: logoH + 2 * clearSpace,
    };

    return { boundingBox, clearArea, placement };
  }

  /**
   * Reflows text content slots sequentially within an allocated container.
   * Missing optional slots collapse cleanly with 0 height and 0 spacing.
   * Long copy is stepped down to minFontSize before failing closed with PosterLayoutOverflowError.
   */
  public static reflowTextSlots(
    slots: readonly ReflowSlotInput[],
    contentZone: LayoutBoundingBox,
    tokens: TemplateDesignTokens,
    aspectRatio: PosterAspectRatio,
    verticalAlignment: 'TOP' | 'CENTER' | 'BOTTOM' = 'CENTER',
  ): ReflowSlotResult[] {
    const results: ReflowSlotResult[] = [];
    let currentY = contentZone.y;
    const formatAdaptation = tokens.formatAdaptations[aspectRatio];

    for (const slot of slots) {
      const text = slot.text?.trim();

      if (!text || text.length === 0) {
        if (slot.required) {
          throw new InvalidPosterSpecError(
            `Required template slot "${slot.slotId}" is missing or empty.`,
          );
        }

        // Optional slot collapses gracefully
        results.push({
          slotId: slot.slotId,
          visible: false,
          boundingBox: { x: contentZone.x, y: currentY, width: 0, height: 0 },
        });
        continue;
      }

      // Resolve typography role tokens
      const baseRole: TypographyRoleToken | undefined = slot.role
        ? tokens.baseTypographyRoles[slot.role]
        : undefined;
      const formatOverride = slot.role
        ? formatAdaptation.typographyScaleOverrides?.[slot.role]
        : undefined;

      const roleToken: TypographyRoleToken = {
        role: slot.role ?? 'BODY',
        fontFamily: formatOverride?.fontFamily ?? baseRole?.fontFamily ?? 'Montserrat',
        fontSize: formatOverride?.fontSize ?? baseRole?.fontSize ?? 16,
        fontWeight: formatOverride?.fontWeight ?? baseRole?.fontWeight ?? 400,
        lineHeight: formatOverride?.lineHeight ?? baseRole?.lineHeight ?? 1.3,
        letterSpacing: formatOverride?.letterSpacing ?? baseRole?.letterSpacing ?? 0,
        minFontSize: formatOverride?.minFontSize ?? baseRole?.minFontSize ?? 12,
        maxLines: formatOverride?.maxLines ?? baseRole?.maxLines ?? 3,
      };

      const remainingBudget = contentZone.y + contentZone.height - currentY;
      if (remainingBudget <= 0) {
        throw new PosterLayoutOverflowError(
          slot.slotId,
          `Vertical container budget exhausted before slot "${slot.slotId}" could be placed.`,
          { currentY, contentZone },
        );
      }

      const preferredLatin =
        roleToken.fontFamily === 'Noto Sans Khmer' ? undefined : roleToken.fontFamily;

      // Wrap text using W21 HarfBuzz/Intl layout engine with step-down font shrinking
      const wrapped: WrappedTextResult = TextLayoutEngine.wrapText({
        text,
        maxWidth: contentZone.width,
        maxHeight: remainingBudget,
        initialFontSize: roleToken.fontSize,
        minFontSize: roleToken.minFontSize,
        maxLines: roleToken.maxLines,
        lineHeightMultiplier: roleToken.lineHeight,
        tracking: roleToken.letterSpacing,
        role: mapTypographyRoleToTextRole(slot.role),
        preferredLatinFont: preferredLatin,
        elementName: slot.slotId,
      });

      const slotBox: LayoutBoundingBox = {
        x: contentZone.x,
        y: currentY,
        width: wrapped.totalWidth,
        height: wrapped.totalHeight,
      };

      results.push({
        slotId: slot.slotId,
        visible: true,
        boundingBox: slotBox,
        wrappedText: wrapped,
        text,
      });

      const spacingAfter = slot.spacingAfter ?? tokens.spacing.sm;
      currentY += wrapped.totalHeight + spacingAfter;
    }

    // Measure total used content height
    const visibleSlots = results.filter((r) => r.visible);
    if (visibleSlots.length === 0) {
      return results;
    }

    const firstSlotY = visibleSlots[0]!.boundingBox.y;
    const lastSlot = visibleSlots[visibleSlots.length - 1]!;
    const totalContentHeight = lastSlot.boundingBox.y + lastSlot.boundingBox.height - firstSlotY;

    if (totalContentHeight > contentZone.height) {
      throw new PosterLayoutOverflowError(
        'contentZone',
        `Total content height (${totalContentHeight}px) overflows allocated container (${contentZone.height}px)`,
        { totalContentHeight, contentZoneHeight: contentZone.height },
      );
    }

    // Apply vertical alignment redistribution
    if (verticalAlignment === 'CENTER') {
      const verticalOffset = Math.round((contentZone.height - totalContentHeight) / 2);
      return results.map((slot) => {
        if (!slot.visible) {
          return slot;
        }
        return {
          ...slot,
          boundingBox: {
            ...slot.boundingBox,
            y: slot.boundingBox.y + verticalOffset,
          },
        };
      });
    }

    if (verticalAlignment === 'BOTTOM') {
      const verticalOffset = contentZone.height - totalContentHeight;
      return results.map((slot) => {
        if (!slot.visible) {
          return slot;
        }
        return {
          ...slot,
          boundingBox: {
            ...slot.boundingBox,
            y: slot.boundingBox.y + verticalOffset,
          },
        };
      });
    }

    return results;
  }

  /**
   * Deterministic 2D collision check between two bounding boxes with minimum separation margin.
   */
  public static checkCollision(
    boxA: LayoutBoundingBox,
    boxB: LayoutBoundingBox,
    minSeparation = 0,
  ): boolean {
    if (boxA.width <= 0 || boxA.height <= 0 || boxB.width <= 0 || boxB.height <= 0) {
      return false;
    }

    const aLeft = boxA.x;
    const aRight = boxA.x + boxA.width;
    const aTop = boxA.y;
    const aBottom = boxA.y + boxA.height;

    const bLeft = boxB.x;
    const bRight = boxB.x + boxB.width;
    const bTop = boxB.y;
    const bBottom = boxB.y + boxB.height;

    const xOverlap = aLeft < bRight + minSeparation && aRight + minSeparation > bLeft;
    const yOverlap = aTop < bBottom + minSeparation && aBottom + minSeparation > bTop;

    return xOverlap && yOverlap;
  }

  /**
   * Scans elements pairwise for collisions and returns diagnostic violations.
   */
  public static detectCollisions(
    elements: readonly ResolvedLayoutElement[],
    minSeparation = 0,
  ): CollisionViolation[] {
    const violations: CollisionViolation[] = [];

    for (let i = 0; i < elements.length; i++) {
      const elA = elements[i]!;
      if (elA.type === 'PANEL' || elA.type === 'SHADOW') {
        continue;
      }

      for (let j = i + 1; j < elements.length; j++) {
        const elB = elements[j]!;
        if (elB.type === 'PANEL' || elB.type === 'SHADOW') {
          continue;
        }

        if (this.checkCollision(elA.boundingBox, elB.boundingBox, minSeparation)) {
          const xOverlap = Math.min(
            elA.boundingBox.x + elA.boundingBox.width - elB.boundingBox.x,
            elB.boundingBox.x + elB.boundingBox.width - elA.boundingBox.x,
          );
          const yOverlap = Math.min(
            elA.boundingBox.y + elA.boundingBox.height - elB.boundingBox.y,
            elB.boundingBox.y + elB.boundingBox.height - elA.boundingBox.y,
          );

          violations.push({
            elementA: elA.id,
            elementB: elB.id,
            boxA: elA.boundingBox,
            boxB: elB.boundingBox,
            minSeparation,
            actualOverlap: { xOverlap, yOverlap },
          });
        }
      }
    }

    return violations;
  }

  /**
   * Asserts that no element collisions exist; throws PosterCollisionError on failure.
   */
  public static assertNoCollisions(
    elements: readonly ResolvedLayoutElement[],
    minSeparation = 0,
  ): void {
    const violations = this.detectCollisions(elements, minSeparation);
    if (violations.length > 0) {
      const first = violations[0]!;
      throw new PosterCollisionError(first.elementA, first.elementB, {
        minSeparation,
        actualOverlap: first.actualOverlap,
        boxA: first.boxA,
        boxB: first.boxB,
      });
    }
  }

  /**
   * Tests whether an inner bounding box is strictly contained within an outer container.
   */
  public static isContainedWithin(inner: LayoutBoundingBox, outer: LayoutBoundingBox): boolean {
    if (inner.width <= 0 || inner.height <= 0) {
      return true;
    }
    return (
      inner.x >= outer.x &&
      inner.y >= outer.y &&
      inner.x + inner.width <= outer.x + outer.width &&
      inner.y + inner.height <= outer.y + outer.height
    );
  }

  /**
   * Asserts all non-panel content elements reside within the safe margin area.
   */
  public static assertSafeAreaContainment(
    elements: readonly ResolvedLayoutElement[],
    safeArea: LayoutBoundingBox,
  ): void {
    for (const el of elements) {
      if (el.type === 'PANEL' || el.type === 'SHADOW') {
        continue;
      }
      if (!this.isContainedWithin(el.boundingBox, safeArea)) {
        throw new PosterLayoutOverflowError(
          el.id,
          `Element breaches safe area boundaries. Element: [x=${el.boundingBox.x}, y=${el.boundingBox.y}, w=${el.boundingBox.width}, h=${el.boundingBox.height}], Safe: [x=${safeArea.x}, y=${safeArea.y}, w=${safeArea.width}, h=${safeArea.height}]`,
          { element: el.boundingBox, safeArea },
        );
      }
    }
  }

  /**
   * Audits layout negative space against minimum required token ratio.
   */
  public static auditNegativeSpace(
    canvas: CanvasGeometry,
    elements: readonly ResolvedLayoutElement[],
    minRequiredRatio: number,
  ): NegativeSpaceAudit {
    const totalCanvasArea = canvas.width * canvas.height;
    const totalUsableArea = canvas.usableArea.width * canvas.usableArea.height;

    const occupiedArea = elements
      .filter((e) => e.type !== 'PANEL' && e.type !== 'SHADOW')
      .reduce((sum, e) => sum + e.boundingBox.width * e.boundingBox.height, 0);

    const negativeSpaceArea = Math.max(0, totalUsableArea - occupiedArea);
    const negativeSpaceRatio = totalUsableArea > 0 ? negativeSpaceArea / totalUsableArea : 0;
    const compliant = negativeSpaceRatio >= minRequiredRatio;

    return {
      totalCanvasArea,
      totalUsableArea,
      occupiedArea,
      negativeSpaceArea,
      negativeSpaceRatio,
      minRequiredRatio,
      compliant,
    };
  }

  /**
   * Complete layout solver orchestrating canvas, grid, product, logo, text slots, and collision safety.
   */
  public static solveLayout(
    spec: PosterSpec,
    template: TemplateDefinition,
    productDimensions: ProductBoundsInput,
  ): ResponsiveLayoutSolution {
    const formatTokens = template.tokens.formatAdaptations[spec.outputFormat.aspectRatio];
    const canvas = this.computeCanvasGeometry(spec.outputFormat, formatTokens.safeMargins);
    const isSplit = template.category === 'EDITORIAL';
    const grid = this.computeGridGeometry(canvas, formatTokens, isSplit ? 2 : 1);

    const product = this.computeProductBounds(productDimensions, grid.heroZone, formatTokens);
    const logo = this.computeLogoZone(canvas, formatTokens, spec.logoAssetRef);

    // Map PosterSpec content into slot inputs
    const slotInputs: ReflowSlotInput[] = [
      {
        slotId: 'campaignEyebrow',
        text: spec.campaignLabel,
        required: false,
        role: 'EYEBROW',
        spacingAfter: template.tokens.spacing.xs,
      },
      {
        slotId: 'headline',
        text: spec.headline,
        required: true,
        role: 'HEADLINE',
        spacingAfter: template.tokens.spacing.sm,
      },
      {
        slotId: 'secondaryHeadline',
        text: spec.secondaryHeadline,
        required: false,
        role: 'SECONDARY_HEADLINE',
        spacingAfter: template.tokens.spacing.sm,
      },
      {
        slotId: 'supportingText',
        text: spec.supportingText,
        required: false,
        role: 'BODY',
        spacingAfter: template.tokens.spacing.md,
      },
      {
        slotId: 'primaryPrice',
        text: spec.promotionalPrice
          ? `${spec.currency}${spec.promotionalPrice} (was ${spec.currency}${spec.price})`
          : `${spec.currency}${spec.price}`,
        required: true,
        role: 'PRICE',
        spacingAfter: template.tokens.spacing.md,
      },
      {
        slotId: 'callToAction',
        text: spec.cta,
        required: true,
        role: 'CTA',
        spacingAfter: 0,
      },
    ];

    const slots = this.reflowTextSlots(
      slotInputs,
      grid.contentZone,
      template.tokens,
      spec.outputFormat.aspectRatio,
      'CENTER',
    );

    // Construct resolved elements
    const elements: ResolvedLayoutElement[] = [];

    // Product shadow
    elements.push({
      id: 'product_shadow',
      type: 'SHADOW',
      zIndex: LAYOUT_Z_TIERS.PRODUCT_SHADOW,
      boundingBox: product.contactShadowBox,
    });

    // Product hero
    elements.push({
      id: 'product_hero',
      type: 'PRODUCT',
      zIndex: LAYOUT_Z_TIERS.PRODUCT_HERO,
      boundingBox: product.boundingBox,
    });

    // Logo if present
    if (logo) {
      elements.push({
        id: 'brand_logo',
        type: 'LOGO',
        zIndex: LAYOUT_Z_TIERS.BRAND_LOGO,
        boundingBox: logo.boundingBox,
      });
    }

    // Text slots
    for (const slot of slots) {
      if (!slot.visible) {
        continue;
      }
      elements.push({
        id: slot.slotId,
        type: slot.slotId === 'callToAction' ? 'BUTTON' : 'TEXT',
        zIndex:
          slot.slotId === 'callToAction'
            ? LAYOUT_Z_TIERS.CALL_TO_ACTION
            : LAYOUT_Z_TIERS.TYPOGRAPHY,
        boundingBox: slot.boundingBox,
        text: slot.text,
      });
    }

    // Verify safe area containment and collision-free invariant
    this.assertSafeAreaContainment(elements, canvas.usableArea);
    this.assertNoCollisions(elements, 0);

    // Audit negative space
    const negativeSpace = this.auditNegativeSpace(
      canvas,
      elements,
      formatTokens.negativeSpace.reservedNegativeSpacePercent,
    );

    // Build compatible LayoutManifest
    const manifestElements: LayoutManifestElement[] = elements.map((el) => ({
      id: el.id,
      type: el.type,
      boundingBox: el.boundingBox,
      ...(el.text !== undefined ? { text: el.text } : {}),
    }));

    const manifest: PosterLayoutManifest = {
      version: template.version,
      templateId: template.id,
      dimensions: { width: canvas.width, height: canvas.height },
      safeMargins: canvas.safeMargins,
      elements: manifestElements,
    };

    return {
      canvas,
      grid,
      product,
      logo,
      slots,
      elements,
      negativeSpace,
      manifest,
    };
  }
}
