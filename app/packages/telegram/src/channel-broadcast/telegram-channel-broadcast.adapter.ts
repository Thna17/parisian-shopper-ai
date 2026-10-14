import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  ASSET_STORAGE,
  CREATIVE_JOB_REPOSITORY,
  PRODUCT_SNAPSHOT_REPOSITORY,
  TELEGRAM_WORKFLOW_REPOSITORY,
  VISUAL_ASSET_REPOSITORY,
  type AssetStoragePort,
  type CreativeJobRepository,
  type NormalizedProductEnvelope,
  type ProductSnapshotRepository,
  type TelegramChannelBroadcastDispatcher,
  type TelegramDraftView,
  type TelegramMessage,
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
  ) {}

  public async dispatchBroadcast(event: ClaimedOutboxEvent): Promise<void> {
    if (!this.flags.isEnabled(FeatureFlag.TELEGRAM_CHANNEL_PUBLISHING)) {
      this.logger.log('Telegram channel publishing skipped: feature flag is disabled', {
        action: 'telegram_channel_broadcast_skipped_flag',
        outboxEventId: event.id,
      });
      return;
    }

    const channelId = this.config.telegram.channelId;
    if (channelId === undefined || channelId.trim().length === 0) {
      this.logger.warn('Telegram channel publishing skipped: TELEGRAM_CHANNEL_ID is not configured', {
        action: 'telegram_channel_broadcast_skipped_no_channel',
        outboxEventId: event.id,
      });
      return;
    }

    if (this.broadcastedEvents.has(event.id)) {
      this.logger.log(`Telegram channel broadcast already processed for event ${event.id}; skipping`, {
        action: 'telegram_channel_broadcast_duplicate_skipped',
        outboxEventId: event.id,
      });
      return;
    }

    const creativeJobId = event.payload.creativeJobId as string | undefined;
    const visualAssetId = event.payload.visualAssetId as string | undefined;

    if (!creativeJobId || !visualAssetId) {
      throw new Error('CREATIVE_APPROVED event payload missing creativeJobId or visualAssetId');
    }

    const job = this.creativeJobs ? await this.creativeJobs.findById(creativeJobId) : null;
    const asset = this.visualAssets ? await this.visualAssets.findById(visualAssetId) : null;

    let draftView: TelegramDraftView | null = null;
    if (job && this.workflowRepo) {
      draftView = await this.workflowRepo.getDraftViewByVersionId(job.contentVersionId);
    }

    if (draftView?.telegramIdentityId && this.workflowRepo) {
      const deliveryStatus = await this.workflowRepo.beginNotificationDelivery(
        event.id,
        draftView.telegramIdentityId,
      );
      if (deliveryStatus === 'ALREADY_SENT') {
        this.logger.log(
          `Telegram channel broadcast delivery already recorded for event ${event.id}; skipping`,
          {
            action: 'telegram_channel_broadcast_db_dedup_skipped',
            outboxEventId: event.id,
          },
        );
        this.broadcastedEvents.add(event.id);
        return;
      }
    }

    let productEnvelope: NormalizedProductEnvelope | undefined;
    if (job?.productSnapshotId && this.productSnapshots) {
      const snapshot = await this.productSnapshots.findById(job.productSnapshotId);
      if (snapshot) {
        productEnvelope = snapshot.product;
      }
    }

    let photoBuffer: Buffer | undefined;
    if (asset && this.assetStorage) {
      const buffer = await this.assetStorage.getAssetBuffer(asset.storageKey);
      if (buffer !== null) {
        photoBuffer = buffer;
      }
    }

    const productName =
      productEnvelope?.product.product_name ?? draftView?.productName ?? 'Parisian Luxury Selection';
    const brand = productEnvelope?.product.brand;
    const sku = productEnvelope?.product.sku ?? draftView?.sku;
    const price = productEnvelope?.product.promo_price ?? productEnvelope?.product.price;
    const currency = productEnvelope?.product.currency ?? 'EUR';
    const headline = draftView?.output.headline;
    const frenchCaption = draftView?.output.khmerCaption;
    const englishCaption = draftView?.output.englishCaption;
    const cta = draftView?.output.cta;
    const hashtags = draftView?.output.hashtags;

    const caption = ChannelBroadcastRenderer.renderCaption({
      productName,
      brand,
      sku,
      price,
      currency,
      headline,
      frenchCaption,
      englishCaption,
      cta,
      hashtags,
    });

    const buttons = buildChannelBroadcastKeyboard({
      conciergeUrl: 'https://t.me/parisian_concierge',
    });

    const message: TelegramMessage = {
      text: caption,
      buttons,
      parseMode: 'MarkdownV2',
      ...(photoBuffer !== undefined ? { photoBuffer } : {}),
    };

    await this.gateway.sendMessages(channelId, [message]);
    this.broadcastedEvents.add(event.id);

    if (this.workflowRepo) {
      await this.workflowRepo.markNotificationSent(event.id, new Date());
    }

    this.logger.log(`Telegram channel broadcast published successfully to ${channelId}`, {
      action: 'telegram_channel_broadcast_sent',
      outboxEventId: event.id,
      channelId,
      creativeJobId,
      visualAssetId,
      productName,
    });
  }
}
