import { beforeAll, describe, expect, it } from '@jest/globals';
import {
  PosterFontGlyphMissingError,
  PosterLayoutOverflowError,
  PosterUnsafeUnicodeError,
  PosterUnsupportedScriptError,
} from '../creative-errors.js';
import { GOLDEN_TYPOGRAPHY_CORPUS } from './__fixtures__/golden-typography-corpus.js';
import { TextLayoutEngine } from './text-layout-engine.js';
import { HarfBuzzShapingService } from '../../infrastructure/fonts/harfbuzz-shaping-service.js';
import { FontRegistry } from '../../infrastructure/fonts/font-registry.js';

describe('ShapedTextLayoutEngine and Golden Typography Corpus (W21 Deliverables C, E, F, G, J)', () => {
  beforeAll(() => {
    TextLayoutEngine.setDefaultShaper(new HarfBuzzShapingService(FontRegistry.getInstance()));
  });
  describe('Authoritative Golden Corpus Verification', () => {
    it('verifies all 22 golden corpus scenarios according to their security and linguistic expectations', () => {
      for (const item of GOLDEN_TYPOGRAPHY_CORPUS) {
        if (item.shouldPass) {
          const result = TextLayoutEngine.wrapText({
            text: item.text,
            maxWidth: 800,
            initialFontSize: 32,
            minFontSize: 16,
            maxLines: 4,
            elementName: item.id,
            role: item.role,
          });

          expect(result.lines.length).toBeGreaterThan(0);
          expect(result.totalWidth).toBeGreaterThan(0);
          expect(result.totalWidth).toBeLessThanOrEqual(800);
          expect(result.shapedLines.length).toBe(result.lines.length);

          // Verify every shaped run has an approved font and positive width
          for (const line of result.shapedLines) {
            expect(line.runs.length).toBeGreaterThan(0);
            for (const run of line.runs) {
              expect(['Playfair Display', 'Montserrat', 'Noto Sans Khmer']).toContain(
                run.fontFamily,
              );
              expect(run.fontSize).toBe(result.fontSize);
              expect(run.width).toBeGreaterThanOrEqual(0);
            }
          }
        } else {
          // Attack vector / invalid input must fail closed with the exact typed error
          if (item.expectedError === 'PosterUnsupportedScriptError') {
            expect(() => {
              TextLayoutEngine.wrapText({
                text: item.text,
                maxWidth: 800,
                initialFontSize: 32,
                minFontSize: 16,
                maxLines: 4,
                elementName: item.id,
                role: item.role,
              });
            }).toThrow(PosterUnsupportedScriptError);
          } else if (item.expectedError === 'PosterFontGlyphMissingError') {
            expect(() => {
              TextLayoutEngine.wrapText({
                text: item.text,
                maxWidth: 800,
                initialFontSize: 32,
                minFontSize: 16,
                maxLines: 4,
                elementName: item.id,
                role: item.role,
              });
            }).toThrow(PosterFontGlyphMissingError);
          } else if (item.expectedError === 'PosterUnsafeUnicodeError') {
            expect(() => {
              TextLayoutEngine.wrapText({
                text: item.text,
                maxWidth: 800,
                initialFontSize: 32,
                minFontSize: 16,
                maxLines: 4,
                elementName: item.id,
                role: item.role,
              });
            }).toThrow(PosterUnsafeUnicodeError);
          }
        }
      }
    });
  });

  describe('Deterministic Repeated Shaping and Measurement', () => {
    it('produces byte-for-byte and floating-point identical metrics across 50 repeated executions', () => {
      const testString = 'សូមស្វាគមន៍មកកាន់ Parisian Shopper ផ្លូវការ — Luxury Collection 2026 ($48.00)';
      const runs = 50;
      const initial = TextLayoutEngine.wrapText({
        text: testString,
        maxWidth: 600,
        initialFontSize: 28,
        minFontSize: 16,
        maxLines: 3,
        elementName: 'reproducibility_test',
        role: 'BODY',
      });

      for (let i = 0; i < runs; i++) {
        const next = TextLayoutEngine.wrapText({
          text: testString,
          maxWidth: 600,
          initialFontSize: 28,
          minFontSize: 16,
          maxLines: 3,
          elementName: 'reproducibility_test',
          role: 'BODY',
        });

        expect(next.lines).toEqual(initial.lines);
        expect(next.fontSize).toBe(initial.fontSize);
        expect(next.lineHeight).toBe(initial.lineHeight);
        expect(next.totalWidth).toBe(initial.totalWidth);
        expect(next.totalHeight).toBe(initial.totalHeight);
        expect(next.shapedLines.length).toBe(initial.shapedLines.length);

        for (let l = 0; l < initial.shapedLines.length; l++) {
          const initLine = initial.shapedLines[l]!;
          const nextLine = next.shapedLines[l]!;
          expect(nextLine.width).toBe(initLine.width);
          expect(nextLine.ascent).toBe(initLine.ascent);
          expect(nextLine.descent).toBe(initLine.descent);
          expect(nextLine.runs.length).toBe(initLine.runs.length);
        }
      }
    });
  });

  describe('Safe Area Containment, Font Shrinking and Overflow Detection', () => {
    it('shrinks font size down to minFontSize to fit content within approved bounds', () => {
      const text = 'Discover Timeless Parisian Elegance';
      const result = TextLayoutEngine.wrapText({
        text,
        maxWidth: 260,
        initialFontSize: 44,
        minFontSize: 20,
        maxLines: 2,
        elementName: 'shrink_test',
        role: 'HEADLINE',
      });

      expect(result.fontSize).toBeLessThan(44);
      expect(result.fontSize).toBeGreaterThanOrEqual(20);
      expect(result.lines.length).toBeLessThanOrEqual(2);
      expect(result.totalWidth).toBeLessThanOrEqual(260);
    });

    it('throws PosterLayoutOverflowError fail-closed when content cannot fit within bounds at minFontSize', () => {
      const overlyLongText =
        'This is an exceptionally long and verbose product description intended specifically to exceed maximum line count and bounding box width even after shrinking to the absolute minimum approved font size in our system policy.';

      expect(() => {
        TextLayoutEngine.wrapText({
          text: overlyLongText,
          maxWidth: 200,
          maxHeight: 60,
          initialFontSize: 24,
          minFontSize: 18,
          maxLines: 2,
          elementName: 'overflow_test',
          role: 'BODY',
        });
      }).toThrow(PosterLayoutOverflowError);
    });

    it('never silently crops or hides text on layout overflow', () => {
      try {
        TextLayoutEngine.wrapText({
          text: 'Unfittable headline that will overflow and must throw',
          maxWidth: 100,
          initialFontSize: 40,
          minFontSize: 30,
          maxLines: 1,
          elementName: 'no_crop_test',
          role: 'HEADLINE',
        });
        fail('Expected PosterLayoutOverflowError but no error was thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(PosterLayoutOverflowError);
        const overflowErr = err as PosterLayoutOverflowError;
        expect(overflowErr.details).toBeDefined();
        expect(overflowErr.details?.['elementName']).toBe('no_crop_test');
      }
    });
  });

  describe('Unsupported Script and Missing Glyph Detection', () => {
    it('throws PosterUnsupportedScriptError when encountering unsupported Unicode symbols or emoji', () => {
      expect(() => {
        TextLayoutEngine.wrapText({
          text: 'Parisian Shopper 🌸 Floral',
          maxWidth: 600,
          initialFontSize: 24,
          minFontSize: 16,
          maxLines: 2,
          elementName: 'emoji_test',
          role: 'BODY',
        });
      }).toThrow(PosterUnsupportedScriptError);
    });

    it('identifies unsupported script code point in error details', () => {
      try {
        TextLayoutEngine.wrapText({
          text: 'Test \u1234 Ethiopic',
          maxWidth: 600,
          initialFontSize: 24,
          minFontSize: 16,
          maxLines: 2,
          elementName: 'unsupported_script',
          role: 'BODY',
        });
        fail('Expected PosterUnsupportedScriptError but none was thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(PosterUnsupportedScriptError);
        const scriptErr = err as PosterUnsupportedScriptError;
        expect(scriptErr.codePoint).toBe(0x1234);
        expect(scriptErr.hexCodePoint).toBe('U+1234');
      }
    });
  });

  describe('Khmer-Safe Wrapping, Real Ink Geometry & Commercial Token Protection (W21-E)', () => {
    it('wraps multi-line Khmer text safely within maxWidth without breaking syllables or Lek Took', () => {
      const khmerText =
        'ស្វែងរកភាពស្រស់ស្អាតនិងទាន់សម័យជាមួយផលិតផលម៉ាកល្បីៗមកពីប្រទេសបារាំងដែលនាំចូលផ្តាច់មុខ។';
      const result = TextLayoutEngine.wrapText({
        text: khmerText,
        maxWidth: 380,
        initialFontSize: 24,
        minFontSize: 16,
        maxLines: 6,
        elementName: 'km_wrapping_test',
        role: 'BODY',
      });

      expect(result.lines.length).toBeGreaterThan(1);
      expect(result.lines.length).toBeLessThanOrEqual(6);
      expect(result.totalWidth).toBeLessThanOrEqual(380);

      for (const line of result.lines) {
        // No wrapped line should begin with Lek Took (ៗ) or dependent vowel
        expect(line.startsWith('ៗ')).toBe(false);
        const firstCp = line.codePointAt(0)!;
        expect(firstCp >= 0x17b6 && firstCp <= 0x17c5).toBe(false);
      }
    });

    it('preserves commercial price tokens ($48.00 and 120 €) and product SKUs without mid-token wraps', () => {
      const text = 'Collection N°5 SKU: PRS-LUM-2026-FR Price: $48.00 Limited Edition';
      const result = TextLayoutEngine.wrapText({
        text,
        maxWidth: 220,
        initialFontSize: 20,
        minFontSize: 14,
        maxLines: 5,
        elementName: 'commercial_tokens_test',
        role: 'BODY',
      });

      // Verify that neither the SKU nor the price is broken across lines
      const fullWrapped = result.lines.join('\n');
      expect(fullWrapped).toContain('PRS-LUM-2026-FR');
      expect(fullWrapped).toContain('$48.00');
    });

    it('computes real vertical ink bounds (actualBoundingBox) matching HarfBuzz shaping metrics', () => {
      const result = TextLayoutEngine.wrapText({
        text: 'Parisian Shopper — ភាពប្រណីត',
        maxWidth: 600,
        initialFontSize: 28,
        minFontSize: 16,
        maxLines: 2,
        elementName: 'ink_bounds_test',
        role: 'HEADLINE',
      });

      expect(result.actualBoundingBox).toBeDefined();
      expect(result.actualBoundingBox.width).toBeGreaterThan(0);
      expect(result.actualBoundingBox.height).toBeGreaterThan(0);
      expect(result.actualBoundingBox.xMin).toBe(0);
      expect(result.actualBoundingBox.xMax).toBe(Math.round(result.totalWidth));
      expect(result.actualBoundingBox.yMax).toBeGreaterThan(result.actualBoundingBox.yMin);
      expect(result.totalHeight).toBeGreaterThanOrEqual(result.actualBoundingBox.height);
    });

    it('enforces maxHeight constraint and triggers font shrinking down to minFontSize before failing closed', () => {
      const text = 'Discover Timeless Parisian Elegance With French Skincare Heritage';

      // Tight maxHeight of 50px with initialFontSize 32px
      const result = TextLayoutEngine.wrapText({
        text,
        maxWidth: 300,
        maxHeight: 65,
        initialFontSize: 32,
        minFontSize: 14,
        maxLines: 3,
        stepSize: 1,
        elementName: 'max_height_shrink_test',
        role: 'BODY',
      });

      expect(result.fontSize).toBeLessThan(32);
      expect(result.totalHeight).toBeLessThanOrEqual(65);
      expect(result.actualBoundingBox.height).toBeLessThanOrEqual(65);

      // Failing closed when even minFontSize exceeds maxHeight
      expect(() => {
        TextLayoutEngine.wrapText({
          text,
          maxWidth: 200,
          maxHeight: 20,
          initialFontSize: 24,
          minFontSize: 18,
          maxLines: 4,
          elementName: 'max_height_overflow_test',
          role: 'BODY',
        });
      }).toThrow(PosterLayoutOverflowError);
    });

    it('provides layout bounding box containment and safe area computation helpers', () => {
      const container = { x: 50, y: 50, width: 800, height: 1000 };
      const safeArea = TextLayoutEngine.computeSafeBoundingBox(container, 40);

      expect(safeArea).toEqual({
        x: 90,
        y: 90,
        width: 720,
        height: 920,
      });

      const insideBox = { x: 100, y: 100, width: 200, height: 150 };
      const outsideBox = { x: 10, y: 100, width: 200, height: 150 };

      expect(TextLayoutEngine.isWithinBounds(insideBox, container)).toBe(true);
      expect(TextLayoutEngine.isWithinBounds(outsideBox, container)).toBe(false);
      expect(TextLayoutEngine.isWithinBounds(insideBox, safeArea)).toBe(true);
    });
  });
});
