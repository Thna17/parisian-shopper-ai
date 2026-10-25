import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { PosterSpec } from '../domain/poster-spec.js';
import { PosterTemplateRenderer } from '../domain/poster-templates.js';
import { loadEmbeddedFonts } from './fonts/font-loader.js';
import { SharpPosterCompositor } from './sharp-poster-compositor.adapter.js';

describe('Representative Poster Render Integration (W21 Deliverable I & W21-F)', () => {
  const posterSpec: PosterSpec = {
    templateId: 'EDITORIAL_SPLIT',
    language: 'BILINGUAL',
    productPlacement: 'LEFT',
    textPlacement: 'RIGHT',
    headline: 'រចនាបថប៉ារីស — Parisian Elegance',
    secondaryHeadline: 'ខូឡិកសិនថ្មី ២០២៦',
    supportingText: 'ស្វែងរកភាពស្រស់ស្អាតជាមួយ Parisian Shopper $48',
    price: '$48.00',
    promotionalPrice: '$38.00',
    currency: 'USD',
    cta: 'ទិញឥឡូវនេះ',
    campaignLabel: 'SUMMER EDITION',
    outputFormat: {
      aspectRatio: '4:5',
      width: 1080,
      height: 1350,
    },
    palette: {
      id: 'palette-w21',
      accentColor: '#E5C07B',
      textColor: '#FFFFFF',
      secondaryTextColor: '#D0D0D0',
      badgeBackground: 'rgba(229,192,123,0.18)',
    },
  };

  interface TestFixtures {
    readonly backgroundBuffer: Buffer;
    readonly backgroundSha256: string;
    readonly canonicalProductBuffer: Buffer;
    readonly canonicalProductSha256: string;
  }

  async function createFixtures(): Promise<TestFixtures> {
    const backgroundBuffer = await sharp({
      create: {
        width: 1080,
        height: 1350,
        channels: 3,
        background: { r: 18, g: 20, b: 24 },
      },
    })
      .jpeg()
      .toBuffer();
    const backgroundSha256 = createHash('sha256').update(backgroundBuffer).digest('hex');

    const canonicalProductBuffer = await sharp({
      create: {
        width: 480,
        height: 640,
        channels: 4,
        background: { r: 212, g: 175, b: 55, alpha: 0.95 },
      },
    })
      .png()
      .toBuffer();
    const canonicalProductSha256 = createHash('sha256')
      .update(canonicalProductBuffer)
      .digest('hex');

    return {
      backgroundBuffer,
      backgroundSha256,
      canonicalProductBuffer,
      canonicalProductSha256,
    };
  }

  it('renders a deterministic, production-quality poster with mixed Khmer and Latin typography', async () => {
    const fixtures = await createFixtures();
    const compositor = new SharpPosterCompositor();
    const result = await compositor.renderPoster({
      creativeJobId: 'job-w21-integration-test',
      posterSpec,
      canonicalProductBuffer: fixtures.canonicalProductBuffer,
      canonicalProductMimeType: 'image/png',
      canonicalProductSha256: fixtures.canonicalProductSha256,
      backgroundBuffer: fixtures.backgroundBuffer,
      backgroundMimeType: 'image/jpeg',
      backgroundSha256: fixtures.backgroundSha256,
    });

    expect(result.mimeType).toBe('image/png');
    expect(result.width).toBe(1080);
    expect(result.height).toBe(1350);
    expect(result.byteSize).toBeGreaterThan(10000);
    expect(result.posterBuffer.length).toBe(result.byteSize);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);

    // Verify layout manifest reflects shaped layout elements
    expect(result.layoutManifest.elements.length).toBeGreaterThanOrEqual(4);
    const textElements = result.layoutManifest.elements.filter((e) => e.type === 'TEXT');
    expect(textElements.length).toBeGreaterThanOrEqual(3);

    // Verify resulting image metadata using Sharp
    const metadata = await sharp(result.posterBuffer).metadata();
    expect(metadata.format).toBe('png');
    expect(metadata.width).toBe(1080);
    expect(metadata.height).toBe(1350);
    expect(metadata.channels).toBe(4); // RGBA
  });

  it('produces bit-exact rasterization determinism across repeated renders with identical inputs', async () => {
    const fixtures = await createFixtures();
    const compositor = new SharpPosterCompositor();

    const renderInput = {
      creativeJobId: 'job-w21-determinism-test',
      posterSpec,
      canonicalProductBuffer: fixtures.canonicalProductBuffer,
      canonicalProductMimeType: 'image/png',
      canonicalProductSha256: fixtures.canonicalProductSha256,
      backgroundBuffer: fixtures.backgroundBuffer,
      backgroundMimeType: 'image/jpeg',
      backgroundSha256: fixtures.backgroundSha256,
    };

    const run1 = await compositor.renderPoster(renderInput);
    const run2 = await compositor.renderPoster(renderInput);

    expect(run1.sha256).toBe(run2.sha256);
    expect(run1.byteSize).toBe(run2.byteSize);
    expect(run1.posterBuffer.equals(run2.posterBuffer)).toBe(true);
  });

  it('guarantees layout manifest elements have valid positive dimensions and stay within canvas bounds', async () => {
    const fixtures = await createFixtures();
    const compositor = new SharpPosterCompositor();

    const result = await compositor.renderPoster({
      creativeJobId: 'job-w21-bounds-test',
      posterSpec,
      canonicalProductBuffer: fixtures.canonicalProductBuffer,
      canonicalProductMimeType: 'image/png',
      canonicalProductSha256: fixtures.canonicalProductSha256,
      backgroundBuffer: fixtures.backgroundBuffer,
      backgroundMimeType: 'image/jpeg',
      backgroundSha256: fixtures.backgroundSha256,
    });

    const manifest = result.layoutManifest;
    const { width, height } = manifest.dimensions;
    const { top, bottom, left, right } = manifest.safeMargins;

    for (const element of manifest.elements) {
      const box = element.boundingBox;
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.y + box.height).toBeLessThanOrEqual(height);

      if (element.type === 'TEXT') {
        expect(box.x).toBeGreaterThanOrEqual(left - 1);
        expect(box.x + box.width).toBeLessThanOrEqual(width - right + 1);
        expect(box.y).toBeGreaterThanOrEqual(top - 1);
        expect(box.y + box.height).toBeLessThanOrEqual(height - bottom + 1);
      }
    }
  });

  it('renders multi-script runs via hermetic SVG <tspan> elements with approved fonts and no OS fallbacks', () => {
    const fonts = loadEmbeddedFonts();
    const computed = PosterTemplateRenderer.renderTemplate(posterSpec, fonts.fontFaceCss);

    // Verify SVG overlay contains <tspan> tags partitioning Khmer and Latin scripts
    expect(computed.svgOverlay).toContain('<tspan font-family="Noto Sans Khmer"');
    expect(computed.svgOverlay).toContain('<tspan font-family="Montserrat"');
    expect(computed.svgOverlay).toContain('font-family="Playfair Display"');

    // Verify no unapproved host operating system font families are referenced
    const forbiddenHostFonts = ['Arial', 'Helvetica', 'Times New Roman', 'Apple Color Emoji', 'system-ui'];
    for (const forbidden of forbiddenHostFonts) {
      expect(computed.svgOverlay).not.toContain(forbidden);
    }

    // Verify embedded OFL @font-face rules are present in SVG overlay
    expect(computed.svgOverlay).toContain('@font-face');
    expect(computed.svgOverlay).toContain('Playfair Display');
    expect(computed.svgOverlay).toContain('Noto Sans Khmer');
    expect(computed.svgOverlay).toContain('Montserrat');
  });
});
