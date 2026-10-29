import { Inject, Injectable } from '@nestjs/common';
import {
  CAMPAIGN_REPOSITORY,
  type CampaignDetail,
  type CampaignRepository,
} from './campaign.repository.js';
import {
  CampaignForbiddenError,
  CampaignNotFoundError,
  InvalidCampaignDateRangeError,
  InvalidCampaignStatusTransitionError,
} from '../domain/campaign-errors.js';
import { CampaignStatus, isAllowedCampaignTransition } from '../domain/campaign.types.js';
import { Permission } from '../../auth/domain/permissions.js';

export interface ChangeCampaignStatusCommand {
  readonly id: string;
  readonly nextStatus: CampaignStatus;
  readonly actingUserId: string;
  readonly permissions: readonly string[];
}

@Injectable()
export class ChangeCampaignStatusUseCase {
  public constructor(
    @Inject(CAMPAIGN_REPOSITORY)
    private readonly campaignRepository: CampaignRepository,
  ) {}

  public async execute(command: ChangeCampaignStatusCommand): Promise<CampaignDetail> {
    const campaign = await this.campaignRepository.findById(command.id);
    if (!campaign) {
      throw new CampaignNotFoundError(command.id);
    }

    if (!isAllowedCampaignTransition(campaign.status, command.nextStatus)) {
      throw new InvalidCampaignStatusTransitionError(
        campaign.status,
        command.nextStatus,
        `Allowed transitions from ${campaign.status} are: ${campaign.status === CampaignStatus.ARCHIVED ? 'none' : 'limited'}`,
      );
    }

    // Permission check:
    // Advancing to ACTIVE, COMPLETED, or ARCHIVED requires APPROVE_CONTENT or ADMIN
    if (
      command.nextStatus === CampaignStatus.ACTIVE ||
      command.nextStatus === CampaignStatus.COMPLETED ||
      command.nextStatus === CampaignStatus.ARCHIVED
    ) {
      if (!command.permissions.includes(Permission.APPROVE_CONTENT)) {
        throw new CampaignForbiddenError(
          'Changing campaign status to ACTIVE, COMPLETED, or ARCHIVED requires approval privileges.',
        );
      }
    } else {
      if (!command.permissions.includes(Permission.EDIT_CONTENT)) {
        throw new CampaignForbiddenError();
      }
    }

    // Requirements for transitioning to PLANNED or ACTIVE:
    if (
      command.nextStatus === CampaignStatus.PLANNED ||
      command.nextStatus === CampaignStatus.ACTIVE
    ) {
      if (campaign.productCount === 0) {
        throw new InvalidCampaignStatusTransitionError(
          campaign.status,
          command.nextStatus,
          'Campaign must have at least one verified product associated before planning or activation.',
        );
      }
      if (campaign.startDate && campaign.endDate) {
        if (new Date(campaign.endDate).getTime() < new Date(campaign.startDate).getTime()) {
          throw new InvalidCampaignDateRangeError();
        }
      }
    }

    return this.campaignRepository.updateStatus(command.id, command.nextStatus);
  }
}
