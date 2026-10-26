import type { ScriptRun, TextRole } from './script-run-resolver.js';

export interface ShapedGlyph {
  readonly glyphId: number;
  readonly cluster: number;
  readonly xAdvance: number;
  readonly yAdvance: number;
  readonly xOffset: number;
  readonly yOffset: number;
  readonly path?: string | undefined;
  readonly inkBounds?:
    | {
        readonly xMin: number;
        readonly yMin: number;
        readonly xMax: number;
        readonly yMax: number;
      }
    | undefined;
}

export interface ShapedRunBoundingBox {
  readonly xMin: number;
  readonly yMin: number;
  readonly xMax: number;
  readonly yMax: number;
  readonly width: number;
  readonly height: number;
}

export interface ShapedRun {
  readonly text: string;
  readonly script: 'KHMER' | 'LATIN';
  readonly fontFamily: string;
  readonly fontWeight: number;
  readonly fontSize: number;
  readonly advanceWidth: number;
  readonly width: number; // Backwards-compatible alias for advanceWidth
  readonly ascent: number;
  readonly descent: number;
  readonly lineGap: number;
  readonly upem?: number | undefined;
  readonly actualBoundingBox: ShapedRunBoundingBox;
  readonly glyphs: readonly ShapedGlyph[];
}

export interface ShapeRunOptions {
  readonly fontSize: number;
  readonly letterSpacing?: number | undefined;
  readonly role?: TextRole | undefined;
  readonly lineHeightMultiplier?: number | undefined;
}

export interface TextShaperPort {
  shapeRun(run: ScriptRun, options: ShapeRunOptions): ShapedRun;
  measureRunsWidth(runs: readonly ScriptRun[], fontSize: number, letterSpacing?: number): number;
}
