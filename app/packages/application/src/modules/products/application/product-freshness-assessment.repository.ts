import {
  type FreshnessState,
  type RevalidationOutcome,
  type SourceAvailability,
} from '../domain/freshness-state.js';

export const PRODUCT_FRESHNESS_ASSESSMENT_REPOSITORY = Symbol(
  'PRODUCT_FRESHNESS_ASSESSMENT_REPOSITORY',
);

export interface ProductFreshnessAssessment {
  readonly id: string;
  readonly snapshotId: string;
  readonly evaluatedAt: Date;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly freshnessState: FreshnessState;
  readonly revalidationOutcome: RevalidationOutcome;
  readonly sourceAvailability: SourceAvailability;
  readonly reasonCodes: readonly string[];
  readonly evidence: Readonly<Record<string, unknown>>;
  readonly comparedSnapshotId?: string | undefined;
  readonly actorUserId?: string | undefined;
  readonly idempotencyKey?: string | undefined;
  readonly createdAt: Date;
}

export interface CreateFreshnessAssessmentInput {
  readonly snapshotId: string;
  readonly evaluatedAt: Date;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly freshnessState: FreshnessState;
  readonly revalidationOutcome: RevalidationOutcome;
  readonly sourceAvailability: SourceAvailability;
  readonly reasonCodes: readonly string[];
  readonly evidence: Readonly<Record<string, unknown>>;
  readonly comparedSnapshotId?: string | undefined;
  readonly actorUserId?: string | undefined;
  readonly idempotencyKey?: string | undefined;
}

export interface ProductFreshnessAssessmentRepository {
  create(input: CreateFreshnessAssessmentInput): Promise<ProductFreshnessAssessment>;
  findLatestForSnapshot(snapshotId: string): Promise<ProductFreshnessAssessment | null>;
  listForSnapshot(
    snapshotId: string,
    limit?: number,
  ): Promise<readonly ProductFreshnessAssessment[]>;
  findByIdempotencyKey(key: string): Promise<ProductFreshnessAssessment | null>;
}
