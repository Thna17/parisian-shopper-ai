import { Inject, Injectable } from '@nestjs/common';
import { CAMPAIGN_REPOSITORY, type CampaignRepository } from './campaign.repository.js';
import {
  CampaignForbiddenError,
  CampaignNotFoundError,
  InvalidCampaignStatusTransitionError,
} from '../domain/campaign-errors.js';
import { CampaignStatus } from '../domain/campaign.types.js';
import { Permission } from '../../auth/domain/permissions.js';

export interface RemoveCampaignProductCommand {
  readonly campaignId: string;
  readonly productSnapshotIdOrAssocId: string;
  readonly actingUserId: string;
  readonly permissions: readonly string[];
}

@Injectable()
export class RemoveCampaignProductUseCase {
  public constructor(
    @Inject(CAMPAIGN_REPOSITORY)
    private readonly campaignRepository: CampaignRepository,
  ) {}

  public async execute(command: RemoveCampaignProductCommand): Promise<void> {
    const campaign = await this.campaignRepository.findById(command.campaignId);
    if (!campaign) {
      throw new CampaignNotFoundError(command.campaignId);
    }

    if (
      campaign.status === CampaignStatus.ARCHIVED ||
      campaign.status === CampaignStatus.COMPLETED
    ) {
      throw new InvalidCampaignStatusTransitionError(
        campaign.status,
        campaign.status,
        'Cannot remove products from an archived or completed campaign',
      );
    }

    const canEdit = command.permissions.includes(Permission.EDIT_CONTENT);
    if (!canEdit) {
      throw new CampaignForbiddenError();
    }

    await this.campaignRepository.removeProduct(
      command.campaignId,
      command.productSnapshotIdOrAssocId,
    );
  }
}
