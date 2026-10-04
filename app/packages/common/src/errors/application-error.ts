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
  | 'PRODUCT_SOURCE_RESPONSE_INVALID';

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
