import { Module } from '@nestjs/common';
import { ApplicationModule, ContentModule } from '@parisian-shopper/application';
import { DatabaseModule } from '@parisian-shopper/database';

import { AuthModule } from '../auth/auth.module.js';
import { ContentController } from './content.controller.js';

@Module({
  imports: [ContentModule, ApplicationModule, DatabaseModule, AuthModule],
  controllers: [ContentController],
})
export class ContentApiModule {}
