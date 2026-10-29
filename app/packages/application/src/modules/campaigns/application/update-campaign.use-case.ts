import { Inject, Injectable } from '@nestjs/common';
import {
  CAMPAIGN_REPOSITORY,
  type CampaignDetail,
  type CampaignRepository,
  type UpdateCampaignInput,
} from './campaign.repository.js';
import {
  CampaignForbiddenError,
  CampaignNotFoundError,
  InvalidCampaignDateRangeError,
  InvalidCampaignStatusTransitionError,
} from '../domain/campaign-errors.js';
import { CampaignStatus } from '../domain/campaign.types.js';
import { Permission } from '../../auth/domain/permissions.js';

export interface UpdateCampaignCommand {
  readonly id: string;
  readonly actingUserId: string;
  readonly permissions: readonly string[];
  readonly updates: UpdateCampaignInput;
}

@Injectable()
export class UpdateCampaignUseCase {
  public constructor(
    @Inject(CAMPAIGN_REPOSITORY)
    private readonly campaignRepository: CampaignRepository,
  ) {}

  public async execute(command: UpdateCampaignCommand): Promise<CampaignDetail> {
    const campaign = await this.campaignRepository.findById(command.id);
    if (!campaign) {
      throw new CampaignNotFoundError(command.id);
    }

    if (campaign.status === CampaignStatus.ARCHIVED) {
      throw new InvalidCampaignStatusTransitionError(
        campaign.status,
        campaign.status,
        'Cannot modify an archived campaign',
      );
    }

    const canEdit = command.permissions.includes(Permission.EDIT_CONTENT);
    if (!canEdit) {
      throw new CampaignForbiddenError();
    }

    // Date check
    const effectiveStart =
      command.updates.startDate !== undefined ? command.updates.startDate : campaign.startDate;
    const effectiveEnd =
      command.updates.endDate !== undefined ? command.updates.endDate : campaign.endDate;

    if (effectiveStart && effectiveEnd) {
      if (new Date(effectiveEnd).getTime() < new Date(effectiveStart).getTime()) {
        throw new InvalidCampaignDateRangeError();
      }
    }

    return this.campaignRepository.update(command.id, command.updates);
  }
}
