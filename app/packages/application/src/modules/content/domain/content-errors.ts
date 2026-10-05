import { ApplicationError } from '@parisian-shopper/common';

export class ContentGenerationError extends ApplicationError {
  public readonly retryable: boolean;

  public constructor(options: {
    code:
      | 'AI_DISABLED'
      | 'AI_PROVIDER_UNAVAILABLE'
      | 'AI_PROVIDER_TIMEOUT'
      | 'AI_PROVIDER_RATE_LIMITED'
      | 'AI_PROVIDER_AUTH_FAILED'
      | 'AI_OUTPUT_INVALID'
      | 'CONTENT_STRATEGY_NOT_FOUND'
      | 'MISSING_REQUIRED_PRODUCT_DATA'
      | 'CONTENT_JOB_NOT_FOUND'
      | 'INVALID_CONTENT_JOB_STATE'
      | 'BRAND_RULE_VERSION_NOT_FOUND';
    publicMessage: string;
    retryable?: boolean;
    cause?: unknown;
    details?: Readonly<Record<string, unknown>>;
  }) {
    super(options);
    this.retryable = options.retryable ?? false;
  }
}

export function classifyProviderError(error: unknown): ContentGenerationError {
  if (error instanceof ContentGenerationError) return error;
  if (error instanceof Error && error.name === 'TimeoutError') {
    return new ContentGenerationError({
      code: 'AI_PROVIDER_TIMEOUT',
      publicMessage: 'The AI provider timed out.',
      retryable: true,
      cause: error,
    });
  }
  return new ContentGenerationError({
    code: 'AI_PROVIDER_UNAVAILABLE',
    publicMessage: 'The AI provider is temporarily unavailable.',
    retryable: true,
    cause: error,
  });
}
