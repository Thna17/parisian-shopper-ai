import { Module } from '@nestjs/common';
import { CreateCampaignUseCase } from './application/create-campaign.use-case.js';
import { GetCampaignDetailUseCase } from './application/get-campaign-detail.use-case.js';
import { ListCampaignsUseCase } from './application/list-campaigns.use-case.js';
import { UpdateCampaignUseCase } from './application/update-campaign.use-case.js';
import { ChangeCampaignStatusUseCase } from './application/change-campaign-status.use-case.js';
import { AssociateCampaignProductUseCase } from './application/associate-campaign-product.use-case.js';
import { RemoveCampaignProductUseCase } from './application/remove-campaign-product.use-case.js';

@Module({
  providers: [
    CreateCampaignUseCase,
    GetCampaignDetailUseCase,
    ListCampaignsUseCase,
    UpdateCampaignUseCase,
    ChangeCampaignStatusUseCase,
    AssociateCampaignProductUseCase,
    RemoveCampaignProductUseCase,
  ],
  exports: [
    CreateCampaignUseCase,
    GetCampaignDetailUseCase,
    ListCampaignsUseCase,
    UpdateCampaignUseCase,
    ChangeCampaignStatusUseCase,
    AssociateCampaignProductUseCase,
    RemoveCampaignProductUseCase,
  ],
})
export class CampaignsModule {}
