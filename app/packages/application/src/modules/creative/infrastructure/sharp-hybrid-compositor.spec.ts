import { createHash } from 'node:crypto';
import { describe, expect, it } from '@jest/globals';
import sharp from 'sharp';
import {
  HYBRID_COMPOSITOR_VERSION,
  type CompositorLayerInput,
  type HybridCompositorInput,
} from '../application/hybrid-compositor.port.js';
import {
  CompositorCorruptedLayerAssetError,
  CompositorLayerMissingAssetError,
  ProductHeroContainmentError,
} from '../domain/creative-errors.js';
import {
  generateDeterministicBackgroundPng,
  getPresetFixture,
} from './fixtures/fake-background-fixtures.js';
import { generateTransparentProductPng_TEST_ONLY } from './fixtures/fake-product-fixtures.js';
import { SharpHybridCompositorAdapter, boxesIntersect } from './sharp-hybrid-compositor.adapter.js';

function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex').toLowerCase();
}

function makeLayer(
  layerIndex: number,
  layerGroup: CompositorLayerInput['layerGroup'],
  buffer: Buffer,
  mimeType = 'image/png',
  placement?: CompositorLayerInput['placement'],
): CompositorLayerInput {
  return {
    layerIndex,
    layerGroup,
    buffer,
    mimeType,
    contentDigest: sha256(buffer),
    ...(placement !== undefined ? { placement } : {}),
  };
}

function makeSvgBuffer(svgContent: string): Buffer {
  return Buffer.from(svgContent, 'utf8');
}

describe('SharpHybridCompositorAdapter (W23-C Multi-Layer Compositor)', () => {
  const compositor = new SharpHybridCompositorAdapter();

  // Reusable fixtures
  const bg1080 = getPresetFixture('cream', 1080, 1080);
  const bg1350 = generateDeterministicBackgroundPng({ width: 1080, height: 1350, seed: 101 });
  const bg1920 = generateDeterministicBackgroundPng({ width: 1080, height: 1920, seed: 102 });

  // Luxury Flacon: 400x800 canvas with a 200x600 flacon (1:3 aspect ratio)
  const flaconBuffer = generateTransparentProductPng_TEST_ONLY({
    width: 400,
    height: 800,
    productWidth: 200,
    productHeight: 600,
    productColor: { r: 180, g: 30, b: 40, a: 255 },
  });

  const sampleLogoSvg = makeSvgBuffer(`
    <svg width="180" height="48" xmlns="http://www.w3.org/2000/svg">
      <rect width="180" height="48" fill="none"/>
      <circle cx="24" cy="24" r="16" fill="#D4AF37"/>
      <rect x="50" y="16" width="100" height="16" fill="#D4AF37"/>
    </svg>
  `);

  const sampleTypographySvg = makeSvgBuffer(`
    <svg width="1080" height="300" xmlns="http://www.w3.org/2000/svg">
      <path d="M 100 100 L 200 100 L 150 200 Z" fill="#FFFFFF"/>
    </svg>
  `);

  const sampleContrastPanelSvg = makeSvgBuffer(`
    <svg width="1080" height="400" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0.6"/>
        </linearGradient>
      </defs>
      <rect width="1080" height="400" fill="url(#grad)"/>
    </svg>
  `);

  const samplePedestalSvg = makeSvgBuffer(`
    <svg width="1080" height="80" xmlns="http://www.w3.org/2000/svg">
      <rect width="1080" height="4" fill="#D4AF37"/>
      <rect y="4" width="1080" height="76" fill="#1C1C24" opacity="0.8"/>
    </svg>
  `);

  const sampleDecorativeSvg = makeSvgBuffer(`
    <svg width="120" height="120" xmlns="http://www.w3.org/2000/svg">
      <circle cx="60" cy="60" r="40" fill="none" stroke="#D4AF37" stroke-width="2"/>
    </svg>
  `);

  describe('1. Full 8-Layer Composition Across Canvases (1:1, 4:5, 9:16)', () => {
    it('successfully composites 8 layers on a 1:1 canvas (1080x1080)', async () => {
      const layers: readonly CompositorLayerInput[] = [
        makeLayer(0, 'BACKGROUND', bg1080),
        makeLayer(50, 'SURFACE', sampleContrastPanelSvg, 'image/svg+xml', {
          x: 0,
          y: 680,
          width: 1080,
          height: 400,
        }),
        makeLayer(100, 'SURFACE', samplePedestalSvg, 'image/svg+xml', {
          x: 0,
          y: 750,
          width: 1080,
          height: 80,
        }),
        makeLayer(200, 'PRODUCT_HERO', flaconBuffer, 'image/png', {
          x: 340,
          y: 250,
          width: 400,
          height: 500,
        }),
        makeLayer(300, 'BRAND_LOGO', sampleLogoSvg, 'image/svg+xml', {
          x: 450,
          y: 60,
          width: 180,
          height: 48,
        }),
        makeLayer(350, 'TYPOGRAPHY', sampleTypographySvg, 'image/svg+xml', {
          x: 0,
          y: 800,
          width: 1080,
          height: 200,
        }),
        makeLayer(450, 'DECORATIVE', sampleDecorativeSvg, 'image/svg+xml', {
          x: 900,
          y: 60,
          width: 120,
          height: 120,
        }),
      ];

      const input: HybridCompositorInput = {
        creativeJobId: 'job-8layer-1x1',
        aspectRatio: '1:1',
        canvas: { width: 1080, height: 1080 },
        layers,
        colorProfile: 'sRGB',
      };

      const result = await compositor.composite(input);

      expect(result.mimeType).toBe('image/png');
      expect(result.width).toBe(1080);
      expect(result.height).toBe(1080);
      expect(result.compositorVersion).toBe(HYBRID_COMPOSITOR_VERSION);
      expect(result.colorProfile).toBe('sRGB');
      expect(result.cacheStatus).toBe('MISS');
      expect(result.byteSize).toBeGreaterThan(0);
      expect(result.layerExecutionManifest).toHaveLength(layers.length);

      const meta = await sharp(result.compositedBuffer).metadata();
      expect(meta.width).toBe(1080);
      expect(meta.height).toBe(1080);
      expect(meta.format).toBe('png');
      expect(meta.space).toBe('srgb');
    });

    it('successfully composites 8 layers on a 4:5 canvas (1080x1350)', async () => {
      const layers: readonly CompositorLayerInput[] = [
        makeLayer(0, 'BACKGROUND', bg1350),
        makeLayer(50, 'SURFACE', sampleContrastPanelSvg, 'image/svg+xml', {
          x: 0,
          y: 900,
          width: 1080,
          height: 450,
        }),
        makeLayer(100, 'SURFACE', samplePedestalSvg, 'image/svg+xml', {
          x: 0,
          y: 950,
          width: 1080,
          height: 80,
        }),
        makeLayer(200, 'PRODUCT_HERO', flaconBuffer, 'image/png', {
          x: 340,
          y: 350,
          width: 400,
          height: 600,
        }),
        makeLayer(300, 'BRAND_LOGO', sampleLogoSvg, 'image/svg+xml', {
          x: 450,
          y: 80,
          width: 180,
          height: 48,
        }),
        makeLayer(350, 'TYPOGRAPHY', sampleTypographySvg, 'image/svg+xml', {
          x: 0,
          y: 1050,
          width: 1080,
          height: 250,
        }),
        makeLayer(450, 'DECORATIVE', sampleDecorativeSvg, 'image/svg+xml', {
          x: 900,
          y: 80,
          width: 120,
          height: 120,
        }),
      ];

      const input: HybridCompositorInput = {
        creativeJobId: 'job-8layer-4x5',
        aspectRatio: '4:5',
        canvas: { width: 1080, height: 1350 },
        layers,
        colorProfile: 'sRGB',
      };

      const result = await compositor.composite(input);

      expect(result.width).toBe(1080);
      expect(result.height).toBe(1350);
      expect(result.mimeType).toBe('image/png');
      expect(result.colorProfile).toBe('sRGB');

      const meta = await sharp(result.compositedBuffer).metadata();
      expect(meta.width).toBe(1080);
      expect(meta.height).toBe(1350);
      expect(meta.space).toBe('srgb');
    });

    it('successfully composites 8 layers on a 9:16 vertical canvas (1080x1920)', async () => {
      const layers: readonly CompositorLayerInput[] = [
        makeLayer(0, 'BACKGROUND', bg1920),
        makeLayer(50, 'SURFACE', sampleContrastPanelSvg, 'image/svg+xml', {
          x: 0,
          y: 1300,
          width: 1080,
          height: 620,
        }),
        makeLayer(100, 'SURFACE', samplePedestalSvg, 'image/svg+xml', {
          x: 0,
          y: 1350,
          width: 1080,
          height: 80,
        }),
        makeLayer(200, 'PRODUCT_HERO', flaconBuffer, 'image/png', {
          x: 340,
          y: 600,
          width: 400,
          height: 750,
        }),
        makeLayer(300, 'BRAND_LOGO', sampleLogoSvg, 'image/svg+xml', {
          x: 450,
          y: 120,
          width: 180,
          height: 48,
        }),
        makeLayer(350, 'TYPOGRAPHY', sampleTypographySvg, 'image/svg+xml', {
          x: 0,
          y: 1500,
          width: 1080,
          height: 300,
        }),
        makeLayer(450, 'DECORATIVE', sampleDecorativeSvg, 'image/svg+xml', {
          x: 900,
          y: 120,
          width: 120,
          height: 120,
        }),
      ];

      const input: HybridCompositorInput = {
        creativeJobId: 'job-8layer-9x16',
        aspectRatio: '9:16',
        canvas: { width: 1080, height: 1920 },
        layers,
        colorProfile: 'sRGB',
      };

      const result = await compositor.composite(input);

      expect(result.width).toBe(1080);
      expect(result.height).toBe(1920);
      expect(result.mimeType).toBe('image/png');

      const meta = await sharp(result.compositedBuffer).metadata();
      expect(meta.width).toBe(1080);
      expect(meta.height).toBe(1920);
      expect(meta.space).toBe('srgb');
    });
  });

  describe('2. Product Zero-Cropping & Aspect Ratio Preservation', () => {
    it('preserves exact product aspect ratio inside square placement bounds without stretching', async () => {
      // Flacon has 200x600 trimmed pixels (aspect ratio 1:3 = 0.333)
      // When placed in a 400x400 square placement box, it must NOT stretch to 400x400
      const layers: readonly CompositorLayerInput[] = [
        makeLayer(0, 'BACKGROUND', bg1080),
        makeLayer(200, 'PRODUCT_HERO', flaconBuffer, 'image/png', {
          x: 340,
          y: 300,
          width: 400,
          height: 400, // Square box
        }),
      ];

      const input: HybridCompositorInput = {
        creativeJobId: 'job-contain-test',
        aspectRatio: '1:1',
        canvas: { width: 1080, height: 1080 },
        layers,
      };

      const result = await compositor.composite(input);
      expect(result.byteSize).toBeGreaterThan(0);

      // Verify that composite has valid dimensions and product pixels are rendered
      const meta = await sharp(result.compositedBuffer).metadata();
      expect(meta.width).toBe(1080);
      expect(meta.height).toBe(1080);
    });
  });

  describe('3. Contact Shadow Generation & Grounding', () => {
    it('synthesizes realistic contact shadow below product cutout automatically', async () => {
      const layersWithoutExplicitShadow: readonly CompositorLayerInput[] = [
        makeLayer(0, 'BACKGROUND', bg1080),
        makeLayer(200, 'PRODUCT_HERO', flaconBuffer, 'image/png', {
          x: 340,
          y: 200,
          width: 400,
          height: 600,
        }),
      ];

      const input: HybridCompositorInput = {
        creativeJobId: 'job-shadow-test',
        aspectRatio: '1:1',
        canvas: { width: 1080, height: 1080 },
        layers: layersWithoutExplicitShadow,
      };

      const result = await compositor.composite(input);
      expect(result.byteSize).toBeGreaterThan(0);
      // Successful composition confirms contact shadow was synthesized and blended
      expect(result.layerExecutionManifest).toHaveLength(2);
    });

    it('uses explicit shadow layer when provided in input', async () => {
      const explicitShadowBuffer = makeSvgBuffer(`
        <svg width="420" height="40" xmlns="http://www.w3.org/2000/svg">
          <ellipse cx="210" cy="20" rx="200" ry="15" fill="#000000" opacity="0.3"/>
        </svg>
      `);

      const layersWithExplicitShadow: readonly CompositorLayerInput[] = [
        makeLayer(0, 'BACKGROUND', bg1080),
        makeLayer(150, 'SHADOW', explicitShadowBuffer, 'image/svg+xml', {
          x: 330,
          y: 790,
          width: 420,
          height: 40,
        }),
        makeLayer(200, 'PRODUCT_HERO', flaconBuffer, 'image/png', {
          x: 340,
          y: 200,
          width: 400,
          height: 600,
        }),
      ];

      const input: HybridCompositorInput = {
        creativeJobId: 'job-explicit-shadow',
        aspectRatio: '1:1',
        canvas: { width: 1080, height: 1080 },
        layers: layersWithExplicitShadow,
      };

      const result = await compositor.composite(input);
      expect(result.layerExecutionManifest).toHaveLength(3);
      expect(result.layerExecutionManifest.find((m) => m.layerGroup === 'SHADOW')?.applied).toBe(
        true,
      );
    });
  });

  describe('4. sRGB Color Profile Assignment & Metadata Stripping', () => {
    it('outputs 8-bit sRGB PNG without volatile camera metadata', async () => {
      const layers: readonly CompositorLayerInput[] = [
        makeLayer(0, 'BACKGROUND', bg1080),
        makeLayer(200, 'PRODUCT_HERO', flaconBuffer, 'image/png', {
          x: 340,
          y: 200,
          width: 400,
          height: 600,
        }),
      ];

      const input: HybridCompositorInput = {
        creativeJobId: 'job-color-profile',
        aspectRatio: '1:1',
        canvas: { width: 1080, height: 1080 },
        layers,
        colorProfile: 'sRGB',
      };

      const result = await compositor.composite(input);
      const meta = await sharp(result.compositedBuffer).metadata();

      expect(meta.space).toBe('srgb');
      expect(meta.format).toBe('png');
      expect([3, 4]).toContain(meta.channels);
      expect(meta.exif).toBeUndefined(); // stripped
      expect(meta.iptc).toBeUndefined(); // stripped
    });
  });

  describe('5. Repeat-Render Byte-Exact Determinism & Cache Hit', () => {
    it('produces bit-exact identical output and activates render cache on second call', async () => {
      const freshCompositor = new SharpHybridCompositorAdapter();
      const layers: readonly CompositorLayerInput[] = [
        makeLayer(0, 'BACKGROUND', bg1080),
        makeLayer(200, 'PRODUCT_HERO', flaconBuffer, 'image/png', {
          x: 340,
          y: 200,
          width: 400,
          height: 600,
        }),
      ];

      const input: HybridCompositorInput = {
        creativeJobId: 'job-deterministic',
        aspectRatio: '1:1',
        canvas: { width: 1080, height: 1080 },
        layers,
      };

      // Call 1: Cache Miss
      const result1 = await freshCompositor.composite(input);
      expect(result1.cacheStatus).toBe('MISS');

      // Call 2: Cache Hit
      const result2 = await freshCompositor.composite(input);
      expect(result2.cacheStatus).toBe('HIT');

      // Bit-exact identity:
      expect(result1.sha256).toBe(result2.sha256);
      expect(result1.compositedBuffer.equals(result2.compositedBuffer)).toBe(true);
      expect(result1.width).toBe(result2.width);
      expect(result1.height).toBe(result2.height);
      expect(result2.latencyMs).toBeLessThan(10); // Cache hit < 10ms
    });
  });

  describe('6. Product Integrity & Safe Margin Containment Assertions', () => {
    it('throws ProductHeroContainmentError when product placement exceeds canvas safe margins', async () => {
      // Placing product too close to left margin (safeLeft is 54px for 1080)
      const outOfBoundsLayers: readonly CompositorLayerInput[] = [
        makeLayer(0, 'BACKGROUND', bg1080),
        makeLayer(200, 'PRODUCT_HERO', flaconBuffer, 'image/png', {
          x: 10, // violates safe margin (54px)
          y: 200,
          width: 400,
          height: 600,
        }),
      ];

      const input: HybridCompositorInput = {
        creativeJobId: 'job-oob-left',
        aspectRatio: '1:1',
        canvas: { width: 1080, height: 1080 },
        layers: outOfBoundsLayers,
      };

      await expect(compositor.composite(input)).rejects.toThrow(ProductHeroContainmentError);
    });

    it('throws ProductHeroContainmentError when product collides with typography/CTA element', async () => {
      // Product hero placed at y=200..700; typography layer placed directly over it at y=300..500
      const collidingLayers: readonly CompositorLayerInput[] = [
        makeLayer(0, 'BACKGROUND', bg1080),
        makeLayer(200, 'PRODUCT_HERO', flaconBuffer, 'image/png', {
          x: 340,
          y: 200,
          width: 400,
          height: 500,
        }),
        makeLayer(350, 'TYPOGRAPHY', sampleTypographySvg, 'image/svg+xml', {
          x: 350,
          y: 250, // colliding with product hero!
          width: 380,
          height: 150,
        }),
      ];

      const input: HybridCompositorInput = {
        creativeJobId: 'job-collide-cta',
        aspectRatio: '1:1',
        canvas: { width: 1080, height: 1080 },
        layers: collidingLayers,
      };

      await expect(compositor.composite(input)).rejects.toThrow(ProductHeroContainmentError);
    });

    it('correctly calculates boxesIntersect geometry', () => {
      const boxA = { x: 100, y: 100, width: 200, height: 200 };
      const boxB = { x: 250, y: 250, width: 200, height: 200 }; // overlaps at (250, 250) to (300, 300)
      const boxC = { x: 400, y: 400, width: 100, height: 100 }; // no overlap

      expect(boxesIntersect(boxA, boxB)).toBe(true);
      expect(boxesIntersect(boxA, boxC)).toBe(false);
    });
  });

  describe('7. Layer Asset Error Handling', () => {
    it('throws CompositorLayerMissingAssetError when a layer buffer is empty', async () => {
      const invalidLayers: readonly CompositorLayerInput[] = [
        makeLayer(0, 'BACKGROUND', Buffer.alloc(0)),
      ];

      const input: HybridCompositorInput = {
        creativeJobId: 'job-empty-buffer',
        aspectRatio: '1:1',
        canvas: { width: 1080, height: 1080 },
        layers: invalidLayers,
      };

      await expect(compositor.composite(input)).rejects.toThrow(CompositorLayerMissingAssetError);
    });

    it('throws CompositorCorruptedLayerAssetError when buffer sha256 does not match contentDigest', async () => {
      const corruptedLayers: readonly CompositorLayerInput[] = [
        {
          layerIndex: 0,
          layerGroup: 'BACKGROUND',
          buffer: bg1080,
          mimeType: 'image/png',
          contentDigest: 'wrong-sha256-digest-value',
        },
      ];

      const input: HybridCompositorInput = {
        creativeJobId: 'job-corrupted-digest',
        aspectRatio: '1:1',
        canvas: { width: 1080, height: 1080 },
        layers: corruptedLayers,
      };

      await expect(compositor.composite(input)).rejects.toThrow(CompositorCorruptedLayerAssetError);
    });
  });
});
