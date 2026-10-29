import { Module } from '@nestjs/common';
import { ApplicationModule } from '@parisian-shopper/application';

import { AuthModule } from '../auth/auth.module.js';
import { ApprovalsController } from './approvals.controller.js';

@Module({
  imports: [ApplicationModule, AuthModule],
  controllers: [ApprovalsController],
})
export class ApprovalsApiModule {}
