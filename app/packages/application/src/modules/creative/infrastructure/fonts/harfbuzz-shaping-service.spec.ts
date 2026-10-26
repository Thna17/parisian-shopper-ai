import { describe, expect, it } from '@jest/globals';
import { PosterFontGlyphMissingError } from '../../domain/creative-errors.js';
import { TextLayoutEngine } from '../../domain/services/text-layout-engine.js';
import { FontRegistry } from './font-registry.js';
import { HarfBuzzShapingService } from './harfbuzz-shaping-service.js';

describe('HarfBuzzShapingService (W21-C Deliverables 1, 2, 3, 5)', () => {
  const fontRegistry = FontRegistry.getInstance();
  const shaper = new HarfBuzzShapingService(fontRegistry);

  it('1. performs Khmer GSUB subscript reordering and GPOS mark placement', () => {
    // កម្ពុជា consists of base Ka, Coeng Mo, subscript Po, vowel U, base Cha
    const shaped = shaper.shapeRun(
      {
        text: 'កម្ពុជា',
        script: 'KHMER',
        fontFamily: 'Noto Sans Khmer',
        fontWeight: 400,
      },
      { fontSize: 32 },
    );

    expect(shaped.glyphs.length).toBe(5);
    expect(shaped.advanceWidth).toBeGreaterThan(0);
    expect(shaped.width).toBe(shaped.advanceWidth);

    // Verify clusters: cluster 0 (Ka), cluster 1 (Mo + Coeng + Po + U), cluster 5 (Cha)
    expect(shaped.glyphs[0]!.cluster).toBe(0);
    expect(shaped.glyphs[1]!.cluster).toBe(1);
    expect(shaped.glyphs[2]!.cluster).toBe(1);
    expect(shaped.glyphs[3]!.cluster).toBe(1);
    expect(shaped.glyphs[4]!.cluster).toBe(5);

    // Verify that subscript/mark glyphs have non-zero vertical offsets
    expect(shaped.glyphs[2]!.yOffset).not.toBe(0);
    expect(shaped.glyphs[3]!.yOffset).not.toBe(0);

    // Verify ink bounding box is populated
    expect(shaped.actualBoundingBox.width).toBeGreaterThan(0);
    expect(shaped.actualBoundingBox.height).toBeGreaterThan(0);
  });

  it('2. applies grapheme-aware letter spacing without separating Khmer subscripts', () => {
    // ស្រ្តី is a single syllable cluster (Cluster 0)
    const runSrey = {
      text: 'ស្រ្តី',
      script: 'KHMER' as const,
      fontFamily: 'Noto Sans Khmer' as const,
      fontWeight: 400,
    };

    const sreyNoSpacing = shaper.shapeRun(runSrey, { fontSize: 30, letterSpacing: 0 });
    const sreyWithSpacing = shaper.shapeRun(runSrey, { fontSize: 30, letterSpacing: 15 });

    // Since ស្រ្តី is 1 single cluster, letter spacing between clusters must be 0!
    // A naive per-glyph implementation would have added (4 glyphs - 1) * 15 = 45px
    expect(sreyWithSpacing.advanceWidth).toBe(sreyNoSpacing.advanceWidth);
    expect(sreyWithSpacing.glyphs[1]!.xOffset).toBe(sreyNoSpacing.glyphs[1]!.xOffset);
    expect(sreyWithSpacing.glyphs[2]!.xOffset).toBe(sreyNoSpacing.glyphs[2]!.xOffset);

    // Test Latin word "Hello" (5 distinct clusters, 5 glyphs)
    const runHello = {
      text: 'Hello',
      script: 'LATIN' as const,
      fontFamily: 'Montserrat' as const,
      fontWeight: 400,
    };
    const helloNoSpacing = shaper.shapeRun(runHello, { fontSize: 20, letterSpacing: 0 });
    const helloWithSpacing = shaper.shapeRun(runHello, { fontSize: 20, letterSpacing: 10 });

    // (5 clusters - 1) * 10 = +40px
    const expectedHelloDiff = 4 * 10;
    expect(Math.round(helloWithSpacing.advanceWidth - helloNoSpacing.advanceWidth)).toBe(
      expectedHelloDiff,
    );

    // Test Khmer word with 3 clusters: កម្ពុជា (clusters 0, 1, 5)
    const runKampuchea = {
      text: 'កម្ពុជា',
      script: 'KHMER' as const,
      fontFamily: 'Noto Sans Khmer' as const,
      fontWeight: 400,
    };
    const kamNoSpacing = shaper.shapeRun(runKampuchea, { fontSize: 24, letterSpacing: 0 });
    const kamWithSpacing = shaper.shapeRun(runKampuchea, { fontSize: 24, letterSpacing: 12 });

    // (3 clusters - 1) * 12 = +24px (NOT (5 glyphs - 1) * 12 = 48px)
    const expectedKamDiff = 2 * 12;
    expect(Math.round(kamWithSpacing.advanceWidth - kamNoSpacing.advanceWidth)).toBe(
      expectedKamDiff,
    );
  });

  it('3. reports the full 32-bit code point for astral characters in PosterFontGlyphMissingError', () => {
    // Grinning face emoji 😀 is U+1F600 (surrogate pair \uD83D\uDE00)
    const astralText = 'Summer Sale 😀 Promotion';
    expect(() =>
      shaper.shapeRun(
        {
          text: astralText,
          script: 'LATIN',
          fontFamily: 'Playfair Display',
          fontWeight: 700,
        },
        { fontSize: 24 },
      ),
    ).toThrow(PosterFontGlyphMissingError);

    try {
      shaper.shapeRun(
        {
          text: astralText,
          script: 'LATIN',
          fontFamily: 'Playfair Display',
          fontWeight: 700,
        },
        { fontSize: 24 },
      );
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(PosterFontGlyphMissingError);
      const glyphError = err as PosterFontGlyphMissingError;
      // Must report true 32-bit code point 0x1F600, NOT high surrogate 0xD83D!
      expect(glyphError.codePoint).toBe(0x1f600);
      expect(glyphError.hexCodePoint).toBe('U+1F600');
    }
  });

  it('4. produces measurably distinct advances and bounding boxes across variable font weights', () => {
    const text = 'PARISIAN';

    const light = shaper.shapeRun(
      { text, script: 'LATIN', fontFamily: 'Montserrat', fontWeight: 100 },
      { fontSize: 28 },
    );
    const regular = shaper.shapeRun(
      { text, script: 'LATIN', fontFamily: 'Montserrat', fontWeight: 400 },
      { fontSize: 28 },
    );
    const black = shaper.shapeRun(
      { text, script: 'LATIN', fontFamily: 'Montserrat', fontWeight: 900 },
      { fontSize: 28 },
    );

    expect(black.advanceWidth).toBeGreaterThan(regular.advanceWidth);
    expect(regular.advanceWidth).toBeGreaterThan(light.advanceWidth);
    expect(black.actualBoundingBox.width).toBeGreaterThan(regular.actualBoundingBox.width);
    expect(regular.actualBoundingBox.width).toBeGreaterThan(light.actualBoundingBox.width);

    // Playfair Display variable weight test (400 vs 700 vs 900)
    const pfRegular = shaper.shapeRun(
      { text: 'Elegance', script: 'LATIN', fontFamily: 'Playfair Display', fontWeight: 400 },
      { fontSize: 36 },
    );
    const pfBold = shaper.shapeRun(
      { text: 'Elegance', script: 'LATIN', fontFamily: 'Playfair Display', fontWeight: 700 },
      { fontSize: 36 },
    );
    const pfBlack = shaper.shapeRun(
      { text: 'Elegance', script: 'LATIN', fontFamily: 'Playfair Display', fontWeight: 900 },
      { fontSize: 36 },
    );

    expect(pfBlack.advanceWidth).toBeGreaterThan(pfBold.advanceWidth);
    expect(pfBold.advanceWidth).toBeGreaterThan(pfRegular.advanceWidth);
  });

  it('5. provides bit-exact deterministic measurements across 50 repeated shaping runs', () => {
    const sample = {
      text: 'Parisian Shopper — ទឹកអប់បារាំង $48',
      script: 'KHMER' as const,
      fontFamily: 'Noto Sans Khmer' as const,
      fontWeight: 400,
    };

    const first = shaper.shapeRun(sample, { fontSize: 22, letterSpacing: 2 });
    for (let i = 0; i < 50; i++) {
      const next = shaper.shapeRun(sample, { fontSize: 22, letterSpacing: 2 });
      expect(next.advanceWidth).toBe(first.advanceWidth);
      expect(next.ascent).toBe(first.ascent);
      expect(next.descent).toBe(first.descent);
      expect(next.actualBoundingBox).toEqual(first.actualBoundingBox);
      expect(next.glyphs.length).toBe(first.glyphs.length);
      for (let g = 0; g < next.glyphs.length; g++) {
        expect(next.glyphs[g]).toEqual(first.glyphs[g]);
      }
    }
  });

  it('6. returns complete per-glyph geometry array in ShapedRun', () => {
    const shaped = shaper.shapeRun(
      {
        text: 'Chanel No 5',
        script: 'LATIN',
        fontFamily: 'Montserrat',
        fontWeight: 500,
      },
      { fontSize: 20 },
    );

    expect(shaped.glyphs.length).toBe(11);
    for (const g of shaped.glyphs) {
      expect(typeof g.glyphId).toBe('number');
      expect(g.glyphId).toBeGreaterThan(0);
      expect(typeof g.cluster).toBe('number');
      expect(typeof g.xAdvance).toBe('number');
      expect(typeof g.yAdvance).toBe('number');
      expect(typeof g.xOffset).toBe('number');
      expect(typeof g.yOffset).toBe('number');
    }
  });

  it('7. integrates cleanly with TextLayoutEngine via dependency injection', () => {
    const layoutEngine = new TextLayoutEngine(shaper);
    expect(layoutEngine.getShaper()).toBe(shaper);

    const wrapped = layoutEngine.wrapText({
      text: 'រចនាបថប៉ារីសដ៏ស្រស់ស្អាត',
      maxWidth: 300,
      initialFontSize: 28,
      minFontSize: 16,
      maxLines: 2,
    });

    expect(wrapped.lines.length).toBeGreaterThan(0);
    expect(wrapped.shapedLines.length).toBe(wrapped.lines.length);
    expect(wrapped.totalWidth).toBeLessThanOrEqual(300);
  });
});
