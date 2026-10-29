import React from 'react';
import { Menu, LogOut, CheckCircle } from 'lucide-react';
import { useAuth } from '../../features/auth/context/auth-context.js';
import { Avatar } from '../../components/ui/avatar.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';

export interface TopbarProps {
  readonly onToggleMobileMenu: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({ onToggleMobileMenu }) => {
  const { employee, logout, isLoggingOut } = useAuth();

  return (
    <header className="h-16 px-4 sm:px-6 bg-app-surface border-b border-app-border flex items-center justify-between shrink-0 select-none z-10">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleMobileMenu}
          aria-label="Open mobile navigation menu"
          className="lg:hidden p-2 rounded-lg text-app-muted hover:text-app-primary hover:bg-app-surface-subtle focus-visible:outline-2 focus-visible:outline-gold-500"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="hidden sm:flex items-center gap-2">
          <Badge variant="good" dot className="font-medium text-[11px]">
            API Connected
          </Badge>
          <span className="text-xs text-app-muted font-mono">v1.0-prod</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden md:flex items-center gap-2 text-xs text-app-muted">
          <CheckCircle className="w-3.5 h-3.5 text-status-good" />
          <span>Four-Eyes Governed</span>
        </div>

        <div className="h-4 w-px bg-app-border hidden sm:block" />

        <div className="flex items-center gap-3">
          <Avatar name={employee?.displayName} size="sm" />
          <div className="hidden sm:flex flex-col text-left">
            <span className="text-xs font-semibold text-app-primary leading-tight">
              {employee?.displayName ?? 'Employee'}
            </span>
            <span className="text-[10px] text-app-muted leading-tight">
              {employee?.roles[0] ?? 'Staff'}
            </span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            isLoading={isLoggingOut}
            icon={<LogOut className="w-3.5 h-3.5" />}
            className="text-xs text-app-muted hover:text-status-bad hover:bg-status-bad/10"
          >
            <span className="hidden sm:inline">Sign Out</span>
          </Button>
        </div>
      </div>
    </header>
  );
};
