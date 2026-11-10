import React from 'react';
import { Database, DollarSign, Tag, ExternalLink } from 'lucide-react';
import type { ReviewDeskDetail } from '../types/approvals.types.js';

interface ProductTruthPanelProps {
  product: ReviewDeskDetail['productSnapshot'];
  campaign?: ReviewDeskDetail['campaign'];
}

export const ProductTruthPanel: React.FC<ProductTruthPanelProps> = ({ product, campaign }) => {
  return (
    <div
      data-testid="product-truth-panel"
      className="rounded-xl border border-amber-200 bg-amber-50 p-5 space-y-4"
    >
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-amber-400" />
          <h3 className="text-xs font-semibold tracking-wider text-amber-900 uppercase">
            Product Catalog Truth (Immutable Reference)
          </h3>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-amber-300 text-amber-950 text-xs font-medium">
          <DollarSign className="h-3.5 w-3.5 text-amber-400" />
          <span>MSRP: ${product.priceUsd.toFixed(2)} USD</span>
        </div>
      </div>

      <div className="flex gap-4 items-start">
        {product.imageUrl && (
          <img
            src={product.imageUrl}
            alt={product.productName}
            className="w-20 h-20 rounded-lg object-cover border border-white/10 shrink-0 bg-white/5"
          />
        )}
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-zinc-700 bg-white px-2 py-0.5 rounded">
              {product.sku}
            </span>
            <span className="text-xs text-zinc-700">{product.brand}</span>
            {product.category && (
              <span className="text-xs text-zinc-500 uppercase tracking-wider">
                • {product.category}
              </span>
            )}
          </div>
          <h4 className="text-base font-medium text-zinc-950">{product.productName}</h4>
          {product.description && (
            <p className="text-xs text-zinc-700 line-clamp-2 leading-relaxed">
              {product.description}
            </p>
          )}
        </div>
      </div>

      {product.fragranceNotes && (
        <div className="rounded-lg bg-white p-3 border border-amber-200 grid grid-cols-3 gap-2 text-xs">
          <div>
            <span className="text-zinc-500 block text-[10px] uppercase tracking-wider">
              Top Notes
            </span>
            <span className="text-zinc-800">{product.fragranceNotes.top.join(', ')}</span>
          </div>
          <div>
            <span className="text-zinc-500 block text-[10px] uppercase tracking-wider">
              Heart Notes
            </span>
            <span className="text-zinc-800">{product.fragranceNotes.heart.join(', ')}</span>
          </div>
          <div>
            <span className="text-zinc-500 block text-[10px] uppercase tracking-wider">
              Base Notes
            </span>
            <span className="text-zinc-800">{product.fragranceNotes.base.join(', ')}</span>
          </div>
        </div>
      )}

      {campaign && (
        <div className="flex items-center justify-between text-xs pt-2 border-t border-amber-200 text-zinc-700">
          <div className="flex items-center gap-1.5">
            <Tag className="h-3.5 w-3.5 text-zinc-500" />
            <span>
              Campaign: <strong className="text-zinc-900">{campaign.name}</strong> ({campaign.code})
            </span>
          </div>
          {product.productUrl && (
            <a
              href={product.productUrl}
              target="_blank"
              rel="noreferrer"
              className="text-amber-400/80 hover:text-amber-300 flex items-center gap-1"
            >
              Catalog Link <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
};
