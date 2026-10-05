import { type TelegramMessage } from '@parisian-shopper/application';

export const TELEGRAM_DELIVERY_GATEWAY = Symbol('TELEGRAM_DELIVERY_GATEWAY');

export interface TelegramDeliveryGateway {
  sendMessages(telegramUserId: string, messages: readonly TelegramMessage[]): Promise<void>;
}

export class FakeTelegramGateway implements TelegramDeliveryGateway {
  public readonly sent: { telegramUserId: string; message: TelegramMessage }[] = [];
  public readonly callbackAnswers: string[] = [];

  public sendMessages(telegramUserId: string, messages: readonly TelegramMessage[]): Promise<void> {
    this.sent.push(...messages.map((message) => ({ telegramUserId, message })));
    return Promise.resolve();
  }

  public answerCallback(text: string): void {
    this.callbackAnswers.push(text);
  }
}
