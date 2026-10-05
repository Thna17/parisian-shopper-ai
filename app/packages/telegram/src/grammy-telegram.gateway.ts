import { Inject, Injectable } from '@nestjs/common';
import { type TelegramMessage } from '@parisian-shopper/application';
import { Bot, InlineKeyboard } from 'grammy';

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
      await this.bot.api.sendMessage(telegramUserId, message.text, {
        ...(message.buttons === undefined ? {} : { reply_markup: keyboard(message.buttons) }),
      });
    }
  }
}

export function keyboard(
  rows: readonly (readonly { text: string; callbackData: string }[])[],
): InlineKeyboard {
  const result = new InlineKeyboard();
  rows.forEach((row) => {
    row.forEach((button) => result.text(button.text, button.callbackData));
    result.row();
  });
  return result;
}
