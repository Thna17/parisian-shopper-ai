import React from 'react';
import { Layers } from 'lucide-react';
import type { CampaignAnalytics } from '../types/analytics.types.js';

interface CampaignActivityPanelProps {
  readonly analytics: CampaignAnalytics;
  readonly className?: string;
}

export const CampaignActivityPanel: React.FC<CampaignActivityPanelProps> = ({
  analytics,
  className,
}) => {
  return (
    <div
      data-testid="campaign-activity-panel"
      className={`bg-white rounded-xl border border-app-border p-6 shadow-sm space-y-6 ${
        className ?? ''
      }`}
    >
      <div className="flex items-center gap-3 border-b border-app-border pb-4">
        <div className="w-9 h-9 rounded-lg bg-navy-50 text-navy-800 flex items-center justify-center">
          <Layers className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-base font-bold text-navy-950 font-serif">
            Campaign Workflow Intelligence
          </h3>
          <p className="text-xs text-app-muted">
            Campaign orchestration, product catalog bindings, and downstream assets
          </p>
        </div>
      </div>

      {/* Summary KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg bg-app-surface-subtle border border-app-border">
          <div className="text-[11px] font-medium text-app-muted uppercase">Total Campaigns</div>
          <div
            data-testid="campaigns-total"
            className="text-2xl font-bold font-serif text-navy-950 mt-1"
          >
            {analytics.totalCampaigns}
          </div>
          <div className="text-[10px] text-app-muted mt-0.5">
            {analytics.activeCampaigns} currently active
          </div>
        </div>

        <div className="p-4 rounded-lg bg-app-surface-subtle border border-app-border">
          <div className="text-[11px] font-medium text-app-muted uppercase">Active Campaigns</div>
          <div
            data-testid="campaigns-active"
            className="text-2xl font-bold font-serif text-emerald-800 mt-1"
          >
            {analytics.activeCampaigns}
          </div>
          <div className="text-[10px] text-app-muted mt-0.5">
            {analytics.plannedCampaigns} planned
          </div>
        </div>

        <div className="p-4 rounded-lg bg-app-surface-subtle border border-app-border">
          <div className="text-[11px] font-medium text-app-muted uppercase">Bound Products</div>
          <div
            data-testid="campaigns-products"
            className="text-2xl font-bold font-serif text-navy-950 mt-1"
          >
            {analytics.totalProductsAssociated}
          </div>
          <div className="text-[10px] text-app-muted mt-0.5">Catalog associations</div>
        </div>

        <div className="p-4 rounded-lg bg-app-surface-subtle border border-app-border">
          <div className="text-[11px] font-medium text-app-muted uppercase">Bound Content Jobs</div>
          <div
            data-testid="campaigns-jobs"
            className="text-2xl font-bold font-serif text-navy-950 mt-1"
          >
            {analytics.totalContentJobsAssociated}
          </div>
          <div className="text-[10px] text-app-muted mt-0.5">Linked generations</div>
        </div>
      </div>

      {/* Status Breakdown Pills */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-800 border border-slate-200">
          Draft: <strong className="ml-1">{analytics.draftCampaigns}</strong>
        </span>
        <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-800 border border-blue-200">
          Planned: <strong className="ml-1">{analytics.plannedCampaigns}</strong>
        </span>
        <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
          Active: <strong className="ml-1">{analytics.activeCampaigns}</strong>
        </span>
        <span className="px-3 py-1 rounded-full bg-purple-50 text-purple-800 border border-purple-200">
          Completed: <strong className="ml-1">{analytics.completedCampaigns}</strong>
        </span>
        <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-700 border border-gray-200">
          Archived: <strong className="ml-1">{analytics.archivedCampaigns}</strong>
        </span>
      </div>

      {/* Campaign Summary Table */}
      {analytics.campaignsSummary.length > 0 ? (
        <div className="overflow-x-auto border border-app-border rounded-lg">
          <table className="min-w-full divide-y divide-app-border text-xs">
            <thead className="bg-app-surface-subtle font-medium text-app-muted">
              <tr>
                <th className="px-4 py-2.5 text-left">Code</th>
                <th className="px-4 py-2.5 text-left">Campaign Name</th>
                <th className="px-4 py-2.5 text-center">Status</th>
                <th className="px-4 py-2.5 text-right">Products</th>
                <th className="px-4 py-2.5 text-right">Content Jobs</th>
                <th className="px-4 py-2.5 text-right">Publications</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-border bg-white text-app-primary">
              {analytics.campaignsSummary.map((c) => (
                <tr key={c.id} className="hover:bg-app-surface-subtle/50">
                  <td className="px-4 py-2.5 font-mono font-medium text-navy-900">{c.code}</td>
                  <td className="px-4 py-2.5 font-semibold text-app-primary">{c.name}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-navy-50 text-navy-800 border border-navy-200">
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">{c.productCount}</td>
                  <td className="px-4 py-2.5 text-right">{c.contentJobCount}</td>
                  <td className="px-4 py-2.5 text-right">{c.publicationCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-6 text-app-muted text-xs border border-dashed border-app-border rounded-lg">
          No campaigns found for the selected period.
        </div>
      )}
    </div>
  );
};
