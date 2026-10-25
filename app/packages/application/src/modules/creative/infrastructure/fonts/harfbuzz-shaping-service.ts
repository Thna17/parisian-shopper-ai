import * as hb from 'harfbuzzjs';
import {
  PosterFontGlyphMissingError,
  PosterTextShapingError,
} from '../../domain/creative-errors.js';
import type { ScriptRun } from '../../domain/services/script-run-resolver.js';
import type {
  ShapedGlyph,
  ShapedRun,
  ShapeRunOptions,
  TextShaperPort,
} from '../../domain/services/text-shaper.port.js';
import { FontRegistry } from './font-registry.js';
import { TextLayoutEngine } from '../../domain/services/text-layout-engine.js';

export type { ShapedGlyph, ShapedRun, ShapeRunOptions, TextShaperPort };

export class HarfBuzzShapingService implements TextShaperPort {
  private readonly fontRegistry: FontRegistry;

  public constructor(fontRegistry = FontRegistry.getInstance()) {
    this.fontRegistry = fontRegistry;
  }

  public shapeRun(run: ScriptRun, options: ShapeRunOptions): ShapedRun {
    const { fontSize, letterSpacing = 0, role } = options;

    if (!run.text || run.text.length === 0) {
      return {
        text: '',
        script: run.script,
        fontFamily: run.fontFamily,
        fontWeight: run.fontWeight,
        fontSize,
        advanceWidth: 0,
        width: 0,
        ascent: 0,
        descent: 0,
        lineGap: 0,
        upem: 1000,
        actualBoundingBox: {
          xMin: 0,
          yMin: 0,
          xMax: 0,
          yMax: 0,
          width: 0,
          height: 0,
        },
        glyphs: [],
      };
    }

    const loadedFont = this.fontRegistry.getFontForFamilyAndWeight(run.fontFamily, run.fontWeight);

    // 1. Pre-render cmap coverage check
    for (let i = 0; i < run.text.length; ) {
      const cp = run.text.codePointAt(i)!;
      // Spaces, tabs, and newlines are accepted whitespace; check other chars against cmap
      if (cp !== 0x0020 && cp !== 0x0009 && cp !== 0x000a && cp !== 0x000d && cp !== 0x200b) {
        if (!loadedFont.unicodes.has(cp)) {
          throw new PosterFontGlyphMissingError(run.fontFamily, cp, role);
        }
      }
      i += cp > 0xffff ? 2 : 1;
    }

    // 2. Set variable font variations where supported
    if (run.fontFamily === 'Playfair Display' || run.fontFamily === 'Montserrat') {
      try {
        loadedFont.font.setVariations([new hb.Variation('wght', run.fontWeight)]);
      } catch (err: unknown) {
        throw new PosterTextShapingError(
          `Failed setting font weight variation ${run.fontWeight} for ${run.fontFamily}: ${String(err)}`,
        );
      }
    }

    // 3. Shape text with HarfBuzz
    const buf = new hb.Buffer();
    try {
      buf.addText(run.text);
      if (run.script === 'KHMER') {
        buf.setScript('Khmr');
      } else {
        buf.setScript('Latn');
      }
      buf.setDirection(hb.Direction.LTR);
      buf.guessSegmentProperties();

      hb.shape(loadedFont.font, buf);

      const glyphInfos = buf.getGlyphInfos();
      const glyphPositions = buf.getGlyphPositions();

      // Check for unmapped/missing glyphs (.notdef glyph ID 0)
      for (let g = 0; g < glyphInfos.length; g++) {
        const glyph = glyphInfos[g];
        if (glyph !== undefined && glyph.codepoint === 0) {
          // Read full 32-bit code point from the cluster offset, preventing isolated surrogate errors
          const cp = run.text.codePointAt(glyph.cluster) ?? 0;
          if (cp !== 0x0020 && cp !== 0x0009 && cp !== 0x200b) {
            throw new PosterFontGlyphMissingError(run.fontFamily, cp, role);
          }
        }
      }

      const upem = loadedFont.upem;
      const scale = fontSize / upem;

      const glyphs: ShapedGlyph[] = [];
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      let hasInk = false;
      let penX = 0;

      for (let i = 0; i < glyphPositions.length; i++) {
        const glyph = glyphInfos[i]!;
        const pos = glyphPositions[i]!;

        const glyphX = penX + pos.xOffset * scale;
        const glyphY = pos.yOffset * scale;

        const ext = loadedFont.font.glyphExtents(glyph.codepoint);
        let inkBounds: { xMin: number; yMin: number; xMax: number; yMax: number } | undefined;

        if (ext && (ext.width !== 0 || ext.height !== 0)) {
          hasInk = true;
          const gxMin = glyphX + ext.xBearing * scale;
          const gxMax = gxMin + ext.width * scale;
          // In OpenType, ext.height is negative downward; ext.yBearing is distance above baseline
          const gyMin = glyphY + (ext.yBearing + ext.height) * scale;
          const gyMax = glyphY + ext.yBearing * scale;

          inkBounds = {
            xMin: Math.round(gxMin * 100) / 100,
            yMin: Math.round(gyMin * 100) / 100,
            xMax: Math.round(gxMax * 100) / 100,
            yMax: Math.round(gyMax * 100) / 100,
          };

          minX = Math.min(minX, gxMin);
          maxX = Math.max(maxX, gxMax);
          minY = Math.min(minY, gyMin);
          maxY = Math.max(maxY, gyMax);
        }

        // Grapheme-aware letter spacing: apply spacing strictly at cluster transitions,
        // preserving intra-cluster positioning for Khmer subscripts and combining marks
        const isClusterEnd =
          i < glyphInfos.length - 1 && glyphInfos[i]!.cluster !== glyphInfos[i + 1]!.cluster;
        const spacingToAdd = letterSpacing > 0 && isClusterEnd ? letterSpacing : 0;
        const xAdvancePx = pos.xAdvance * scale + spacingToAdd;

        penX += xAdvancePx;

        const glyphPath = loadedFont.font.glyphToPath(glyph.codepoint);

        glyphs.push({
          glyphId: glyph.codepoint,
          cluster: glyph.cluster,
          xAdvance: Math.round(xAdvancePx * 100) / 100,
          yAdvance: Math.round(pos.yAdvance * scale * 100) / 100,
          xOffset: Math.round(pos.xOffset * scale * 100) / 100,
          yOffset: Math.round(pos.yOffset * scale * 100) / 100,
          ...(glyphPath && glyphPath.length > 0 ? { path: glyphPath } : {}),
          ...(inkBounds !== undefined ? { inkBounds } : {}),
        });
      }

      const advanceWidth = Math.round(penX * 100) / 100;
      const ascent = Math.round(((loadedFont.ascender / upem) * fontSize) * 100) / 100;
      const descent = Math.round(((Math.abs(loadedFont.descender) / upem) * fontSize) * 100) / 100;
      const lineGap = Math.round(((loadedFont.lineGap / upem) * fontSize) * 100) / 100;

      const actualBoundingBox = hasInk
        ? {
            xMin: Math.round(minX * 100) / 100,
            yMin: Math.round(minY * 100) / 100,
            xMax: Math.round(maxX * 100) / 100,
            yMax: Math.round(maxY * 100) / 100,
            width: Math.round((maxX - minX) * 100) / 100,
            height: Math.round((maxY - minY) * 100) / 100,
          }
        : {
            xMin: 0,
            yMin: 0,
            xMax: 0,
            yMax: 0,
            width: 0,
            height: 0,
          };

      return {
        text: run.text,
        script: run.script,
        fontFamily: run.fontFamily,
        fontWeight: run.fontWeight,
        fontSize,
        advanceWidth,
        width: advanceWidth,
        ascent,
        descent,
        lineGap,
        upem,
        actualBoundingBox,
        glyphs,
      };
    } catch (err: unknown) {
      if (err instanceof PosterFontGlyphMissingError) {
        throw err;
      }
      throw new PosterTextShapingError(`HarfBuzz shaping failed: ${String(err)}`, {
        fontFamily: run.fontFamily,
        fontWeight: run.fontWeight,
        text: run.text,
      });
    }
  }

  public measureRunsWidth(runs: readonly ScriptRun[], fontSize: number, letterSpacing = 0): number {
    let total = 0;
    for (const run of runs) {
      const shaped = this.shapeRun(run, { fontSize, letterSpacing });
      total += shaped.advanceWidth;
    }
    return Math.round(total * 100) / 100;
  }
}

// Auto-register default shaper for composition roots
try {
  TextLayoutEngine.setDefaultShaper(new HarfBuzzShapingService());
} catch {
  // Safe in deferred test environments
}
