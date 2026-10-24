import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { FeatureFlagService } from '@parisian-shopper/config';
import { PinoLoggerService } from '@parisian-shopper/logger';

import { WorkerModule } from './worker.module.js';

async function bootstrap(): Promise<void> {
  const application = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
  });
  const logger = application.get(PinoLoggerService);
  application.useLogger(logger);
  application.enableShutdownHooks();

  setupGracefulShutdown(application, logger);

  logger.log('Application ready', {
    process: 'worker',
    features: application.get(FeatureFlagService).snapshot(),
  });
}

function setupGracefulShutdown(
  application: { close(): Promise<void> },
  logger: PinoLoggerService,
): void {
  let isShuttingDown = false;
  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];

  for (const signal of signals) {
    process.on(signal, () => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      logger.log(`Received ${signal}, initiating graceful shutdown with 30s timeout budget...`, {
        action: 'graceful_shutdown_start',
        signal,
        timeoutMs: 30_000,
      });

      const timer = setTimeout(() => {
        logger.error(`Graceful shutdown timed out after 30s on ${signal}; forcing process exit.`, {
          action: 'graceful_shutdown_timeout',
          signal,
        });
        process.exit(1);
      }, 30_000);
      timer.unref();

      application
        .close()
        .then(() => {
          clearTimeout(timer);
          logger.log('Graceful shutdown completed successfully.', {
            action: 'graceful_shutdown_complete',
            signal,
          });
          process.exit(0);
        })
        .catch((error: unknown) => {
          clearTimeout(timer);
          logger.error('Error during graceful shutdown', {
            action: 'graceful_shutdown_error',
            signal,
            error: error instanceof Error ? error.message : String(error),
          });
          process.exit(1);
        });
    });
  }
}

void bootstrap().catch((error: unknown) => {
  process.stderr.write(`Worker startup failed: ${safeStartupMessage(error)}\n`);
  process.exitCode = 1;
});

function safeStartupMessage(error: unknown): string {
  if (error instanceof Error && error.message.startsWith('Invalid application configuration:')) {
    return error.message;
  }
  return 'required infrastructure initialization failed';
}
