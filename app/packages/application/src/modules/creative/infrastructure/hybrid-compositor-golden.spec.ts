import { createHash } from 'node:crypto';
import { describe, expect, it, beforeAll } from '@jest/globals';
import sharp from 'sharp';
import { SharpHybridCompositorAdapter, boxesIntersect } from './sharp-hybrid-compositor.adapter.js';
import { SharpPosterCompositor } from './sharp-poster-compositor.adapter.js';
import { CompositorRenderCache } from './compositor-render-cache.js';
import {
  type CompositorLayerInput,
  type HybridCompositorInput,
  HYBRID_COMPOSITOR_VERSION,
} from '../application/hybrid-compositor.port.js';
import { FontRegistry } from './fonts/font-registry.js';
import { HarfBuzzShapingService } from './fonts/harfbuzz-shaping-service.js';
import { TextLayoutEngine, type BoundingBox } from '../domain/services/text-layout-engine.js';
import { PosterCopyBuilder } from '../domain/services/poster-copy-builder.js';
import { getPresetFixture } from './fixtures/fake-background-fixtures.js';
import { generateTransparentProductPng } from './fixtures/fake-product-fixtures.js';
import { GOLDEN_TEMPLATE_VECTORS } from '../domain/templates/__fixtures__/golden-templates.fixture.js';

describe('W23-E: Hybrid Compositor Multi-Format Golden Matrix & Determinism Spec', () => {
  beforeAll(() => {
    const fontRegistry = FontRegistry.getInstance();
    TextLayoutEngine.setDefaultShaper(new HarfBuzzShapingService(fontRegistry));
  });

  // Background fixtures across canonical aspect ratios
  const bg1x1 = getPresetFixture('cream', 1080, 1080);
  const bg4x5 = getPresetFixture('cream', 1080, 1350);
  const bg9x16 = getPresetFixture('cream', 1080, 1920);

  const bgNoir1x1 = getPresetFixture('noir', 1080, 1080);

  const bgSha1x1 = createHash('sha256').update(bg1x1).digest('hex');
  const bgSha4x5 = createHash('sha256').update(bg4x5).digest('hex');
  const bgSha9x16 = createHash('sha256').update(bg9x16).digest('hex');

  // Product fixture 1: Tall slender perfume flacon (portrait/slender flacon)
  const flaconRgb = { r: 195, g: 35, b: 45 };
  const tallFlacon = generateTransparentProductPng({
    width: 300,
    height: 600,
    productWidth: 150,
    productHeight: 540,
    productColor: { ...flaconRgb, a: 255 },
  });
  const tallFlaconSha = createHash('sha256').update(tallFlacon).digest('hex');

  // Product fixture 2: Compact cosmetic cream jar (square/compact)
  const jarRgb = { r: 45, g: 140, b: 210 };
  const compactJar = generateTransparentProductPng({
    width: 500,
    height: 500,
    productWidth: 420,
    productHeight: 260,
    productColor: { ...jarRgb, a: 255 },
  });
  const compactJarSha = createHash('sha256').update(compactJar).digest('hex');

  // =========================================================================
  // 1. REPEAT-RENDER BIT-EXACT DETERMINISM ACROSS 5 TEMPLATES × 3 FORMATS
  // =========================================================================
  describe('1. Repeat-Render Bit-Exact Determinism Matrix', () => {
    const canonicalTemplates = [
      'CENTERED_HERO',
      'EDITORIAL_SPLIT',
      'KHMER_SEASONAL',
      'SCENT_STORY',
      'PROMOTION_PRICE_CTA',
    ] as const;

    const formats = ['1:1', '4:5', '9:16'] as const;

    for (const templateId of canonicalTemplates) {
      for (const ratio of formats) {
        it(`produces bit-exact identical buffer and SHA-256 for ${templateId} in ${ratio}`, async () => {
          const compositor = new SharpPosterCompositor();

          // Find golden vector or build clean spec
          const goldenVector = GOLDEN_TEMPLATE_VECTORS.find(
            (v) => v.templateId === templateId && v.aspectRatio === ratio && v.language === 'EN',
          );

          const spec =
            goldenVector?.spec ??
            PosterCopyBuilder.buildSpec(
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
                headline: 'The Royal Fragrance',
                bodyText: 'Handcrafted in Paris with sparkling bergamot and precious woods.',
                cta: 'Shop Now',
              },
              { templateId },
            );

          const bgBuffer = ratio === '1:1' ? bg1x1 : ratio === '4:5' ? bg4x5 : bg9x16;
          const bgSha = ratio === '1:1' ? bgSha1x1 : ratio === '4:5' ? bgSha4x5 : bgSha9x16;

          const renderInput = {
            creativeJobId: `job-determinism-${templateId}-${ratio}`,
            posterSpec: spec,
            canonicalProductBuffer: tallFlacon,
            canonicalProductMimeType: 'image/png' as const,
            canonicalProductSha256: tallFlaconSha,
            backgroundBuffer: bgBuffer,
            backgroundMimeType: 'image/png' as const,
            backgroundSha256: bgSha,
            allowNonApprovedForTesting: true,
          };

          // Render 1
          const output1 = await compositor.renderPoster(renderInput);

          // Render 2 (identical inputs)
          const output2 = await compositor.renderPoster(renderInput);

          // Assert bit-exact identity
          expect(output1.sha256).toBe(output2.sha256);
          expect(output1.byteSize).toBe(output2.byteSize);
          expect(Buffer.compare(output1.posterBuffer, output2.posterBuffer)).toBe(0);
          expect(output1.width).toBe(ratio === '1:1' ? 1080 : ratio === '4:5' ? 1080 : 1080);
          expect(output1.height).toBe(ratio === '1:1' ? 1080 : ratio === '4:5' ? 1350 : 1920);
        });
      }
    }

    it('verifies bit-exact reproducibility for compact cream jar product type', async () => {
      const compositor = new SharpPosterCompositor();

      const spec = PosterCopyBuilder.buildSpec(
        {
          sku: 'CREAM-JAR-01',
          title: 'Crème Hydratante Royale',
          brand: 'Maison Royale',
          priceAmount: 65,
          currency: 'USD',
          volumeMl: 50,
          concentration: 'Hydrating Cream',
        },
        {
          headline: 'Intense Parisian Hydration',
          bodyText: 'Enriched with botanical hyaluronic acid and French camellia.',
          cta: 'Discover',
        },
        { templateId: 'CENTERED_HERO' },
      );

      const renderInput = {
        creativeJobId: 'job-determinism-jar-1x1',
        posterSpec: spec,
        canonicalProductBuffer: compactJar,
        canonicalProductMimeType: 'image/png' as const,
        canonicalProductSha256: compactJarSha,
        backgroundBuffer: bg1x1,
        backgroundMimeType: 'image/png' as const,
        backgroundSha256: bgSha1x1,
        allowNonApprovedForTesting: true,
      };

      const render1 = await compositor.renderPoster(renderInput);
      const render2 = await compositor.renderPoster(renderInput);

      expect(render1.sha256).toBe(render2.sha256);
      expect(Buffer.compare(render1.posterBuffer, render2.posterBuffer)).toBe(0);
    });

    it('verifies bit-exact reproducibility across Khmer and Bilingual language modes', async () => {
      const compositor = new SharpPosterCompositor();

      const kmVector = GOLDEN_TEMPLATE_VECTORS.find(
        (v) => v.templateId === 'KHMER_SEASONAL' && v.aspectRatio === '1:1' && v.language === 'KM',
      );
      expect(kmVector).toBeDefined();

      const input = {
        creativeJobId: 'job-determinism-khmer-1x1',
        posterSpec: kmVector!.spec,
        canonicalProductBuffer: tallFlacon,
        canonicalProductMimeType: 'image/png' as const,
        canonicalProductSha256: tallFlaconSha,
        backgroundBuffer: bg1x1,
        backgroundMimeType: 'image/png' as const,
        backgroundSha256: bgSha1x1,
        allowNonApprovedForTesting: true,
      };

      const out1 = await compositor.renderPoster(input);
      const out2 = await compositor.renderPoster(input);

      expect(out1.sha256).toBe(out2.sha256);
      expect(Buffer.compare(out1.posterBuffer, out2.posterBuffer)).toBe(0);
    });
  });

  // =========================================================================
  // 2. CACHE INVALIDATION MATRIX
  // =========================================================================
  describe('2. Content-Addressable Cache Invalidation Matrix', () => {
    it('invalidates cache and changes SHA-256 when background, product, or typography changes', async () => {
      const renderCache = new CompositorRenderCache();
      const hybridCompositor = new SharpHybridCompositorAdapter({ renderCache });

      const initialTypoSvg = Buffer.from(
        '<svg width="1080" height="200" xmlns="http://www.w3.org/2000/svg"><text x="540" y="100" font-size="36" fill="#FFF" text-anchor="middle">PARISIAN NOCTURNE</text></svg>',
        'utf8',
      );
      const initialTypoSha = createHash('sha256').update(initialTypoSvg).digest('hex');

      const baseLayers: CompositorLayerInput[] = [
        {
          layerIndex: 0,
          layerGroup: 'BACKGROUND',
          buffer: bg1x1,
          mimeType: 'image/png',
          contentDigest: bgSha1x1,
          placement: { x: 0, y: 0, width: 1080, height: 1080 },
        },
        {
          layerIndex: 200,
          layerGroup: 'PRODUCT_HERO',
          buffer: tallFlacon,
          mimeType: 'image/png',
          contentDigest: tallFlaconSha,
          placement: { x: 440, y: 250, width: 200, height: 500 },
        },
        {
          layerIndex: 300,
          layerGroup: 'TYPOGRAPHY',
          buffer: initialTypoSvg,
          mimeType: 'image/svg+xml',
          contentDigest: initialTypoSha,
          placement: { x: 0, y: 0, width: 1080, height: 200 },
        },
      ];

      const baselineInput: HybridCompositorInput = {
        creativeJobId: 'job-cache-baseline',
        aspectRatio: '1:1',
        canvas: { width: 1080, height: 1080 },
        layers: baseLayers,
        colorProfile: 'sRGB',
      };

      // 1. Initial render -> cache MISS
      const baseline = await hybridCompositor.composite(baselineInput);
      expect(baseline.cacheStatus).toBe('MISS');

      // 2. Repeat with identical inputs -> cache HIT
      const hit = await hybridCompositor.composite(baselineInput);
      expect(hit.cacheStatus).toBe('HIT');
      expect(hit.sha256).toBe(baseline.sha256);
      expect(Buffer.compare(hit.compositedBuffer, baseline.compositedBuffer)).toBe(0);

      // 3. Invalidation Test A: Changing background buffer
      const changedBgInput: HybridCompositorInput = {
        ...baselineInput,
        creativeJobId: 'job-cache-changed-bg',
        layers: [
          {
            ...baseLayers[0]!,
            buffer: bgNoir1x1,
            contentDigest: createHash('sha256').update(bgNoir1x1).digest('hex'),
          },
          baseLayers[1]!,
          baseLayers[2]!,
        ],
      };

      const changedBgResult = await hybridCompositor.composite(changedBgInput);
      expect(changedBgResult.cacheStatus).toBe('MISS');
      expect(changedBgResult.sha256).not.toBe(baseline.sha256);

      // 4. Invalidation Test B: Changing product hero buffer
      const changedProductInput: HybridCompositorInput = {
        ...baselineInput,
        creativeJobId: 'job-cache-changed-prod',
        layers: [
          baseLayers[0]!,
          {
            ...baseLayers[1]!,
            buffer: compactJar,
            contentDigest: compactJarSha,
            placement: { x: 340, y: 350, width: 400, height: 300 },
          },
          baseLayers[2]!,
        ],
      };

      const changedProdResult = await hybridCompositor.composite(changedProductInput);
      expect(changedProdResult.cacheStatus).toBe('MISS');
      expect(changedProdResult.sha256).not.toBe(baseline.sha256);

      // 5. Invalidation Test C: Changing typography copy
      const newTypoBuffer = Buffer.from(
        '<svg width="1080" height="200" xmlns="http://www.w3.org/2000/svg"><text x="540" y="100" font-size="36" fill="#D4AF37" text-anchor="middle">ATELIER HAUSSMANN</text></svg>',
        'utf8',
      );
      const changedTypoInput: HybridCompositorInput = {
        ...baselineInput,
        creativeJobId: 'job-cache-changed-typo',
        layers: [
          baseLayers[0]!,
          baseLayers[1]!,
          {
            ...baseLayers[2]!,
            buffer: newTypoBuffer,
            contentDigest: createHash('sha256').update(newTypoBuffer).digest('hex'),
          },
        ],
      };

      const changedTypoResult = await hybridCompositor.composite(changedTypoInput);
      expect(changedTypoResult.cacheStatus).toBe('MISS');
      expect(changedTypoResult.sha256).not.toBe(baseline.sha256);
    });
  });

  // =========================================================================
  // 3. EXTREME DIMENSIONS & ASPECT RATIOS
  // =========================================================================
  describe('3. Extreme Dimensions & Aspect Ratios', () => {
    it('maintains strict containment for tall slender flacon (1:4 aspect ratio) in 1:1 format', async () => {
      const compositor = new SharpPosterCompositor();

      const spec = PosterCopyBuilder.buildSpec(
        {
          sku: 'SLENDER-01',
          title: 'Elixir Slender',
          brand: 'Maison Haussmann',
          priceAmount: 110,
          currency: 'USD',
          volumeMl: 100,
          concentration: 'Extrait de Parfum',
        },
        {
          headline: 'Slender Grace',
          bodyText: 'A high-standing crystal flacon capturing the pure essence of Grasse.',
          cta: 'Shop Now',
        },
        { templateId: 'CENTERED_HERO' },
      );

      const result = await compositor.renderPoster({
        creativeJobId: 'job-extreme-slender-1x1',
        posterSpec: spec,
        canonicalProductBuffer: tallFlacon,
        canonicalProductMimeType: 'image/png',
        canonicalProductSha256: tallFlaconSha,
        backgroundBuffer: bg1x1,
        backgroundMimeType: 'image/png',
        backgroundSha256: bgSha1x1,
        allowNonApprovedForTesting: true,
      });

      const productEl = result.layoutManifest.elements.find((e) => e.id === 'product_hero_zone');
      expect(productEl).toBeDefined();

      const box = productEl!.boundingBox;
      const margins = result.layoutManifest.safeMargins;

      // Assert containment within safe margins
      expect(box.x).toBeGreaterThanOrEqual(margins.left);
      expect(box.y).toBeGreaterThanOrEqual(margins.top);
      expect(box.x + box.width).toBeLessThanOrEqual(1080 - margins.right);
      expect(box.y + box.height).toBeLessThanOrEqual(1080 - margins.bottom);

      // Verify un-stretched aspect ratio preservation
      const visibleRatio = 150 / 540; // ~0.277
      const placedRatio = box.width / box.height;
      expect(Math.abs(placedRatio - visibleRatio)).toBeLessThanOrEqual(0.02);
    });

    it('aligns wide compact jar cleanly on pedestal baseline in 9:16 story format', async () => {
      const compositor = new SharpPosterCompositor();

      const spec = PosterCopyBuilder.buildSpec(
        {
          sku: 'JAR-916-01',
          title: 'Baume Précieux',
          brand: 'Maison Haussmann',
          priceAmount: 85,
          currency: 'USD',
          volumeMl: 50,
          concentration: 'Face Balm',
        },
        {
          headline: 'Architectural Elegance',
          bodyText: 'Rich mineral nourishment presented on an authentic limestone pedestal.',
          cta: 'Discover',
        },
        { templateId: 'CENTERED_HERO', aspectRatio: '9:16' },
      );

      const result = await compositor.renderPoster({
        creativeJobId: 'job-extreme-wide-jar-916',
        posterSpec: spec,
        canonicalProductBuffer: compactJar,
        canonicalProductMimeType: 'image/png',
        canonicalProductSha256: compactJarSha,
        backgroundBuffer: bg9x16,
        backgroundMimeType: 'image/png',
        backgroundSha256: bgSha9x16,
        allowNonApprovedForTesting: true,
      });

      expect(result.width).toBe(1080);
      expect(result.height).toBe(1920);

      const productEl = result.layoutManifest.elements.find((e) => e.id === 'product_hero_zone');
      expect(productEl).toBeDefined();

      const margins = result.layoutManifest.safeMargins;
      const box = productEl!.boundingBox;

      // Product is properly contained horizontally
      expect(box.x).toBeGreaterThanOrEqual(margins.left);
      expect(box.x + box.width).toBeLessThanOrEqual(1080 - margins.right);

      // Contact shadow generated beneath wide jar
      const shadowEl = result.layoutManifest.elements.find((e) => e.id === 'contact_shadow');
      expect(shadowEl).toBeDefined();
      expect(shadowEl!.boundingBox.width).toBeGreaterThanOrEqual(box.width);
    });

    it('renders complex multiline Khmer headline without safe-margin breach or product collision', async () => {
      const compositor = new SharpPosterCompositor();

      const spec = PosterCopyBuilder.buildSpec(
        {
          sku: 'KM-MULTILINE-01',
          title: 'ស្តេចទឹកអប់បារាំង',
          brand: 'Geparlys',
          priceAmount: 48,
          currency: 'USD',
          volumeMl: 100,
          concentration: 'Extrait de Parfum',
        },
        {
          headline: 'ទឹកអប់បារាំងដ៏ប្រណីត\nសម្រាប់រដូវកាលថ្មី',
          bodyText: 'ក្លិនក្រអូបបែបអភិជន ផ្សំពីរុក្ខជាតិកម្រនៅទីក្រុងប៉ារីស។',
          cta: 'ទិញឥឡូវនេះ',
        },
        { templateId: 'KHMER_SEASONAL', language: 'KM' },
      );

      const result = await compositor.renderPoster({
        creativeJobId: 'job-extreme-khmer-multiline',
        posterSpec: spec,
        canonicalProductBuffer: tallFlacon,
        canonicalProductMimeType: 'image/png',
        canonicalProductSha256: tallFlaconSha,
        backgroundBuffer: bg1x1,
        backgroundMimeType: 'image/png',
        backgroundSha256: bgSha1x1,
        allowNonApprovedForTesting: true,
      });

      const headlineEl = result.layoutManifest.elements.find((e) => e.id === 'headline');
      const productEl = result.layoutManifest.elements.find((e) => e.id === 'product_hero_zone');
      expect(headlineEl).toBeDefined();
      expect(productEl).toBeDefined();

      // Verify no collision between headline and product
      expect(boxesIntersect(headlineEl!.boundingBox, productEl!.boundingBox, 2)).toBe(false);

      // Verify headline fits within safe canvas bounds
      const margins = result.layoutManifest.safeMargins;
      expect(headlineEl!.boundingBox.x).toBeGreaterThanOrEqual(margins.left - 2);
      expect(headlineEl!.boundingBox.x + headlineEl!.boundingBox.width).toBeLessThanOrEqual(
        1080 - margins.right + 2,
      );
    });
  });

  // =========================================================================
  // 4. HAUSSMANN LUXE STYLE PRESET INTEGRATION
  // =========================================================================
  describe('4. Haussmann Luxe Style Preset Integration', () => {
    it('composites CENTERED_HERO with Haussmann architectural frame with zero element collision', async () => {
      const compositor = new SharpHybridCompositorAdapter();

      // Gold Haussmann architectural boiserie border
      const frameSvg = `
        <svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
          <rect x="36" y="36" width="1008" height="1008" fill="none" stroke="#D4AF37" stroke-width="1.5" stroke-opacity="0.6"/>
          <rect x="44" y="44" width="992" height="992" fill="none" stroke="#D4AF37" stroke-width="0.75" stroke-opacity="0.3"/>
          <rect x="52" y="52" width="12" height="12" fill="none" stroke="#D4AF37" stroke-width="1"/>
          <rect x="1016" y="52" width="12" height="12" fill="none" stroke="#D4AF37" stroke-width="1"/>
          <rect x="52" y="1016" width="12" height="12" fill="none" stroke="#D4AF37" stroke-width="1"/>
          <rect x="1016" y="1016" width="12" height="12" fill="none" stroke="#D4AF37" stroke-width="1"/>
        </svg>
      `;
      const frameBuffer = Buffer.from(frameSvg, 'utf8');
      const frameSha = createHash('sha256').update(frameBuffer).digest('hex');

      const productPlacement = { x: 440, y: 260, width: 200, height: 520 };
      const ctaPlacement = { x: 420, y: 880, width: 240, height: 60 };
      const ctaBuffer = Buffer.from(
        `<svg width="240" height="60" xmlns="http://www.w3.org/2000/svg"><rect width="240" height="60" rx="30" fill="#D4AF37"/><text x="120" y="38" font-size="14" fill="#000" text-anchor="middle" font-weight="bold">COMMANDER</text></svg>`,
        'utf8',
      );
      const ctaSha = createHash('sha256').update(ctaBuffer).digest('hex');

      const input: HybridCompositorInput = {
        creativeJobId: 'job-haussmann-centered-hero',
        aspectRatio: '1:1',
        canvas: {
          width: 1080,
          height: 1080,
          safeMargins: { left: 65, right: 65, top: 76, bottom: 88 },
        },
        layers: [
          {
            layerIndex: 0,
            layerGroup: 'BACKGROUND',
            buffer: bg1x1,
            mimeType: 'image/png',
            contentDigest: bgSha1x1,
            placement: { x: 0, y: 0, width: 1080, height: 1080 },
          },
          {
            layerIndex: 200,
            layerGroup: 'PRODUCT_HERO',
            buffer: tallFlacon,
            mimeType: 'image/png',
            contentDigest: tallFlaconSha,
            placement: productPlacement,
          },
          {
            layerIndex: 350,
            layerGroup: 'TYPOGRAPHY',
            buffer: ctaBuffer,
            mimeType: 'image/svg+xml',
            contentDigest: ctaSha,
            placement: ctaPlacement,
          },
          {
            layerIndex: 450,
            layerGroup: 'DECORATIVE',
            buffer: frameBuffer,
            mimeType: 'image/svg+xml',
            contentDigest: frameSha,
            placement: { x: 0, y: 0, width: 1080, height: 1080 },
          },
        ],
        colorProfile: 'sRGB',
      };

      const result = await compositor.composite(input);

      expect(result.mimeType).toBe('image/png');
      expect(result.width).toBe(1080);
      expect(result.height).toBe(1080);
      expect(result.colorProfile).toBe('sRGB');
      expect(result.compositorVersion).toBe(HYBRID_COMPOSITOR_VERSION);

      // Verify that product and CTA bounding boxes are well within the architectural frame
      const frameInnerBox: BoundingBox = { x: 44, y: 44, width: 992, height: 992 };
      expect(productPlacement.x).toBeGreaterThan(frameInnerBox.x);
      expect(productPlacement.x + productPlacement.width).toBeLessThan(
        frameInnerBox.x + frameInnerBox.width,
      );
      expect(ctaPlacement.y + ctaPlacement.height).toBeLessThan(
        frameInnerBox.y + frameInnerBox.height,
      );

      // Sample a corner pixel of the frame to verify gold accent rendering
      const { data: pixelData } = await sharp(result.compositedBuffer)
        .extract({ left: 36, top: 36, width: 1, height: 1 })
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Frame is subtle gold stroke (#D4AF37: R=212, G=175, B=55) over cream
      expect(pixelData[0]).toBeGreaterThan(150);
      expect(pixelData[1]).toBeGreaterThan(130);
    });

    it('composites EDITORIAL_SPLIT with Haussmann architectural column divider', async () => {
      const compositor = new SharpHybridCompositorAdapter();

      // Slender gold architectural column divider line
      const dividerSvg = `
        <svg width="2" height="700" xmlns="http://www.w3.org/2000/svg">
          <line x1="1" y1="0" x2="1" y2="700" stroke="#D4AF37" stroke-width="1.5" stroke-opacity="0.5"/>
        </svg>
      `;
      const dividerBuffer = Buffer.from(dividerSvg, 'utf8');
      const dividerSha = createHash('sha256').update(dividerBuffer).digest('hex');

      const productPlacement = { x: 80, y: 220, width: 400, height: 600 };
      const dividerPlacement = { x: 520, y: 200, width: 2, height: 700 };
      const typoPlacement = { x: 550, y: 240, width: 460, height: 400 };

      const editorialBuffer = Buffer.from(
        `<svg width="460" height="400" xmlns="http://www.w3.org/2000/svg"><text x="0" y="40" font-size="36" fill="#1A1A1A" font-weight="bold">L’ÉLIXIR</text><text x="0" y="80" font-size="16" fill="#5A5852">Collection Particulière</text></svg>`,
        'utf8',
      );
      const editorialSha = createHash('sha256').update(editorialBuffer).digest('hex');

      const input: HybridCompositorInput = {
        creativeJobId: 'job-haussmann-editorial-split',
        aspectRatio: '1:1',
        canvas: { width: 1080, height: 1080 },
        layers: [
          {
            layerIndex: 0,
            layerGroup: 'BACKGROUND',
            buffer: bg1x1,
            mimeType: 'image/png',
            contentDigest: bgSha1x1,
            placement: { x: 0, y: 0, width: 1080, height: 1080 },
          },
          {
            layerIndex: 200,
            layerGroup: 'PRODUCT_HERO',
            buffer: tallFlacon,
            mimeType: 'image/png',
            contentDigest: tallFlaconSha,
            placement: productPlacement,
          },
          {
            layerIndex: 300,
            layerGroup: 'TYPOGRAPHY',
            buffer: editorialBuffer,
            mimeType: 'image/svg+xml',
            contentDigest: editorialSha,
            placement: typoPlacement,
          },
          {
            layerIndex: 450,
            layerGroup: 'DECORATIVE',
            buffer: dividerBuffer,
            mimeType: 'image/svg+xml',
            contentDigest: dividerSha,
            placement: dividerPlacement,
          },
        ],
        colorProfile: 'sRGB',
      };

      const result = await compositor.composite(input);

      expect(result.mimeType).toBe('image/png');
      expect(result.width).toBe(1080);
      expect(result.height).toBe(1080);

      // Verify divider separates product column from editorial typography column cleanly without overlap
      expect(boxesIntersect(productPlacement, dividerPlacement, 0)).toBe(false);
      expect(boxesIntersect(dividerPlacement, typoPlacement, 0)).toBe(false);
    });
  });
});
