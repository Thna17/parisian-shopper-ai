import { Inject, Injectable } from '@nestjs/common';
import { type TelegramButton, type TelegramMessage } from '@parisian-shopper/application';
import { Bot, InlineKeyboard, InputFile } from 'grammy';

import { GRAMMY_BOT } from './grammy.tokens.js';
import { type TelegramDeliveryGateway } from './telegram-delivery.gateway.js';

@Injectable()
export class GrammyTelegramGateway implements TelegramDeliveryGateway {
  public constructor(@Inject(GRAMMY_BOT) private readonly bot: Bot | null) {}

  public async sendMessage(
    chatId: string,
    text: string,
    options?: {
      parseMode?: 'MarkdownV2' | 'HTML' | 'Markdown';
      buttons?: readonly (readonly TelegramButton[])[];
      replyToMessageId?: number;
    },
  ): Promise<{ messageId: number }> {
    if (this.bot === null) throw new Error('TELEGRAM_DISABLED');
    const replyMarkup = options?.buttons ? keyboard(options.buttons) : undefined;
    const sent = await this.bot.api.sendMessage(chatId, text, {
      ...(options?.parseMode ? { parse_mode: options.parseMode } : {}),
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      ...(options?.replyToMessageId
        ? { reply_parameters: { message_id: options.replyToMessageId } }
        : {}),
    });
    return { messageId: sent.message_id };
  }

  public async sendPhoto(
    chatId: string,
    photoBuffer: Buffer | Uint8Array,
    options?: {
      caption?: string;
      parseMode?: 'MarkdownV2' | 'HTML' | 'Markdown';
      buttons?: readonly (readonly TelegramButton[])[];
    },
  ): Promise<{ messageId: number }> {
    if (this.bot === null) throw new Error('TELEGRAM_DISABLED');
    const replyMarkup = options?.buttons ? keyboard(options.buttons) : undefined;
    const sent = await this.bot.api.sendPhoto(chatId, new InputFile(photoBuffer, 'poster.png'), {
      ...(options?.caption ? { caption: options.caption } : {}),
      ...(options?.parseMode ? { parse_mode: options.parseMode } : {}),
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
    return { messageId: sent.message_id };
  }

  public async editMessageText(
    chatId: string,
    messageId: number,
    text: string,
    options?: {
      parseMode?: 'MarkdownV2' | 'HTML' | 'Markdown';
      buttons?: readonly (readonly TelegramButton[])[];
    },
  ): Promise<{ messageId: number }> {
    if (this.bot === null) throw new Error('TELEGRAM_DISABLED');
    const replyMarkup = options?.buttons ? keyboard(options.buttons) : undefined;
    const result = await this.bot.api.editMessageText(chatId, messageId, text, {
      ...(options?.parseMode ? { parse_mode: options.parseMode } : {}),
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
    return { messageId: typeof result === 'object' ? result.message_id : messageId };
  }

  public async editMessageCaption(
    chatId: string,
    messageId: number,
    caption: string,
    options?: {
      parseMode?: 'MarkdownV2' | 'HTML' | 'Markdown';
      buttons?: readonly (readonly TelegramButton[])[];
    },
  ): Promise<{ messageId: number }> {
    if (this.bot === null) throw new Error('TELEGRAM_DISABLED');
    const replyMarkup = options?.buttons ? keyboard(options.buttons) : undefined;
    const result = await this.bot.api.editMessageCaption(chatId, messageId, {
      caption,
      ...(options?.parseMode ? { parse_mode: options.parseMode } : {}),
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
    return { messageId: typeof result === 'object' ? result.message_id : messageId };
  }

  public async editMessageMedia(
    chatId: string,
    messageId: number,
    photoBuffer: Buffer | Uint8Array,
    options?: {
      caption?: string;
      parseMode?: 'MarkdownV2' | 'HTML' | 'Markdown';
      buttons?: readonly (readonly TelegramButton[])[];
    },
  ): Promise<{ messageId: number }> {
    if (this.bot === null) throw new Error('TELEGRAM_DISABLED');
    const replyMarkup = options?.buttons ? keyboard(options.buttons) : undefined;
    const result = await this.bot.api.editMessageMedia(
      chatId,
      messageId,
      {
        type: 'photo',
        media: new InputFile(photoBuffer, 'poster.png'),
        ...(options?.caption ? { caption: options.caption } : {}),
        ...(options?.parseMode ? { parse_mode: options.parseMode } : {}),
      },
      {
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      },
    );
    return { messageId: typeof result === 'object' ? result.message_id : messageId };
  }

  public async editReplyMarkup(
    chatId: string,
    messageId: number,
    buttons?: readonly (readonly TelegramButton[])[],
  ): Promise<void> {
    if (this.bot === null) throw new Error('TELEGRAM_DISABLED');
    const replyMarkup = buttons ? keyboard(buttons) : new InlineKeyboard();
    await this.bot.api.editMessageReplyMarkup(chatId, messageId, {
      reply_markup: replyMarkup,
    });
  }

  public async deleteMessage(chatId: string, messageId: number): Promise<boolean> {
    if (this.bot === null) throw new Error('TELEGRAM_DISABLED');
    try {
      return await this.bot.api.deleteMessage(chatId, messageId);
    } catch {
      return false;
    }
  }

  public async answerCallbackQuery(
    callbackQueryId: string,
    options?: { text?: string; showAlert?: boolean; url?: string },
  ): Promise<void> {
    if (this.bot === null) return;
    try {
      await this.bot.api.answerCallbackQuery(callbackQueryId, {
        ...(options?.text ? { text: options.text } : {}),
        ...(options?.showAlert ? { show_alert: options.showAlert } : {}),
        ...(options?.url ? { url: options.url } : {}),
      });
    } catch {
      // Ignore if expired or already answered
    }
  }

  public async sendMessages(
    telegramUserId: string,
    messages: readonly TelegramMessage[],
  ): Promise<void> {
    if (this.bot === null) throw new Error('TELEGRAM_DISABLED');
    for (const message of messages) {
      const replyMarkup = message.buttons === undefined ? undefined : keyboard(message.buttons);

      if (message.action === 'EDIT_TEXT' && message.messageId) {
        try {
          await this.bot.api.editMessageText(telegramUserId, message.messageId, message.text, {
            ...(message.parseMode !== undefined ? { parse_mode: message.parseMode } : {}),
            ...(replyMarkup !== undefined ? { reply_markup: replyMarkup } : {}),
          });
          continue;
        } catch {
          // Fall through to sending a new message if editing fails (e.g. message too old)
        }
      }

      if (message.action === 'DELETE' && message.messageId) {
        try {
          await this.bot.api.deleteMessage(telegramUserId, message.messageId);
        } catch {
          // Ignore
        }
        continue;
      }

      if (message.photoBuffer !== undefined) {
        await this.bot.api.sendPhoto(
          telegramUserId,
          new InputFile(message.photoBuffer, 'creative.png'),
          {
            caption: message.text,
            ...(message.parseMode !== undefined ? { parse_mode: message.parseMode } : {}),
            ...(replyMarkup !== undefined ? { reply_markup: replyMarkup } : {}),
          },
        );
      } else {
        await this.bot.api.sendMessage(telegramUserId, message.text, {
          ...(message.parseMode !== undefined ? { parse_mode: message.parseMode } : {}),
          ...(replyMarkup !== undefined ? { reply_markup: replyMarkup } : {}),
        });
      }
    }
  }
}

export function keyboard(rows: readonly (readonly TelegramButton[])[]): InlineKeyboard {
  const result = new InlineKeyboard();
  rows.forEach((row) => {
    row.forEach((button) => {
      if (button.url !== undefined) {
        result.url(button.text, button.url);
      } else if (button.callbackData !== undefined) {
        result.text(button.text, button.callbackData);
      }
    });
    result.row();
  });
  return result;
}
