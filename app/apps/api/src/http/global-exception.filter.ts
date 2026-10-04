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
