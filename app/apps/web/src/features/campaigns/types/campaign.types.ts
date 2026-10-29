export type CampaignStatus = 'DRAFT' | 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';

export interface CampaignSummary {
  id: string;
  code: string;
  name: string;
  objective: string;
  description: string | null;
  status: CampaignStatus;
  startDate: string | null;
  endDate: string | null;
  createdById: string;
  createdByDisplayName: string | null;
  productCount: number;
  heroProductSku: string | null;
  heroProductTitle: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignProduct {
  id: string;
  campaignId: string;
  productSnapshotId: string;
  sortOrder: number;
  isHero: boolean;
  notes: string | null;
  /** Proposed marketing promotional target price (MSRP is never mutated) */
  targetPromoPrice: number | null;
  /** Proposed target discount percent */
  targetDiscountPercent: number | null;
  createdAt: string;
  productSku: string;
  productTitle: string;
  brandName: string;
  catalogPriceUsd: number;
  heroAssetUrl?: string | null;
}

export interface CampaignDetail {
  id: string;
  code: string;
  name: string;
  objective: string;
  description: string | null;
  status: CampaignStatus;
  startDate: string | null;
  endDate: string | null;
  createdById: string;
  createdByDisplayName: string | null;
  productCount: number;
  heroProductSku: string | null;
  heroProductTitle: string | null;
  products: CampaignProduct[];
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedCampaignsResponse {
  items: CampaignSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CampaignFilterParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: CampaignStatus;
}

export interface CreateCampaignInput {
  code: string;
  name: string;
  objective: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface UpdateCampaignInput {
  name?: string;
  objective?: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface ChangeCampaignStatusInput {
  status: CampaignStatus;
}

export interface AssociateProductInput {
  productSnapshotId: string;
  isHero?: boolean;
  sortOrder?: number;
  notes?: string | null;
  targetPromoPrice?: number | null;
  targetDiscountPercent?: number | null;
}
