import { type ProductSnapshot } from '../../../products/application/product-snapshot.repository.js';
import {
  type CreativeSceneVersionRecord,
  type TypographyPriceBadge,
} from '../scene/creative-scene.types.js';
import {
  type HardGateCode,
  type HardGateFailure,
  type TypographyBlockInput,
} from './hard-visual-gates.port.js';

export const FACTUAL_CONSISTENCY_GATE_VERSION = 'ps-factual-gate-v1';
export const FACTUAL_CONSISTENCY_GATE = Symbol('FACTUAL_CONSISTENCY_GATE');

export interface FactualGateInput {
  readonly sceneVersion?: CreativeSceneVersionRecord | undefined;
  readonly typographyBlocks?: readonly TypographyBlockInput[] | undefined;
  readonly priceBadge?: TypographyPriceBadge | undefined;
  readonly productSnapshot: ProductSnapshot;
  readonly renderedSnapshotHash?: string | undefined;
  readonly sceneSku?: string | undefined;
}

export interface FactualDiscrepancy {
  readonly code: HardGateCode;
  readonly field: string;
  readonly message: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly remediationAction: string;
}

export interface FactualGateOutcome {
  readonly isPassed: boolean;
  readonly validatorVersion: string;
  readonly evaluatedAt: string;
  readonly failures: readonly HardGateFailure[];
  readonly discrepancies: readonly FactualDiscrepancy[];
}

export interface IFactualConsistencyGate {
  evaluate(input: FactualGateInput): Promise<FactualGateOutcome> | FactualGateOutcome;
}
