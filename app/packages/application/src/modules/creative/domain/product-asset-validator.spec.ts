import { createHash } from 'node:crypto';
import { describe, expect, it } from '@jest/globals';
import {
  AssetDigestMismatchError,
  CanonicalProductOpaqueError,
  KnownPlaceholderRejectedError,
  ProductAssetValidationError,
} from './creative-errors.js';
import {
  KNOWN_PLACEHOLDER_HASHES,
  ProductAssetValidator,
} from './services/product-asset-validator.js';
import {
  generateOpaqueProductPng,
  generateTransparentProductPng_TEST_ONLY,
} from '../infrastructure/fixtures/fake-product-fixtures.js';

describe('ProductAssetValidator', () => {
  const validator = new ProductAssetValidator();

  const validProductBuffer = generateTransparentProductPng_TEST_ONLY({
    width: 500,
    height: 500,
    productWidth: 250,
    productHeight: 350,
    productColor: { r: 50, g: 100, b: 150, a: 255 },
  });
  const validProductSha = createHash('sha256').update(validProductBuffer).digest('hex');

  it('validates a correct SKU asset with valid alpha transparency', async () => {
    const result = await validator.assertValid({
      assetBuffer: validProductBuffer,
      expectedSku: 'GEP-KING-EDP-100',
      expectedSha256: validProductSha,
    });

    expect(result.isValid).toBe(true);
    expect(result.actualSha256).toBe(validProductSha);
    expect(result.hasAlpha).toBe(true);
    expect(result.visibleRatio).toBeGreaterThan(0.05);
    expect(result.visibleRatio).toBeLessThan(0.98);
    expect(result.trimmedBounds.width).toBeGreaterThan(0);
    expect(result.trimmedBounds.height).toBeGreaterThan(0);
    expect(result.findings).toHaveLength(0);
  });

  it('successfully trims and measures transparent padding around the product', async () => {
    const result = await validator.assertValid({
      assetBuffer: validProductBuffer,
      expectedSku: 'GEP-KING-EDP-100',
    });

    expect(result.trimmedBounds.left).toBeGreaterThanOrEqual(0);
    expect(result.trimmedBounds.top).toBeGreaterThanOrEqual(0);
    expect(result.trimmedBounds.rightPadding).toBeGreaterThanOrEqual(0);
    expect(result.trimmedBounds.bottomPadding).toBeGreaterThanOrEqual(0);
    expect(result.trimmedBuffer.length).toBeGreaterThan(0);
    expect(result.trimmedBounds.width).toBeLessThanOrEqual(500);
    expect(result.trimmedBounds.height).toBeLessThanOrEqual(500);
  });

  it('rejects an opaque product image without alpha channel', async () => {
    const opaqueBuffer = generateOpaqueProductPng(400, 400);

    await expect(
      validator.assertValid({
        assetBuffer: opaqueBuffer,
        expectedSku: 'GEP-KING-EDP-100',
      }),
    ).rejects.toThrow(CanonicalProductOpaqueError);

    await expect(
      validator.assertValid({
        assetBuffer: opaqueBuffer,
        expectedSku: 'GEP-KING-EDP-100',
      }),
    ).rejects.toThrow(
      'Canonical product image has an opaque background. Please supply a transparent PNG.',
    );
  });

  it('rejects an image with alpha channel but no transparent pixels (solid opaque)', async () => {
    // 100% covered, 0 transparent pixels
    const solidAlphaBuffer = generateTransparentProductPng_TEST_ONLY({
      width: 400,
      height: 400,
      productWidth: 400,
      productHeight: 400,
      productColor: { r: 80, g: 80, b: 80, a: 255 },
    });

    await expect(
      validator.assertValid({
        assetBuffer: solidAlphaBuffer,
        expectedSku: 'GEP-KING-EDP-100',
      }),
    ).rejects.toThrow(CanonicalProductOpaqueError);
  });

  it('rejects hash mismatch against expected snapshot digest', async () => {
    const wrongSha = 'f'.repeat(64);

    await expect(
      validator.assertValid({
        assetBuffer: validProductBuffer,
        expectedSku: 'GEP-KING-EDP-100',
        expectedSha256: wrongSha,
      }),
    ).rejects.toThrow(AssetDigestMismatchError);
  });

  it('rejects known placeholder images by SHA-256 hash', async () => {
    // Generate the known legacy gold box placeholder
    const goldPlaceholder = generateTransparentProductPng_TEST_ONLY({
      width: 600,
      height: 600,
      productWidth: 280,
      productHeight: 440,
      productColor: { r: 190, g: 145, b: 65, a: 255 },
    });
    const goldSha = createHash('sha256').update(goldPlaceholder).digest('hex');
    expect(KNOWN_PLACEHOLDER_HASHES.has(goldSha)).toBe(true);

    await expect(
      validator.assertValid({
        assetBuffer: goldPlaceholder,
        expectedSku: 'GEP-KING-EDP-100',
      }),
    ).rejects.toThrow(KnownPlaceholderRejectedError);
  });

  it('rejects product occupying less than minimum visible threshold (too small)', async () => {
    // Tiny product: 20x20 in 800x800 canvas (0.06% of canvas)
    const tinyProduct = generateTransparentProductPng_TEST_ONLY({
      width: 800,
      height: 800,
      productWidth: 20,
      productHeight: 20,
    });

    await expect(
      validator.assertValid({
        assetBuffer: tinyProduct,
        expectedSku: 'GEP-KING-EDP-100',
      }),
    ).rejects.toThrow(ProductAssetValidationError);
  });

  it('rejects empty buffer', async () => {
    await expect(
      validator.assertValid({
        assetBuffer: Buffer.alloc(0),
        expectedSku: 'GEP-KING-EDP-100',
      }),
    ).rejects.toThrow(ProductAssetValidationError);
  });
});
