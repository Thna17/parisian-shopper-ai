import { type ClaimedOutboxEvent } from '@parisian-shopper/common';

export const TELEGRAM_CHANNEL_BROADCAST_DISPATCHER = Symbol(
  'TELEGRAM_CHANNEL_BROADCAST_DISPATCHER',
);

export interface TelegramChannelBroadcastDispatcher {
  dispatchBroadcast(event: ClaimedOutboxEvent): Promise<void>;
}
