import { ApplicationError, type ApplicationErrorOptions } from './application-error.js';

type ErrorOptions = Omit<ApplicationErrorOptions, 'code'>;

export class ValidationError extends ApplicationError {
  public constructor(options: ErrorOptions) {
    super({ code: 'VALIDATION_ERROR', ...options });
  }
}

export class NotFoundError extends ApplicationError {
  public constructor(options: ErrorOptions) {
    super({ code: 'NOT_FOUND', ...options });
  }
}

export class UnauthorizedError extends ApplicationError {
  public constructor(options: ErrorOptions) {
    super({ code: 'UNAUTHORIZED', ...options });
  }
}

export class ForbiddenError extends ApplicationError {
  public constructor(options: ErrorOptions) {
    super({ code: 'FORBIDDEN', ...options });
  }
}

export class ConflictError extends ApplicationError {
  public constructor(options: ErrorOptions) {
    super({ code: 'CONFLICT', ...options });
  }
}

export class ExternalServiceError extends ApplicationError {
  public constructor(options: ErrorOptions) {
    super({ code: 'EXTERNAL_SERVICE_ERROR', ...options });
  }
}

export class InfrastructureError extends ApplicationError {
  public constructor(options: ErrorOptions) {
    super({ code: 'INFRASTRUCTURE_ERROR', ...options });
  }
}
