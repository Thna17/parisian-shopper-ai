/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { OutboxWriter } from '@parisian-shopper/common';
import { EmptyFeedbackBatchError, InvalidFeedbackRecordError } from '../domain/brand-errors.js';
import type { ReviewFeedbackRecord } from '../domain/brand-profile.types.js';
import { type BrandDatasetRepository } from './brand-dataset.repository.js';
import { IngestReviewFeedbackUseCase } from './ingest-review-feedback.use-case.js';

describe('SEC-BRAND-EVAL-08 to SEC-BRAND-EVAL-13: Human Review Feedback Ingestion', () => {
  let mockDatasetRepo: jest.Mocked<BrandDatasetRepository>;
  let mockOutboxWriter: jest.Mocked<OutboxWriter>;
  let ingestFeedbackUseCase: IngestReviewFeedbackUseCase;

  const sampleFeedbackBatch: ReviewFeedbackRecord[] = [
    {
      sourceType: 'REVIEW_DESK',
      contentJobId: 'job-uuid-001',
      contentVersionId: 'ver-uuid-001',
      originalText: 'Discover timeless elegance in our new Phnom Penh boutique.',
      revisedText: null,
      decision: 'APPROVED',
      critiqueNotes: 'Perfect luxury tone and concise French wording.',
      toneFlags: ['luxury_aligned', 'authentic'],
      reviewerUserId: 'usr-reviewer-01',
    },
    {
      sourceType: 'REVIEW_DESK',
      contentJobId: 'job-uuid-002',
      contentVersionId: 'ver-uuid-002',
      originalText: 'Super sale discount buy today before items run out!',
      revisedText: 'An exclusive seasonal curation awaits at our boutique.',
      decision: 'REVISED',
      critiqueNotes: 'Removed cheap retail hyperbole and applied quiet luxury directives.',
      toneFlags: ['too_promotional', 'bargain_vocabulary'],
      reviewerUserId: 'usr-reviewer-01',
    },
    {
      sourceType: 'REVIEW_DESK',
      contentJobId: 'job-uuid-003',
      contentVersionId: 'ver-uuid-003',
      originalText: 'Cheapest prices guaranteed anywhere in town.',
      decision: 'REJECTED',
      critiqueNotes: 'Violates core luxury brand pillars completely.',
      toneFlags: ['too_promotional', 'forbidden_hyperbole'],
      reviewerUserId: 'usr-reviewer-02',
    },
  ];

  beforeEach(() => {
    mockDatasetRepo = {
      createDatasetVersion: jest.fn<(...args: any[]) => Promise<any>>(),
      findById: jest.fn<(...args: any[]) => Promise<any>>(),
      findByVersionString: jest.fn<(...args: any[]) => Promise<any>>(),
      listDatasets: jest.fn<(...args: any[]) => Promise<any>>(),
      updateStatus: jest.fn<(...args: any[]) => Promise<any>>(),
      storeFeedbackRecords: jest
        .fn<(...args: any[]) => Promise<any>>()
        .mockImplementation((records: any) => Promise.resolve(records)),
      listFeedback: jest.fn<(...args: any[]) => Promise<any>>(),
    };

    mockOutboxWriter = {
      append: jest.fn<(event: any) => Promise<string>>().mockResolvedValue('outbox-feedback-1'),
    };

    ingestFeedbackUseCase = new IngestReviewFeedbackUseCase(mockDatasetRepo, mockOutboxWriter);
  });

  it('SEC-BRAND-EVAL-08: successfully ingests review feedback records across APPROVED, REVISED, and REJECTED decisions', async () => {
    const summary = await ingestFeedbackUseCase.execute({
      feedbackBatch: sampleFeedbackBatch,
    });

    expect(summary.ingestedCount).toBe(3);
    expect(summary.approvedCount).toBe(1);
    expect(summary.revisedCount).toBe(1);
    expect(summary.rejectedCount).toBe(1);
    expect(mockDatasetRepo.storeFeedbackRecords).toHaveBeenCalledTimes(1);
  });

  it('SEC-BRAND-EVAL-09: throws InvalidFeedbackRecordError when originalText is empty or decision is invalid', async () => {
    const emptyTextInput: ReviewFeedbackRecord[] = [
      {
        sourceType: 'REVIEW_DESK',
        originalText: '   ',
        decision: 'APPROVED',
      },
    ];

    await expect(
      ingestFeedbackUseCase.execute({
        feedbackBatch: emptyTextInput,
      }),
    ).rejects.toThrow(InvalidFeedbackRecordError);

    const invalidDecisionInput: any[] = [
      {
        sourceType: 'REVIEW_DESK',
        originalText: 'Valid copy text',
        decision: 'PENDING_MAYBE',
      },
    ];

    await expect(
      ingestFeedbackUseCase.execute({
        feedbackBatch: invalidDecisionInput,
      }),
    ).rejects.toThrow(InvalidFeedbackRecordError);
  });

  it('SEC-BRAND-EVAL-10: throws EmptyFeedbackBatchError when batch is empty or undefined', async () => {
    await expect(
      ingestFeedbackUseCase.execute({
        feedbackBatch: [],
      }),
    ).rejects.toThrow(EmptyFeedbackBatchError);
  });

  it('SEC-BRAND-EVAL-11: preserves reviewer ID and links target dataset version if provided', async () => {
    await ingestFeedbackUseCase.execute({
      feedbackBatch: sampleFeedbackBatch,
      targetDatasetVersionId: 'dataset-uuid-2026',
      actorUserId: 'usr-admin-default',
    });

    const passedRecords = mockDatasetRepo.storeFeedbackRecords.mock.calls[0]?.[0];
    expect(passedRecords).toBeDefined();
    expect(passedRecords?.[0]?.datasetVersionId).toBe('dataset-uuid-2026');
    expect(passedRecords?.[0]?.reviewerUserId).toBe('usr-reviewer-01');
  });

  it('SEC-BRAND-EVAL-12: aggregates common tone violation flags sorted by frequency', async () => {
    const summary = await ingestFeedbackUseCase.execute({
      feedbackBatch: sampleFeedbackBatch,
    });

    expect(summary.commonToneFlags).toBeDefined();
    expect(summary.commonToneFlags[0]?.flag).toBe('too_promotional');
    expect(summary.commonToneFlags[0]?.count).toBe(2);
  });

  it('SEC-BRAND-EVAL-13: emits brand.feedback.ingested outbox event with batch telemetry', async () => {
    const summary = await ingestFeedbackUseCase.execute({
      feedbackBatch: sampleFeedbackBatch,
      targetDatasetVersionId: 'dataset-uuid-2026',
    });

    expect(mockOutboxWriter.append).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'brand.feedback.ingested',
        aggregateType: 'BrandDatasetVersion',
        aggregateId: 'dataset-uuid-2026',
        payload: expect.objectContaining({
          batchId: summary.batchId,
          ingestedCount: 3,
          approvedCount: 1,
          datasetVersionId: 'dataset-uuid-2026',
        }),
      }),
    );
  });
});
