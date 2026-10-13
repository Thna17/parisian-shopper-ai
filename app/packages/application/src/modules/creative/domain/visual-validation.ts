import { type VisualValidationStatus } from './creative.js';

export const VISUAL_VALIDATOR_VERSION = 'ps-visual-v1' as const;

export const VisualValidationSeverity = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  BLOCKING: 'BLOCKING',
} as const;
export type VisualValidationSeverity =
  (typeof VisualValidationSeverity)[keyof typeof VisualValidationSeverity];

export const VisualFindingCode = {
  DIMENSIONS_INVALID: 'DIMENSIONS_INVALID',
  ASPECT_RATIO_MISMATCH: 'ASPECT_RATIO_MISMATCH',
  FILE_SIZE_EXCEEDED: 'FILE_SIZE_EXCEEDED',
  CONTAINER_UNSUPPORTED: 'CONTAINER_UNSUPPORTED',
  PIXEL_CEILING_EXCEEDED: 'PIXEL_CEILING_EXCEEDED',
  FRAME_COUNT_INVALID: 'FRAME_COUNT_INVALID',
  COLOR_SPACE_INVALID: 'COLOR_SPACE_INVALID',
  HERO_HASH_MISMATCH: 'HERO_HASH_MISMATCH',
  BOUNDING_BOX_OUT_OF_BOUNDS: 'BOUNDING_BOX_OUT_OF_BOUNDS',
  CAS_HASH_MISMATCH: 'CAS_HASH_MISMATCH',
  UNEXPECTED_TEXT_DETECTED: 'UNEXPECTED_TEXT_DETECTED',
  SCANNER_INCONCLUSIVE: 'SCANNER_INCONCLUSIVE',
  VALIDATOR_INTERNAL_ERROR: 'VALIDATOR_INTERNAL_ERROR',
} as const;
export type VisualFindingCode = (typeof VisualFindingCode)[keyof typeof VisualFindingCode];

export interface VisualValidationFindingDraft {
  readonly field: string;
  readonly severity: VisualValidationSeverity;
  readonly code: VisualFindingCode;
  readonly message: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface VisualValidationOutcome {
  readonly validatorVersion: typeof VISUAL_VALIDATOR_VERSION;
  readonly status: VisualValidationStatus;
  readonly findings: readonly VisualValidationFindingDraft[];
  readonly findingCount: number;
  readonly blockingCount: number;
  readonly warningCount: number;
  readonly infoCount: number;
}
