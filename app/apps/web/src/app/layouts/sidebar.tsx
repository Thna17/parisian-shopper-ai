import React from 'react';
import {
  LayoutDashboard,
  Package,
  CalendarDays,
  Sparkles,
  Image,
  CheckSquare,
  BookOpen,
  Send,
  Shield,
  Users,
  Settings,
  BarChart3,
  DollarSign,
  FileText,
  LayoutGrid,
  PanelsTopLeft,
  X,
  LogOut,
  ChevronDown,
  Layers,
  Database,
  FlaskConical,
  FileCheck,
} from 'lucide-react';
import { useAuth } from '../../features/auth/context/auth-context.js';
import { usePermissions } from '../../features/auth/hooks/use-permissions.js';
import { AppLogo } from '../../components/ui/app-logo.js';
import { Avatar } from '../../components/ui/avatar.js';
import { SidebarItem } from '../../components/navigation/sidebar-item.js';
import { Permission } from '../../types/auth.types.js';
import { workspaceNavigation } from './workspace-navigation.js';
export interface SidebarProps {
  readonly isMobileOpen?: boolean;
  readonly onCloseMobile?: () => void;
}
const icons = {
  overview: LayoutDashboard,
  campaign: CalendarDays,
  product: Package,
  sparkles: Sparkles,
  caption: FileText,
  creative: Image,
  library: LayoutGrid,
  template: PanelsTopLeft,
  review: CheckSquare,
  brand: BookOpen,
  publish: Send,
  analytics: BarChart3,
  budget: DollarSign,
  cost: DollarSign,
  team: Users,
  settings: Settings,
  audit: Shield,
};
export const Sidebar: React.FC<SidebarProps> = ({ isMobileOpen = false, onCloseMobile }) => {
  const { employee, logout, isLoggingOut } = useAuth();
  const { hasPermission, roles } = usePermissions();
  const item = (to: string, label: string, Icon: typeof Layers) => (
    <SidebarItem
      key={to}
      to={to}
      label={label}
      icon={<Icon className="h-4 w-4" />}
      onClick={onCloseMobile}
    />
  );
  return (
    <aside
      aria-label="Main Navigation"
      className="workspace-sidebar flex h-full w-[min(280px,90vw)] lg:w-[252px] shrink-0 flex-col border-r border-app-border bg-app-surface"
    >
      <div className="flex min-h-[80px] items-center justify-between px-[18px] py-4">
        <AppLogo />
        {isMobileOpen && (
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close sidebar navigation"
            className="min-h-11 min-w-11 p-2 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
      <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg border border-app-border bg-app-bg px-3 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#eadbc0] text-xs font-bold text-[#685238]">
          PS
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold">Parisian Shopper</p>
          <p className="mt-1 text-[10px] text-app-muted">Internal marketing workspace</p>
        </div>
      </div>
      <nav
        aria-label="Workspace navigation"
        className="flex-1 space-y-5 overflow-y-auto px-2.5 py-3"
      >
        {workspaceNavigation.map((group) => {
          const available = group.items.filter((entry) => hasPermission(entry.permission));
          return (
            available.length > 0 && (
              <section key={group.title}>
                <h2 className="flex items-center justify-between px-3 pb-2 text-[10px] font-bold uppercase tracking-[.12em] text-app-muted">
                  {group.title}
                  <ChevronDown aria-hidden="true" className="h-3 w-3" />
                </h2>
                <div className="space-y-0.5">
                  {available.map((entry) => item(entry.to, entry.label, icons[entry.icon]))}
                </div>
              </section>
            )
          );
        })}
        <details>
          <summary className="cursor-pointer rounded-lg px-3 py-2 text-xs text-app-muted">
            Additional tools & saved work
          </summary>
          <div className="mt-2 space-y-0.5">
            {hasPermission(Permission.VIEW_OWN_CONTENT) && (
              <>
                {item('/posts', 'My posts', Layers)}
                {item('/posts/approved', 'Approved posts', FileCheck)}
                {item('/reviews', 'Standalone reviews', CheckSquare)}
                {item('/posts/all', 'All accessible posts', LayoutGrid)}
              </>
            )}
            {hasPermission(Permission.MANAGE_BRAND_PROFILE) && (
              <>
                {item('/brand/benchmarks', 'Benchmark lab', FlaskConical)}
                {item('/brand/datasets', 'Curated datasets', Database)}
              </>
            )}
            {hasPermission(Permission.ADMIN) && (
              <>
                {item('/brand/guidance', 'Brand guidance & references', BookOpen)}
                {item('/admin/product-policy', 'Product source policy', Settings)}
              </>
            )}
            {hasPermission(Permission.FINANCE_READ) &&
              item('/budget/ledger', 'Usage ledger', FileText)}
            {hasPermission(Permission.FINANCE_WRITE) &&
              item('/budget/reconcile', 'Reconciliation', FileCheck)}
          </div>
        </details>
      </nav>
      <div className="flex items-center gap-3 border-t border-app-border p-4">
        <Avatar name={employee?.displayName} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">{employee?.displayName ?? 'Employee'}</p>
          <p className="mt-1 text-[10px] text-app-muted">
            {roles.includes('ADMIN') ? 'Administrator' : 'Team member'}
          </p>
        </div>
        <button
          type="button"
          disabled={isLoggingOut}
          aria-label="Sign out of employee session"
          className="min-h-11 min-w-11 rounded-lg p-2 text-app-muted"
          onClick={() => {
            if (window.dispatchEvent(new Event('parisian:before-signout', { cancelable: true })))
              void logout();
          }}
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
};
