import { Inject, Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import {
  type ClaimedOutboxEvent,
  APPLICATION_LOGGER,
  type ApplicationLogger,
} from '@parisian-shopper/common';
import {
  OUTBOX_RELAY_REPOSITORY,
  type OutboxRelayRepository,
  TELEGRAM_CHANNEL_BROADCAST_DISPATCHER,
  type TelegramChannelBroadcastDispatcher,
  VISUAL_REVIEW_NOTIFICATION_DISPATCHER,
  type VisualReviewNotificationDispatcher,
} from '@parisian-shopper/application';

import {
  CREATIVE_GENERATION_ENQUEUER,
  type CreativeGenerationEnqueuer,
} from './creative-generation.queue.js';

export const OUTBOX_RELAY_TOPICS = [
  'CREATIVE_GENERATION_REQUESTED',
  'CONTENT_APPROVED',
  'CREATIVE_VALIDATED',
  'CREATIVE_APPROVED',
  'CREATIVE_EXPORTED',
] as const;

@Injectable()
export class OutboxRelayWorker implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | undefined;
  private active = false;

  public constructor(
    @Inject(OUTBOX_RELAY_REPOSITORY)
    private readonly repository: OutboxRelayRepository,
    @Inject(CREATIVE_GENERATION_ENQUEUER)
    private readonly creativeQueue: CreativeGenerationEnqueuer,
    @Inject(APPLICATION_LOGGER)
    private readonly logger: ApplicationLogger,
    @Optional()
    @Inject(VISUAL_REVIEW_NOTIFICATION_DISPATCHER)
    private readonly visualReviewDispatcher?: VisualReviewNotificationDispatcher,
    @Optional()
    @Inject(TELEGRAM_CHANNEL_BROADCAST_DISPATCHER)
    private readonly channelBroadcaster?: TelegramChannelBroadcastDispatcher,
  ) {}

  public onModuleInit(): void {
    this.timer = setInterval(() => {
      this.dispatchOnce().catch((err: unknown) => {
        this.logger.warn(`Unhandled outbox relay error: ${(err as Error).message}`);
      });
    }, 1_000);
    this.timer.unref();
  }

  public onModuleDestroy(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
  }

  public async dispatchOnce(): Promise<number> {
    if (this.active) return 0;
    this.active = true;
    try {
      const topics =
        this.visualReviewDispatcher !== undefined
          ? OUTBOX_RELAY_TOPICS
          : OUTBOX_RELAY_TOPICS.filter((t) => t !== 'CREATIVE_VALIDATED');
      const events = await this.repository.claimEvents(topics, 10, new Date());
      for (const event of events) {
        await this.processEvent(event);
      }
      return events.length;
    } catch (error) {
      this.logger.warn(`Outbox relay worker error: ${(error as Error).message}`);
      return 0;
    } finally {
      this.active = false;
    }
  }

  public async processEvent(event: ClaimedOutboxEvent): Promise<void> {
    try {
      if (event.topic === 'CREATIVE_GENERATION_REQUESTED') {
        await this.handleCreativeGenerationRequested(event);
      } else if (event.topic === 'CONTENT_APPROVED') {
        await this.handleContentApproved(event);
      } else if (event.topic === 'CREATIVE_VALIDATED') {
        await this.handleCreativeValidated(event);
      } else if (event.topic === 'CREATIVE_APPROVED') {
        await this.handleCreativeApproved(event);
      } else if (event.topic === 'CREATIVE_EXPORTED') {
        this.handleCreativeExported(event);
      }
      await this.repository.markProcessed(event.id, new Date());
      this.logger.log(
        `Outbox event ${event.id} (${event.topic}) successfully processed and marked done.`,
      );
    } catch (error) {
      const terminal = event.attemptCount >= 5;
      const retryDelayMs = Math.min(60_000, 1_000 * 2 ** Math.max(0, event.attemptCount - 1));
      const retryAt = new Date(Date.now() + retryDelayMs);
      const errorCode = error instanceof Error ? error.name : 'RELAY_PROCESSING_ERROR';

      this.logger.warn(`Failed to process outbox event ${event.id} (${event.topic})`, {
        action: 'outbox_relay_failed',
        outboxEventId: event.id,
        topic: event.topic,
        errorCode,
        attemptCount: event.attemptCount,
        terminal,
        error: error instanceof Error ? error.message : String(error),
      });

      await this.repository.markFailed(event.id, errorCode, retryAt, terminal);
    }
  }

  private async handleCreativeGenerationRequested(event: ClaimedOutboxEvent): Promise<void> {
    const contentVersionId = event.payload.contentVersionId as string | undefined;
    if (!contentVersionId) {
      throw new Error('CREATIVE_GENERATION_REQUESTED payload missing contentVersionId');
    }

    const format = event.payload.format as 'FEED_SQUARE' | 'STORY_VERTICAL' | undefined;
    const stylePreset =
      typeof event.payload.stylePreset === 'string' ? event.payload.stylePreset : undefined;
    const creativeJobId =
      typeof event.payload.creativeJobId === 'string' ? event.payload.creativeJobId : undefined;

    await this.creativeQueue.enqueue({
      contentVersionId,
      requestedBy: (event.payload.requestedBy as string) ?? 'system',
      ...(format !== undefined ? { format } : {}),
      ...(stylePreset !== undefined ? { stylePreset } : {}),
      ...(creativeJobId !== undefined ? { creativeJobId } : {}),
    });
  }

  private async handleContentApproved(event: ClaimedOutboxEvent): Promise<void> {
    const contentVersionId = event.payload.contentVersionId as string | undefined;
    if (!contentVersionId) {
      throw new Error('CONTENT_APPROVED payload missing contentVersionId');
    }

    await this.creativeQueue.enqueue({
      contentVersionId,
      requestedBy: (event.payload.approverUserId as string) ?? 'system',
    });
  }

  private async handleCreativeValidated(event: ClaimedOutboxEvent): Promise<void> {
    if (this.visualReviewDispatcher) {
      await this.visualReviewDispatcher.dispatchVisualReview(event);
    } else {
      this.logger.log('Dispatched Telegram visual review notification event', {
        action: 'telegram_visual_review_notification_dispatched',
        outboxEventId: event.id,
        creativeJobId: event.payload.creativeJobId,
        visualAssetId: event.payload.visualAssetId,
      });
    }
  }

  private async handleCreativeApproved(event: ClaimedOutboxEvent): Promise<void> {
    if (this.channelBroadcaster) {
      await this.channelBroadcaster.dispatchBroadcast(event);
    } else {
      this.logger.log('Dispatched Telegram channel broadcast event', {
        action: 'telegram_channel_broadcast_dispatched',
        outboxEventId: event.id,
        creativeJobId: event.payload.creativeJobId,
        visualAssetId: event.payload.visualAssetId,
      });
    }
  }

  private handleCreativeExported(event: ClaimedOutboxEvent): void {
    this.logger.log('Processed CREATIVE_EXPORTED outbox telemetry event', {
      action: 'creative_exported_telemetry_dispatched',
      outboxEventId: event.id,
      exportId: event.payload.exportId,
      creativeJobId: event.payload.creativeJobId,
      visualAssetId: event.payload.visualAssetId,
      format: event.payload.format,
      encoding: event.payload.encoding,
    });
  }
}
