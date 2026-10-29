import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ShieldAlert,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import type { ValidationAssessmentResult } from '../types/creative.types.js';

export interface CreativeValidationPanelProps {
  readonly validationResult: ValidationAssessmentResult | null;
  readonly isValidating: boolean;
  readonly onRunValidation: () => void;
  readonly disabled?: boolean;
}

export const CreativeValidationPanel: React.FC<CreativeValidationPanelProps> = ({
  validationResult,
  isValidating,
  onRunValidation,
  disabled = false,
}) => {
  return (
    <div className="flex flex-col h-full bg-app-surface border border-app-border rounded-xl overflow-y-auto">
      <div className="px-4 py-3 border-b border-app-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-app-muted" />
          <span className="text-xs font-semibold text-app-primary uppercase tracking-wider">
            Brand-Safety & Compliance Gates
          </span>
        </div>
        <button
          type="button"
          disabled={disabled || isValidating}
          onClick={onRunValidation}
          className="px-2.5 py-1 rounded-md bg-app-surface-subtle hover:bg-app-border text-xs font-medium text-app-primary flex items-center gap-1.5 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${isValidating ? 'animate-spin' : ''}`} />
          {isValidating ? 'Checking...' : 'Check Gates'}
        </button>
      </div>

      <div className="p-4 space-y-5">
        {/* Compliance Status Overview */}
        {validationResult ? (
          <div>
            <div
              className={`p-3.5 rounded-xl border flex items-center gap-3 ${
                validationResult.isPassed
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-red-500/10 border-red-500/30 text-red-400'
              }`}
            >
              {validationResult.isPassed ? (
                <CheckCircle2 className="w-6 h-6 shrink-0" />
              ) : (
                <XCircle className="w-6 h-6 shrink-0" />
              )}
              <div>
                <div className="font-semibold text-sm">
                  {validationResult.isPassed
                    ? 'Visual & Commercial Gates Passed'
                    : 'Blocking Compliance Violations'}
                </div>
                <div className="text-xs opacity-90">
                  {validationResult.isPassed
                    ? 'Scene layout satisfies safe margins, MSRP truth, and collision rules.'
                    : `${validationResult.blockingCount} blocking finding(s) must be resolved before review.`}
                </div>
              </div>
            </div>

            {/* Aesthetic Score Card */}
            <div className="mt-4 p-4 rounded-xl bg-app-surface-subtle border border-app-border">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#A88448]" />
                  <span className="text-xs font-semibold text-app-primary uppercase tracking-wider">
                    Aesthetic Quality Score
                  </span>
                </div>
                <span className="text-base font-bold font-mono text-brand-burgundy">
                  {validationResult.aestheticScore.toFixed(1)} / 10.0
                </span>
              </div>

              {/* Progress meter */}
              <div className="w-full h-2 rounded-full bg-app-border overflow-hidden mb-3">
                <div
                  className="h-full bg-gradient-to-r from-[#A88448] to-[#8C2437] transition-all duration-500"
                  style={{ width: `${Math.min(100, validationResult.aestheticScore * 10)}%` }}
                />
              </div>

              {/* Breakdown metrics */}
              <div className="grid grid-cols-2 gap-2 text-[11px] pt-2 border-t border-app-border/40">
                <div className="flex justify-between">
                  <span className="text-app-muted">Typography:</span>
                  <span className="font-mono text-app-primary">
                    {validationResult.scoreBreakdown.typographyLegibility.toFixed(1)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-app-muted">Spatial Balance:</span>
                  <span className="font-mono text-app-primary">
                    {validationResult.scoreBreakdown.spatialBalance.toFixed(1)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-app-muted">Focal Prominence:</span>
                  <span className="font-mono text-app-primary">
                    {validationResult.scoreBreakdown.focalProminence.toFixed(1)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-app-muted">Color Harmony:</span>
                  <span className="font-mono text-app-primary">
                    {validationResult.scoreBreakdown.colorHarmony.toFixed(1)}
                  </span>
                </div>
              </div>
            </div>

            {/* Findings List */}
            {validationResult.findings.length > 0 && (
              <div className="space-y-2 mt-4">
                <div className="text-xs font-semibold text-app-primary uppercase tracking-wider">
                  Findings ({validationResult.findings.length})
                </div>
                {validationResult.findings.map((f, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
                      f.severity === 'BLOCKING'
                        ? 'bg-red-500/5 border-red-500/20 text-red-400'
                        : 'bg-amber-500/5 border-amber-500/20 text-amber-400'
                    }`}
                  >
                    {f.severity === 'BLOCKING' ? (
                      <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="font-semibold font-mono text-[11px]">{f.code}</div>
                      <div className="text-app-primary mt-0.5 leading-relaxed">{f.message}</div>
                      {f.field && (
                        <div className="text-[10px] text-app-muted mt-1 font-mono">
                          Field: {f.field}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-app-muted">
            <p className="text-xs">
              Run compliance check to evaluate safe margins, price truth, and aesthetic quality.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
