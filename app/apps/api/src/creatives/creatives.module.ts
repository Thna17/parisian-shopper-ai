import { Module } from '@nestjs/common';
import { ApplicationModule } from '@parisian-shopper/application';
import { DatabaseModule } from '@parisian-shopper/database';

import { AuthModule } from '../auth/auth.module.js';
import { CreativeExportsController } from './creative-exports.controller.js';

@Module({
  imports: [ApplicationModule, DatabaseModule, AuthModule],
  controllers: [CreativeExportsController],
  exports: [],
})
export class CreativesApiModule {}
