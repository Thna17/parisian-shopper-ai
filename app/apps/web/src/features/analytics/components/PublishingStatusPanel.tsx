import React from 'react';
import { Send } from 'lucide-react';
import type { PublishingAnalytics } from '../types/analytics.types.js';

interface PublishingStatusPanelProps {
  readonly analytics: PublishingAnalytics;
  readonly className?: string;
}

export const PublishingStatusPanel: React.FC<PublishingStatusPanelProps> = ({
  analytics,
  className,
}) => {
  return (
    <div
      data-testid="publishing-status-panel"
      className={`bg-white rounded-xl border border-app-border p-6 shadow-sm space-y-6 ${
        className ?? ''
      }`}
    >
      <div className="flex items-center gap-3 border-b border-app-border pb-4">
        <div className="w-9 h-9 rounded-lg bg-navy-50 text-navy-800 flex items-center justify-center">
          <Send className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-base font-bold text-navy-950 font-serif">
            Publishing & Channel Delivery
          </h3>
          <p className="text-xs text-app-muted">
            Distribution audit, delivery attempts, and channel health tracking
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg bg-app-surface-subtle border border-app-border">
          <div className="text-[11px] font-medium text-app-muted uppercase">Total Records</div>
          <div
            data-testid="publishing-total"
            className="text-2xl font-bold font-serif text-navy-950 mt-1"
          >
            {analytics.totalPublications}
          </div>
          <div className="text-[10px] text-app-muted mt-0.5">Durable publishing logs</div>
        </div>

        <div className="p-4 rounded-lg bg-app-surface-subtle border border-app-border">
          <div className="text-[11px] font-medium text-app-muted uppercase">
            Delivered / Published
          </div>
          <div
            data-testid="publishing-published"
            className="text-2xl font-bold font-serif text-emerald-800 mt-1"
          >
            {analytics.publishedCount}
          </div>
          <div className="text-[10px] text-app-muted mt-0.5">Confirmed delivery</div>
        </div>

        <div className="p-4 rounded-lg bg-app-surface-subtle border border-app-border">
          <div className="text-[11px] font-medium text-app-muted uppercase">Failed Records</div>
          <div
            data-testid="publishing-failed"
            className="text-2xl font-bold font-serif text-red-800 mt-1"
          >
            {analytics.failedCount}
          </div>
          <div className="text-[10px] text-app-muted mt-0.5">Eligible for retry</div>
        </div>

        <div className="p-4 rounded-lg bg-app-surface-subtle border border-app-border">
          <div className="text-[11px] font-medium text-app-muted uppercase">
            Attempt Success Rate
          </div>
          <div
            data-testid="publishing-success-rate"
            className="text-2xl font-bold font-serif text-navy-950 mt-1"
          >
            {analytics.attemptSuccessRatePercent.toFixed(1)}%
          </div>
          <div className="text-[10px] text-app-muted mt-0.5">
            {analytics.unknownOutcomes > 0
              ? `${analytics.unknownOutcomes} unknown outcomes`
              : 'All outcomes reconciled'}
          </div>
        </div>
      </div>

      {/* Channel Breakdown */}
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-app-muted mb-3">
          Channel Activity Breakdown
        </h4>
        {analytics.byChannel.length > 0 ? (
          <div className="overflow-x-auto border border-app-border rounded-lg">
            <table className="min-w-full divide-y divide-app-border text-xs">
              <thead className="bg-app-surface-subtle font-medium text-app-muted">
                <tr>
                  <th className="px-4 py-2.5 text-left">Channel</th>
                  <th className="px-4 py-2.5 text-right">Total Requests</th>
                  <th className="px-4 py-2.5 text-right">Published</th>
                  <th className="px-4 py-2.5 text-right">Failed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-border bg-white text-app-primary">
                {analytics.byChannel.map((ch) => (
                  <tr key={ch.channel} data-testid={`channel-row-${ch.channel}`}>
                    <td className="px-4 py-2.5 font-medium text-navy-900">{ch.channel}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{ch.total}</td>
                    <td className="px-4 py-2.5 text-right text-emerald-700 font-semibold">
                      {ch.published}
                    </td>
                    <td className="px-4 py-2.5 text-right text-red-700 font-semibold">
                      {ch.failed}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-4 text-app-muted text-xs border border-dashed border-app-border rounded-lg">
            No channel dispatch records found.
          </div>
        )}
      </div>
    </div>
  );
};
