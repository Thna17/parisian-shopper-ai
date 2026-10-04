import { Global, MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';

import { CorrelationContextService } from './correlation-context.service.js';
import { CorrelationMiddleware } from './correlation.middleware.js';
import { PinoLoggerService } from './pino-logger.service.js';

@Global()
@Module({
  providers: [CorrelationContextService, CorrelationMiddleware, PinoLoggerService],
  exports: [CorrelationContextService, PinoLoggerService],
})
export class LoggerModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
