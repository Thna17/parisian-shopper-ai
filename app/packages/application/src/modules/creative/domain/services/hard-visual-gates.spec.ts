import { createHash } from 'node:crypto';
import { describe, expect, it } from '@jest/globals';
import sharp from 'sharp';
import {
  HARD_VISUAL_GATES_VERSION,
  HardGateCode,
  boxesIntersect,
  type HardGateEvaluationInput,
} from './hard-visual-gates.port.js';
import {
  HardVisualGatesEngine,
  calculateContrastRatio,
  calculateRelativeLuminance,
} from './hard-visual-gates.engine.js';
import { KNOWN_PLACEHOLDER_HASHES } from './product-asset-validator.js';

describe('HardVisualGatesEngine', () => {
  const engine = new HardVisualGatesEngine();

  async function createTestPng(
    width = 1080,
    height = 1080,
    backgroundHex = '#121212',
  ): Promise<Buffer> {
    return sharp({
      create: {
        width,
        height,
        channels: 4,
        background: backgroundHex,
      },
    })
      .png()
      .toBuffer();
  }

  async function createProductCutout(
    width = 400,
    height = 600,
    padTop = 20,
    padBottom = 20,
    padLeft = 20,
    padRight = 20,
  ): Promise<Buffer> {
    const innerW = width - padLeft - padRight;
    const innerH = height - padTop - padBottom;
    const innerSvg = `<svg width="${width}" height="${height}">
      <rect x="${padLeft}" y="${padTop}" width="${innerW}" height="${innerH}" fill="#C5A059" rx="30"/>
    </svg>`;
    return sharp(Buffer.from(innerSvg)).png().toBuffer();
  }

  it('1. Clean baseline composite: passes with isPassed: true and 0 failures', async () => {
    const assetBuffer = await createTestPng(1080, 1080, '#121212');
    const expectedSha256 = createHash('sha256').update(assetBuffer).digest('hex');
    const productBuffer = await createProductCutout(400, 600, 20, 20, 20, 20);
    const productSha = createHash('sha256').update(productBuffer).digest('hex');

    const input: HardGateEvaluationInput = {
      assetBuffer,
      expectedSha256,
      aspectRatio: '1:1',
      width: 1080,
      height: 1080,
      productAssetBuffer: productBuffer,
      productSha256: productSha,
      heroBoundingBox: { x: 340, y: 240, width: 400, height: 600 },
      ctaBoundingBox: { x: 440, y: 920, width: 200, height: 50 },
      typographyBlocks: [
        {
          role: 'headline',
          text: 'BLEU DE CHANEL',
          box: { x: 100, y: 100, width: 880, height: 60 },
          textColor: '#FFFFFF',
        },
        {
          role: 'price',
          text: '$195',
          box: { x: 440, y: 180, width: 200, height: 40 },
          textColor: '#FFFFFF',
        },
      ],
    };

    const outcome = await engine.evaluate(input);

    expect(outcome.isPassed).toBe(true);
    expect(outcome.validatorVersion).toBe(HARD_VISUAL_GATES_VERSION);
    expect(outcome.failures).toHaveLength(0);
    expect(outcome.metrics.byteSize).toBe(assetBuffer.length);
    expect(outcome.metrics.actualSha256).toBe(expectedSha256);
    expect(outcome.metrics.actualWidth).toBe(1080);
    expect(outcome.metrics.actualHeight).toBe(1080);
    expect(outcome.metrics.productVisibleRatio).toBeGreaterThanOrEqual(0.08);
    expect(outcome.metrics.minTextContrastRatio).toBeGreaterThanOrEqual(4.5);
  });

  it('2. CAS hash mismatch: triggers GATE_CAS_HASH_MISMATCH', async () => {
    const assetBuffer = await createTestPng(1080, 1080);
    const fraudulentHash = '0000000000000000000000000000000000000000000000000000000000000000';

    const outcome = await engine.evaluate({
      assetBuffer,
      expectedSha256: fraudulentHash,
      aspectRatio: '1:1',
      width: 1080,
      height: 1080,
    });

    expect(outcome.isPassed).toBe(false);
    expect(outcome.failures.some((f) => f.code === HardGateCode.GATE_CAS_HASH_MISMATCH)).toBe(true);
    const failure = outcome.failures.find((f) => f.code === HardGateCode.GATE_CAS_HASH_MISMATCH);
    expect(failure?.field).toBe('assetBuffer');
    expect(failure?.remediationAction).toContain('CAS');
  });

  it('3. File size exceeded: triggers GATE_FILE_SIZE_EXCEEDED', async () => {
    const assetBuffer = await createTestPng(1080, 1080);
    const sha = createHash('sha256').update(assetBuffer).digest('hex');

    const outcome = await engine.evaluate({
      assetBuffer,
      expectedSha256: sha,
      aspectRatio: '1:1',
      width: 1080,
      height: 1080,
      maxFileSizeBytes: 100, // artificially tiny threshold
    });

    expect(outcome.isPassed).toBe(false);
    expect(outcome.failures.some((f) => f.code === HardGateCode.GATE_FILE_SIZE_EXCEEDED)).toBe(
      true,
    );
    const failure = outcome.failures.find((f) => f.code === HardGateCode.GATE_FILE_SIZE_EXCEEDED);
    expect(failure?.field).toBe('byteSize');
  });

  it('4. Dimensions mismatch: triggers GATE_DIMENSIONS_MISMATCH', async () => {
    const assetBuffer = await createTestPng(1080, 1080);
    const sha = createHash('sha256').update(assetBuffer).digest('hex');

    const outcome = await engine.evaluate({
      assetBuffer,
      expectedSha256: sha,
      aspectRatio: '4:5',
      width: 1080,
      height: 1350, // Expected 1350, actual 1080
    });

    expect(outcome.isPassed).toBe(false);
    expect(outcome.failures.some((f) => f.code === HardGateCode.GATE_DIMENSIONS_MISMATCH)).toBe(
      true,
    );
    const failure = outcome.failures.find((f) => f.code === HardGateCode.GATE_DIMENSIONS_MISMATCH);
    expect(failure?.field).toBe('dimensions');
  });

  it('5. Known placeholder rejected: triggers GATE_PLACEHOLDER_REJECTED', async () => {
    const assetBuffer = await createTestPng(1080, 1080);
    const sha = createHash('sha256').update(assetBuffer).digest('hex');
    const knownPlaceholderHash = Array.from(KNOWN_PLACEHOLDER_HASHES)[0]!;

    const outcome = await engine.evaluate({
      assetBuffer,
      expectedSha256: sha,
      aspectRatio: '1:1',
      width: 1080,
      height: 1080,
      productSha256: knownPlaceholderHash,
    });

    expect(outcome.isPassed).toBe(false);
    expect(outcome.failures.some((f) => f.code === HardGateCode.GATE_PLACEHOLDER_REJECTED)).toBe(
      true,
    );
    const failure = outcome.failures.find((f) => f.code === HardGateCode.GATE_PLACEHOLDER_REJECTED);
    expect(failure?.field).toBe('productSha256');
  });

  it('6. Alpha edge clipping: product placed with nozzle touching y=0 triggers GATE_PRODUCT_ALPHA_CLIPPED', async () => {
    const assetBuffer = await createTestPng(1080, 1080);
    const sha = createHash('sha256').update(assetBuffer).digest('hex');
    // padTop = 0 creates opaque pixels on top row
    const clippedProduct = await createProductCutout(400, 600, 0, 20, 20, 20);

    const outcome = await engine.evaluate({
      assetBuffer,
      expectedSha256: sha,
      aspectRatio: '1:1',
      width: 1080,
      height: 1080,
      productAssetBuffer: clippedProduct,
      heroBoundingBox: { x: 340, y: 0, width: 400, height: 600 }, // touches top canvas border y=0
    });

    expect(outcome.isPassed).toBe(false);
    expect(outcome.failures.some((f) => f.code === HardGateCode.GATE_PRODUCT_ALPHA_CLIPPED)).toBe(
      true,
    );
    const failure = outcome.failures.find(
      (f) => f.code === HardGateCode.GATE_PRODUCT_ALPHA_CLIPPED,
    );
    expect(failure?.field).toBe('heroBoundingBox');
    expect(failure?.message).toContain('clipped');
  });

  it('7. Safe margin violation: headline at x=10 penetrates 54px safe zone triggers GATE_SAFE_MARGIN_VIOLATION', async () => {
    const assetBuffer = await createTestPng(1080, 1080);
    const sha = createHash('sha256').update(assetBuffer).digest('hex');

    const outcome = await engine.evaluate({
      assetBuffer,
      expectedSha256: sha,
      aspectRatio: '1:1',
      width: 1080,
      height: 1080,
      typographyBlocks: [
        {
          role: 'headline',
          text: 'FRENCH LUXURY PERFUME',
          box: { x: 10, y: 100, width: 400, height: 50 }, // x=10 < 54px (5% safe margin)
        },
      ],
    });

    expect(outcome.isPassed).toBe(false);
    expect(outcome.failures.some((f) => f.code === HardGateCode.GATE_SAFE_MARGIN_VIOLATION)).toBe(
      true,
    );
    const failure = outcome.failures.find(
      (f) => f.code === HardGateCode.GATE_SAFE_MARGIN_VIOLATION,
    );
    expect(failure?.field).toBe('typographyBlocks[headline]');
  });

  it('8. CTA-Hero collision: overlapping bounding boxes trigger GATE_CTA_HERO_COLLISION', async () => {
    const assetBuffer = await createTestPng(1080, 1080);
    const sha = createHash('sha256').update(assetBuffer).digest('hex');

    const outcome = await engine.evaluate({
      assetBuffer,
      expectedSha256: sha,
      aspectRatio: '1:1',
      width: 1080,
      height: 1080,
      heroBoundingBox: { x: 300, y: 300, width: 480, height: 600 },
      ctaBoundingBox: { x: 400, y: 700, width: 280, height: 60 }, // overlaps hero area
    });

    expect(outcome.isPassed).toBe(false);
    expect(outcome.failures.some((f) => f.code === HardGateCode.GATE_CTA_HERO_COLLISION)).toBe(
      true,
    );
    const failure = outcome.failures.find((f) => f.code === HardGateCode.GATE_CTA_HERO_COLLISION);
    expect(failure?.field).toBe('ctaBoundingBox');
  });

  it('9. Low text contrast: white text on cream background (#F8F6F0) triggers GATE_TEXT_CONTRAST_LOW', async () => {
    // Cream background with high luminance
    const creamBuffer = await createTestPng(1080, 1080, '#F8F6F0');
    const sha = createHash('sha256').update(creamBuffer).digest('hex');

    const outcome = await engine.evaluate({
      assetBuffer: creamBuffer,
      expectedSha256: sha,
      aspectRatio: '1:1',
      width: 1080,
      height: 1080,
      typographyBlocks: [
        {
          role: 'headline',
          text: 'WHITE TEXT ON CREAM BACKGROUND',
          box: { x: 100, y: 100, width: 800, height: 60 },
          textColor: '#FFFFFF', // Contrast ratio will be ~1.08:1, well below 3.0:1
        },
      ],
    });

    expect(outcome.isPassed).toBe(false);
    expect(outcome.failures.some((f) => f.code === HardGateCode.GATE_TEXT_CONTRAST_LOW)).toBe(true);
    const failure = outcome.failures.find((f) => f.code === HardGateCode.GATE_TEXT_CONTRAST_LOW);
    expect(failure?.field).toBe('typographyBlocks[headline]');
    expect(failure?.message).toContain('Text contrast ratio');
  });

  it('10. Unsafe Unicode: headline with bidi override \\u202E triggers GATE_UNSAFE_UNICODE', async () => {
    const assetBuffer = await createTestPng(1080, 1080);
    const sha = createHash('sha256').update(assetBuffer).digest('hex');

    const outcome = await engine.evaluate({
      assetBuffer,
      expectedSha256: sha,
      aspectRatio: '1:1',
      width: 1080,
      height: 1080,
      typographyBlocks: [
        {
          role: 'headline',
          text: 'LUXURY \u202E PROMO', // Right-to-Left Override
          box: { x: 100, y: 100, width: 400, height: 50 },
        },
      ],
    });

    expect(outcome.isPassed).toBe(false);
    expect(outcome.failures.some((f) => f.code === HardGateCode.GATE_UNSAFE_UNICODE)).toBe(true);
    const failure = outcome.failures.find((f) => f.code === HardGateCode.GATE_UNSAFE_UNICODE);
    expect(failure?.field).toBe('typographyBlocks[headline]');
  });

  it('11. Missing glyphs: text with unmapped Private Use Area or .notdef triggers GATE_MISSING_GLYPHS', async () => {
    const assetBuffer = await createTestPng(1080, 1080);
    const sha = createHash('sha256').update(assetBuffer).digest('hex');

    const outcome = await engine.evaluate({
      assetBuffer,
      expectedSha256: sha,
      aspectRatio: '1:1',
      width: 1080,
      height: 1080,
      typographyBlocks: [
        {
          role: 'headline',
          text: 'PRICE \uE001 SPECIAL', // PUA unmapped glyph
          box: { x: 100, y: 100, width: 400, height: 50 },
        },
      ],
    });

    expect(outcome.isPassed).toBe(false);
    expect(outcome.failures.some((f) => f.code === HardGateCode.GATE_MISSING_GLYPHS)).toBe(true);
  });

  it('12. Product visibility low: tiny flacon (<8% canvas) triggers GATE_PRODUCT_VISIBILITY_LOW', async () => {
    const assetBuffer = await createTestPng(1080, 1080);
    const sha = createHash('sha256').update(assetBuffer).digest('hex');
    const tinyBuffer = await createProductCutout(60, 60);

    const outcome = await engine.evaluate({
      assetBuffer,
      expectedSha256: sha,
      aspectRatio: '1:1',
      width: 1080,
      height: 1080,
      productAssetBuffer: tinyBuffer,
      heroBoundingBox: { x: 510, y: 510, width: 60, height: 60 }, // Area: 3600 / 1166400 = 0.3% (< 8%)
    });

    expect(outcome.isPassed).toBe(false);
    expect(outcome.failures.some((f) => f.code === HardGateCode.GATE_PRODUCT_VISIBILITY_LOW)).toBe(
      true,
    );
    const failure = outcome.failures.find(
      (f) => f.code === HardGateCode.GATE_PRODUCT_VISIBILITY_LOW,
    );
    expect(failure?.field).toBe('productAssetBuffer');
  });

  it('13. Container invalid: corrupted image buffer triggers GATE_CONTAINER_INVALID', async () => {
    const corruptBuffer = Buffer.from('NOT_A_VALID_PNG_FILE_HEADER');
    const sha = createHash('sha256').update(corruptBuffer).digest('hex');

    const outcome = await engine.evaluate({
      assetBuffer: corruptBuffer,
      expectedSha256: sha,
      aspectRatio: '1:1',
      width: 1080,
      height: 1080,
    });

    expect(outcome.isPassed).toBe(false);
    expect(outcome.failures.some((f) => f.code === HardGateCode.GATE_CONTAINER_INVALID)).toBe(true);
  });

  it('14. boxesIntersect correctly detects intersection and disjoint boxes', () => {
    const boxA = { x: 100, y: 100, width: 200, height: 200 };
    const boxB = { x: 250, y: 250, width: 200, height: 200 };
    const boxDisjoint = { x: 400, y: 400, width: 100, height: 100 };

    expect(boxesIntersect(boxA, boxB)).toBe(true);
    expect(boxesIntersect(boxA, boxDisjoint)).toBe(false);
    expect(boxesIntersect(boxA, boxB, 60)).toBe(false); // with tolerance
  });

  it('15. calculateRelativeLuminance and calculateContrastRatio follow W3C WCAG formula', () => {
    const blackLum = calculateRelativeLuminance(0, 0, 0);
    const whiteLum = calculateRelativeLuminance(255, 255, 255);

    expect(blackLum).toBeCloseTo(0, 3);
    expect(whiteLum).toBeCloseTo(1, 3);

    const contrastRatio = calculateContrastRatio(whiteLum, blackLum);
    expect(contrastRatio).toBeCloseTo(21.0, 1);
  });
});
