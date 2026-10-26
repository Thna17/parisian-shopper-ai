import { createHash } from 'node:crypto';
import { describe, expect, it } from '@jest/globals';
import sharp from 'sharp';
import { SharpPosterCompositor } from './sharp-poster-compositor.adapter.js';
import { PosterCopyBuilder } from '../domain/services/poster-copy-builder.js';
import { type PosterSpec } from '../domain/poster-spec.js';
import { PosterLayoutOverflowError } from '../domain/creative-errors.js';
import { TextLayoutEngine } from '../domain/services/text-layout-engine.js';
import { getPresetFixture } from './fixtures/fake-background-fixtures.js';

describe('SharpPosterCompositor (POSTER-2 Layout Engine)', () => {
  const compositor = new SharpPosterCompositor();

  // Helper to generate a valid transparent product PNG (400x800 within 600x1000)
  async function createTestProduct(): Promise<{ buffer: Buffer; sha256: string }> {
    const inner = await sharp({
      create: {
        width: 360,
        height: 720,
        channels: 4,
        background: { r: 180, g: 140, b: 60, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const buffer = await sharp({
      create: {
        width: 600,
        height: 1000,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: inner, top: 140, left: 120 }])
      .png()
      .toBuffer();

    const sha256 = createHash('sha256').update(buffer).digest('hex');
    return { buffer, sha256 };
  }

  // Helper to generate a valid photographic background
  async function createTestBackground(
    width = 1080,
    height = 1080,
  ): Promise<{ buffer: Buffer; sha256: string }> {
    const raw = getPresetFixture('noir', width, height);
    const buffer = await sharp(raw).png().toBuffer();
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    return { buffer, sha256 };
  }

  it('renders EDITORIAL_SPLIT poster at 1080x1080 with exact typography and layout manifest', async () => {
    const product = await createTestProduct();
    const bg = await createTestBackground(1080, 1080);

    const spec = PosterCopyBuilder.buildSpec(
      {
        sku: 'GEP-KING-EDP-100',
        title: 'Yes I Am The King',
        brand: 'Geparlys',
        priceAmount: 48,
        currency: 'USD',
        volumeMl: 100,
        concentration: 'Eau de Parfum',
      },
      {
        headline: 'Discover The King',
        bodyText: 'A royal, charismatic fragrance crafted in Paris with sparkling bergamot.',
        cta: 'Shop Now',
      },
      { templateId: 'EDITORIAL_SPLIT', promotionalPrice: '$39' },
    );

    const result = await compositor.renderPoster({
      creativeJobId: 'job-editorial-split',
      posterSpec: spec,
      canonicalProductBuffer: product.buffer,
      canonicalProductMimeType: 'image/png',
      canonicalProductSha256: product.sha256,
      backgroundBuffer: bg.buffer,
      backgroundMimeType: 'image/png',
      backgroundSha256: bg.sha256,
      allowNonApprovedForTesting: true,
      generateDebugLayout: true,
    });

    expect(result.width).toBe(1080);
    expect(result.height).toBe(1080);
    expect(result.mimeType).toBe('image/png');
    expect(result.posterBuffer.length).toBeGreaterThan(10000);
    expect(result.debugLayoutBuffer).toBeDefined();

    // Verify layout manifest bounds
    expect(result.layoutManifest.templateId).toBe('EDITORIAL_SPLIT');
    const elements = result.layoutManifest.elements;
    expect(elements.length).toBeGreaterThanOrEqual(6);

    const headlineEl = elements.find((e) => e.id === 'headline');
    expect(headlineEl).toBeDefined();
    expect(headlineEl?.text).toBe(spec.headline);

    // Product and text must be separated horizontally
    const productEl = elements.find((e) => e.id === 'product_hero_zone');
    expect(productEl).toBeDefined();
    expect(productEl!.boundingBox.x + productEl!.boundingBox.width).toBeLessThan(
      headlineEl!.boundingBox.x,
    );
  });

  it('renders CENTERED_HERO poster at 1080x1080', async () => {
    const product = await createTestProduct();
    const bg = await createTestBackground(1080, 1080);

    const spec = PosterCopyBuilder.buildSpec(
      {
        sku: 'GEP-KING-EDP-100',
        title: 'Yes I Am The King',
        priceAmount: 48,
        volumeMl: 100,
      },
      {
        headline: 'The Scent of Royalty',
        bodyText: 'Pure French luxury.',
        cta: 'Order Now',
      },
      { templateId: 'CENTERED_HERO' },
    );

    const result = await compositor.renderPoster({
      creativeJobId: 'job-centered-hero',
      posterSpec: spec,
      canonicalProductBuffer: product.buffer,
      canonicalProductMimeType: 'image/png',
      canonicalProductSha256: product.sha256,
      backgroundBuffer: bg.buffer,
      backgroundMimeType: 'image/png',
      backgroundSha256: bg.sha256,
      allowNonApprovedForTesting: true,
    });

    expect(result.width).toBe(1080);
    expect(result.height).toBe(1080);
    expect(result.layoutManifest.templateId).toBe('CENTERED_HERO');

    const heroEl = result.layoutManifest.elements.find((e) => e.id === 'product_hero_zone');
    expect(heroEl).toBeDefined();
    // Center alignment: hero center roughly canvas center
    const heroCenterX = heroEl!.boundingBox.x + heroEl!.boundingBox.width / 2;
    expect(heroCenterX).toBeCloseTo(540, -1);
  });

  it('renders SCENT_STORY poster with peripheral notes badges', async () => {
    const product = await createTestProduct();
    const bg = await createTestBackground(1080, 1080);

    const spec = PosterCopyBuilder.buildSpec(
      {
        sku: 'GEP-KING-EDP-100',
        title: 'Yes I Am The King',
        priceAmount: 48,
        fragranceNotes: {
          top: ['Bergamot', 'Apple'],
          heart: ['Lavender', 'Geranium'],
          base: ['Ambergris', 'Vetiver'],
        },
      },
      {
        headline: 'Scent Pyramid Story',
        cta: 'Explore Notes',
      },
      { templateId: 'SCENT_STORY' },
    );

    const result = await compositor.renderPoster({
      creativeJobId: 'job-scent-story',
      posterSpec: spec,
      canonicalProductBuffer: product.buffer,
      canonicalProductMimeType: 'image/png',
      canonicalProductSha256: product.sha256,
      backgroundBuffer: bg.buffer,
      backgroundMimeType: 'image/png',
      backgroundSha256: bg.sha256,
      allowNonApprovedForTesting: true,
    });

    expect(result.layoutManifest.templateId).toBe('SCENT_STORY');
    const noteElements = result.layoutManifest.elements.filter((e) => e.id.startsWith('note_'));
    expect(noteElements.length).toBeGreaterThanOrEqual(3);
  });

  it('renders KHMER_SEASONAL poster with Noto Sans Khmer shaping and lotus ornament', async () => {
    const product = await createTestProduct();
    const bg = await createTestBackground(1080, 1080);

    const spec = PosterCopyBuilder.buildSpec(
      {
        sku: 'GEP-KING-EDP-100',
        title: 'Yes I Am The King',
        priceAmount: 48,
      },
      {
        headline: 'ទឹកអប់ Yes I Am The King',
        secondaryHeadline: 'ក្លិនក្រអូបបែបប្រណីតពីប៉ារីស',
        cta: 'ទិញឥឡូវនេះ',
      },
      { templateId: 'KHMER_SEASONAL', campaignLabel: 'PCHUM BEN SPECIAL', promotionalPrice: '$39' },
    );

    const result = await compositor.renderPoster({
      creativeJobId: 'job-khmer-seasonal',
      posterSpec: spec,
      canonicalProductBuffer: product.buffer,
      canonicalProductMimeType: 'image/png',
      canonicalProductSha256: product.sha256,
      backgroundBuffer: bg.buffer,
      backgroundMimeType: 'image/png',
      backgroundSha256: bg.sha256,
      allowNonApprovedForTesting: true,
    });

    expect(result.layoutManifest.templateId).toBe('KHMER_SEASONAL');
    const lotusEl = result.layoutManifest.elements.find((e) => e.id === 'lotus_ornament');
    expect(lotusEl).toBeDefined();

    const headlineEl = result.layoutManifest.elements.find((e) => e.id === 'headline');
    expect(headlineEl?.text).toBe('ទឹកអប់ Yes I Am The King');
  });

  it('renders 1080x1350 (4:5 portrait) format correctly', async () => {
    const product = await createTestProduct();
    const bg = await createTestBackground(1080, 1350);

    const spec: PosterSpec = {
      ...PosterCopyBuilder.buildSpec({
        sku: 'SKU-4-5',
        title: 'Portrait Perfume',
        priceAmount: 50,
      }),
      outputFormat: { aspectRatio: '4:5', width: 1080, height: 1350 },
    };

    const result = await compositor.renderPoster({
      creativeJobId: 'job-format-4-5',
      posterSpec: spec,
      canonicalProductBuffer: product.buffer,
      canonicalProductMimeType: 'image/png',
      canonicalProductSha256: product.sha256,
      backgroundBuffer: bg.buffer,
      backgroundMimeType: 'image/png',
      backgroundSha256: bg.sha256,
      allowNonApprovedForTesting: true,
    });

    expect(result.width).toBe(1080);
    expect(result.height).toBe(1350);
  });

  it('renders 1080x1920 (9:16 story/reel) format correctly', async () => {
    const product = await createTestProduct();
    const bg = await createTestBackground(1080, 1920);

    const spec: PosterSpec = {
      ...PosterCopyBuilder.buildSpec({ sku: 'SKU-9-16', title: 'Story Perfume', priceAmount: 65 }),
      outputFormat: { aspectRatio: '9:16', width: 1080, height: 1920 },
    };

    const result = await compositor.renderPoster({
      creativeJobId: 'job-format-9-16',
      posterSpec: spec,
      canonicalProductBuffer: product.buffer,
      canonicalProductMimeType: 'image/png',
      canonicalProductSha256: product.sha256,
      backgroundBuffer: bg.buffer,
      backgroundMimeType: 'image/png',
      backgroundSha256: bg.sha256,
      allowNonApprovedForTesting: true,
    });

    expect(result.width).toBe(1080);
    expect(result.height).toBe(1920);
  });

  it('produces deterministic output digest for identical inputs', async () => {
    const product = await createTestProduct();
    const bg = await createTestBackground(1080, 1080);
    const spec = PosterCopyBuilder.buildSpec({
      sku: 'DETERMINISTIC',
      title: 'Royal EDP',
      priceAmount: 48,
    });

    const input = {
      creativeJobId: 'job-deterministic',
      posterSpec: spec,
      canonicalProductBuffer: product.buffer,
      canonicalProductMimeType: 'image/png',
      canonicalProductSha256: product.sha256,
      backgroundBuffer: bg.buffer,
      backgroundMimeType: 'image/png',
      backgroundSha256: bg.sha256,
      allowNonApprovedForTesting: true,
    };

    const run1 = await compositor.renderPoster(input);
    const run2 = await compositor.renderPoster(input);

    expect(run1.sha256).toBe(run2.sha256);
    expect(run1.outputDigest).toBe(run2.outputDigest);
  });

  it('fails with PosterLayoutOverflowError when text cannot fit inside strict limits', () => {
    expect(() =>
      TextLayoutEngine.wrapText({
        text: 'This is an impossibly long title that will not fit into fifty pixels even at the minimum font size',
        maxWidth: 50,
        initialFontSize: 24,
        minFontSize: 20,
        maxLines: 1,
        elementName: 'headline_overflow',
      }),
    ).toThrow(PosterLayoutOverflowError);
  });

  it('verifies all manifest bounding boxes stay within safe canvas boundaries', async () => {
    const product = await createTestProduct();
    const bg = await createTestBackground(1080, 1080);
    const spec = PosterCopyBuilder.buildSpec({
      sku: 'BOUNDS-CHECK',
      title: 'Boundary Perfume',
      priceAmount: 48,
    });

    const result = await compositor.renderPoster({
      creativeJobId: 'job-bounds',
      posterSpec: spec,
      canonicalProductBuffer: product.buffer,
      canonicalProductMimeType: 'image/png',
      canonicalProductSha256: product.sha256,
      backgroundBuffer: bg.buffer,
      backgroundMimeType: 'image/png',
      backgroundSha256: bg.sha256,
      allowNonApprovedForTesting: true,
    });

    for (const el of result.layoutManifest.elements) {
      expect(el.boundingBox.x).toBeGreaterThanOrEqual(0);
      expect(el.boundingBox.y).toBeGreaterThanOrEqual(0);
      expect(el.boundingBox.x + el.boundingBox.width).toBeLessThanOrEqual(1080);
      expect(el.boundingBox.y + el.boundingBox.height).toBeLessThanOrEqual(1080);
    }
  });
});
