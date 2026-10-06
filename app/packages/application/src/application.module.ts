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

@Module({
  imports: [
    AuthModule,
    UsersModule,
    TelegramModule,
    ProductsModule,
    ContentModule,
    AiModule,
    ValidationModule,
    ApprovalsModule,
    BrandModule,
    AuditModule,
    CreativeModule,
  ],
  exports: [
    AuthModule,
    UsersModule,
    TelegramModule,
    ProductsModule,
    ContentModule,
    AiModule,
    ValidationModule,
    ApprovalsModule,
    BrandModule,
    AuditModule,
    CreativeModule,
  ],
})
export class ApplicationModule {}
