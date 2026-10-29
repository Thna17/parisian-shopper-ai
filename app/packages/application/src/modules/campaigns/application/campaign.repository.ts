import { type CampaignStatus } from '../domain/campaign.types.js';

export const CAMPAIGN_REPOSITORY = Symbol('CAMPAIGN_REPOSITORY');

export interface CampaignProductRecord {
  readonly id: string;
  readonly campaignId: string;
  readonly productSnapshotId: string;
  readonly sortOrder: number;
  readonly isHero: boolean;
  readonly notes?: string | null | undefined;
  readonly targetPromoPrice?: number | null | undefined;
  readonly targetDiscountPercent?: number | null | undefined;
  readonly createdAt: Date;
  // Snapshot joined facts (read-only)
  readonly productSku?: string | undefined;
  readonly productTitle?: string | undefined;
  readonly brandName?: string | undefined;
  readonly catalogPriceUsd?: number | undefined;
  readonly heroAssetUrl?: string | null | undefined;
}

export interface CampaignSummary {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly objective: string;
  readonly description?: string | null | undefined;
  readonly status: CampaignStatus;
  readonly startDate?: Date | null | undefined;
  readonly endDate?: Date | null | undefined;
  readonly createdById: string;
  readonly createdByDisplayName?: string | undefined;
  readonly productCount: number;
  readonly heroProductSku?: string | null | undefined;
  readonly heroProductTitle?: string | null | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CampaignDetail extends CampaignSummary {
  readonly products: readonly CampaignProductRecord[];
}

export interface CreateCampaignInput {
  readonly code: string;
  readonly name: string;
  readonly objective: string;
  readonly description?: string | null | undefined;
  readonly status?: CampaignStatus | undefined;
  readonly startDate?: Date | null | undefined;
  readonly endDate?: Date | null | undefined;
  readonly createdById: string;
}

export interface UpdateCampaignInput {
  readonly name?: string | undefined;
  readonly objective?: string | undefined;
  readonly description?: string | null | undefined;
  readonly startDate?: Date | null | undefined;
  readonly endDate?: Date | null | undefined;
}

export interface AddCampaignProductInput {
  readonly productSnapshotId: string;
  readonly sortOrder?: number | undefined;
  readonly isHero?: boolean | undefined;
  readonly notes?: string | null | undefined;
  readonly targetPromoPrice?: number | null | undefined;
  readonly targetDiscountPercent?: number | null | undefined;
}

export interface ListCampaignsQuery {
  readonly page?: number | undefined;
  readonly limit?: number | undefined;
  readonly search?: string | undefined;
  readonly status?: CampaignStatus | undefined;
  readonly createdById?: string | undefined;
}

export interface PaginatedCampaigns {
  readonly items: readonly CampaignSummary[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
}

export interface CampaignRepository {
  findById(id: string): Promise<CampaignDetail | null>;
  findByCode(code: string): Promise<CampaignDetail | null>;
  findPaginated(query: ListCampaignsQuery): Promise<PaginatedCampaigns>;
  create(input: CreateCampaignInput): Promise<CampaignDetail>;
  update(id: string, input: UpdateCampaignInput): Promise<CampaignDetail>;
  updateStatus(id: string, status: CampaignStatus): Promise<CampaignDetail>;
  addProduct(campaignId: string, input: AddCampaignProductInput): Promise<CampaignProductRecord>;
  removeProduct(campaignId: string, productSnapshotIdOrAssocId: string): Promise<void>;
  delete(id: string): Promise<void>;
}
