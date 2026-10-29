import React from 'react';
import { History, CheckCircle2, XCircle, FileText } from 'lucide-react';
import type { ReviewDeskDetail } from '../types/approvals.types.js';

interface ReviewAuditTimelineProps {
  versions: ReviewDeskDetail['versions'];
  approvalEvents: ReviewDeskDetail['approvalEvents'];
}

export const ReviewAuditTimeline: React.FC<ReviewAuditTimelineProps> = ({
  versions,
  approvalEvents,
}) => {
  return (
    <div
      data-testid="review-audit-timeline"
      className="rounded-xl border border-white/10 bg-zinc-900/60 p-5 space-y-4"
    >
      <div className="flex items-center gap-2 border-b border-white/5 pb-3">
        <History className="h-4 w-4 text-zinc-400" />
        <h3 className="text-xs font-semibold tracking-wider text-zinc-400 uppercase">
          Review & Decision Audit Timeline
        </h3>
      </div>

      <div className="space-y-4 text-xs">
        {versions.map((ver) => {
          const relatedDecisions = approvalEvents.filter((ev) => ev.contentVersionId === ver.id);

          return (
            <div key={ver.id} className="border-l-2 border-white/10 pl-4 py-1 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-zinc-400" />
                  <span className="font-medium text-white">
                    Version {ver.versionNumber} Created
                  </span>
                </div>
                <span className="text-[10px] text-zinc-500 font-mono">
                  {new Date(ver.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="text-zinc-400 italic">"{ver.headline}"</p>

              {relatedDecisions.map((dec) => (
                <div
                  key={dec.id}
                  className={`mt-2 p-2.5 rounded-lg border flex items-start gap-2 ${
                    dec.decision === 'APPROVED'
                      ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-200'
                      : 'border-rose-500/20 bg-rose-500/5 text-rose-200'
                  }`}
                >
                  {dec.decision === 'APPROVED' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs">Decision: {dec.decision}</span>
                      <span className="text-[10px] opacity-75 font-mono">
                        {new Date(dec.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs opacity-90">
                      Reviewer: {dec.approverDisplayName ?? dec.approverUserId}
                    </p>
                    {dec.comment && (
                      <p className="text-xs opacity-80 pt-0.5">Note: "{dec.comment}"</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};
