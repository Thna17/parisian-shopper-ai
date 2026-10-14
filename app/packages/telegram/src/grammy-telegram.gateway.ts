import { Inject, Injectable } from '@nestjs/common';
import { type TelegramButton, type TelegramMessage } from '@parisian-shopper/application';
import { Bot, InlineKeyboard, InputFile } from 'grammy';

import { GRAMMY_BOT } from './grammy.tokens.js';
import { type TelegramDeliveryGateway } from './telegram-delivery.gateway.js';

@Injectable()
export class GrammyTelegramGateway implements TelegramDeliveryGateway {
  public constructor(@Inject(GRAMMY_BOT) private readonly bot: Bot | null) {}

  public async sendMessages(
    telegramUserId: string,
    messages: readonly TelegramMessage[],
  ): Promise<void> {
    if (this.bot === null) throw new Error('TELEGRAM_DISABLED');
    for (const message of messages) {
      const replyMarkup = message.buttons === undefined ? undefined : keyboard(message.buttons);
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

export function keyboard(
  rows: readonly (readonly TelegramButton[])[],
): InlineKeyboard {
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
