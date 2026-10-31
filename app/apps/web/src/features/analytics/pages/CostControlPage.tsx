import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePermissions } from '../../auth/hooks/use-permissions.js';
import { Permission } from '../../../types/auth.types.js';
import {
  useAiUsageAnalytics,
  useBudgetUtilization,
  useCostLedger,
  useReconcileUsage,
  useUnreconciledUsage,
  useUpdateBudget,
} from '../hooks/use-analytics.js';
import { BudgetUtilizationCard } from '../components/BudgetUtilizationCard.js';
import { AiUsagePanel } from '../components/AiUsagePanel.js';
import { UnreconciledUsagePanel } from '../components/UnreconciledUsagePanel.js';
import { CostLedgerTable } from '../components/CostLedgerTable.js';
import type { ReconcileInput } from '../types/analytics.types.js';

export const CostControlPage: React.FC = () => {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission(Permission.MANAGE_AI_BUDGETS);

  const [page, setPage] = useState(1);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [monthlyCeilingInput, setMonthlyCeilingInput] = useState<string>('20.00');
  const [softAlertInput, setSoftAlertInput] = useState<string>('0.80');

  const budgetQuery = useBudgetUtilization();
  const aiUsageQuery = useAiUsageAnalytics();
  const unreconciledQuery = useUnreconciledUsage();
  const costLedgerQuery = useCostLedger({ page, limit: 10 });

  const updateBudgetMutation = useUpdateBudget();
  const reconcileMutation = useReconcileUsage();

  const budget = budgetQuery.data;
  const aiUsage = aiUsageQuery.data;
  const unreconciled = unreconciledQuery.data ?? [];
  const ledger = costLedgerQuery.data;

  const handleUpdateBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!budget) return;
    await updateBudgetMutation.mutateAsync({
      id: budget.policyId,
      input: {
        monthlyCeiling: parseFloat(monthlyCeilingInput),
        softAlertThreshold: parseFloat(softAlertInput),
      },
    });
    setIsBudgetModalOpen(false);
  };

  const handleReconcile = async (id: string, input: ReconcileInput) => {
    await reconcileMutation.mutateAsync({ id, input });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-app-border pb-5">
        <div>
          <Link
            to="/analytics"
            className="inline-flex items-center gap-1.5 text-xs text-app-muted hover:text-navy-900 mb-2 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Analytics Overview
          </Link>
          <h1 className="text-2xl font-bold text-navy-950 font-serif tracking-tight">
            AI Cost Ledger & Enforceable Spending Limits
          </h1>
          <p className="text-xs text-app-muted mt-1">
            Real-time atomic budget reservations, micro-dollar pricing, and strict provider spending
            caps.
          </p>
        </div>
      </div>

      {/* Budget Utilization Card */}
      {budget && (
        <BudgetUtilizationCard
          utilization={budget}
          canManageBudget={canManage}
          onOpenBudgetModal={() => {
            setMonthlyCeilingInput(budget.monthlyCeiling.toFixed(2));
            setSoftAlertInput(budget.softAlertThreshold.toFixed(2));
            setIsBudgetModalOpen(true);
          }}
        />
      )}

      {/* Unreconciled Provider Dispatches */}
      <UnreconciledUsagePanel
        items={unreconciled}
        onReconcile={handleReconcile}
        isReconciling={reconcileMutation.isPending}
      />

      {/* AI Token & Model Usage Breakdown */}
      {aiUsage && <AiUsagePanel analytics={aiUsage} />}

      {/* Cost Ledger Table */}
      <CostLedgerTable
        data={ledger}
        isLoading={costLedgerQuery.isLoading}
        page={page}
        onPageChange={setPage}
      />

      {/* Adjust Budget Policy Modal */}
      {isBudgetModalOpen && budget && (
        <div
          data-testid="adjust-budget-modal"
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4 border border-app-border">
            <h4 className="text-base font-bold text-navy-950 font-serif">
              Configure Monthly AI Operating Budget
            </h4>
            <p className="text-xs text-app-muted">
              Current policy ID: <span className="font-mono text-navy-900">{budget.policyId}</span>
            </p>

            <form onSubmit={handleUpdateBudget} className="space-y-4 text-xs">
              <div>
                <label className="block text-app-muted uppercase font-semibold mb-1">
                  Monthly Ceiling (USD)
                </label>
                <input
                  type="number"
                  step="1.00"
                  min="1"
                  required
                  data-testid="budget-ceiling-input"
                  value={monthlyCeilingInput}
                  onChange={(e) => setMonthlyCeilingInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-app-border bg-white text-xs font-mono"
                />
                <span className="text-[10px] text-app-muted mt-1 block">
                  Hard fail-closed ceiling. Dispatches automatically reject when reached.
                </span>
              </div>

              <div>
                <label className="block text-app-muted uppercase font-semibold mb-1">
                  Soft Alert Threshold (0.01 - 0.99)
                </label>
                <input
                  type="number"
                  step="0.05"
                  min="0.1"
                  max="0.99"
                  required
                  data-testid="budget-threshold-input"
                  value={softAlertInput}
                  onChange={(e) => setSoftAlertInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-app-border bg-white text-xs font-mono"
                />
                <span className="text-[10px] text-app-muted mt-1 block">
                  Triggers warning banner in dashboard before hard cap is reached.
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsBudgetModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-app-border text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateBudgetMutation.isPending}
                  data-testid="save-budget-btn"
                  className="px-3 py-1.5 rounded-lg bg-navy-900 hover:bg-navy-800 text-white text-xs font-medium"
                >
                  {updateBudgetMutation.isPending ? 'Saving...' : 'Save Budget Policy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
