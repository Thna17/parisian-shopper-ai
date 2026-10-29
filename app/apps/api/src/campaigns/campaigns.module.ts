import { Module } from '@nestjs/common';
import { CampaignsModule } from '@parisian-shopper/application';
import { CampaignsController } from './campaigns.controller.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule, CampaignsModule],
  controllers: [CampaignsController],
})
export class CampaignsApiModule {}
