import {
  type CreateFreshnessAssessmentInput,
  type ProductFreshnessAssessment,
} from './product-freshness-assessment.repository.js';
import {
  type CreateProductSnapshotRecord,
  type ProductSnapshot,
} from './product-snapshot.repository.js';

export const PRODUCT_REVALIDATION_UNIT_OF_WORK = Symbol('PRODUCT_REVALIDATION_UNIT_OF_WORK');

export interface RevalidationOutboxDraft {
  readonly topic: string;
  readonly schemaVersion: number;
  readonly idempotencyKey: string;
  readonly aggregateType: string;
  readonly aggregateId?: string | undefined;
  readonly payload: Record<string, unknown>;
  readonly occurredAt: Date;
  readonly availableAt: Date;
}

export interface RevalidationUnitOfWorkInput {
  readonly currentSnapshot: ProductSnapshot;
  readonly newSnapshotInput?: CreateProductSnapshotRecord | undefined;
  readonly assessment: (snapshotId: string) => CreateFreshnessAssessmentInput;
  readonly outboxEvents: (params: {
    snapshot: ProductSnapshot;
    assessment: ProductFreshnessAssessment;
  }) => readonly RevalidationOutboxDraft[];
}

export interface RevalidationUnitOfWorkResult {
  readonly snapshot: ProductSnapshot;
  readonly isNewSnapshotCreated: boolean;
  readonly assessment: ProductFreshnessAssessment;
}

export interface ProductRevalidationUnitOfWork {
  execute(input: RevalidationUnitOfWorkInput): Promise<RevalidationUnitOfWorkResult>;
}
