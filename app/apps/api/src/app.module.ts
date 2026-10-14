import { Module } from '@nestjs/common';
import { ApplicationModule } from '@parisian-shopper/application';
import { AIProvidersModule } from '@parisian-shopper/ai-providers';
import { AppConfigModule } from '@parisian-shopper/config';
import { DatabaseModule } from '@parisian-shopper/database';
import { JobsModule } from '@parisian-shopper/jobs';
import { LoggerModule } from '@parisian-shopper/logger';
import { TelegramInfrastructureModule } from '@parisian-shopper/telegram';

import { HealthModule } from './health/health.module.js';
import { MetricsModule } from './metrics/metrics.module.js';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    DatabaseModule,
    AIProvidersModule,
    JobsModule,
    ApplicationModule,
    TelegramInfrastructureModule,
    HealthModule,
    MetricsModule,
  ],
})
export class AppModule {}
