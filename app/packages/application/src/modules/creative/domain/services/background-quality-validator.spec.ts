import sharp from 'sharp';
import { describe, expect, it } from '@jest/globals';
import { BackgroundQualityValidator } from './background-quality-validator.js';
import { deriveLayoutIntentForTemplate } from '../layout-intent.js';
import { VisualFindingCode, VisualValidationSeverity } from '../visual-validation.js';

describe('BackgroundQualityValidator', () => {
  const validator = new BackgroundQualityValidator();

  async function createSmoothBackground(width = 1080, height = 1080): Promise<Buffer> {
    const raw = Buffer.alloc(width * height, 20);
    // Subtle pedestal step at 74%
    const baselineY = Math.round(0.74 * height);
    for (let y = baselineY; y < height; y++) {
      for (let x = 0; x < width; x++) {
        raw[y * width + x] = 40;
      }
    }
    return sharp(raw, { raw: { width, height, channels: 1 } })
      .png()
      .toBuffer();
  }

  async function createClutteredReservedZoneBackground(
    width = 1080,
    height = 1080,
  ): Promise<Buffer> {
    const raw = Buffer.alloc(width * height, 20);
    // Heavy high-frequency checkerboard / dot pattern on the right side (reserved zone for EDITORIAL_SPLIT)
    for (let y = 60; y < height - 60; y++) {
      for (let x = 540; x < width - 40; x++) {
        if (x % 8 === 0 || y % 8 === 0) {
          raw[y * width + x] = 230;
        }
      }
    }
    return sharp(raw, { raw: { width, height, channels: 1 } })
      .png()
      .toBuffer();
  }

  async function createBackgroundWithSyntheticProduct(
    width = 1080,
    height = 1080,
  ): Promise<Buffer> {
    const raw = Buffer.alloc(width * height, 20);
    // High-contrast isolated rectangle in hero slot
    for (let y = 280; y < 650; y++) {
      for (let x = 440; x < 640; x++) {
        raw[y * width + x] = 245;
      }
    }
    return sharp(raw, { raw: { width, height, channels: 1 } })
      .png()
      .toBuffer();
  }

  it('validates a clean, smooth background successfully with semantic human review warning', async () => {
    const buffer = await createSmoothBackground(1080, 1080);
    const layoutIntent = deriveLayoutIntentForTemplate('EDITORIAL_SPLIT', 1080, 1080);

    const result = await validator.validateBackground({
      backgroundBuffer: buffer,
      expectedWidth: 1080,
      expectedHeight: 1080,
      expectedAspectRatio: '1:1',
      layoutIntent,
    });

    // Zero blocking issues
    expect(result.blockingCount).toBe(0);
    // Crucial requirement: status is PASSED_WITH_WARNINGS due to HUMAN_REVIEW_REQUIRED
    expect(result.status).toBe('PASSED_WITH_WARNINGS');

    const semanticFinding = result.findings.find(
      (f) => f.code === VisualFindingCode.HUMAN_REVIEW_REQUIRED,
    );
    expect(semanticFinding).toBeDefined();
    expect(semanticFinding?.severity).toBe(VisualValidationSeverity.WARNING);
    expect(semanticFinding?.message).toContain('Semantic verification required');

    // Metrics are recorded
    expect(result.metrics.width).toBe(1080);
    expect(result.metrics.height).toBe(1080);
    expect(result.metrics.reservedZoneMeanEdgeDensity).toBeDefined();
  });

  it('fails with DIMENSIONS_INVALID when background dimensions do not match specification', async () => {
    const buffer = await createSmoothBackground(800, 600);

    const result = await validator.validateBackground({
      backgroundBuffer: buffer,
      expectedWidth: 1080,
      expectedHeight: 1080,
      expectedAspectRatio: '1:1',
    });

    expect(result.status).toBe('FAILED');
    expect(result.blockingCount).toBeGreaterThanOrEqual(1);

    const dimFinding = result.findings.find((f) => f.code === VisualFindingCode.DIMENSIONS_INVALID);
    expect(dimFinding).toBeDefined();
    expect(dimFinding?.severity).toBe(VisualValidationSeverity.BLOCKING);
  });

  it('fails with ASPECT_RATIO_MISMATCH when background aspect ratio diverges', async () => {
    const buffer = await createSmoothBackground(1080, 1080);

    const result = await validator.validateBackground({
      backgroundBuffer: buffer,
      expectedWidth: 1080,
      expectedHeight: 1080,
      expectedAspectRatio: '9:16', // Specified 9:16 but actual is 1:1
    });

    expect(result.status).toBe('FAILED');
    const ratioFinding = result.findings.find(
      (f) => f.code === VisualFindingCode.ASPECT_RATIO_MISMATCH,
    );
    expect(ratioFinding).toBeDefined();
  });

  it('detects high edge density in reserved text zone and emits RESERVED_ZONE_CLUTTERED', async () => {
    const buffer = await createClutteredReservedZoneBackground(1080, 1080);
    const layoutIntent = deriveLayoutIntentForTemplate('EDITORIAL_SPLIT', 1080, 1080);

    const result = await validator.validateBackground({
      backgroundBuffer: buffer,
      expectedWidth: 1080,
      expectedHeight: 1080,
      expectedAspectRatio: '1:1',
      layoutIntent,
    });

    const clutteredFinding = result.findings.find(
      (f) => f.code === VisualFindingCode.RESERVED_ZONE_CLUTTERED,
    );
    expect(clutteredFinding).toBeDefined();
    expect(clutteredFinding?.message).toContain(
      'reserved copy zone exceeds maximum allowable threshold',
    );
    expect(result.metrics.reservedZoneMeanEdgeDensity).toBeGreaterThan(32);
  });

  it('detects synthetic product silhouette in hero zone and emits SYNTHETIC_PRODUCT_DETECTED', async () => {
    const buffer = await createBackgroundWithSyntheticProduct(1080, 1080);
    const layoutIntent = deriveLayoutIntentForTemplate('CENTERED_HERO', 1080, 1080);

    const result = await validator.validateBackground({
      backgroundBuffer: buffer,
      expectedWidth: 1080,
      expectedHeight: 1080,
      expectedAspectRatio: '1:1',
      layoutIntent,
    });

    expect(result.status).toBe('FAILED');
    const synthFinding = result.findings.find(
      (f) => f.code === VisualFindingCode.SYNTHETIC_PRODUCT_DETECTED,
    );
    expect(synthFinding).toBeDefined();
    expect(synthFinding?.severity).toBe(VisualValidationSeverity.BLOCKING);
    expect(synthFinding?.message).toContain('isolated high-contrast silhouette was detected');
  });

  it('warns with TEXT_CONTRAST_INSUFFICIENT when text zone natural luminance causes poor contrast', async () => {
    // Solid mid-grey background in text zone (luminance ~0.60)
    const buffer = await sharp({
      create: {
        width: 1080,
        height: 1080,
        channels: 4,
        background: { r: 153, g: 153, b: 153, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const layoutIntent = deriveLayoutIntentForTemplate('EDITORIAL_SPLIT', 1080, 1080);

    const result = await validator.validateBackground({
      backgroundBuffer: buffer,
      expectedWidth: 1080,
      expectedHeight: 1080,
      expectedAspectRatio: '1:1',
      layoutIntent,
    });

    const contrastFinding = result.findings.find(
      (f) => f.code === VisualFindingCode.TEXT_CONTRAST_INSUFFICIENT,
    );
    expect(contrastFinding).toBeDefined();
    expect(contrastFinding?.severity).toBe(VisualValidationSeverity.WARNING);
    expect(contrastFinding?.metadata?.recommendation).toBe('ENABLE_CONTRAST_OVERLAY');
  });
});
