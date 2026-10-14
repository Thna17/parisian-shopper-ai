import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { AppConfigService, FeatureFlagService } from '@parisian-shopper/config';
import { PinoLoggerService } from '@parisian-shopper/logger';

import { AppModule } from './app.module.js';
import { configureApi } from './bootstrap.js';

async function bootstrap(): Promise<void> {
  const application = await NestFactory.create(AppModule, { bufferLogs: true });
  configureApi(application);

  const config = application.get(AppConfigService);
  const features = application.get(FeatureFlagService);
  const logger = application.get(PinoLoggerService);

  setupGracefulShutdown(application, logger);

  await application.listen(config.application.port, config.application.host);

  logger.log('Application ready', {
    process: 'api',
    host: config.application.host,
    port: config.application.port,
    features: features.snapshot(),
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
  process.stderr.write(`API startup failed: ${safeStartupMessage(error)}\n`);
  process.exitCode = 1;
});

function safeStartupMessage(error: unknown): string {
  if (error instanceof Error && error.message.startsWith('Invalid application configuration:')) {
    return error.message;
  }
  return 'required infrastructure initialization failed';
}
