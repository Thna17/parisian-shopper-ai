import { Module } from '@nestjs/common';
import { ApplicationModule } from '@parisian-shopper/application';
import { AIProvidersModule } from '@parisian-shopper/ai-providers';
import { AppConfigModule } from '@parisian-shopper/config';
import { CreativeProvidersModule } from '@parisian-shopper/creative-providers';
import { DatabaseModule } from '@parisian-shopper/database';
import { JobsModule } from '@parisian-shopper/jobs';
import { LoggerModule } from '@parisian-shopper/logger';
import { TelegramInfrastructureModule } from '@parisian-shopper/telegram';

import { HealthModule } from './health/health.module.js';
import { MetricsModule } from './metrics/metrics.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ProductsApiModule } from './products/products.module.js';
import { CampaignsApiModule } from './campaigns/campaigns.module.js';
import { ContentApiModule } from './content/content.module.js';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    DatabaseModule,
    AIProvidersModule,
    CreativeProvidersModule,
    JobsModule,
    ApplicationModule,
    TelegramInfrastructureModule,
    HealthModule,
    MetricsModule,
    AuthModule,
    ProductsApiModule,
    CampaignsApiModule,
    ContentApiModule,
  ],
})
export class AppModule {}
