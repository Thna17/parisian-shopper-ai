import { prototypeRoute } from './prototype-route-aliases.js';
import { ModuleNavigation } from './module-navigation.js';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Sidebar } from './sidebar.js';
import { WorkspaceBar, Topbar } from './topbar.js';
export const AppShell: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    const follow = (): void => {
      const to = prototypeRoute(window.location.hash);
      if (to) navigate(to, { replace: true });
    };
    follow();
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, [navigate]);
  const drawer = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setMobileMenuOpen(false), []);
  useEffect(() => {
    const desktop = window.matchMedia?.('(min-width: 1024px)');
    const resized = (): void => {
      if (desktop?.matches) close();
    };
    desktop?.addEventListener('change', resized);
    return () => desktop?.removeEventListener('change', resized);
  }, [close]);
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    drawer.current?.querySelector<HTMLElement>('button')?.focus();
    const trap = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = Array.from(
        drawer.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), summary, [tabindex="0"]',
        ) ?? [],
      ).filter((node) => node.getClientRects().length > 0);
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => {
      document.removeEventListener('keydown', trap);
      requestAnimationFrame(() => {
        if (document.activeElement === document.body) previous?.focus();
      });
    };
  }, [mobileMenuOpen, close]);
  return (
    <div className="prompt11-workspace flex h-dvh w-full flex-col overflow-hidden bg-app-bg text-app-primary">
      <div inert={mobileMenuOpen} className="shrink-0">
        <WorkspaceBar />
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <a
          href="#workspace-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:rounded focus:bg-white focus:p-3"
        >
          Skip to content
        </a>
        <div inert={mobileMenuOpen} className="hidden lg:flex shrink-0 h-full">
          <Sidebar />
        </div>
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-40">
            <div className="absolute inset-0 bg-black/40" onClick={close} aria-hidden="true" />
            <div
              ref={drawer}
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
              className="absolute inset-y-0 left-0 z-50"
            >
              <Sidebar isMobileOpen onCloseMobile={close} />
            </div>
          </div>
        )}
        <div inert={mobileMenuOpen} className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          <Topbar
            mobileMenuOpen={mobileMenuOpen}
            onToggleMobileMenu={() => setMobileMenuOpen((prev) => !prev)}
          />
          <main
            id="workspace-content"
            tabIndex={-1}
            className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 focus:outline-none"
          >
            <div className="mx-auto max-w-[1600px]">
              <ModuleNavigation />
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};
