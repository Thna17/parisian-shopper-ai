import React, { useState } from 'react';
import { Search, X, Check, Package, Sparkles, AlertCircle } from 'lucide-react';
import { Button } from '../../../components/ui/button.js';
import { Input } from '../../../components/ui/input.js';
import { Label } from '../../../components/ui/label.js';
import { Spinner } from '../../../components/ui/spinner.js';
import { useProducts } from '../../products/hooks/use-products.js';
import type { ProductSummary } from '../../products/types/product.types.js';
import type { AssociateProductInput } from '../types/campaign.types.js';

export interface CampaignProductPickerProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onAssociate: (input: AssociateProductInput) => Promise<void>;
  readonly existingSnapshotIds: readonly string[];
  readonly isSubmitting?: boolean;
}

export const CampaignProductPicker: React.FC<CampaignProductPickerProps> = ({
  isOpen,
  onClose,
  onAssociate,
  existingSnapshotIds,
  isSubmitting = false,
}) => {
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ProductSummary | null>(null);
  const [isHero, setIsHero] = useState(false);
  const [targetPromoPrice, setTargetPromoPrice] = useState<string>('');
  const [targetDiscountPercent, setTargetDiscountPercent] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const { data, isLoading } = useProducts({ search, limit: 10 });
  const products = data?.data ?? [];

  if (!isOpen) return null;

  const handleSelectProduct = (prod: ProductSummary) => {
    setSelectedProduct(prod);
    setFormError(null);
    setTargetPromoPrice('');
    setTargetDiscountPercent('');
  };

  const handleDiscountChange = (val: string) => {
    setTargetDiscountPercent(val);
    if (!selectedProduct) return;
    const discount = parseFloat(val);
    if (!isNaN(discount) && discount >= 0 && discount <= 100) {
      const msrp = selectedProduct.price.amount;
      const promo = msrp * (1 - discount / 100);
      setTargetPromoPrice(promo.toFixed(2));
    }
  };

  const handlePromoPriceChange = (val: string) => {
    setTargetPromoPrice(val);
    if (!selectedProduct) return;
    const promo = parseFloat(val);
    const msrp = selectedProduct.price.amount;
    if (!isNaN(promo) && promo >= 0 && msrp > 0) {
      const discount = ((msrp - promo) / msrp) * 100;
      setTargetDiscountPercent(discount > 0 ? discount.toFixed(1) : '0');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) {
      setFormError('Please select a product from the verified catalog.');
      return;
    }

    const promoPriceNum = targetPromoPrice.trim() ? parseFloat(targetPromoPrice) : null;
    const discountNum = targetDiscountPercent.trim() ? parseFloat(targetDiscountPercent) : null;

    if (promoPriceNum !== null && (isNaN(promoPriceNum) || promoPriceNum < 0)) {
      setFormError('Target promotional price must be a valid positive number.');
      return;
    }

    try {
      await onAssociate({
        productSnapshotId: selectedProduct.id,
        isHero,
        notes: notes.trim() || null,
        targetPromoPrice: promoPriceNum,
        targetDiscountPercent: discountNum,
      });
      // Reset state and close
      setSelectedProduct(null);
      setSearch('');
      setIsHero(false);
      setTargetPromoPrice('');
      setTargetDiscountPercent('');
      setNotes('');
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to associate product');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/60 backdrop-blur-sm"
    >
      <div className="bg-app-surface w-full max-w-2xl rounded-2xl border border-app-border shadow-elevated overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-app-border flex items-center justify-between">
          <div>
            <h3 id="modal-title" className="text-base font-bold text-app-primary">
              Associate Product from Verified Catalog
            </h3>
            <p className="text-xs text-app-muted mt-0.5">
              Select an authoritative product snapshot and establish optional promotional targets.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close product picker"
            className="p-1 rounded-lg text-app-muted hover:text-app-primary hover:bg-app-surface-subtle transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {formError && (
            <div className="p-3 rounded-lg bg-status-bad/10 border border-status-bad/20 flex items-center gap-2 text-xs text-status-bad">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Catalog Search */}
          <div>
            <Label className="text-xs font-semibold text-app-primary mb-1.5 block">
              Search Product Catalog
            </Label>
            <div className="relative">
              <Search className="w-4 h-4 text-app-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                type="search"
                placeholder="Search by SKU, product name, brand..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 w-full"
              />
            </div>
          </div>

          {/* Product Picker List */}
          <div className="space-y-2 max-h-56 overflow-y-auto border border-app-border rounded-xl p-2 bg-app-surface-subtle">
            {isLoading ? (
              <div className="p-6 text-center">
                <Spinner size="md" className="mx-auto mb-2 text-gold-500" />
                <span className="text-xs text-app-muted">
                  Loading verified product snapshots...
                </span>
              </div>
            ) : products.length === 0 ? (
              <div className="p-6 text-center text-xs text-app-muted">
                No verified products found matching "{search}".
              </div>
            ) : (
              products.map((prod) => {
                const isAlreadyAdded = existingSnapshotIds.includes(prod.id);
                const isSelected = selectedProduct?.id === prod.id;

                return (
                  <button
                    key={prod.id}
                    type="button"
                    disabled={isAlreadyAdded}
                    onClick={() => handleSelectProduct(prod)}
                    className={`w-full p-2.5 rounded-lg text-left flex items-center justify-between gap-3 transition-all ${
                      isSelected
                        ? 'bg-gold-500/15 border border-gold-500/40 text-app-primary'
                        : isAlreadyAdded
                          ? 'opacity-40 bg-app-surface/50 border border-transparent cursor-not-allowed'
                          : 'hover:bg-app-surface border border-transparent hover:border-app-border/70 text-app-primary'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-md bg-app-surface border border-app-border flex items-center justify-center shrink-0 overflow-hidden">
                        {prod.primaryImageUrl ? (
                          <img
                            src={prod.primaryImageUrl}
                            alt={prod.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Package className="w-4 h-4 text-app-muted" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate">{prod.title}</div>
                        <div className="text-[11px] text-app-muted flex items-center gap-2">
                          <span>{prod.brand}</span>
                          <span className="font-mono">({prod.sku})</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xs font-bold text-app-primary">
                        ${prod.price.amount.toFixed(2)}
                      </div>
                      {isAlreadyAdded ? (
                        <span className="text-[10px] font-semibold text-app-muted">Added</span>
                      ) : isSelected ? (
                        <span className="text-[10px] font-bold text-gold-600 dark:text-gold-400 flex items-center gap-1 justify-end">
                          <Check className="w-3 h-3" /> Selected
                        </span>
                      ) : (
                        <span className="text-[10px] text-gold-500">Select</span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Selected Product Configuration */}
          {selectedProduct && (
            <div className="p-4 rounded-xl border border-gold-500/30 bg-gold-500/5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gold-600 dark:text-gold-400">
                    Selected Product Configuration
                  </span>
                  <div className="text-sm font-bold text-app-primary">
                    {selectedProduct.title} (MSRP: ${selectedProduct.price.amount.toFixed(2)})
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isHero}
                    onChange={(e) => setIsHero(e.target.checked)}
                    className="rounded border-app-border text-gold-500 focus:ring-gold-500 w-4 h-4"
                  />
                  <span className="text-xs font-semibold text-app-primary flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-gold-500" />
                    Hero Product
                  </span>
                </label>
              </div>

              {/* Target Promotional Pricing Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-gold-500/20">
                <div>
                  <Label
                    htmlFor="targetPromoPrice"
                    className="text-xs font-semibold text-app-primary mb-1 block"
                  >
                    Proposed Promo Price ($ USD)
                  </Label>
                  <Input
                    id="targetPromoPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={`e.g. ${(selectedProduct.price.amount * 0.85).toFixed(2)}`}
                    value={targetPromoPrice}
                    onChange={(e) => handlePromoPriceChange(e.target.value)}
                  />
                  <span className="text-[10px] text-app-muted mt-1 block">
                    Marketing target for copywriting. MSRP is preserved.
                  </span>
                </div>

                <div>
                  <Label
                    htmlFor="targetDiscountPercent"
                    className="text-xs font-semibold text-app-primary mb-1 block"
                  >
                    Proposed Discount Target (%)
                  </Label>
                  <Input
                    id="targetDiscountPercent"
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    placeholder="e.g. 15.0"
                    value={targetDiscountPercent}
                    onChange={(e) => handleDiscountChange(e.target.value)}
                  />
                  <span className="text-[10px] text-app-muted mt-1 block">
                    Calculates proposed target promo price.
                  </span>
                </div>
              </div>

              {/* Campaign Notes */}
              <div>
                <Label
                  htmlFor="campaignNotes"
                  className="text-xs font-semibold text-app-primary mb-1 block"
                >
                  Campaign Merchandising Notes (Optional)
                </Label>
                <Input
                  id="campaignNotes"
                  type="text"
                  placeholder="e.g. Featured in Mother's Day hero banner"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-app-border bg-app-surface-subtle flex items-center justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="gold"
            disabled={!selectedProduct || isSubmitting}
            isLoading={isSubmitting}
            onClick={handleSubmit}
          >
            Associate to Campaign
          </Button>
        </div>
      </div>
    </div>
  );
};
