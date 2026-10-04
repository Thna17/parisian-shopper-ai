export type ApplicationErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'EXTERNAL_SERVICE_ERROR'
  | 'INFRASTRUCTURE_ERROR';

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
