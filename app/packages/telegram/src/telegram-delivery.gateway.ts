import { type TelegramButton, type TelegramMessage } from '@parisian-shopper/application';

export const TELEGRAM_DELIVERY_GATEWAY = Symbol('TELEGRAM_DELIVERY_GATEWAY');

export interface TelegramDeliveryGateway {
  sendMessage(
    chatId: string,
    text: string,
    options?: {
      parseMode?: 'MarkdownV2' | 'HTML' | 'Markdown';
      buttons?: readonly (readonly TelegramButton[])[];
      replyToMessageId?: number;
    },
  ): Promise<{ messageId: number }>;

  sendPhoto(
    chatId: string,
    photoBuffer: Buffer | Uint8Array,
    options?: {
      caption?: string;
      parseMode?: 'MarkdownV2' | 'HTML' | 'Markdown';
      buttons?: readonly (readonly TelegramButton[])[];
    },
  ): Promise<{ messageId: number }>;

  sendDocument?(
    chatId: string,
    documentBuffer: Buffer | Uint8Array,
    filename: string,
    options?: {
      caption?: string;
      parseMode?: 'MarkdownV2' | 'HTML' | 'Markdown';
      buttons?: readonly (readonly TelegramButton[])[];
    },
  ): Promise<{ messageId: number }>;

  editMessageText(
    chatId: string,
    messageId: number,
    text: string,
    options?: {
      parseMode?: 'MarkdownV2' | 'HTML' | 'Markdown';
      buttons?: readonly (readonly TelegramButton[])[];
    },
  ): Promise<{ messageId: number }>;

  editMessageCaption(
    chatId: string,
    messageId: number,
    caption: string,
    options?: {
      parseMode?: 'MarkdownV2' | 'HTML' | 'Markdown';
      buttons?: readonly (readonly TelegramButton[])[];
    },
  ): Promise<{ messageId: number }>;

  editMessageMedia(
    chatId: string,
    messageId: number,
    photoBuffer: Buffer | Uint8Array,
    options?: {
      caption?: string;
      parseMode?: 'MarkdownV2' | 'HTML' | 'Markdown';
      buttons?: readonly (readonly TelegramButton[])[];
    },
  ): Promise<{ messageId: number }>;

  editReplyMarkup(
    chatId: string,
    messageId: number,
    buttons?: readonly (readonly TelegramButton[])[],
  ): Promise<void>;

  deleteMessage(chatId: string, messageId: number): Promise<boolean>;

  answerCallbackQuery(
    callbackQueryId: string,
    options?: { text?: string; showAlert?: boolean; url?: string },
  ): Promise<void>;

  sendMessages(telegramUserId: string, messages: readonly TelegramMessage[]): Promise<void>;
}

export class FakeTelegramGateway implements TelegramDeliveryGateway {
  public readonly sent: { telegramUserId: string; message: TelegramMessage }[] = [];
  public readonly sentMessages: {
    chatId: string;
    text: string;
    options?: Record<string, unknown> | undefined;
  }[] = [];
  public readonly sentPhotos: {
    chatId: string;
    photoBuffer: Buffer | Uint8Array;
    options?: Record<string, unknown> | undefined;
  }[] = [];
  public readonly sentDocuments: {
    chatId: string;
    documentBuffer: Buffer | Uint8Array;
    filename: string;
    options?: Record<string, unknown> | undefined;
  }[] = [];
  public readonly editedMessages: {
    chatId: string;
    messageId: number;
    text: string;
    options?: Record<string, unknown> | undefined;
  }[] = [];
  public readonly editedCaptions: {
    chatId: string;
    messageId: number;
    caption: string;
    options?: Record<string, unknown> | undefined;
  }[] = [];
  public readonly editedMedia: {
    chatId: string;
    messageId: number;
    photoBuffer: Buffer | Uint8Array;
    options?: Record<string, unknown> | undefined;
  }[] = [];
  public readonly editedMarkups: {
    chatId: string;
    messageId: number;
    buttons?: readonly (readonly TelegramButton[])[] | undefined;
  }[] = [];
  public readonly deletedMessages: { chatId: string; messageId: number }[] = [];
  public readonly callbackAnswers: {
    callbackQueryId: string;
    options?: Record<string, unknown> | undefined;
  }[] = [];

  private nextMessageId = 1000;

  public sendMessage(
    chatId: string,
    text: string,
    options?: {
      parseMode?: 'MarkdownV2' | 'HTML' | 'Markdown';
      buttons?: readonly (readonly TelegramButton[])[];
      replyToMessageId?: number;
    },
  ): Promise<{ messageId: number }> {
    const messageId = ++this.nextMessageId;
    this.sentMessages.push({ chatId, text, options });
    this.sent.push({
      telegramUserId: chatId,
      message: {
        text,
        ...(options?.buttons !== undefined ? { buttons: options.buttons } : {}),
        ...(options?.parseMode !== undefined ? { parseMode: options.parseMode } : {}),
      },
    });
    return Promise.resolve({ messageId });
  }

  public sendPhoto(
    chatId: string,
    photoBuffer: Buffer | Uint8Array,
    options?: {
      caption?: string;
      parseMode?: 'MarkdownV2' | 'HTML' | 'Markdown';
      buttons?: readonly (readonly TelegramButton[])[];
    },
  ): Promise<{ messageId: number }> {
    const messageId = ++this.nextMessageId;
    this.sentPhotos.push({ chatId, photoBuffer, options });
    this.sent.push({
      telegramUserId: chatId,
      message: {
        text: options?.caption ?? '',
        photoBuffer,
        ...(options?.buttons !== undefined ? { buttons: options.buttons } : {}),
        ...(options?.parseMode !== undefined ? { parseMode: options.parseMode } : {}),
      },
    });
    return Promise.resolve({ messageId });
  }

  public sendDocument(
    chatId: string,
    documentBuffer: Buffer | Uint8Array,
    filename: string,
    options?: {
      caption?: string;
      parseMode?: 'MarkdownV2' | 'HTML' | 'Markdown';
      buttons?: readonly (readonly TelegramButton[])[];
    },
  ): Promise<{ messageId: number }> {
    const messageId = ++this.nextMessageId;
    this.sentDocuments.push({ chatId, documentBuffer, filename, options });
    this.sent.push({
      telegramUserId: chatId,
      message: {
        text: options?.caption ?? '',
        documentBuffer,
        documentFilename: filename,
        ...(options?.buttons !== undefined ? { buttons: options.buttons } : {}),
        ...(options?.parseMode !== undefined ? { parseMode: options.parseMode } : {}),
      },
    });
    return Promise.resolve({ messageId });
  }

  public editMessageText(
    chatId: string,
    messageId: number,
    text: string,
    options?: {
      parseMode?: 'MarkdownV2' | 'HTML' | 'Markdown';
      buttons?: readonly (readonly TelegramButton[])[];
    },
  ): Promise<{ messageId: number }> {
    this.editedMessages.push({ chatId, messageId, text, options });
    this.sent.push({
      telegramUserId: chatId,
      message: {
        text,
        ...(options?.buttons !== undefined ? { buttons: options.buttons } : {}),
        ...(options?.parseMode !== undefined ? { parseMode: options.parseMode } : {}),
      },
    });
    return Promise.resolve({ messageId });
  }

  public editMessageCaption(
    chatId: string,
    messageId: number,
    caption: string,
    options?: {
      parseMode?: 'MarkdownV2' | 'HTML' | 'Markdown';
      buttons?: readonly (readonly TelegramButton[])[];
    },
  ): Promise<{ messageId: number }> {
    this.editedCaptions.push({ chatId, messageId, caption, options });
    this.sent.push({
      telegramUserId: chatId,
      message: {
        text: caption,
        ...(options?.buttons !== undefined ? { buttons: options.buttons } : {}),
        ...(options?.parseMode !== undefined ? { parseMode: options.parseMode } : {}),
      },
    });
    return Promise.resolve({ messageId });
  }

  public editMessageMedia(
    chatId: string,
    messageId: number,
    photoBuffer: Buffer | Uint8Array,
    options?: {
      caption?: string;
      parseMode?: 'MarkdownV2' | 'HTML' | 'Markdown';
      buttons?: readonly (readonly TelegramButton[])[];
    },
  ): Promise<{ messageId: number }> {
    this.editedMedia.push({ chatId, messageId, photoBuffer, options });
    this.sent.push({
      telegramUserId: chatId,
      message: {
        text: options?.caption ?? '',
        photoBuffer,
        ...(options?.buttons !== undefined ? { buttons: options.buttons } : {}),
        ...(options?.parseMode !== undefined ? { parseMode: options.parseMode } : {}),
      },
    });
    return Promise.resolve({ messageId });
  }

  public editReplyMarkup(
    chatId: string,
    messageId: number,
    buttons?: readonly (readonly TelegramButton[])[],
  ): Promise<void> {
    this.editedMarkups.push({ chatId, messageId, buttons });
    return Promise.resolve();
  }

  public deleteMessage(chatId: string, messageId: number): Promise<boolean> {
    this.deletedMessages.push({ chatId, messageId });
    return Promise.resolve(true);
  }

  public answerCallbackQuery(
    callbackQueryId: string,
    options?: { text?: string; showAlert?: boolean; url?: string },
  ): Promise<void> {
    this.callbackAnswers.push({ callbackQueryId, options });
    return Promise.resolve();
  }

  public answerCallback(text: string): void {
    this.callbackAnswers.push({ callbackQueryId: 'mock', options: { text } });
  }

  public sendMessages(telegramUserId: string, messages: readonly TelegramMessage[]): Promise<void> {
    this.sent.push(...messages.map((message) => ({ telegramUserId, message })));
    return Promise.resolve();
  }
}
