import React, { useState } from 'react';
import { Check, Package, Search } from 'lucide-react';
import { useProducts } from '../../products/hooks/use-products.js';
import type { ProductSummary } from '../../products/types/product.types.js';

interface ProductContextSelectorProps {
  selectedSnapshotId: string | null;
  onSelect: (product: ProductSummary) => void;
}

export function ProductContextSelector({
  selectedSnapshotId,
  onSelect,
}: ProductContextSelectorProps): React.JSX.Element {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useProducts({ search, limit: 12 });

  const products = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search verified catalog products by name, brand, or SKU..."
          className="w-full pl-10 pr-4 py-2 text-sm bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-neutral-900 dark:text-neutral-100"
        />
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-xs text-neutral-500">Loading catalog products...</div>
      ) : products.length === 0 ? (
        <div className="py-8 text-center text-xs text-neutral-500">
          No verified products found matching "{search}".
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-[360px] overflow-y-auto pr-1">
          {products.map((product: ProductSummary) => {
            const isSelected = product.id === selectedSnapshotId;

            return (
              <button
                key={product.id}
                type="button"
                onClick={() => onSelect(product)}
                className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                  isSelected
                    ? 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-500 shadow-sm ring-1 ring-amber-500'
                    : 'bg-white dark:bg-neutral-800/60 border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600'
                }`}
              >
                <div className="w-12 h-12 rounded-lg bg-neutral-100 dark:bg-neutral-700 overflow-hidden shrink-0 flex items-center justify-center">
                  {product.primaryImageUrl ? (
                    <img
                      src={product.primaryImageUrl}
                      alt={product.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Package className="w-5 h-5 text-neutral-400" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider truncate">
                      {product.brand}
                    </span>
                    {isSelected && (
                      <span className="w-4 h-4 rounded-full bg-amber-600 text-white flex items-center justify-center">
                        <Check className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </div>
                  <h4 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate mt-0.5">
                    {product.title}
                  </h4>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-neutral-500 font-mono">
                    <span>{product.sku}</span>
                    <span>•</span>
                    <span className="font-semibold text-neutral-900 dark:text-neutral-100 font-sans">
                      ${product.price.amount.toFixed(2)}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
