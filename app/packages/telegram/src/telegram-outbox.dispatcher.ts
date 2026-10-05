import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  TELEGRAM_WORKFLOW_REPOSITORY,
  TelegramAction,
  TelegramActionTokenService,
  callbackData,
  formatDraft,
  splitTelegramMessage,
  type TelegramMessage,
  type TelegramWorkflowRepository,
} from '@parisian-shopper/application';
import { AppConfigService, FeatureFlag, FeatureFlagService } from '@parisian-shopper/config';
import { APPLICATION_LOGGER, type ApplicationLogger } from '@parisian-shopper/common';
import { GrammyError, HttpError } from 'grammy';

import {
  TELEGRAM_DELIVERY_GATEWAY,
  type TelegramDeliveryGateway,
} from './telegram-delivery.gateway.js';

const TOPICS = ['CONTENT_VALIDATION_COMPLETED', 'CONTENT_GENERATION_FAILED'] as const;

@Injectable()
export class TelegramOutboxDispatcher implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | undefined;
  private active = false;

  public constructor(
    @Inject(TELEGRAM_WORKFLOW_REPOSITORY) private readonly repository: TelegramWorkflowRepository,
    @Inject(TELEGRAM_DELIVERY_GATEWAY) private readonly gateway: TelegramDeliveryGateway,
    private readonly tokens: TelegramActionTokenService,
    @Inject(AppConfigService) private readonly config: Pick<AppConfigService, 'telegram'>,
    @Inject(FeatureFlagService) private readonly flags: Pick<FeatureFlagService, 'isEnabled'>,
    @Inject(APPLICATION_LOGGER) private readonly logger: ApplicationLogger,
  ) {}

  public onModuleInit(): void {
    if (!this.flags.isEnabled(FeatureFlag.TELEGRAM)) return;
    this.timer = setInterval(() => void this.dispatchOnce(), 1_000);
    this.timer.unref();
  }

  public onModuleDestroy(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
  }

  public async dispatchOnce(): Promise<void> {
    if (this.active) return;
    this.active = true;
    try {
      const events = await this.repository.claimOutboxEvents(TOPICS, 10, new Date());
      for (const event of events) await this.dispatch(event);
    } finally {
      this.active = false;
    }
  }

  private async dispatch(event: {
    id: string;
    topic: string;
    payload: Readonly<Record<string, unknown>>;
    attemptCount: number;
  }): Promise<void> {
    try {
      if (event.topic === 'CONTENT_VALIDATION_COMPLETED') await this.sendDraft(event);
      else await this.sendFailure(event);
      await this.repository.markOutboxProcessed(event.id, new Date());
    } catch (error) {
      const classification = classifyTelegramError(error);
      const terminal = classification.permanent || event.attemptCount >= 5;
      const retryDelayMs =
        classification.code === 'TELEGRAM_429'
          ? classification.retryAfterMs
          : Math.max(
              classification.retryAfterMs,
              Math.min(60_000, 1_000 * 2 ** Math.max(0, event.attemptCount - 1)),
            );
      this.logger.warn('Telegram notification delivery failed', {
        action: 'telegram_notification_failed',
        outboxEventId: event.id,
        errorCode: classification.code,
        attemptCount: event.attemptCount,
        terminal,
      });
      await this.repository.markNotificationFailed(
        event.id,
        classification.code,
        new Date(Date.now() + retryDelayMs),
        terminal,
      );
    }
  }

  private async sendDraft(event: {
    id: string;
    payload: Readonly<Record<string, unknown>>;
  }): Promise<void> {
    const versionId = stringPayload(event.payload, 'contentVersionId');
    const view = await this.repository.getDraftViewByVersionId(versionId);
    if (view === null) throw new PermanentTelegramDeliveryError('DRAFT_RECIPIENT_NOT_FOUND');
    if (
      (await this.repository.beginNotificationDelivery(event.id, view.telegramIdentityId)) ===
      'ALREADY_SENT'
    )
      return;
    const expiresAt = new Date(Date.now() + this.config.telegram.actionTokenTtlSeconds * 1_000);
    const [sourceToken, validationToken] = await this.tokens.create(
      view.telegramIdentityId,
      [
        { action: TelegramAction.VIEW_SOURCE, resourceId: view.jobId, singleUse: false },
        { action: TelegramAction.VIEW_VALIDATION, resourceId: versionId, singleUse: false },
      ],
      expiresAt,
    );
    const texts = splitTelegramMessage(formatDraft(view));
    const messages: TelegramMessage[] = texts.map((text, index) => ({
      text,
      ...(index !== texts.length - 1
        ? {}
        : {
            buttons: [
              [
                { text: 'View Source', callbackData: callbackData(required(sourceToken)) },
                { text: 'View Validation', callbackData: callbackData(required(validationToken)) },
              ],
            ],
          }),
    }));
    await this.gateway.sendMessages(view.requesterTelegramUserId, messages);
    await this.repository.markNotificationSent(event.id, new Date());
  }

  private async sendFailure(event: {
    id: string;
    payload: Readonly<Record<string, unknown>>;
  }): Promise<void> {
    const jobId = stringPayload(event.payload, 'contentJobId');
    const view = await this.repository.getFailureViewByJobId(jobId);
    if (view === null) throw new PermanentTelegramDeliveryError('FAILURE_RECIPIENT_NOT_FOUND');
    if (
      (await this.repository.beginNotificationDelivery(event.id, view.telegramIdentityId)) ===
      'ALREADY_SENT'
    )
      return;
    await this.gateway.sendMessages(view.requesterTelegramUserId, [
      {
        text: `Content generation failed for ${view.productName}. Please try again later.\nJob #${short(jobId)}`,
      },
    ]);
    await this.repository.markNotificationSent(event.id, new Date());
  }
}

class PermanentTelegramDeliveryError extends Error {}

function classifyTelegramError(error: unknown): {
  code: string;
  permanent: boolean;
  retryAfterMs: number;
} {
  if (error instanceof PermanentTelegramDeliveryError)
    return { code: error.message, permanent: true, retryAfterMs: 0 };
  if (error instanceof GrammyError) {
    const retryAfter = error.parameters.retry_after;
    return {
      code: `TELEGRAM_${String(error.error_code)}`,
      permanent: error.error_code === 400 || error.error_code === 403,
      retryAfterMs: retryAfter === undefined ? 5_000 : retryAfter * 1_000,
    };
  }
  if (error instanceof HttpError)
    return { code: 'TELEGRAM_NETWORK_ERROR', permanent: false, retryAfterMs: 5_000 };
  return { code: 'TELEGRAM_DELIVERY_ERROR', permanent: false, retryAfterMs: 5_000 };
}

function stringPayload(payload: Readonly<Record<string, unknown>>, key: string): string {
  const value = payload[key];
  if (typeof value !== 'string') throw new PermanentTelegramDeliveryError('INVALID_OUTBOX_PAYLOAD');
  return value;
}
function required(value: string | undefined): string {
  if (value === undefined) throw new Error('Token missing');
  return value;
}
function short(value: string): string {
  return value.replaceAll('-', '').slice(0, 8).toUpperCase();
}
