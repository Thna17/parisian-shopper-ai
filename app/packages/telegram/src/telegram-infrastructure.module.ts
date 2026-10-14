import { Global, Module } from '@nestjs/common';
import {
  ApplicationModule,
  TELEGRAM_CHANNEL_BROADCAST_DISPATCHER,
  TELEGRAM_VISUAL_CALLBACK_HANDLER,
  VISUAL_REVIEW_NOTIFICATION_DISPATCHER,
} from '@parisian-shopper/application';
import { AppConfigService, FeatureFlag, FeatureFlagService } from '@parisian-shopper/config';
import { Bot } from 'grammy';

import { GrammyBotAdapter } from './grammy-bot.adapter.js';
import { GRAMMY_BOT } from './grammy.tokens.js';
import { GrammyTelegramGateway } from './grammy-telegram.gateway.js';
import { TELEGRAM_DELIVERY_GATEWAY } from './telegram-delivery.gateway.js';
import { TelegramOutboxDispatcher } from './telegram-outbox.dispatcher.js';
import { TelegramWebhookController } from './telegram-webhook.controller.js';
import { VisualReviewCallbackHandler } from './handlers/visual-review-callback.handler.js';
import { TelegramChannelBroadcastAdapter } from './channel-broadcast/telegram-channel-broadcast.adapter.js';

@Global()
@Module({
  imports: [ApplicationModule],
  controllers: [TelegramWebhookController],
  providers: [
    {
      provide: GRAMMY_BOT,
      inject: [AppConfigService, FeatureFlagService],
      useFactory: (config: AppConfigService, flags: FeatureFlagService): Bot | null => {
        if (!flags.isEnabled(FeatureFlag.TELEGRAM)) return null;
        const token = config.telegram.botToken;
        if (token === undefined) throw new Error('Telegram bot token is missing');
        return new Bot(token);
      },
    },
    GrammyBotAdapter,
    GrammyTelegramGateway,
    { provide: TELEGRAM_DELIVERY_GATEWAY, useExisting: GrammyTelegramGateway },
    TelegramOutboxDispatcher,
    { provide: VISUAL_REVIEW_NOTIFICATION_DISPATCHER, useExisting: TelegramOutboxDispatcher },
    VisualReviewCallbackHandler,
    { provide: TELEGRAM_VISUAL_CALLBACK_HANDLER, useExisting: VisualReviewCallbackHandler },
    TelegramChannelBroadcastAdapter,
    {
      provide: TELEGRAM_CHANNEL_BROADCAST_DISPATCHER,
      useExisting: TelegramChannelBroadcastAdapter,
    },
  ],
  exports: [
    GRAMMY_BOT,
    GrammyBotAdapter,
    TELEGRAM_DELIVERY_GATEWAY,
    TelegramOutboxDispatcher,
    VISUAL_REVIEW_NOTIFICATION_DISPATCHER,
    VisualReviewCallbackHandler,
    TELEGRAM_VISUAL_CALLBACK_HANDLER,
    TelegramChannelBroadcastAdapter,
    TELEGRAM_CHANNEL_BROADCAST_DISPATCHER,
  ],
})
export class TelegramInfrastructureModule {}
