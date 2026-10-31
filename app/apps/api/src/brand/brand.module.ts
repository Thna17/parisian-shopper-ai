import { Module } from '@nestjs/common';
import { ApplicationModule, BrandModule } from '@parisian-shopper/application';
import { DatabaseModule } from '@parisian-shopper/database';
import { AuthModule } from '../auth/auth.module.js';
import { BrandController } from './brand.controller.js';

@Module({
  imports: [AuthModule, BrandModule, ApplicationModule, DatabaseModule],
  controllers: [BrandController],
})
export class BrandApiModule {}
