import React from 'react';
import {
  LayoutDashboard,
  Package,
  Layers,
  Sparkles,
  Palette,
  CheckSquare,
  BookOpen,
  Send,
  Shield,
  BarChart3,
  DollarSign,
  X,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../../features/auth/context/auth-context.js';
import { usePermissions } from '../../features/auth/hooks/use-permissions.js';
import { AppLogo } from '../../components/ui/app-logo.js';
import { Avatar } from '../../components/ui/avatar.js';
import { Badge } from '../../components/ui/badge.js';
import { SidebarItem } from '../../components/navigation/sidebar-item.js';
import { Permission } from '../../types/auth.types.js';

export interface SidebarProps {
  readonly isMobileOpen?: boolean;
  readonly onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isMobileOpen = false, onCloseMobile }) => {
  const { employee, logout, isLoggingOut } = useAuth();
  const { hasPermission, roles } = usePermissions();

  const primaryRole = roles[0] ?? 'STAFF';

  return (
    <aside
      aria-label="Main Navigation"
      className="w-[260px] min-w-[260px] h-full bg-app-surface border-r border-app-border flex flex-col z-20 select-none overflow-y-auto"
    >
      {/* Top Brand Lockup */}
      <div className="p-5 pb-4 flex items-center justify-between border-b border-app-border/60">
        <AppLogo />
        {isMobileOpen && onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close sidebar navigation"
            className="lg:hidden p-1 rounded-md text-app-muted hover:text-app-primary"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Workspace Switcher / Badge */}
      <div className="mx-3.5 my-3 p-2.5 rounded-lg bg-app-surface-subtle border border-app-border/80 flex items-center gap-2.5">
        <div className="w-6 h-6 rounded-md bg-[#EAD9BD] text-[#5F4A2C] font-bold text-[10px] flex items-center justify-center shrink-0">
          PR
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-app-primary truncate">Parisian Retail Ops</div>
          <div className="text-[10px] text-app-muted truncate">Phnom Penh Flagship</div>
        </div>
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 px-3 space-y-5 overflow-y-auto py-2">
        {/* Workspace */}
        <div>
          <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-app-muted/80">
            Workspace
          </div>
          <div className="space-y-0.5">
            <SidebarItem
              to="/"
              label="Overview"
              icon={<LayoutDashboard className="w-4 h-4" />}
              onClick={onCloseMobile}
            />
            <SidebarItem
              to="/products"
              label="Products Catalog"
              icon={<Package className="w-4 h-4" />}
              onClick={onCloseMobile}
            />
            <SidebarItem
              to="/campaigns"
              label="Campaigns"
              icon={<Layers className="w-4 h-4" />}
              onClick={onCloseMobile}
            />
          </div>
        </div>

        {/* Studio & Creation */}
        <div>
          <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-app-muted/80">
            Creative Creation
          </div>
          <div className="space-y-0.5">
            <SidebarItem
              to="/content"
              label="Content Studio"
              icon={<Sparkles className="w-4 h-4" />}
              onClick={onCloseMobile}
            />
            <SidebarItem
              to="/creative"
              label="Creative Studio"
              icon={<Palette className="w-4 h-4" />}
              onClick={onCloseMobile}
            />
          </div>
        </div>

        {/* Governance & Approvals */}
        <div>
          <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-app-muted/80">
            Governance
          </div>
          <div className="space-y-0.5">
            {(hasPermission(Permission.APPROVE_CONTENT) ||
              hasPermission(Permission.VIEW_ALL_CONTENT) ||
              hasPermission(Permission.VIEW_OWN_CONTENT)) && (
              <SidebarItem
                to="/reviews"
                label="Four-Eyes Reviews"
                icon={<CheckSquare className="w-4 h-4" />}
                onClick={onCloseMobile}
              />
            )}
            <SidebarItem
              to="/brand-rules"
              label="Brand Guidelines"
              icon={<BookOpen className="w-4 h-4" />}
              isComingSoon
            />
          </div>
        </div>

        {/* Distribution */}
        <div>
          <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-app-muted/80">
            Distribution
          </div>
          <div className="space-y-0.5">
            <SidebarItem
              to="/publishing"
              label="Publishing Desk"
              icon={<Send className="w-4 h-4" />}
              onClick={onCloseMobile}
            />
          </div>
        </div>

        {/* Intelligence & Cost Control */}
        {(hasPermission(Permission.VIEW_OPERATIONAL_ANALYTICS) ||
          hasPermission(Permission.VIEW_AI_COSTS)) && (
          <div>
            <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-app-muted/80">
              Intelligence & Cost
            </div>
            <div className="space-y-0.5">
              {hasPermission(Permission.VIEW_OPERATIONAL_ANALYTICS) && (
                <SidebarItem
                  to="/analytics"
                  label="Analytics Hub"
                  icon={<BarChart3 className="w-4 h-4" />}
                  onClick={onCloseMobile}
                />
              )}
              {hasPermission(Permission.VIEW_AI_COSTS) && (
                <SidebarItem
                  to="/analytics/costs"
                  label="AI Cost Ledger"
                  icon={<DollarSign className="w-4 h-4" />}
                  onClick={onCloseMobile}
                />
              )}
            </div>
          </div>
        )}

        {/* Administration */}
        {roles.includes('ADMIN') && (
          <div>
            <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-app-muted/80">
              System Admin
            </div>
            <div className="space-y-0.5">
              <SidebarItem
                to="/audit"
                label="Security & Audit"
                icon={<Shield className="w-4 h-4" />}
                isComingSoon
              />
            </div>
          </div>
        )}
      </div>

      {/* Bottom User Profile Section */}
      <div className="p-3.5 border-t border-app-border/80 bg-app-surface-subtle/40">
        <div className="flex items-center gap-3">
          <Avatar name={employee?.displayName} size="md" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-app-primary truncate">
              {employee?.displayName ?? 'Employee'}
            </div>
            <div className="mt-0.5">
              <Badge variant="navy" className="text-[9px] py-0 px-1.5 font-medium">
                {primaryRole}
              </Badge>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            disabled={isLoggingOut}
            aria-label="Sign out of employee session"
            title="Sign Out"
            className="p-1.5 rounded-lg text-app-muted hover:text-status-bad hover:bg-status-bad/10 transition-colors focus-visible:outline-2 focus-visible:outline-gold-500"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
