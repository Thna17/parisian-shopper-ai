import { z } from 'zod';

export const TelegramAction = {
  SELECT_PRODUCT: 'SELECT_PRODUCT',
  SELECT_CONTENT_TYPE: 'SELECT_CONTENT_TYPE',
  SELECT_LANGUAGE: 'SELECT_LANGUAGE',
  SELECT_PLATFORM: 'SELECT_PLATFORM',
  VIEW_SOURCE: 'VIEW_SOURCE',
  VIEW_VALIDATION: 'VIEW_VALIDATION',
  SEARCH_PAGE: 'SEARCH_PAGE',
} as const;
export type TelegramAction = (typeof TelegramAction)[keyof typeof TelegramAction];

export interface TelegramActor {
  identityId: string;
  internalUserId: string;
  telegramUserId: string;
  displayName: string;
  roles: readonly string[];
}

export interface TelegramUserProfile {
  telegramUserId: string;
  username?: string;
  displayName?: string;
}

export interface TelegramButton {
  text: string;
  callbackData: string;
}

export interface TelegramMessage {
  text: string;
  buttons?: readonly (readonly TelegramButton[])[];
}

export interface TelegramResponse {
  messages: readonly TelegramMessage[];
  callbackNotice?: string;
}

export interface ParsedTelegramCommand {
  name: 'start' | 'help' | 'create' | 'search' | 'status' | 'history' | 'unknown';
  argument: string;
}

export function parseTelegramCommand(text: string): ParsedTelegramCommand {
  const trimmed = text.trim();
  const match = /^\/([a-z]+)(?:@[a-z0-9_]+)?(?:\s+([\s\S]*))?$/iu.exec(trimmed);
  if (match === null) return { name: 'unknown', argument: '' };
  const command = match[1]?.toLowerCase() ?? '';
  const argument = match[2]?.trim() ?? '';
  return {
    name: ['start', 'help', 'create', 'search', 'status', 'history'].includes(command)
      ? (command as ParsedTelegramCommand['name'])
      : 'unknown',
    argument,
  };
}

export const telegramUserIdSchema = z.string().regex(/^[1-9]\d{0,19}$/u);

export function assertTelegramUserId(value: string): string {
  return telegramUserIdSchema.parse(value);
}
