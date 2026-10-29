import { type TelegramActor, type TelegramResponse } from '../domain/telegram.js';
import { type TelegramActionTokenRecord } from './telegram-workflow.repository.js';

export const TELEGRAM_VISUAL_CALLBACK_HANDLER = Symbol('TELEGRAM_VISUAL_CALLBACK_HANDLER');

export interface TelegramVisualCallbackHandler {
  handleAction(actor: TelegramActor, token: TelegramActionTokenRecord): Promise<TelegramResponse>;
  handleTextMessage?(actor: TelegramActor, text: string): Promise<TelegramResponse | null>;
}
