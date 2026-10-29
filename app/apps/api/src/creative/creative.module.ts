import { Module } from '@nestjs/common';
import { ApplicationModule } from '@parisian-shopper/application';
import { DatabaseModule } from '@parisian-shopper/database';
import { AuthModule } from '../auth/auth.module.js';
import { CreativeController } from './creative.controller.js';

@Module({
  imports: [AuthModule, ApplicationModule, DatabaseModule],
  controllers: [CreativeController],
})
export class CreativeApiModule {}
