import { ApplicationError } from '@parisian-shopper/common';

export class ProductNotFoundError extends ApplicationError {
  public constructor(sku: string) {
    super({
      code: 'PRODUCT_NOT_FOUND',
      publicMessage: 'Product was not found',
      details: { sku },
    });
  }
}

export class InvalidProductDataError extends ApplicationError {
  public constructor(cause?: unknown) {
    super({
      code: 'INVALID_PRODUCT_DATA',
      publicMessage: 'Product data is invalid',
      ...(cause === undefined ? {} : { cause }),
    });
  }
}

export class ProductSourceUnavailableError extends ApplicationError {
  public constructor(cause?: unknown) {
    super({
      code: 'PRODUCT_SOURCE_UNAVAILABLE',
      publicMessage: 'Product source is unavailable',
      ...(cause === undefined ? {} : { cause }),
    });
  }
}

export class ProductSourceTimeoutError extends ApplicationError {
  public constructor(cause?: unknown) {
    super({
      code: 'PRODUCT_SOURCE_TIMEOUT',
      publicMessage: 'Product source timed out',
      ...(cause === undefined ? {} : { cause }),
    });
  }
}

export class ProductSourceAuthFailedError extends ApplicationError {
  public constructor(cause?: unknown) {
    super({
      code: 'PRODUCT_SOURCE_AUTH_FAILED',
      publicMessage: 'Product source authentication failed',
      ...(cause === undefined ? {} : { cause }),
    });
  }
}

export class ProductSourceRateLimitedError extends ApplicationError {
  public constructor(cause?: unknown) {
    super({
      code: 'PRODUCT_SOURCE_RATE_LIMITED',
      publicMessage: 'Product source is temporarily rate limited',
      ...(cause === undefined ? {} : { cause }),
    });
  }
}

export class ProductSourceResponseInvalidError extends ApplicationError {
  public constructor(cause?: unknown) {
    super({
      code: 'PRODUCT_SOURCE_RESPONSE_INVALID',
      publicMessage: 'Product source returned an invalid response',
      ...(cause === undefined ? {} : { cause }),
    });
  }
}

export class AmbiguousProductIdentifierError extends ApplicationError {
  public constructor(identifier: string, matchingIds: readonly string[]) {
    super({
      code: 'AMBIGUOUS_PRODUCT_IDENTIFIER',
      publicMessage: `Multiple distinct products match identifier '${identifier}'`,
      details: { identifier, matchingIds },
    });
  }
}

export class ProductSnapshotNotFoundError extends ApplicationError {
  public constructor(identifier: string) {
    super({
      code: 'PRODUCT_SNAPSHOT_NOT_FOUND',
      publicMessage: `Product snapshot '${identifier}' was not found`,
      details: { identifier },
    });
  }
}

export class FreshnessPolicyMissingError extends ApplicationError {
  public constructor(message = 'Active freshness policy is missing') {
    super({
      code: 'FRESHNESS_POLICY_MISSING',
      publicMessage: message,
    });
  }
}
