import React from 'react';
import { Shield, Sparkles } from 'lucide-react';
import { Badge } from '../../../components/ui/badge.js';
import type { ProductDetail } from '../types/product.types.js';

export interface ProductFactsPanelProps {
  readonly product: ProductDetail;
}

export const ProductFactsPanel: React.FC<ProductFactsPanelProps> = ({ product }) => {
  const formatPrice = (amount: number, currency: string): string => {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${currency}`;
    }
  };

  return (
    <div className="bg-app-surface border border-app-border rounded-xl p-6 shadow-subtle space-y-6">
      {/* Header Lockup */}
      <div className="flex items-start justify-between gap-4 border-b border-app-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-[#9A7D45] dark:text-[#D6BC87]">
              {product.brand}
            </span>
            <span className="text-xs text-app-muted">•</span>
            <span className="text-xs text-app-muted uppercase tracking-wider">
              {product.category}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-app-primary tracking-tight">
            {product.title}
          </h1>
          <p className="text-xs font-mono text-app-muted mt-1">SKU: {product.sku}</p>
        </div>

        <Badge variant="good" dot className="shrink-0 py-1 px-3">
          Verified Commercial Facts
        </Badge>
      </div>

      {/* Verified Price & Inventory Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-app-surface-subtle/50 border border-app-border/80">
        <div>
          <span className="text-xs font-medium text-app-muted uppercase tracking-wider">
            Verified Retail Price
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-app-primary">
              {formatPrice(product.price.amount, product.price.currency)}
            </span>
            <span className="text-xs font-semibold text-app-muted uppercase">
              {product.price.currency}
            </span>
          </div>
          <p className="text-[11px] text-app-muted mt-0.5">
            Synchronized from upstream catalog. Read-only verified data.
          </p>
        </div>

        <div>
          <span className="text-xs font-medium text-app-muted uppercase tracking-wider">
            Inventory Disposition
          </span>
          <div className="mt-1">
            <span className="text-base font-semibold text-app-primary capitalize">
              {product.stockStatus.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="text-[11px] text-app-muted mt-0.5">
            Lifecycle: <span className="capitalize">{product.lifecycleStatus}</span>
          </p>
        </div>
      </div>

      {/* Description */}
      {product.description && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-app-muted">
            Commercial Description
          </h4>
          <p className="text-sm text-app-secondary leading-relaxed">{product.description}</p>
        </div>
      )}

      {/* Specifications Grid */}
      <div className="space-y-2.5">
        <h4 className="text-xs font-bold uppercase tracking-wider text-app-muted">
          Product Specifications
        </h4>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="p-3 rounded-lg bg-app-surface border border-app-border">
            <dt className="text-[10px] uppercase font-semibold text-app-muted tracking-wider">
              Concentration
            </dt>
            <dd className="text-sm font-semibold text-app-primary mt-0.5">
              {product.specs.concentration ?? 'N/A'}
            </dd>
          </div>
          <div className="p-3 rounded-lg bg-app-surface border border-app-border">
            <dt className="text-[10px] uppercase font-semibold text-app-muted tracking-wider">
              Volume / Size
            </dt>
            <dd className="text-sm font-semibold text-app-primary mt-0.5">
              {product.specs.size ?? 'Standard'}
            </dd>
          </div>
          <div className="p-3 rounded-lg bg-app-surface border border-app-border">
            <dt className="text-[10px] uppercase font-semibold text-app-muted tracking-wider">
              Country of Origin
            </dt>
            <dd className="text-sm font-semibold text-app-primary mt-0.5">
              {product.specs.countryOfOrigin ?? 'France'}
            </dd>
          </div>
        </dl>
      </div>

      {/* Scent Pyramid (if available) */}
      {product.scentPyramid && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#9A7D45]" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-app-primary">
              Olfactory Scent Pyramid
            </h4>
          </div>

          <div className="space-y-2 bg-app-surface-subtle/30 border border-app-border/80 rounded-xl p-4">
            {product.scentPyramid.topNotes?.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <span className="w-20 text-[11px] font-bold uppercase tracking-wider text-app-muted shrink-0">
                  Top Notes:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {product.scentPyramid.topNotes.map((note) => (
                    <span
                      key={note}
                      className="px-2.5 py-0.5 rounded-full text-xs bg-app-surface border border-app-border font-medium text-app-primary"
                    >
                      {note}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {product.scentPyramid.heartNotes?.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <span className="w-20 text-[11px] font-bold uppercase tracking-wider text-app-muted shrink-0">
                  Heart Notes:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {product.scentPyramid.heartNotes.map((note) => (
                    <span
                      key={note}
                      className="px-2.5 py-0.5 rounded-full text-xs bg-app-surface border border-app-border font-medium text-app-primary"
                    >
                      {note}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {product.scentPyramid.baseNotes?.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <span className="w-20 text-[11px] font-bold uppercase tracking-wider text-app-muted shrink-0">
                  Base Notes:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {product.scentPyramid.baseNotes.map((note) => (
                    <span
                      key={note}
                      className="px-2.5 py-0.5 rounded-full text-xs bg-app-surface border border-app-border font-medium text-app-primary"
                    >
                      {note}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Provenance & Audit Footer */}
      <div className="pt-4 border-t border-app-border/60 flex flex-col sm:flex-row items-start sm:items-center justify-between text-[11px] text-app-muted gap-2">
        <div className="flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-[#23856B]" />
          <span>Source: {product.provenance.sourceSystem}</span>
          <span>•</span>
          <span>Hash: #{product.snapshotHash.slice(0, 10)}</span>
        </div>
        <div>Captured: {new Date(product.capturedAt).toLocaleString()}</div>
      </div>
    </div>
  );
};
