import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Megaphone, Package, RefreshCw, ShieldCheck } from 'lucide-react';

import {
  useContentJobDetail,
  useReviseContent,
  useSubmitContentForReview,
} from '../hooks/use-content.js';
import type { ContentVersion } from '../types/content.types.js';
import { ContentJobStatusBadge } from '../components/ContentJobStatusBadge.js';
import { GenerationProgressCard } from '../components/GenerationProgressCard.js';
import { ContentPreviewPanel } from '../components/ContentPreviewPanel.js';
import { ValidationFindingsPanel } from '../components/ValidationFindingsPanel.js';
import { ContentRevisionEditor } from '../components/ContentRevisionEditor.js';
import { ContentVersionHistory } from '../components/ContentVersionHistory.js';
import { SubmitForReviewPanel } from '../components/SubmitForReviewPanel.js';

export function ContentJobDetailPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, refetch, isFetching } = useContentJobDetail(id);

  const [isEditing, setIsEditing] = useState(false);
  const [selectedVersionOverride, setSelectedVersionOverride] = useState<ContentVersion | null>(
    null,
  );
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  const reviseMutation = useReviseContent(id ?? '');
  const submitMutation = useSubmitContentForReview(id ?? '');

  if (isLoading) {
    return (
      <div className="py-24 text-center space-y-3">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-600 dark:text-amber-400" />
        <p className="text-xs text-neutral-500">Loading AI Content Studio Job details...</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          Job Not Found
        </h2>
        <p className="text-xs text-neutral-500">
          The requested content generation job could not be located or you lack permissions to view
          it.
        </p>
        <Link
          to="/content"
          className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-900 dark:bg-amber-600 text-white text-xs font-medium rounded-xl"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Content Studio
        </Link>
      </div>
    );
  }

  const { job, product, campaign, attempts, versions, currentVersion, latestValidationResult } =
    data;

  // Active version to preview or edit
  const activeVersion =
    selectedVersionOverride ??
    currentVersion ??
    (versions.length > 0 ? versions[versions.length - 1] : null);

  const isLatestVersion =
    !selectedVersionOverride ||
    (currentVersion !== null &&
      currentVersion !== undefined &&
      selectedVersionOverride.id === currentVersion.id);

  const canEdit =
    (job.status === 'DRAFT' || job.status === 'REVISION_REQUESTED') && Boolean(isLatestVersion);

  const handleManualRevise = async (
    field: 'headline' | 'englishCaption' | 'khmerCaption' | 'cta',
    newValue: string,
  ): Promise<void> => {
    if (!activeVersion) return;
    try {
      const res = await reviseMutation.mutateAsync({
        currentVersionId: activeVersion.id,
        field,
        newValue,
      });
      setIsEditing(false);
      setSelectedVersionOverride(res.version);
      setActionSuccessMsg(
        `Saved revision as Version ${res.version.versionNumber} with re-evaluated compliance.`,
      );
      setTimeout(() => setActionSuccessMsg(null), 5000);
    } catch {
      // Handled by mutation error state
    }
  };

  const handleSubmitForReview = async (): Promise<void> => {
    if (!currentVersion) return;
    try {
      await submitMutation.mutateAsync(currentVersion.id);
      setActionSuccessMsg('Submitted version for independent review.');
      setTimeout(() => setActionSuccessMsg(null), 5000);
    } catch {
      // Handled by mutation error state
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Navigation & Status Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <Link
            to="/content"
            className="p-2 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-serif font-semibold text-neutral-900 dark:text-neutral-100">
                Job #{job.id.slice(0, 8)}
              </h1>
              <ContentJobStatusBadge status={job.status} />
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-neutral-500">
              <span className="font-medium text-neutral-700 dark:text-neutral-300">
                {job.contentType}
              </span>
              <span>•</span>
              <span>{job.language}</span>
              <span>•</span>
              <span>{job.platform}</span>
              {campaign && (
                <>
                  <span>•</span>
                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                    Campaign: {campaign.name}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="p-2 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            title="Refresh job status"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Action Notification Banner */}
      {actionSuccessMsg && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2.5 shadow-sm">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {/* Generation Worker Progress (When Queued/Generating/Failed) */}
      <GenerationProgressCard status={job.status} attempts={attempts} />

      {/* Main Studio Layout: 2-Column (Preview & Editor + Truth Reference Sidebar) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Preview / Editor & Validation (2 Cols) */}
        <div className="lg:col-span-2 space-y-6">
          {activeVersion ? (
            <>
              {isEditing ? (
                <ContentRevisionEditor
                  version={activeVersion}
                  onSave={handleManualRevise}
                  onCancel={() => setIsEditing(false)}
                  isSaving={reviseMutation.isPending}
                />
              ) : (
                <ContentPreviewPanel
                  version={activeVersion}
                  onStartEditing={() => setIsEditing(true)}
                  canEdit={canEdit}
                />
              )}

              {/* Factual Compliance Findings */}
              <ValidationFindingsPanel validationResult={latestValidationResult} />

              {/* Four-Eyes Submission Panel */}
              <SubmitForReviewPanel
                status={job.status}
                validationResult={latestValidationResult}
                onSubmit={handleSubmitForReview}
                isSubmitting={submitMutation.isPending}
                canSubmit={canEdit}
              />

              {/* Version History Browser */}
              <ContentVersionHistory
                versions={versions}
                selectedVersionId={activeVersion.id}
                onSelectVersion={(v) => {
                  setSelectedVersionOverride(v);
                  setIsEditing(false);
                }}
              />
            </>
          ) : (
            job.status !== 'GENERATING' &&
            job.status !== 'REQUESTED' && (
              <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-8 text-center text-xs text-neutral-500">
                No generated copy versions available for this job yet.
              </div>
            )
          )}
        </div>

        {/* Right Column: Verified Product Snapshot Facts (Commercial Truth Reference) */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <Package className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Verified Product Facts
              </h2>
            </div>

            {product ? (
              <div className="space-y-3.5 text-xs">
                <div>
                  <span className="text-neutral-400 font-medium">Product Name:</span>
                  <p className="font-semibold text-neutral-900 dark:text-neutral-100 mt-0.5">
                    {product.title}
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-neutral-400 font-medium">SKU:</span>
                    <p className="font-mono text-neutral-700 dark:text-neutral-300 mt-0.5">
                      {product.sku}
                    </p>
                  </div>
                  <div>
                    <span className="text-neutral-400 font-medium">Verified MSRP:</span>
                    <p className="font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                      ${product.priceUsd.toFixed(2)}
                    </p>
                  </div>
                </div>

                <div>
                  <span className="text-neutral-400 font-medium">Brand & Lineage:</span>
                  <p className="text-neutral-700 dark:text-neutral-300 mt-0.5">{product.brand}</p>
                </div>

                {product.category && (
                  <div>
                    <span className="text-neutral-400 font-medium">Category:</span>
                    <p className="text-neutral-700 dark:text-neutral-300 mt-0.5">
                      {product.category}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-neutral-500">Product details not found.</div>
            )}

            <div className="p-3 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 rounded-xl flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
              <span>
                All generated copy and manual edits are rigorously validated against these immutable
                catalog facts.
              </span>
            </div>
          </div>

          {/* Campaign Context Card (if associated) */}
          {campaign && (
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center gap-2 pb-3 border-b border-neutral-100 dark:border-neutral-800">
                <Megaphone className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  Associated Campaign
                </h3>
              </div>

              <div className="text-xs space-y-2">
                <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                  [{campaign.code}] {campaign.name}
                </p>
                <div className="flex items-center gap-2 text-neutral-500">
                  <span>Status: {campaign.status}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
