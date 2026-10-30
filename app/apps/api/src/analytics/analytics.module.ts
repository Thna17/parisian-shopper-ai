import { Module } from '@nestjs/common';
import {
  AnalyticsModule as ApplicationAnalyticsModule,
  ApplicationModule,
} from '@parisian-shopper/application';
import { DatabaseModule } from '@parisian-shopper/database';
import { AuthModule } from '../auth/auth.module.js';
import { AnalyticsController } from './analytics.controller.js';

@Module({
  imports: [ApplicationModule, DatabaseModule, AuthModule, ApplicationAnalyticsModule],
  controllers: [AnalyticsController],
})
export class AnalyticsApiModule {}
