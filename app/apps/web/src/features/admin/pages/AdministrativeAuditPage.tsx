import React, { useEffect, useState, useCallback } from 'react';
import { Shield, Search, Filter, ChevronLeft, ChevronRight, Eye, AlertCircle } from 'lucide-react';
import { adminApi } from '../api/admin-api.js';
import type { AuditEventRecord } from '../types/admin.types.js';

export const AdministrativeAuditPage: React.FC = () => {
  const [logs, setLogs] = useState<readonly AuditEventRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [actionFilter, setActionFilter] = useState('');
  const [resourceTypeFilter, setResourceTypeFilter] = useState('');

  // Selected event for detail modal
  const [selectedEvent, setSelectedEvent] = useState<AuditEventRecord | null>(null);

  const fetchAuditLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await adminApi.listAudit({
        action: actionFilter.trim() || undefined,
        resourceType: resourceTypeFilter.trim() || undefined,
        page,
        limit: 20,
      });
      setLogs(res.items);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (err: any) {
      setError(err?.message || 'Failed to load administrative audit logs');
    } finally {
      setLoading(false);
    }
  }, [actionFilter, resourceTypeFilter, page]);

  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-app-border/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-[#243746]/10 rounded-lg text-[#243746]">
            <Shield className="w-5 h-5 text-[#243746]" />
          </div>
          <div>
            <h1 className="text-xl font-serif tracking-tight text-[#243746]">
              Administrative & Security Audit Trail
            </h1>
            <p className="text-xs text-app-muted">
              Immutable ledger recording identity, permission, and configuration actions
            </p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-app-surface border border-app-border rounded-xl p-4 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-app-muted" />
          <input
            type="text"
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            placeholder="Filter by action (e.g. EMPLOYEE, SETTING)..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-app-surface-subtle border border-app-border rounded-lg text-app-primary placeholder:text-app-muted/60 focus:outline-none focus:ring-1 focus:ring-[#B59761]"
          />
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-app-muted">
            <Filter className="w-3.5 h-3.5" />
            <span>Resource:</span>
          </div>
          <select
            value={resourceTypeFilter}
            onChange={(e) => {
              setResourceTypeFilter(e.target.value);
              setPage(1);
            }}
            className="text-xs bg-app-surface-subtle border border-app-border rounded-lg px-2.5 py-1.5 text-app-primary focus:outline-none focus:ring-1 focus:ring-[#B59761]"
          >
            <option value="">All Resources</option>
            <option value="USER">User / Employee</option>
            <option value="SYSTEM_SETTING">System Setting</option>
            <option value="USER_SESSION">User Session</option>
          </select>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-app-surface border border-app-border rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-app-muted flex flex-col items-center justify-center gap-2">
            <div className="w-6 h-6 border-2 border-[#243746] border-t-transparent rounded-full animate-spin" />
            <span>Querying security audit logs...</span>
          </div>
        ) : error ? (
          <div className="p-6 text-center text-xs text-red-600 bg-red-50/50 flex items-center justify-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-xs text-app-muted">
            No administrative audit events recorded matching criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-app-surface-subtle/70 border-b border-app-border text-app-muted font-medium">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Resource</th>
                  <th className="py-3 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-border/60">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-app-surface-subtle/50 transition-colors">
                    <td className="py-3 px-4 text-app-muted font-mono text-[11px] whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                          log.action.includes('SUSPEND')
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : log.action.includes('CREATED') || log.action.includes('CLAIMED')
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : log.action.includes('ROLES')
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-[#243746]">
                        {log.actorDisplayName ?? 'System / Anonymous'}
                      </div>
                      {log.actorUserId && (
                        <div className="text-[10px] font-mono text-app-muted truncate max-w-[150px]">
                          {log.actorUserId}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-medium text-[#243746]">
                        {log.resourceType ?? 'N/A'}
                      </span>
                      {log.resourceId && (
                        <span className="font-mono text-[10px] text-app-muted block truncate max-w-[150px]">
                          {log.resourceId}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedEvent(log)}
                        className="inline-flex items-center gap-1 text-[11px] text-[#243746] hover:text-[#B59761] font-medium"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="p-3 bg-app-surface-subtle/50 border-t border-app-border flex items-center justify-between text-xs text-app-muted">
          <div>
            Showing {logs.length} of {total} audit records
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1.5 border border-app-border rounded hover:bg-app-surface disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 border border-app-border rounded hover:bg-app-surface disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Inspect Event Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-app-surface border border-app-border rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-app-border pb-3">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-[#243746]" />
                <h3 className="text-sm font-serif font-semibold text-[#243746]">
                  Audit Event Details
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="text-app-muted hover:text-app-primary text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-app-border/60">
                <span className="text-app-muted">Action</span>
                <span className="font-mono font-bold text-[#243746]">{selectedEvent.action}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-app-border/60">
                <span className="text-app-muted">Timestamp</span>
                <span className="font-mono text-app-primary">
                  {new Date(selectedEvent.createdAt).toISOString()}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-app-border/60">
                <span className="text-app-muted">Actor ID</span>
                <span className="font-mono text-app-primary">
                  {selectedEvent.actorUserId ?? 'System'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-app-border/60">
                <span className="text-app-muted">Target Resource</span>
                <span className="font-mono text-app-primary">
                  {selectedEvent.resourceType} : {selectedEvent.resourceId}
                </span>
              </div>

              <div className="pt-2">
                <span className="font-medium text-[#243746] block mb-1">Payload Metadata</span>
                <pre className="p-3 bg-app-surface-subtle border border-app-border rounded-xl font-mono text-[10px] text-app-primary overflow-x-auto max-h-48">
                  {JSON.stringify(selectedEvent.metadata ?? {}, null, 2)}
                </pre>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="px-4 py-2 bg-[#243746] text-white rounded-lg text-xs font-medium hover:bg-[#1b2b37]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
