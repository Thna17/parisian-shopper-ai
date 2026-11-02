import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Shield,
  Settings,
  DollarSign,
  Laptop,
  AlertTriangle,
  ArrowRight,
  UserCheck,
} from 'lucide-react';
import { adminApi } from '../api/admin-api.js';
import type { EmployeeSummary } from '../types/admin.types.js';

export const AdminOverviewPage: React.FC = () => {
  const navigate = useNavigate();

  const [employees, setEmployees] = useState<readonly EmployeeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSummary() {
      try {
        setLoading(true);
        const res = await adminApi.listEmployees({ limit: 100 });
        setEmployees(res.items);
      } catch (err: any) {
        setError(err?.message || 'Failed to load administration overview');
      } finally {
        setLoading(false);
      }
    }
    loadSummary();
  }, []);

  const totalEmployees = employees.length;
  const activeEmployees = employees.filter((e) => e.status === 'ACTIVE').length;
  const suspendedEmployees = employees.filter((e) => e.status === 'DISABLED').length;
  const totalActiveSessions = employees.reduce((acc, e) => acc + e.activeSessionsCount, 0);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-app-border/80">
        <div>
          <h1 className="text-xl font-serif tracking-tight text-[#243746]">
            Workspace Administration & Governance
          </h1>
          <p className="text-xs text-app-muted">
            Platform identity management, security policies, and Four-Eyes enforcement
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-app-surface border border-app-border rounded-2xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-app-muted text-xs">
            <span>Total Staff</span>
            <Users className="w-4 h-4 text-[#243746]" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#243746]">
            {loading ? '-' : totalEmployees}
          </div>
          <div className="text-[11px] text-app-muted">Registered platform identities</div>
        </div>

        <div className="bg-app-surface border border-app-border rounded-2xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-app-muted text-xs">
            <span>Active Staff</span>
            <UserCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-serif font-bold text-emerald-700">
            {loading ? '-' : activeEmployees}
          </div>
          <div className="text-[11px] text-app-muted">Eligible for editorial/review access</div>
        </div>

        <div className="bg-app-surface border border-app-border rounded-2xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-app-muted text-xs">
            <span>Suspended Accounts</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-serif font-bold text-amber-700">
            {loading ? '-' : suspendedEmployees}
          </div>
          <div className="text-[11px] text-app-muted">Access revoked & sessions terminated</div>
        </div>

        <div className="bg-app-surface border border-app-border rounded-2xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-app-muted text-xs">
            <span>Active Sessions</span>
            <Laptop className="w-4 h-4 text-[#B59761]" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#243746]">
            {loading ? '-' : totalActiveSessions}
          </div>
          <div className="text-[11px] text-app-muted">Live authenticated web sessions</div>
        </div>
      </div>

      {/* Quick Action Navigation Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div
          onClick={() => navigate('/admin/employees')}
          className="bg-app-surface border border-app-border hover:border-[#B59761]/60 rounded-2xl p-6 shadow-sm cursor-pointer transition-all hover:shadow-md flex items-start gap-4"
        >
          <div className="p-3 bg-[#243746]/10 rounded-xl text-[#243746] shrink-0">
            <Users className="w-6 h-6 text-[#243746]" />
          </div>
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-base font-semibold text-[#243746]">
                Staff & Employee Directory
              </h3>
              <ArrowRight className="w-4 h-4 text-[#B59761]" />
            </div>
            <p className="text-xs text-app-muted leading-relaxed">
              Search staff, assign Four-Eyes editorial/approver roles, manage active sessions, and
              provision new employees via one-time cryptographically hashed invitation tokens.
            </p>
          </div>
        </div>

        <div
          onClick={() => navigate('/admin/settings')}
          className="bg-app-surface border border-app-border hover:border-[#B59761]/60 rounded-2xl p-6 shadow-sm cursor-pointer transition-all hover:shadow-md flex items-start gap-4"
        >
          <div className="p-3 bg-[#243746]/10 rounded-xl text-[#243746] shrink-0">
            <Settings className="w-6 h-6 text-[#243746]" />
          </div>
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-base font-semibold text-[#243746]">
                System Settings & Governance
              </h3>
              <ArrowRight className="w-4 h-4 text-[#B59761]" />
            </div>
            <p className="text-xs text-app-muted leading-relaxed">
              Configure organization brand defaults, enforce Four-Eyes approval policies for copy
              and creative scenes, set session expiration TTLs, and review alert thresholds.
            </p>
          </div>
        </div>

        <div
          onClick={() => navigate('/admin/audit')}
          className="bg-app-surface border border-app-border hover:border-[#B59761]/60 rounded-2xl p-6 shadow-sm cursor-pointer transition-all hover:shadow-md flex items-start gap-4"
        >
          <div className="p-3 bg-[#243746]/10 rounded-xl text-[#243746] shrink-0">
            <Shield className="w-6 h-6 text-[#243746]" />
          </div>
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-base font-semibold text-[#243746]">
                Security Audit Ledger
              </h3>
              <ArrowRight className="w-4 h-4 text-[#B59761]" />
            </div>
            <p className="text-xs text-app-muted leading-relaxed">
              Inspect authoritative audit events recorded across all identity, permission, session
              revocation, and configuration modifications with immutable timestamps and actor IDs.
            </p>
          </div>
        </div>

        <div
          onClick={() => navigate('/analytics/costs')}
          className="bg-app-surface border border-app-border hover:border-[#B59761]/60 rounded-2xl p-6 shadow-sm cursor-pointer transition-all hover:shadow-md flex items-start gap-4"
        >
          <div className="p-3 bg-[#243746]/10 rounded-xl text-[#243746] shrink-0">
            <DollarSign className="w-6 h-6 text-[#243746]" />
          </div>
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-base font-semibold text-[#243746]">
                AI Cost Control Hub
              </h3>
              <ArrowRight className="w-4 h-4 text-[#B59761]" />
            </div>
            <p className="text-xs text-app-muted leading-relaxed">
              Monitor monthly AI budget utilization ($10–20/mo limit), review token ledger charges,
              inspect unreconciled provider usage, and enforce atomic spending ceilings.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
