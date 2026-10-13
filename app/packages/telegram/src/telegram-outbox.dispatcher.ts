import { Inject, Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import {
  ASSET_STORAGE,
  CREATIVE_JOB_REPOSITORY,
  TELEGRAM_WORKFLOW_REPOSITORY,
  TelegramAction,
  TelegramActionTokenService,
  VISUAL_ASSET_REPOSITORY,
  VISUAL_VALIDATION_REPOSITORY,
  callbackData,
  formatDraft,
  hasAnyRolePermission,
  splitTelegramMessage,
  Permission,
  type AssetStoragePort,
  type CreateTelegramActionInput,
  type CreativeJobRepository,
  type TelegramButton,
  type TelegramMessage,
  type TelegramWorkflowRepository,
  type VisualAssetRepository,
  type VisualReviewNotificationDispatcher,
  type VisualValidationRepository,
} from '@parisian-shopper/application';
import { AppConfigService, FeatureFlag, FeatureFlagService } from '@parisian-shopper/config';
import { APPLICATION_LOGGER, type ApplicationLogger, type ClaimedOutboxEvent } from '@parisian-shopper/common';
import { GrammyError, HttpError } from 'grammy';

import {
  TELEGRAM_DELIVERY_GATEWAY,
  type TelegramDeliveryGateway,
} from './telegram-delivery.gateway.js';
import { buildVisualReviewKeyboard } from './keyboards/visual-review.keyboard.js';
import { VisualReviewCardRenderer } from './renderers/visual-review-card.renderer.js';

const TOPICS = [
  'CONTENT_VALIDATION_COMPLETED',
  'CONTENT_GENERATION_FAILED',
  'CONTENT_APPROVED',
  'CONTENT_REJECTED',
  'CREATIVE_VALIDATED',
] as const;

@Injectable()
export class TelegramOutboxDispatcher implements OnModuleInit, OnModuleDestroy, VisualReviewNotificationDispatcher {
  private timer: ReturnType<typeof setInterval> | undefined;
  private active = false;

  public constructor(
    @Inject(TELEGRAM_WORKFLOW_REPOSITORY) private readonly repository: TelegramWorkflowRepository,
    @Inject(TELEGRAM_DELIVERY_GATEWAY) private readonly gateway: TelegramDeliveryGateway,
    private readonly tokens: TelegramActionTokenService,
    @Inject(AppConfigService)
    private readonly config: Pick<AppConfigService, 'telegram' | 'demoMode'>,
    @Inject(FeatureFlagService) private readonly flags: Pick<FeatureFlagService, 'isEnabled'>,
    @Inject(APPLICATION_LOGGER) private readonly logger: ApplicationLogger,
    @Optional()
    @Inject(CREATIVE_JOB_REPOSITORY)
    private readonly creativeJobs?: CreativeJobRepository,
    @Optional()
    @Inject(VISUAL_ASSET_REPOSITORY)
    private readonly visualAssets?: VisualAssetRepository,
    @Optional()
    @Inject(VISUAL_VALIDATION_REPOSITORY)
    private readonly validations?: VisualValidationRepository,
    @Optional()
    @Inject(ASSET_STORAGE)
    private readonly assetStorage?: AssetStoragePort,
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
      if (event.topic === 'CREATIVE_VALIDATED') await this.sendVisualReview(event);
      else if (event.topic === 'CONTENT_VALIDATION_COMPLETED') await this.sendDraft(event);
      else if (event.topic === 'CONTENT_APPROVED') await this.sendApproval(event);
      else if (event.topic === 'CONTENT_REJECTED') await this.sendRejection(event);
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

    const roles = view.requesterRoles ?? [];
    const canEdit = hasAnyRolePermission(roles, Permission.EDIT_CONTENT);
    const canRegenerate = hasAnyRolePermission(roles, Permission.REGENERATE_CONTENT);
    const canApprove =
      hasAnyRolePermission(roles, Permission.APPROVE_CONTENT) &&
      view.validation.status !== 'BLOCKED' &&
      view.validation.status !== 'FAILED';
    const canReject = hasAnyRolePermission(roles, Permission.REJECT_CONTENT);
    const hasHistory = (view.allVersions?.length ?? 1) > 1;

    const tokenDefs: CreateTelegramActionInput[] = [
      { action: TelegramAction.VIEW_SOURCE, resourceId: view.jobId, singleUse: false },
      { action: TelegramAction.VIEW_VALIDATION, resourceId: versionId, singleUse: false },
    ];

    if (canEdit) {
      tokenDefs.push({
        action: TelegramAction.REQUEST_EDIT,
        resourceId: versionId,
        metadata: { contentJobId: view.jobId, versionNumber: view.versionNumber },
        singleUse: false,
      });
    }
    if (canRegenerate) {
      tokenDefs.push({
        action: TelegramAction.REQUEST_REGENERATE,
        resourceId: versionId,
        metadata: { contentJobId: view.jobId, versionNumber: view.versionNumber },
        singleUse: false,
      });
    }
    if (canApprove) {
      tokenDefs.push({
        action: TelegramAction.APPROVE_PROMPT,
        resourceId: versionId,
        metadata: { contentJobId: view.jobId, versionNumber: view.versionNumber },
        singleUse: false,
      });
    }
    if (canReject) {
      tokenDefs.push({
        action: TelegramAction.REJECT_PROMPT,
        resourceId: versionId,
        metadata: { contentJobId: view.jobId, versionNumber: view.versionNumber },
        singleUse: false,
      });
    }
    if (hasHistory) {
      tokenDefs.push({
        action: TelegramAction.VIEW_PREVIOUS,
        resourceId: view.jobId,
        metadata: { versionId },
        singleUse: false,
      });
    }

    const createdTokens = await this.tokens.create(view.telegramIdentityId, tokenDefs, expiresAt);
    let tokenIndex = 0;
    const sourceToken = createdTokens[tokenIndex++];
    const validationToken = createdTokens[tokenIndex++];
    const editToken = canEdit ? createdTokens[tokenIndex++] : undefined;
    const regenerateToken = canRegenerate ? createdTokens[tokenIndex++] : undefined;
    const approveToken = canApprove ? createdTokens[tokenIndex++] : undefined;
    const rejectToken = canReject ? createdTokens[tokenIndex++] : undefined;
    const historyToken = hasHistory ? createdTokens[tokenIndex] : undefined;

    const buttonRows: TelegramButton[][] = [
      [
        { text: 'View Source', callbackData: callbackData(required(sourceToken)) },
        { text: 'View Validation', callbackData: callbackData(required(validationToken)) },
      ],
    ];

    const editRow: TelegramButton[] = [];
    if (editToken !== undefined) {
      editRow.push({ text: '✏️ Request Edit', callbackData: callbackData(editToken) });
    }
    if (regenerateToken !== undefined) {
      editRow.push({ text: '🔄 Regenerate', callbackData: callbackData(regenerateToken) });
    }
    if (editRow.length > 0) buttonRows.push(editRow);

    const reviewRow: TelegramButton[] = [];
    if (approveToken !== undefined) {
      reviewRow.push({ text: '✅ Approve', callbackData: callbackData(approveToken) });
    }
    if (rejectToken !== undefined) {
      reviewRow.push({ text: '❌ Reject', callbackData: callbackData(rejectToken) });
    }
    if (reviewRow.length > 0) buttonRows.push(reviewRow);

    if (historyToken !== undefined) {
      buttonRows.push([{ text: '📜 Version History', callbackData: callbackData(historyToken) }]);
    }

    const texts = splitTelegramMessage(
      formatDraft(view, { demoMode: Boolean(this.config.demoMode) }),
    );
    const messages: TelegramMessage[] = texts.map((text, index) => ({
      text,
      ...(index !== texts.length - 1 ? {} : { buttons: buttonRows }),
    }));
    await this.gateway.sendMessages(view.requesterTelegramUserId, messages);
    await this.repository.markNotificationSent(event.id, new Date());
  }

  private async sendApproval(event: {
    id: string;
    payload: Readonly<Record<string, unknown>>;
  }): Promise<void> {
    const versionId = stringPayload(event.payload, 'contentVersionId');
    const view = await this.repository.getDraftViewByVersionId(versionId);
    if (view === null) throw new PermanentTelegramDeliveryError('APPROVAL_RECIPIENT_NOT_FOUND');
    if (
      (await this.repository.beginNotificationDelivery(event.id, view.telegramIdentityId)) ===
      'ALREADY_SENT'
    )
      return;
    await this.gateway.sendMessages(view.requesterTelegramUserId, [
      {
        text: `✅ Content job #${short(view.jobId)} (V${String(view.versionNumber ?? 1)}) for ${view.productName} has been APPROVED.`,
      },
    ]);
    await this.repository.markNotificationSent(event.id, new Date());
  }

  private async sendRejection(event: {
    id: string;
    payload: Readonly<Record<string, unknown>>;
  }): Promise<void> {
    const versionId = stringPayload(event.payload, 'contentVersionId');
    const view = await this.repository.getDraftViewByVersionId(versionId);
    if (view === null) throw new PermanentTelegramDeliveryError('REJECTION_RECIPIENT_NOT_FOUND');
    if (
      (await this.repository.beginNotificationDelivery(event.id, view.telegramIdentityId)) ===
      'ALREADY_SENT'
    )
      return;
    const comment =
      typeof event.payload.comment === 'string' ? `\nReason: "${event.payload.comment}"` : '';
    await this.gateway.sendMessages(view.requesterTelegramUserId, [
      {
        text: `❌ Content job #${short(view.jobId)} (V${String(view.versionNumber ?? 1)}) for ${view.productName} was REJECTED.${comment}`,
      },
    ]);
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

  public async dispatchVisualReview(event: ClaimedOutboxEvent): Promise<void> {
    await this.sendVisualReview({
      id: event.id,
      payload: event.payload,
    });
  }

  private async sendVisualReview(event: {
    id: string;
    payload: Readonly<Record<string, unknown>>;
  }): Promise<void> {
    const creativeJobId = stringPayload(event.payload, 'creativeJobId');
    const visualAssetId = stringPayload(event.payload, 'visualAssetId');
    const job = this.creativeJobs ? await this.creativeJobs.findById(creativeJobId) : null;
    const view = job ? await this.repository.getDraftViewByVersionId(job.contentVersionId) : null;
    if (view === null) throw new PermanentTelegramDeliveryError('VISUAL_REVIEW_RECIPIENT_NOT_FOUND');
    if (
      (await this.repository.beginNotificationDelivery(event.id, view.telegramIdentityId)) ===
      'ALREADY_SENT'
    )
      return;

    const asset = this.visualAssets ? await this.visualAssets.findById(visualAssetId) : null;
    if (asset === null) throw new PermanentTelegramDeliveryError('VISUAL_ASSET_NOT_FOUND');

    const validation =
      this.validations !== undefined
        ? await this.validations.findLatestByAssetId(visualAssetId)
        : null;

    const expiresAt = new Date(Date.now() + this.config.telegram.actionTokenTtlSeconds * 1_000);
    const tokenDefs: CreateTelegramActionInput[] = [
      {
        action: TelegramAction.APPROVE_VISUAL,
        resourceId: creativeJobId,
        metadata: { creativeJobId, visualAssetId, productName: view.productName },
        singleUse: true,
      },
      {
        action: TelegramAction.REQUEST_VISUAL_EDIT,
        resourceId: creativeJobId,
        metadata: { creativeJobId, visualAssetId, productName: view.productName },
        singleUse: true,
      },
      {
        action: TelegramAction.REGENERATE_VISUAL,
        resourceId: creativeJobId,
        metadata: { creativeJobId, visualAssetId, productName: view.productName },
        singleUse: true,
      },
      {
        action: TelegramAction.REJECT_VISUAL,
        resourceId: creativeJobId,
        metadata: { creativeJobId, visualAssetId, productName: view.productName },
        singleUse: true,
      },
    ];

    const [approveToken, requestEditToken, regenerateToken, rejectToken] =
      await this.tokens.create(view.telegramIdentityId, tokenDefs, expiresAt);

    const buttonRows = buildVisualReviewKeyboard({
      approveToken: approveToken ?? '',
      requestEditToken: requestEditToken ?? '',
      regenerateToken: regenerateToken ?? '',
      rejectToken: rejectToken ?? '',
    });

    const dimensionsPassed =
      validation !== null
        ? !validation.findings.some(
            (f) => f.code.includes('DIMENSION') || f.code.includes('ASPECT'),
          )
        : true;
    const containmentPassed =
      validation !== null
        ? !validation.findings.some((f) => f.code.includes('CONTAINMENT'))
        : true;
    const safetyPassed =
      validation !== null
        ? !validation.findings.some((f) => f.code.includes('SAFETY'))
        : true;

    const caption = VisualReviewCardRenderer.renderCaption({
      productName: view.productName,
      brand: view.productName,
      targetFormat: '1:1 Feed Post',
      compositorVersion: 'ps-compositor-v1',
      width: asset.width,
      height: asset.height,
      dimensionsPassed,
      containmentPassed,
      safetyPassed,
      casSha256: asset.sha256,
    });

    let photoBuffer: Buffer | undefined;
    if (this.assetStorage !== undefined) {
      const retrieved = await this.assetStorage.getAssetBuffer(asset.storageKey);
      if (retrieved !== null) {
        photoBuffer = retrieved;
      }
    }

    const message: TelegramMessage = {
      text: caption,
      buttons: buttonRows,
      ...(photoBuffer !== undefined ? { photoBuffer } : {}),
    };

    await this.gateway.sendMessages(view.requesterTelegramUserId, [message]);
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
