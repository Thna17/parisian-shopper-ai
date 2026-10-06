import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import { ApplicationError, type ApplicationErrorCode } from '@parisian-shopper/common';
import { CorrelationContextService, PinoLoggerService } from '@parisian-shopper/logger';
import { type Response } from 'express';

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    requestId?: string;
  };
}

const STATUS_BY_CODE: Readonly<Record<ApplicationErrorCode, number>> = {
  VALIDATION_ERROR: HttpStatus.BAD_REQUEST,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  UNAUTHORIZED: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  CONFLICT: HttpStatus.CONFLICT,
  EXTERNAL_SERVICE_ERROR: HttpStatus.BAD_GATEWAY,
  INFRASTRUCTURE_ERROR: HttpStatus.SERVICE_UNAVAILABLE,
  PRODUCT_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_PRODUCT_DATA: HttpStatus.UNPROCESSABLE_ENTITY,
  PRODUCT_SOURCE_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  PRODUCT_SOURCE_TIMEOUT: HttpStatus.GATEWAY_TIMEOUT,
  PRODUCT_SOURCE_AUTH_FAILED: HttpStatus.BAD_GATEWAY,
  PRODUCT_SOURCE_RATE_LIMITED: HttpStatus.SERVICE_UNAVAILABLE,
  PRODUCT_SOURCE_RESPONSE_INVALID: HttpStatus.BAD_GATEWAY,
  AI_DISABLED: HttpStatus.SERVICE_UNAVAILABLE,
  AI_PROVIDER_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  AI_PROVIDER_TIMEOUT: HttpStatus.GATEWAY_TIMEOUT,
  AI_PROVIDER_RATE_LIMITED: HttpStatus.SERVICE_UNAVAILABLE,
  AI_PROVIDER_AUTH_FAILED: HttpStatus.BAD_GATEWAY,
  AI_OUTPUT_INVALID: HttpStatus.BAD_GATEWAY,
  CONTENT_STRATEGY_NOT_FOUND: HttpStatus.BAD_REQUEST,
  MISSING_REQUIRED_PRODUCT_DATA: HttpStatus.UNPROCESSABLE_ENTITY,
  CONTENT_JOB_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_CONTENT_JOB_STATE: HttpStatus.CONFLICT,
  BRAND_RULE_VERSION_NOT_FOUND: HttpStatus.NOT_FOUND,
  CONTENT_VERSION_NOT_FOUND: HttpStatus.NOT_FOUND,
  PRODUCT_SNAPSHOT_NOT_FOUND: HttpStatus.NOT_FOUND,
  VALIDATION_ALREADY_EXISTS: HttpStatus.CONFLICT,
  VALIDATOR_INTERNAL_ERROR: HttpStatus.INTERNAL_SERVER_ERROR,
  UNSUPPORTED_VALIDATION_INPUT: HttpStatus.UNPROCESSABLE_ENTITY,
  STALE_CONTENT_VERSION: HttpStatus.CONFLICT,
  CONTENT_NOT_APPROVAL_ELIGIBLE: HttpStatus.UNPROCESSABLE_ENTITY,
  CONTENT_ALREADY_APPROVED: HttpStatus.CONFLICT,
  CONTENT_ALREADY_REJECTED: HttpStatus.CONFLICT,
  ACTIVE_REVISION_EXISTS: HttpStatus.CONFLICT,
  INVALID_REVIEW_STATE: HttpStatus.CONFLICT,
  HIGGSFIELD_PROVIDER_DISABLED: HttpStatus.SERVICE_UNAVAILABLE,
  HIGGSFIELD_INVALID_REQUEST: HttpStatus.BAD_REQUEST,
  HIGGSFIELD_INSUFFICIENT_CREDITS: HttpStatus.SERVICE_UNAVAILABLE,
  HIGGSFIELD_AUTH_FAILED: HttpStatus.BAD_GATEWAY,
  HIGGSFIELD_RATE_LIMITED: HttpStatus.SERVICE_UNAVAILABLE,
  HIGGSFIELD_MODERATION_BLOCKED: HttpStatus.UNPROCESSABLE_ENTITY,
  HIGGSFIELD_GENERATION_FAILED: HttpStatus.BAD_GATEWAY,
  HIGGSFIELD_REQUEST_CANCELED: HttpStatus.CONFLICT,
  HIGGSFIELD_PROVIDER_TIMEOUT: HttpStatus.GATEWAY_TIMEOUT,
  HIGGSFIELD_RESULT_INVALID: HttpStatus.BAD_GATEWAY,
  HIGGSFIELD_UNKNOWN_STATE: HttpStatus.SERVICE_UNAVAILABLE,
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  public constructor(
    private readonly logger: PinoLoggerService,
    private readonly correlation: CorrelationContextService,
  ) {}

  public catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const requestId = this.correlation.current().requestId;
    const normalized = normalizeException(exception);

    if (normalized.status >= 500) {
      this.logger.error(exception, { code: normalized.code, requestId });
    } else {
      this.logger.warn(normalized.message, { code: normalized.code, requestId });
    }

    const body: ErrorResponse = {
      error: {
        code: normalized.code,
        message: normalized.message,
        ...(requestId === undefined ? {} : { requestId }),
      },
    };
    response.status(normalized.status).json(body);
  }
}

function normalizeException(exception: unknown): {
  status: number;
  code: string;
  message: string;
} {
  if (exception instanceof ApplicationError) {
    return {
      status: STATUS_BY_CODE[exception.code],
      code: exception.code,
      message: exception.publicMessage,
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    return {
      status,
      code: status === 400 ? 'HTTP_VALIDATION_ERROR' : `HTTP_${status}`,
      message: safeHttpMessage(exception, status),
    };
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
  };
}

function safeHttpMessage(exception: HttpException, status: number): string {
  if (status >= 500) {
    return 'The service could not complete the request';
  }
  const response = exception.getResponse();
  if (typeof response === 'string') {
    return response;
  }
  if (typeof response === 'object' && response !== null && 'message' in response) {
    const message = response.message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message) && message.every((item) => typeof item === 'string')) {
      return message.join('; ');
    }
  }
  return exception.message;
}
