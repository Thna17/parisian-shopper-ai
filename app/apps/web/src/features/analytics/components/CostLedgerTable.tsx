import React from 'react';
import type { PaginatedCostLedger } from '../types/analytics.types.js';

interface CostLedgerTableProps {
  readonly data?: PaginatedCostLedger;
  readonly isLoading?: boolean;
  readonly page: number;
  readonly onPageChange: (newPage: number) => void;
  readonly className?: string;
}

export const CostLedgerTable: React.FC<CostLedgerTableProps> = ({
  data,
  isLoading = false,
  page,
  onPageChange,
  className,
}) => {
  return (
    <div
      data-testid="cost-ledger-table-container"
      className={`bg-white rounded-xl border border-app-border p-6 shadow-sm space-y-4 ${
        className ?? ''
      }`}
    >
      <div className="flex items-center justify-between border-b border-app-border pb-4">
        <div>
          <h3 className="text-base font-bold text-navy-950 font-serif">
            Financial Cost & Reservation Ledger
          </h3>
          <p className="text-xs text-app-muted">
            Atomic pre-dispatch reservations and settled provider expense accounting
          </p>
        </div>
        {data && (
          <span className="text-xs text-app-muted font-medium">
            Showing {data.items.length} of {data.total} transactions
          </span>
        )}
      </div>

      <div className="overflow-x-auto border border-app-border rounded-lg">
        <table
          data-testid="cost-ledger-table"
          className="min-w-full divide-y divide-app-border text-xs"
        >
          <thead className="bg-app-surface-subtle font-medium text-app-muted">
            <tr>
              <th className="px-4 py-2.5 text-left">Type</th>
              <th className="px-4 py-2.5 text-left">Provider / Model</th>
              <th className="px-4 py-2.5 text-center">Status</th>
              <th className="px-4 py-2.5 text-center">Cost State</th>
              <th className="px-4 py-2.5 text-right">Tokens (In / Out)</th>
              <th className="px-4 py-2.5 text-right">Amount ($)</th>
              <th className="px-4 py-2.5 text-left">Idempotency Key</th>
              <th className="px-4 py-2.5 text-right">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-app-border bg-white text-app-primary">
            {isLoading ? (
              <tr>
                <td colSpan={8} className="text-center py-8 text-app-muted">
                  Loading ledger transactions...
                </td>
              </tr>
            ) : !data || data.items.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-8 text-app-muted">
                  No ledger entries recorded.
                </td>
              </tr>
            ) : (
              data.items.map((item) => (
                <tr
                  key={item.id}
                  data-testid={`ledger-row-${item.id}`}
                  className="hover:bg-app-surface-subtle/50"
                >
                  <td className="px-4 py-2.5">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        item.type === 'RESERVATION'
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      }`}
                    >
                      {item.type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-medium text-navy-900">
                    <div>{item.model}</div>
                    <div className="text-[10px] text-app-muted">{item.provider}</div>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className="font-mono text-[10px] uppercase">{item.status}</span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                        item.costKnowledge === 'CONFIRMED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {item.costKnowledge}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-[11px]">
                    {item.inputTokens !== null ? item.inputTokens.toLocaleString() : '-'} /{' '}
                    {item.outputTokens !== null ? item.outputTokens.toLocaleString() : '-'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-navy-950">
                    ${item.amountUsd.toFixed(4)}
                  </td>
                  <td
                    className="px-4 py-2.5 font-mono text-[10px] text-app-muted truncate max-w-[140px]"
                    title={item.idempotencyKey}
                  >
                    {item.idempotencyKey ?? '-'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-app-muted whitespace-nowrap">
                    {new Date(item.createdAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-app-muted">
            Page {data.page} of {data.totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="px-3 py-1 rounded-md border border-app-border text-xs font-medium disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= data.totalPages}
              onClick={() => onPageChange(page + 1)}
              className="px-3 py-1 rounded-md border border-app-border text-xs font-medium disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
