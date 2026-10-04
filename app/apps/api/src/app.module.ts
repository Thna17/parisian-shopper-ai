import { Module } from '@nestjs/common';
import { ApplicationModule } from '@parisian-shopper/application';
import { AppConfigModule } from '@parisian-shopper/config';
import { DatabaseModule } from '@parisian-shopper/database';
import { JobsModule } from '@parisian-shopper/jobs';
import { LoggerModule } from '@parisian-shopper/logger';

import { HealthModule } from './health/health.module.js';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    DatabaseModule,
    JobsModule,
    ApplicationModule,
    HealthModule,
  ],
})
export class AppModule {}
