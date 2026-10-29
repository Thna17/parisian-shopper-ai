import { type CampaignStatus } from '@parisian-shopper/application';

export interface CampaignProductResponseDto {
  id: string;
  campaignId: string;
  productSnapshotId: string;
  sortOrder: number;
  isHero: boolean;
  notes?: string | null | undefined;
  targetPromoPrice?: number | null | undefined;
  targetDiscountPercent?: number | null | undefined;
  createdAt: string;
  productSku?: string | undefined;
  productTitle?: string | undefined;
  brandName?: string | undefined;
  catalogPriceUsd?: number | undefined;
  heroAssetUrl?: string | null | undefined;
}

export interface CampaignSummaryResponseDto {
  id: string;
  code: string;
  name: string;
  objective: string;
  description?: string | null | undefined;
  status: CampaignStatus;
  startDate?: string | null | undefined;
  endDate?: string | null | undefined;
  createdById: string;
  createdByDisplayName?: string | undefined;
  productCount: number;
  heroProductSku?: string | null | undefined;
  heroProductTitle?: string | null | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignDetailResponseDto extends CampaignSummaryResponseDto {
  products: CampaignProductResponseDto[];
}

export interface PaginatedCampaignsResponseDto {
  items: CampaignSummaryResponseDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
