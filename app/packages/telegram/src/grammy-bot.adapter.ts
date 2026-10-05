import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  TelegramCommandCenter,
  type TelegramResponse,
  type TelegramUserProfile,
  assertTelegramUserId,
} from '@parisian-shopper/application';
import { AppConfigService, FeatureFlag, FeatureFlagService } from '@parisian-shopper/config';
import { APPLICATION_LOGGER, type ApplicationLogger } from '@parisian-shopper/common';
import { Bot, type Context } from 'grammy';

import { GRAMMY_BOT } from './grammy.tokens.js';
import { keyboard } from './grammy-telegram.gateway.js';

@Injectable()
export class GrammyBotAdapter implements OnModuleInit, OnModuleDestroy {
  public constructor(
    @Inject(GRAMMY_BOT) private readonly bot: Bot | null,
    private readonly commands: TelegramCommandCenter,
    private readonly config: AppConfigService,
    private readonly flags: FeatureFlagService,
    @Inject(APPLICATION_LOGGER) private readonly logger: ApplicationLogger,
  ) {
    if (bot !== null) this.register(bot);
  }

  public async onModuleInit(): Promise<void> {
    if (!this.flags.isEnabled(FeatureFlag.TELEGRAM) || this.bot === null) return;
    if (this.config.telegram.mode === 'polling') {
      void this.bot.start({ drop_pending_updates: false }).catch((error: unknown) => {
        this.logger.error('Telegram polling failed', {
          action: 'telegram_polling_failed',
          errorName: error instanceof Error ? error.name : 'UnknownError',
        });
      });
      return;
    }
    const url = this.config.telegram.webhookUrl;
    const secret = this.config.telegram.webhookSecret;
    if (url === undefined || secret === undefined)
      throw new Error('Telegram webhook configuration missing');
    await this.bot.api.setWebhook(url, {
      secret_token: secret,
      allowed_updates: ['message', 'callback_query'],
    });
  }

  public async onModuleDestroy(): Promise<void> {
    if (this.bot !== null && this.config.telegram.mode === 'polling') await this.bot.stop();
  }

  public async handleUpdate(update: unknown): Promise<void> {
    if (this.bot === null) throw new Error('Telegram is disabled');
    await this.bot.handleUpdate(update as Parameters<Bot['handleUpdate']>[0]);
  }

  private register(bot: Bot): void {
    bot.on('message:text', async (context) => {
      const profile = profileFromContext(context);
      if (profile === null) return;
      const response = await this.commands.handleCommand({
        updateId: String(context.update.update_id),
        profile,
        text: context.message.text,
      });
      await reply(context, response);
    });
    bot.on('callback_query:data', async (context) => {
      await context.answerCallbackQuery({ text: 'Processing…' });
      const profile = profileFromContext(context);
      if (profile === null) return;
      const response = await this.commands.handleCallback({
        updateId: String(context.update.update_id),
        profile,
        callbackData: context.callbackQuery.data,
      });
      await reply(context, response);
    });
    bot.catch((error) => {
      this.logger.error('Telegram update handling failed', {
        action: 'telegram_update_failed',
        telegramUpdateId: String(error.ctx.update.update_id),
        errorName: error.error instanceof Error ? error.error.name : 'UnknownError',
      });
    });
  }
}

async function reply(context: Context, response: TelegramResponse): Promise<void> {
  for (const message of response.messages) {
    await context.reply(message.text, {
      ...(message.buttons === undefined ? {} : { reply_markup: keyboard(message.buttons) }),
    });
  }
}

function profileFromContext(context: Context): TelegramUserProfile | null {
  const from = context.from;
  if (from === undefined) return null;
  return {
    telegramUserId: assertTelegramUserId(String(from.id)),
    ...(from.username === undefined ? {} : { username: from.username }),
    displayName: [from.first_name, from.last_name].filter(Boolean).join(' '),
  };
}
