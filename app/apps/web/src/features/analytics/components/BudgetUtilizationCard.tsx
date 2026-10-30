import React from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import type { BudgetUtilization } from '../types/analytics.types.js';

interface BudgetUtilizationCardProps {
  readonly utilization: BudgetUtilization;
  readonly onOpenBudgetModal?: () => void;
  readonly canManageBudget?: boolean;
  readonly className?: string;
}

export const BudgetUtilizationCard: React.FC<BudgetUtilizationCardProps> = ({
  utilization,
  onOpenBudgetModal,
  canManageBudget = false,
  className,
}) => {
  const percent = Math.min(Math.max(utilization.utilizationPercent, 0), 100);

  let barColor = 'bg-navy-700';
  if (utilization.isExhausted) {
    barColor = 'bg-red-600';
  } else if (utilization.isSoftAlertTriggered) {
    barColor = 'bg-amber-500';
  }

  return (
    <div
      data-testid="budget-utilization-card"
      className={`bg-white rounded-xl border border-app-border p-6 shadow-sm ${className ?? ''}`}
    >
      {/* Alert Banners */}
      {utilization.isExhausted && (
        <div
          data-testid="budget-exhausted-alert"
          className="mb-4 p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-900 flex items-center gap-3 text-xs"
        >
          <ShieldAlert className="w-5 h-5 text-red-600 shrink-0" />
          <div className="flex-1">
            <span className="font-semibold">AI Spending Cap Reached:</span> Monthly budget is fully
            exhausted ($
            {utilization.totalCommittedCostUsd.toFixed(2)} / $
            {utilization.monthlyCeiling.toFixed(2)}). All generative AI dispatches are safely locked
            to prevent unauthorized billing.
          </div>
        </div>
      )}

      {!utilization.isExhausted && utilization.isSoftAlertTriggered && (
        <div
          data-testid="budget-soft-alert"
          className="mb-4 p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 flex items-center gap-3 text-xs"
        >
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <div className="flex-1">
            <span className="font-semibold">Budget Warning:</span> Utilization is at{' '}
            {utilization.utilizationPercent.toFixed(1)}%, exceeding the{' '}
            {(utilization.softAlertThreshold * 100).toFixed(0)}% soft alert threshold.
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-app-muted">
            Monthly AI Operating Budget
          </h3>
          <p className="text-xs text-app-muted mt-0.5">
            Fail-closed deterministic expenditure ledger
          </p>
        </div>
        {canManageBudget && onOpenBudgetModal && (
          <button
            type="button"
            data-testid="adjust-budget-btn"
            onClick={onOpenBudgetModal}
            className="px-3 py-1.5 rounded-lg border border-navy-700 text-navy-800 hover:bg-navy-50 text-xs font-medium transition-colors"
          >
            Adjust Budget
          </button>
        )}
      </div>

      {/* Primary KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div className="p-3.5 rounded-lg bg-app-surface-subtle border border-app-border">
          <div className="text-[11px] font-medium text-app-muted uppercase">Monthly Ceiling</div>
          <div
            data-testid="monthly-ceiling-val"
            className="text-xl font-bold font-serif text-navy-950 mt-1"
          >
            ${utilization.monthlyCeiling.toFixed(2)}
          </div>
          <div className="text-[10px] text-app-muted mt-0.5">
            Per-request cap: ${utilization.perRequestCeiling.toFixed(2)}
          </div>
        </div>

        <div className="p-3.5 rounded-lg bg-app-surface-subtle border border-app-border">
          <div className="text-[11px] font-medium text-app-muted uppercase">Committed Cost</div>
          <div
            data-testid="committed-cost-val"
            className="text-xl font-bold font-serif text-navy-950 mt-1"
          >
            ${utilization.totalCommittedCostUsd.toFixed(4)}
          </div>
          <div className="text-[10px] text-app-muted mt-0.5">
            Settled: ${utilization.settledCostUsd.toFixed(4)}
          </div>
        </div>

        <div className="p-3.5 rounded-lg bg-app-surface-subtle border border-app-border">
          <div className="text-[11px] font-medium text-app-muted uppercase">Available Headroom</div>
          <div
            data-testid="remaining-headroom-val"
            className={`text-xl font-bold font-serif mt-1 ${
              utilization.remainingHeadroomUsd <= 0 ? 'text-red-700' : 'text-emerald-800'
            }`}
          >
            ${utilization.remainingHeadroomUsd.toFixed(4)}
          </div>
          <div className="text-[10px] text-app-muted mt-0.5">
            {utilization.isExhausted
              ? '0.00% Available'
              : `${(100 - percent).toFixed(1)}% Headroom`}
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-app-muted font-medium">
          <span>Utilization: {utilization.utilizationPercent.toFixed(1)}%</span>
          <span>100% (${utilization.monthlyCeiling.toFixed(2)})</span>
        </div>
        <div
          data-testid="budget-progress-bar-container"
          className="w-full h-3 rounded-full bg-slate-100 overflow-hidden relative border border-slate-200"
        >
          <div
            data-testid="budget-progress-bar"
            className={`h-full transition-all duration-500 rounded-full ${barColor}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Cost Knowledge Breakdown */}
      <div className="mt-4 pt-3.5 border-t border-app-border grid grid-cols-3 gap-2 text-xs">
        <div className="flex flex-col">
          <span className="text-[10px] text-app-muted uppercase">Settled (Confirmed)</span>
          <span className="font-semibold text-app-primary">
            ${utilization.settledCostUsd.toFixed(4)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-app-muted uppercase">Active Reserved</span>
          <span className="font-semibold text-amber-700">
            ${utilization.activeReservedCostUsd.toFixed(4)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-app-muted uppercase">Unreconciled Exposure</span>
          <span
            className={`font-semibold ${
              utilization.unreconciledExposureUsd > 0 ? 'text-red-700' : 'text-app-primary'
            }`}
          >
            ${utilization.unreconciledExposureUsd.toFixed(4)}
          </span>
        </div>
      </div>
    </div>
  );
};
