import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type { OutboxWriter } from '@parisian-shopper/common';
import { EmptyFeedbackBatchError, InvalidFeedbackRecordError } from '../domain/brand-errors.js';
import type {
  FeedbackIngestionSummary,
  ReviewFeedbackRecord,
} from '../domain/brand-profile.types.js';
import {
  BRAND_DATASET_REPOSITORY,
  type BrandDatasetRepository,
} from './brand-dataset.repository.js';

export interface IngestReviewFeedbackInput {
  readonly feedbackBatch: readonly ReviewFeedbackRecord[];
  readonly targetDatasetVersionId?: string | undefined;
  readonly actorUserId?: string | undefined;
  readonly outboxWriter?: OutboxWriter | undefined;
}

@Injectable()
export class IngestReviewFeedbackUseCase {
  public constructor(
    @Inject(BRAND_DATASET_REPOSITORY)
    private readonly brandDatasetRepo: BrandDatasetRepository,
    @Optional()
    @Inject('OUTBOX_WRITER')
    private readonly defaultOutboxWriter?: OutboxWriter,
  ) {}

  public async execute(input: IngestReviewFeedbackInput): Promise<FeedbackIngestionSummary> {
    if (!input.feedbackBatch || input.feedbackBatch.length === 0) {
      throw new EmptyFeedbackBatchError();
    }

    const flagCounter = new Map<string, number>();
    const preparedRecords: ReviewFeedbackRecord[] = [];

    for (const rec of input.feedbackBatch) {
      if (!rec.originalText || rec.originalText.trim().length === 0) {
        throw new InvalidFeedbackRecordError('originalText cannot be empty');
      }
      if (!['APPROVED', 'REJECTED', 'REVISED'].includes(rec.decision)) {
        throw new InvalidFeedbackRecordError(
          `Invalid decision '${rec.decision}'. Expected APPROVED, REJECTED, or REVISED`,
        );
      }

      const toneFlags = rec.toneFlags ?? [];
      for (const flag of toneFlags) {
        flagCounter.set(flag, (flagCounter.get(flag) ?? 0) + 1);
      }

      preparedRecords.push({
        ...rec,
        sourceType: rec.sourceType ?? 'REVIEW_DESK',
        datasetVersionId: rec.datasetVersionId ?? input.targetDatasetVersionId ?? null,
        reviewerUserId: rec.reviewerUserId ?? input.actorUserId ?? null,
      });
    }

    await this.brandDatasetRepo.storeFeedbackRecords(preparedRecords);

    const batchId = randomUUID();
    const ingestedCount = preparedRecords.length;
    const approvedCount = preparedRecords.filter((r) => r.decision === 'APPROVED').length;
    const rejectedCount = preparedRecords.filter((r) => r.decision === 'REJECTED').length;
    const revisedCount = preparedRecords.filter((r) => r.decision === 'REVISED').length;

    const commonToneFlags = Array.from(flagCounter.entries())
      .map(([flag, count]) => ({ flag, count }))
      .sort((a, b) => b.count - a.count);

    const ingestedAt = new Date().toISOString();

    const summary: FeedbackIngestionSummary = {
      batchId,
      ingestedCount,
      approvedCount,
      rejectedCount,
      revisedCount,
      commonToneFlags,
      ingestedAt,
    };

    const outbox = input.outboxWriter ?? this.defaultOutboxWriter;
    if (outbox) {
      await outbox.append({
        topic: 'brand.feedback.ingested',
        schemaVersion: 1,
        idempotencyKey: `brand-feedback-${batchId}`,
        aggregateType: 'BrandDatasetVersion',
        aggregateId: input.targetDatasetVersionId ?? 'unassigned',
        payload: {
          batchId,
          ingestedCount,
          approvedCount,
          rejectedCount,
          revisedCount,
          datasetVersionId: input.targetDatasetVersionId ?? null,
          ingestedAt,
        },
        occurredAt: new Date(),
        availableAt: new Date(),
      });
    }

    return summary;
  }
}
