import { PosterLayoutOverflowError } from '../creative-errors.js';
import { type TextRole, resolveScriptRuns } from './script-run-resolver.js';
import { normalizeAndValidateUnicode } from './unicode-validator.js';
import { safeKhmerTokenize, splitTextIntoParagraphs } from './khmer-line-breaker.js';
import type { ShapedRun, TextShaperPort } from './text-shaper.port.js';

export interface BoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ShapedLine {
  readonly lineText: string;
  readonly runs: readonly ShapedRun[];
  readonly width: number;
  readonly ascent: number;
  readonly descent: number;
  readonly baseline: number;
}

export interface WrappedTextResult {
  readonly lines: readonly string[];
  readonly shapedLines: readonly ShapedLine[];
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly totalWidth: number;
  readonly totalHeight: number;
  readonly maxAscent: number;
  readonly maxDescent: number;
  readonly actualBoundingBox: {
    readonly xMin: number;
    readonly yMin: number;
    readonly xMax: number;
    readonly yMax: number;
    readonly width: number;
    readonly height: number;
  };
}

export interface WrapTextOptions {
  readonly text: string;
  readonly maxWidth: number;
  readonly maxHeight?: number | undefined;
  readonly initialFontSize: number;
  readonly minFontSize: number;
  readonly maxLines: number;
  readonly lineHeightMultiplier?: number | undefined;
  readonly tracking?: number | undefined;
  readonly elementName?: string | undefined;
  readonly role?: TextRole | undefined;
  readonly preferredLatinFont?: ('Playfair Display' | 'Montserrat') | undefined;
  readonly latinWeight?: number | undefined;
  readonly khmerWeight?: number | undefined;
  readonly shaper?: TextShaperPort | undefined;
  readonly stepSize?: number | undefined;
}

// Patterns for prices and SKUs that must never break mid-token across wrapped lines
const PRICE_PATTERN =
  /^([$€£¥]\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s*[$€£¥]|(?:[\u17E0-\u17E9\d]+(?:[.,][\u17E0-\u17E9\d]+)*)\s*៛|៛\s*(?:[\u17E0-\u17E9\d]+(?:[.,][\u17E0-\u17E9\d]+)*))$/;
const SKU_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)+$/;

export class TextLayoutEngine {
  private readonly shaper: TextShaperPort;
  private static defaultShaper: TextShaperPort | null = null;

  public constructor(shaper?: TextShaperPort) {
    const resolved = shaper ?? TextLayoutEngine.defaultShaper;
    if (!resolved) {
      throw new Error(
        'TextLayoutEngine: No TextShaperPort provided and no default shaper registered. Register one with TextLayoutEngine.setDefaultShaper().',
      );
    }
    this.shaper = resolved;
  }

  public static setDefaultShaper(shaper: TextShaperPort): void {
    TextLayoutEngine.defaultShaper = shaper;
  }

  public static getDefaultShaper(): TextShaperPort {
    if (!TextLayoutEngine.defaultShaper) {
      throw new Error(
        'TextLayoutEngine: No TextShaperPort registered. Call setDefaultShaper() at application composition root.',
      );
    }
    return TextLayoutEngine.defaultShaper;
  }

  public static getShaper(): TextShaperPort {
    return TextLayoutEngine.getDefaultShaper();
  }

  public static setShaper(shaper: TextShaperPort): void {
    TextLayoutEngine.setDefaultShaper(shaper);
  }

  public getShaper(): TextShaperPort {
    return this.shaper;
  }

  public static isKhmerText(text: string): boolean {
    // Unicode block Khmer: U+1780 to U+17FF and U+19E0 to U+19FF
    return /[\u1780-\u17FF\u19E0-\u19FF]/.test(text);
  }

  public static measureStringWidth(
    text: string,
    fontSize: number,
    tracking = 0,
    role?: TextRole,
    preferredLatinFont?: 'Playfair Display' | 'Montserrat',
    shaper?: TextShaperPort,
  ): number {
    const normalized = normalizeAndValidateUnicode(text, role);
    if (!normalized) {
      return 0;
    }

    const runs = resolveScriptRuns(normalized, {
      ...(role !== undefined ? { role } : {}),
      ...(preferredLatinFont !== undefined ? { latinFont: preferredLatinFont } : {}),
    });

    const activeShaper = shaper ?? TextLayoutEngine.getDefaultShaper();
    return activeShaper.measureRunsWidth(runs, fontSize, tracking);
  }

  public measureStringWidth(
    text: string,
    fontSize: number,
    tracking = 0,
    role?: TextRole,
    preferredLatinFont?: 'Playfair Display' | 'Montserrat',
  ): number {
    return TextLayoutEngine.measureStringWidth(
      text,
      fontSize,
      tracking,
      role,
      preferredLatinFont,
      this.shaper,
    );
  }

  public static segmentText(text: string): string[] {
    const normalized = normalizeAndValidateUnicode(text);
    const trimmed = normalized.trim();
    if (!trimmed) return [];

    // Split by whitespace while preserving space tokens
    const rawTokens = trimmed.split(/(\s+)/);
    const segments: string[] = [];

    for (let i = 0; i < rawTokens.length; i++) {
      const tok = rawTokens[i];
      if (!tok || tok.length === 0) {
        continue;
      }

      if (/^\s+$/.test(tok)) {
        segments.push(' ');
        continue;
      }

      // Check if tok + space + nextTok forms an atomic multi-token price (e.g. "120" + " " + "€" or "២០០,០០០" + " " + "៛")
      if (i + 2 < rawTokens.length && /^\s+$/.test(rawTokens[i + 1]!)) {
        const nextTok = rawTokens[i + 2]!;
        const combined = `${tok} ${nextTok}`;
        if (PRICE_PATTERN.test(combined)) {
          segments.push(combined);
          i += 2;
          continue;
        }
      }

      // Protect single-token price expressions (e.g. $48, $48.00, 120€)
      if (PRICE_PATTERN.test(tok)) {
        segments.push(tok);
        continue;
      }

      // Protect product SKU patterns (e.g. PRS-LUM-2026-FR, N5-EDP-100)
      if (SKU_PATTERN.test(tok)) {
        segments.push(tok);
        continue;
      }

      // For Khmer text, apply safeKhmerTokenize to prevent invalid syllable splits
      if (this.isKhmerText(tok)) {
        const guarded = safeKhmerTokenize(tok);
        for (const seg of guarded) {
          if (seg.length > 0) {
            segments.push(seg);
          }
        }
      } else {
        segments.push(tok);
      }
    }

    return segments;
  }

  public wrapText(options: WrapTextOptions): WrappedTextResult {
    return TextLayoutEngine.wrapText({ ...options, shaper: options.shaper ?? this.shaper });
  }

  public static wrapText(options: WrapTextOptions): WrappedTextResult {
    const {
      text,
      maxWidth,
      maxHeight,
      initialFontSize,
      minFontSize,
      maxLines,
      lineHeightMultiplier = 1.25,
      tracking = 0,
      elementName = 'text',
      role,
      preferredLatinFont,
      latinWeight,
      khmerWeight,
      shaper,
      stepSize = 2,
    } = options;

    const activeShaper = shaper ?? TextLayoutEngine.getDefaultShaper();

    const normalized = normalizeAndValidateUnicode(text, elementName);
    const paragraphs = splitTextIntoParagraphs(normalized);

    if (paragraphs.length === 0 || normalized.trim().length === 0) {
      const emptyLineHeight = Math.round(initialFontSize * lineHeightMultiplier);
      return {
        lines: [],
        shapedLines: [],
        fontSize: initialFontSize,
        lineHeight: emptyLineHeight,
        totalWidth: 0,
        totalHeight: 0,
        maxAscent: 0,
        maxDescent: 0,
        actualBoundingBox: {
          xMin: 0,
          yMin: 0,
          xMax: 0,
          yMax: 0,
          width: 0,
          height: 0,
        },
      };
    }

    let currentFontSize = initialFontSize;

    while (currentFontSize >= minFontSize) {
      const allLines: string[] = [];
      const allShapedLines: ShapedLine[] = [];

      for (const paragraph of paragraphs) {
        const segments = this.segmentText(paragraph);
        if (segments.length === 0) {
          allLines.push('');
          allShapedLines.push({
            lineText: '',
            runs: [],
            width: 0,
            ascent: 0,
            descent: 0,
            baseline: 0,
          });
          continue;
        }

        let currentLine = '';

        for (const seg of segments) {
          if (seg === ' ') {
            if (currentLine.length > 0 && !currentLine.endsWith(' ')) {
              currentLine += ' ';
            }
            continue;
          }

          let separator = '';
          if (currentLine.length > 0 && !currentLine.endsWith(' ')) {
            // Add space between Latin words or digits unless already spaced
            if (/[A-Za-z0-9]$/.test(currentLine) || /^[A-Za-z0-9]/.test(seg)) {
              separator = ' ';
            }
          }

          const candidateLine = currentLine.length === 0 ? seg : `${currentLine}${separator}${seg}`;
          const candidateRuns = resolveScriptRuns(candidateLine, {
            ...(role !== undefined ? { role } : {}),
            ...(preferredLatinFont !== undefined ? { latinFont: preferredLatinFont } : {}),
            ...(latinWeight !== undefined ? { latinWeight } : {}),
            ...(khmerWeight !== undefined ? { khmerWeight } : {}),
          });
          const measuredWidth = activeShaper.measureRunsWidth(
            candidateRuns,
            currentFontSize,
            tracking,
          );

          if (measuredWidth <= maxWidth || currentLine.length === 0) {
            currentLine = candidateLine;
          } else {
            const lineText = currentLine.trim();
            const shaped = this.shapeLine(
              lineText,
              currentFontSize,
              tracking,
              {
                ...(role !== undefined ? { role } : {}),
                ...(preferredLatinFont !== undefined ? { preferredLatinFont } : {}),
                ...(latinWeight !== undefined ? { latinWeight } : {}),
                ...(khmerWeight !== undefined ? { khmerWeight } : {}),
              },
              activeShaper,
            );
            allLines.push(lineText);
            allShapedLines.push(shaped);
            currentLine = seg;
          }
        }

        if (currentLine.trim().length > 0) {
          const lineText = currentLine.trim();
          const shaped = this.shapeLine(
            lineText,
            currentFontSize,
            tracking,
            {
              ...(role !== undefined ? { role } : {}),
              ...(preferredLatinFont !== undefined ? { preferredLatinFont } : {}),
              ...(latinWeight !== undefined ? { latinWeight } : {}),
              ...(khmerWeight !== undefined ? { khmerWeight } : {}),
            },
            activeShaper,
          );
          allLines.push(lineText);
          allShapedLines.push(shaped);
        }
      }

      const lineHeight = Math.round(currentFontSize * lineHeightMultiplier);
      const firstLine = allShapedLines[0];
      const lastLine = allShapedLines[allShapedLines.length - 1];

      let maxLineWidth = 0;
      let maxAscent = 0;
      let maxDescent = 0;

      for (const l of allShapedLines) {
        if (l.width > maxLineWidth) maxLineWidth = l.width;
        if (l.ascent > maxAscent) maxAscent = l.ascent;
        if (l.descent > maxDescent) maxDescent = l.descent;
      }

      // Compute exact baseline-to-baseline vertical layout and ink bounding box
      const firstLineAscent = firstLine ? firstLine.ascent : maxAscent;
      const lastLineDescent = lastLine ? lastLine.descent : maxDescent;
      const baseline0 = Math.round(maxAscent);
      const lastLineBaseline = baseline0 + (allShapedLines.length - 1) * lineHeight;

      const inkYMin = Math.round(baseline0 - firstLineAscent);
      const inkYMax = Math.round(lastLineBaseline + lastLineDescent);
      const inkHeight = Math.max(0, inkYMax - inkYMin);

      // Aggregate true per-glyph ink bounding boxes calculated directly by HarfBuzz
      let hasAnyInk = false;
      let aggXMin = Infinity;
      let aggXMax = -Infinity;
      let aggYMin = Infinity;
      let aggYMax = -Infinity;

      for (let lineIdx = 0; lineIdx < allShapedLines.length; lineIdx++) {
        const shapedLine = allShapedLines[lineIdx]!;
        const lineBaseline = baseline0 + lineIdx * lineHeight;
        let runPenX = 0;

        for (const run of shapedLine.runs) {
          let runHasGlyphInk = false;
          for (const glyph of run.glyphs) {
            if (glyph.inkBounds !== undefined) {
              hasAnyInk = true;
              runHasGlyphInk = true;
              const gxMin = runPenX + glyph.inkBounds.xMin;
              const gxMax = runPenX + glyph.inkBounds.xMax;
              // OpenType: yMin is deepest descender (<0), yMax is highest ascender (>0)
              // Layout space: lineBaseline - yMax is ink top, lineBaseline - yMin is ink bottom
              const gyMin = lineBaseline - glyph.inkBounds.yMax;
              const gyMax = lineBaseline - glyph.inkBounds.yMin;

              if (gxMin < aggXMin) aggXMin = gxMin;
              if (gxMax > aggXMax) aggXMax = gxMax;
              if (gyMin < aggYMin) aggYMin = gyMin;
              if (gyMax > aggYMax) aggYMax = gyMax;
            }
          }

          if (!runHasGlyphInk && run.actualBoundingBox && run.actualBoundingBox.width > 0) {
            hasAnyInk = true;
            const rxMin = runPenX + run.actualBoundingBox.xMin;
            const rxMax = runPenX + run.actualBoundingBox.xMax;
            const ryMin = lineBaseline - run.actualBoundingBox.yMax;
            const ryMax = lineBaseline - run.actualBoundingBox.yMin;

            if (rxMin < aggXMin) aggXMin = rxMin;
            if (rxMax > aggXMax) aggXMax = rxMax;
            if (ryMin < aggYMin) aggYMin = ryMin;
            if (ryMax > aggYMax) aggYMax = ryMax;
          }

          runPenX += run.advanceWidth;
        }
      }

      const trueInkHeight = hasAnyInk
        ? Math.max(Math.round((aggYMax - aggYMin) * 100) / 100, Math.round(aggYMax * 100) / 100)
        : inkHeight;

      const totalHeight = Math.max(
        allLines.length * lineHeight,
        (allLines.length - 1) * lineHeight + Math.round(firstLineAscent + lastLineDescent),
        trueInkHeight,
      );

      const actualBoundingBox = hasAnyInk
        ? {
            xMin: 0,
            yMin: Math.max(0, Math.round(aggYMin * 100) / 100),
            xMax: Math.round(maxLineWidth),
            yMax: Math.round(aggYMax * 100) / 100,
            width: Math.round(maxLineWidth),
            height: trueInkHeight,
          }
        : {
            xMin: 0,
            yMin: inkYMin,
            xMax: Math.round(maxLineWidth),
            yMax: inkYMax,
            width: Math.round(maxLineWidth),
            height: Math.max(totalHeight, inkHeight),
          };

      const linesExceeded = allLines.length > maxLines;
      const heightExceeded =
        maxHeight !== undefined &&
        (totalHeight > maxHeight || actualBoundingBox.height > maxHeight);
      const widthExceeded = allShapedLines.some((l) => l.width > maxWidth);

      if (!linesExceeded && !heightExceeded && !widthExceeded) {
        return {
          lines: allLines,
          shapedLines: allShapedLines,
          fontSize: currentFontSize,
          lineHeight,
          totalWidth: maxLineWidth,
          totalHeight,
          maxAscent,
          maxDescent,
          actualBoundingBox,
        };
      }

      // Decrement font size by stepSize and retry
      currentFontSize -= stepSize;
    }

    throw new PosterLayoutOverflowError(
      elementName,
      `Text "${text}" cannot fit into width ${maxWidth}px within ${maxLines} lines (minimum font size ${minFontSize}px exceeded)`,
      {
        text,
        maxWidth,
        maxLines,
        minFontSize,
        ...(maxHeight !== undefined ? { maxHeight } : {}),
      },
    );
  }

  private static shapeLine(
    lineText: string,
    fontSize: number,
    letterSpacing: number,
    options: {
      role?: TextRole | undefined;
      preferredLatinFont?: ('Playfair Display' | 'Montserrat') | undefined;
      latinWeight?: number | undefined;
      khmerWeight?: number | undefined;
    },
    shaper: TextShaperPort,
  ): ShapedLine {
    const runs = resolveScriptRuns(lineText, {
      ...(options.role !== undefined ? { role: options.role } : {}),
      ...(options.preferredLatinFont !== undefined
        ? { latinFont: options.preferredLatinFont }
        : {}),
      ...(options.latinWeight !== undefined ? { latinWeight: options.latinWeight } : {}),
      ...(options.khmerWeight !== undefined ? { khmerWeight: options.khmerWeight } : {}),
    });

    const shapedRuns: ShapedRun[] = [];
    let lineWidth = 0;
    let maxAscent = 0;
    let maxDescent = 0;

    for (const run of runs) {
      const shaped = shaper.shapeRun(run, {
        fontSize,
        letterSpacing,
        ...(options.role !== undefined ? { role: options.role } : {}),
      });
      shapedRuns.push(shaped);
      lineWidth += shaped.advanceWidth;
      if (shaped.ascent > maxAscent) maxAscent = shaped.ascent;
      if (shaped.descent > maxDescent) maxDescent = shaped.descent;
    }

    return {
      lineText,
      runs: shapedRuns,
      width: Math.round(lineWidth * 100) / 100,
      ascent: Math.round(maxAscent * 100) / 100,
      descent: Math.round(maxDescent * 100) / 100,
      baseline: Math.round(maxAscent),
    };
  }

  public static boxesIntersect(boxA: BoundingBox, boxB: BoundingBox, padding = 0): boolean {
    return (
      boxA.x - padding < boxB.x + boxB.width &&
      boxA.x + boxA.width + padding > boxB.x &&
      boxA.y - padding < boxB.y + boxB.height &&
      boxA.y + boxA.height + padding > boxB.y
    );
  }

  public static isWithinBounds(box: BoundingBox, container: BoundingBox): boolean {
    return (
      box.x >= container.x &&
      box.y >= container.y &&
      box.x + box.width <= container.x + container.width &&
      box.y + box.height <= container.y + container.height
    );
  }

  public static computeSafeBoundingBox(container: BoundingBox, margin: number): BoundingBox {
    const doubleMargin = margin * 2;
    return {
      x: container.x + margin,
      y: container.y + margin,
      width: Math.max(0, container.width - doubleMargin),
      height: Math.max(0, container.height - doubleMargin),
    };
  }
}
