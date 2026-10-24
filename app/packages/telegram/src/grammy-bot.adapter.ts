import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  TelegramCommandCenter,
  type TelegramResponse,
  type TelegramUserProfile,
  assertTelegramUserId,
} from '@parisian-shopper/application';
import { AppConfigService, FeatureFlag, FeatureFlagService } from '@parisian-shopper/config';
import { APPLICATION_LOGGER, type ApplicationLogger } from '@parisian-shopper/common';
import { Bot, type Context, InputFile } from 'grammy';

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
      this.logger.log('Telegram polling started', { action: 'telegram_polling_started' });
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
      const messageId = context.message.message_id;
      const response = await this.commands.handleCommand({
        updateId: String(context.update.update_id),
        profile,
        text: context.message.text,
        messageId,
      });
      await reply(context, response);
    });

    bot.on('callback_query:data', async (context) => {
      // Immediately acknowledge callback query so Telegram clears the loading spinner
      try {
        await context.answerCallbackQuery();
      } catch {
        // Ignore if already answered or timed out
      }
      const profile = profileFromContext(context);
      if (profile === null) return;
      const callbackMessageId = context.callbackQuery.message?.message_id;
      const chatId = context.callbackQuery.message?.chat
        ? String(context.callbackQuery.message.chat.id)
        : undefined;

      const response = await this.commands.handleCallback({
        updateId: String(context.update.update_id),
        profile,
        callbackData: context.callbackQuery.data,
        messageId: callbackMessageId,
        chatId,
      });

      // If response requested a specific notification toast, show it
      if (response.callbackNotice) {
        try {
          await context.answerCallbackQuery({ text: response.callbackNotice });
        } catch {
          // Ignore
        }
      }

      await reply(context, response, callbackMessageId);
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

async function reply(
  context: Context,
  response: TelegramResponse,
  callbackMessageId?: number,
): Promise<void> {
  const chatId = context.chat?.id ?? context.from?.id;

  for (const message of response.messages) {
    const replyMarkup = message.buttons === undefined ? undefined : keyboard(message.buttons);
    const targetMessageId = message.messageId ?? callbackMessageId;
    const action =
      message.action ?? (callbackMessageId && !message.photoBuffer ? 'EDIT_TEXT' : 'SEND');

    if (action === 'DELETE' && targetMessageId && chatId !== undefined) {
      try {
        await context.api.deleteMessage(chatId, targetMessageId);
      } catch {
        // Ignore deletion failure
      }
      continue;
    }

    if (action === 'EDIT_TEXT' && targetMessageId && !message.photoBuffer && chatId !== undefined) {
      try {
        await context.api.editMessageText(chatId, targetMessageId, message.text, {
          ...(message.parseMode !== undefined ? { parse_mode: message.parseMode } : {}),
          ...(replyMarkup !== undefined ? { reply_markup: replyMarkup } : {}),
        });
        continue;
      } catch (err: unknown) {
        // If content did not change, ignore cleanly
        if (err instanceof Error && err.message.toLowerCase().includes('not modified')) {
          continue;
        }
        // Fall back to sending message if edit failed (e.g. message expired or deleted)
      }
    }

    if (action === 'EDIT_CAPTION' && targetMessageId && chatId !== undefined) {
      try {
        await context.api.editMessageCaption(chatId, targetMessageId, {
          caption: message.text,
          ...(message.parseMode !== undefined ? { parse_mode: message.parseMode } : {}),
          ...(replyMarkup !== undefined ? { reply_markup: replyMarkup } : {}),
        });
        continue;
      } catch (err: unknown) {
        if (err instanceof Error && err.message.toLowerCase().includes('not modified')) {
          continue;
        }
      }
    }

    if (message.photoBuffer !== undefined) {
      await context.replyWithPhoto(new InputFile(message.photoBuffer, 'poster.png'), {
        caption: message.text,
        ...(message.parseMode !== undefined ? { parse_mode: message.parseMode } : {}),
        ...(replyMarkup !== undefined ? { reply_markup: replyMarkup } : {}),
      });
    } else {
      await context.reply(message.text, {
        ...(message.parseMode !== undefined ? { parse_mode: message.parseMode } : {}),
        ...(replyMarkup !== undefined ? { reply_markup: replyMarkup } : {}),
      });
    }
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
