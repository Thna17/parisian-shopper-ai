import { createHash } from 'node:crypto';
import { describe, expect, it, beforeAll } from '@jest/globals';
import sharp from 'sharp';
import { SharpHybridCompositorAdapter } from '../../infrastructure/sharp-hybrid-compositor.adapter.js';
import { SharpHeroCompositor } from '../../infrastructure/sharp-hero-compositor.adapter.js';
import { SharpPosterCompositor } from '../../infrastructure/sharp-poster-compositor.adapter.js';
import {
  type LayerAssetResolver,
  HYBRID_COMPOSITOR_VERSION,
} from '../../application/hybrid-compositor.port.js';
import { PS_COMPOSITOR_VERSION } from '../../application/hero-compositor.port.js';
import { POSTER_COMPOSITOR_VERSION } from '../../application/poster-compositor.port.js';
import { CompositorLayerMissingAssetError } from '../creative-errors.js';
import {
  type CreativeSceneVersionRecord,
  type SceneLayerRecord,
} from '../scene/creative-scene.types.js';
import { PosterCopyBuilder } from '../services/poster-copy-builder.js';
import { FontRegistry } from '../../infrastructure/fonts/font-registry.js';
import { HarfBuzzShapingService } from '../../infrastructure/fonts/harfbuzz-shaping-service.js';
import { TextLayoutEngine } from '../services/text-layout-engine.js';
import { getPresetFixture } from '../../infrastructure/fixtures/fake-background-fixtures.js';
import { generateTransparentProductPng } from '../../infrastructure/fixtures/fake-product-fixtures.js';

describe('W23 Scene Compositor Integration & Legacy Port Reconciliation (W23-D)', () => {
  beforeAll(() => {
    const fontRegistry = FontRegistry.getInstance();
    TextLayoutEngine.setDefaultShaper(new HarfBuzzShapingService(fontRegistry));
  });

  const validBackground = getPresetFixture('cream', 1080, 1080);
  const backgroundSha256 = createHash('sha256').update(validBackground).digest('hex');

  const productRgb = { r: 180, g: 30, b: 40 };
  const validProduct = generateTransparentProductPng({
    width: 500,
    height: 500,
    productWidth: 300,
    productHeight: 300,
    productColor: { ...productRgb, a: 255 },
  });
  const productSha256 = createHash('sha256').update(validProduct).digest('hex');

  function createMockSceneVersion(
    overrides?: Partial<CreativeSceneVersionRecord>,
  ): CreativeSceneVersionRecord {
    const defaultLayers: SceneLayerRecord[] = [
      {
        id: 'layer-bg-001',
        sceneVersionId: 'scene-ver-001',
        layerKey: 'bg_layer',
        layerGroup: 'BACKGROUND',
        layerType: 'STATIC_CAS_BACKGROUND',
        name: 'Background Layer',
        zIndex: 10,
        visible: true,
        opacity: 1,
        blendMode: 'NORMAL',
        bounds: { x: 0, y: 0, width: 1080, height: 1080 },
        payload: {
          assetType: 'STATIC_CAS_BACKGROUND',
          casStorageKey: 'cas/bg-cream-1080.png',
          sha256: backgroundSha256,
          mimeType: 'image/png',
          byteSize: validBackground.length,
          width: 1080,
          height: 1080,
        } as unknown as SceneLayerRecord['payload'],
        payloadSchemaVersion: 1,
        layerHash: 'hash-bg-10',
        sortOrder: 10,
        createdAt: new Date('2026-10-26T10:00:00Z'),
      },
      {
        id: 'layer-pedestal-001',
        sceneVersionId: 'scene-ver-001',
        layerKey: 'pedestal_layer',
        layerGroup: 'SURFACE_SHADOW',
        layerType: 'PEDESTAL_SURFACE',
        name: 'Pedestal Surface',
        zIndex: 110,
        visible: true,
        opacity: 0.8,
        blendMode: 'NORMAL',
        bounds: { x: 100, y: 750, width: 880, height: 200 },
        payload: {
          surfaceType: 'PEDESTAL',
          color: '#E0DACB',
        } as unknown as SceneLayerRecord['payload'],
        payloadSchemaVersion: 1,
        layerHash: 'hash-pedestal-110',
        sortOrder: 110,
        createdAt: new Date('2026-10-26T10:00:00Z'),
      },
      {
        id: 'layer-product-001',
        sceneVersionId: 'scene-ver-001',
        layerKey: 'product_layer',
        layerGroup: 'PRODUCT_HERO',
        layerType: 'HERO_CUTOUT',
        name: 'Product Flacon',
        zIndex: 200,
        visible: true,
        opacity: 1,
        blendMode: 'NORMAL',
        bounds: { x: 340, y: 300, width: 400, height: 450 },
        payload: {
          casStorageKey: 'cas/product-flacon-500.png',
          sha256: productSha256,
          mimeType: 'image/png',
          byteSize: validProduct.length,
          width: 500,
          height: 500,
          hasAlpha: true,
        } as unknown as SceneLayerRecord['payload'],
        payloadSchemaVersion: 1,
        layerHash: 'hash-product-200',
        sortOrder: 200,
        createdAt: new Date('2026-10-26T10:00:00Z'),
      },
      {
        id: 'layer-disabled-001',
        sceneVersionId: 'scene-ver-001',
        layerKey: 'disabled_watermark',
        layerGroup: 'BRAND_DECORATION',
        layerType: 'BRAND_MARK',
        name: 'Disabled Watermark',
        zIndex: 250,
        visible: false, // Disabled: must be cleanly skipped
        opacity: 1,
        blendMode: 'NORMAL',
        bounds: { x: 0, y: 0, width: 200, height: 200 },
        payload: {
          casStorageKey: 'cas/non-existent-watermark.png',
        } as unknown as SceneLayerRecord['payload'],
        payloadSchemaVersion: 1,
        layerHash: 'hash-disabled-250',
        sortOrder: 250,
        createdAt: new Date('2026-10-26T10:00:00Z'),
      },
      {
        id: 'layer-zero-opacity-001',
        sceneVersionId: 'scene-ver-001',
        layerKey: 'zero_opacity_layer',
        layerGroup: 'TYPOGRAPHY',
        layerType: 'TYPOGRAPHY_BLOCK',
        name: 'Zero Opacity Text',
        zIndex: 260,
        visible: true,
        opacity: 0, // Opacity 0: must be cleanly skipped
        blendMode: 'NORMAL',
        bounds: { x: 0, y: 0, width: 200, height: 200 },
        payload: {
          casStorageKey: 'cas/non-existent-zero-opacity.png',
        } as unknown as SceneLayerRecord['payload'],
        payloadSchemaVersion: 1,
        layerHash: 'hash-zero-opacity-260',
        sortOrder: 260,
        createdAt: new Date('2026-10-26T10:00:00Z'),
      },
      {
        id: 'layer-typo-001',
        sceneVersionId: 'scene-ver-001',
        layerKey: 'typo_layer',
        layerGroup: 'TYPOGRAPHY',
        layerType: 'TYPOGRAPHY_BLOCK',
        name: 'Headline Overlay',
        zIndex: 300,
        visible: true,
        opacity: 1,
        blendMode: 'NORMAL',
        bounds: { x: 100, y: 80, width: 880, height: 120 },
        payload: {
          svgContent: `<svg width="880" height="120" xmlns="http://www.w3.org/2000/svg"><text x="440" y="60" font-family="sans-serif" font-size="32" fill="#1A1A1A" text-anchor="middle" font-weight="bold">PARISIAN LUXURY</text></svg>`,
        } as unknown as SceneLayerRecord['payload'],
        payloadSchemaVersion: 1,
        layerHash: 'hash-typo-300',
        sortOrder: 300,
        createdAt: new Date('2026-10-26T10:00:00Z'),
      },
    ];

    return {
      id: 'scene-ver-001',
      sceneId: 'scene-job-001',
      versionNumber: 1,
      aspectRatio: '1:1',
      width: 1080,
      height: 1080,
      templateId: 'CENTERED_HERO',
      templateVersion: '1.0.0',
      language: 'EN',
      safeMargins: { top: 76, bottom: 88, left: 65, right: 65 },
      brandProfileVersionId: 'bp-v1',
      sourceContentVersionId: 'sc-v1',
      productSnapshotId: 'ps-v1',
      sceneHash: 'scene-hash-abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      dependencyHash: 'dep-hash-1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      createdAt: new Date('2026-10-26T10:00:00Z'),
      layers: defaultLayers,
      dependencies: [],
      ...overrides,
    };
  }

  describe('1. Scene Graph Rendering Pipeline (renderSceneVersion)', () => {
    it('renders a full W20 Layered SceneVersionRecord resolving CAS assets cleanly', async () => {
      const compositor = new SharpHybridCompositorAdapter();
      const sceneVersion = createMockSceneVersion();

      const casStorage: Record<string, Buffer> = {
        'cas/bg-cream-1080.png': validBackground,
        'cas/product-flacon-500.png': validProduct,
      };

      const assetResolver: LayerAssetResolver = (key: string) => {
        return Promise.resolve(casStorage[key] ?? null);
      };

      const result = await compositor.renderSceneVersion(sceneVersion, assetResolver);

      expect(result.mimeType).toBe('image/png');
      expect(result.width).toBe(1080);
      expect(result.height).toBe(1080);
      expect(result.colorProfile).toBe('sRGB');
      expect(result.compositorVersion).toBe(HYBRID_COMPOSITOR_VERSION);
      expect(result.cacheStatus).toBe('MISS');
      expect(result.compositedBuffer.length).toBeGreaterThan(10000);

      // Provenance binding
      expect(result.sceneHash).toBe(sceneVersion.sceneHash);
      expect(result.dependencyHash).toBe(sceneVersion.dependencyHash);

      // Verify layer execution manifest includes applied layers in order
      expect(result.layerExecutionManifest.length).toBeGreaterThanOrEqual(4);
      expect(result.layerExecutionManifest[0]?.layerGroup).toBe('BACKGROUND');

      // Disabled and zero-opacity layers must be skipped cleanly (not in manifest)
      const appliedIndices = result.layerExecutionManifest.map((m) => m.layerIndex);
      expect(appliedIndices).not.toContain(250);
      expect(appliedIndices).not.toContain(260);

      // Verify authentic product RGB preservation inside the composited image
      const metadata = await sharp(result.compositedBuffer).metadata();
      expect(metadata.space).toBe('srgb');
      expect(metadata.format).toBe('png');
    });

    it('returns cache HIT when identical scene version is rendered repeatedly', async () => {
      const compositor = new SharpHybridCompositorAdapter();
      const sceneVersion = createMockSceneVersion();

      const casStorage: Record<string, Buffer> = {
        'cas/bg-cream-1080.png': validBackground,
        'cas/product-flacon-500.png': validProduct,
      };

      const assetResolver: LayerAssetResolver = (key: string) =>
        Promise.resolve(casStorage[key] ?? null);

      const firstResult = await compositor.renderSceneVersion(sceneVersion, assetResolver);
      expect(firstResult.cacheStatus).toBe('MISS');

      const secondResult = await compositor.renderSceneVersion(sceneVersion, assetResolver);
      expect(secondResult.cacheStatus).toBe('HIT');
      expect(secondResult.sha256).toBe(firstResult.sha256);
      expect(secondResult.compositedBuffer).toEqual(firstResult.compositedBuffer);
      expect(secondResult.sceneHash).toBe(sceneVersion.sceneHash);
      expect(secondResult.dependencyHash).toBe(sceneVersion.dependencyHash);
    });
  });

  describe('2. Layer-Level Failure Isolation & Resumption', () => {
    it('fails closed with CompositorLayerMissingAssetError when CAS asset returns null', async () => {
      const compositor = new SharpHybridCompositorAdapter();
      const sceneVersion = createMockSceneVersion();

      // Missing product asset in CAS
      const casStorage: Record<string, Buffer> = {
        'cas/bg-cream-1080.png': validBackground,
      };

      const assetResolver: LayerAssetResolver = (key: string) =>
        Promise.resolve(casStorage[key] ?? null);

      let caughtError: unknown;
      try {
        await compositor.renderSceneVersion(sceneVersion, assetResolver);
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(CompositorLayerMissingAssetError);
      const missingError = caughtError as CompositorLayerMissingAssetError;
      expect(missingError.failedLayerIndex).toBe(200);
      expect(missingError.details?.layerGroup).toBe('PRODUCT_HERO');
      expect(missingError.details?.sceneVersionId).toBe(sceneVersion.id);
      expect(missingError.details?.storageKey).toBe('cas/product-flacon-500.png');

      // The scene record remains untouched and valid for subsequent retry
      expect(sceneVersion.layers.length).toBe(6);

      // Retry after resolving the missing asset succeeds without altering scene record
      casStorage['cas/product-flacon-500.png'] = validProduct;
      const retryResult = await compositor.renderSceneVersion(sceneVersion, assetResolver);
      expect(retryResult.mimeType).toBe('image/png');
      expect(retryResult.sha256).toBeDefined();
    });

    it('fails closed with CompositorLayerMissingAssetError when CAS resolver throws network error', async () => {
      const compositor = new SharpHybridCompositorAdapter();
      const sceneVersion = createMockSceneVersion();

      const throwingResolver: LayerAssetResolver = (key: string) => {
        if (key.includes('product')) {
          return Promise.reject(new Error('CAS connection timeout'));
        }
        return Promise.resolve(validBackground);
      };

      await expect(compositor.renderSceneVersion(sceneVersion, throwingResolver)).rejects.toThrow(
        CompositorLayerMissingAssetError,
      );
    });
  });

  describe('3. Legacy Compositor Port Reconciliation (Zero Regressions)', () => {
    it('SharpHeroCompositor delegates internally to SharpHybridCompositor as strict 3-layer composition', async () => {
      const heroCompositor = new SharpHeroCompositor();

      const result = await heroCompositor.composite({
        creativeJobId: 'job-hero-legacy-delegation',
        canonicalProductBuffer: validProduct,
        canonicalProductMimeType: 'image/png',
        canonicalProductSha256: productSha256,
        backgroundBuffer: validBackground,
        backgroundMimeType: 'image/png',
        backgroundSha256: backgroundSha256,
        targetWidth: 1080,
        targetHeight: 1080,
        aspectRatio: '1:1',
        enableContactShadow: true,
      });

      expect(result.mimeType).toBe('image/png');
      expect(result.width).toBe(1080);
      expect(result.height).toBe(1080);
      expect(result.compositorVersion).toBe(PS_COMPOSITOR_VERSION);
      expect(result.heroBoundingBox).toBeDefined();
      expect(result.contactShadowBoundingBox).toBeDefined();
      expect(result.outputDigest).toBe(result.sha256);
      expect(result.productDigest).toBe(productSha256);
      expect(result.backgroundDigest).toBe(backgroundSha256);

      // Verify product pixel colors retain RGB
      const rawPixels = await sharp(result.compositedBuffer)
        .raw()
        .toBuffer({ resolveWithObject: true });

      const centerIdx = (540 * 1080 + 540) * rawPixels.info.channels;
      expect(Math.abs(rawPixels.data[centerIdx]! - productRgb.r)).toBeLessThanOrEqual(3);
      expect(Math.abs(rawPixels.data[centerIdx + 1]! - productRgb.g)).toBeLessThanOrEqual(3);
      expect(Math.abs(rawPixels.data[centerIdx + 2]! - productRgb.b)).toBeLessThanOrEqual(3);
    });

    it('SharpPosterCompositor delegates internally to SharpHybridCompositor with complete layout manifest', async () => {
      const posterCompositor = new SharpPosterCompositor();

      const spec = PosterCopyBuilder.buildSpec(
        {
          sku: 'GEP-KING-100',
          title: 'Yes I Am The King',
          brand: 'Geparlys',
          priceAmount: 48,
          currency: 'USD',
          volumeMl: 100,
          concentration: 'Eau de Parfum',
        },
        {
          headline: 'Discover The King',
          bodyText: 'A royal, charismatic fragrance crafted in Paris.',
          cta: 'Shop Now',
        },
        { templateId: 'CENTERED_HERO' },
      );

      const result = await posterCompositor.renderPoster({
        creativeJobId: 'job-poster-legacy-delegation',
        posterSpec: spec,
        canonicalProductBuffer: validProduct,
        canonicalProductMimeType: 'image/png',
        canonicalProductSha256: productSha256,
        backgroundBuffer: validBackground,
        backgroundMimeType: 'image/png',
        backgroundSha256: backgroundSha256,
        allowNonApprovedForTesting: true,
      });

      expect(result.width).toBe(1080);
      expect(result.height).toBe(1080);
      expect(result.mimeType).toBe('image/png');
      expect(result.compositorVersion).toBe(POSTER_COMPOSITOR_VERSION);
      expect(result.layoutManifest.templateId).toBe('CENTERED_HERO');
      expect(result.layoutManifest.elements.length).toBeGreaterThanOrEqual(4);
      expect(result.outputDigest).toBe(result.sha256);
    });
  });
});
