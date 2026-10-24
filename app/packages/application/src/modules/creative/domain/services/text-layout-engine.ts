import { PosterLayoutOverflowError } from '../creative-errors.js';

export interface BoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface WrappedTextResult {
  readonly lines: readonly string[];
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly totalWidth: number;
  readonly totalHeight: number;
}

export class TextLayoutEngine {
  private static readonly khmerWordSegmenter = new Intl.Segmenter('km', { granularity: 'word' });

  public static isKhmerText(text: string): boolean {
    // Unicode block Khmer: U+1780 to U+17FF and U+19E0 to U+19FF
    return /[\u1780-\u17FF\u19E0-\u19FF]/.test(text);
  }

  public static estimateCharWidth(char: string, fontSize: number, isKhmer: boolean): number {
    if (isKhmer) {
      // Subscripts and combining vowels occupy minimal or zero horizontal advance
      const isCombining = /[\u17B6-\u17D3\u17DD]/.test(char);
      if (isCombining) return fontSize * 0.1;
      return fontSize * 0.6;
    }
    if (/[MWm]/.test(char)) return fontSize * 0.8;
    if (/[ijlI1.,!':;]/.test(char)) return fontSize * 0.28;
    if (/[A-Z]/.test(char)) return fontSize * 0.62;
    return fontSize * 0.52;
  }

  public static measureStringWidth(text: string, fontSize: number, tracking = 0): number {
    const isKhmer = this.isKhmerText(text);
    let total = 0;
    for (const char of text) {
      total += this.estimateCharWidth(char, fontSize, isKhmer);
    }
    if (tracking > 0) {
      total += Math.max(0, text.length - 1) * tracking;
    }
    return Math.round(total);
  }

  public static segmentText(text: string): string[] {
    const trimmed = text.trim();
    if (!trimmed) return [];

    if (this.isKhmerText(trimmed)) {
      const tokens = trimmed.split(/(\s+)/);
      const segments: string[] = [];
      for (const token of tokens) {
        if (/^\s+$/.test(token)) {
          segments.push(' ');
        } else {
          for (const seg of this.khmerWordSegmenter.segment(token)) {
            if (seg.segment.length > 0) {
              segments.push(seg.segment);
            }
          }
        }
      }
      return segments;
    }

    return trimmed.split(/\s+/);
  }

  public static wrapText(options: {
    readonly text: string;
    readonly maxWidth: number;
    readonly initialFontSize: number;
    readonly minFontSize: number;
    readonly maxLines: number;
    readonly lineHeightMultiplier?: number;
    readonly tracking?: number;
    readonly elementName?: string;
  }): WrappedTextResult {
    const {
      text,
      maxWidth,
      initialFontSize,
      minFontSize,
      maxLines,
      lineHeightMultiplier = 1.25,
      tracking = 0,
      elementName = 'text',
    } = options;

    const segments = this.segmentText(text);
    if (segments.length === 0) {
      return {
        lines: [],
        fontSize: initialFontSize,
        lineHeight: Math.round(initialFontSize * lineHeightMultiplier),
        totalWidth: 0,
        totalHeight: 0,
      };
    }

    let currentFontSize = initialFontSize;

    while (currentFontSize >= minFontSize) {
      const lines: string[] = [];
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
          if (/[A-Za-z0-9]$/.test(currentLine) || /^[A-Za-z0-9]/.test(seg)) {
            separator = ' ';
          }
        }

        const candidateLine = currentLine.length === 0 ? seg : `${currentLine}${separator}${seg}`;
        const measuredWidth = this.measureStringWidth(candidateLine, currentFontSize, tracking);

        if (measuredWidth <= maxWidth || currentLine.length === 0) {
          currentLine = candidateLine;
        } else {
          lines.push(currentLine.trim());
          currentLine = seg;
        }
      }

      if (currentLine.trim().length > 0) {
        lines.push(currentLine.trim());
      }

      if (lines.length <= maxLines) {
        let maxLineWidth = 0;
        for (const line of lines) {
          const w = this.measureStringWidth(line, currentFontSize, tracking);
          if (w > maxLineWidth) maxLineWidth = w;
        }

        const lineHeight = Math.round(currentFontSize * lineHeightMultiplier);
        const totalHeight = lines.length * lineHeight;

        return {
          lines,
          fontSize: currentFontSize,
          lineHeight,
          totalWidth: maxLineWidth,
          totalHeight,
        };
      }

      // Decrement font size and retry
      currentFontSize -= 2;
    }

    throw new PosterLayoutOverflowError(
      elementName,
      `Text "${text}" cannot fit into width ${maxWidth}px within ${maxLines} lines (minimum font size ${minFontSize}px exceeded)`,
      { text, maxWidth, maxLines, minFontSize },
    );
  }

  public static boxesIntersect(boxA: BoundingBox, boxB: BoundingBox, padding = 0): boolean {
    return (
      boxA.x - padding < boxB.x + boxB.width &&
      boxA.x + boxA.width + padding > boxB.x &&
      boxA.y - padding < boxB.y + boxB.height &&
      boxA.y + boxA.height + padding > boxB.y
    );
  }
}
