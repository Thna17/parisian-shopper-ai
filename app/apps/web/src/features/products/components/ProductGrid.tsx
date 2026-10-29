import React from 'react';
import { PackageSearch } from 'lucide-react';
import { EmptyState } from '../../../components/ui/empty-state.js';
import { ErrorState } from '../../../components/ui/error-state.js';
import { Skeleton } from '../../../components/ui/skeleton.js';
import type { ProductSummary } from '../types/product.types.js';
import { ProductCard } from './ProductCard.js';

export interface ProductGridProps {
  readonly products: ProductSummary[];
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly error?: Error | null;
  readonly onRetry?: () => void;
  readonly onClearFilters?: () => void;
}

export const ProductGrid: React.FC<ProductGridProps> = ({
  products,
  isLoading,
  isError,
  error,
  onRetry,
  onClearFilters,
}) => {
  if (isLoading) {
    return (
      <div
        data-testid="product-loading-skeletons"
        className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5"
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col bg-app-surface border border-app-border rounded-xl overflow-hidden p-4 space-y-3"
          >
            <Skeleton className="w-full aspect-square rounded-lg" />
            <div className="space-y-2 pt-2">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <div className="pt-3 border-t border-app-border/60 flex items-center justify-between">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-4 w-16 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        title="Could not load products"
        message={error?.message || 'Failed to communicate with catalog service.'}
        onRetry={onRetry}
      />
    );
  }

  if (products.length === 0) {
    return (
      <EmptyState
        icon={<PackageSearch className="w-6 h-6 text-app-muted" />}
        title="No products found"
        description="No verified product snapshots matched your active search query or filter criteria."
        action={
          onClearFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="text-xs font-semibold text-[#9A7D45] dark:text-[#D6BC87] hover:underline"
            >
              Reset all filters
            </button>
          )
        }
      />
    );
  }

  return (
    <div
      data-testid="product-grid"
      className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5"
    >
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
};
