import { Module } from '@nestjs/common';
import { ApplicationModule } from '@parisian-shopper/application';

import { AuthModule } from '../auth/auth.module.js';
import { ContentController } from './content.controller.js';

@Module({
  imports: [ApplicationModule, AuthModule],
  controllers: [ContentController],
})
export class ContentApiModule {}
