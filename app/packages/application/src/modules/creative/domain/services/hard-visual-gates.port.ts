import { type BoundingBox } from './text-layout-engine.js';
import { type ProductSnapshot } from '../../../products/application/product-snapshot.repository.js';
import { type FactualGateInput } from './factual-consistency-gate.port.js';

export const HARD_VISUAL_GATES_VERSION = 'ps-hard-gates-v1';

export const HardGateCode = {
  // Container & Dimensions
  GATE_CAS_HASH_MISMATCH: 'GATE_CAS_HASH_MISMATCH',
  GATE_FILE_SIZE_EXCEEDED: 'GATE_FILE_SIZE_EXCEEDED',
  GATE_CONTAINER_INVALID: 'GATE_CONTAINER_INVALID',
  GATE_DIMENSIONS_MISMATCH: 'GATE_DIMENSIONS_MISMATCH',

  // Product Truth
  GATE_PLACEHOLDER_REJECTED: 'GATE_PLACEHOLDER_REJECTED',
  GATE_PRODUCT_ALPHA_CLIPPED: 'GATE_PRODUCT_ALPHA_CLIPPED',
  GATE_PRODUCT_VISIBILITY_LOW: 'GATE_PRODUCT_VISIBILITY_LOW',

  // Geometry & Safe Margin
  GATE_SAFE_MARGIN_VIOLATION: 'GATE_SAFE_MARGIN_VIOLATION',
  GATE_CTA_HERO_COLLISION: 'GATE_CTA_HERO_COLLISION',

  // Typography & Readability
  GATE_UNSAFE_UNICODE: 'GATE_UNSAFE_UNICODE',
  GATE_MISSING_GLYPHS: 'GATE_MISSING_GLYPHS',
  GATE_TEXT_CONTRAST_LOW: 'GATE_TEXT_CONTRAST_LOW',

  // Factual
  GATE_FACTUAL_PRICE_MISMATCH: 'GATE_FACTUAL_PRICE_MISMATCH',
  GATE_FACTUAL_PROMO_MISMATCH: 'GATE_FACTUAL_PROMO_MISMATCH',
  GATE_FACTUAL_SKU_MISMATCH: 'GATE_FACTUAL_SKU_MISMATCH',
  GATE_SNAPSHOT_STALE: 'GATE_SNAPSHOT_STALE',
} as const;
export type HardGateCode = (typeof HardGateCode)[keyof typeof HardGateCode];

export interface HardGateFailure {
  readonly code: HardGateCode;
  readonly field: string;
  readonly message: string;
  readonly remediationAction: string;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface HardGateLayerInput {
  readonly layerIndex: number;
  readonly layerGroup: string;
  readonly buffer: Buffer;
  readonly mimeType: string;
  readonly contentDigest: string;
  readonly placement?: BoundingBox | undefined;
}

export interface TypographyBlockInput {
  readonly role: string; // 'headline' | 'price' | 'promotionalPrice' | 'body' | 'cta' | 'subhead' | 'badge'
  readonly text: string;
  readonly box: BoundingBox;
  readonly textColor?: string | undefined;
  readonly fontSize?: number | undefined;
}

export interface HardGateEvaluationInput {
  readonly assetBuffer: Buffer;
  readonly expectedSha256: string;
  readonly aspectRatio: '1:1' | '4:5' | '9:16';
  readonly width: number;
  readonly height: number;
  readonly layers?: readonly HardGateLayerInput[] | undefined;
  readonly productAssetBuffer?: Buffer | undefined;
  readonly productSha256?: string | undefined;
  readonly heroBoundingBox?: BoundingBox | undefined;
  readonly ctaBoundingBox?: BoundingBox | undefined;
  readonly typographyBlocks?: readonly TypographyBlockInput[] | undefined;
  readonly safeMarginPercent?: number | undefined; // default: 0.05 (5%)
  readonly maxFileSizeBytes?: number | undefined; // default: 15MB
  readonly productSnapshot?: ProductSnapshot | undefined;
  readonly factualInput?: FactualGateInput | undefined;
  readonly renderedSnapshotHash?: string | undefined;
  readonly sceneSku?: string | undefined;
}

export interface HardGateMetrics {
  readonly byteSize: number;
  readonly actualSha256: string;
  readonly actualWidth: number;
  readonly actualHeight: number;
  readonly productVisibleRatio?: number | undefined;
  readonly minTextContrastRatio?: number | undefined;
}

export interface HardGateOutcome {
  readonly isPassed: boolean;
  readonly validatorVersion: string;
  readonly evaluatedAt: string;
  readonly failures: readonly HardGateFailure[];
  readonly metrics: HardGateMetrics;
}

export function boxesIntersect(boxA: BoundingBox, boxB: BoundingBox, tolerance = 0): boolean {
  return !(
    boxA.x + boxA.width - tolerance <= boxB.x ||
    boxB.x + boxB.width - tolerance <= boxA.x ||
    boxA.y + boxA.height - tolerance <= boxB.y ||
    boxB.y + boxB.height - tolerance <= boxA.y
  );
}
