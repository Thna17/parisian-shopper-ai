import { apiClient } from '../../../services/api/api-client.js';
import type {
  PaginatedProductsResponse,
  ProductDetail,
  ProductFilterParams,
  ProductReadiness,
  VerifiedProductFacts,
} from '../types/product.types.js';

export const productsApi = {
  getProducts: async (params: ProductFilterParams = {}): Promise<PaginatedProductsResponse> => {
    const searchParams = new URLSearchParams();
    if (params.search) searchParams.set('q', params.search);
    if (params.brand) searchParams.set('brand', params.brand);
    if (params.category) searchParams.set('category', params.category);
    if (params.stockStatus) searchParams.set('stockStatus', params.stockStatus);
    if (params.page) searchParams.set('page', String(params.page));
    if (params.limit) searchParams.set('limit', String(params.limit));

    const qs = searchParams.toString();
    const endpoint = `/v1/products${qs ? `?${qs}` : ''}`;
    return apiClient.get<PaginatedProductsResponse>(endpoint);
  },

  getProductById: async (idOrSku: string): Promise<ProductDetail> => {
    return apiClient.get<ProductDetail>(`/v1/products/${encodeURIComponent(idOrSku)}`);
  },

  getProductReadiness: async (idOrSku: string): Promise<ProductReadiness> => {
    return apiClient.get<ProductReadiness>(`/v1/products/${encodeURIComponent(idOrSku)}/readiness`);
  },

  getProductFacts: async (idOrSku: string): Promise<VerifiedProductFacts> => {
    return apiClient.get<VerifiedProductFacts>(`/v1/products/${encodeURIComponent(idOrSku)}/facts`);
  },
};
