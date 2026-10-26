import { beforeAll, describe, expect, it } from '@jest/globals';
import { createHash } from 'node:crypto';
import { ResponsiveConstraintEngine } from './responsive-constraint-engine.js';
import {
  type LayoutBoundingBox,
  type ResolvedLayoutElement,
  LAYOUT_Z_TIERS,
} from './responsive-constraint-engine.types.js';
import { TemplateRegistry } from './template-registry.js';
import { TextLayoutEngine } from '../services/text-layout-engine.js';
import { FontRegistry } from '../../infrastructure/fonts/font-registry.js';
import { HarfBuzzShapingService } from '../../infrastructure/fonts/harfbuzz-shaping-service.js';
import {
  PosterLayoutOverflowError,
  PosterCollisionError,
  InvalidPosterSpecError,
  UnsatisfiableLayoutConstraintError,
} from '../creative-errors.js';
import type { PosterSpec, PosterOutputFormat } from '../poster-spec.js';

describe('ResponsiveConstraintEngine (W22-C)', () => {
  let registry: TemplateRegistry;

  beforeAll(() => {
    TextLayoutEngine.setDefaultShaper(new HarfBuzzShapingService(FontRegistry.getInstance()));
    registry = new TemplateRegistry(true);
  });

  const basePalette = {
    id: 'NOCTURNE_GOLD',
    textColor: '#FFFFFF',
    accentColor: '#E5C07B',
    secondaryTextColor: '#A0A4AB',
  };

  const createSpec = (
    templateId: 'EDITORIAL_SPLIT' | 'CENTERED_HERO',
    aspectRatio: '1:1' | '4:5' | '9:16',
    overrides?: Partial<PosterSpec>,
  ): PosterSpec => {
    const dimensions: Record<'1:1' | '4:5' | '9:16', { width: number; height: number }> = {
      '1:1': { width: 1080, height: 1080 },
      '4:5': { width: 1080, height: 1350 },
      '9:16': { width: 1080, height: 1920 },
    };

    const outputFormat: PosterOutputFormat = {
      aspectRatio,
      width: dimensions[aspectRatio].width,
      height: dimensions[aspectRatio].height,
    };

    return {
      templateId,
      outputFormat,
      language: 'EN',
      headline: 'L’Art de Vivre',
      secondaryHeadline: 'Iconic Parisian Luxury',
      supportingText: 'Crafted in Paris with organic botanical essences.',
      price: '135',
      currency: '$',
      cta: 'DISCOVER',
      campaignLabel: 'SUMMER 2026',
      productPlacement: 'LEFT',
      textPlacement: 'RIGHT',
      palette: basePalette,
      logoAssetRef: { brandName: 'Maison Haussmann', width: 140, height: 40 },
      ...overrides,
    };
  };

  describe('1. Canvas Geometry & Safe Area Calculation', () => {
    it.each(['1:1', '4:5', '9:16'] as const)(
      'computes exact canvas geometry and usable area for format %s',
      (ratio) => {
        const template = registry.getTemplate('EDITORIAL_SPLIT');
        const formatTokens = template.tokens.formatAdaptations[ratio];
        const format: PosterOutputFormat = {
          aspectRatio: ratio,
          width: formatTokens.width,
          height: formatTokens.height,
        };

        const canvas = ResponsiveConstraintEngine.computeCanvasGeometry(
          format,
          formatTokens.safeMargins,
        );

        expect(canvas.width).toBe(formatTokens.width);
        expect(canvas.height).toBe(formatTokens.height);
        expect(canvas.aspectRatio).toBe(ratio);
        expect(canvas.usableArea.x).toBe(formatTokens.safeMargins.left);
        expect(canvas.usableArea.y).toBe(formatTokens.safeMargins.top);
        expect(canvas.usableArea.width).toBe(
          formatTokens.width - formatTokens.safeMargins.left - formatTokens.safeMargins.right,
        );
        expect(canvas.usableArea.height).toBe(
          formatTokens.height - formatTokens.safeMargins.top - formatTokens.safeMargins.bottom,
        );
      },
    );

    it('fails closed when canvas dimensions are non-positive', () => {
      const template = registry.getTemplate('EDITORIAL_SPLIT');
      const safeMargins = template.tokens.formatAdaptations['1:1'].safeMargins;

      expect(() =>
        ResponsiveConstraintEngine.computeCanvasGeometry(
          { aspectRatio: '1:1', width: 0, height: 1080 },
          safeMargins,
        ),
      ).toThrow(UnsatisfiableLayoutConstraintError);

      expect(() =>
        ResponsiveConstraintEngine.computeCanvasGeometry(
          { aspectRatio: '1:1', width: 1080, height: -100 },
          safeMargins,
        ),
      ).toThrow(UnsatisfiableLayoutConstraintError);
    });

    it('fails closed when safe margins exceed canvas boundaries', () => {
      const invalidMargins = { top: 600, bottom: 600, left: 50, right: 50 };
      expect(() =>
        ResponsiveConstraintEngine.computeCanvasGeometry(
          { aspectRatio: '1:1', width: 1080, height: 1080 },
          invalidMargins,
        ),
      ).toThrow(UnsatisfiableLayoutConstraintError);
    });
  });

  describe('2. Responsive Grids & Zones', () => {
    it('computes 2-column split grid geometry for Editorial Split', () => {
      const template = registry.getTemplate('EDITORIAL_SPLIT');
      const formatTokens = template.tokens.formatAdaptations['1:1'];
      const canvas = ResponsiveConstraintEngine.computeCanvasGeometry(
        { aspectRatio: '1:1', width: 1080, height: 1080 },
        formatTokens.safeMargins,
      );

      const grid = ResponsiveConstraintEngine.computeGridGeometry(canvas, formatTokens, 2);

      expect(grid.columns.length).toBe(2);
      expect(grid.gutter).toBe(32);
      expect(grid.heroZone.x).toBe(canvas.safeMargins.left);
      expect(grid.heroZone.width).toBeGreaterThan(300);
      expect(grid.contentZone.x).toBeGreaterThan(grid.heroZone.x + grid.heroZone.width);
      expect(grid.contentZone.x + grid.contentZone.width).toBeLessThanOrEqual(
        canvas.width - canvas.safeMargins.right,
      );
    });

    it('computes 1-column stacked grid geometry for Centered Hero', () => {
      const template = registry.getTemplate('CENTERED_HERO');
      const formatTokens = template.tokens.formatAdaptations['1:1'];
      const canvas = ResponsiveConstraintEngine.computeCanvasGeometry(
        { aspectRatio: '1:1', width: 1080, height: 1080 },
        formatTokens.safeMargins,
      );

      const grid = ResponsiveConstraintEngine.computeGridGeometry(canvas, formatTokens, 1);

      expect(grid.columns.length).toBe(1);
      expect(grid.heroZone.width).toBe(canvas.usableArea.width);
      expect(grid.contentZone.width).toBe(canvas.usableArea.width);
      expect(grid.contentZone.y).toBeGreaterThan(grid.heroZone.y + grid.heroZone.height);
    });
  });

  describe('3. Product Bounds & Zero-Cropping Invariant', () => {
    it('fits a standard 1:1 product cutout strictly within the hero zone', () => {
      const template = registry.getTemplate('EDITORIAL_SPLIT');
      const formatTokens = template.tokens.formatAdaptations['1:1'];
      const heroZone: LayoutBoundingBox = { x: 65, y: 76, width: 410, height: 916 };

      const fit = ResponsiveConstraintEngine.computeProductBounds(
        { originalWidth: 500, originalHeight: 500 },
        heroZone,
        formatTokens,
      );

      expect(fit.boundingBox.width).toBeLessThanOrEqual(heroZone.width);
      expect(fit.boundingBox.height).toBeLessThanOrEqual(heroZone.height);
      expect(fit.boundingBox.x).toBeGreaterThanOrEqual(heroZone.x);
      expect(fit.boundingBox.y).toBeGreaterThanOrEqual(heroZone.y);
      expect(fit.boundingBox.y + fit.boundingBox.height).toBeLessThanOrEqual(
        heroZone.y + heroZone.height,
      );
      expect(fit.pedestalY).toBeGreaterThan(heroZone.y);
      expect(fit.contactShadowBox.width).toBeGreaterThan(fit.boundingBox.width);
    });

    it('fits extreme tall/narrow perfume bottle (aspect 0.25) without cropping', () => {
      const template = registry.getTemplate('EDITORIAL_SPLIT');
      const formatTokens = template.tokens.formatAdaptations['1:1'];
      const heroZone: LayoutBoundingBox = { x: 65, y: 76, width: 410, height: 916 };

      const fit = ResponsiveConstraintEngine.computeProductBounds(
        { originalWidth: 200, originalHeight: 800 },
        heroZone,
        formatTokens,
      );

      expect(fit.boundingBox.width).toBeLessThanOrEqual(heroZone.width);
      expect(fit.boundingBox.height).toBeLessThanOrEqual(heroZone.height);
      expect(fit.boundingBox.height / fit.boundingBox.width).toBeCloseTo(4.0, 1);
      expect(fit.boundingBox.x).toBeGreaterThanOrEqual(heroZone.x);
      expect(fit.boundingBox.y + fit.boundingBox.height).toBeLessThanOrEqual(
        heroZone.y + heroZone.height,
      );
    });

    it('fits extreme wide cosmetic palette (aspect 4.0) without cropping', () => {
      const template = registry.getTemplate('EDITORIAL_SPLIT');
      const formatTokens = template.tokens.formatAdaptations['1:1'];
      const heroZone: LayoutBoundingBox = { x: 65, y: 76, width: 410, height: 916 };

      const fit = ResponsiveConstraintEngine.computeProductBounds(
        { originalWidth: 800, originalHeight: 200 },
        heroZone,
        formatTokens,
      );

      expect(fit.boundingBox.width).toBeLessThanOrEqual(heroZone.width);
      expect(fit.boundingBox.height).toBeLessThanOrEqual(heroZone.height);
      expect(fit.boundingBox.width / fit.boundingBox.height).toBeCloseTo(4.0, 1);
      expect(fit.boundingBox.x).toBeGreaterThanOrEqual(heroZone.x);
      expect(fit.boundingBox.y + fit.boundingBox.height).toBeLessThanOrEqual(
        heroZone.y + heroZone.height,
      );
    });

    it('fails closed when product dimensions are zero or negative', () => {
      const template = registry.getTemplate('EDITORIAL_SPLIT');
      const formatTokens = template.tokens.formatAdaptations['1:1'];
      const heroZone: LayoutBoundingBox = { x: 65, y: 76, width: 410, height: 916 };

      expect(() =>
        ResponsiveConstraintEngine.computeProductBounds(
          { originalWidth: 0, originalHeight: 500 },
          heroZone,
          formatTokens,
        ),
      ).toThrow(UnsatisfiableLayoutConstraintError);

      expect(() =>
        ResponsiveConstraintEngine.computeProductBounds(
          { originalWidth: 500, originalHeight: -10 },
          heroZone,
          formatTokens,
        ),
      ).toThrow(UnsatisfiableLayoutConstraintError);
    });
  });

  describe('4. Logo Safe Area & Clear Space', () => {
    it('computes logo zone and clear space preserving bounds', () => {
      const template = registry.getTemplate('EDITORIAL_SPLIT');
      const formatTokens = template.tokens.formatAdaptations['1:1'];
      const canvas = ResponsiveConstraintEngine.computeCanvasGeometry(
        { aspectRatio: '1:1', width: 1080, height: 1080 },
        formatTokens.safeMargins,
      );

      const logo = ResponsiveConstraintEngine.computeLogoZone(canvas, formatTokens, {
        brandName: 'Maison Haussmann',
        width: 160,
        height: 50,
      });

      expect(logo).toBeDefined();
      expect(logo!.boundingBox.width).toBeLessThanOrEqual(formatTokens.logoConstraints.maxWidth);
      expect(logo!.boundingBox.height).toBeLessThanOrEqual(formatTokens.logoConstraints.maxHeight);
      expect(logo!.clearArea.width).toBe(
        logo!.boundingBox.width + 2 * formatTokens.logoConstraints.clearSpace,
      );
      expect(logo!.clearArea.height).toBe(
        logo!.boundingBox.height + 2 * formatTokens.logoConstraints.clearSpace,
      );
    });

    it('returns undefined when logo asset reference is absent', () => {
      const template = registry.getTemplate('EDITORIAL_SPLIT');
      const formatTokens = template.tokens.formatAdaptations['1:1'];
      const canvas = ResponsiveConstraintEngine.computeCanvasGeometry(
        { aspectRatio: '1:1', width: 1080, height: 1080 },
        formatTokens.safeMargins,
      );

      const logo = ResponsiveConstraintEngine.computeLogoZone(canvas, formatTokens, undefined);
      expect(logo).toBeUndefined();
    });
  });

  describe('5. Text Reflow & Optional Slot Collapse', () => {
    it('collapses missing optional slots without leaving empty gaps', () => {
      const template = registry.getTemplate('EDITORIAL_SPLIT');
      const contentZone: LayoutBoundingBox = { x: 507, y: 76, width: 508, height: 916 };

      // Case A: Full slots provided
      const fullSlots = ResponsiveConstraintEngine.reflowTextSlots(
        [
          { slotId: 'campaignEyebrow', text: 'SUMMER 2026', required: false, role: 'EYEBROW' },
          { slotId: 'headline', text: 'L’Art de Vivre', required: true, role: 'HEADLINE' },
          {
            slotId: 'secondaryHeadline',
            text: 'Parisian Elegance',
            required: false,
            role: 'SECONDARY_HEADLINE',
          },
          { slotId: 'callToAction', text: 'DISCOVER', required: true, role: 'CTA' },
        ],
        contentZone,
        template.tokens,
        '1:1',
        'TOP',
      );
      expect(fullSlots.filter((s) => s.visible).length).toBe(4);

      // Case B: Optional slots missing
      const collapsedSlots = ResponsiveConstraintEngine.reflowTextSlots(
        [
          { slotId: 'campaignEyebrow', text: undefined, required: false, role: 'EYEBROW' },
          { slotId: 'headline', text: 'L’Art de Vivre', required: true, role: 'HEADLINE' },
          {
            slotId: 'secondaryHeadline',
            text: undefined,
            required: false,
            role: 'SECONDARY_HEADLINE',
          },
          { slotId: 'callToAction', text: 'DISCOVER', required: true, role: 'CTA' },
        ],
        contentZone,
        template.tokens,
        '1:1',
        'TOP',
      );

      const eyebrowCollapsed = collapsedSlots.find((s) => s.slotId === 'campaignEyebrow');
      expect(eyebrowCollapsed?.visible).toBe(false);
      expect(eyebrowCollapsed?.boundingBox.height).toBe(0);

      const headlineCollapsed = collapsedSlots.find((s) => s.slotId === 'headline');
      expect(headlineCollapsed?.visible).toBe(true);
      // In Case B, headline starts at contentZone.y because eyebrow collapsed
      expect(headlineCollapsed?.boundingBox.y).toBe(contentZone.y);

      const ctaCollapsed = collapsedSlots.find((s) => s.slotId === 'callToAction');
      expect(ctaCollapsed?.visible).toBe(true);
      // CTA in Case B immediately follows headline + spacing, without secondary headline gap
      const headlineB = headlineCollapsed!.boundingBox;
      expect(ctaCollapsed!.boundingBox.y).toBe(
        headlineB.y + headlineB.height + template.tokens.spacing.sm,
      );
    });

    it('throws InvalidPosterSpecError when a required slot is empty or missing', () => {
      const template = registry.getTemplate('EDITORIAL_SPLIT');
      const contentZone: LayoutBoundingBox = { x: 507, y: 76, width: 508, height: 916 };

      expect(() =>
        ResponsiveConstraintEngine.reflowTextSlots(
          [{ slotId: 'headline', text: '', required: true, role: 'HEADLINE' }],
          contentZone,
          template.tokens,
          '1:1',
        ),
      ).toThrow(InvalidPosterSpecError);
    });
  });

  describe('6. Multi-Script Typography Integration (English, Khmer, Bilingual)', () => {
    it('reflows pure English copy with HarfBuzz Latin shaping', () => {
      const template = registry.getTemplate('EDITORIAL_SPLIT');
      const contentZone: LayoutBoundingBox = { x: 507, y: 76, width: 508, height: 916 };

      const slots = ResponsiveConstraintEngine.reflowTextSlots(
        [
          {
            slotId: 'headline',
            text: 'Haussmann Elegance Paris',
            required: true,
            role: 'HEADLINE',
          },
          { slotId: 'primaryPrice', text: '$150', required: true, role: 'PRICE' },
        ],
        contentZone,
        template.tokens,
        '1:1',
      );

      expect(slots[0]!.visible).toBe(true);
      expect(slots[0]!.wrappedText).toBeDefined();
      expect(slots[0]!.boundingBox.width).toBeGreaterThan(0);
    });

    it('reflows pure Khmer copy with HarfBuzz Noto Sans Khmer shaping', () => {
      const template = registry.getTemplate('EDITORIAL_SPLIT');
      const contentZone: LayoutBoundingBox = { x: 507, y: 76, width: 508, height: 916 };

      const slots = ResponsiveConstraintEngine.reflowTextSlots(
        [
          {
            slotId: 'headline',
            text: 'ទឹកអប់បារាំងពិតប្រាកដ លំដាប់អភិជន',
            required: true,
            role: 'HEADLINE',
          },
          { slotId: 'primaryPrice', text: '៛៦០០,០០០', required: true, role: 'PRICE' },
        ],
        contentZone,
        template.tokens,
        '1:1',
      );

      expect(slots[0]!.visible).toBe(true);
      expect(slots[0]!.wrappedText).toBeDefined();
      expect(slots[0]!.boundingBox.width).toBeGreaterThan(0);
    });

    it('reflows bilingual mixed copy with partitioned script runs', () => {
      const template = registry.getTemplate('EDITORIAL_SPLIT');
      const contentZone: LayoutBoundingBox = { x: 507, y: 76, width: 508, height: 916 };

      const slots = ResponsiveConstraintEngine.reflowTextSlots(
        [
          {
            slotId: 'headline',
            text: 'Parfum Paris ពិសេសសម្រាប់រដូវកាលនេះ $135',
            required: true,
            role: 'HEADLINE',
          },
        ],
        contentZone,
        template.tokens,
        '1:1',
      );

      expect(slots[0]!.visible).toBe(true);
      expect(slots[0]!.wrappedText?.lines.length).toBeGreaterThan(0);
    });
  });

  describe('7. Long-Copy Resizing & Graceful Failure', () => {
    it('steps down font size to fit long copy within container budget', () => {
      const template = registry.getTemplate('EDITORIAL_SPLIT');
      const contentZone: LayoutBoundingBox = { x: 507, y: 76, width: 508, height: 916 };

      const normalSlots = ResponsiveConstraintEngine.reflowTextSlots(
        [{ slotId: 'headline', text: 'Short Title', required: true, role: 'HEADLINE' }],
        contentZone,
        template.tokens,
        '1:1',
        'TOP',
      );

      const longSlots = ResponsiveConstraintEngine.reflowTextSlots(
        [
          {
            slotId: 'headline',
            text: 'A Very Long Prestigious Parisian Headline That Spans Multiple Lines Comfortably',
            required: true,
            role: 'HEADLINE',
          },
        ],
        contentZone,
        template.tokens,
        '1:1',
        'TOP',
      );

      expect(longSlots[0]!.wrappedText!.fontSize).toBeLessThanOrEqual(
        normalSlots[0]!.wrappedText!.fontSize,
      );
      expect(longSlots[0]!.wrappedText!.fontSize).toBeGreaterThanOrEqual(18); // minFontSize
    });

    it('fails closed with PosterLayoutOverflowError when copy exceeds container budget even at minFontSize', () => {
      const template = registry.getTemplate('EDITORIAL_SPLIT');
      // Artificially tiny container height
      const tinyContentZone: LayoutBoundingBox = { x: 507, y: 76, width: 200, height: 30 };

      expect(() =>
        ResponsiveConstraintEngine.reflowTextSlots(
          [
            {
              slotId: 'headline',
              text: 'This text is much too long to ever fit in thirty pixels of height',
              required: true,
              role: 'HEADLINE',
            },
          ],
          tinyContentZone,
          template.tokens,
          '1:1',
        ),
      ).toThrow(PosterLayoutOverflowError);
    });
  });

  describe('8. Collision Detection & Minimum Separation', () => {
    it('detects 2D collision between overlapping bounding boxes', () => {
      const boxA: LayoutBoundingBox = { x: 100, y: 100, width: 200, height: 100 };
      const boxB: LayoutBoundingBox = { x: 150, y: 150, width: 200, height: 100 };

      expect(ResponsiveConstraintEngine.checkCollision(boxA, boxB)).toBe(true);
    });

    it('reports no collision when bounding boxes are completely separated', () => {
      const boxA: LayoutBoundingBox = { x: 100, y: 100, width: 100, height: 100 };
      const boxB: LayoutBoundingBox = { x: 300, y: 100, width: 100, height: 100 };

      expect(ResponsiveConstraintEngine.checkCollision(boxA, boxB)).toBe(false);
    });

    it('enforces minimum separation margin', () => {
      const boxA: LayoutBoundingBox = { x: 100, y: 100, width: 100, height: 100 };
      const boxB: LayoutBoundingBox = { x: 205, y: 100, width: 100, height: 100 };

      // Separated by 5px: passes with minSeparation 0, fails with minSeparation 10
      expect(ResponsiveConstraintEngine.checkCollision(boxA, boxB, 0)).toBe(false);
      expect(ResponsiveConstraintEngine.checkCollision(boxA, boxB, 10)).toBe(true);
    });

    it('throws PosterCollisionError when elements collide', () => {
      const collidingElements: readonly ResolvedLayoutElement[] = [
        {
          id: 'headline',
          type: 'TEXT',
          zIndex: LAYOUT_Z_TIERS.TYPOGRAPHY,
          boundingBox: { x: 100, y: 100, width: 200, height: 50 },
        },
        {
          id: 'product',
          type: 'PRODUCT',
          zIndex: LAYOUT_Z_TIERS.PRODUCT_HERO,
          boundingBox: { x: 150, y: 120, width: 200, height: 200 },
        },
      ];

      expect(() => ResponsiveConstraintEngine.assertNoCollisions(collidingElements, 0)).toThrow(
        PosterCollisionError,
      );
    });
  });

  describe('9. Safe-Area Containment', () => {
    const safeArea: LayoutBoundingBox = { x: 65, y: 76, width: 950, height: 916 };

    it('passes when elements are completely inside safe area', () => {
      const containedElements: readonly ResolvedLayoutElement[] = [
        {
          id: 'headline',
          type: 'TEXT',
          zIndex: LAYOUT_Z_TIERS.TYPOGRAPHY,
          boundingBox: { x: 100, y: 100, width: 400, height: 60 },
        },
      ];

      expect(() =>
        ResponsiveConstraintEngine.assertSafeAreaContainment(containedElements, safeArea),
      ).not.toThrow();
    });

    it('throws PosterLayoutOverflowError when an element extends beyond safe margins', () => {
      const overflowingElements: readonly ResolvedLayoutElement[] = [
        {
          id: 'headline',
          type: 'TEXT',
          zIndex: LAYOUT_Z_TIERS.TYPOGRAPHY,
          boundingBox: { x: 10, y: 100, width: 400, height: 60 },
        },
      ];

      expect(() =>
        ResponsiveConstraintEngine.assertSafeAreaContainment(overflowingElements, safeArea),
      ).toThrow(PosterLayoutOverflowError);
    });
  });

  describe('10. Negative Space Audit', () => {
    it('audits negative space compliance against token minimum ratio', () => {
      const template = registry.getTemplate('EDITORIAL_SPLIT');
      const formatTokens = template.tokens.formatAdaptations['1:1'];
      const canvas = ResponsiveConstraintEngine.computeCanvasGeometry(
        { aspectRatio: '1:1', width: 1080, height: 1080 },
        formatTokens.safeMargins,
      );

      const elements: readonly ResolvedLayoutElement[] = [
        {
          id: 'product',
          type: 'PRODUCT',
          zIndex: LAYOUT_Z_TIERS.PRODUCT_HERO,
          boundingBox: { x: 100, y: 100, width: 300, height: 400 },
        },
        {
          id: 'headline',
          type: 'TEXT',
          zIndex: LAYOUT_Z_TIERS.TYPOGRAPHY,
          boundingBox: { x: 500, y: 100, width: 300, height: 80 },
        },
      ];

      const audit = ResponsiveConstraintEngine.auditNegativeSpace(
        canvas,
        elements,
        formatTokens.negativeSpace.reservedNegativeSpacePercent,
      );

      expect(audit.compliant).toBe(true);
      expect(audit.negativeSpaceRatio).toBeGreaterThan(0.2);
    });
  });

  describe('11. Complete Layout Solution & Determinism Across All Formats', () => {
    it.each(['1:1', '4:5', '9:16'] as const)(
      'solves full layout for Editorial Split in format %s with zero collision',
      (aspectRatio) => {
        const template = registry.getTemplate('EDITORIAL_SPLIT');
        const spec = createSpec('EDITORIAL_SPLIT', aspectRatio);

        const solution = ResponsiveConstraintEngine.solveLayout(spec, template, {
          originalWidth: 500,
          originalHeight: 600,
        });

        expect(solution.canvas.aspectRatio).toBe(aspectRatio);
        expect(solution.manifest.elements.length).toBeGreaterThan(3);
        expect(solution.negativeSpace.compliant).toBe(true);

        // Assert all elements are in the manifest
        const manifestIds = solution.manifest.elements.map((e) => e.id);
        expect(manifestIds).toContain('product_hero');
        expect(manifestIds).toContain('headline');
        expect(manifestIds).toContain('callToAction');
      },
    );

    it('guarantees bit-exact determinism across repeated executions', () => {
      const template = registry.getTemplate('EDITORIAL_SPLIT');
      const spec = createSpec('EDITORIAL_SPLIT', '1:1');
      const productDimensions = { originalWidth: 500, originalHeight: 600 };

      const run1 = ResponsiveConstraintEngine.solveLayout(spec, template, productDimensions);
      const run2 = ResponsiveConstraintEngine.solveLayout(spec, template, productDimensions);

      const hash1 = createHash('sha256').update(JSON.stringify(run1.manifest)).digest('hex');
      const hash2 = createHash('sha256').update(JSON.stringify(run2.manifest)).digest('hex');

      expect(hash1).toBe(hash2);
      expect(run1.manifest).toEqual(run2.manifest);
    });
  });
});
