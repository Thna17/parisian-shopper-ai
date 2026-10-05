import { Module } from '@nestjs/common';
import { AppConfigService } from '@parisian-shopper/config';

import { ApprovalsModule } from '../approvals/approvals.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ContentModule } from '../content/content.module.js';
import { ProductsModule } from '../products/products.module.js';
import { TelegramActionTokenService } from './application/telegram-action-token.service.js';
import {
  TelegramCommandCenter,
  TELEGRAM_WORKFLOW_POLICY,
  type TelegramWorkflowPolicy,
} from './application/telegram-command-center.js';

@Module({
  imports: [AuthModule, ProductsModule, ContentModule, ApprovalsModule],
  providers: [
    TelegramActionTokenService,
    TelegramCommandCenter,
    {
      provide: TELEGRAM_WORKFLOW_POLICY,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): TelegramWorkflowPolicy => ({
        actionTokenTtlSeconds: config.telegram.actionTokenTtlSeconds,
        demoMode: config.demoMode,
      }),
    },
  ],
  exports: [TelegramActionTokenService, TelegramCommandCenter],
})
export class TelegramModule {}
