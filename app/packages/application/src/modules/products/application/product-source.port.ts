import { type NormalizedProductEnvelope } from '../domain/product.schema.js';

export const PRODUCT_SOURCE = Symbol('PRODUCT_SOURCE');

export interface ProductSourceSearchInput {
  query: string;
  limit: number;
}

export interface ProductSearchResult {
  items: readonly NormalizedProductEnvelope[];
}

export interface ProductCatalogPageResult {
  readonly items: readonly NormalizedProductEnvelope[];
  readonly pagination: {
    readonly page: number;
    readonly limit: number;
    readonly totalItems: number;
    readonly totalPages: number;
  };
}

export interface ProductSource {
  readonly adapterName: string;
  getBySku(sku: string): Promise<NormalizedProductEnvelope | null>;
  search(input: ProductSourceSearchInput): Promise<ProductSearchResult>;
  fetchCatalogPage?(page?: number, limit?: number): Promise<ProductCatalogPageResult>;
}
