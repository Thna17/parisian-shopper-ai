import React from 'react';
import { ShieldCheck, ShieldAlert, AlertTriangle, UserX, Lock } from 'lucide-react';
import type { ReviewDeskDetail } from '../types/approvals.types.js';

interface ReviewEligibilityBannerProps {
  eligibility: ReviewDeskDetail['eligibility'];
  requesterDisplayName?: string;
}

export const ReviewEligibilityBanner: React.FC<ReviewEligibilityBannerProps> = ({
  eligibility,
  requesterDisplayName,
}) => {
  const {
    canApprove,
    selfRequested,
    selfAuthored,
    missingPermission,
    hasBlockingFindings,
    notUnderReview,
    isStaleVersion,
  } = eligibility;

  if (canApprove) {
    return (
      <div
        data-testid="eligibility-banner-eligible"
        className="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-200"
      >
        <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-400 mt-0.5" />
        <div>
          <h4 className="text-sm font-semibold text-emerald-300">Four-Eyes Eligible Reviewer</h4>
          <p className="text-xs text-emerald-300/80 mt-0.5">
            You are independent from the job requester{' '}
            {requesterDisplayName ? `(${requesterDisplayName})` : ''} and revision authors. You are
            authorized to approve or reject this exact version.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="eligibility-banner-ineligible"
      className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200"
    >
      <ShieldAlert className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
      <div className="space-y-1.5 flex-1">
        <h4 className="text-sm font-semibold text-amber-300">
          Four-Eyes Approval Policy Restriction
        </h4>
        <ul className="text-xs text-amber-300/90 space-y-1">
          {selfRequested && (
            <li className="flex items-center gap-1.5">
              <UserX className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span>
                <strong>Self-Approval Prohibited:</strong> You requested this content job. An
                independent reviewer must approve it.
              </span>
            </li>
          )}
          {selfAuthored && !selfRequested && (
            <li className="flex items-center gap-1.5">
              <UserX className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span>
                <strong>Revision Author:</strong> You authored this content revision. An independent
                reviewer must approve it.
              </span>
            </li>
          )}
          {missingPermission && (
            <li className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span>
                <strong>Missing Permission:</strong> You need the{' '}
                <code className="bg-black/30 px-1 py-0.5 rounded">APPROVE_CONTENT</code> permission.
              </span>
            </li>
          )}
          {hasBlockingFindings && (
            <li className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
              <span>
                <strong>Blocking Validation Errors:</strong> Content version has factual mismatches
                that block approval.
              </span>
            </li>
          )}
          {isStaleVersion && (
            <li className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span>
                <strong>Stale Version:</strong> A newer draft has been submitted. Only the latest
                draft can be approved.
              </span>
            </li>
          )}
          {notUnderReview && (
            <li className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span>
                <strong>Not Under Review:</strong> This content job is not currently in reviewable
                status.
              </span>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
};
