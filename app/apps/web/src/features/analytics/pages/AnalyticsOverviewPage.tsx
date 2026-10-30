import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { DollarSign, Sparkles, Layers, Palette, Send, ArrowRight, TrendingUp } from 'lucide-react';
import { usePermissions } from '../../auth/hooks/use-permissions.js';
import { Permission } from '../../../types/auth.types.js';
import { useAnalyticsOverview, useBudgetUtilization } from '../hooks/use-analytics.js';
import type { DateRangeParams } from '../types/analytics.types.js';
import { DateRangeFilter } from '../components/DateRangeFilter.js';
import { OperationalKpiCard } from '../components/OperationalKpiCard.js';
import { BudgetUtilizationCard } from '../components/BudgetUtilizationCard.js';

export const AnalyticsOverviewPage: React.FC = () => {
  const { hasPermission } = usePermissions();
  const [dateRange, setDateRange] = useState<DateRangeParams>({});

  const overviewQuery = useAnalyticsOverview(dateRange);
  const budgetQuery = useBudgetUtilization();

  const kpis = overviewQuery.data;
  const budget = budgetQuery.data;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-app-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-app-muted">
              Executive Intelligence
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gold-100 text-gold-900 border border-gold-200">
              Live Verified
            </span>
          </div>
          <h1 className="text-2xl font-bold text-navy-950 font-serif tracking-tight mt-1">
            Operational Analytics & Telemetry
          </h1>
          <p className="text-xs text-app-muted mt-1">
            Deterministic reporting grounded strictly in persisted relational entities.
          </p>
        </div>

        {hasPermission(Permission.VIEW_AI_COSTS) && (
          <Link
            to="/analytics/costs"
            data-testid="nav-cost-control-btn"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold shadow-sm transition-colors"
          >
            <DollarSign className="w-4 h-4 text-gold-400" />
            AI Cost & Budget Control
            <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Link>
        )}
      </div>

      {/* Date Range Filter */}
      <DateRangeFilter value={dateRange} onChange={setDateRange} />

      {/* Budget Utilization Card (if user has cost permissions) */}
      {hasPermission(Permission.VIEW_AI_COSTS) && budget && (
        <BudgetUtilizationCard
          utilization={budget}
          canManageBudget={hasPermission(Permission.MANAGE_AI_BUDGETS)}
        />
      )}

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <OperationalKpiCard
          title="Content Jobs"
          value={kpis?.totalContentJobs ?? 0}
          subtitle={`${kpis?.completedGenerations ?? 0} completed`}
          icon={<Sparkles className="w-4 h-4" />}
          testId="kpi-content-jobs"
        />
        <OperationalKpiCard
          title="Reviews Pending"
          value={kpis?.pendingReviews ?? 0}
          subtitle={`${kpis?.approvedVersions ?? 0} approved`}
          icon={<TrendingUp className="w-4 h-4" />}
          testId="kpi-pending-reviews"
        />
        <OperationalKpiCard
          title="Active Campaigns"
          value={kpis?.activeCampaigns ?? 0}
          subtitle="Orchestrated"
          icon={<Layers className="w-4 h-4" />}
          testId="kpi-active-campaigns"
        />
        <OperationalKpiCard
          title="Creative Projects"
          value={kpis?.creativeProjects ?? 0}
          subtitle="Multi-format renders"
          icon={<Palette className="w-4 h-4" />}
          testId="kpi-creative-projects"
        />
        <OperationalKpiCard
          title="Publications"
          value={kpis?.publicationsDelivered ?? 0}
          subtitle={`${kpis?.publicationsFailed ?? 0} failed`}
          icon={<Send className="w-4 h-4" />}
          testId="kpi-publications-delivered"
        />
        <OperationalKpiCard
          title="Total AI Cost"
          value={kpis ? `$${kpis.totalAiCostUsd.toFixed(2)}` : '$0.00'}
          subtitle={`$${kpis?.confirmedAiCostUsd.toFixed(2) ?? '0.00'} confirmed`}
          badgeText="USD"
          icon={<DollarSign className="w-4 h-4" />}
          testId="kpi-ai-cost"
        />
      </div>

      {/* Deep-Dive Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
        <Link
          to="/analytics/content"
          data-testid="card-link-content"
          className="p-5 rounded-xl border border-app-border bg-white hover:border-navy-300 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-navy-800">
              Content Studio
            </span>
            <ArrowRight className="w-4 h-4 text-app-muted group-hover:text-navy-900 group-hover:translate-x-1 transition-all" />
          </div>
          <p className="text-xs text-app-muted">
            Generation latency, prompt attempt rates, and Four-Eyes copy approvals.
          </p>
        </Link>

        <Link
          to="/analytics/campaigns"
          data-testid="card-link-campaigns"
          className="p-5 rounded-xl border border-app-border bg-white hover:border-navy-300 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-navy-800">
              Campaigns
            </span>
            <ArrowRight className="w-4 h-4 text-app-muted group-hover:text-navy-900 group-hover:translate-x-1 transition-all" />
          </div>
          <p className="text-xs text-app-muted">
            Marketing campaign orchestration and product catalog associations.
          </p>
        </Link>

        <Link
          to="/analytics/creative"
          data-testid="card-link-creative"
          className="p-5 rounded-xl border border-app-border bg-white hover:border-navy-300 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-navy-800">
              Creative Studio
            </span>
            <ArrowRight className="w-4 h-4 text-app-muted group-hover:text-navy-900 group-hover:translate-x-1 transition-all" />
          </div>
          <p className="text-xs text-app-muted">
            Scene graph rendering, approved revisions, and multi-format poster exports.
          </p>
        </Link>

        <Link
          to="/analytics/publishing"
          data-testid="card-link-publishing"
          className="p-5 rounded-xl border border-app-border bg-white hover:border-navy-300 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-navy-800">
              Publishing Desk
            </span>
            <ArrowRight className="w-4 h-4 text-app-muted group-hover:text-navy-900 group-hover:translate-x-1 transition-all" />
          </div>
          <p className="text-xs text-app-muted">
            Distribution channels, delivery outcomes, and publication attempts.
          </p>
        </Link>
      </div>
    </div>
  );
};
