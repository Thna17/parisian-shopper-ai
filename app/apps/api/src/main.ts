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
  await application.listen(config.application.port, config.application.host);

  logger.log('Application ready', {
    process: 'api',
    host: config.application.host,
    port: config.application.port,
    features: features.snapshot(),
  });
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
