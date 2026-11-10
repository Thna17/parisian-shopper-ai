import React, { useEffect, useState } from 'react';
import {
  DollarSign,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  Sliders,
  CheckCircle2,
  Lock,
  Layers,
  Zap,
} from 'lucide-react';
import { budgetApi } from '../api/budget-api.js';
import type {
  ActiveBudgetReport,
  BudgetPolicyRecord,
  ProviderRoutingCapability,
  UpdateBudgetPolicyParams,
} from '../types/budget.types.js';
import { CircuitBreakerStatusCard } from '../components/CircuitBreakerStatusCard.js';
import { Badge } from '../../../components/ui/badge.js';
import { Button } from '../../../components/ui/button.js';

export const BudgetOverviewPage: React.FC = () => {
  const [activeReport, setActiveReport] = useState<ActiveBudgetReport | null>(null);
  const [policies, setPolicies] = useState<readonly BudgetPolicyRecord[]>([]);
  const [routerCapability, setRouterCapability] = useState<ProviderRoutingCapability | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Policy update modal state
  const [isUpdateOpen, setIsUpdateOpen] = useState(false);
  const [monthlyCeiling, setMonthlyCeiling] = useState<number>(20);
  const [dailyCeiling, setDailyCeiling] = useState<number>(10);
  const [softAlertThreshold, setSoftAlertThreshold] = useState<number>(0.8);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [report, allPolicies, routing] = await Promise.all([
        budgetApi.getActivePolicy(),
        budgetApi.listPolicies(),
        budgetApi
          .getRouterCapabilities({ modality: 'TEXT', capability: 'TEXT_GENERATION' })
          .catch(() => null),
      ]);

      setActiveReport(report);
      setPolicies(allPolicies);
      if (routing && typeof routing === 'object' && 'providerId' in routing) {
        setRouterCapability(routing as ProviderRoutingCapability);
      }
      if (report.policy) {
        setMonthlyCeiling(report.policy.monthlyCeiling);
        setDailyCeiling(report.policy.dailyCeiling);
        setSoftAlertThreshold(report.policy.softAlertThreshold);
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to load AI financial governance data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleUpdatePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeReport?.policy) return;

    try {
      setActionLoading(true);
      setError(null);

      const params: UpdateBudgetPolicyParams = {
        monthlyCeiling,
        dailyCeiling,
        softAlertThreshold,
      };

      await budgetApi.updatePolicy(activeReport.policy.id, params);
      setSuccessMessage('AI budget policy updated successfully.');
      setIsUpdateOpen(false);
      await loadData();
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to update budget policy.');
    } finally {
      setActionLoading(false);
    }
  };

  const quota = activeReport?.quota;
  const policy = activeReport?.policy;

  // Spend calculations
  const dailySpend = quota?.totalSettledSpendDay ?? 0;
  const dailyLimit = quota?.dailyCeiling ?? policy?.dailyCeiling ?? 10;
  const dailyPct = dailyLimit > 0 ? Math.min(100, (dailySpend / dailyLimit) * 100) : 0;

  const monthlySpend = quota?.totalSettledSpendMonth ?? 0;
  const monthlyLimit = quota?.monthlyCeiling ?? policy?.monthlyCeiling ?? 20;
  const monthlyPct = monthlyLimit > 0 ? Math.min(100, (monthlySpend / monthlyLimit) * 100) : 0;

  const thresholdPct = Math.round(
    (quota?.softAlertThreshold ?? policy?.softAlertThreshold ?? 0.8) * 100,
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-app-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-serif tracking-tight text-[#243746]">
              Enterprise AI Budget & Usage Governance
            </h1>
          </div>
          <p className="text-xs text-app-muted mt-1">
            Budget policy, reservation exposure, and provider routing
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void loadData()}
            icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>
          {policy && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsUpdateOpen(true)}
              icon={<Sliders className="w-3.5 h-3.5" />}
            >
              Configure Policy
            </Button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Soft Alert Banner */}
      {quota?.isSoftAlertTriggered && (
        <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-2xl flex items-center justify-between gap-3 text-amber-900">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider">
                Dynamic Soft-Alert Threshold Exceeded ({thresholdPct}%)
              </h2>
              <p className="text-xs mt-0.5 text-amber-800">
                Monthly commitment has reached or surpassed the {thresholdPct}% soft ceiling warning
                limit. Hard caps remain actively enforced.
              </p>
            </div>
          </div>
          <Badge variant="warn">Warning Threshold Active</Badge>
        </div>
      )}

      {!loading && !error && !policy && (
        <div
          role="status"
          className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900"
        >
          No active budget policy is configured. Spending limits and utilization are unavailable.
        </div>
      )}
      {/* Progress Gauges Grid */}
      {policy && quota && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Daily Spend Gauge */}
          <div className="bg-app-surface border border-app-border rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-gold-500" />
                <h2 className="font-serif font-bold text-sm text-[#243746]">
                  Daily Spend vs Daily Ceiling
                </h2>
              </div>
              <span className="font-mono text-xs font-bold text-app-primary">
                ${dailySpend.toFixed(3)} / ${dailyLimit.toFixed(2)}
              </span>
            </div>

            {/* Gauge Bar */}
            <div className="space-y-1.5">
              <div className="w-full h-3 rounded-full bg-app-surface-subtle overflow-hidden border border-app-border/40">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    dailyPct >= 100
                      ? 'bg-rose-600'
                      : dailyPct >= thresholdPct
                        ? 'bg-amber-500'
                        : 'bg-emerald-600'
                  }`}
                  style={{ width: `${dailyPct}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-app-muted font-mono">
                <span>{dailyPct.toFixed(1)}% Utilized</span>
                <span>
                  Remaining: $
                  {(quota?.remainingDailyHeadroom ?? Math.max(0, dailyLimit - dailySpend)).toFixed(
                    3,
                  )}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-app-border/60 flex items-center justify-between text-xs text-app-muted">
              <span className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-app-muted" />
                Policy hard cap:
              </span>
              <span className="font-semibold text-app-primary">
                {policy?.enforceHardCap ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>

          {/* Monthly Spend Gauge */}
          <div className="bg-app-surface border border-app-border rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-gold-500" />
                <h2 className="font-serif font-bold text-sm text-[#243746]">
                  Monthly Spend vs Monthly Ceiling
                </h2>
              </div>
              <span className="font-mono text-xs font-bold text-app-primary">
                ${monthlySpend.toFixed(3)} / ${monthlyLimit.toFixed(2)}
              </span>
            </div>

            {/* Gauge Bar with Dynamic Soft-Alert Indicator */}
            <div className="space-y-1.5">
              <div className="relative w-full h-3 rounded-full bg-app-surface-subtle overflow-hidden border border-app-border/40">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    monthlyPct >= 100
                      ? 'bg-rose-600'
                      : monthlyPct >= thresholdPct
                        ? 'bg-amber-500'
                        : 'bg-gold-500'
                  }`}
                  style={{ width: `${monthlyPct}%` }}
                />
                {/* Soft alert threshold tick */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-rose-600 z-10"
                  style={{ left: `${thresholdPct}%` }}
                  title={`Soft Alert Threshold: ${thresholdPct}%`}
                />
              </div>
              <div className="flex justify-between text-[11px] text-app-muted font-mono">
                <span>{monthlyPct.toFixed(1)}% Utilized</span>
                <span className="text-amber-800 font-semibold">
                  Alert Threshold: {thresholdPct}%
                </span>
                <span>
                  Remaining: $
                  {(
                    quota?.remainingMonthlyHeadroom ?? Math.max(0, monthlyLimit - monthlySpend)
                  ).toFixed(3)}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-app-border/60 flex items-center justify-between text-xs text-app-muted">
              <span>Active Reserved Exposure:</span>
              <span className="font-mono font-semibold text-gold-600">
                ${(quota?.activeReservedExposure ?? 0).toFixed(4)} USD
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Circuit Breakers Section */}
      <CircuitBreakerStatusCard />

      {/* Provider Capabilities & Fallback Routing Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Router Routing Health */}
        <div className="lg:col-span-2 bg-app-surface border border-app-border rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-app-border/70">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-gold-500" />
              <h2 className="font-serif font-bold text-sm text-[#243746]">
                Provider Capability Routing Health
              </h2>
            </div>
          </div>
          {routerCapability ? (
            <p className="text-xs text-app-muted">
              Selected provider: {routerCapability.providerId} · {routerCapability.modelId} ·{' '}
              {routerCapability.capability}
            </p>
          ) : (
            <p className="text-xs text-app-muted">Provider routing information is unavailable.</p>
          )}
        </div>

        {/* Policy Versions Archive */}
        <div className="bg-app-surface border border-app-border rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-app-border/70">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-gold-500" />
              <h2 className="font-serif font-bold text-sm text-[#243746]">
                Policy Revisions ({policies.length})
              </h2>
            </div>
            <span className="text-[10px] font-mono text-app-muted">
              {policy ? `v${policy.version}` : 'No active policy'}
            </span>
          </div>

          <div className="space-y-2 max-h-[220px] overflow-y-auto">
            {policies.map((pol) => (
              <div
                key={pol.id}
                className="p-3 rounded-xl border border-app-border/80 bg-app-surface text-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-app-primary font-mono">
                    Policy v{pol.version}
                  </span>
                  <Badge variant={pol.id === policy?.id ? 'good' : 'neutral'}>
                    {pol.id === policy?.id ? 'ACTIVE' : 'HISTORICAL'}
                  </Badge>
                </div>
                <div className="text-[11px] text-app-muted flex justify-between">
                  <span>Cap: ${pol.monthlyCeiling}/mo</span>
                  <span>Alert: {Math.round(pol.softAlertThreshold * 100)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Configure Policy Modal */}
      {isUpdateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-app-surface border border-app-border rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-[#243746] font-serif font-bold text-base">
              <Sliders className="w-5 h-5 text-gold-500" />
              <h2>Configure AI Financial Policy</h2>
            </div>

            <p className="text-xs text-app-muted">
              Adjust monthly and daily financial spend limits and soft alert thresholds.
            </p>

            <form onSubmit={(e) => void handleUpdatePolicy(e)} className="space-y-3">
              <div className="space-y-1">
                <label
                  htmlFor="monthly-ceiling-input"
                  className="text-xs font-medium text-app-primary"
                >
                  Monthly Ceiling ($ USD)
                </label>
                <input
                  id="monthly-ceiling-input"
                  type="number"
                  step="0.5"
                  min="1"
                  required
                  value={monthlyCeiling}
                  onChange={(e) => setMonthlyCeiling(Number(e.target.value))}
                  className="w-full text-xs p-2.5 rounded-xl border border-app-border bg-app-surface focus:outline-hidden focus:ring-1 focus:ring-gold-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="daily-ceiling-input"
                  className="text-xs font-medium text-app-primary"
                >
                  Daily Ceiling ($ USD)
                </label>
                <input
                  id="daily-ceiling-input"
                  type="number"
                  step="0.5"
                  min="0.5"
                  required
                  value={dailyCeiling}
                  onChange={(e) => setDailyCeiling(Number(e.target.value))}
                  className="w-full text-xs p-2.5 rounded-xl border border-app-border bg-app-surface focus:outline-hidden focus:ring-1 focus:ring-gold-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="soft-alert-threshold-input"
                  className="text-xs font-medium text-app-primary"
                >
                  Dynamic Soft-Alert Threshold (0.50–0.99)
                </label>
                <input
                  id="soft-alert-threshold-input"
                  type="number"
                  step="0.05"
                  min="0.5"
                  max="0.99"
                  required
                  value={softAlertThreshold}
                  onChange={(e) => setSoftAlertThreshold(Number(e.target.value))}
                  className="w-full text-xs p-2.5 rounded-xl border border-app-border bg-app-surface focus:outline-hidden focus:ring-1 focus:ring-gold-500 font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <Button variant="ghost" size="sm" onClick={() => setIsUpdateOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm" disabled={actionLoading}>
                  Save Policy
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
