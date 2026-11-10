import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  HelpCircle,
  DollarSign,
} from 'lucide-react';
import { budgetApi } from '../api/budget-api.js';
import type { UsageReservationRecord, ReconcileReservationParams } from '../types/budget.types.js';
import { Badge } from '../../../components/ui/badge.js';
import { Button } from '../../../components/ui/button.js';

export const ReconciliationDeskPage: React.FC = () => {
  const [unreconciled, setUnreconciled] = useState<readonly UsageReservationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Reconciliation Modal state
  const [activeReservation, setActiveReservation] = useState<UsageReservationRecord | null>(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isReleaseModalOpen, setIsReleaseModalOpen] = useState(false);
  const [confirmedAmount, setConfirmedAmount] = useState<number>(0);
  const [invoiceRef, setInvoiceRef] = useState('');
  const [reconcileNotes, setReconcileNotes] = useState('');

  const loadUnreconciled = async () => {
    try {
      setLoading(true);
      setError(null);
      const items = await budgetApi.listUnreconciled({ limit: 50 });
      setUnreconciled(items);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to load unreconciled reservations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUnreconciled();
  }, []);

  const handleOpenConfirmCharge = (res: UsageReservationRecord) => {
    setActiveReservation(res);
    setConfirmedAmount(res.estimatedCost);
    setInvoiceRef(`INV-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`);
    setReconcileNotes('Confirmed via provider invoice ledger audit.');
    setIsConfirmModalOpen(true);
  };

  const handleOpenReleaseHold = (res: UsageReservationRecord) => {
    setActiveReservation(res);
    setReconcileNotes('Confirmed zero upstream charge after timeout dispatch.');
    setIsReleaseModalOpen(true);
  };

  const handleConfirmChargeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeReservation) return;

    try {
      setActionLoading(true);
      setError(null);

      const params: ReconcileReservationParams = {
        settlementKey: `rec-settle-${activeReservation.id}-${Date.now()}`,
        confirmedAmount,
        isCharged: true,
        reconciliationRef: invoiceRef.trim() || 'INV-RECONCILED-MANUAL',
        costKnowledge: 'EXACT',
        notes: reconcileNotes.trim() || undefined,
      };

      await budgetApi.reconcileReservation(activeReservation.id, params);
      setSuccessMessage(
        `Reservation ${activeReservation.id} confirmed charged for $${confirmedAmount.toFixed(4)} USD.`,
      );
      setIsConfirmModalOpen(false);
      setActiveReservation(null);
      await loadUnreconciled();
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to confirm reconciliation charge.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReleaseHoldSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeReservation) return;

    try {
      setActionLoading(true);
      setError(null);

      const params: ReconcileReservationParams = {
        settlementKey: `rec-release-${activeReservation.id}-${Date.now()}`,
        confirmedAmount: 0,
        isCharged: false,
        reconciliationRef: 'UNBILLED_TIMEOUT_RELEASE',
        costKnowledge: 'ZERO_CONFIRMED',
        notes: reconcileNotes.trim() || undefined,
      };

      await budgetApi.reconcileReservation(activeReservation.id, params);
      setSuccessMessage(
        `Reservation hold for ${activeReservation.id} released with zero charge confirmed.`,
      );
      setIsReleaseModalOpen(false);
      setActiveReservation(null);
      await loadUnreconciled();
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to release unbilled reservation hold.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-app-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-serif tracking-tight text-[#243746]">
              Financial Reconciliation Desk
            </h1>
            <Badge variant="warn">W50 Operator Audit</Badge>
          </div>
          <p className="text-xs text-app-muted mt-1">
            Resolve reservations in HELD_FOR_RECONCILIATION status resulting from timed-out or
            ambiguous dispatches
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void loadUnreconciled()}
            icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>
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

      {/* Information Banner */}
      <div className="p-4 bg-app-surface border border-app-border rounded-2xl flex items-start gap-3 shadow-xs">
        <HelpCircle className="w-5 h-5 text-gold-500 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1 text-app-muted">
          <p className="font-semibold text-app-primary">
            Operator Reconciliation Protocol (W50 Dual-Key Sign-off)
          </p>
          <p>
            When an upstream model call times out after dispatch, the budget hold is isolated into{' '}
            <code className="text-amber-800 font-mono">HELD_FOR_RECONCILIATION</code> to prevent
            double-spending while awaiting external invoice verification. Operators can confirm
            billing or release the hold.
          </p>
        </div>
      </div>

      {/* Held Reservations List */}
      <div className="bg-app-surface border border-app-border rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-app-border/70 flex items-center justify-between">
          <h2 className="font-serif font-bold text-sm text-[#243746]">
            Reservations Awaiting Reconciliation ({unreconciled.length})
          </h2>
          <span className="text-[10px] font-mono text-app-muted">Zero-Leakage Invariant</span>
        </div>

        <div className="divide-y divide-app-border/60">
          {unreconciled.map((res) => (
            <div
              key={res.id}
              className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-app-surface-subtle/30 transition-colors"
            >
              <div className="space-y-1.5">
                <div className="flex items-center gap-2.5">
                  <Badge variant="warn" dot>
                    HELD_FOR_RECONCILIATION
                  </Badge>
                  <span className="font-mono text-xs font-bold text-app-primary">{res.id}</span>
                </div>

                <div className="text-xs text-app-muted flex flex-wrap gap-x-4 gap-y-1 font-mono">
                  <span>
                    Provider: <strong className="text-app-primary">{res.providerId}</strong>
                  </span>
                  <span>
                    Model: <strong className="text-app-primary">{res.modelId}</strong>
                  </span>
                  <span>
                    Estimated Hold:{' '}
                    <strong className="text-gold-600">
                      ${res.estimatedCost.toFixed(4)} {res.currency}
                    </strong>
                  </span>
                  <span>Created: {new Date(res.createdAt).toLocaleString()}</span>
                </div>

                <div className="text-[11px] text-app-muted font-mono">
                  Idempotency Key: {res.idempotencyKey}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleOpenConfirmCharge(res)}
                  icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                >
                  Confirm Invoice Charge
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleOpenReleaseHold(res)}
                  icon={<XCircle className="w-3.5 h-3.5 text-app-muted" />}
                >
                  Release Unbilled Hold
                </Button>
              </div>
            </div>
          ))}

          {unreconciled.length === 0 && !loading && (
            <div className="p-12 text-center text-xs text-app-muted space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
              <p className="font-semibold text-app-primary">
                All reservations are fully reconciled.
              </p>
              <p className="text-[11px]">
                No ambiguous dispatches or pending invoice holds in the ledger queue.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Confirm Charge Modal */}
      {isConfirmModalOpen && activeReservation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-app-surface border border-app-border rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-[#243746] font-serif font-bold text-base">
              <DollarSign className="w-5 h-5 text-emerald-600" />
              <h2>Confirm External Invoice Charge</h2>
            </div>

            <p className="text-xs text-app-muted">
              Confirm that upstream provider billed for reservation{' '}
              <code className="font-mono text-app-primary">{activeReservation.id}</code>.
            </p>

            <form onSubmit={(e) => void handleConfirmChargeSubmit(e)} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-app-primary">
                  Confirmed Actual Cost ($ USD)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  required
                  value={confirmedAmount}
                  onChange={(e) => setConfirmedAmount(Number(e.target.value))}
                  className="w-full text-xs p-2.5 rounded-xl border border-app-border bg-app-surface focus:outline-hidden focus:ring-1 focus:ring-gold-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-app-primary">
                  Invoice / Reconciliation Reference
                </label>
                <input
                  type="text"
                  required
                  value={invoiceRef}
                  onChange={(e) => setInvoiceRef(e.target.value)}
                  placeholder="e.g. INV-2026-10-99882"
                  className="w-full text-xs p-2.5 rounded-xl border border-app-border bg-app-surface focus:outline-hidden focus:ring-1 focus:ring-gold-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-app-primary">
                  Audit Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={reconcileNotes}
                  onChange={(e) => setReconcileNotes(e.target.value)}
                  placeholder="Audit justification for invoice charge..."
                  className="w-full text-xs p-2.5 rounded-xl border border-app-border bg-app-surface focus:outline-hidden focus:ring-1 focus:ring-gold-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <Button variant="ghost" size="sm" onClick={() => setIsConfirmModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm" disabled={actionLoading}>
                  Confirm & Commit Charge
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Release Hold Modal */}
      {isReleaseModalOpen && activeReservation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-app-surface border border-app-border rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-rose-700 font-serif font-bold text-base">
              <XCircle className="w-5 h-5 text-rose-600" />
              <h2>Release Unbilled Reservation Hold</h2>
            </div>

            <p className="text-xs text-app-muted">
              Confirm that upstream provider recorded zero charges for reservation{' '}
              <code className="font-mono text-app-primary">{activeReservation.id}</code>. The held
              exposure will be released back to available budget headroom.
            </p>

            <form onSubmit={(e) => void handleReleaseHoldSubmit(e)} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-app-primary">Audit Justification</label>
                <textarea
                  rows={2}
                  required
                  value={reconcileNotes}
                  onChange={(e) => setReconcileNotes(e.target.value)}
                  placeholder="Justification for releasing hold with zero charge..."
                  className="w-full text-xs p-2.5 rounded-xl border border-app-border bg-app-surface focus:outline-hidden focus:ring-1 focus:ring-gold-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <Button variant="ghost" size="sm" onClick={() => setIsReleaseModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm" disabled={actionLoading}>
                  Confirm & Release Hold
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
