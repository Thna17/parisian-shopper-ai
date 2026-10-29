import React from 'react';
import { Package, Trash2, Tag } from 'lucide-react';
import { Button } from '../../../components/ui/button.js';
import { Badge } from '../../../components/ui/badge.js';
import type { CampaignProduct } from '../types/campaign.types.js';

export interface CampaignProductListProps {
  readonly products: readonly CampaignProduct[];
  readonly isEditable: boolean;
  readonly onRemoveProduct?: (associationId: string) => void;
  readonly isRemoving?: boolean;
}

export const CampaignProductList: React.FC<CampaignProductListProps> = ({
  products,
  isEditable,
  onRemoveProduct,
  isRemoving = false,
}) => {
  if (products.length === 0) {
    return (
      <div className="p-8 text-center bg-app-surface rounded-xl border border-dashed border-app-border">
        <Package className="w-8 h-8 text-app-muted mx-auto mb-2 opacity-50" />
        <h4 className="text-sm font-semibold text-app-primary">No products associated yet</h4>
        <p className="text-xs text-app-muted mt-1 max-w-sm mx-auto">
          Associate verified product snapshots from the catalog to establish hero positioning and
          proposed promotional targets.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {products.map((prod) => {
        const hasPromoTarget = prod.targetPromoPrice !== null && prod.targetPromoPrice > 0;

        return (
          <div
            key={prod.id}
            className="p-4 rounded-xl bg-app-surface border border-app-border shadow-subtle hover:border-gold-500/30 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            {/* Left: Thumbnail & Details */}
            <div className="flex items-start gap-3.5 min-w-0">
              <div className="w-12 h-12 rounded-lg bg-app-surface-subtle border border-app-border/80 flex items-center justify-center shrink-0 overflow-hidden">
                {prod.heroAssetUrl ? (
                  <img
                    src={prod.heroAssetUrl}
                    alt={prod.productTitle}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Package className="w-5 h-5 text-app-muted" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-xs font-semibold text-gold-600 dark:text-gold-400">
                    {prod.brandName}
                  </span>
                  <span className="font-mono text-[11px] text-app-muted">{prod.productSku}</span>
                  {prod.isHero && (
                    <Badge variant="gold" dot className="text-[10px] py-0 px-2">
                      Hero Focus
                    </Badge>
                  )}
                </div>

                <h4 className="text-sm font-bold text-app-primary truncate">{prod.productTitle}</h4>

                {prod.notes && (
                  <p className="text-xs text-app-muted mt-0.5 line-clamp-1 italic">
                    "{prod.notes}"
                  </p>
                )}
              </div>
            </div>

            {/* Right: Commercial Facts vs Draft Promo Targets */}
            <div className="flex items-center justify-between sm:justify-end gap-5 pt-2 sm:pt-0 border-t sm:border-t-0 border-app-border/60">
              {/* Catalog MSRP */}
              <div className="text-right">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-app-muted">
                  Catalog MSRP
                </div>
                <div className="text-sm font-bold text-app-primary">
                  ${prod.catalogPriceUsd.toFixed(2)}
                </div>
              </div>

              {/* Proposed Promo Target */}
              <div className="text-right">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gold-600 dark:text-gold-400 flex items-center justify-end gap-1">
                  <Tag className="w-3 h-3" />
                  <span>Proposed Target</span>
                </div>
                {hasPromoTarget ? (
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="text-sm font-bold text-gold-600 dark:text-gold-400">
                      ${prod.targetPromoPrice?.toFixed(2)}
                    </span>
                    {prod.targetDiscountPercent !== null && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gold-500/15 text-gold-700 dark:text-gold-300">
                        -{prod.targetDiscountPercent}%
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-app-muted italic">Full MSRP</span>
                )}
              </div>

              {/* Remove Action */}
              {isEditable && onRemoveProduct && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${prod.productTitle} from campaign`}
                  disabled={isRemoving}
                  onClick={() => onRemoveProduct(prod.id)}
                  className="text-status-bad hover:bg-status-bad/10 h-8 w-8 p-0 shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
