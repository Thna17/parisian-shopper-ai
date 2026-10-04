import { Global, MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APPLICATION_LOGGER } from '@parisian-shopper/common';

import { CorrelationContextService } from './correlation-context.service.js';
import { CorrelationMiddleware } from './correlation.middleware.js';
import { PinoLoggerService } from './pino-logger.service.js';

@Global()
@Module({
  providers: [
    CorrelationContextService,
    CorrelationMiddleware,
    PinoLoggerService,
    { provide: APPLICATION_LOGGER, useExisting: PinoLoggerService },
  ],
  exports: [CorrelationContextService, PinoLoggerService, APPLICATION_LOGGER],
})
export class LoggerModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
