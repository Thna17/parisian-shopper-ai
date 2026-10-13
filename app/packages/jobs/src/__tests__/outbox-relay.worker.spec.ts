import { describe, expect, it, jest } from '@jest/globals';
import {
  type OutboxRelayRepository,
  type VisualReviewNotificationDispatcher,
} from '@parisian-shopper/application';
import {
  type ApplicationLogger,
  type ClaimedOutboxEvent,
} from '@parisian-shopper/common';

import { type CreativeGenerationEnqueuer } from '../creative-generation.queue.js';
import { OutboxRelayWorker } from '../outbox-relay.worker.js';

describe('OutboxRelayWorker', () => {
  const mockLogger: ApplicationLogger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  };

  const createMockEvent = (
    topic: string,
    payload: Record<string, unknown>,
    attemptCount = 1,
  ): ClaimedOutboxEvent => ({
    id: 'outbox-event-1',
    topic,
    schemaVersion: 1,
    idempotencyKey: `idempotent-${topic}-1`,
    payload,
    occurredAt: new Date(),
    availableAt: new Date(),
    attemptCount,
  });

  it('claims and enqueues creative generation when CREATIVE_GENERATION_REQUESTED occurs', async () => {
    const event = createMockEvent('CREATIVE_GENERATION_REQUESTED', {
      contentVersionId: 'version-1',
      requestedBy: 'user-admin',
      format: 'FEED_SQUARE',
      stylePreset: 'editorial',
    });

    const claimEventsMock = jest.fn((_t?: readonly string[], _l?: number, _n?: Date) =>
      Promise.resolve([event]),
    );
    const markProcessedMock = jest.fn((_id?: string, _n?: Date) => Promise.resolve());
    const markFailedMock = jest.fn((_id?: string, _err?: string, _ret?: Date, _term?: boolean) =>
      Promise.resolve(),
    );

    const repository: OutboxRelayRepository = {
      claimEvents: claimEventsMock,
      markProcessed: markProcessedMock,
      markFailed: markFailedMock,
    };

    const enqueueMock = jest.fn((_data?: unknown) => Promise.resolve());
    const creativeQueue: CreativeGenerationEnqueuer = {
      enqueue: enqueueMock,
    };

    const worker = new OutboxRelayWorker(repository, creativeQueue, mockLogger);

    const processedCount = await worker.dispatchOnce();

    expect(processedCount).toBe(1);
    expect(enqueueMock).toHaveBeenCalledWith({
      contentVersionId: 'version-1',
      requestedBy: 'user-admin',
      format: 'FEED_SQUARE',
      stylePreset: 'editorial',
    });
    expect(markProcessedMock).toHaveBeenCalledWith('outbox-event-1', expect.any(Date));
  });

  it('claims and enqueues creative generation when CONTENT_APPROVED occurs', async () => {
    const event = createMockEvent('CONTENT_APPROVED', {
      contentVersionId: 'version-approved-1',
      approverUserId: 'user-reviewer',
    });

    const claimEventsMock = jest.fn((_t?: readonly string[], _l?: number, _n?: Date) =>
      Promise.resolve([event]),
    );
    const markProcessedMock = jest.fn((_id?: string, _n?: Date) => Promise.resolve());
    const markFailedMock = jest.fn((_id?: string, _err?: string, _ret?: Date, _term?: boolean) =>
      Promise.resolve(),
    );

    const repository: OutboxRelayRepository = {
      claimEvents: claimEventsMock,
      markProcessed: markProcessedMock,
      markFailed: markFailedMock,
    };

    const enqueueMock = jest.fn((_data?: unknown) => Promise.resolve());
    const creativeQueue: CreativeGenerationEnqueuer = {
      enqueue: enqueueMock,
    };

    const worker = new OutboxRelayWorker(repository, creativeQueue, mockLogger);

    const processedCount = await worker.dispatchOnce();

    expect(processedCount).toBe(1);
    expect(enqueueMock).toHaveBeenCalledWith({
      contentVersionId: 'version-approved-1',
      requestedBy: 'user-reviewer',
    });
    expect(markProcessedMock).toHaveBeenCalledWith('outbox-event-1', expect.any(Date));
  });

  it('dispatches visual review notification when CREATIVE_VALIDATED occurs', async () => {
    const event = createMockEvent('CREATIVE_VALIDATED', {
      creativeJobId: 'creative-job-456',
      visualAssetId: 'visual-asset-789',
      validationResultId: 'val-res-1',
      status: 'PASSED',
    });

    const claimEventsMock = jest.fn((_t?: readonly string[], _l?: number, _n?: Date) =>
      Promise.resolve([event]),
    );
    const markProcessedMock = jest.fn((_id?: string, _n?: Date) => Promise.resolve());
    const markFailedMock = jest.fn((_id?: string, _err?: string, _ret?: Date, _term?: boolean) =>
      Promise.resolve(),
    );

    const repository: OutboxRelayRepository = {
      claimEvents: claimEventsMock,
      markProcessed: markProcessedMock,
      markFailed: markFailedMock,
    };

    const creativeQueue: CreativeGenerationEnqueuer = {
      enqueue: jest.fn((_data?: unknown) => Promise.resolve()),
    };

    const dispatchVisualReviewMock = jest.fn((_ev?: ClaimedOutboxEvent) => Promise.resolve());
    const visualReviewDispatcher: VisualReviewNotificationDispatcher = {
      dispatchVisualReview: dispatchVisualReviewMock,
    };

    const worker = new OutboxRelayWorker(
      repository,
      creativeQueue,
      mockLogger,
      visualReviewDispatcher,
    );

    const processedCount = await worker.dispatchOnce();

    expect(processedCount).toBe(1);
    expect(dispatchVisualReviewMock).toHaveBeenCalledWith(event);
    expect(markProcessedMock).toHaveBeenCalledWith('outbox-event-1', expect.any(Date));
  });

  it('marks outbox event failed with retryAt upon transient exception', async () => {
    const event = createMockEvent(
      'CREATIVE_GENERATION_REQUESTED',
      { contentVersionId: 'version-1' },
      1,
    );

    const claimEventsMock = jest.fn((_t?: readonly string[], _l?: number, _n?: Date) =>
      Promise.resolve([event]),
    );
    const markProcessedMock = jest.fn((_id?: string, _n?: Date) => Promise.resolve());
    const markFailedMock = jest.fn((_id?: string, _err?: string, _ret?: Date, _term?: boolean) =>
      Promise.resolve(),
    );

    const repository: OutboxRelayRepository = {
      claimEvents: claimEventsMock,
      markProcessed: markProcessedMock,
      markFailed: markFailedMock,
    };

    const enqueueMock = jest.fn((_data?: unknown) => Promise.reject(new Error('Valkey connection reset')));
    const creativeQueue: CreativeGenerationEnqueuer = {
      enqueue: enqueueMock,
    };

    const worker = new OutboxRelayWorker(repository, creativeQueue, mockLogger);

    await worker.dispatchOnce();

    expect(markFailedMock).toHaveBeenCalledWith(
      'outbox-event-1',
      'Error',
      expect.any(Date),
      false, // terminal is false on attempt 1
    );
    expect(markProcessedMock).not.toHaveBeenCalled();
  });

  it('marks outbox event terminal when attempts exceed limit (>= 5)', async () => {
    const event = createMockEvent(
      'CREATIVE_GENERATION_REQUESTED',
      { contentVersionId: 'version-1' },
      5,
    );

    const claimEventsMock = jest.fn((_t?: readonly string[], _l?: number, _n?: Date) =>
      Promise.resolve([event]),
    );
    const markProcessedMock = jest.fn((_id?: string, _n?: Date) => Promise.resolve());
    const markFailedMock = jest.fn((_id?: string, _err?: string, _ret?: Date, _term?: boolean) =>
      Promise.resolve(),
    );

    const repository: OutboxRelayRepository = {
      claimEvents: claimEventsMock,
      markProcessed: markProcessedMock,
      markFailed: markFailedMock,
    };

    const enqueueMock = jest.fn((_data?: unknown) => Promise.reject(new Error('Fatal error')));
    const creativeQueue: CreativeGenerationEnqueuer = {
      enqueue: enqueueMock,
    };

    const worker = new OutboxRelayWorker(repository, creativeQueue, mockLogger);

    await worker.dispatchOnce();

    expect(markFailedMock).toHaveBeenCalledWith(
      'outbox-event-1',
      'Error',
      expect.any(Date),
      true, // terminal is true on attempt 5
    );
  });
});
