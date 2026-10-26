import { createHash } from 'node:crypto';
import { describe, expect, it, beforeAll } from '@jest/globals';
import sharp from 'sharp';
import {
  PosterFontNotFoundError,
  PosterFontIntegrityError,
  PosterUnsupportedScriptError,
  PosterUnsafeUnicodeError,
} from '../domain/creative-errors.js';
import { GOLDEN_TYPOGRAPHY_CORPUS } from '../domain/services/__fixtures__/golden-typography-corpus.js';
import { TextLayoutEngine } from '../domain/services/text-layout-engine.js';
import { renderShapedTextLineSvg } from '../domain/services/safe-svg-renderer.js';
import { FontRegistry } from './fonts/font-registry.js';
import { HarfBuzzShapingService } from './fonts/harfbuzz-shaping-service.js';
import { APPROVED_FONT_MANIFEST, verifyFontIntegrity } from './fonts/font-manifest.js';
import { SharpPosterCompositor } from './sharp-poster-compositor.adapter.js';
import type { PosterSpec } from '../domain/poster-spec.js';

interface TestFixtures {
  readonly backgroundBuffer: Buffer;
  readonly backgroundSha256: string;
  readonly canonicalProductBuffer: Buffer;
  readonly canonicalProductSha256: string;
}

async function createFixtures(width = 1080, height = 1350): Promise<TestFixtures> {
  const backgroundBuffer = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 18, g: 20, b: 24 },
    },
  })
    .jpeg()
    .toBuffer();
  const backgroundSha256 = createHash('sha256').update(backgroundBuffer).digest('hex');

  const canonicalProductBuffer = await sharp({
    create: {
      width: Math.round(width * 0.44),
      height: Math.round(height * 0.48),
      channels: 4,
      background: { r: 212, g: 175, b: 55, alpha: 0.95 },
    },
  })
    .png()
    .toBuffer();
  const canonicalProductSha256 = createHash('sha256').update(canonicalProductBuffer).digest('hex');

  return {
    backgroundBuffer,
    backgroundSha256,
    canonicalProductBuffer,
    canonicalProductSha256,
  };
}

describe('Golden Corpus Typography & Acceptance Verification (W21-G)', () => {
  beforeAll(() => {
    TextLayoutEngine.setDefaultShaper(new HarfBuzzShapingService(FontRegistry.getInstance()));
  });

  describe('1. Golden Corpus Glyph Coverage & Zero .notdef Invariant', () => {
    const passingItems = GOLDEN_TYPOGRAPHY_CORPUS.filter((item) => item.shouldPass);

    it(`verifies zero missing glyphs (.notdef / glyphId === 0) across all ${passingItems.length} passing corpus items`, () => {
      let totalGlyphsChecked = 0;

      for (const item of passingItems) {
        const wrapped = TextLayoutEngine.wrapText({
          text: item.text,
          maxWidth: 900,
          initialFontSize: 28,
          minFontSize: 14,
          maxLines: 4,
          elementName: item.id,
          role: item.role ?? 'BODY',
        });

        expect(wrapped.lines.length).toBeGreaterThan(0);
        expect(wrapped.shapedLines.length).toBe(wrapped.lines.length);

        for (const line of wrapped.shapedLines) {
          expect(line.runs.length).toBeGreaterThan(0);
          for (const run of line.runs) {
            expect(run.glyphs.length).toBeGreaterThan(0);
            for (const glyph of run.glyphs) {
              totalGlyphsChecked += 1;
              // glyphId === 0 is the OpenType standard .notdef glyph index
              expect(glyph.glyphId).toBeGreaterThan(0);
              expect(glyph.xAdvance).toBeGreaterThanOrEqual(0);
            }
          }
        }
      }

      // Ensure a significant corpus was evaluated
      expect(totalGlyphsChecked).toBeGreaterThan(300);
    });

    it('verifies all shaped runs map to approved font families without fallback', () => {
      const approvedFamilies = new Set(['Playfair Display', 'Montserrat', 'Noto Sans Khmer']);

      for (const item of passingItems) {
        const wrapped = TextLayoutEngine.wrapText({
          text: item.text,
          maxWidth: 900,
          initialFontSize: 24,
          minFontSize: 12,
          maxLines: 4,
          elementName: item.id,
          role: item.role ?? 'BODY',
        });

        for (const line of wrapped.shapedLines) {
          for (const run of line.runs) {
            expect(approvedFamilies.has(run.fontFamily)).toBe(true);
          }
        }
      }
    });
  });

  describe('2. Khmer Orthography, Subscript Clusters & Orphan Punctuation', () => {
    const orphanPunctuationChars = new Set(['ៗ', '។', '៕', '៖', '៘', '៛']);

    it('asserts no wrapped line index > 0 starts with orphan Khmer punctuation or repetition mark', () => {
      const khmerItems = GOLDEN_TYPOGRAPHY_CORPUS.filter(
        (item) =>
          item.shouldPass && (item.expectedScript === 'KHMER' || item.expectedScript === 'MIXED'),
      );

      for (const item of khmerItems) {
        // Wrap with a narrow maxWidth to force multiple line wraps
        const wrapped = TextLayoutEngine.wrapText({
          text: item.text,
          maxWidth: 220,
          initialFontSize: 22,
          minFontSize: 14,
          maxLines: 6,
          elementName: item.id,
          role: item.role ?? 'BODY',
        });

        if (wrapped.lines.length > 1) {
          for (let i = 1; i < wrapped.lines.length; i++) {
            const line = wrapped.lines[i]!.trim();
            const firstChar = line.charAt(0);
            expect(orphanPunctuationChars.has(firstChar)).toBe(false);
          }
        }
      }
    });

    it('guarantees monosyllabic repetition words (ពិតៗ, ស្អាតៗ, ថ្មីៗ) never split coda consonant from Lek Took', () => {
      const repetitionItems = GOLDEN_TYPOGRAPHY_CORPUS.filter(
        (item) => item.category === 'MONOSYLLABIC_REPETITION',
      );

      expect(repetitionItems.length).toBeGreaterThanOrEqual(3);

      for (const item of repetitionItems) {
        const wrapped = TextLayoutEngine.wrapText({
          text: item.text,
          maxWidth: 200,
          initialFontSize: 24,
          minFontSize: 14,
          maxLines: 4,
          elementName: item.id,
          role: 'HEADLINE',
        });

        const fullWrappedText = wrapped.lines.join('\n');
        for (const forbidden of item.forbiddenBreakSequences ?? []) {
          expect(fullWrappedText).not.toContain(forbidden);
        }
      }
    });

    it('asserts Khmer Coeng (U+17D2) is never stranded at line-end or detached at line-start', () => {
      const coengItem = GOLDEN_TYPOGRAPHY_CORPUS.find(
        (item) => item.id === 'khmer-coeng-clusters',
      )!;
      const wrapped = TextLayoutEngine.wrapText({
        text: coengItem.text,
        maxWidth: 220,
        initialFontSize: 20,
        minFontSize: 14,
        maxLines: 6,
        elementName: coengItem.id,
      });

      expect(wrapped.lines.length).toBeGreaterThan(1);
      for (const line of wrapped.lines) {
        expect(line.endsWith('\u17D2')).toBe(false);
        expect(line.startsWith('\u17D2')).toBe(false);
      }
    });
  });

  describe('3. Commercial Token Invariants (Atomic Currency and SKUs)', () => {
    it('preserves prices ($48.00, 120 €, £85.00, ២០០,០០០ ៛) without mid-token wraps', () => {
      const priceItems = GOLDEN_TYPOGRAPHY_CORPUS.filter(
        (item) => item.category === 'PRICE_CURRENCY' && item.shouldPass,
      );

      for (const item of priceItems) {
        const wrapped = TextLayoutEngine.wrapText({
          text: item.text,
          maxWidth: 180,
          initialFontSize: 24,
          minFontSize: 14,
          maxLines: 2,
          elementName: item.id,
          role: 'PRICE',
        });

        const fullWrapped = wrapped.lines.join('\n');
        for (const forbidden of item.forbiddenBreakSequences ?? []) {
          expect(fullWrapped).not.toContain(forbidden);
        }

        // Neither currency symbol nor digits should orphan across lines
        for (let i = 1; i < wrapped.lines.length; i++) {
          const line = wrapped.lines[i]!.trim();
          for (const notStart of item.mustNotStartLine ?? []) {
            expect(line.startsWith(notStart)).toBe(false);
          }
        }

        // Pure price tokens fit on a single line at maxWidth 180
        if (!item.text.includes('តម្លៃ')) {
          expect(wrapped.lines.length).toBe(1);
          expect(wrapped.lines[0]).toBe(item.text);
        }
      }
    });

    it('preserves SKUs (PRS-LUM-2026-FR, CHANEL-N5-EDP-100) atomically across hyphens', () => {
      const skuItems = GOLDEN_TYPOGRAPHY_CORPUS.filter(
        (item) => item.category === 'PRODUCT_SKU' && item.shouldPass,
      );

      for (const item of skuItems) {
        const wrapped = TextLayoutEngine.wrapText({
          text: item.text,
          maxWidth: 250,
          initialFontSize: 20,
          minFontSize: 12,
          maxLines: 2,
          elementName: item.id,
          role: 'LABEL',
        });

        expect(wrapped.lines.length).toBe(1);
        expect(wrapped.lines[0]).toBe(item.text);
      }
    });
  });

  describe('4. Full Template Poster Composition across Multiple Aspect Ratios', () => {
    const aspectRatios: {
      readonly ratio: '1:1' | '4:5' | '9:16';
      readonly width: number;
      readonly height: number;
    }[] = [
      { ratio: '1:1', width: 1080, height: 1080 },
      { ratio: '4:5', width: 1080, height: 1350 },
      { ratio: '9:16', width: 1080, height: 1920 },
    ];

    const templates: ('EDITORIAL_SPLIT' | 'CENTERED_HERO' | 'SCENT_STORY' | 'KHMER_SEASONAL')[] = [
      'EDITORIAL_SPLIT',
      'CENTERED_HERO',
      'SCENT_STORY',
      'KHMER_SEASONAL',
    ];

    for (const { ratio, width, height } of aspectRatios) {
      for (const templateId of templates) {
        it(`renders ${templateId} cleanly at ${ratio} (${width}x${height}) with positive ink bounds within safe margins`, async () => {
          const fixtures = await createFixtures(width, height);
          const compositor = new SharpPosterCompositor();

          const posterSpec: PosterSpec = {
            templateId,
            language: 'BILINGUAL',
            productPlacement: templateId === 'EDITORIAL_SPLIT' ? 'LEFT' : 'CENTER',
            textPlacement: templateId === 'EDITORIAL_SPLIT' ? 'RIGHT' : 'CENTER',
            headline:
              templateId === 'KHMER_SEASONAL'
                ? 'ពិធីបុណ្យភ្ជុំបិណ្ឌ ២០២៦'
                : 'រចនាបថប៉ារីស — Parisian Elegance',
            secondaryHeadline: 'ខូឡិកសិនថ្មី ២០២៦',
            supportingText: 'ស្វែងរកភាពស្រស់ស្អាតជាមួយ Parisian Shopper $48.00',
            price: '$48.00',
            promotionalPrice: '$38.00',
            currency: 'USD',
            cta: 'ទិញឥឡូវនេះ',
            campaignLabel: 'SUMMER EDITION',
            outputFormat: {
              aspectRatio: ratio,
              width,
              height,
            },
            palette: {
              id: 'palette-golden',
              accentColor: '#E5C07B',
              textColor: '#FFFFFF',
              secondaryTextColor: '#D0D0D0',
              badgeBackground: 'rgba(229,192,123,0.18)',
            },
          };

          const result = await compositor.renderPoster({
            creativeJobId: `job-golden-${templateId.toLowerCase()}-${ratio}`,
            posterSpec,
            canonicalProductBuffer: fixtures.canonicalProductBuffer,
            canonicalProductMimeType: 'image/png',
            canonicalProductSha256: fixtures.canonicalProductSha256,
            backgroundBuffer: fixtures.backgroundBuffer,
            backgroundMimeType: 'image/jpeg',
            backgroundSha256: fixtures.backgroundSha256,
            allowNonApprovedForTesting: true,
          });

          expect(result.mimeType).toBe('image/png');
          expect(result.width).toBe(width);
          expect(result.height).toBe(height);
          expect(result.byteSize).toBeGreaterThan(10000);
          expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);

          const { top, bottom, left, right } = result.layoutManifest.safeMargins;
          for (const el of result.layoutManifest.elements) {
            const b = el.boundingBox;
            expect(b.width).toBeGreaterThan(0);
            expect(b.height).toBeGreaterThan(0);
            expect(b.x).toBeGreaterThanOrEqual(0);
            expect(b.y).toBeGreaterThanOrEqual(0);
            expect(b.x + b.width).toBeLessThanOrEqual(width);
            expect(b.y + b.height).toBeLessThanOrEqual(height);

            if (el.type === 'TEXT') {
              expect(b.x).toBeGreaterThanOrEqual(left - 1);
              expect(b.x + b.width).toBeLessThanOrEqual(width - right + 1);
              expect(b.y).toBeGreaterThanOrEqual(top - 1);
              expect(b.y + b.height).toBeLessThanOrEqual(height - bottom + 1);
            }
          }
        });
      }
    }

    it('verifies zero text ink pixels bleed outside safe margins via direct raw pixel inspection', async () => {
      const width = 800;
      const height = 400;
      const safeMargins = { top: 50, bottom: 50, left: 60, right: 60 };
      const contentWidth = width - safeMargins.left - safeMargins.right;

      const wrapped = TextLayoutEngine.wrapText({
        text: 'ទឹកអប់ប៉ារីស — Parisian Elegance $48.00',
        maxWidth: contentWidth,
        initialFontSize: 32,
        minFontSize: 20,
        maxLines: 2,
        elementName: 'margin_pixel_test',
        role: 'HEADLINE',
      });

      const startY = safeMargins.top;
      const linesSvg = wrapped.shapedLines
        .map((line, idx) =>
          renderShapedTextLineSvg({
            x: safeMargins.left,
            baselineY: startY + line.baseline + idx * wrapped.lineHeight,
            runs: line.runs,
            color: '#FFFFFF',
          }),
        )
        .join('');

      const fontCss = FontRegistry.getInstance().getFontFaceCss();
      const testSvg = `
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <style>${fontCss}</style>
          ${linesSvg}
        </svg>
      `;

      const { data, info } = await sharp(Buffer.from(testSvg))
        .raw()
        .toBuffer({ resolveWithObject: true });

      expect(info.width).toBe(width);
      expect(info.height).toBe(height);
      expect(info.channels).toBe(4);

      // Verify that no ink (alpha > 10) exists in the outer safe margins:
      // Left margin: x in [0, safeMargins.left - 1)
      let leftMarginInkPixels = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < safeMargins.left - 1; x++) {
          const alpha = data[(y * width + x) * 4 + 3]!;
          if (alpha > 10) leftMarginInkPixels++;
        }
      }
      expect(leftMarginInkPixels).toBe(0);

      // Right margin: x in (width - safeMargins.right + 1, width]
      let rightMarginInkPixels = 0;
      for (let y = 0; y < height; y++) {
        for (let x = width - safeMargins.right + 1; x < width; x++) {
          const alpha = data[(y * width + x) * 4 + 3]!;
          if (alpha > 10) rightMarginInkPixels++;
        }
      }
      expect(rightMarginInkPixels).toBe(0);

      // Top margin: y in [0, safeMargins.top - 1)
      let topMarginInkPixels = 0;
      for (let y = 0; y < safeMargins.top - 1; y++) {
        for (let x = 0; x < width; x++) {
          const alpha = data[(y * width + x) * 4 + 3]!;
          if (alpha > 10) topMarginInkPixels++;
        }
      }
      expect(topMarginInkPixels).toBe(0);

      // Assert that there IS actual ink rendered inside the safe area
      let contentInkPixels = 0;
      for (let y = safeMargins.top; y < height - safeMargins.bottom; y++) {
        for (let x = safeMargins.left; x < width - safeMargins.right; x++) {
          const alpha = data[(y * width + x) * 4 + 3]!;
          if (alpha > 10) contentInkPixels++;
        }
      }
      expect(contentInkPixels).toBeGreaterThan(100);
    });
  });

  describe('5. Compositor Bit-Exact Determinism', () => {
    it('produces bit-exact identical buffers and SHA-256 digests across repeated renders', async () => {
      const fixtures = await createFixtures(1080, 1350);
      const compositor = new SharpPosterCompositor();

      const posterSpec: PosterSpec = {
        templateId: 'EDITORIAL_SPLIT',
        language: 'BILINGUAL',
        productPlacement: 'LEFT',
        textPlacement: 'RIGHT',
        headline: 'រចនាបថប៉ារីស — Parisian Elegance',
        secondaryHeadline: 'ខូឡិកសិនថ្មី ២០២៦',
        supportingText: 'ស្វែងរកភាពស្រស់ស្អាតជាមួយ Parisian Shopper',
        price: '$48.00',
        currency: 'USD',
        cta: 'ទិញឥឡូវនេះ',
        outputFormat: { aspectRatio: '4:5', width: 1080, height: 1350 },
        palette: {
          id: 'palette-determinism',
          accentColor: '#E5C07B',
          textColor: '#FFFFFF',
          secondaryTextColor: '#D0D0D0',
        },
      };

      const input = {
        creativeJobId: 'job-determinism-benchmark',
        posterSpec,
        canonicalProductBuffer: fixtures.canonicalProductBuffer,
        canonicalProductMimeType: 'image/png',
        canonicalProductSha256: fixtures.canonicalProductSha256,
        backgroundBuffer: fixtures.backgroundBuffer,
        backgroundMimeType: 'image/jpeg',
        backgroundSha256: fixtures.backgroundSha256,
        allowNonApprovedForTesting: true,
      };

      const run1 = await compositor.renderPoster(input);
      const run2 = await compositor.renderPoster(input);

      expect(run1.sha256).toBe(run2.sha256);
      expect(run1.byteSize).toBe(run2.byteSize);
      expect(run1.posterBuffer.equals(run2.posterBuffer)).toBe(true);
    });
  });

  describe('6. Fail-Closed Security & Attack Vector Defenses', () => {
    const attackVectors = GOLDEN_TYPOGRAPHY_CORPUS.filter((item) => !item.shouldPass);

    it(`fails closed with typed errors for all ${attackVectors.length} attack vectors`, () => {
      for (const item of attackVectors) {
        if (item.expectedError === 'PosterUnsupportedScriptError') {
          expect(() => {
            TextLayoutEngine.wrapText({
              text: item.text,
              maxWidth: 800,
              initialFontSize: 24,
              minFontSize: 12,
              maxLines: 4,
              elementName: item.id,
            });
          }).toThrow(PosterUnsupportedScriptError);
        } else if (item.expectedError === 'PosterUnsafeUnicodeError') {
          expect(() => {
            TextLayoutEngine.wrapText({
              text: item.text,
              maxWidth: 800,
              initialFontSize: 24,
              minFontSize: 12,
              maxLines: 4,
              elementName: item.id,
            });
          }).toThrow(PosterUnsafeUnicodeError);
        }
      }
    });
  });

  describe('7. Hermetic Font Integrity & Host OS Fallback Defense', () => {
    it('throws PosterFontNotFoundError when an unregistered font ID is requested', () => {
      const registry = FontRegistry.getInstance();
      expect(() => registry.getFontById('unapproved-font-system-fallback')).toThrow(
        PosterFontNotFoundError,
      );
    });

    it('throws PosterFontIntegrityError when font binary SHA-256 mismatches manifest', () => {
      const manifestEntry = APPROVED_FONT_MANIFEST[0]!;
      const tamperedBuffer = Buffer.from('corrupted font bytes');
      expect(() => verifyFontIntegrity(manifestEntry, tamperedBuffer)).toThrow(
        PosterFontIntegrityError,
      );
    });
  });
});
