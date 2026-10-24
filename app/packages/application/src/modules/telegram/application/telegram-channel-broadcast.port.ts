import { type ClaimedOutboxEvent } from '@parisian-shopper/common';
import { type TelegramActor } from '../domain/telegram.js';

export const TELEGRAM_CHANNEL_BROADCAST_DISPATCHER = Symbol(
  'TELEGRAM_CHANNEL_BROADCAST_DISPATCHER',
);

export interface ManualPublishInput {
  readonly creativeJobId: string;
  readonly visualAssetId: string;
  readonly actor: TelegramActor;
  readonly idempotencyKey?: string;
}

export interface ManualPublishResult {
  readonly disposition: 'PUBLISHED' | 'ALREADY_PUBLISHED';
  readonly channelId: string;
  readonly messageId: number;
  readonly publishedAt: Date;
}

export interface ChannelPublishPreviewResult {
  readonly channelId: string;
  readonly caption: string;
  readonly isAlreadyPublished: boolean;
  readonly existingMessageId?: number;
}

export interface TelegramChannelBroadcastDispatcher {
  dispatchBroadcast(event: ClaimedOutboxEvent): Promise<void>;
  getPublishPreview?(
    creativeJobId: string,
    visualAssetId: string,
  ): Promise<ChannelPublishPreviewResult>;
  publishManual?(input: ManualPublishInput): Promise<ManualPublishResult>;
}
