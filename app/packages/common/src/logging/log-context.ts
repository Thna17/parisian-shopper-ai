export interface LogContext {
  requestId?: string;
  contentJobId?: string;
  contentVersionId?: string;
  telegramUpdateId?: string;
  [key: string]: unknown;
}
