import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Shield,
  KeyRound,
  AlertTriangle,
  Check,
  Copy,
  ChevronLeft,
  Smartphone,
  Laptop,
  Ban,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { adminApi } from '../api/admin-api.js';
import type { EmployeeDetail, SafeUserSession } from '../types/admin.types.js';
import { RoleCode } from '../../../types/auth.types.js';
import { useAuth } from '../../auth/context/auth-context.js';

export const EmployeeDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { employee: currentAuthUser } = useAuth();

  const [employee, setEmployee] = useState<EmployeeDetail | null>(null);
  const [sessions, setSessions] = useState<readonly SafeUserSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit display name state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [savingName, setSavingName] = useState(false);

  // Roles state
  const [selectedRoles, setSelectedRoles] = useState<RoleCode[]>([]);
  const [savingRoles, setSavingRoles] = useState(false);
  const [roleSuccess, setRoleSuccess] = useState(false);

  // Suspend modal state
  const [isSuspendModalOpen, setIsSuspendModalOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [suspending, setSuspending] = useState(false);

  // Token modal state
  const [tokenResult, setTokenResult] = useState<{ token: string; expiresAt: string } | null>(null);
  const [generatingToken, setGeneratingToken] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  const fetchEmployeeData = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const [empData, sessData] = await Promise.all([
        adminApi.getEmployeeDetail(id),
        adminApi.getEmployeeSessions(id),
      ]);
      setEmployee(empData);
      setSelectedRoles([...empData.roles]);
      setEditDisplayName(empData.displayName);
      setSessions(sessData.sessions);
    } catch (err: any) {
      setError(err?.message || 'Failed to load employee details');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchEmployeeData();
  }, [fetchEmployeeData]);

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !editDisplayName.trim()) return;

    try {
      setSavingName(true);
      setError(null);
      const updated = await adminApi.updateEmployeeProfile(id, {
        displayName: editDisplayName.trim(),
      });
      setEmployee(updated);
      setIsEditingName(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to update employee display name');
    } finally {
      setSavingName(false);
    }
  };

  const handleToggleRole = (code: RoleCode) => {
    setSelectedRoles((prev) =>
      prev.includes(code) ? prev.filter((r) => r !== code) : [...prev, code],
    );
  };

  const handleSaveRoles = async () => {
    if (!id) return;
    if (selectedRoles.length === 0) {
      setError('An employee must have at least one assigned role.');
      return;
    }

    try {
      setSavingRoles(true);
      setError(null);
      const updated = await adminApi.updateEmployeeRoles(id, { roles: selectedRoles });
      setEmployee(updated);
      setRoleSuccess(true);
      setTimeout(() => setRoleSuccess(false), 2500);
    } catch (err: any) {
      setError(err?.message || 'Failed to update roles');
    } finally {
      setSavingRoles(false);
    }
  };

  const handleSuspend = async () => {
    if (!id) return;
    try {
      setSuspending(true);
      setError(null);
      const updated = await adminApi.suspendEmployee(id, {
        reason: suspendReason.trim() || undefined,
      });
      setEmployee(updated);
      setIsSuspendModalOpen(false);
      setSuspendReason('');
      fetchEmployeeData();
    } catch (err: any) {
      setError(err?.message || 'Failed to suspend employee account');
    } finally {
      setSuspending(false);
    }
  };

  const handleReactivate = async () => {
    if (!id) return;
    try {
      setError(null);
      const updated = await adminApi.reactivateEmployee(id);
      setEmployee(updated);
      fetchEmployeeData();
    } catch (err: any) {
      setError(err?.message || 'Failed to reactivate employee account');
    }
  };

  const handleRevokeSession = async (sessionId?: string) => {
    if (!id) return;
    try {
      setError(null);
      await adminApi.revokeSessions(id, sessionId);
      fetchEmployeeData();
    } catch (err: any) {
      setError(err?.message || 'Failed to revoke session');
    }
  };

  const handleGenerateOnboardingToken = async () => {
    if (!id) return;
    try {
      setGeneratingToken(true);
      setError(null);
      const res = await adminApi.createOnboardingToken(id);
      setTokenResult({ token: res.rawOnboardingToken, expiresAt: res.expiresAt });
    } catch (err: any) {
      setError(err?.message || 'Failed to generate onboarding token');
    } finally {
      setGeneratingToken(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2500);
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-xs text-app-muted flex flex-col items-center justify-center gap-2">
        <div className="w-6 h-6 border-2 border-[#243746] border-t-transparent rounded-full animate-spin" />
        <span>Loading employee record...</span>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <button
          type="button"
          onClick={() => navigate('/admin/employees')}
          className="inline-flex items-center gap-1.5 text-xs text-app-muted hover:text-app-primary"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back to Directory</span>
        </button>
        <div className="p-8 bg-app-surface border border-app-border rounded-xl text-center text-xs text-app-muted">
          Employee record not found.
        </div>
      </div>
    );
  }

  const isSelf = currentAuthUser?.id === employee.id;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Top Navigation */}
      <div className="flex items-center justify-between pb-2">
        <button
          type="button"
          onClick={() => navigate('/admin/employees')}
          className="inline-flex items-center gap-1.5 text-xs text-app-muted hover:text-app-primary transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back to Staff Directory</span>
        </button>

        {isSelf && (
          <span className="text-[11px] font-medium text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
            Current Authenticated Administrator (You)
          </span>
        )}
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Employee Identity Hero Header */}
      <div className="bg-app-surface border border-app-border rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#243746] text-white flex items-center justify-center font-serif text-xl font-bold shrink-0 shadow-sm">
            {employee.displayName.slice(0, 2).toUpperCase()}
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-3">
              {isEditingName ? (
                <form onSubmit={handleUpdateName} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    className="px-2.5 py-1 text-sm bg-app-surface-subtle border border-app-border rounded-lg text-[#243746] font-medium focus:outline-none focus:ring-1 focus:ring-[#B59761]"
                  />
                  <button
                    type="submit"
                    disabled={savingName}
                    className="px-2.5 py-1 bg-[#243746] text-white text-xs rounded-lg hover:bg-[#1b2b37]"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingName(false);
                      setEditDisplayName(employee.displayName);
                    }}
                    className="text-xs text-app-muted hover:text-app-primary"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <h1 className="text-xl font-serif text-[#243746] font-medium">
                    {employee.displayName}
                  </h1>
                  <button
                    type="button"
                    onClick={() => setIsEditingName(true)}
                    className="text-[11px] text-app-muted hover:text-[#B59761]"
                  >
                    Edit
                  </button>
                </>
              )}

              {employee.status === 'ACTIVE' ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200">
                  Suspended
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-app-muted">
              <span className="font-mono text-[11px] text-app-muted/80">ID: {employee.id}</span>
              <span>•</span>
              <span>Enrolled {new Date(employee.createdAt).toLocaleDateString()}</span>
              <span>•</span>
              <span>Password: {employee.hasPassword ? 'Configured' : 'Pending Claim'}</span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleGenerateOnboardingToken}
            disabled={generatingToken || employee.status === 'DISABLED'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-app-border rounded-lg text-xs font-medium text-[#243746] hover:bg-app-surface-subtle disabled:opacity-40"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Generate Onboarding Token</span>
          </button>

          {employee.status === 'ACTIVE' ? (
            <button
              type="button"
              disabled={isSelf}
              onClick={() => setIsSuspendModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-red-200 bg-red-50 text-red-700 rounded-lg text-xs font-medium hover:bg-red-100 disabled:opacity-40"
              title={isSelf ? 'Self-suspension prohibited' : undefined}
            >
              <Ban className="w-3.5 h-3.5" />
              <span>Suspend Account</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleReactivate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-emerald-200 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-medium hover:bg-emerald-100"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reactivate Account</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Roles & Governance */}
        <div className="space-y-6 lg:col-span-1">
          {/* Role Assignment Card */}
          <div className="bg-app-surface border border-app-border rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#243746]" />
                <h3 className="text-sm font-serif font-medium text-[#243746]">
                  Assigned Platform Roles
                </h3>
              </div>
              {roleSuccess && (
                <span className="text-[11px] font-medium text-emerald-600 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Updated
                </span>
              )}
            </div>

            <p className="text-[11px] text-app-muted">
              Select all authorized responsibilities for this employee. Roles take effect on their
              next request.
            </p>

            <div className="space-y-2">
              {[
                {
                  code: RoleCode.VIEWER,
                  name: 'Viewer',
                  desc: 'Read-only access to products and generated assets',
                },
                {
                  code: RoleCode.MARKETING_EDITOR,
                  name: 'Marketing Editor',
                  desc: 'Full creation, copywriting and visual revision capabilities',
                },
                {
                  code: RoleCode.MARKETING_APPROVER,
                  name: 'Marketing Approver',
                  desc: 'Four-Eyes independent authorization privileges',
                },
                {
                  code: RoleCode.ADMIN,
                  name: 'Administrator',
                  desc: 'Identity, system settings, audit and AI spend controls',
                },
              ].map((role) => (
                <label
                  key={role.code}
                  className={`p-2.5 rounded-xl border flex flex-col gap-1 transition-colors ${
                    isSelf
                      ? 'cursor-not-allowed opacity-70 bg-app-surface-subtle/40 border-app-border'
                      : 'cursor-pointer hover:bg-app-surface-subtle'
                  } ${
                    selectedRoles.includes(role.code)
                      ? 'border-[#B59761] bg-[#B59761]/5'
                      : 'border-app-border'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      disabled={isSelf}
                      checked={selectedRoles.includes(role.code)}
                      onChange={() => handleToggleRole(role.code)}
                      className="rounded border-app-border text-[#243746] focus:ring-[#B59761]"
                    />
                    <span className="text-xs font-semibold text-[#243746]">{role.name}</span>
                  </div>
                  <span className="text-[10px] text-app-muted pl-5">{role.desc}</span>
                </label>
              ))}
            </div>

            {!isSelf ? (
              <button
                type="button"
                onClick={handleSaveRoles}
                disabled={savingRoles}
                className="w-full py-2 bg-[#243746] text-white rounded-lg text-xs font-medium hover:bg-[#1b2b37] disabled:opacity-50 transition-colors"
              >
                {savingRoles ? 'Saving Changes...' : 'Save Role Updates'}
              </button>
            ) : (
              <p className="text-[11px] text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200">
                ⚠️ Four-Eyes Rule: You cannot modify your own administrative roles.
              </p>
            )}
          </div>

          {/* Telegram Identity Card */}
          <div className="bg-app-surface border border-app-border rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-[#243746]" />
              <h3 className="text-sm font-serif font-medium text-[#243746]">
                Linked Telegram Identity
              </h3>
            </div>

            {employee.telegram ? (
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-app-border/60">
                  <span className="text-app-muted">Username</span>
                  <span className="font-semibold text-[#243746]">
                    @{employee.telegram.telegramUsername ?? 'None'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-app-border/60">
                  <span className="text-app-muted">Masked User ID</span>
                  <span className="font-mono text-app-primary">
                    {employee.telegram.maskedTelegramUserId}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-app-border/60">
                  <span className="text-app-muted">Telegram Callsign</span>
                  <span className="text-app-primary">
                    {employee.telegram.displayName ?? 'Unset'}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-app-muted">Last Active on Telegram</span>
                  <span className="text-app-primary">
                    {employee.telegram.lastSeenAt
                      ? new Date(employee.telegram.lastSeenAt).toLocaleString()
                      : 'Never'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-app-surface-subtle border border-app-border rounded-xl text-center text-xs text-app-muted">
                No Telegram account currently linked. The employee can link via Telegram bot using
                their authorized account.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Active Sessions & Audit */}
        <div className="space-y-6 lg:col-span-2">
          {/* Active Sessions Card */}
          <div className="bg-app-surface border border-app-border rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-app-border flex items-center justify-between bg-app-surface-subtle/50">
              <div className="flex items-center gap-2">
                <Laptop className="w-4 h-4 text-[#243746]" />
                <h3 className="text-sm font-serif font-medium text-[#243746]">
                  Active Employee Sessions ({sessions.filter((s) => s.isActive).length})
                </h3>
              </div>

              {sessions.filter((s) => s.isActive).length > 0 && (
                <button
                  type="button"
                  onClick={() => handleRevokeSession(undefined)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Revoke All Sessions</span>
                </button>
              )}
            </div>

            <div className="p-4">
              {sessions.length === 0 ? (
                <div className="p-6 text-center text-xs text-app-muted">
                  No active or past sessions found for this employee.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-app-border text-app-muted">
                        <th className="py-2 px-3">IP Address</th>
                        <th className="py-2 px-3">Device / User Agent</th>
                        <th className="py-2 px-3">Status</th>
                        <th className="py-2 px-3">Last Active</th>
                        <th className="py-2 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-app-border/60">
                      {sessions.map((sess) => (
                        <tr key={sess.id} className="hover:bg-app-surface-subtle/30">
                          <td className="py-2.5 px-3 font-mono text-[11px] text-app-muted">
                            {sess.ipAddress ?? '127.0.0.1'}
                          </td>
                          <td className="py-2.5 px-3 text-app-primary truncate max-w-[200px]">
                            {sess.userAgent ?? 'Unknown Browser'}
                          </td>
                          <td className="py-2.5 px-3">
                            {sess.isActive ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Active
                              </span>
                            ) : sess.revokedAt ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-stone-100 text-stone-600">
                                Revoked
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-stone-100 text-stone-500">
                                Expired
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-app-muted text-[11px]">
                            {new Date(sess.lastActiveAt).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {sess.isActive && (
                              <button
                                type="button"
                                onClick={() => handleRevokeSession(sess.id)}
                                className="text-[11px] text-red-600 hover:text-red-800 font-medium"
                              >
                                Revoke
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Suspend Confirmation Modal */}
      {isSuspendModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-app-surface border border-app-border rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-app-border flex items-center justify-between bg-red-50/60">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <h3 className="text-sm font-serif font-semibold text-red-900">
                  Confirm Account Suspension
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSuspendModalOpen(false)}
                className="text-app-muted hover:text-app-primary"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-app-primary leading-relaxed">
                Suspending <strong>{employee.displayName}</strong> will immediately disable login
                access and terminate all active sessions. This action is recorded in the permanent
                administrative audit log.
              </p>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#243746]">
                  Suspension Reason (Optional)
                </label>
                <textarea
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  placeholder="e.g. Employee offboarding or security review"
                  rows={3}
                  className="w-full p-2.5 text-xs bg-app-surface border border-app-border rounded-lg text-app-primary focus:outline-none focus:ring-1 focus:ring-[#B59761]"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsSuspendModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-app-muted hover:text-app-primary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={suspending}
                  onClick={handleSuspend}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium disabled:opacity-50"
                >
                  {suspending ? 'Suspending...' : 'Confirm Suspension'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fresh Onboarding Token Modal */}
      {tokenResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-app-surface border border-app-border rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-app-border pb-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-[#243746]" />
                <h3 className="text-base font-serif font-medium text-[#243746]">
                  Single-Use Onboarding Token
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setTokenResult(null)}
                className="text-app-muted hover:text-app-primary text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-app-muted">
              A fresh onboarding invitation token has been created for{' '}
              <strong>{employee.displayName}</strong>. Previous pending invitations have been
              invalidated.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#243746]">
                Invitation Token (Expires in 7 Days)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={tokenResult.token}
                  className="w-full font-mono text-[11px] p-2 bg-app-surface-subtle border border-app-border rounded-lg text-app-primary"
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(tokenResult.token)}
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
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setTokenResult(null)}
                className="px-4 py-2 bg-[#243746] text-white rounded-lg text-xs font-medium hover:bg-[#1b2b37]"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
