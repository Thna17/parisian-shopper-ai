import React, { useState } from 'react';
import { ShieldAlert, X, AlertTriangle } from 'lucide-react';
import type { ReviewDeskDetail } from '../types/approvals.types.js';

interface RejectDecisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
  targetVersion: ReviewDeskDetail['targetVersion'];
  isPending: boolean;
}

export const RejectDecisionModal: React.FC<RejectDecisionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  targetVersion,
  isPending,
}) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 3) {
      setError('Rejection reason must be at least 3 characters long.');
      return;
    }
    setError(null);
    await onConfirm(reason.trim());
    onClose();
  };

  return (
    <div
      data-testid="reject-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div
        data-testid="reject-decision-modal"
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2 text-rose-400">
            <ShieldAlert className="h-5 w-5" />
            <h3 className="text-base font-semibold text-white">
              Reject Content Version {targetVersion.versionNumber}
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
          <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-rose-200 flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
            <p>
              Rejecting this version will update the content job status to <strong>REJECTED</strong>
              . A mandatory reason is required so the creator can address feedback.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-zinc-300">
                Mandatory Rejection Reason <span className="text-rose-400">*</span>
              </label>
              <span className="text-[10px] text-zinc-500">{reason.length}/1000 characters</span>
            </div>
            <textarea
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error && e.target.value.trim().length >= 3) setError(null);
              }}
              placeholder="e.g. Headline claims 50% discount which contradicts catalog MSRP. Please align tone with luxury fragrance guidelines."
              rows={4}
              maxLength={1000}
              required
              className="w-full rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-white placeholder-zinc-500 focus:border-rose-400 focus:outline-none"
            />
            {error && <p className="text-xs text-rose-400 mt-1">{error}</p>}
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
              disabled={isPending || reason.trim().length < 3}
              className="rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white px-5 py-2 text-xs font-medium transition flex items-center gap-1.5"
            >
              {isPending ? 'Recording Rejection...' : 'Confirm Rejection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
