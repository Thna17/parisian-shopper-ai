import { ApplicationError } from '@parisian-shopper/common';

export class InvalidCredentialsError extends ApplicationError {
  public constructor(message = 'Invalid login credentials.') {
    super({
      code: 'INVALID_CREDENTIALS',
      publicMessage: message,
    });
  }
}

export class AccountLockedError extends ApplicationError {
  public constructor(
    message = 'Account is temporarily locked due to multiple failed login attempts. Please try again later.',
    details?: Readonly<Record<string, unknown>>,
  ) {
    super({
      code: 'ACCOUNT_LOCKED',
      publicMessage: message,
      ...(details !== undefined ? { details } : {}),
    });
  }
}

export class AccountSuspendedError extends ApplicationError {
  public constructor(message = 'Account has been deactivated.') {
    super({
      code: 'ACCOUNT_SUSPENDED',
      publicMessage: message,
    });
  }
}

export class UnauthorizedSessionError extends ApplicationError {
  public constructor(message = 'Invalid, expired, or revoked session.') {
    super({
      code: 'UNAUTHORIZED_SESSION',
      publicMessage: message,
    });
  }
}

export class InsufficientPermissionsError extends ApplicationError {
  public constructor(message = 'Insufficient permissions to perform this operation.') {
    super({
      code: 'INSUFFICIENT_PERMISSIONS',
      publicMessage: message,
    });
  }
}

export class CsrfValidationFailedError extends ApplicationError {
  public constructor(message = 'CSRF validation failed.') {
    super({
      code: 'CSRF_VALIDATION_FAILED',
      publicMessage: message,
    });
  }
}
