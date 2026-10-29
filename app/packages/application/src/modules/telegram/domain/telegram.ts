import { z } from 'zod';

export const TelegramAction = {
  SELECT_PRODUCT: 'SELECT_PRODUCT',
  SELECT_CONTENT_TYPE: 'SELECT_CONTENT_TYPE',
  SELECT_LANGUAGE: 'SELECT_LANGUAGE',
  SELECT_PLATFORM: 'SELECT_PLATFORM',
  SELECT_STYLE_PRESET: 'SELECT_STYLE_PRESET',
  VIEW_SOURCE: 'VIEW_SOURCE',
  VIEW_VALIDATION: 'VIEW_VALIDATION',
  SEARCH_PAGE: 'SEARCH_PAGE',
  REQUEST_EDIT: 'REQUEST_EDIT',
  REQUEST_REGENERATE: 'REQUEST_REGENERATE',
  APPROVE_PROMPT: 'APPROVE_PROMPT',
  CONFIRM_APPROVE: 'CONFIRM_APPROVE',
  REJECT_PROMPT: 'REJECT_PROMPT',
  VIEW_PREVIOUS: 'VIEW_PREVIOUS',
  CANCEL_ACTION: 'CANCEL_ACTION',
  APPROVE_VISUAL: 'APPROVE_VISUAL',
  CONFIRM_APPROVE_VISUAL: 'CONFIRM_APPROVE_VISUAL',
  REQUEST_VISUAL_EDIT: 'REQUEST_VISUAL_EDIT',
  REGENERATE_VISUAL: 'REGENERATE_VISUAL',
  REJECT_VISUAL: 'REJECT_VISUAL',
  CANCEL_VISUAL_ACTION: 'CANCEL_VISUAL_ACTION',
  VIEW_VISUAL_DETAILS: 'VIEW_VISUAL_DETAILS',
  EDIT_VISUAL_LAYOUT: 'EDIT_VISUAL_LAYOUT',
  CHANGE_VISUAL_STYLE: 'CHANGE_VISUAL_STYLE',
  CONFIRM_GENERATION: 'CONFIRM_GENERATION',
  WIZARD_BACK: 'WIZARD_BACK',
  WIZARD_CANCEL: 'WIZARD_CANCEL',
  WIZARD_RETRY: 'WIZARD_RETRY',
  WIZARD_RESUME: 'WIZARD_RESUME',
  WIZARD_START_NEW: 'WIZARD_START_NEW',
  EDIT_CONTENT_FIELD: 'EDIT_CONTENT_FIELD',
  CHANGE_CONTENT_LANGUAGE: 'CHANGE_CONTENT_LANGUAGE',
  RESTORE_CONTENT_VERSION: 'RESTORE_CONTENT_VERSION',
  CONFIRM_CHANGE_STYLE: 'CONFIRM_CHANGE_STYLE',
  PROMPT_PUBLISH_CHANNEL: 'PROMPT_PUBLISH_CHANNEL',
  CONFIRM_PUBLISH_CHANNEL: 'CONFIRM_PUBLISH_CHANNEL',
  EXPORT_POSTER: 'EXPORT_POSTER',
  SELECT_EXPORT_FORMAT: 'SELECT_EXPORT_FORMAT',
  REPLACE_PRODUCT_ASSET: 'REPLACE_PRODUCT_ASSET',
  CONFIRM_STRUCTURED_REVISION: 'CONFIRM_STRUCTURED_REVISION',
  CANCEL_STRUCTURED_REVISION: 'CANCEL_STRUCTURED_REVISION',
  CHOOSE_REVISION_STYLE: 'CHOOSE_REVISION_STYLE',
} as const;
export type TelegramAction = (typeof TelegramAction)[keyof typeof TelegramAction];

export type TelegramMessageAction =
  'SEND' | 'EDIT_TEXT' | 'EDIT_CAPTION' | 'EDIT_MEDIA' | 'EDIT_KEYBOARD' | 'DELETE';

export type TelegramWorkflowMessageType =
  'WIZARD_PROMPT' | 'REVIEW_CARD' | 'INPUT_PROMPT' | 'VISUAL_REVIEW_CARD' | 'INTERACTION_PROMPT';

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
  callbackData?: string;
  url?: string;
}

export interface TelegramMessage {
  text: string;
  buttons?: readonly (readonly TelegramButton[])[];
  photoBuffer?: Buffer | Uint8Array;
  documentBuffer?: Buffer | Uint8Array;
  documentFilename?: string;
  parseMode?: 'MarkdownV2' | 'HTML' | 'Markdown';
  action?: TelegramMessageAction;
  messageId?: number;
  chatId?: string;
  resourceKey?: string;
  messageType?: TelegramWorkflowMessageType;
  flowId?: string;
}

export interface TelegramResponse {
  messages: readonly TelegramMessage[];
  callbackNotice?: string;
  action?: TelegramMessageAction;
  resourceKey?: string;
  messageType?: TelegramWorkflowMessageType;
  flowId?: string;
}

export interface ParsedTelegramCommand {
  name:
    'start' | 'help' | 'create' | 'search' | 'status' | 'history' | 'cancel' | 'resume' | 'unknown';
  argument: string;
}

export function parseTelegramCommand(text: string): ParsedTelegramCommand {
  const trimmed = text.trim();
  const match = /^\/([a-z]+)(?:@[a-z0-9_]+)?(?:\s+([\s\S]*))?$/iu.exec(trimmed);
  if (match === null) return { name: 'unknown', argument: '' };
  const command = match[1]?.toLowerCase() ?? '';
  const argument = match[2]?.trim() ?? '';
  return {
    name: ['start', 'help', 'create', 'search', 'status', 'history', 'cancel', 'resume'].includes(
      command,
    )
      ? (command as ParsedTelegramCommand['name'])
      : 'unknown',
    argument,
  };
}

export const telegramUserIdSchema = z.string().regex(/^[1-9]\d{0,19}$/u);

export function assertTelegramUserId(value: string): string {
  return telegramUserIdSchema.parse(value);
}
