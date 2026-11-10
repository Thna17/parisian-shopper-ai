import { PublicationProductGuard, resolvePermissionsForRoles } from '@parisian-shopper/application';
import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  ASSET_STORAGE,
  CREATIVE_JOB_REPOSITORY,
  PRODUCT_SNAPSHOT_REPOSITORY,
  TELEGRAM_WORKFLOW_REPOSITORY,
  VISUAL_ASSET_REPOSITORY,
  type AssetStoragePort,
  type ChannelPublishPreviewResult,
  type CreativeJobRepository,
  type ManualPublishInput,
  type ManualPublishResult,
  type ProductSnapshot,
  type ProductSnapshotRepository,
  type TelegramChannelBroadcastDispatcher,
  type TelegramDraftView,
  type TelegramWorkflowRepository,
  type VisualAssetRepository,
} from '@parisian-shopper/application';
import { AppConfigService, FeatureFlag, FeatureFlagService } from '@parisian-shopper/config';
import {
  APPLICATION_LOGGER,
  type ApplicationLogger,
  type ClaimedOutboxEvent,
} from '@parisian-shopper/common';

import {
  TELEGRAM_DELIVERY_GATEWAY,
  type TelegramDeliveryGateway,
} from '../telegram-delivery.gateway.js';
import {
  buildChannelBroadcastKeyboard,
  ChannelBroadcastRenderer,
} from '../renderers/channel-broadcast.renderer.js';

@Injectable()
export class TelegramChannelBroadcastAdapter implements TelegramChannelBroadcastDispatcher {
  private readonly broadcastedEvents = new Set<string>();

  public constructor(
    @Inject(AppConfigService)
    private readonly config: Pick<AppConfigService, 'telegram' | 'demoMode'>,
    @Inject(FeatureFlagService)
    private readonly flags: Pick<FeatureFlagService, 'isEnabled'>,
    @Inject(TELEGRAM_DELIVERY_GATEWAY)
    private readonly gateway: TelegramDeliveryGateway,
    @Inject(APPLICATION_LOGGER)
    private readonly logger: ApplicationLogger,
    @Optional()
    @Inject(TELEGRAM_WORKFLOW_REPOSITORY)
    private readonly workflowRepo?: TelegramWorkflowRepository,
    @Optional()
    @Inject(CREATIVE_JOB_REPOSITORY)
    private readonly creativeJobs?: CreativeJobRepository,
    @Optional()
    @Inject(VISUAL_ASSET_REPOSITORY)
    private readonly visualAssets?: VisualAssetRepository,
    @Optional()
    @Inject(PRODUCT_SNAPSHOT_REPOSITORY)
    private readonly productSnapshots?: ProductSnapshotRepository,
    @Optional()
    @Inject(ASSET_STORAGE)
    private readonly assetStorage?: AssetStoragePort,
    @Optional() private readonly productGuard?: PublicationProductGuard,
  ) {}

  public dispatchBroadcast(event: ClaimedOutboxEvent): Promise<void> {
    // In W02: CREATIVE_APPROVED must never publish externally regardless of feature flag state.
    // Auto-publishing on approval is disabled pending W61 controlled publishing implementation.
    this.logger.log(
      'Telegram channel broadcast skipped: auto-publishing on CREATIVE_APPROVED is disabled pending W61 controlled publishing',
      {
        action: 'telegram_channel_broadcast_disabled_w02',
        outboxEventId: event.id,
      },
    );
    return Promise.resolve();
  }

  public async getPublishPreview(
    creativeJobId: string,
    _visualAssetId: string,
  ): Promise<ChannelPublishPreviewResult> {
    const channelId = this.config.telegram.channelId ?? '@parisian_shopper_kh';
    const published = this.workflowRepo?.getChannelPublication
      ? await this.workflowRepo.getChannelPublication(creativeJobId)
      : null;

    const job = this.creativeJobs ? await this.creativeJobs.findById(creativeJobId) : null;
    let draftView: TelegramDraftView | null = null;
    let snapshot: ProductSnapshot | null = null;
    if (job) {
      if (this.workflowRepo) {
        draftView = await this.workflowRepo.getDraftViewByVersionId(job.contentVersionId);
      }
      if (this.productSnapshots && job.productSnapshotId) {
        snapshot = await this.productSnapshots.findById(job.productSnapshotId);
      }
    }

    const rawProduct = (snapshot?.product?.product ?? {}) as {
      product_name?: string;
      brand?: string;
      sku?: string;
      price?: string | number;
      currency?: string;
      fragrance_notes?: {
        top?: string[];
        heart?: string[];
        base?: string[];
      };
    };

    const caption = ChannelBroadcastRenderer.renderCaption({
      productName: draftView?.productName ?? rawProduct.product_name ?? 'Parisian Luxury Selection',
      brand: rawProduct.brand,
      sku: draftView?.sku ?? rawProduct.sku,
      price: rawProduct.price,
      currency: rawProduct.currency ?? 'USD',
      headline: draftView?.output.headline,
      khmerCaption: draftView?.output.khmerCaption,
      englishCaption: draftView?.output.englishCaption,
      fragranceNotes: rawProduct.fragrance_notes,
      cta: draftView?.output.cta,
      hashtags: draftView?.output.hashtags,
    });

    return {
      channelId,
      caption,
      isAlreadyPublished: published !== null,
      ...(published ? { existingMessageId: published.messageId } : {}),
    };
  }

  public async publishManual(input: ManualPublishInput): Promise<ManualPublishResult> {
    if (!this.flags.isEnabled(FeatureFlag.TELEGRAM_CHANNEL_PUBLISHING)) {
      throw new Error(
        'Direct manual publishing is disabled pending controlled publishing implementation (FEATURE_TELEGRAM_CHANNEL_PUBLISHING=false).',
      );
    }

    const channelId = this.config.telegram.channelId ?? '@parisian_shopper_kh';

    // Idempotency: check if already published
    const existing = this.workflowRepo?.getChannelPublication
      ? await this.workflowRepo.getChannelPublication(input.creativeJobId)
      : null;

    if (existing) {
      return {
        disposition: 'ALREADY_PUBLISHED',
        channelId: existing.channelId,
        messageId: existing.messageId,
        publishedAt: existing.publishedAt,
      };
    }

    const job = this.creativeJobs ? await this.creativeJobs.findById(input.creativeJobId) : null;
    if (this.productGuard) {
      if (!job) throw new Error('Product context is missing. Publishing is blocked.');
      await this.productGuard.check(job.contentVersionId, 'PUBLISH', {
        id: input.actor.internalUserId,
        permissions: resolvePermissionsForRoles(input.actor.roles),
      });
    }
    let draftView: TelegramDraftView | null = null;
    let snapshot: ProductSnapshot | null = null;
    if (job) {
      if (this.workflowRepo) {
        draftView = await this.workflowRepo.getDraftViewByVersionId(job.contentVersionId);
      }
      if (this.productSnapshots && job.productSnapshotId) {
        snapshot = await this.productSnapshots.findById(job.productSnapshotId);
      }
    }

    const rawProduct = (snapshot?.product?.product ?? {}) as {
      product_name?: string;
      brand?: string;
      sku?: string;
      price?: string | number;
      currency?: string;
      fragrance_notes?: {
        top?: string[];
        heart?: string[];
        base?: string[];
      };
    };

    const caption = ChannelBroadcastRenderer.renderCaption({
      productName: draftView?.productName ?? rawProduct.product_name ?? 'Parisian Luxury Selection',
      brand: rawProduct.brand,
      sku: draftView?.sku ?? rawProduct.sku,
      price: rawProduct.price,
      currency: rawProduct.currency ?? 'USD',
      headline: draftView?.output.headline,
      khmerCaption: draftView?.output.khmerCaption,
      englishCaption: draftView?.output.englishCaption,
      fragranceNotes: rawProduct.fragrance_notes,
      cta: draftView?.output.cta,
      hashtags: draftView?.output.hashtags,
    });

    const keyboard = buildChannelBroadcastKeyboard({});

    let messageId: number;
    let assetBuffer: Buffer | null = null;
    if (this.visualAssets && this.assetStorage) {
      const asset = await this.visualAssets.findById(input.visualAssetId);
      if (asset?.storageKey) {
        assetBuffer = await this.assetStorage.getAssetBuffer(asset.storageKey);
      }
    }

    if (assetBuffer && assetBuffer.length > 0) {
      const res = await this.gateway.sendPhoto(channelId, assetBuffer, {
        caption,
        parseMode: 'MarkdownV2',
        buttons: keyboard,
      });
      messageId = res.messageId;
    } else {
      const res = await this.gateway.sendMessage(channelId, caption, {
        parseMode: 'MarkdownV2',
        buttons: keyboard,
      });
      messageId = res.messageId;
    }

    const publishedAt = new Date();
    if (this.workflowRepo?.recordChannelPublication) {
      await this.workflowRepo.recordChannelPublication(
        input.creativeJobId,
        input.visualAssetId,
        channelId,
        messageId,
        publishedAt,
      );
    }

    this.logger.log('Published content to Telegram channel successfully', {
      action: 'telegram_channel_published',
      channelId,
      messageId,
      creativeJobId: input.creativeJobId,
    });

    return {
      disposition: 'PUBLISHED',
      channelId,
      messageId,
      publishedAt,
    };
  }
}
