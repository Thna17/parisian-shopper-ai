import React from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Tag,
  ArrowRight,
  Clock,
  User,
} from 'lucide-react';
import type { ReviewQueueItem } from '../types/approvals.types.js';

interface ReviewQueueCardProps {
  item: ReviewQueueItem;
}

export const ReviewQueueCard: React.FC<ReviewQueueCardProps> = ({ item }) => {
  const isPending = item.jobStatus === 'UNDER_REVIEW';
  const isApproved = item.jobStatus === 'APPROVED';
  const isRejected = item.jobStatus === 'REJECTED';

  return (
    <div
      data-testid={`review-queue-card-${item.jobId}`}
      className="group relative rounded-xl border border-white/10 bg-zinc-900/60 p-5 transition-all hover:border-amber-500/30 hover:bg-zinc-900/90 shadow-lg"
    >
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
        {/* Left: Product & Version Info */}
        <div className="flex items-start gap-4 flex-1">
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={item.productName}
              className="h-16 w-16 rounded-lg object-cover border border-white/10 bg-white/5 shrink-0"
            />
          ) : (
            <div className="h-16 w-16 rounded-lg border border-white/10 bg-white/5 flex items-center justify-center shrink-0 text-zinc-500 text-xs">
              No Image
            </div>
          )}

          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-zinc-400 bg-white/5 px-2 py-0.5 rounded">
                {item.sku}
              </span>
              <span className="text-xs text-zinc-400">{item.brand}</span>
              <span className="text-xs font-semibold text-amber-400/90">
                ${item.priceUsd.toFixed(2)} MSRP
              </span>
              {item.campaignName && (
                <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400 bg-white/5 px-2 py-0.5 rounded-full">
                  <Tag className="h-3 w-3 text-zinc-500" />
                  {item.campaignName}
                </span>
              )}
            </div>

            <h3 className="text-base font-semibold text-white truncate">{item.productName}</h3>

            <p className="text-xs text-zinc-300 italic line-clamp-1">"{item.headline}"</p>

            <div className="flex items-center gap-4 text-xs text-zinc-400 pt-1">
              <span className="flex items-center gap-1">
                <User className="h-3 w-3 text-zinc-500" />
                Requested by:{' '}
                <strong className="text-zinc-300">{item.requesterDisplayName ?? 'Employee'}</strong>
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-zinc-500" />
                {new Date(item.submittedAt).toLocaleDateString([], {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Version, Status & Eligibility Badges */}
        <div className="flex flex-col sm:items-end justify-between gap-3 w-full sm:w-auto shrink-0 border-t sm:border-t-0 pt-3 sm:pt-0 border-white/5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 text-xs font-mono rounded bg-white/5 border border-white/10 text-zinc-300">
              v{item.targetVersionNumber}
            </span>

            {/* Validation Badge */}
            <span
              className={`px-2.5 py-0.5 text-xs rounded-full border flex items-center gap-1 ${
                item.validationStatus === 'PASSED'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : item.validationStatus === 'PASSED_WITH_WARNINGS'
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
              }`}
            >
              {item.validationStatus === 'PASSED' ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <XCircle className="h-3 w-3" />
              )}
              {item.validationStatus}
            </span>

            {/* Eligibility Badge */}
            {isPending && (
              <span
                data-testid={`eligibility-badge-${item.jobId}`}
                className={`px-2.5 py-0.5 text-xs rounded-full border flex items-center gap-1 font-medium ${
                  item.isEligibleToApprove
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                    : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                }`}
              >
                {item.isEligibleToApprove ? (
                  <>
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                    Eligible Reviewer
                  </>
                ) : (
                  <>
                    <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
                    {item.ineligibilityReasons.includes('SELF_REQUESTED')
                      ? 'Self-Requested'
                      : 'Ineligible'}
                  </>
                )}
              </span>
            )}

            {isApproved && (
              <span className="px-2.5 py-0.5 text-xs rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-medium">
                Approved
              </span>
            )}

            {isRejected && (
              <span className="px-2.5 py-0.5 text-xs rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 font-medium">
                Rejected
              </span>
            )}
          </div>

          <Link
            to={`/approvals/${item.jobId}`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400 hover:text-amber-300 transition"
          >
            Open Review Desk{' '}
            <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </div>
  );
};
