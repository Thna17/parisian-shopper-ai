import React from 'react';
import { Cpu } from 'lucide-react';
import type { AiUsageAnalytics } from '../types/analytics.types.js';

interface AiUsagePanelProps {
  readonly analytics: AiUsageAnalytics;
  readonly className?: string;
}

export const AiUsagePanel: React.FC<AiUsagePanelProps> = ({ analytics, className }) => {
  return (
    <div
      data-testid="ai-usage-panel"
      className={`bg-white rounded-xl border border-app-border p-6 shadow-sm space-y-6 ${
        className ?? ''
      }`}
    >
      <div className="flex items-center gap-3 border-b border-app-border pb-4">
        <div className="w-9 h-9 rounded-lg bg-navy-50 text-navy-800 flex items-center justify-center">
          <Cpu className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-base font-bold text-navy-950 font-serif">
            AI Provider & Token Consumption
          </h3>
          <p className="text-xs text-app-muted">
            Auditable token counts, provider latency, and dual estimated/confirmed accounting
          </p>
        </div>
      </div>

      {/* Primary KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg bg-app-surface-subtle border border-app-border">
          <div className="text-[11px] font-medium text-app-muted uppercase">Total Tokens</div>
          <div
            data-testid="ai-total-tokens"
            className="text-2xl font-bold font-serif text-navy-950 mt-1"
          >
            {analytics.totalTokens.toLocaleString()}
          </div>
          <div className="text-[10px] text-app-muted mt-0.5">
            {analytics.totalInputTokens.toLocaleString()} in /{' '}
            {analytics.totalOutputTokens.toLocaleString()} out
          </div>
        </div>

        <div className="p-4 rounded-lg bg-app-surface-subtle border border-app-border">
          <div className="text-[11px] font-medium text-app-muted uppercase">Confirmed Cost</div>
          <div
            data-testid="ai-confirmed-cost"
            className="text-2xl font-bold font-serif text-emerald-800 mt-1"
          >
            ${analytics.confirmedCostUsd.toFixed(4)}
          </div>
          <div className="text-[10px] text-app-muted mt-0.5">Definitive billed usage</div>
        </div>

        <div className="p-4 rounded-lg bg-app-surface-subtle border border-app-border">
          <div className="text-[11px] font-medium text-app-muted uppercase">Estimated Cost</div>
          <div
            data-testid="ai-estimated-cost"
            className="text-2xl font-bold font-serif text-navy-950 mt-1"
          >
            ${analytics.estimatedCostUsd.toFixed(4)}
          </div>
          <div className="text-[10px] text-app-muted mt-0.5">Formulaic micro-dollar rates</div>
        </div>

        <div className="p-4 rounded-lg bg-app-surface-subtle border border-app-border">
          <div className="text-[11px] font-medium text-app-muted uppercase">Active Reserved</div>
          <div
            data-testid="ai-reserved-cost"
            className="text-2xl font-bold font-serif text-amber-700 mt-1"
          >
            ${analytics.reservedCostUsd.toFixed(4)}
          </div>
          <div className="text-[10px] text-app-muted mt-0.5">In-flight holds</div>
        </div>
      </div>

      {/* Provider / Model Breakdown */}
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-app-muted mb-3">
          Consumption by Model & Provider
        </h4>
        {analytics.byProviderModel.length > 0 ? (
          <div className="overflow-x-auto border border-app-border rounded-lg">
            <table className="min-w-full divide-y divide-app-border text-xs">
              <thead className="bg-app-surface-subtle font-medium text-app-muted">
                <tr>
                  <th className="px-4 py-2.5 text-left">Provider / Model</th>
                  <th className="px-4 py-2.5 text-right">Requests</th>
                  <th className="px-4 py-2.5 text-right">Input Tokens</th>
                  <th className="px-4 py-2.5 text-right">Output Tokens</th>
                  <th className="px-4 py-2.5 text-right">Estimated ($)</th>
                  <th className="px-4 py-2.5 text-right">Confirmed ($)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-border bg-white text-app-primary">
                {analytics.byProviderModel.map((item) => (
                  <tr
                    key={`${item.provider}-${item.model}`}
                    data-testid={`provider-row-${item.provider}-${item.model}`}
                    className="hover:bg-app-surface-subtle/50"
                  >
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-navy-900">{item.model}</div>
                      <div className="text-[10px] text-app-muted">{item.provider}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">{item.requests}</td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      {item.inputTokens.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      {item.outputTokens.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-medium">
                      ${item.estimatedCostUsd.toFixed(4)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-emerald-800">
                      ${item.confirmedCostUsd.toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-4 text-app-muted text-xs border border-dashed border-app-border rounded-lg">
            No provider usage recorded in this time range.
          </div>
        )}
      </div>
    </div>
  );
};
