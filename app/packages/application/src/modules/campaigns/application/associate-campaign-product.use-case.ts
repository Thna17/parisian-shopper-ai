import { Inject, Injectable } from '@nestjs/common';
import {
  CAMPAIGN_REPOSITORY,
  type CampaignProductRecord,
  type CampaignRepository,
} from './campaign.repository.js';
import {
  PRODUCT_SNAPSHOT_REPOSITORY,
  type ProductSnapshotRepository,
} from '../../products/application/product-snapshot.repository.js';
import {
  CampaignForbiddenError,
  CampaignNotFoundError,
  DuplicateCampaignProductError,
  InvalidCampaignStatusTransitionError,
} from '../domain/campaign-errors.js';
import { ProductSnapshotNotFoundError } from '../../products/domain/product-errors.js';
import { CampaignStatus } from '../domain/campaign.types.js';
import { Permission } from '../../auth/domain/permissions.js';

export interface AssociateCampaignProductCommand {
  readonly campaignId: string;
  readonly productSnapshotId: string;
  readonly sortOrder?: number;
  readonly isHero?: boolean;
  readonly notes?: string | null;
  readonly targetPromoPrice?: number | null;
  readonly targetDiscountPercent?: number | null;
  readonly actingUserId: string;
  readonly permissions: readonly string[];
}

@Injectable()
export class AssociateCampaignProductUseCase {
  public constructor(
    @Inject(CAMPAIGN_REPOSITORY)
    private readonly campaignRepository: CampaignRepository,
    @Inject(PRODUCT_SNAPSHOT_REPOSITORY)
    private readonly productSnapshotRepository: ProductSnapshotRepository,
  ) {}

  public async execute(command: AssociateCampaignProductCommand): Promise<CampaignProductRecord> {
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
        'Cannot add products to an archived or completed campaign',
      );
    }

    const canEdit = command.permissions.includes(Permission.EDIT_CONTENT);
    if (!canEdit) {
      throw new CampaignForbiddenError();
    }

    // Verify product snapshot exists
    const snapshot = await this.productSnapshotRepository.findById(command.productSnapshotId);
    if (!snapshot) {
      throw new ProductSnapshotNotFoundError(command.productSnapshotId);
    }

    // Check duplicate
    const existingAssoc = campaign.products.find(
      (p) => p.productSnapshotId === command.productSnapshotId,
    );
    if (existingAssoc) {
      throw new DuplicateCampaignProductError(command.productSnapshotId);
    }

    // Commercial integrity invariant:
    // targetPromoPrice and targetDiscountPercent are strictly proposed targets.
    // Verified snapshot.product.priceUsd remains immutable.
    return this.campaignRepository.addProduct(command.campaignId, {
      productSnapshotId: command.productSnapshotId,
      sortOrder: command.sortOrder ?? campaign.products.length,
      isHero: command.isHero ?? false,
      notes: command.notes ?? null,
      targetPromoPrice: command.targetPromoPrice ?? null,
      targetDiscountPercent: command.targetDiscountPercent ?? null,
    });
  }
}
