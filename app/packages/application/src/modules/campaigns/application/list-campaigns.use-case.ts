import { Inject, Injectable } from '@nestjs/common';
import {
  CAMPAIGN_REPOSITORY,
  type CampaignRepository,
  type ListCampaignsQuery,
  type PaginatedCampaigns,
} from './campaign.repository.js';
import { Permission } from '../../auth/domain/permissions.js';

export interface ListCampaignsCommand extends ListCampaignsQuery {
  readonly actingUserId: string;
  readonly permissions: readonly string[];
}

@Injectable()
export class ListCampaignsUseCase {
  public constructor(
    @Inject(CAMPAIGN_REPOSITORY)
    private readonly campaignRepository: CampaignRepository,
  ) {}

  public async execute(command: ListCampaignsCommand): Promise<PaginatedCampaigns> {
    const canViewAll = command.permissions.includes(Permission.VIEW_ALL_CONTENT);
    const canViewOwn = command.permissions.includes(Permission.VIEW_OWN_CONTENT);

    // If user cannot view all, filter strictly to their own creations
    let effectiveCreatedById: string | undefined = command.createdById;
    if (!canViewAll) {
      if (canViewOwn) {
        effectiveCreatedById = command.actingUserId;
      } else {
        // No content viewing permission at all
        return {
          items: [],
          total: 0,
          page: command.page ?? 1,
          limit: command.limit ?? 20,
          totalPages: 0,
        };
      }
    }

    return this.campaignRepository.findPaginated({
      ...(command.page !== undefined ? { page: command.page } : {}),
      ...(command.limit !== undefined ? { limit: command.limit } : {}),
      ...(command.search !== undefined ? { search: command.search } : {}),
      ...(command.status !== undefined ? { status: command.status } : {}),
      ...(effectiveCreatedById !== undefined ? { createdById: effectiveCreatedById } : {}),
    });
  }
}
