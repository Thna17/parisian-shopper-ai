import React, { useState } from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import type { ReconcileInput, UnreconciledUsage } from '../types/analytics.types.js';

interface UnreconciledUsagePanelProps {
  readonly items: readonly UnreconciledUsage[];
  readonly onReconcile: (id: string, input: ReconcileInput) => Promise<void>;
  readonly isReconciling?: boolean;
  readonly className?: string;
}

export const UnreconciledUsagePanel: React.FC<UnreconciledUsagePanelProps> = ({
  items,
  onReconcile,
  isReconciling = false,
  className,
}) => {
  const [selectedItem, setSelectedItem] = useState<UnreconciledUsage | null>(null);
  const [resolution, setResolution] = useState<
    'SETTLE_CONFIRMED' | 'RELEASE_UNBILLED' | 'MANUAL_ADJUSTMENT'
  >('SETTLE_CONFIRMED');
  const [confirmedCost, setConfirmedCost] = useState<string>('0.0050');
  const [notes, setNotes] = useState<string>(
    'Reconciled provider timeout via provider dashboard audit',
  );

  if (items.length === 0) {
    return (
      <div
        data-testid="no-unreconciled-banner"
        className={`bg-white rounded-xl border border-app-border p-5 shadow-sm flex items-center gap-3 text-xs text-app-muted ${className ?? ''}`}
      >
        <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
        <span>All AI reservations are fully reconciled. No pending provider exposure.</span>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    await onReconcile(selectedItem.reservationId, {
      resolution,
      confirmedCost: resolution === 'RELEASE_UNBILLED' ? 0 : parseFloat(confirmedCost),
      notes,
    });
    setSelectedItem(null);
  };

  return (
    <div
      data-testid="unreconciled-usage-panel"
      className={`bg-white rounded-xl border border-amber-200 p-6 shadow-sm space-y-4 ${
        className ?? ''
      }`}
    >
      <div className="flex items-center gap-3 text-amber-900 border-b border-amber-100 pb-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
        <div>
          <h3 className="text-sm font-bold">Unreconciled Provider Dispatches ({items.length})</h3>
          <p className="text-xs text-amber-800">
            Requests that timed out during upstream dispatch. Reservations remain held until audit
            reconciliation.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto border border-app-border rounded-lg">
        <table className="min-w-full divide-y divide-app-border text-xs">
          <thead className="bg-app-surface-subtle font-medium text-app-muted">
            <tr>
              <th className="px-4 py-2 text-left">Reservation ID</th>
              <th className="px-4 py-2 text-left">Reason</th>
              <th className="px-4 py-2 text-right">Exposure Held</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-app-border bg-white text-app-primary">
            {items.map((item) => (
              <tr key={item.reservationId} data-testid={`unreconciled-row-${item.reservationId}`}>
                <td className="px-4 py-2.5 font-mono text-[11px] text-navy-950 font-medium">
                  {item.reservationId}
                </td>
                <td className="px-4 py-2.5 text-app-muted">{item.reason}</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-amber-800">
                  ${item.reservedAmount.toFixed(4)}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    type="button"
                    data-testid={`reconcile-btn-${item.reservationId}`}
                    onClick={() => {
                      setSelectedItem(item);
                      setConfirmedCost(item.reservedAmount.toFixed(4));
                    }}
                    className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white font-medium text-[11px] transition-colors"
                  >
                    Reconcile
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal Dialog for Reconciliation */}
      {selectedItem && (
        <div
          data-testid="reconcile-modal"
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4 border border-app-border">
            <h4 className="text-base font-bold text-navy-950 font-serif">
              Reconcile Provider Reservation
            </h4>
            <p className="text-xs text-app-muted">
              Reservation ID:{' '}
              <span className="font-mono text-navy-900">{selectedItem.reservationId}</span>
            </p>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-app-muted uppercase font-semibold mb-1">
                  Resolution Type
                </label>
                <select
                  data-testid="reconcile-resolution-select"
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg border border-app-border bg-white text-xs"
                >
                  <option value="SETTLE_CONFIRMED">Settle Confirmed Cost (Provider billed)</option>
                  <option value="RELEASE_UNBILLED">Release Unbilled (Provider dropped)</option>
                  <option value="MANUAL_ADJUSTMENT">Manual Adjustment</option>
                </select>
              </div>

              {resolution !== 'RELEASE_UNBILLED' && (
                <div>
                  <label className="block text-app-muted uppercase font-semibold mb-1">
                    Confirmed Cost (USD)
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    data-testid="reconcile-cost-input"
                    value={confirmedCost}
                    onChange={(e) => setConfirmedCost(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-app-border bg-white text-xs font-mono"
                  />
                </div>
              )}

              <div>
                <label className="block text-app-muted uppercase font-semibold mb-1">
                  Audit Notes / Reason
                </label>
                <textarea
                  required
                  rows={2}
                  data-testid="reconcile-notes-input"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-app-border bg-white text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className="px-3 py-1.5 rounded-lg border border-app-border text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isReconciling}
                  data-testid="confirm-reconciliation-btn"
                  className="px-3 py-1.5 rounded-lg bg-navy-900 hover:bg-navy-800 text-white text-xs font-medium"
                >
                  {isReconciling ? 'Reconciling...' : 'Confirm Reconciliation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
