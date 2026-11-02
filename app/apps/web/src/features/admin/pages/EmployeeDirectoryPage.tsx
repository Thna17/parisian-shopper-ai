import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Search,
  Filter,
  UserPlus,
  Check,
  AlertCircle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Copy,
} from 'lucide-react';
import { adminApi } from '../api/admin-api.js';
import type { EmployeeSummary, CreateEmployeeResult } from '../types/admin.types.js';
import { RoleCode } from '../../../types/auth.types.js';

export const EmployeeDirectoryPage: React.FC = () => {
  const navigate = useNavigate();

  const [employees, setEmployees] = useState<readonly EmployeeSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Creation modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<RoleCode[]>([RoleCode.MARKETING_EDITOR]);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creationResult, setCreationResult] = useState<CreateEmployeeResult | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  const fetchEmployees = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await adminApi.listEmployees({
        search: search.trim() || undefined,
        role: roleFilter !== 'ALL' ? (roleFilter as RoleCode) : undefined,
        status: statusFilter !== 'ALL' ? (statusFilter as 'ACTIVE' | 'DISABLED') : undefined,
        page,
        limit: 15,
      });
      setEmployees(res.items);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (err: any) {
      setError(err?.message || 'Failed to load employee directory');
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, statusFilter, page]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const handleRoleToggle = (code: RoleCode) => {
    setSelectedRoles((prev) =>
      prev.includes(code) ? prev.filter((r) => r !== code) : [...prev, code],
    );
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDisplayName.trim()) {
      setCreateError('Employee name is required');
      return;
    }
    if (selectedRoles.length === 0) {
      setCreateError('Select at least one role');
      return;
    }

    try {
      setCreateSubmitting(true);
      setCreateError(null);
      const result = await adminApi.createEmployee({
        displayName: newDisplayName.trim(),
        roles: selectedRoles,
      });
      setCreationResult(result);
      fetchEmployees();
    } catch (err: any) {
      setCreateError(err?.message || 'Failed to provision employee');
    } finally {
      setCreateSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2500);
  };

  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
    setNewDisplayName('');
    setSelectedRoles([RoleCode.MARKETING_EDITOR]);
    setCreateError(null);
    setCreationResult(null);
    setCopiedToken(false);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-app-border/80">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#243746]/10 rounded-lg text-[#243746]">
              <Users className="w-5 h-5 text-[#243746]" />
            </div>
            <div>
              <h1 className="text-xl font-serif tracking-tight text-[#243746]">
                Staff & Employee Directory
              </h1>
              <p className="text-xs text-app-muted">
                Authoritative employee provisioning, role assignment, and session governance
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#243746] hover:bg-[#1b2b37] text-white text-xs font-medium rounded-lg shadow-sm transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          <span>Provision Employee</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-app-surface border border-app-border rounded-xl p-4 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-app-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name, UUID, or Telegram..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-app-surface-subtle border border-app-border rounded-lg text-app-primary placeholder:text-app-muted/60 focus:outline-none focus:ring-1 focus:ring-[#B59761]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-app-muted">
            <Filter className="w-3.5 h-3.5" />
            <span>Role:</span>
          </div>
          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by role"
            className="text-xs bg-app-surface-subtle border border-app-border rounded-lg px-2.5 py-1.5 text-app-primary focus:outline-none focus:ring-1 focus:ring-[#B59761]"
          >
            <option value="ALL">All Roles</option>
            <option value={RoleCode.VIEWER}>Viewer</option>
            <option value={RoleCode.MARKETING_EDITOR}>Marketing Editor</option>
            <option value={RoleCode.MARKETING_APPROVER}>Marketing Approver</option>
            <option value={RoleCode.ADMIN}>Administrator</option>
          </select>

          <div className="flex items-center gap-1.5 text-xs text-app-muted ml-2">
            <span>Status:</span>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by status"
            className="text-xs bg-app-surface-subtle border border-app-border rounded-lg px-2.5 py-1.5 text-app-primary focus:outline-none focus:ring-1 focus:ring-[#B59761]"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="DISABLED">Suspended</option>
          </select>
        </div>
      </div>

      {/* Directory Table */}
      <div className="bg-app-surface border border-app-border rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-app-muted flex flex-col items-center justify-center gap-2">
            <div className="w-6 h-6 border-2 border-[#243746] border-t-transparent rounded-full animate-spin" />
            <span>Loading verified employee directory...</span>
          </div>
        ) : error ? (
          <div className="p-6 text-center text-xs text-red-600 bg-red-50/50 flex items-center justify-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        ) : employees.length === 0 ? (
          <div className="p-12 text-center text-xs text-app-muted">
            No employees found matching the filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-app-surface-subtle/70 border-b border-app-border text-app-muted font-medium">
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Roles</th>
                  <th className="py-3 px-4">Telegram Identity</th>
                  <th className="py-3 px-4 text-center">Active Sessions</th>
                  <th className="py-3 px-4">Enrolled On</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-border/60">
                {employees.map((emp) => (
                  <tr
                    key={emp.id}
                    onClick={() => navigate(`/admin/employees/${emp.id}`)}
                    className="hover:bg-app-surface-subtle/50 cursor-pointer transition-colors"
                  >
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-[#243746]">{emp.displayName}</div>
                      <div className="text-[10px] font-mono text-app-muted truncate max-w-[200px]">
                        {emp.id}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      {emp.status === 'ACTIVE' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-700 border border-red-200">
                          Suspended
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap gap-1">
                        {emp.roles.map((r) => (
                          <span
                            key={r}
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                              r === RoleCode.ADMIN
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : r === RoleCode.MARKETING_APPROVER
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : 'bg-stone-100 text-stone-700 border border-stone-200'
                            }`}
                          >
                            {r.replace('_', ' ')}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      {emp.telegramUsername ? (
                        <span className="text-[#243746] font-medium">@{emp.telegramUsername}</span>
                      ) : (
                        <span className="text-app-muted italic text-[11px]">Unlinked</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          emp.activeSessionsCount > 0
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-stone-100 text-stone-500'
                        }`}
                      >
                        {emp.activeSessionsCount}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-app-muted text-[11px]">
                      {new Date(emp.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/admin/employees/${emp.id}`);
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-[#243746] hover:text-[#B59761]"
                      >
                        <span>Manage</span>
                        <ExternalLink className="w-3 h-3" />
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
            Showing {employees.length} of {total} employees
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

      {/* Provision Employee Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-app-surface border border-app-border rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="p-5 border-b border-app-border flex items-center justify-between bg-app-surface-subtle/40">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-[#243746]" />
                <h3 className="text-base font-serif font-medium text-[#243746]">
                  Provision New Employee
                </h3>
              </div>
              <button
                type="button"
                onClick={closeCreateModal}
                className="text-app-muted hover:text-app-primary text-sm font-semibold p-1"
              >
                ✕
              </button>
            </div>

            <div className="p-6">
              {creationResult ? (
                <div className="space-y-4">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
                    <Check className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-xs font-semibold text-emerald-900">
                        Employee Successfully Provisioned
                      </div>
                      <div className="text-xs text-emerald-700 mt-0.5">
                        {creationResult.employee.displayName} is registered. A single-use onboarding
                        invitation token has been generated.
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[#243746]">
                      One-Time Onboarding Token
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={creationResult.rawOnboardingToken}
                        className="w-full font-mono text-[11px] p-2 bg-app-surface-subtle border border-app-border rounded-lg text-app-primary"
                      />
                      <button
                        type="button"
                        onClick={() => copyToClipboard(creationResult.rawOnboardingToken)}
                        className="px-3 py-2 bg-[#243746] text-white rounded-lg text-xs font-medium hover:bg-[#1b2b37] flex items-center gap-1.5 shrink-0"
                      >
                        {copiedToken ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-[11px] text-amber-800 bg-amber-50/70 p-2 rounded-lg border border-amber-200 mt-2">
                      ⚠️ <strong>Security Note:</strong> This token is cryptographically hashed with
                      SHA-256 and will never be shown again. Deliver this token securely to the
                      employee so they can claim their account at <code>/onboarding</code>.
                    </p>
                  </div>

                  <div className="pt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={closeCreateModal}
                      className="px-4 py-2 bg-[#243746] text-white rounded-lg text-xs font-medium hover:bg-[#1b2b37]"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleCreateEmployee} className="space-y-4">
                  {createError && (
                    <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{createError}</span>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#243746]">
                      Full Name / Callsign *
                    </label>
                    <input
                      type="text"
                      required
                      value={newDisplayName}
                      onChange={(e) => setNewDisplayName(e.target.value)}
                      placeholder="e.g. Claire Laurent"
                      className="w-full px-3 py-2 text-xs bg-app-surface border border-app-border rounded-lg text-app-primary focus:outline-none focus:ring-1 focus:ring-[#B59761]"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-[#243746]">
                      Assign Initial Roles *
                    </label>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {[
                        {
                          code: RoleCode.VIEWER,
                          name: 'Viewer',
                          desc: 'Read-only access to products and content',
                        },
                        {
                          code: RoleCode.MARKETING_EDITOR,
                          name: 'Marketing Editor',
                          desc: 'Create, revise, and generate content/creatives',
                        },
                        {
                          code: RoleCode.MARKETING_APPROVER,
                          name: 'Marketing Approver',
                          desc: 'Four-Eyes review and authorization desk',
                        },
                        {
                          code: RoleCode.ADMIN,
                          name: 'Administrator',
                          desc: 'User management, settings, audit & cost control',
                        },
                      ].map((role) => (
                        <label
                          key={role.code}
                          className={`p-2.5 rounded-lg border cursor-pointer flex flex-col gap-1 transition-colors ${
                            selectedRoles.includes(role.code)
                              ? 'bg-[#B59761]/10 border-[#B59761]'
                              : 'bg-app-surface-subtle/50 border-app-border hover:bg-app-surface-subtle'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selectedRoles.includes(role.code)}
                              onChange={() => handleRoleToggle(role.code)}
                              className="rounded border-app-border text-[#243746] focus:ring-[#B59761]"
                            />
                            <span className="font-semibold text-xs text-[#243746]">
                              {role.name}
                            </span>
                          </div>
                          <span className="text-[10px] text-app-muted pl-5">{role.desc}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-app-border flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={closeCreateModal}
                      className="px-3.5 py-1.5 text-xs text-app-muted hover:text-app-primary"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={createSubmitting}
                      className="px-4 py-2 bg-[#243746] text-white rounded-lg text-xs font-medium hover:bg-[#1b2b37] disabled:opacity-50 flex items-center gap-2"
                    >
                      {createSubmitting ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Provisioning...</span>
                        </>
                      ) : (
                        <span>Generate Invitation</span>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
