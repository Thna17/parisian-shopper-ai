import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Shield, Search, RefreshCw, CheckCircle, Clock } from 'lucide-react';
import { usePendingReviews } from '../hooks/use-approvals.js';
import { ReviewQueueCard } from '../components/ReviewQueueCard.js';

export const ReviewQueuePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const [searchInput, setSearchInput] = useState(search);

  const { data, isLoading, isError, refetch, isFetching } = usePendingReviews({
    search: search ? search : undefined,
  });

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams(searchParams);
    if (searchInput.trim()) {
      next.set('search', searchInput.trim());
    } else {
      next.delete('search');
    }
    setSearchParams(next);
  };

  const items = data?.items ?? [];
  const eligibleCount = items.filter((i) => i.isEligibleToApprove).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 py-6" data-testid="review-queue-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <div className="flex items-center gap-2 text-amber-400 mb-1">
            <Shield className="h-5 w-5" />
            <span className="text-xs font-semibold tracking-wider uppercase">
              Quality & Commercial Governance
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Four-Eyes Review Desk</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Independent verification of AI copy against official product MSRP and brand facts.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/approvals/history"
            className="rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-medium text-zinc-300 px-4 py-2 transition flex items-center gap-1.5"
          >
            <Clock className="h-3.5 w-3.5 text-zinc-400" />
            Decision History
          </Link>
          <button
            onClick={() => void refetch()}
            disabled={isFetching}
            className="rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300 p-2 transition"
            title="Refresh review queue"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin text-amber-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Navigation Tabs & Metrics */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 border-b border-white/10 sm:border-0 pb-2 sm:pb-0">
          <span className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300">
            Pending Queue ({data?.total ?? 0})
          </span>
          <Link
            to="/approvals/history"
            className="text-xs font-medium px-3 py-1.5 rounded-lg text-zinc-400 hover:text-white transition"
          >
            Historical Decisions
          </Link>
        </div>

        {items.length > 0 && (
          <div className="flex items-center gap-3 text-xs text-zinc-400">
            <span className="flex items-center gap-1 text-emerald-400">
              <CheckCircle className="h-3.5 w-3.5" />
              <strong>{eligibleCount}</strong> eligible for your decision
            </span>
          </div>
        )}
      </div>

      {/* Search & Filter Bar */}
      <form onSubmit={handleSearchSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search pending reviews by SKU, product name, or campaign..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-white/10 bg-zinc-900/60 text-xs text-white placeholder-zinc-500 focus:border-amber-400 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-white/10 hover:bg-white/15 px-4 py-2 text-xs font-medium text-white transition"
        >
          Search
        </button>
      </form>

      {/* Content Queue List */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-12 text-zinc-500 space-y-3">
          <RefreshCw className="h-6 w-6 animate-spin text-amber-400" />
          <p className="text-xs">Loading review desk queue...</p>
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-6 text-center space-y-2">
          <p className="text-sm font-semibold text-rose-400">Failed to load review queue</p>
          <button
            onClick={() => void refetch()}
            className="text-xs text-zinc-300 underline hover:text-white"
          >
            Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <div
          data-testid="review-queue-empty"
          className="rounded-2xl border border-white/10 bg-zinc-900/30 p-12 text-center space-y-3"
        >
          <Shield className="h-10 w-10 text-zinc-600 mx-auto" />
          <h3 className="text-base font-semibold text-zinc-200">Review Queue Clear</h3>
          <p className="text-xs text-zinc-400 max-w-md mx-auto">
            {search
              ? `No pending reviews matching "${search}".`
              : 'There are currently no content items awaiting Four-Eyes review. All submitted drafts have been processed.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4" data-testid="review-queue-list">
          {items.map((item) => (
            <ReviewQueueCard key={item.jobId} item={item} />
          ))}
        </div>
      )}
    </div>
  );
};
