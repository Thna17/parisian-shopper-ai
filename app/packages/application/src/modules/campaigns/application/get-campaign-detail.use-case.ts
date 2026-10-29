import { Inject, Injectable } from '@nestjs/common';
import {
  CAMPAIGN_REPOSITORY,
  type CampaignDetail,
  type CampaignRepository,
} from './campaign.repository.js';
import { CampaignForbiddenError, CampaignNotFoundError } from '../domain/campaign-errors.js';
import { Permission } from '../../auth/domain/permissions.js';

export interface GetCampaignDetailQuery {
  readonly idOrCode: string;
  readonly actingUserId: string;
  readonly permissions: readonly string[];
}

@Injectable()
export class GetCampaignDetailUseCase {
  public constructor(
    @Inject(CAMPAIGN_REPOSITORY)
    private readonly campaignRepository: CampaignRepository,
  ) {}

  public async execute(query: GetCampaignDetailQuery): Promise<CampaignDetail> {
    let campaign = await this.campaignRepository.findById(query.idOrCode);
    if (!campaign) {
      campaign = await this.campaignRepository.findByCode(query.idOrCode.toUpperCase());
    }

    if (!campaign) {
      throw new CampaignNotFoundError(query.idOrCode);
    }

    const canViewAll = query.permissions.includes(Permission.VIEW_ALL_CONTENT);
    const canViewOwn = query.permissions.includes(Permission.VIEW_OWN_CONTENT);

    if (!canViewAll) {
      if (canViewOwn && campaign.createdById !== query.actingUserId) {
        throw new CampaignForbiddenError();
      }
      if (!canViewOwn) {
        throw new CampaignForbiddenError();
      }
    }

    return campaign;
  }
}
