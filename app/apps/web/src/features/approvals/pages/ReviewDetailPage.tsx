import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  RefreshCw,
  Hash,
  Globe,
  Share2,
} from 'lucide-react';
import {
  useReviewDeskDetail,
  useApproveVersion,
  useRejectVersion,
} from '../hooks/use-approvals.js';
import { ReviewEligibilityBanner } from '../components/ReviewEligibilityBanner.js';
import { ProductTruthPanel } from '../components/ProductTruthPanel.js';
import { ValidationFindingsList } from '../components/ValidationFindingsList.js';
import { VersionComparisonPanel } from '../components/VersionComparisonPanel.js';
import { ReviewAuditTimeline } from '../components/ReviewAuditTimeline.js';
import { ApproveDecisionModal } from '../components/ApproveDecisionModal.js';
import { RejectDecisionModal } from '../components/RejectDecisionModal.js';

export const ReviewDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [selectedVersionId, setSelectedVersionId] = useState<string | undefined>();
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const {
    data: detail,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useReviewDeskDetail(id ?? '', selectedVersionId);

  const approveMutation = useApproveVersion();
  const rejectMutation = useRejectVersion();

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-zinc-500 space-y-3">
        <RefreshCw className="h-6 w-6 animate-spin text-amber-400" />
        <p className="text-xs">Loading review desk state...</p>
      </div>
    );
  }

  if (isError || !detail) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center space-y-3">
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-6">
          <p className="text-sm font-semibold text-rose-400">Failed to load content review desk</p>
          <p className="text-xs text-zinc-400 mt-1">
            The job may not exist or you lack permission to view it.
          </p>
          <div className="pt-4 flex justify-center gap-3">
            <Link
              to="/approvals"
              className="rounded-lg border border-white/10 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-white/5"
            >
              Back to Queue
            </Link>
            <button
              onClick={() => void refetch()}
              className="rounded-lg bg-amber-500 text-black px-4 py-2 text-xs font-medium hover:bg-amber-400"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const {
    job,
    productSnapshot,
    campaign,
    versions,
    targetVersion,
    validationResult,
    approvalEvents,
    eligibility,
  } = detail;

  const handleApprove = async (comment?: string) => {
    setActionError(null);
    try {
      await approveMutation.mutateAsync({
        jobId: job.id,
        payload: {
          versionId: targetVersion.id,
          comment,
        },
      });
      void refetch();
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ??
        (err as Error)?.message ??
        'Approval failed.';
      setActionError(errorMsg);
    }
  };

  const handleReject = async (reason: string) => {
    setActionError(null);
    try {
      await rejectMutation.mutateAsync({
        jobId: job.id,
        payload: {
          versionId: targetVersion.id,
          reason,
        },
      });
      void refetch();
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ??
        (err as Error)?.message ??
        'Rejection failed.';
      setActionError(errorMsg);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 py-6" data-testid="review-detail-page">
      {/* Top Breadcrumb & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <Link
            to="/approvals"
            className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-amber-400 mb-2 transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Review Queue
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-white tracking-tight">
              {productSnapshot.productName}
            </h1>
            <span
              className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${
                job.status === 'UNDER_REVIEW'
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  : job.status === 'APPROVED'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : job.status === 'REJECTED'
                      ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      : 'bg-zinc-800 text-zinc-300 border-white/10'
              }`}
            >
              {job.status}
            </span>
            <span className="font-mono text-xs text-zinc-400 bg-white/5 px-2 py-0.5 rounded">
              {productSnapshot.sku}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => void refetch()}
            disabled={isFetching}
            className="rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300 p-2 transition"
            title="Refresh state"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin text-amber-400' : ''}`} />
          </button>

          {/* Reject Button */}
          <button
            data-testid="reject-decision-button"
            onClick={() => setIsRejectOpen(true)}
            disabled={!eligibility.canReject}
            className="rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-40 text-rose-300 px-4 py-2 text-xs font-semibold transition flex items-center gap-1.5"
            title={
              !eligibility.canReject
                ? 'Job is not in reviewable state'
                : 'Reject version with reason'
            }
          >
            <ShieldAlert className="h-3.5 w-3.5 text-rose-400" />
            Reject Draft
          </button>

          {/* Approve Button */}
          <button
            data-testid="approve-decision-button"
            onClick={() => setIsApproveOpen(true)}
            disabled={!eligibility.canApprove}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white px-4 py-2 text-xs font-semibold transition shadow-md shadow-emerald-950 flex items-center gap-1.5"
            title={
              !eligibility.canApprove
                ? eligibility.ineligibilityReasons.join(', ') || 'Ineligible to approve'
                : 'Approve exact version'
            }
          >
            <ShieldCheck className="h-4 w-4" />
            Approve Version {targetVersion.versionNumber}
          </button>
        </div>
      </div>

      {actionError && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
          <strong>Decision Failed:</strong> {actionError}
        </div>
      )}

      {/* Four-Eyes Policy Eligibility Banner */}
      <ReviewEligibilityBanner eligibility={eligibility} />

      {/* Main Review Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Product Catalog Truth & Version Selector */}
        <div className="space-y-6 lg:col-span-1">
          {/* Version Selector Tabs */}
          {versions.length > 1 && (
            <div className="rounded-xl border border-white/10 bg-zinc-900/60 p-4 space-y-2">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                Version History ({versions.length} revisions)
              </span>
              <div className="flex gap-2 flex-wrap">
                {versions.map((ver) => (
                  <button
                    key={ver.id}
                    onClick={() => setSelectedVersionId(ver.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono transition ${
                      targetVersion.id === ver.id
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                        : 'bg-white/5 text-zinc-400 hover:bg-white/10'
                    }`}
                  >
                    v{ver.versionNumber}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Immutable Product Catalog Truth */}
          <ProductTruthPanel product={productSnapshot} campaign={campaign} />

          {/* Factual Consistency Gate Findings */}
          <ValidationFindingsList validationResult={validationResult} />
        </div>

        {/* Right Column: Submitted Copy Preview, Diff, and Audit Timeline */}
        <div className="space-y-6 lg:col-span-2">
          {/* Target Version Content Preview */}
          <div
            data-testid="target-version-preview"
            className="rounded-2xl border border-white/10 bg-zinc-900/80 p-6 space-y-5 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-white">
                  Target Copy Draft (Version {targetVersion.versionNumber})
                </h2>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <span className="font-mono bg-white/5 px-2 py-0.5 rounded">
                  {job.platform} • {job.language}
                </span>
              </div>
            </div>

            {/* Headline */}
            <div className="space-y-1">
              <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                Headline
              </span>
              <p
                data-testid="target-version-headline"
                className="text-lg font-semibold text-white leading-snug"
              >
                {targetVersion.headline}
              </p>
            </div>

            {/* Captions */}
            {targetVersion.englishCaption && (
              <div className="space-y-1">
                <span className="text-xs font-semibold text-zinc-400 flex items-center gap-1">
                  <Globe className="h-3 w-3" /> English Caption
                </span>
                <div className="rounded-lg bg-black/40 p-4 border border-white/5 text-xs text-zinc-200 whitespace-pre-wrap leading-relaxed">
                  {targetVersion.englishCaption}
                </div>
              </div>
            )}

            {targetVersion.khmerCaption && (
              <div className="space-y-1">
                <span className="text-xs font-semibold text-zinc-400 flex items-center gap-1">
                  <Globe className="h-3 w-3" /> Khmer Caption
                </span>
                <div className="rounded-lg bg-black/40 p-4 border border-white/5 text-xs text-zinc-200 whitespace-pre-wrap leading-relaxed font-sans">
                  {targetVersion.khmerCaption}
                </div>
              </div>
            )}

            {/* CTA & Hashtags */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              {targetVersion.cta && (
                <div className="rounded-lg bg-white/5 p-3 border border-white/5 space-y-1">
                  <span className="text-[10px] uppercase font-semibold text-zinc-500">
                    Call To Action
                  </span>
                  <p className="text-xs font-medium text-amber-300">{targetVersion.cta}</p>
                </div>
              )}
              {targetVersion.hashtags && targetVersion.hashtags.length > 0 && (
                <div className="rounded-lg bg-white/5 p-3 border border-white/5 space-y-1">
                  <span className="text-[10px] uppercase font-semibold text-zinc-500 flex items-center gap-1">
                    <Hash className="h-2.5 w-2.5" /> Hashtags
                  </span>
                  <p className="text-xs text-zinc-400">{targetVersion.hashtags.join(' ')}</p>
                </div>
              )}
            </div>

            {/* Facts Used Verification Checklist */}
            {targetVersion.factsUsed && targetVersion.factsUsed.length > 0 && (
              <div className="rounded-lg bg-black/30 p-3 border border-white/5 space-y-1.5">
                <span className="text-[10px] uppercase font-semibold text-zinc-400 flex items-center gap-1">
                  <Share2 className="h-2.5 w-2.5 text-amber-400" /> Facts Referenced in AI Copy
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {targetVersion.factsUsed.map((fact, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded text-[11px] bg-white/5 border border-white/10 text-zinc-300"
                    >
                      {fact}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Version Comparison Diff if v > 1 */}
          <VersionComparisonPanel currentVersion={targetVersion} allVersions={versions} />

          {/* Audit Timeline */}
          <ReviewAuditTimeline versions={versions} approvalEvents={approvalEvents} />
        </div>
      </div>

      {/* Decision Modals */}
      <ApproveDecisionModal
        isOpen={isApproveOpen}
        onClose={() => setIsApproveOpen(false)}
        onConfirm={handleApprove}
        targetVersion={targetVersion}
        product={productSnapshot}
        isPending={approveMutation.isPending}
      />

      <RejectDecisionModal
        isOpen={isRejectOpen}
        onClose={() => setIsRejectOpen(false)}
        onConfirm={handleReject}
        targetVersion={targetVersion}
        isPending={rejectMutation.isPending}
      />
    </div>
  );
};
