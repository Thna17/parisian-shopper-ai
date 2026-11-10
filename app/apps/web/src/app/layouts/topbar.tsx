import React, { useEffect, useRef, useState } from 'react';
import { Menu, Search, Plus, Moon, Sun, LayoutDashboard, Image, Layers } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../features/auth/context/auth-context.js';
import { usePermissions } from '../../features/auth/hooks/use-permissions.js';
import { Avatar } from '../../components/ui/avatar.js';
import { Permission } from '../../types/auth.types.js';
import { workspacePageLabel } from './workspace-navigation.js';
export interface TopbarProps {
  readonly mobileMenuOpen?: boolean;
  readonly onToggleMobileMenu: () => void;
}
export const WorkspaceBar: React.FC = () => {
  const { hasPermission } = usePermissions();
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem('parisian:workspace-theme') === 'dark';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try {
      localStorage.setItem('parisian:workspace-theme', dark ? 'dark' : 'light');
    } catch {
      /* Preferences are optional. */
    }
  }, [dark]);
  return (
    <div className="workspace-bar flex h-[48px] shrink-0 items-center justify-between gap-4 bg-[#192e35] px-4 text-[#dfe7e6] sm:px-6">
      <div className="flex min-w-0 items-center gap-6">
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2 text-[11px] font-bold uppercase tracking-[.04em]"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#c8ac73] font-serif text-lg text-[#243746]">
            P
          </span>
          Parisian Shopper AI
        </Link>
        <nav
          aria-label="Workspace shortcuts"
          className="hidden items-center gap-6 border-l border-white/20 pl-6 text-xs md:flex"
        >
          <Link to="/" className="flex items-center gap-2">
            <LayoutDashboard className="h-3.5 w-3.5" />
            Overview
          </Link>
          {hasPermission(Permission.VIEW_OWN_CONTENT) && (
            <>
              <Link to="/creative" className="flex items-center gap-2">
                <Image className="h-3.5 w-3.5" />
                Creative Studio
              </Link>
              <Link to="/posts" className="flex items-center gap-2">
                <Layers className="h-3.5 w-3.5" />
                Your posts
              </Link>
            </>
          )}
        </nav>
      </div>
      <button
        type="button"
        aria-label={dark ? 'Use light theme' : 'Use dark theme'}
        onClick={() => setDark((value) => !value)}
        className="flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-white/15 bg-white/5"
      >
        {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
    </div>
  );
};
export const Topbar: React.FC<TopbarProps> = ({ onToggleMobileMenu, mobileMenuOpen = false }) => {
  const { employee } = useAuth();
  const { hasPermission } = usePermissions();
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key === 'k' &&
        hasPermission(Permission.VIEW_PRODUCTS)
      ) {
        event.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [hasPermission]);
  return (
    <header className="flex h-[68px] shrink-0 items-center justify-between gap-3 border-b border-app-border bg-app-surface px-4 sm:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onToggleMobileMenu}
          aria-label="Open mobile navigation menu"
          aria-expanded={mobileMenuOpen}
          aria-haspopup="dialog"
          className="min-h-11 min-w-11 rounded-lg p-2 text-app-muted lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <p className="truncate text-xs">
          <span className="hidden text-app-muted sm:inline">
            Workspace <span className="px-3">/</span>
          </span>
          <strong className="font-semibold">{workspacePageLabel(location.pathname)}</strong>
        </p>
      </div>
      <div className="flex items-center gap-3 sm:gap-4">
        {hasPermission(Permission.VIEW_PRODUCTS) && (
          <form
            role="search"
            className="hidden items-center gap-2 rounded-lg border border-app-border bg-app-bg px-3 py-2 md:flex"
            onSubmit={(event) => {
              event.preventDefault();
              navigate(
                '/products' + (search.trim() ? '?q=' + encodeURIComponent(search.trim()) : ''),
              );
            }}
          >
            <Search aria-hidden="true" className="h-3.5 w-3.5 text-app-muted" />
            <input
              ref={input}
              aria-label="Search products in workspace"
              placeholder="Search products"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-32 bg-transparent text-xs outline-none xl:w-44"
            />
            <kbd className="text-[10px] text-app-muted">⌘ K</kbd>
          </form>
        )}
        {hasPermission(Permission.CREATE_CONTENT) && (
          <Link
            to="/posts/new"
            className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-lg bg-[#243746] px-3 text-xs font-semibold text-white sm:px-4"
          >
            <Plus className="h-4 w-4" />
            <span>Create New</span>
          </Link>
        )}
        <span title={employee?.displayName ?? 'Employee'}>
          <Avatar name={employee?.displayName} size="sm" />
        </span>
      </div>
    </header>
  );
};
