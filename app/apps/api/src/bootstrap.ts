import { type INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppConfigService } from '@parisian-shopper/config';
import { CorrelationContextService, PinoLoggerService } from '@parisian-shopper/logger';
import { json, urlencoded } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';

import { GlobalExceptionFilter } from './http/global-exception.filter.js';

export function configureApi(application: INestApplication): void {
  const config = application.get(AppConfigService);
  const logger = application.get(PinoLoggerService);
  const correlation = application.get(CorrelationContextService);

  application.useLogger(logger);
  application.enableShutdownHooks();
  application.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  application.use(helmet());
  application.use(json({ limit: config.application.bodyLimit, strict: true }));
  application.use(urlencoded({ extended: false, limit: config.application.bodyLimit }));
  application.use(
    rateLimit({
      legacyHeaders: false,
      limit: 100,
      standardHeaders: 'draft-8',
      windowMs: 60_000,
    }),
  );
  application.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  application.useGlobalFilters(new GlobalExceptionFilter(logger, correlation));

  if (config.application.corsOrigins.length > 0) {
    application.enableCors({
      credentials: true,
      methods: ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'],
      origin: [...config.application.corsOrigins],
    });
  }

  if (config.application.swaggerEnabled) {
    const document = SwaggerModule.createDocument(
      application,
      new DocumentBuilder()
        .setTitle('Parisian Shopper internal API')
        .setDescription('Phase 1A infrastructure endpoints')
        .setVersion('1.0')
        .build(),
    );
    SwaggerModule.setup('docs', application, document);
  }
}
