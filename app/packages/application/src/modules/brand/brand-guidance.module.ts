import { Module } from '@nestjs/common';
import { CreativeModule } from '../creative/creative.module.js';
import { BrandModule } from './brand.module.js';
import { BrandGuidanceService } from './application/brand-guidance.service.js';
@Module({
  imports: [CreativeModule, BrandModule],
  providers: [BrandGuidanceService],
  exports: [BrandGuidanceService],
})
export class BrandGuidanceModule {}
