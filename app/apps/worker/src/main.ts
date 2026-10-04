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

  logger.log('Application ready', {
    process: 'worker',
    features: application.get(FeatureFlagService).snapshot(),
  });
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
