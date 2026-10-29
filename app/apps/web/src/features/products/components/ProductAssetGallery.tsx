import React, { useState } from 'react';
import { ImageOff, Package, Sparkles } from 'lucide-react';
import { Badge, type BadgeVariant } from '../../../components/ui/badge.js';
import type { ProductDetail } from '../types/product.types.js';

export interface ProductAssetGalleryProps {
  readonly product: ProductDetail;
}

export const ProductAssetGallery: React.FC<ProductAssetGalleryProps> = ({ product }) => {
  const images = product.images ?? [];
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [brokenImages, setBrokenImages] = useState<Record<number, boolean>>({});

  const activeImage = images[selectedIndex];
  const isSelectedBroken = Boolean(brokenImages[selectedIndex]);

  const handleImageError = (index: number) => {
    setBrokenImages((prev) => ({ ...prev, [index]: true }));
  };

  const getRightsBadge = (state?: string): { label: string; variant: BadgeVariant } => {
    switch (state?.toUpperCase()) {
      case 'VERIFIED':
        return { label: 'Rights Verified', variant: 'good' };
      case 'CATALOG_ONLY':
        return { label: 'Catalog Only', variant: 'warn' };
      case 'REJECTED':
      case 'EXPIRED':
        return { label: 'Rights Restricted', variant: 'bad' };
      default:
        return { label: 'Rights Pending', variant: 'neutral' };
    }
  };

  return (
    <div className="bg-app-surface border border-app-border rounded-xl p-6 shadow-subtle space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-app-muted">
          Product Packshots & Visual Assets
        </h3>
        {activeImage && (
          <Badge
            variant={getRightsBadge(activeImage.rightsState).variant}
            dot
            className="text-[10px]"
          >
            {getRightsBadge(activeImage.rightsState).label}
          </Badge>
        )}
      </div>

      {/* Main Image Frame */}
      <div className="relative w-full aspect-square bg-[#FDFBF7] dark:bg-[#1A222D] rounded-xl border border-app-border flex items-center justify-center p-8 overflow-hidden shadow-inner">
        {activeImage && !isSelectedBroken ? (
          <img
            src={activeImage.url}
            alt={activeImage.altText || product.title}
            onError={() => handleImageError(selectedIndex)}
            className="w-full h-full object-contain"
          />
        ) : (
          <div
            data-testid="detail-image-fallback"
            className="flex flex-col items-center justify-center text-app-muted/60"
          >
            <Package className="w-16 h-16 stroke-[1] text-app-muted/30 mb-2" />
            <span className="text-xs font-medium text-app-muted">
              {isSelectedBroken ? 'Image Preview Unavailable' : 'No Asset Registered'}
            </span>
            <span className="text-[10px] text-app-muted/70 mt-0.5">
              Asset rights policy enforced fail-closed
            </span>
          </div>
        )}

        {/* Hero Cutout Overlay Badge */}
        {activeImage?.isHeroCutout && (
          <div className="absolute bottom-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-app-surface/90 backdrop-blur-sm border border-app-border text-[11px] font-semibold text-[#9A7D45]">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Approved Studio Hero Cutout</span>
          </div>
        )}
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {images.map((img, idx) => {
            const isSelected = idx === selectedIndex;
            const isBroken = Boolean(brokenImages[idx]);

            return (
              <button
                key={idx}
                type="button"
                onClick={() => setSelectedIndex(idx)}
                className={`relative w-16 h-16 rounded-lg border p-1.5 bg-[#FDFBF7] dark:bg-[#1A222D] flex items-center justify-center transition-all select-none shrink-0 ${
                  isSelected
                    ? 'border-[#B59761] ring-2 ring-[#B59761]/30'
                    : 'border-app-border hover:border-app-muted/80 opacity-70 hover:opacity-100'
                }`}
              >
                {!isBroken ? (
                  <img
                    src={img.url}
                    alt=""
                    onError={() => handleImageError(idx)}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <ImageOff className="w-5 h-5 text-app-muted/40" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Registered Assets Audit */}
      {product.registeredAssets && product.registeredAssets.length > 0 && (
        <div className="pt-3 border-t border-app-border/60">
          <div className="text-[11px] font-semibold text-app-muted mb-2">
            Governance Registry: {product.registeredAssets.length} asset(s) linked
          </div>
          <div className="space-y-1.5">
            {product.registeredAssets.map((reg) => (
              <div
                key={reg.id}
                className="flex items-center justify-between p-2 rounded-lg bg-app-surface-subtle/50 text-xs border border-app-border/60"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-app-primary">{reg.role}</span>
                  {reg.rightsNotes && (
                    <span className="text-[11px] text-app-muted truncate max-w-xs">
                      {reg.rightsNotes}
                    </span>
                  )}
                </div>
                <Badge variant={getRightsBadge(reg.rightsState).variant} className="text-[10px]">
                  {reg.rightsState}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
