import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { productsApi } from '../api/products-api.js';
import type {
  PaginatedProductsResponse,
  ProductDetail,
  ProductFilterParams,
  ProductReadiness,
  VerifiedProductFacts,
} from '../types/product.types.js';

export const productKeys = {
  all: ['products'] as const,
  lists: () => [...productKeys.all, 'list'] as const,
  list: (params: ProductFilterParams) => [...productKeys.lists(), params] as const,
  details: () => [...productKeys.all, 'detail'] as const,
  detail: (id: string) => [...productKeys.details(), id] as const,
  readiness: (id: string) => [...productKeys.detail(id), 'readiness'] as const,
  facts: (id: string) => [...productKeys.detail(id), 'facts'] as const,
};

export function useProducts(
  params: ProductFilterParams = {},
): UseQueryResult<PaginatedProductsResponse, Error> {
  return useQuery<PaginatedProductsResponse, Error>({
    queryKey: productKeys.list(params),
    queryFn: () => productsApi.getProducts(params),
    staleTime: 60 * 1000, // 1 minute
    placeholderData: (previousData) => previousData, // keep previous data while fetching next page/search
  });
}

export function useProductDetail(
  idOrSku: string | undefined,
): UseQueryResult<ProductDetail, Error> {
  return useQuery<ProductDetail, Error>({
    queryKey: productKeys.detail(idOrSku ?? ''),
    queryFn: () => productsApi.getProductById(idOrSku!),
    enabled: Boolean(idOrSku),
    staleTime: 60 * 1000,
  });
}

export function useProductReadiness(
  idOrSku: string | undefined,
): UseQueryResult<ProductReadiness, Error> {
  return useQuery<ProductReadiness, Error>({
    queryKey: productKeys.readiness(idOrSku ?? ''),
    queryFn: () => productsApi.getProductReadiness(idOrSku!),
    enabled: Boolean(idOrSku),
    staleTime: 30 * 1000, // 30s
  });
}

export function useProductFacts(
  idOrSku: string | undefined,
): UseQueryResult<VerifiedProductFacts, Error> {
  return useQuery<VerifiedProductFacts, Error>({
    queryKey: productKeys.facts(idOrSku ?? ''),
    queryFn: () => productsApi.getProductFacts(idOrSku!),
    enabled: Boolean(idOrSku),
    staleTime: 60 * 1000,
  });
}
