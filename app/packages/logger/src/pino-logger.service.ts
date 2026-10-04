import { Injectable, type LoggerService } from '@nestjs/common';
import { AppConfigService } from '@parisian-shopper/config';
import pino, { type Logger } from 'pino';

import { CorrelationContextService } from './correlation-context.service.js';
import { sanitizeForLogging } from './safe-serialization.js';

@Injectable()
export class PinoLoggerService implements LoggerService {
  private readonly logger: Logger;

  public constructor(
    config: AppConfigService,
    private readonly correlation: CorrelationContextService,
  ) {
    this.logger = pino({
      level: config.logLevel,
      base: {
        app: config.application.name,
        environment: config.nodeEnvironment,
      },
      redact: {
        paths: [
          'authorization',
          'cookie',
          'databaseUrl',
          'DATABASE_URL',
          'password',
          'token',
          'apiKey',
          'req.headers.authorization',
          'req.headers.cookie',
          '*.password',
          '*.token',
          '*.apiKey',
        ],
        censor: '[REDACTED]',
      },
      ...(config.prettyLogs
        ? {
            transport: {
              target: 'pino-pretty',
              options: { colorize: true, singleLine: true, translateTime: 'SYS:standard' },
            },
          }
        : {}),
    });
  }

  public log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('info', message, optionalParams);
  }

  public error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }

  public warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams);
  }

  public debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  public verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('trace', message, optionalParams);
  }

  public fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write('fatal', message, optionalParams);
  }

  private write(
    level: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace',
    message: unknown,
    optionalParams: readonly unknown[],
  ): void {
    const fields = {
      ...this.correlation.current(),
      ...(optionalParams.length === 0 ? {} : { details: sanitizeForLogging(optionalParams) }),
    };

    if (typeof message === 'string') {
      this.logger[level](fields, message);
      return;
    }

    this.logger[level]({ ...fields, value: sanitizeForLogging(message) }, 'Structured log event');
  }
}
