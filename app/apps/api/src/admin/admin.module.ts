import { Module } from '@nestjs/common';
import { AdminApplicationModule, ApplicationModule } from '@parisian-shopper/application';
import { DatabaseModule } from '@parisian-shopper/database';
import { AuthModule } from '../auth/auth.module.js';
import { AdminController } from './admin.controller.js';

@Module({
  imports: [ApplicationModule, DatabaseModule, AuthModule, AdminApplicationModule],
  controllers: [AdminController],
  exports: [AdminApplicationModule],
})
export class AdminApiModule {}
