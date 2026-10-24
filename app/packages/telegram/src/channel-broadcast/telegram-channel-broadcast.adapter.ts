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
  type ProductSnapshotRepository,
  type TelegramChannelBroadcastDispatcher,
  type TelegramDraftView,
  type TelegramWorkflowRepository,
  type VisualAssetRepository,
} from '@parisian-shopper/application';
import { AppConfigService, FeatureFlagService } from '@parisian-shopper/config';
import {
  APPLICATION_LOGGER,
  type ApplicationLogger,
  type ClaimedOutboxEvent,
} from '@parisian-shopper/common';

import {
  TELEGRAM_DELIVERY_GATEWAY,
  type TelegramDeliveryGateway,
} from '../telegram-delivery.gateway.js';
import { ChannelBroadcastRenderer } from '../renderers/channel-broadcast.renderer.js';

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
    const channelId = this.config.telegram.channelId ?? '@parisian_shopper_paris';
    const published = this.workflowRepo?.getChannelPublication
      ? await this.workflowRepo.getChannelPublication(creativeJobId)
      : null;

    const job = this.creativeJobs ? await this.creativeJobs.findById(creativeJobId) : null;
    let draftView: TelegramDraftView | null = null;
    if (job && this.workflowRepo) {
      draftView = await this.workflowRepo.getDraftViewByVersionId(job.contentVersionId);
    }

    const caption = ChannelBroadcastRenderer.renderCaption({
      productName: draftView?.productName ?? 'Parisian Luxury Selection',
      sku: draftView?.sku,
      headline: draftView?.output.headline,
      frenchCaption: draftView?.output.khmerCaption,
      englishCaption: draftView?.output.englishCaption,
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

  public publishManual(_input: ManualPublishInput): Promise<ManualPublishResult> {
    // In W02: Direct manual publishing is disabled until W61 implements immutable PublishIntent.
    return Promise.reject(
      new Error(
        'Direct manual publishing is disabled pending controlled publishing implementation (W61 PublishIntent required).',
      ),
    );
  }
}
