export type ApplicationErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'EXTERNAL_SERVICE_ERROR'
  | 'INFRASTRUCTURE_ERROR'
  | 'PRODUCT_NOT_FOUND'
  | 'INVALID_PRODUCT_DATA'
  | 'PRODUCT_SOURCE_UNAVAILABLE'
  | 'PRODUCT_SOURCE_TIMEOUT'
  | 'PRODUCT_SOURCE_AUTH_FAILED'
  | 'PRODUCT_SOURCE_RATE_LIMITED'
  | 'PRODUCT_SOURCE_RESPONSE_INVALID'
  | 'AMBIGUOUS_PRODUCT_IDENTIFIER'
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
  | 'BRAND_RULE_VERSION_NOT_FOUND'
  | 'CONTENT_VERSION_NOT_FOUND'
  | 'PRODUCT_SNAPSHOT_NOT_FOUND'
  | 'FRESHNESS_POLICY_MISSING'
  | 'VALIDATION_ALREADY_EXISTS'
  | 'VALIDATOR_INTERNAL_ERROR'
  | 'UNSUPPORTED_VALIDATION_INPUT'
  | 'STALE_CONTENT_VERSION'
  | 'CONTENT_NOT_APPROVAL_ELIGIBLE'
  | 'CONTENT_ALREADY_APPROVED'
  | 'CONTENT_ALREADY_REJECTED'
  | 'ACTIVE_REVISION_EXISTS'
  | 'INVALID_REVIEW_STATE'
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

export interface ApplicationErrorOptions {
  code: ApplicationErrorCode;
  publicMessage: string;
  cause?: unknown;
  details?: Readonly<Record<string, unknown>>;
}

export class ApplicationError extends Error {
  public readonly code: ApplicationErrorCode;
  public readonly publicMessage: string;
  public readonly details?: Readonly<Record<string, unknown>>;

  public constructor(options: ApplicationErrorOptions) {
    super(
      options.publicMessage,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = new.target.name;
    this.code = options.code;
    this.publicMessage = options.publicMessage;
    if (options.details !== undefined) {
      this.details = options.details;
    }
  }
}
