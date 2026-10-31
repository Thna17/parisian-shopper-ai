import React from 'react';
import { Sparkles } from 'lucide-react';
import type { ContentAnalytics } from '../types/analytics.types.js';

interface ContentPerformancePanelProps {
  readonly analytics: ContentAnalytics;
  readonly className?: string;
}

export const ContentPerformancePanel: React.FC<ContentPerformancePanelProps> = ({
  analytics,
  className,
}) => {
  const successRate =
    analytics.totalAttempts > 0
      ? ((analytics.successfulAttempts / analytics.totalAttempts) * 100).toFixed(1)
      : '0.0';

  return (
    <div
      data-testid="content-performance-panel"
      className={`bg-white rounded-xl border border-app-border p-6 shadow-sm space-y-6 ${
        className ?? ''
      }`}
    >
      <div className="flex items-center justify-between border-b border-app-border pb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-navy-50 text-navy-800 flex items-center justify-center">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-navy-950 font-serif">
              AI Content Production Performance
            </h3>
            <p className="text-xs text-app-muted">
              Copy generation attempts, review outcomes, and latency telemetry
            </p>
          </div>
        </div>
      </div>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg bg-app-surface-subtle border border-app-border">
          <div className="text-[11px] font-medium text-app-muted uppercase">Total Jobs</div>
          <div
            data-testid="content-total-jobs"
            className="text-2xl font-bold font-serif text-navy-950 mt-1"
          >
            {analytics.totalJobs}
          </div>
          <div className="text-[10px] text-app-muted mt-0.5">
            {analytics.pendingReviewJobs} pending review
          </div>
        </div>

        <div className="p-4 rounded-lg bg-app-surface-subtle border border-app-border">
          <div className="text-[11px] font-medium text-app-muted uppercase">
            Generation Attempts
          </div>
          <div
            data-testid="content-total-attempts"
            className="text-2xl font-bold font-serif text-navy-950 mt-1"
          >
            {analytics.totalAttempts}
          </div>
          <div className="text-[10px] text-app-muted mt-0.5">
            {analytics.successfulAttempts} succeeded ({successRate}%)
          </div>
        </div>

        <div className="p-4 rounded-lg bg-app-surface-subtle border border-app-border">
          <div className="text-[11px] font-medium text-app-muted uppercase">Success Rate</div>
          <div
            data-testid="content-success-rate"
            className="text-2xl font-bold font-serif text-emerald-800 mt-1"
          >
            {successRate}%
          </div>
          <div className="text-[10px] text-app-muted mt-0.5">
            {analytics.failedAttempts} failed attempts
          </div>
        </div>

        <div className="p-4 rounded-lg bg-app-surface-subtle border border-app-border">
          <div className="text-[11px] font-medium text-app-muted uppercase">Avg Latency</div>
          <div
            data-testid="content-avg-duration"
            className="text-2xl font-bold font-serif text-navy-950 mt-1"
          >
            {(analytics.averageDurationMs / 1000).toFixed(2)}s
          </div>
          <div className="text-[10px] text-app-muted mt-0.5">
            {analytics.averageDurationMs} ms end-to-end
          </div>
        </div>
      </div>

      {/* Status Breakdown */}
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-app-muted mb-3">
          Job Status Distribution
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-3 rounded-lg border border-app-border bg-slate-50 text-center">
            <span className="text-[11px] text-app-muted uppercase">Draft</span>
            <div data-testid="status-draft" className="text-lg font-bold text-slate-800">
              {analytics.draftJobs}
            </div>
          </div>
          <div className="p-3 rounded-lg border border-amber-200 bg-amber-50/50 text-center">
            <span className="text-[11px] text-amber-800 uppercase">Generating</span>
            <div data-testid="status-generating" className="text-lg font-bold text-amber-900">
              {analytics.generatingJobs}
            </div>
          </div>
          <div className="p-3 rounded-lg border border-blue-200 bg-blue-50/50 text-center">
            <span className="text-[11px] text-blue-800 uppercase">Under Review</span>
            <div data-testid="status-pending-review" className="text-lg font-bold text-blue-900">
              {analytics.pendingReviewJobs}
            </div>
          </div>
          <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50/50 text-center">
            <span className="text-[11px] text-emerald-800 uppercase">Approved</span>
            <div data-testid="status-approved" className="text-lg font-bold text-emerald-900">
              {analytics.approvedJobs}
            </div>
          </div>
          <div className="p-3 rounded-lg border border-red-200 bg-red-50/50 text-center">
            <span className="text-[11px] text-red-800 uppercase">Rejected</span>
            <div data-testid="status-rejected" className="text-lg font-bold text-red-900">
              {analytics.rejectedJobs}
            </div>
          </div>
        </div>
      </div>

      {/* Daily Activity Timeline */}
      {analytics.dailyActivity.length > 0 && (
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-app-muted mb-3">
            Daily Activity Log
          </h4>
          <div className="overflow-x-auto border border-app-border rounded-lg">
            <table className="min-w-full divide-y divide-app-border text-xs">
              <thead className="bg-app-surface-subtle font-medium text-app-muted">
                <tr>
                  <th className="px-4 py-2.5 text-left">Date</th>
                  <th className="px-4 py-2.5 text-right">Created</th>
                  <th className="px-4 py-2.5 text-right">Succeeded</th>
                  <th className="px-4 py-2.5 text-right">Failed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-border bg-white text-app-primary">
                {analytics.dailyActivity.map((day) => (
                  <tr key={day.date} className="hover:bg-app-surface-subtle/50">
                    <td className="px-4 py-2.5 font-mono">{day.date}</td>
                    <td className="px-4 py-2.5 text-right">{day.created}</td>
                    <td className="px-4 py-2.5 text-right text-emerald-700 font-medium">
                      {day.succeeded}
                    </td>
                    <td className="px-4 py-2.5 text-right text-red-700">{day.failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
