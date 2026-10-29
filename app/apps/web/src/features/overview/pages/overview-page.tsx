import React from 'react';
import {
  ShieldCheck,
  UserCheck,
  KeyRound,
  Sparkles,
  RotateCw,
  LogOut,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../../auth/context/auth-context.js';
import { usePermissions } from '../../auth/hooks/use-permissions.js';
import { PageHeader } from '../../../components/navigation/page-header.js';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card.js';
import { Badge } from '../../../components/ui/badge.js';
import { Button } from '../../../components/ui/button.js';
import { EmptyState } from '../../../components/ui/empty-state.js';
import { Permission } from '../../../types/auth.types.js';

export const OverviewPage: React.FC = () => {
  const { employee, refetchEmployee, logout, isLoggingOut } = useAuth();
  const { hasPermission } = usePermissions();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations Portal"
        title={`Welcome, ${employee?.displayName ?? 'Employee'}`}
        subtitle="Parisian Shopper AI — Authenticated Luxury Retail Marketing & Telegram Distribution Workspace."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => refetchEmployee()}
              icon={<RotateCw className="w-3.5 h-3.5" />}
            >
              Verify Session
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => logout()}
              isLoading={isLoggingOut}
              icon={<LogOut className="w-3.5 h-3.5" />}
            >
              Sign Out
            </Button>
          </div>
        }
      />

      {/* Verified Employee Identity & Session Verification Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-gold-500" />
              <CardTitle>Authenticated Identity</CardTitle>
            </div>
            <Badge variant="good" dot>
              Active
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <div className="text-[10px] text-app-muted uppercase tracking-wider font-semibold">
                Display Name
              </div>
              <div className="text-sm font-semibold text-app-primary">
                {employee?.displayName ?? '—'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-app-muted uppercase tracking-wider font-semibold">
                Internal User UUID
              </div>
              <div className="text-xs font-mono text-app-muted truncate" title={employee?.id}>
                {employee?.id ?? '—'}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-navy-900" />
              <CardTitle>Assigned Roles</CardTitle>
            </div>
            <span className="text-xs text-app-muted font-mono">{employee?.roles.length ?? 0}</span>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {employee?.roles.map((role) => (
                <Badge key={role} variant="navy" className="text-xs">
                  {role}
                </Badge>
              ))}
            </div>
            <p className="text-[11px] text-app-muted mt-3 leading-relaxed">
              Roles are authority-governed in PostgreSQL and dictate your operational permissions.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-status-good" />
              <CardTitle>Four-Eyes Governance</CardTitle>
            </div>
            <Badge variant="good">SEC-002</Badge>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-app-primary font-medium leading-relaxed">
              Authoritative Self-Approval Prevention
            </p>
            <p className="text-[11px] text-app-muted mt-1 leading-relaxed">
              {hasPermission(Permission.APPROVE_CONTENT)
                ? 'Your account holds approval privileges. Note that content you create yourself cannot be approved by your account (enforced at database transaction boundary).'
                : 'Your account holds editor privileges. Content versions you generate will require a separate marketing approver before publishing.'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Honest Workspace Modules Status Banner */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-gold-500" />
            <CardTitle>Integrated Marketing Modules</CardTitle>
          </div>
          <span className="text-xs text-app-muted font-medium">Prompt Stage 2 Status</span>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl border border-app-border bg-app-surface-subtle/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-app-primary">Web Authentication</span>
                <Badge variant="good" dot>
                  Live
                </Badge>
              </div>
              <p className="text-[11px] text-app-muted leading-relaxed">
                Argon2id password verification, session hashing, and secure cookies active.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-app-border bg-app-surface-subtle/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-app-primary">Product Catalog</span>
                <Badge variant="neutral">WEB-006</Badge>
              </div>
              <p className="text-[11px] text-app-muted leading-relaxed">
                Mekhla integration, luxury perfume catalog, and SKU snapshot browser.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-app-border bg-app-surface-subtle/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-app-primary">Content Studio</span>
                <Badge variant="neutral">WEB-007</Badge>
              </div>
              <p className="text-[11px] text-app-muted leading-relaxed">
                Bilingual AI generation, Khmer typography editor, and validation gates.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-app-border bg-app-surface-subtle/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-app-primary">Telegram Reviews</span>
                <Badge variant="good" dot>
                  W30 Live
                </Badge>
              </div>
              <p className="text-[11px] text-app-muted leading-relaxed">
                Persistent Telegram wizard review pipeline synchronized with PostgreSQL.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Honest Empty State for Initial Content Pipeline */}
      <EmptyState
        icon={<Layers className="w-6 h-6 text-gold-500" />}
        title="No Active Content In Flight"
        description="The real backend content pipeline is online. Product snapshots and review queues will populate as you begin marketing campaigns in Stage 2, Prompt 06."
        action={
          <div className="text-xs text-app-muted font-medium flex items-center gap-1.5">
            <span>Next integration slice: Product Catalog & Asset Rights (WEB-006)</span>
            <ArrowRight className="w-3.5 h-3.5 text-gold-500" />
          </div>
        }
      />
    </div>
  );
};
