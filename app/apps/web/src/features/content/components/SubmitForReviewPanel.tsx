import React from 'react';
import { AlertCircle, CheckCircle, Clock, Loader2, Send } from 'lucide-react';
import type { ContentJobStatus, ValidationResult } from '../types/content.types.js';

interface SubmitForReviewPanelProps {
  status: ContentJobStatus;
  validationResult: ValidationResult | null | undefined;
  onSubmit: () => Promise<void>;
  isSubmitting: boolean;
  canSubmit?: boolean;
}

export function SubmitForReviewPanel({
  status,
  validationResult,
  onSubmit,
  isSubmitting,
  canSubmit = true,
}: SubmitForReviewPanelProps): React.JSX.Element {
  const hasBlockingFindings =
    (validationResult?.blockingCount ?? 0) > 0 ||
    validationResult?.status === 'BLOCKED' ||
    validationResult?.status === 'FAILED';

  const isEligibleForReview =
    (status === 'DRAFT' || status === 'REVISION_REQUESTED') && !hasBlockingFindings;

  if (status === 'UNDER_REVIEW') {
    return (
      <div className="bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/60 rounded-2xl p-5 mb-6">
        <div className="flex items-start gap-3.5">
          <Clock className="w-5 h-5 text-purple-600 dark:text-purple-400 mt-0.5 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-purple-900 dark:text-purple-100">
              Submitted for Independent Four-Eyes Review
            </h3>
            <p className="text-xs text-purple-700 dark:text-purple-300/80 mt-1">
              This content version has been locked and submitted for independent human compliance
              and merchandising sign-off. You will be notified once a decision is recorded.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'APPROVED') {
    return (
      <div className="bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl p-5 mb-6">
        <div className="flex items-start gap-3.5">
          <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
              Content Version Approved
            </h3>
            <p className="text-xs text-emerald-700 dark:text-emerald-300/80 mt-1">
              Independent sign-off complete. This version is certified factually accurate and
              brand-compliant.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status !== 'DRAFT' && status !== 'REVISION_REQUESTED') {
    return <></>;
  }

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 rounded-2xl p-6 shadow-sm mb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Submit for Four-Eyes Review
          </h3>
          <p className="text-xs text-neutral-500 mt-1 max-w-lg">
            Submitting locks this exact content version and hands it over to an independent
            reviewer. Content with unresolved blocking errors cannot be submitted.
          </p>

          {hasBlockingFindings && (
            <div className="mt-3 flex items-center gap-2 text-xs text-red-600 dark:text-red-400 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Resolve all blocking factual errors above before submitting for review.</span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => void onSubmit()}
          disabled={!isEligibleForReview || isSubmitting || !canSubmit}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 dark:bg-amber-600 dark:hover:bg-amber-700 rounded-xl shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Submit for Review
            </>
          )}
        </button>
      </div>
    </div>
  );
}
