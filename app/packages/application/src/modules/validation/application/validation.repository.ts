import {
  type FactualValidationOutcome,
  type FindingCode,
  type FindingSeverity,
  type ValidationStatus,
} from '../domain/validation.js';

export const VALIDATION_REPOSITORY = Symbol('VALIDATION_REPOSITORY');

export interface PersistedValidationFinding {
  id: string;
  validationResultId: string;
  field: string;
  severity: FindingSeverity;
  code: FindingCode;
  message: string;
  expectedValue?: unknown;
  actualValue?: unknown;
  sourcePath?: string;
  contentPath?: string;
  metadata?: Readonly<Record<string, unknown>>;
  createdAt: Date;
}

export interface PersistedValidationResult {
  id: string;
  contentVersionId: string;
  validatorVersion: string;
  status: ValidationStatus;
  findingCount: number;
  blockingCount: number;
  warningCount: number;
  infoCount: number;
  createdAt: Date;
  findings: readonly PersistedValidationFinding[];
}

export interface CreateValidationResult {
  contentVersionId: string;
  outcome: FactualValidationOutcome;
}

export interface ValidationRepository {
  create(input: CreateValidationResult): Promise<PersistedValidationResult>;
  findByContentVersionAndValidatorVersion(
    contentVersionId: string,
    validatorVersion: string,
  ): Promise<PersistedValidationResult | null>;
  findLatestByContentVersion(contentVersionId: string): Promise<PersistedValidationResult | null>;
}
