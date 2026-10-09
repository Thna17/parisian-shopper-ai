import { createHash } from 'node:crypto';
import { describe, expect, it } from '@jest/globals';
import sharp from 'sharp';
import { SharpHeroCompositor } from './sharp-hero-compositor.adapter.js';
import { COMPOSITOR_VERSION, PS_COMPOSITOR_VERSION } from '../application/hero-compositor.port.js';
import { getPresetFixture } from './fixtures/fake-background-fixtures.js';
import {
  generateTransparentProductPng,
  generateOpaqueProductPng,
} from './fixtures/fake-product-fixtures.js';
import {
  CreativeAlphaRequiredError,
  CreativeImageDecodeFailedError,
  CreativeInputTooLargeError,
  CreativeInvalidLayoutError,
  CreativePixelLimitExceededError,
  CreativeUnsupportedImageFormatError,
} from '../domain/creative-errors.js';
import { DiskAssetStorageAdapter } from './disk-asset-storage.adapter.js';
import { FakeCreativeProvider } from './fake-creative-provider.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

describe('SharpHeroCompositor (Phase 2A - Deterministic Compositor)', () => {
  const compositor = new SharpHeroCompositor();

  // Standard test fixtures
  const validBackground = getPresetFixture('cream', 1080, 1080);
  const backgroundSha256 = createHash('sha256').update(validBackground).digest('hex');

  // Product fixture: 500x500 canvas, centered 300x300 product of exact color RGB(200, 20, 30)
  const productRgb = { r: 200, g: 20, b: 30 };
  const validProduct = generateTransparentProductPng({
    width: 500,
    height: 500,
    productWidth: 300,
    productHeight: 300,
    productColor: { ...productRgb, a: 255 },
  });
  const productSha256 = createHash('sha256').update(validProduct).digest('hex');

  it('Requirement 33: Basic composition test (transparent product + background = valid composite)', async () => {
    const result = await compositor.composite({
      creativeJobId: 'job-basic-1',
      canonicalProductBuffer: validProduct,
      canonicalProductMimeType: 'image/png',
      canonicalProductSha256: productSha256,
      backgroundBuffer: validBackground,
      backgroundMimeType: 'image/png',
      backgroundSha256: backgroundSha256,
      targetWidth: 1080,
      targetHeight: 1080,
      aspectRatio: '1:1',
    });

    expect(result.mimeType).toBe('image/png');
    expect(result.width).toBe(1080);
    expect(result.height).toBe(1080);
    expect(result.compositorVersion).toBe(COMPOSITOR_VERSION);
    expect(result.productDigest).toBe(productSha256);
    expect(result.backgroundDigest).toBe(backgroundSha256);
    expect(result.heroPlacement).toBe('CENTER');
    expect(result.heroBoundingBox.width).toBeGreaterThan(0);
    expect(result.heroBoundingBox.height).toBeGreaterThan(0);

    const actualSha = createHash('sha256').update(result.compositedBuffer).digest('hex');
    expect(result.sha256).toBe(actualSha);
    expect(result.outputDigest).toBe(actualSha);

    const metadata = await sharp(result.compositedBuffer).metadata();
    expect(metadata.width).toBe(1080);
    expect(metadata.height).toBe(1080);
    expect(metadata.format).toBe('png');
    expect(metadata.space).toBe('srgb');
  });

  it('Requirement 34: Aspect-ratio test (preserves product aspect ratio without stretch)', async () => {
    // 2:1 tall product: 200 width, 400 height
    const tallProduct = generateTransparentProductPng({
      width: 200,
      height: 400,
      productWidth: 160,
      productHeight: 320,
    });
    const tallSha = createHash('sha256').update(tallProduct).digest('hex');

    const result = await compositor.composite({
      creativeJobId: 'job-aspect-1',
      canonicalProductBuffer: tallProduct,
      canonicalProductMimeType: 'image/png',
      canonicalProductSha256: tallSha,
      backgroundBuffer: validBackground,
      backgroundMimeType: 'image/png',
      backgroundSha256: backgroundSha256,
      targetWidth: 1080,
      targetHeight: 1080,
      aspectRatio: '1:1',
    });

    const expectedRatio = 200 / 400; // 0.5
    const actualRatio = result.heroBoundingBox.width / result.heroBoundingBox.height;
    expect(actualRatio).toBeCloseTo(expectedRatio, 2);
  });

  it('Requirement 35: Exact geometry test (deterministic hero bounding box coordinates)', async () => {
    const result = await compositor.composite({
      creativeJobId: 'job-geom-1',
      canonicalProductBuffer: validProduct,
      canonicalProductMimeType: 'image/png',
      canonicalProductSha256: productSha256,
      backgroundBuffer: validBackground,
      backgroundMimeType: 'image/png',
      backgroundSha256: backgroundSha256,
      targetWidth: 1080,
      targetHeight: 1080,
      aspectRatio: '1:1',
    });

    // Default heroHeightRatio is 0.55 -> target height = 1080 * 0.55 = 594
    // Product aspect is 500 / 500 = 1.0 -> target width = 594
    // Center: X = (1080 - 594)/2 = 243, Y = (1080 - 594)/2 = 243
    expect(result.heroBoundingBox).toEqual({
      x: 243,
      y: 243,
      width: 594,
      height: 594,
    });
  });

  it('Requirement 36: Safe margins test (rejects layouts where product exceeds safe bounds)', async () => {
    // Canvas where margin is 40% (safe margin = 432px on each side, usable area = 216px)
    // Default hero ratio is 55% -> 594px which exceeds 216px usable area, scaling down to fit
    // If margin is 50%, usable area is 0px -> CREATIVE_INVALID_LAYOUT
    await expect(
      compositor.composite({
        creativeJobId: 'job-margin-err',
        canonicalProductBuffer: validProduct,
        canonicalProductMimeType: 'image/png',
        canonicalProductSha256: productSha256,
        backgroundBuffer: validBackground,
        backgroundMimeType: 'image/png',
        backgroundSha256: backgroundSha256,
        targetWidth: 1080,
        targetHeight: 1080,
        aspectRatio: '1:1',
        compositionMarginPercent: 0.5, // 50% left + 50% right = 0px usable
      }),
    ).rejects.toThrow(CreativeInvalidLayoutError);
  });

  it('Requirement 37: Product pixel preservation — MANDATORY (verifies opaque interior pixels retain RGB)', async () => {
    const result = await compositor.composite({
      creativeJobId: 'job-pixel-preservation',
      canonicalProductBuffer: validProduct,
      canonicalProductMimeType: 'image/png',
      canonicalProductSha256: productSha256,
      backgroundBuffer: validBackground,
      backgroundMimeType: 'image/png',
      backgroundSha256: backgroundSha256,
      targetWidth: 1080,
      targetHeight: 1080,
      aspectRatio: '1:1',
    });

    // Sample the center pixel of the composited image (1080x1080 -> center is 540, 540)
    // In our fixture, the product is centered and has color R=200, G=20, B=30
    const rawPixels = await sharp(result.compositedBuffer)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const centerIndex = (540 * 1080 + 540) * rawPixels.info.channels;
    const r = rawPixels.data[centerIndex]!;
    const g = rawPixels.data[centerIndex + 1]!;
    const b = rawPixels.data[centerIndex + 2]!;

    // Must match expected product RGB within minor Lanczos resampling tolerance (<= 2)
    expect(Math.abs(r - productRgb.r)).toBeLessThanOrEqual(2);
    expect(Math.abs(g - productRgb.g)).toBeLessThanOrEqual(2);
    expect(Math.abs(b - productRgb.b)).toBeLessThanOrEqual(2);
  });

  it('Requirement 38: Transparency test (transparent product pixels reveal background)', async () => {
    const result = await compositor.composite({
      creativeJobId: 'job-transparency-1',
      canonicalProductBuffer: validProduct,
      canonicalProductMimeType: 'image/png',
      canonicalProductSha256: productSha256,
      backgroundBuffer: validBackground,
      backgroundMimeType: 'image/png',
      backgroundSha256: backgroundSha256,
      targetWidth: 1080,
      targetHeight: 1080,
      aspectRatio: '1:1',
    });

    // Sample top-left corner (50, 50) where product has transparent pixels:
    // It must contain the background pixel (Cream ~248, 246, 240)
    const rawPixels = await sharp(result.compositedBuffer)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const cornerIndex = (50 * 1080 + 50) * rawPixels.info.channels;
    const r = rawPixels.data[cornerIndex]!;
    const g = rawPixels.data[cornerIndex + 1]!;
    const b = rawPixels.data[cornerIndex + 2]!;

    expect(r).toBeGreaterThan(200);
    expect(g).toBeGreaterThan(200);
    expect(b).toBeGreaterThan(200);
  });

  it('Requirement 39: No-alpha test (fails with CREATIVE_ALPHA_REQUIRED for opaque product)', async () => {
    const opaqueProduct = generateOpaqueProductPng(400, 400);
    const opaqueSha = createHash('sha256').update(opaqueProduct).digest('hex');

    await expect(
      compositor.composite({
        creativeJobId: 'job-no-alpha',
        canonicalProductBuffer: opaqueProduct,
        canonicalProductMimeType: 'image/png',
        canonicalProductSha256: opaqueSha,
        backgroundBuffer: validBackground,
        backgroundMimeType: 'image/png',
        backgroundSha256: backgroundSha256,
        targetWidth: 1080,
        targetHeight: 1080,
        aspectRatio: '1:1',
      }),
    ).rejects.toThrow(CreativeAlphaRequiredError);
  });

  it('Requirement 40: Malformed image test (fails safely with typed error without crashing)', async () => {
    const garbageBytes = Buffer.from('NOT_AN_IMAGE_RANDOM_CORRUPTED_BYTES_123456');
    const garbageSha = createHash('sha256').update(garbageBytes).digest('hex');

    // Corrupted product
    await expect(
      compositor.composite({
        creativeJobId: 'job-corrupt-prod',
        canonicalProductBuffer: garbageBytes,
        canonicalProductMimeType: 'image/png',
        canonicalProductSha256: garbageSha,
        backgroundBuffer: validBackground,
        backgroundMimeType: 'image/png',
        backgroundSha256: backgroundSha256,
        targetWidth: 1080,
        targetHeight: 1080,
        aspectRatio: '1:1',
      }),
    ).rejects.toThrow(CreativeImageDecodeFailedError);

    // Corrupted background
    await expect(
      compositor.composite({
        creativeJobId: 'job-corrupt-bg',
        canonicalProductBuffer: validProduct,
        canonicalProductMimeType: 'image/png',
        canonicalProductSha256: productSha256,
        backgroundBuffer: garbageBytes,
        backgroundMimeType: 'image/png',
        backgroundSha256: garbageSha,
        targetWidth: 1080,
        targetHeight: 1080,
        aspectRatio: '1:1',
      }),
    ).rejects.toThrow(CreativeImageDecodeFailedError);
  });

  it('Requirement 41: Pixel-bomb test (rejects oversized decoded dimension/pixels before composition)', async () => {
    // Create an instance with conservative pixel ceiling
    const strictCompositor = new SharpHeroCompositor({
      maxDecodedPixels: 100000, // 100k pixels max
    });

    await expect(
      strictCompositor.composite({
        creativeJobId: 'job-pixel-bomb',
        canonicalProductBuffer: validProduct, // 500x500 = 250k pixels > 100k
        canonicalProductMimeType: 'image/png',
        canonicalProductSha256: productSha256,
        backgroundBuffer: validBackground,
        backgroundMimeType: 'image/png',
        backgroundSha256: backgroundSha256,
        targetWidth: 1080,
        targetHeight: 1080,
        aspectRatio: '1:1',
      }),
    ).rejects.toThrow(CreativePixelLimitExceededError);
  });

  it('Requirement 42: Metadata test (verifies EXIF/GPS/comments metadata are stripped)', async () => {
    // Generate background and attach simulated comment or EXIF
    const inputWithMeta = await sharp(validBackground)
      .withMetadata({
        exif: {
          IFD0: {
            Copyright: 'Sensitive Private Copyright',
          },
        },
      })
      .toBuffer();
    const metaSha = createHash('sha256').update(inputWithMeta).digest('hex');

    const result = await compositor.composite({
      creativeJobId: 'job-meta-strip',
      canonicalProductBuffer: validProduct,
      canonicalProductMimeType: 'image/png',
      canonicalProductSha256: productSha256,
      backgroundBuffer: inputWithMeta,
      backgroundMimeType: 'image/png',
      backgroundSha256: metaSha,
      targetWidth: 1080,
      targetHeight: 1080,
      aspectRatio: '1:1',
    });

    const outMeta = await sharp(result.compositedBuffer).metadata();
    expect(outMeta.exif).toBeUndefined();
    expect(outMeta.xmp).toBeUndefined();
    expect(outMeta.iptc).toBeUndefined();
    expect(outMeta.icc).toBeUndefined();
  });

  it('Requirement 43: Determinism test (identical inputs yield identical SHA-256 digests)', async () => {
    const run1 = await compositor.composite({
      creativeJobId: 'job-det-1',
      canonicalProductBuffer: validProduct,
      canonicalProductMimeType: 'image/png',
      canonicalProductSha256: productSha256,
      backgroundBuffer: validBackground,
      backgroundMimeType: 'image/png',
      backgroundSha256: backgroundSha256,
      targetWidth: 1080,
      targetHeight: 1080,
      aspectRatio: '1:1',
    });

    const run2 = await compositor.composite({
      creativeJobId: 'job-det-2',
      canonicalProductBuffer: validProduct,
      canonicalProductMimeType: 'image/png',
      canonicalProductSha256: productSha256,
      backgroundBuffer: validBackground,
      backgroundMimeType: 'image/png',
      backgroundSha256: backgroundSha256,
      targetWidth: 1080,
      targetHeight: 1080,
      aspectRatio: '1:1',
    });

    expect(run1.sha256).toBe(run2.sha256);
    expect(run1.outputDigest).toBe(run2.outputDigest);
    expect(run1.compositedBuffer.equals(run2.compositedBuffer)).toBe(true);
  });

  it('Requirement 44: Concurrency test (parallel composition calls without state corruption)', async () => {
    const inputs = [
      { id: 'c-1', targetWidth: 1080, targetHeight: 1080, aspectRatio: '1:1' },
      { id: 'c-2', targetWidth: 1080, targetHeight: 1350, aspectRatio: '4:5' },
      { id: 'c-3', targetWidth: 1080, targetHeight: 1920, aspectRatio: '9:16' },
      { id: 'c-4', targetWidth: 1080, targetHeight: 1080, aspectRatio: '1:1' },
    ];

    const results = await Promise.all(
      inputs.map((inp) =>
        compositor.composite({
          creativeJobId: inp.id,
          canonicalProductBuffer: validProduct,
          canonicalProductMimeType: 'image/png',
          canonicalProductSha256: productSha256,
          backgroundBuffer: validBackground,
          backgroundMimeType: 'image/png',
          backgroundSha256: backgroundSha256,
          targetWidth: inp.targetWidth,
          targetHeight: inp.targetHeight,
          aspectRatio: inp.aspectRatio,
        }),
      ),
    );

    expect(results).toHaveLength(4);
    expect(results[0]!.width).toBe(1080);
    expect(results[0]!.height).toBe(1080);
    expect(results[1]!.width).toBe(1080);
    expect(results[1]!.height).toBe(1350);
    expect(results[2]!.width).toBe(1080);
    expect(results[2]!.height).toBe(1920);
    expect(results[3]!.width).toBe(1080);
    expect(results[3]!.height).toBe(1080);
  });

  it('Requirement 45: CAS roundtrip test (FakeCreativeProvider -> CAS -> SharpHeroCompositor -> CAS -> verify)', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cas-roundtrip-test-'));
    try {
      const storage = new DiskAssetStorageAdapter({ storageRoot: tempDir });
      const provider = new FakeCreativeProvider({ isProduction: false });

      // Step 1: Generate background via FakeCreativeProvider
      const bgAsset = await provider.generateBackground({
        creativeJobId: 'job-cas-1',
        contentVersionId: 'cv-cas-1',
        briefText: 'Luxury ambient background',
        stylePrompt: 'Parisian Luxury Atelier',
        targetWidth: 1080,
        targetHeight: 1080,
        aspectRatio: '1:1',
        creativeProfile: 'PARISIAN_LUXURY_ATELIER',
      });

      // Save background to CAS
      const bgMeta = await storage.saveAsset({
        buffer: bgAsset.imageBuffer,
        mimeType: bgAsset.mimeType,
        assetRole: 'GENERATED_BACKGROUND',
      });

      // Step 2: Save canonical product to CAS
      const prodMeta = await storage.saveAsset({
        buffer: validProduct,
        mimeType: 'image/png',
        assetRole: 'CANONICAL_PRODUCT',
      });

      // Step 3: Retrieve buffers from CAS and composite via SharpHeroCompositor
      const retrievedBg = await storage.getAssetBuffer(bgMeta.storageKey);
      const retrievedProd = await storage.getAssetBuffer(prodMeta.storageKey);
      expect(retrievedBg).not.toBeNull();
      expect(retrievedProd).not.toBeNull();

      const compositeResult = await compositor.composite({
        creativeJobId: 'job-cas-1',
        canonicalProductBuffer: retrievedProd!,
        canonicalProductMimeType: prodMeta.mimeType,
        canonicalProductSha256: prodMeta.sha256Digest,
        backgroundBuffer: retrievedBg!,
        backgroundMimeType: bgMeta.mimeType,
        backgroundSha256: bgMeta.sha256Digest,
        targetWidth: 1080,
        targetHeight: 1080,
        aspectRatio: '1:1',
      });

      // Step 4: Save final composited asset into CAS
      const compMeta = await storage.saveAsset({
        buffer: compositeResult.compositedBuffer,
        mimeType: compositeResult.mimeType,
        assetRole: 'COMPOSITED_CREATIVE',
      });

      // Step 5: Retrieve composited asset and verify byte equality
      const finalRetrieved = await storage.getAssetBuffer(compMeta.storageKey);
      expect(finalRetrieved).not.toBeNull();
      expect(finalRetrieved!.equals(compositeResult.compositedBuffer)).toBe(true);
      expect(compMeta.sha256Digest).toBe(compositeResult.sha256);
      expect(compositeResult.productDigest).toBe(prodMeta.sha256Digest);
      expect(compositeResult.backgroundDigest).toBe(bgMeta.sha256Digest);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('Requirement 46: CreativeProvider boundary verification (CreativeProvider has NO composite method)', () => {
    const provider = new FakeCreativeProvider({ isProduction: false });
    expect(typeof provider.generateBackground).toBe('function');
    expect('composite' in provider).toBe(false);
    expect('compositeVisual' in provider).toBe(false);
  });

  it('Requirement 47: Provenance version consistency — PS_COMPOSITOR_VERSION must be "ps-compositor-v1"', async () => {
    expect(PS_COMPOSITOR_VERSION).toBe('ps-compositor-v1');
    expect(COMPOSITOR_VERSION).toBe('ps-compositor-v1');

    const result = await compositor.composite({
      creativeJobId: 'job-provenance-test',
      canonicalProductBuffer: validProduct,
      canonicalProductMimeType: 'image/png',
      canonicalProductSha256: productSha256,
      backgroundBuffer: validBackground,
      backgroundMimeType: 'image/png',
      backgroundSha256: backgroundSha256,
      targetWidth: 1080,
      targetHeight: 1080,
      aspectRatio: '1:1',
    });

    expect(result.compositorVersion).toBe('ps-compositor-v1');
    expect(result.compositorVersion).toBe(PS_COMPOSITOR_VERSION);
  });

  it('Requirement 48: Security mitigation — Max input byte limit enforcement (fails with CreativeInputTooLargeError)', async () => {
    const limitedCompositor = new SharpHeroCompositor({
      maxInputBytes: 1024, // 1 KB limit
    });

    await expect(
      limitedCompositor.composite({
        creativeJobId: 'job-large-input',
        canonicalProductBuffer: validProduct, // > 1 KB
        canonicalProductMimeType: 'image/png',
        canonicalProductSha256: productSha256,
        backgroundBuffer: validBackground,
        backgroundMimeType: 'image/png',
        backgroundSha256: backgroundSha256,
        targetWidth: 1080,
        targetHeight: 1080,
        aspectRatio: '1:1',
      }),
    ).rejects.toThrow(CreativeInputTooLargeError);
  });

  it('Requirement 49: Security mitigation — Unsupported format rejection (fails with CreativeUnsupportedImageFormatError)', async () => {
    // Valid 1x1 GIF buffer (unsupported by compositor which strictly requires PNG/WebP for products)
    const gifBuffer = Buffer.from(
      '47494638396101000100800000ffffff00000021f90401000000002c00000000010001000002024401003b',
      'hex',
    );
    const gifSha = createHash('sha256').update(gifBuffer).digest('hex');

    await expect(
      compositor.composite({
        creativeJobId: 'job-format-reject',
        canonicalProductBuffer: gifBuffer,
        canonicalProductMimeType: 'image/gif',
        canonicalProductSha256: gifSha,
        backgroundBuffer: validBackground,
        backgroundMimeType: 'image/png',
        backgroundSha256: backgroundSha256,
        targetWidth: 1080,
        targetHeight: 1080,
        aspectRatio: '1:1',
      }),
    ).rejects.toThrow(CreativeUnsupportedImageFormatError);
  });

  it('Requirement 50: Storage-agnostic invariant — Compositor operates purely in-memory and has no storage or DB coupling', () => {
    const comp = new SharpHeroCompositor();
    expect('saveAsset' in comp).toBe(false);
    expect('getMetadata' in comp).toBe(false);
    expect('getAssetBuffer' in comp).toBe(false);
    expect('prisma' in comp).toBe(false);
    expect('storageRoot' in comp).toBe(false);
  });
});
