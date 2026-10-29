import { Inject, Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import {
  TELEGRAM_WORKFLOW_REPOSITORY,
  TelegramCommandCenter,
  type TelegramResponse,
  type TelegramUserProfile,
  type TelegramWorkflowRepository,
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
    @Optional()
    @Inject(TELEGRAM_WORKFLOW_REPOSITORY)
    private readonly workflowRepo?: TelegramWorkflowRepository,
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
      await this.deliverResponse(context, response);
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

      await this.deliverResponse(context, response, callbackMessageId);
    });

    bot.catch((error) => {
      this.logger.error('Telegram update handling failed', {
        action: 'telegram_update_failed',
        telegramUpdateId: String(error.ctx.update.update_id),
        errorName: error.error instanceof Error ? error.error.name : 'UnknownError',
      });
    });
  }

  public async deliverResponse(
    context: Context,
    response: TelegramResponse,
    callbackMessageId?: number,
  ): Promise<void> {
    const defaultChatId = context.chat?.id ?? context.from?.id;

    for (const message of response.messages) {
      const replyMarkup = message.buttons === undefined ? undefined : keyboard(message.buttons);
      const chatId =
        message.chatId ?? (defaultChatId !== undefined ? String(defaultChatId) : undefined);
      const resourceKey = message.resourceKey ?? response.resourceKey;
      const flowId =
        message.flowId ??
        response.flowId ??
        (resourceKey && resourceKey.startsWith('flow-') ? resourceKey : undefined);
      const messageType =
        message.messageType ??
        response.messageType ??
        (flowId ? 'WIZARD_PROMPT' : 'VISUAL_REVIEW_CARD');

      let targetMessageId = message.messageId ?? callbackMessageId;
      if (targetMessageId === undefined && resourceKey && this.workflowRepo) {
        try {
          const active = await this.workflowRepo.getActiveWorkflowMessage(resourceKey);
          if (active) targetMessageId = active.messageId;
        } catch {
          // Ignore retrieval failure
        }
      }

      const action =
        message.action ??
        (targetMessageId !== undefined
          ? message.photoBuffer !== undefined
            ? 'EDIT_CAPTION'
            : 'EDIT_TEXT'
          : 'SEND');

      if (action === 'DELETE' && targetMessageId && chatId !== undefined) {
        try {
          await context.api.deleteMessage(chatId, targetMessageId);
        } catch {
          // Ignore deletion failure
        }
        continue;
      }

      // Track 1: Edit-First Attempt
      let editSucceeded = false;
      if (
        (action === 'EDIT_TEXT' || action === 'EDIT_CAPTION' || action === 'EDIT_MEDIA') &&
        targetMessageId !== undefined &&
        chatId !== undefined
      ) {
        try {
          if (action === 'EDIT_TEXT' && !message.photoBuffer) {
            await context.api.editMessageText(chatId, targetMessageId, message.text, {
              ...(message.parseMode !== undefined ? { parse_mode: message.parseMode } : {}),
              ...(replyMarkup !== undefined ? { reply_markup: replyMarkup } : {}),
            });
            editSucceeded = true;
          } else if (action === 'EDIT_CAPTION') {
            await context.api.editMessageCaption(chatId, targetMessageId, {
              caption: message.text,
              ...(message.parseMode !== undefined ? { parse_mode: message.parseMode } : {}),
              ...(replyMarkup !== undefined ? { reply_markup: replyMarkup } : {}),
            });
            editSucceeded = true;
          } else if (action === 'EDIT_MEDIA' && message.photoBuffer) {
            await context.api.editMessageMedia(
              chatId,
              targetMessageId,
              {
                type: 'photo',
                media: new InputFile(message.photoBuffer, 'poster.png'),
                caption: message.text,
                ...(message.parseMode !== undefined ? { parse_mode: message.parseMode } : {}),
              },
              {
                ...(replyMarkup !== undefined ? { reply_markup: replyMarkup } : {}),
              },
            );
            editSucceeded = true;
          }

          if (editSucceeded) {
            if (resourceKey && this.workflowRepo) {
              await this.workflowRepo.setActiveWorkflowMessage(resourceKey, {
                messageId: targetMessageId,
                messageType,
                ...(chatId !== undefined ? { chatId } : {}),
              });
            }
            continue;
          }
        } catch (err: unknown) {
          // If content did not change, ignore cleanly
          if (err instanceof Error && err.message.toLowerCase().includes('not modified')) {
            continue;
          }
          this.logger.warn('Telegram edit failed, falling back to sending new message', {
            targetMessageId,
            error: err instanceof Error ? err.message : String(err),
          });
          // Fall through to Track 2
        }
      }

      // Track 2: Send New Message & Synchronize Pointer
      let sentMessageId: number | undefined;
      if (message.documentBuffer !== undefined) {
        const file = new InputFile(
          message.documentBuffer,
          message.documentFilename ?? 'export.png',
        );
        const sent = context.replyWithDocument
          ? await context.replyWithDocument(file, {
              caption: message.text,
              ...(message.parseMode !== undefined ? { parse_mode: message.parseMode } : {}),
              ...(replyMarkup !== undefined ? { reply_markup: replyMarkup } : {}),
            })
          : await context.api.sendDocument(chatId ?? '', file, {
              caption: message.text,
              ...(message.parseMode !== undefined ? { parse_mode: message.parseMode } : {}),
              ...(replyMarkup !== undefined ? { reply_markup: replyMarkup } : {}),
            });
        sentMessageId = sent?.message_id;
      } else if (message.photoBuffer !== undefined) {
        const file = new InputFile(message.photoBuffer, 'poster.png');
        const sent = context.replyWithPhoto
          ? await context.replyWithPhoto(file, {
              caption: message.text,
              ...(message.parseMode !== undefined ? { parse_mode: message.parseMode } : {}),
              ...(replyMarkup !== undefined ? { reply_markup: replyMarkup } : {}),
            })
          : await context.api.sendPhoto(chatId ?? '', file, {
              caption: message.text,
              ...(message.parseMode !== undefined ? { parse_mode: message.parseMode } : {}),
              ...(replyMarkup !== undefined ? { reply_markup: replyMarkup } : {}),
            });
        sentMessageId = sent?.message_id;
      } else {
        const sent = context.reply
          ? await context.reply(message.text, {
              ...(message.parseMode !== undefined ? { parse_mode: message.parseMode } : {}),
              ...(replyMarkup !== undefined ? { reply_markup: replyMarkup } : {}),
            })
          : await context.api.sendMessage(chatId ?? '', message.text, {
              ...(message.parseMode !== undefined ? { parse_mode: message.parseMode } : {}),
              ...(replyMarkup !== undefined ? { reply_markup: replyMarkup } : {}),
            });
        sentMessageId = sent?.message_id;
      }

      // CRITICAL: Synchronize pointer back to durable storage
      if (sentMessageId !== undefined && this.workflowRepo) {
        if (resourceKey) {
          await this.workflowRepo.setActiveWorkflowMessage(resourceKey, {
            messageId: sentMessageId,
            messageType,
            ...(chatId !== undefined ? { chatId } : {}),
          });
        }
        if (flowId) {
          await this.workflowRepo.setFlowMetadata?.(flowId, {
            wizardMessageId: sentMessageId,
          });
          try {
            await this.workflowRepo.updateFlowSelection(flowId, 'wizardMessageId', sentMessageId);
          } catch {
            // Flow may not be in an updateable status or already metadata-updated
          }
        }
      }
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
