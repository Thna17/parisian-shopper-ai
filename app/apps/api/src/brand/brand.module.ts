import { BrandGuidanceModule } from '@parisian-shopper/application';
import { BrandGuidanceController } from './brand-guidance.controller.js';
import { Module } from '@nestjs/common';
import { ApplicationModule, BrandModule } from '@parisian-shopper/application';
import { DatabaseModule } from '@parisian-shopper/database';
import { AuthModule } from '../auth/auth.module.js';
import { BrandController } from './brand.controller.js';

@Module({
  imports: [BrandGuidanceModule, AuthModule, BrandModule, ApplicationModule, DatabaseModule],
  controllers: [BrandController, BrandGuidanceController],
})
export class BrandApiModule {}
