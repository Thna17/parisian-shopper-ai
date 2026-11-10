import React from 'react';
import { NavLink } from 'react-router-dom';

export interface SidebarItemProps {
  readonly to: string;
  readonly label: string;
  readonly icon: React.ReactNode;
  readonly badge?: string;
  readonly badgeVariant?: 'gold' | 'good' | 'warn' | 'neutral';
  readonly isComingSoon?: boolean;
  readonly onClick?: () => void;
}

export const SidebarItem: React.FC<SidebarItemProps> = ({
  to,
  label,
  icon,
  badge,
  isComingSoon = false,
  onClick,
}) => {
  if (isComingSoon) {
    return (
      <div
        className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-app-muted/60 select-none cursor-not-allowed group relative"
        title="Module coming soon"
      >
        <span className="w-4 h-4 shrink-0 opacity-50">{icon}</span>
        <span className="flex-1 truncate">{label}</span>
        <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-app-surface-subtle text-app-muted/70 border border-app-border/40">
          Soon
        </span>
      </div>
    );
  }

  return (
    <NavLink
      to={to}
      end={to === '/posts' || to === '/' || to === '/creative'}
      onClick={onClick}
      className={({ isActive }) =>
        `flex min-h-11 items-center gap-3 px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 rounded-lg text-xs font-medium transition-all duration-150 group relative select-none ${
          isActive
            ? 'bg-[#f5f2ec] text-[#243746] font-semibold'
            : 'text-app-muted hover:text-app-primary hover:bg-app-surface-subtle'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#243746]' : 'text-app-muted group-hover:text-app-primary'}`}
          >
            {icon}
          </span>
          <span className="flex-1 truncate">{label}</span>
          {badge && (
            <span
              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                isActive
                  ? 'bg-white/20 text-white'
                  : 'bg-app-surface-subtle text-app-muted border border-app-border'
              }`}
            >
              {badge}
            </span>
          )}
          {isActive && (
            <span
              className="absolute left-0 h-6 w-[3px] rounded-full bg-gold-500"
              aria-hidden="true"
            />
          )}
        </>
      )}
    </NavLink>
  );
};
