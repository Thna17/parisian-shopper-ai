export interface ProductPriceDto {
  amount: number;
  currency: string;
}

export interface ProductSummaryDto {
  id: string;
  sku: string;
  brand: string;
  title: string;
  category: string;
  price: ProductPriceDto;
  promoPrice?: ProductPriceDto | null | undefined;
  stockStatus: string;
  lifecycleStatus: string;
  primaryImageUrl?: string | null | undefined;
  capturedAt: string;
  hasApprovedAssets?: boolean | undefined;
}

export interface PaginatedProductsResponseDto {
  data: ProductSummaryDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ProductImageDto {
  url: string;
  role: string;
  altText?: string | undefined;
  rightsState?: string | undefined;
  isHeroCutout?: boolean | undefined;
}

export interface RegisteredAssetDto {
  id: string;
  role: string;
  rightsState: string;
  rightsNotes?: string | null | undefined;
  rightsExpiresAt?: string | null | undefined;
  width?: number | undefined;
  height?: number | undefined;
  format?: string | undefined;
  hasAlpha?: boolean | undefined;
}

export interface ScentPyramidDto {
  topNotes: string[];
  heartNotes: string[];
  baseNotes: string[];
}

export interface ProductDetailDto {
  id: string;
  sku: string;
  brand: string;
  title: string;
  category: string;
  description?: string | null | undefined;
  price: ProductPriceDto;
  promoPrice?: ProductPriceDto | null | undefined;
  stockStatus: string;
  lifecycleStatus: string;
  productUrl?: string | null | undefined;
  capturedAt: string;
  sourceUpdatedAt: string;
  snapshotHash: string;
  normalizerVersion: string;
  provenance: {
    sourceSystem: string;
    sourceRecordId?: string | null | undefined;
    sourceVersion?: string | null | undefined;
    retrievedAt: string;
  };
  specs: {
    concentration?: string | null | undefined;
    size?: string | null | undefined;
    countryOfOrigin?: string | null | undefined;
    gender?: string | null | undefined;
  };
  scentPyramid?: ScentPyramidDto | null | undefined;
  similarityClaims?:
    | Array<{
        claimId: string;
        text: string;
        status: string;
      }>
    | undefined;
  images: ProductImageDto[];
  registeredAssets?: RegisteredAssetDto[] | undefined;
}

export interface ProductReadinessFinding {
  category: 'FRESHNESS' | 'ASSETS' | 'COMMERCIAL_FACTS';
  status: 'PASSED' | 'WARNING' | 'BLOCKED';
  message: string;
  code?: string | undefined;
}

export interface ProductReadinessResponseDto {
  productId: string;
  sku: string;
  freshnessState: 'FRESH' | 'AGING' | 'STALE' | 'INVALID' | 'UNASSESSED';
  isReadyForContent: boolean;
  hasApprovedAssets: boolean;
  assetCount: number;
  lastAssessedAt: string | null;
  blockingReasons: string[];
  findings: ProductReadinessFinding[];
}

export interface VerifiedProductFactsDto {
  productId: string;
  sku: string;
  brand: string;
  productName: string;
  category: string;
  price: ProductPriceDto;
  promoPrice?: ProductPriceDto | null | undefined;
  stockStatus: string;
  description?: string | null | undefined;
  specifications: {
    concentration?: string | null | undefined;
    size?: string | null | undefined;
    countryOfOrigin?: string | null | undefined;
    similarityClaims?: string[] | null | undefined;
  };
  scentPyramid?: ScentPyramidDto | null | undefined;
  provenance: {
    sourceSystem: string;
    sourceRecordId?: string | null | undefined;
    retrievedAt: string;
    sourceUpdatedAt: string;
    snapshotHash: string;
    normalizerVersion: string;
  };
}
