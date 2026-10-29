import React from 'react';
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { ValidationResult } from '../types/content.types.js';

interface ValidationFindingsPanelProps {
  validationResult: ValidationResult | null | undefined;
}

export function ValidationFindingsPanel({
  validationResult,
}: ValidationFindingsPanelProps): React.JSX.Element {
  if (!validationResult) {
    return (
      <div className="bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200/80 dark:border-neutral-800 rounded-2xl p-6 mb-6 text-center text-xs text-neutral-500">
        No factual validation findings recorded yet.
      </div>
    );
  }

  const isPassed =
    validationResult.status === 'PASSED' || validationResult.status === 'PASSED_WITH_WARNINGS';
  const hasBlocking =
    validationResult.blockingCount > 0 ||
    validationResult.status === 'BLOCKED' ||
    validationResult.status === 'FAILED';

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 rounded-2xl p-6 shadow-sm mb-6">
      <div className="flex items-center justify-between pb-4 border-b border-neutral-100 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          {hasBlocking ? (
            <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400" />
          ) : (
            <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          )}
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
            Factual Truth & Brand Compliance
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {isPassed && !hasBlocking ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              Verified Factual
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-800 border border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800">
              <AlertTriangle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
              Blocking Issues Detected
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 my-4">
        <div className="p-3 bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/60 dark:border-neutral-700/60 rounded-xl">
          <div className="text-xs text-neutral-500 dark:text-neutral-400">Blocking Errors</div>
          <div
            className={`text-xl font-bold mt-1 ${validationResult.blockingCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-neutral-900 dark:text-neutral-100'}`}
          >
            {validationResult.blockingCount}
          </div>
        </div>

        <div className="p-3 bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/60 dark:border-neutral-700/60 rounded-xl">
          <div className="text-xs text-neutral-500 dark:text-neutral-400">Warnings</div>
          <div
            className={`text-xl font-bold mt-1 ${validationResult.warningCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-900 dark:text-neutral-100'}`}
          >
            {validationResult.warningCount}
          </div>
        </div>

        <div className="p-3 bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/60 dark:border-neutral-700/60 rounded-xl">
          <div className="text-xs text-neutral-500 dark:text-neutral-400">Total Findings</div>
          <div className="text-xl font-bold mt-1 text-neutral-900 dark:text-neutral-100">
            {validationResult.findingCount}
          </div>
        </div>
      </div>

      {validationResult.findings.length === 0 ? (
        <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>
            All product facts (MSRP, fragrance notes, origin) matched verified catalog snapshots
            exactly. Ready for review.
          </span>
        </div>
      ) : (
        <div className="space-y-2 mt-4">
          <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
            Detailed Findings
          </h3>
          {validationResult.findings.map((finding) => (
            <div
              key={finding.id}
              className={`p-3.5 rounded-xl border text-xs ${
                finding.severity === 'BLOCKING'
                  ? 'bg-red-50/60 dark:bg-red-950/30 border-red-200 dark:border-red-800/60 text-red-900 dark:text-red-200'
                  : finding.severity === 'WARNING'
                    ? 'bg-amber-50/60 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200'
                    : 'bg-blue-50/60 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/60 text-blue-900 dark:text-blue-200'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold flex items-center gap-1.5">
                  {finding.severity === 'BLOCKING' && (
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                  )}
                  {finding.severity === 'WARNING' && (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  )}
                  {finding.severity === 'INFO' && (
                    <Info className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  )}
                  Field: <code className="font-mono">{finding.field}</code> ({finding.code})
                </span>
                <span className="uppercase text-[10px] tracking-wider font-bold">
                  {finding.severity}
                </span>
              </div>
              <p className="mt-1">{finding.message}</p>

              {(finding.expectedValue !== undefined || finding.actualValue !== undefined) && (
                <div className="mt-2 pt-2 border-t border-current/10 flex gap-4 text-[11px] font-mono">
                  {finding.expectedValue !== undefined && (
                    <span>
                      Expected:{' '}
                      <strong className="font-semibold">{String(finding.expectedValue)}</strong>
                    </span>
                  )}
                  {finding.actualValue !== undefined && (
                    <span>
                      Actual in copy:{' '}
                      <strong className="font-semibold">{String(finding.actualValue)}</strong>
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
