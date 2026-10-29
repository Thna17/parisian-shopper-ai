import React, { useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import type { ReviewDeskDetail } from '../types/approvals.types.js';

interface ApproveDecisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (comment?: string) => Promise<void>;
  targetVersion: ReviewDeskDetail['targetVersion'];
  product: ReviewDeskDetail['productSnapshot'];
  isPending: boolean;
}

export const ApproveDecisionModal: React.FC<ApproveDecisionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  targetVersion,
  product,
  isPending,
}) => {
  const [comment, setComment] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onConfirm(comment.trim() ? comment.trim() : undefined);
    onClose();
  };

  return (
    <div
      data-testid="approve-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div
        data-testid="approve-decision-modal"
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2 text-emerald-400">
            <ShieldCheck className="h-5 w-5" />
            <h3 className="text-base font-semibold text-white">
              Approve Content Version {targetVersion.versionNumber}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:text-white hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 text-xs text-zinc-300">
          <div className="rounded-lg bg-black/40 p-3 border border-white/5 space-y-1">
            <div className="flex justify-between text-zinc-400">
              <span>Product:</span>
              <span className="text-white font-medium">
                {product.productName} ({product.sku})
              </span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Catalog MSRP Truth:</span>
              <span className="text-amber-400 font-semibold">
                ${product.priceUsd.toFixed(2)} USD
              </span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Target Version:</span>
              <span className="text-white font-mono">v{targetVersion.versionNumber}</span>
            </div>
          </div>

          <p className="text-zinc-400 leading-relaxed">
            By confirming, you record an authoritative Four-Eyes approval for exact version{' '}
            <strong className="text-white">v{targetVersion.versionNumber}</strong>. This content
            will transition to <strong>APPROVED</strong>.
          </p>
          <p className="text-[11px] text-zinc-500 italic">
            Note: This records your approval in the audit ledger and does not automatically publish
            to social platforms or Telegram.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              Reviewer Note / Approval Comment (Optional)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="e.g. Verified copy against French catalog MSRP and notes..."
              rows={3}
              maxLength={1000}
              className="w-full rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-white placeholder-zinc-500 focus:border-amber-400 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-lg border border-white/10 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 text-xs font-medium transition flex items-center gap-1.5"
            >
              {isPending ? 'Recording Approval...' : 'Confirm Approval'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
