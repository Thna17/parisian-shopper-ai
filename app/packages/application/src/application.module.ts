import { Module } from '@nestjs/common';

import { AiModule } from './modules/ai/ai.module.js';
import { ApprovalsModule } from './modules/approvals/approvals.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BrandModule } from './modules/brand/brand.module.js';
import { ContentModule } from './modules/content/content.module.js';
import { CreativeModule } from './modules/creative/creative.module.js';
import { ProductsModule } from './modules/products/products.module.js';
import { TelegramModule } from './modules/telegram/telegram.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { ValidationModule } from './modules/validation/validation.module.js';
import { CampaignsModule } from './modules/campaigns/campaigns.module.js';
import { PublishingModule } from './modules/publishing/publishing.module.js';
import { AnalyticsModule } from './modules/analytics/analytics.module.js';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    TelegramModule,
    ProductsModule,
    CampaignsModule,
    ContentModule,
    AiModule,
    ValidationModule,
    ApprovalsModule,
    BrandModule,
    AuditModule,
    CreativeModule,
    PublishingModule,
    AnalyticsModule,
  ],
  exports: [
    AuthModule,
    UsersModule,
    TelegramModule,
    ProductsModule,
    CampaignsModule,
    ContentModule,
    AiModule,
    ValidationModule,
    ApprovalsModule,
    BrandModule,
    AuditModule,
    CreativeModule,
    PublishingModule,
    AnalyticsModule,
  ],
})
export class ApplicationModule {}
