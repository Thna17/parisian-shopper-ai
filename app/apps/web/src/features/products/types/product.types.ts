export interface ProductPrice {
  amount: number;
  currency: string;
}

export interface ProductSummary {
  id: string;
  sku: string;
  brand: string;
  title: string;
  category: string;
  price: ProductPrice;
  promoPrice?: ProductPrice | null;
  stockStatus: string;
  lifecycleStatus: string;
  primaryImageUrl?: string | null;
  capturedAt: string;
  hasApprovedAssets?: boolean;
}

export interface PaginatedProductsResponse {
  data: ProductSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ProductImage {
  url: string;
  role: string;
  altText?: string;
  rightsState?: string;
  isHeroCutout?: boolean;
}

export interface RegisteredAsset {
  id: string;
  role: string;
  rightsState: string;
  rightsNotes?: string | null;
  rightsExpiresAt?: string | null;
  width?: number;
  height?: number;
  format?: string;
  hasAlpha?: boolean;
}

export interface ScentPyramid {
  topNotes: string[];
  heartNotes: string[];
  baseNotes: string[];
}

export interface ProductDetail {
  id: string;
  sku: string;
  brand: string;
  title: string;
  category: string;
  description?: string | null;
  price: ProductPrice;
  promoPrice?: ProductPrice | null;
  stockStatus: string;
  lifecycleStatus: string;
  productUrl?: string | null;
  capturedAt: string;
  sourceUpdatedAt: string;
  snapshotHash: string;
  normalizerVersion: string;
  provenance: {
    sourceSystem: string;
    sourceRecordId?: string | null;
    sourceVersion?: string | null;
    retrievedAt: string;
  };
  specs: {
    concentration?: string | null;
    size?: string | null;
    countryOfOrigin?: string | null;
    gender?: string | null;
  };
  scentPyramid?: ScentPyramid | null;
  similarityClaims?: Array<{
    claimId: string;
    text: string;
    status: string;
  }>;
  images: ProductImage[];
  registeredAssets?: RegisteredAsset[];
}

export interface ProductReadinessFinding {
  category: 'FRESHNESS' | 'ASSETS' | 'COMMERCIAL_FACTS';
  status: 'PASSED' | 'WARNING' | 'BLOCKED';
  message: string;
  code?: string;
}

export interface ProductReadiness {
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

export interface VerifiedProductFacts {
  productId: string;
  sku: string;
  brand: string;
  productName: string;
  category: string;
  price: ProductPrice;
  promoPrice?: ProductPrice | null;
  stockStatus: string;
  description?: string | null;
  specifications: {
    concentration?: string | null;
    size?: string | null;
    countryOfOrigin?: string | null;
    similarityClaims?: string[] | null;
  };
  scentPyramid?: ScentPyramid | null;
  provenance: {
    sourceSystem: string;
    sourceRecordId?: string | null;
    retrievedAt: string;
    sourceUpdatedAt: string;
    snapshotHash: string;
    normalizerVersion: string;
  };
}

export interface ProductFilterParams {
  search?: string;
  brand?: string;
  category?: string;
  stockStatus?: string;
  page?: number;
  limit?: number;
}
