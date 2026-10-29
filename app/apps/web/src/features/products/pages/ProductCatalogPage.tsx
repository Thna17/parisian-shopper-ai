import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, PackageCheck, Sparkles } from 'lucide-react';
import { Button } from '../../../components/ui/button.js';
import { ProductFilterBar } from '../components/ProductFilterBar.js';
import { ProductGrid } from '../components/ProductGrid.js';
import { useProducts } from '../hooks/use-products.js';

export const ProductCatalogPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const searchQuery = searchParams.get('q') ?? '';
  const stockStatus = searchParams.get('stockStatus') ?? undefined;
  const brand = searchParams.get('brand') ?? undefined;
  const category = searchParams.get('category') ?? undefined;
  const page = parseInt(searchParams.get('page') ?? '1', 10) || 1;
  const limit = 12;

  const { data, isLoading, isError, error, refetch } = useProducts({
    search: searchQuery,
    stockStatus,
    brand,
    category,
    page,
    limit,
  });

  const updateParam = (key: string, value?: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value && value.trim() !== '') {
          next.set(key, value);
        } else {
          next.delete(key);
        }
        // Reset to page 1 on filter/search change
        if (key !== 'page') {
          next.delete('page');
        }
        return next;
      },
      { replace: true },
    );
  };

  const handleResetFilters = () => {
    setSearchParams({}, { replace: true });
  };

  const handlePageChange = (newPage: number) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (newPage > 1) {
          next.set('page', String(newPage));
        } else {
          next.delete('page');
        }
        return next;
      },
      { replace: true },
    );
  };

  const products = data?.data ?? [];
  const pagination = data?.pagination ?? { page: 1, limit, total: 0, totalPages: 1 };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-app-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-app-primary">
              Products Catalog
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#B59761]/12 text-[#9A7D45] dark:text-[#D6BC87] border border-[#B59761]/25">
              <Sparkles className="w-3 h-3" />
              Verified Snapshots
            </span>
          </div>
          <p className="text-sm text-app-muted mt-1">
            Authoritative luxury perfume catalog synchronized with commercial verification and asset
            rights.
          </p>
        </div>

        {pagination.total > 0 && (
          <div className="flex items-center gap-2 text-xs text-app-muted self-start sm:self-auto bg-app-surface border border-app-border px-3 py-1.5 rounded-lg shadow-subtle">
            <PackageCheck className="w-4 h-4 text-[#23856B]" />
            <span>
              Showing <strong className="text-app-primary">{products.length}</strong> of{' '}
              <strong className="text-app-primary">{pagination.total}</strong> products
            </span>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <ProductFilterBar
        search={searchQuery}
        onSearchChange={(q) => updateParam('q', q)}
        stockStatus={stockStatus}
        onStockStatusChange={(s) => updateParam('stockStatus', s)}
        brand={brand}
        onBrandChange={(b) => updateParam('brand', b)}
        onReset={handleResetFilters}
      />

      {/* Product Card Grid */}
      <ProductGrid
        products={products}
        isLoading={isLoading}
        isError={isError}
        error={error}
        onRetry={() => void refetch()}
        onClearFilters={handleResetFilters}
      />

      {/* Pagination Controls */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-app-border/60 pt-6">
          <div data-testid="pagination-indicator" className="text-xs text-app-muted">
            Page <strong className="text-app-primary">{pagination.page}</strong> of{' '}
            <strong className="text-app-primary">{pagination.totalPages}</strong>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => handlePageChange(pagination.page - 1)}
              className="gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => handlePageChange(pagination.page + 1)}
              className="gap-1"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
