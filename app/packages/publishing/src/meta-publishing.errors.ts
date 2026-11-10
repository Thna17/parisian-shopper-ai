export class MetaApiError extends Error {
  public readonly statusCode?: number | undefined;
  public readonly errorCode?: number | undefined;
  public readonly errorSubcode?: number | undefined;
  public readonly fbtraceId?: string | undefined;
  public readonly isTransient: boolean;

  public constructor(
    message: string,
    options: {
      statusCode?: number | undefined;
      errorCode?: number | undefined;
      errorSubcode?: number | undefined;
      fbtraceId?: string | undefined;
      isTransient?: boolean | undefined;
    } = {},
  ) {
    super(message);
    this.name = 'MetaApiError';
    this.statusCode = options.statusCode;
    this.errorCode = options.errorCode;
    this.errorSubcode = options.errorSubcode;
    this.fbtraceId = options.fbtraceId;
    this.isTransient = options.isTransient ?? false;
  }
}

export class MetaConfigurationError extends Error {
  public constructor(message: string) {
    super(`Meta Configuration Error: ${message}`);
    this.name = 'MetaConfigurationError';
  }
}

export class MetaRetryExhaustedError extends Error {
  public readonly attempts: number;
  public readonly lastError: Error;

  public constructor(attempts: number, lastError: Error) {
    super(
      `Meta API retries exhausted after ${attempts} attempts. Last error: ${lastError.message}`,
    );
    this.name = 'MetaRetryExhaustedError';
    this.attempts = attempts;
    this.lastError = lastError;
  }
}
