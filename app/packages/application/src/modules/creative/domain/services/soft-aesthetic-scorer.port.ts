import { type CreativeSceneVersionRecord } from '../scene/creative-scene.types.js';
import { type BoundingBox } from './text-layout-engine.js';
import { type TypographyBlockInput } from './hard-visual-gates.port.js';

export const SOFT_AESTHETIC_SCORER_VERSION = 'ps-aesthetic-v1';
export const SOFT_AESTHETIC_SCORER = Symbol('SOFT_AESTHETIC_SCORER');

export const AestheticDimension = {
  VISUAL_HIERARCHY: 'VISUAL_HIERARCHY',
  WHITESPACE_BALANCE: 'WHITESPACE_BALANCE',
  COLOR_LIGHTING_HARMONY: 'COLOR_LIGHTING_HARMONY',
  TYPOGRAPHIC_RHYTHM: 'TYPOGRAPHIC_RHYTHM',
  BRAND_LUXURY_POLISH: 'BRAND_LUXURY_POLISH',
} as const;
export type AestheticDimension = (typeof AestheticDimension)[keyof typeof AestheticDimension];

export const AESTHETIC_DIMENSION_WEIGHTS: Readonly<Record<AestheticDimension, number>> = {
  [AestheticDimension.VISUAL_HIERARCHY]: 0.25,
  [AestheticDimension.WHITESPACE_BALANCE]: 0.2,
  [AestheticDimension.COLOR_LIGHTING_HARMONY]: 0.2,
  [AestheticDimension.TYPOGRAPHIC_RHYTHM]: 0.2,
  [AestheticDimension.BRAND_LUXURY_POLISH]: 0.15,
};

export type AestheticGrade = 'EXEMPLARY' | 'EXCELLENT' | 'ACCEPTABLE' | 'NEEDS_POLISH';

export interface AestheticDimensionBreakdown {
  readonly score: number; // 0.00 to 1.00
  readonly weight: number; // 0.15 to 0.25
  readonly rawMetrics: Readonly<Record<string, number | string | boolean>>;
  readonly feedback: readonly string[];
}

export interface AestheticEvaluationInput {
  readonly assetBuffer?: Buffer | undefined;
  readonly sceneVersion?: CreativeSceneVersionRecord | undefined;
  readonly aspectRatio: '1:1' | '4:5' | '9:16';
  readonly width: number;
  readonly height: number;
  readonly heroBoundingBox?: BoundingBox | undefined;
  readonly typographyBlocks?: readonly TypographyBlockInput[] | undefined;
  readonly shadowTokens?:
    | {
        readonly blurRadius?: number | undefined;
        readonly opacity?: number | undefined;
      }
    | undefined;
  readonly paletteTokens?:
    | {
        readonly accentColor?: string | undefined;
        readonly backgroundTone?: string | undefined;
      }
    | undefined;
  readonly language?: 'en' | 'km' | 'bilingual' | undefined;
}

export interface AestheticEvaluationOutcome {
  readonly overallScore: number;
  readonly grade: AestheticGrade;
  readonly scorerVersion: string;
  readonly evaluatedAt: string;
  readonly dimensions: Record<AestheticDimension, AestheticDimensionBreakdown>;
  readonly recommendations: readonly string[];
}

export interface ISoftAestheticScorer {
  scoreComposition(
    input: AestheticEvaluationInput,
  ): Promise<AestheticEvaluationOutcome> | AestheticEvaluationOutcome;
}
