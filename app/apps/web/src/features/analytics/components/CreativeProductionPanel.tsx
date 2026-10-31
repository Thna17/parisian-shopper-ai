import React from 'react';
import { Palette } from 'lucide-react';
import type { CreativeAnalytics } from '../types/analytics.types.js';

interface CreativeProductionPanelProps {
  readonly analytics: CreativeAnalytics;
  readonly className?: string;
}

export const CreativeProductionPanel: React.FC<CreativeProductionPanelProps> = ({
  analytics,
  className,
}) => {
  const renderSuccessRate =
    analytics.renderAttempts > 0
      ? ((analytics.successfulRenders / analytics.renderAttempts) * 100).toFixed(1)
      : '0.0';

  return (
    <div
      data-testid="creative-production-panel"
      className={`bg-white rounded-xl border border-app-border p-6 shadow-sm space-y-6 ${
        className ?? ''
      }`}
    >
      <div className="flex items-center gap-3 border-b border-app-border pb-4">
        <div className="w-9 h-9 rounded-lg bg-navy-50 text-navy-800 flex items-center justify-center">
          <Palette className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-base font-bold text-navy-950 font-serif">
            Creative Studio & Render Intelligence
          </h3>
          <p className="text-xs text-app-muted">
            Scene graph rendering, deterministic approval governance, and multi-format exports
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg bg-app-surface-subtle border border-app-border">
          <div className="text-[11px] font-medium text-app-muted uppercase">Creative Projects</div>
          <div
            data-testid="creative-total-projects"
            className="text-2xl font-bold font-serif text-navy-950 mt-1"
          >
            {analytics.totalCreativeProjects}
          </div>
          <div className="text-[10px] text-app-muted mt-0.5">Authoritative projects</div>
        </div>

        <div className="p-4 rounded-lg bg-app-surface-subtle border border-app-border">
          <div className="text-[11px] font-medium text-app-muted uppercase">Render Attempts</div>
          <div
            data-testid="creative-total-renders"
            className="text-2xl font-bold font-serif text-navy-950 mt-1"
          >
            {analytics.renderAttempts}
          </div>
          <div className="text-[10px] text-app-muted mt-0.5">
            {analytics.successfulRenders} succeeded ({renderSuccessRate}%)
          </div>
        </div>

        <div className="p-4 rounded-lg bg-app-surface-subtle border border-app-border">
          <div className="text-[11px] font-medium text-app-muted uppercase">Approved Scenes</div>
          <div
            data-testid="creative-approved-scenes"
            className="text-2xl font-bold font-serif text-emerald-800 mt-1"
          >
            {analytics.approvedScenes}
          </div>
          <div className="text-[10px] text-app-muted mt-0.5">
            {analytics.rejectedScenes} rejected scenes
          </div>
        </div>

        <div className="p-4 rounded-lg bg-app-surface-subtle border border-app-border">
          <div className="text-[11px] font-medium text-app-muted uppercase">Export Artifacts</div>
          <div
            data-testid="creative-export-artifacts"
            className="text-2xl font-bold font-serif text-navy-950 mt-1"
          >
            {analytics.exportArtifacts}
          </div>
          <div className="text-[10px] text-app-muted mt-0.5">Approved binaries generated</div>
        </div>
      </div>

      {/* Format Breakdown */}
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-app-muted mb-3">
          Exports by Aspect Ratio / Format
        </h4>
        {analytics.byFormat.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {analytics.byFormat.map((fmt) => (
              <div
                key={fmt.format}
                data-testid={`format-${fmt.format}`}
                className="p-3.5 rounded-lg border border-app-border bg-app-surface-subtle flex items-center justify-between"
              >
                <div>
                  <span className="text-xs font-semibold text-app-primary">{fmt.format}</span>
                  <div className="text-[10px] text-app-muted">Poster export</div>
                </div>
                <span className="text-lg font-bold font-serif text-navy-900">{fmt.count}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4 text-app-muted text-xs border border-dashed border-app-border rounded-lg">
            No creative exports rendered yet.
          </div>
        )}
      </div>
    </div>
  );
};
