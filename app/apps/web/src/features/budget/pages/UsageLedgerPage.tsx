import React, { useEffect, useState } from 'react';
import { RefreshCw, Search, Globe, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { budgetApi } from '../api/budget-api.js';
import type { UsageLedgerEntryRecord, LedgerEntryType } from '../types/budget.types.js';
import { Badge } from '../../../components/ui/badge.js';
import { Button } from '../../../components/ui/button.js';

export const UsageLedgerPage: React.FC = () => {
  const [entries, setEntries] = useState<readonly UsageLedgerEntryRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const loadLedger = async () => {
    try {
      setLoading(true);
      setError(null);

      const offset = (page - 1) * pageSize;
      const res = await budgetApi.listLedgerEntries({
        limit: pageSize,
        offset,
        entryType: selectedType === 'ALL' ? undefined : selectedType,
        reservationId: searchTerm.trim() ? searchTerm.trim() : undefined,
      });

      setEntries(res.items);
      setTotal(res.total);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to load usage ledger entries.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLedger();
  }, [page, selectedType]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    void loadLedger();
  };

  const getEntryBadge = (type: LedgerEntryType) => {
    switch (type) {
      case 'RESERVATION_CREATED':
      case 'RESERVATION_HOLD':
        return <Badge variant="gold">RESERVATION_HOLD</Badge>;
      case 'USAGE_COMMITTED':
      case 'COST_COMMITMENT':
        return <Badge variant="good">COST_COMMITMENT</Badge>;
      case 'RESERVATION_RELEASED':
      case 'RESERVATION_RELEASE':
        return <Badge variant="neutral">RESERVATION_RELEASE</Badge>;
      case 'USAGE_CORRECTION':
      case 'CORRECTION':
        return <Badge variant="bad">CORRECTION</Badge>;
      case 'RECONCILIATION_CONFIRMED':
        return <Badge variant="good">RECONCILIATION_CONFIRMED</Badge>;
      case 'RECONCILIATION_RELEASED':
        return <Badge variant="neutral">RECONCILIATION_RELEASED</Badge>;
      case 'UNKNOWN_OUTCOME_HOLD':
        return <Badge variant="warn">UNKNOWN_OUTCOME_HOLD</Badge>;
      default:
        return <Badge variant="neutral">{type}</Badge>;
    }
  };

  const totalPages = Math.ceil(total / pageSize) || 1;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-app-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-serif tracking-tight text-[#243746]">
              Immutable AI Usage Ledger
            </h1>
            <Badge variant="navy">Append-Only Audit Log</Badge>
          </div>
          <p className="text-xs text-app-muted mt-1">
            W50 immutable record of budget reservations, commitments, releases, corrections, and
            forex provenance
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void loadLedger()}
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

      {/* Controls & Filters Bar */}
      <div className="bg-app-surface border border-app-border rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Entry Type Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: 'ALL', label: 'All Entries' },
              { id: 'RESERVATION_HOLD', label: 'Reservation Holds' },
              { id: 'COST_COMMITMENT', label: 'Cost Commitments' },
              { id: 'RESERVATION_RELEASE', label: 'Releases' },
              { id: 'CORRECTION', label: 'Corrections' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setSelectedType(tab.id);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors shrink-0 ${
                  selectedType === tab.id
                    ? 'bg-[#243746] text-white shadow-xs'
                    : 'bg-app-surface-subtle text-app-muted hover:text-app-primary'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-app-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search reservation ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="text-xs pl-8 pr-3 py-1.5 rounded-xl border border-app-border bg-app-surface w-48 sm:w-64 focus:outline-hidden focus:ring-1 focus:ring-gold-500 font-mono"
              />
            </div>
            <Button type="submit" variant="secondary" size="sm">
              Search
            </Button>
          </form>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-app-surface border border-app-border rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-app-surface-subtle/80 text-[10px] font-bold uppercase tracking-wider text-app-muted border-b border-app-border">
              <tr>
                <th className="p-3.5">Entry Type</th>
                <th className="p-3.5">Reservation & Settlement</th>
                <th className="p-3.5">Model / Tokens</th>
                <th className="p-3.5 text-right">Confirmed Cost ($ USD)</th>
                <th className="p-3.5">Forex Provenance Tag</th>
                <th className="p-3.5">Recorded At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-border/60">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-app-surface-subtle/40 transition-colors">
                  {/* Entry Type */}
                  <td className="p-3.5 whitespace-nowrap">{getEntryBadge(entry.entryType)}</td>

                  {/* Reservation ID */}
                  <td className="p-3.5">
                    <div className="font-mono text-xs text-app-primary font-semibold">
                      {entry.reservationId}
                    </div>
                    <div className="text-[10px] text-app-muted font-mono truncate max-w-xs">
                      Key: {entry.settlementKey}
                    </div>
                  </td>

                  {/* Model / Tokens */}
                  <td className="p-3.5">
                    <div className="font-mono text-xs text-app-primary">
                      {entry.modelId ?? 'gpt-4o-mini'}
                    </div>
                    <div className="text-[10px] text-app-muted font-mono">
                      {entry.tokenCount !== undefined
                        ? `${entry.tokenCount} tokens`
                        : entry.attemptId
                          ? `Attempt: ${entry.attemptId.slice(0, 8)}`
                          : 'Standard Tokens'}
                    </div>
                  </td>

                  {/* Confirmed Cost in USD */}
                  <td className="p-3.5 text-right">
                    <div className="font-mono text-xs font-bold text-app-primary">
                      ${entry.amount.toFixed(4)} {entry.currency}
                    </div>
                    <div className="text-[10px] text-app-muted font-mono uppercase">
                      {entry.costKnowledge}
                    </div>
                  </td>

                  {/* Forex Provenance Tag */}
                  <td className="p-3.5">
                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-app-surface-subtle border border-app-border text-[11px] font-mono text-app-muted">
                      <Globe className="w-3 h-3 text-gold-500" />
                      <span>
                        {entry.exchangeRateSource ?? 'ECB_DAILY'} :{' '}
                        {entry.exchangeRate ? entry.exchangeRate.toFixed(4) : '1.0000'}{' '}
                        {entry.quoteCurrency ?? 'USD'}
                      </span>
                    </div>
                  </td>

                  {/* Recorded At */}
                  <td className="p-3.5 whitespace-nowrap text-app-muted text-[11px] font-mono">
                    {new Date(entry.recordedAt).toLocaleString()}
                  </td>
                </tr>
              ))}

              {entries.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-xs text-app-muted">
                    No ledger entries match the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-3.5 border-t border-app-border flex items-center justify-between text-xs text-app-muted">
          <span>
            Showing {entries.length} of {total} immutable entries
          </span>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              icon={<ChevronLeft className="w-3.5 h-3.5" />}
            >
              Previous
            </Button>
            <span className="font-mono text-xs font-semibold text-app-primary">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
              icon={<ChevronRight className="w-3.5 h-3.5" />}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
