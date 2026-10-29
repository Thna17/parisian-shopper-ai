export interface ApiErrorPayload {
  readonly code: string;
  readonly message: string;
  readonly requestId?: string;
}

export interface ApiErrorResponse {
  readonly error: ApiErrorPayload;
}

export class ApiClientError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly requestId?: string;

  public constructor(message: string, status: number, code: string, requestId?: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  readonly body?: unknown;
  readonly timeoutMs?: number;
}
