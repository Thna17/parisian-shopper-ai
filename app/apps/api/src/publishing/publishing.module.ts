import { Module } from '@nestjs/common';
import { ApplicationModule } from '@parisian-shopper/application';
import { DatabaseModule } from '@parisian-shopper/database';

import { AuthModule } from '../auth/auth.module.js';
import { PublishingController } from './publishing.controller.js';

@Module({
  imports: [ApplicationModule, DatabaseModule, AuthModule],
  controllers: [PublishingController],
  exports: [],
})
export class PublishingApiModule {}
