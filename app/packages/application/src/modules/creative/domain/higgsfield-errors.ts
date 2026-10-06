import { ApplicationError } from '@parisian-shopper/common';

export type HiggsfieldRetryClassification =
  | 'PERMANENT_UNTIL_ACCOUNT_ACTION'
  | 'PERMANENT_UNTIL_CONFIGURATION_CHANGE'
  | 'DO_NOT_RETRY_SAME_CONTENT'
  | 'TRANSIENT_WITH_BACKOFF'
  | 'UNKNOWN_PROVIDER_STATE';

interface HiggsfieldErrorOptions {
  readonly code:
    | 'HIGGSFIELD_PROVIDER_DISABLED'
    | 'HIGGSFIELD_INVALID_REQUEST'
    | 'HIGGSFIELD_INSUFFICIENT_CREDITS'
    | 'HIGGSFIELD_AUTH_FAILED'
    | 'HIGGSFIELD_RATE_LIMITED'
    | 'HIGGSFIELD_MODERATION_BLOCKED'
    | 'HIGGSFIELD_GENERATION_FAILED'
    | 'HIGGSFIELD_REQUEST_CANCELED'
    | 'HIGGSFIELD_PROVIDER_TIMEOUT'
    | 'HIGGSFIELD_RESULT_INVALID'
    | 'HIGGSFIELD_UNKNOWN_STATE';
  readonly publicMessage: string;
  readonly retryClassification: HiggsfieldRetryClassification;
  readonly details?: Readonly<Record<string, unknown>>;
}

export class HiggsfieldProviderError extends ApplicationError {
  public readonly retryClassification: HiggsfieldRetryClassification;

  public constructor(options: HiggsfieldErrorOptions) {
    super({
      code: options.code,
      publicMessage: options.publicMessage,
      ...(options.details === undefined ? {} : { details: options.details }),
    });
    this.retryClassification = options.retryClassification;
  }
}
