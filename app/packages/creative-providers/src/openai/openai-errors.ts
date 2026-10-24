import { ApplicationError } from '@parisian-shopper/common';

export class OpenAiProviderError extends ApplicationError {
  public constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super({
      code: 'AI_PROVIDER_UNAVAILABLE',
      publicMessage: message,
      ...(details !== undefined ? { details } : {}),
    });
  }
}

export class OpenAiTimeoutError extends ApplicationError {
  public constructor(timeoutMs: number) {
    super({
      code: 'AI_PROVIDER_TIMEOUT',
      publicMessage: `OpenAI creative generation timed out after ${timeoutMs}ms`,
      details: { timeoutMs },
    });
  }
}

export class OpenAiCircuitBreakerOpenError extends ApplicationError {
  public constructor(waitRemainingMs: number) {
    super({
      code: 'AI_PROVIDER_UNAVAILABLE',
      publicMessage: `OpenAI creative provider circuit breaker is OPEN. Retry in ${Math.ceil(waitRemainingMs / 1000)}s`,
      details: { waitRemainingMs, circuitBreakerState: 'OPEN' },
    });
  }
}

export class OpenAiDownloadLimitExceededError extends ApplicationError {
  public constructor(bytesReceived: number, maxBytes: number) {
    super({
      code: 'AI_OUTPUT_INVALID',
      publicMessage: `Downloaded creative asset exceeded buffer limit of ${maxBytes} bytes (received: ${bytesReceived} bytes)`,
      details: { bytesReceived, maxBytes },
    });
  }
}

export class OpenAiInvalidImageError extends ApplicationError {
  public constructor(detectedType: string) {
    super({
      code: 'AI_OUTPUT_INVALID',
      publicMessage: `Downloaded creative asset has invalid or unsupported MIME type / magic bytes: ${detectedType}. Expected image/png or image/jpeg.`,
      details: { detectedType },
    });
  }
}

export class OpenAiRateLimitError extends ApplicationError {
  public constructor(message: string, retryAfterMs?: number) {
    super({
      code: 'AI_PROVIDER_RATE_LIMITED',
      publicMessage: message,
      ...(retryAfterMs !== undefined ? { details: { retryAfterMs } } : {}),
    });
  }
}
