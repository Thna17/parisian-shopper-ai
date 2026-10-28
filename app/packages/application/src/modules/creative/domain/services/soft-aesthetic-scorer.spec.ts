import { describe, expect, it } from '@jest/globals';
import sharp from 'sharp';
import {
  AestheticDimension,
  SOFT_AESTHETIC_SCORER_VERSION,
  type AestheticEvaluationInput,
} from './soft-aesthetic-scorer.port.js';
import { SoftAestheticScorer } from './soft-aesthetic-scorer.engine.js';

describe('SoftAestheticScorer', () => {
  const scorer = new SoftAestheticScorer();

  async function createTestImage(width = 1080, height = 1080, color = '#121212'): Promise<Buffer> {
    return sharp({
      create: {
        width,
        height,
        channels: 4,
        background: color,
      },
    })
      .png()
      .toBuffer();
  }

  it('1. Exemplary Editorial Composition: scores >= 0.85 (EXCELLENT / EXEMPLARY)', async () => {
    const assetBuffer = await createTestImage(1080, 1080, '#161616');

    const input: AestheticEvaluationInput = {
      assetBuffer,
      aspectRatio: '1:1',
      width: 1080,
      height: 1080,
      heroBoundingBox: { x: 315, y: 220, width: 450, height: 650 }, // Bottom: 870px (80.5% height)
      typographyBlocks: [
        {
          role: 'headline',
          text: 'BLEU DE CHANEL',
          box: { x: 200, y: 80, width: 680, height: 60 },
          fontSize: 48,
        },
        {
          role: 'subhead',
          text: 'EAU DE PARFUM SPRAY',
          box: { x: 290, y: 150, width: 500, height: 38 },
          fontSize: 30, // Golden ratio: 48 / 30 = 1.60x
        },
        {
          role: 'price',
          text: '$195.00',
          box: { x: 420, y: 198, width: 240, height: 35 },
          fontSize: 24,
        },
        {
          role: 'cta',
          text: 'SHOP NOW',
          box: { x: 420, y: 910, width: 240, height: 50 },
          fontSize: 16,
        },
      ],
      shadowTokens: {
        blurRadius: 10,
        opacity: 0.25,
      },
      paletteTokens: {
        accentColor: '#D4AF37', // Haussmann Gold
        backgroundTone: '#161616',
      },
    };

    const outcome = await scorer.scoreComposition(input);

    expect(outcome.scorerVersion).toBe(SOFT_AESTHETIC_SCORER_VERSION);
    expect(outcome.overallScore).toBeGreaterThanOrEqual(0.85);
    expect(outcome.grade === 'EXCELLENT' || outcome.grade === 'EXEMPLARY').toBe(true);
    expect(outcome.dimensions[AestheticDimension.VISUAL_HIERARCHY].score).toBeGreaterThanOrEqual(
      0.85,
    );
    expect(outcome.dimensions[AestheticDimension.WHITESPACE_BALANCE].score).toBeGreaterThanOrEqual(
      0.85,
    );
    expect(
      outcome.dimensions[AestheticDimension.COLOR_LIGHTING_HARMONY].score,
    ).toBeGreaterThanOrEqual(0.85);
    expect(outcome.dimensions[AestheticDimension.TYPOGRAPHIC_RHYTHM].score).toBeGreaterThanOrEqual(
      0.85,
    );
    expect(outcome.dimensions[AestheticDimension.BRAND_LUXURY_POLISH].score).toBeGreaterThanOrEqual(
      0.85,
    );
  });

  it('2. Visual Hierarchy Degradation: tiny flacon overwhelmed by giant typography scores < 0.70', async () => {
    const input: AestheticEvaluationInput = {
      aspectRatio: '1:1',
      width: 1080,
      height: 1080,
      heroBoundingBox: { x: 490, y: 490, width: 100, height: 150 }, // Area: 15,000 (1.3% of canvas)
      typographyBlocks: [
        {
          role: 'headline',
          text: 'MASSIVE HEADLINE OVERWHELMING PRODUCT',
          box: { x: 54, y: 100, width: 972, height: 280 }, // Area: 272,160
          fontSize: 90,
        },
      ],
    };

    const outcome = await scorer.scoreComposition(input);

    const hierarchy = outcome.dimensions[AestheticDimension.VISUAL_HIERARCHY];
    expect(hierarchy.score).toBeLessThan(0.7);
    expect(hierarchy.feedback.some((f) => f.includes('under-scaled'))).toBe(true);
    expect(outcome.recommendations.some((r) => r.includes('Scale up'))).toBe(true);
  });

  it('3. Whitespace Clutter: crowded poster with 80% occupied canvas scores < 0.60 on whitespace', async () => {
    // Canvas area: 1080 * 1080 = 1,166,400
    // Occupied area: 950,000 (81.4% occupied, negative space 18.6% < 35%)
    const input: AestheticEvaluationInput = {
      aspectRatio: '1:1',
      width: 1080,
      height: 1080,
      heroBoundingBox: { x: 100, y: 200, width: 880, height: 700 }, // Area: 616,000
      typographyBlocks: [
        {
          role: 'headline',
          text: 'VERY BIG HEADLINE',
          box: { x: 50, y: 50, width: 980, height: 350 }, // Area: 343,000
        },
      ],
    };

    const outcome = await scorer.scoreComposition(input);

    const whitespace = outcome.dimensions[AestheticDimension.WHITESPACE_BALANCE];
    expect(whitespace.score).toBeLessThan(0.6);
    expect(whitespace.feedback.some((f) => f.includes('Crowded poster'))).toBe(true);
    expect(outcome.recommendations.some((r) => r.includes('breathing room'))).toBe(true);
  });

  it('4. Harsh Shadow & Palette Drift: 0px blur shadow and neon green color scores < 0.60 on color harmony', async () => {
    const input: AestheticEvaluationInput = {
      aspectRatio: '1:1',
      width: 1080,
      height: 1080,
      heroBoundingBox: { x: 340, y: 240, width: 400, height: 600 },
      shadowTokens: {
        blurRadius: 0, // Harsh un-blurred shadow
        opacity: 0.6,
      },
      paletteTokens: {
        accentColor: '#00FF00', // Non-luxury neon green
      },
    };

    const outcome = await scorer.scoreComposition(input);

    const colorHarmony = outcome.dimensions[AestheticDimension.COLOR_LIGHTING_HARMONY];
    expect(colorHarmony.score).toBeLessThan(0.6);
    expect(colorHarmony.feedback.some((f) => f.includes('Harsh contact shadow'))).toBe(true);
    expect(colorHarmony.feedback.some((f) => f.includes('diverges from approved luxury'))).toBe(
      true,
    );
    expect(outcome.recommendations.some((r) => r.includes('Gaussian blur'))).toBe(true);
  });

  it('5. Typographic Baseline Inconsistency: wild vertical spacing gaps penalizes typographic rhythm', async () => {
    const input: AestheticEvaluationInput = {
      aspectRatio: '1:1',
      width: 1080,
      height: 1080,
      heroBoundingBox: { x: 340, y: 240, width: 400, height: 600 },
      typographyBlocks: [
        {
          role: 'headline',
          text: 'HEADLINE',
          box: { x: 100, y: 100, width: 400, height: 50 },
        },
        {
          role: 'subhead',
          text: 'SUBTITLE',
          box: { x: 100, y: 155, width: 400, height: 30 }, // Gap: 5px
        },
        {
          role: 'price',
          text: '$195',
          box: { x: 100, y: 320, width: 200, height: 40 }, // Gap: 135px (27x gap ratio)
        },
      ],
    };

    const outcome = await scorer.scoreComposition(input);

    const rhythm = outcome.dimensions[AestheticDimension.TYPOGRAPHIC_RHYTHM];
    expect(rhythm.score).toBeLessThan(0.8);
    expect(rhythm.feedback.some((f) => f.includes('Irregular vertical leading gaps'))).toBe(true);
    expect(outcome.recommendations.some((r) => r.includes('Equalize vertical line-spacing'))).toBe(
      true,
    );
  });

  it('6. Bilingual Balance: Khmer font scaled to 108% Latin size receives optical parity credit', async () => {
    const input: AestheticEvaluationInput = {
      aspectRatio: '1:1',
      width: 1080,
      height: 1080,
      language: 'bilingual',
      heroBoundingBox: { x: 340, y: 240, width: 400, height: 600 },
      typographyBlocks: [
        {
          role: 'headline',
          text: 'PARFUM DE LUXE',
          box: { x: 100, y: 100, width: 500, height: 50 },
          fontSize: 50,
        },
        {
          role: 'body',
          text: 'ទឹកអប់ប្រណិតប៉ារីស', // Khmer script
          box: { x: 100, y: 160, width: 500, height: 54 },
          fontSize: 54, // 54 / 50 = 1.08x (exactly 108%)
        },
      ],
    };

    const outcome = await scorer.scoreComposition(input);

    const rhythm = outcome.dimensions[AestheticDimension.TYPOGRAPHIC_RHYTHM];
    expect(rhythm.rawMetrics['bilingualScaleRatio']).toBe(1.08);
    expect(rhythm.feedback.some((f) => f.includes('Khmer script optically balanced'))).toBe(true);
  });

  it('7. Non-Blocking Advisory Guarantee: poor aesthetic score returns valid outcome without throwing', async () => {
    // Severely degraded aesthetic parameters
    const input: AestheticEvaluationInput = {
      aspectRatio: '1:1',
      width: 1080,
      height: 1080,
      heroBoundingBox: { x: 50, y: 50, width: 60, height: 60 }, // Tiny floating box
      typographyBlocks: [
        {
          role: 'headline',
          text: 'OVERSIZED',
          box: { x: 0, y: 200, width: 1080, height: 800 },
        },
      ],
      shadowTokens: {
        blurRadius: 0,
        opacity: 0.9,
      },
      paletteTokens: {
        accentColor: '#FF00FF', // Magenta neon
      },
    };

    const outcome = await scorer.scoreComposition(input);

    expect(outcome).toBeDefined();
    expect(outcome.overallScore).toBeLessThan(0.7);
    expect(outcome.grade).toBe('NEEDS_POLISH');
    expect(outcome.recommendations.length).toBeGreaterThan(0);
    // Crucial: No thrown errors, pure advisory outcome
  });
});
