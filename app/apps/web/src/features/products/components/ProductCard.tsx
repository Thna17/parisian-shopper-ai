import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Package, ShieldCheck } from 'lucide-react';
import { Badge, type BadgeVariant } from '../../../components/ui/badge.js';
import type { ProductSummary } from '../types/product.types.js';
import { ProductReadinessBadge } from './ProductReadinessBadge.js';

export interface ProductCardProps {
  readonly product: ProductSummary;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const [imageError, setImageError] = useState(false);

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

  const getStockBadge = (status: string): { label: string; variant: BadgeVariant } => {
    switch (status.toLowerCase()) {
      case 'in_stock':
        return { label: 'In Stock', variant: 'good' };
      case 'low_stock':
        return { label: 'Low Stock', variant: 'warn' };
      case 'out_of_stock':
        return { label: 'Out of Stock', variant: 'bad' };
      default:
        return { label: status.replace(/_/g, ' '), variant: 'neutral' };
    }
  };

  const stockBadge = getStockBadge(product.stockStatus);

  return (
    <Link
      to={`/products/${product.id}`}
      data-testid={`product-card-${product.sku}`}
      className="group relative flex flex-col bg-app-surface border border-app-border rounded-xl overflow-hidden shadow-subtle hover:shadow-card hover:border-[#B59761]/50 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#B59761]/60"
    >
      {/* Product Image Frame */}
      <div className="relative w-full aspect-square bg-[#FDFBF7] dark:bg-[#1A222D] flex items-center justify-center p-6 overflow-hidden border-b border-app-border/60">
        {product.primaryImageUrl && !imageError ? (
          <img
            src={product.primaryImageUrl}
            alt={product.title}
            onError={() => setImageError(true)}
            className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div
            data-testid="image-fallback"
            className="flex flex-col items-center justify-center text-app-muted/60"
          >
            <Package className="w-12 h-12 stroke-[1.25] text-app-muted/40" />
            <span className="text-[10px] mt-1 text-app-muted/60 font-medium uppercase tracking-wider">
              {product.brand}
            </span>
          </div>
        )}

        {/* Top Badges */}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-1.5 pointer-events-none">
          <Badge
            variant={stockBadge.variant}
            dot
            className="bg-app-surface/90 backdrop-blur-sm text-[10px] py-0.5 px-2"
          >
            {stockBadge.label}
          </Badge>
          <div className="flex items-center gap-1">
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-app-surface/90 backdrop-blur-sm border border-app-border text-[10px] font-medium text-app-muted"
              title="Verified Upstream Snapshot"
            >
              <ShieldCheck className="w-3 h-3 text-[#23856B]" />
              <span className="hidden sm:inline">Verified</span>
            </span>
          </div>
        </div>
      </div>

      {/* Product Body */}
      <div className="flex-1 p-4 flex flex-col justify-between">
        <div>
          {/* Brand & Category */}
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#9A7D45] dark:text-[#D6BC87] truncate">
              {product.brand}
            </span>
            <span className="text-[10px] text-app-muted uppercase tracking-wider">
              {product.category}
            </span>
          </div>

          {/* Product Title */}
          <h3
            className="text-sm font-semibold text-app-primary line-clamp-2 leading-snug group-hover:text-[#9A7D45] dark:group-hover:text-[#D6BC87] transition-colors"
            title={product.title}
          >
            {product.title}
          </h3>

          {/* SKU Pill */}
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="text-[11px] font-mono text-app-muted/80">{product.sku}</span>
          </div>
        </div>

        {/* Price & Commercial Verification */}
        <div className="mt-4 pt-3 border-t border-app-border/60 flex items-end justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] font-medium uppercase text-app-muted tracking-wider">
              Verified Retail
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-bold text-app-primary">
                {formatPrice(product.price.amount, product.price.currency)}
              </span>
              {product.promoPrice && product.promoPrice.amount > 0 && (
                <span className="text-xs text-app-muted line-through">
                  {formatPrice(product.price.amount, product.price.currency)}
                </span>
              )}
            </div>
          </div>

          {/* Readiness Indicator */}
          <ProductReadinessBadge state={product.hasApprovedAssets ? 'FRESH' : 'UNASSESSED'} />
        </div>
      </div>
    </Link>
  );
};
