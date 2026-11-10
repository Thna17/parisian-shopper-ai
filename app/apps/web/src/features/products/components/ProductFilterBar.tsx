import React from 'react';
import { ProductSearchBar } from './ProductSearchBar.js';

export interface ProductFilterBarProps {
  readonly search: string;
  readonly onSearchChange: (search: string) => void;
  readonly stockStatus?: string;
  readonly onStockStatusChange: (status?: string) => void;
  readonly brand?: string;
  readonly onBrandChange?: (brand?: string) => void;
  readonly category?: string;
  readonly onCategoryChange?: (value?: string) => void;
  readonly onReset: () => void;
}

export const ProductFilterBar: React.FC<ProductFilterBarProps> = ({
  search,
  onSearchChange,
  stockStatus,
  onStockStatusChange,
  brand,
  onBrandChange,
  category,
  onCategoryChange,
  onReset,
}) => {
  const stockOptions = [
    { label: 'All Inventory', value: '' },
    { label: 'In Stock', value: 'in_stock' },
    { label: 'Low Stock', value: 'low_stock' },
    { label: 'Out of Stock', value: 'out_of_stock' },
  ];

  const hasActiveFilters = Boolean(search || stockStatus || brand || category);

  return (
    <div className="space-y-3">
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-app-surface border border-app-border rounded-xl p-3 shadow-subtle">
        {/* Search Bar */}
        <ProductSearchBar initialValue={search} onSearch={onSearchChange} />

        {/* Stock Status Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {stockOptions.map((opt) => {
            const isActive = (stockStatus ?? '') === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                data-testid={`filter-stock-${opt.value || 'all'}`}
                onClick={() => onStockStatusChange(opt.value ? opt.value : undefined)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors select-none ${
                  isActive
                    ? 'bg-[#B59761] text-white shadow-subtle'
                    : 'bg-app-surface-subtle text-app-muted hover:text-app-primary border border-app-border'
                }`}
              >
                {opt.label}
              </button>
            );
          })}

          {hasActiveFilters && (
            <button
              type="button"
              data-testid="clear-filters-btn"
              onClick={onReset}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-app-muted hover:text-rose-600 transition-colors whitespace-nowrap ml-1"
            >
              Reset
            </button>
          )}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {onBrandChange && (
          <label className="space-y-1 text-xs text-app-muted">
            <span>Brand</span>
            <input
              value={brand ?? ''}
              onChange={(event) => onBrandChange(event.target.value || undefined)}
              placeholder="Filter by brand"
              className="min-h-10 w-full rounded-lg border border-app-border bg-app-surface px-3 text-sm text-app-primary"
            />
          </label>
        )}
        {onCategoryChange && (
          <label className="space-y-1 text-xs text-app-muted">
            <span>Category</span>
            <input
              value={category ?? ''}
              onChange={(event) => onCategoryChange(event.target.value || undefined)}
              placeholder="Filter by category"
              className="min-h-10 w-full rounded-lg border border-app-border bg-app-surface px-3 text-sm text-app-primary"
            />
          </label>
        )}
      </div>
    </div>
  );
};
