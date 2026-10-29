import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';
import type { ReviewDeskDetail } from '../types/approvals.types.js';

interface ValidationFindingsListProps {
  validationResult?: ReviewDeskDetail['validationResult'];
}

export const ValidationFindingsList: React.FC<ValidationFindingsListProps> = ({
  validationResult,
}) => {
  if (!validationResult) {
    return (
      <div
        data-testid="validation-empty"
        className="rounded-xl border border-white/5 bg-zinc-900/40 p-4 text-xs text-zinc-400"
      >
        No automated factual validation recorded for this content version.
      </div>
    );
  }

  const { status, blockingCount, warningCount, findings } = validationResult;
  const isPassed = status === 'PASSED';
  const isWarning = status === 'PASSED_WITH_WARNINGS';
  const isBlocked = blockingCount > 0 || status === 'BLOCKED' || status === 'FAILED';

  return (
    <div
      data-testid="validation-findings-card"
      className="rounded-xl border border-white/10 bg-zinc-900/60 p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isBlocked ? (
            <XCircle className="h-5 w-5 text-rose-400" />
          ) : isWarning ? (
            <AlertTriangle className="h-5 w-5 text-amber-400" />
          ) : (
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          )}
          <div>
            <h3 className="text-sm font-semibold text-white">Automated Factual Consistency Gate</h3>
            <p className="text-xs text-zinc-400">
              {isPassed && 'All claims verified against official product catalog snapshot.'}
              {isWarning && `${warningCount} non-blocking warning(s) detected.`}
              {isBlocked &&
                `${blockingCount} blocking factual error(s) detected. Approval blocked.`}
            </p>
          </div>
        </div>

        <span
          className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${
            isPassed
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : isWarning
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
          }`}
        >
          {status}
        </span>
      </div>

      {findings && findings.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-white/5">
          {findings.map((f, idx) => (
            <div
              key={idx}
              className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
                f.severity === 'BLOCKING'
                  ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                  : f.severity === 'WARNING'
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                    : 'border-blue-500/30 bg-blue-500/10 text-blue-200'
              }`}
            >
              {f.severity === 'BLOCKING' ? (
                <XCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
              ) : f.severity === 'WARNING' ? (
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
              ) : (
                <Info className="h-4 w-4 shrink-0 text-blue-400 mt-0.5" />
              )}
              <div className="flex-1 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">
                    {f.severity}
                  </span>
                  {f.field && (
                    <span className="font-mono text-zinc-400 text-[10px]">field: {f.field}</span>
                  )}
                  {f.code && (
                    <span className="font-mono text-zinc-400 text-[10px]">code: {f.code}</span>
                  )}
                </div>
                <p className="leading-relaxed">{f.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
