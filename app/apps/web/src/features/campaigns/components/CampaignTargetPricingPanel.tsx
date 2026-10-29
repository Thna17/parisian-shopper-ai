import React from 'react';
import { ShieldCheck, Tag, Info } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '../../../components/ui/card.js';
import type { CampaignProduct } from '../types/campaign.types.js';

export interface CampaignTargetPricingPanelProps {
  readonly products: readonly CampaignProduct[];
}

export const CampaignTargetPricingPanel: React.FC<CampaignTargetPricingPanelProps> = ({
  products,
}) => {
  const totalCatalogMSRP = products.reduce((acc, p) => acc + p.catalogPriceUsd, 0);
  const productsWithPromoTarget = products.filter(
    (p) => p.targetPromoPrice !== null && p.targetPromoPrice > 0,
  );
  const totalProposedPromo = products.reduce((acc, p) => {
    return acc + (p.targetPromoPrice !== null ? p.targetPromoPrice : p.catalogPriceUsd);
  }, 0);

  const averageTargetDiscount =
    productsWithPromoTarget.length > 0
      ? (
          productsWithPromoTarget.reduce((acc, p) => acc + (p.targetDiscountPercent ?? 0), 0) /
          productsWithPromoTarget.length
        ).toFixed(1)
      : null;

  return (
    <Card elevation="subtle" className="mb-6">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-gold-500" />
          <CardTitle className="text-sm font-bold text-app-primary">
            Commercial Integrity & Target Pricing
          </CardTitle>
        </div>
        <span className="text-xs text-app-muted font-medium">
          {products.length} {products.length === 1 ? 'Associated Product' : 'Associated Products'}
        </span>
      </CardHeader>

      <div className="p-5 space-y-4">
        {/* Authoritative Commercial Integrity Invariant Banner */}
        <div className="p-3.5 rounded-lg bg-gold-500/10 border border-gold-500/25 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-gold-600 dark:text-gold-400 shrink-0 mt-0.5" />
          <div className="text-xs text-app-primary space-y-1">
            <div className="font-semibold text-gold-700 dark:text-gold-300">
              Authoritative Commercial Integrity Invariant
            </div>
            <p className="text-app-muted leading-relaxed">
              Product baseline MSRP (<code className="font-mono text-[11px]">$USD</code>) is an
              immutable verified catalog fact. All promotional prices (
              <code className="font-mono text-[11px]">targetPromoPrice</code>) and discount
              percentages are strictly marketing targets for editorial copy generation and never
              mutate the authoritative product snapshot.
            </p>
          </div>
        </div>

        {/* Pricing Summary Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-lg bg-app-surface-subtle border border-app-border/80">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-app-muted">
              Catalog Total MSRP
            </div>
            <div className="text-xl font-bold text-app-primary mt-1">
              ${totalCatalogMSRP.toFixed(2)}
            </div>
            <div className="text-[10px] text-app-muted mt-0.5">Authoritative snapshot sum</div>
          </div>

          <div className="p-3.5 rounded-lg bg-app-surface-subtle border border-app-border/80">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-app-muted">
              Proposed Target Total
            </div>
            <div className="text-xl font-bold text-gold-600 dark:text-gold-400 mt-1">
              ${totalProposedPromo.toFixed(2)}
            </div>
            <div className="text-[10px] text-app-muted mt-0.5">
              {productsWithPromoTarget.length} of {products.length} products with draft targets
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-app-surface-subtle border border-app-border/80">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-app-muted">
              Avg Target Discount
            </div>
            <div className="text-xl font-bold text-app-primary mt-1">
              {averageTargetDiscount ? `${averageTargetDiscount}%` : 'None proposed'}
            </div>
            <div className="text-[10px] text-app-muted mt-0.5">Marketing copy planning only</div>
          </div>
        </div>

        {productsWithPromoTarget.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-app-muted pt-1">
            <Info className="w-3.5 h-3.5 shrink-0" />
            <span>
              Proposed discounts will be passed into AI creative generation prompts with verified
              MSRP baseline constraints.
            </span>
          </div>
        )}
      </div>
    </Card>
  );
};
