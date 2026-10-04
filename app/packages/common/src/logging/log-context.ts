export interface LogContext {
  requestId?: string;
  contentJobId?: string;
  contentVersionId?: string;
  telegramUpdateId?: string;
  [key: string]: unknown;
}

export interface ApplicationLogger {
  log(message: string, fields?: Readonly<Record<string, unknown>>): void;
  warn(message: string, fields?: Readonly<Record<string, unknown>>): void;
  error(message: unknown, fields?: Readonly<Record<string, unknown>>): void;
}

export const APPLICATION_LOGGER = Symbol('APPLICATION_LOGGER');
