import { type VisualValidationStatus } from '../domain/creative.js';
import { type VisualValidationSeverity } from '../domain/visual-validation.js';

export const VISUAL_VALIDATION_REPOSITORY = Symbol('VISUAL_VALIDATION_REPOSITORY');

export interface VisualValidationFindingRecord {
  readonly id: string;
  readonly visualValidationResultId: string;
  readonly field: string;
  readonly severity: VisualValidationSeverity;
  readonly code: string;
  readonly message: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly createdAt: Date;
}

export interface VisualValidationResultRecord {
  readonly id: string;
  readonly visualAssetId: string;
  readonly validatorVersion: string;
  readonly status: VisualValidationStatus;
  readonly findingCount: number;
  readonly blockingCount: number;
  readonly warningCount: number;
  readonly infoCount: number;
  readonly findings: readonly VisualValidationFindingRecord[];
  readonly createdAt: Date;
}

export interface PersistVisualValidationInput {
  readonly visualAssetId: string;
  readonly validatorVersion: string;
  readonly status: VisualValidationStatus;
  readonly findings: readonly {
    readonly field: string;
    readonly severity: VisualValidationSeverity;
    readonly code: string;
    readonly message: string;
    readonly metadata?: Readonly<Record<string, unknown>>;
  }[];
}

export interface VisualValidationRepository {
  persistResult(input: PersistVisualValidationInput): Promise<VisualValidationResultRecord>;
  findByAssetId(visualAssetId: string): Promise<readonly VisualValidationResultRecord[]>;
  findLatestByAssetId(visualAssetId: string): Promise<VisualValidationResultRecord | null>;
}
