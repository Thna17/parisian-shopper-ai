import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { usePermissions } from '../../features/auth/hooks/use-permissions.js';
import { Permission } from '../../types/auth.types.js';
const modules: { prefix: string; items: [string, string, Permission?][] }[] = [
  {
    prefix: '/creative',
    items: [
      ['/creative', 'Projects'],
      ['/creative/library', 'Creative Library'],
      ['/creative/templates', 'Templates'],
    ],
  },
  {
    prefix: '/brand',
    items: [
      ['/brand/profile', 'Brand Profile'],
      ['/brand/guidance', 'Guidance & References', Permission.ADMIN],
      ['/brand/benchmarks', 'Benchmarks'],
      ['/brand/datasets', 'Datasets'],
    ],
  },
  {
    prefix: '/analytics',
    items: [
      ['/analytics', 'Overview'],
      ['/analytics/content', 'Content'],
      ['/analytics/campaigns', 'Campaigns'],
      ['/analytics/creative', 'Creatives'],
      ['/analytics/publishing', 'Publishing'],
      ['/analytics/costs', 'AI Costs', Permission.VIEW_AI_COSTS],
    ],
  },
  {
    prefix: '/admin',
    items: [
      ['/admin', 'Overview'],
      ['/admin/employees', 'Team & Access'],
      ['/admin/settings', 'Settings'],
      ['/admin/audit', 'Audit History'],
      ['/admin/product-policy', 'Product Policy'],
    ],
  },
  {
    prefix: '/budget',
    items: [
      ['/budget/overview', 'Overview'],
      ['/budget/ledger', 'Usage Ledger'],
      ['/budget/reconcile', 'Reconciliation', Permission.FINANCE_WRITE],
    ],
  },
  {
    prefix: '/publishing',
    items: [
      ['/publishing', 'Publishing Desk'],
      ['/publishing/history', 'History'],
    ],
  },
  {
    prefix: '/content',
    items: [
      ['/content', 'Caption drafts'],
      ['/posts', 'Complete posts'],
      ['/posts/new', 'Create a post', Permission.CREATE_CONTENT],
    ],
  },
];
export function ModuleNavigation(): React.JSX.Element | null {
  const { pathname } = useLocation();
  const { hasPermission } = usePermissions();
  const group = modules.find(
    (module) => pathname === module.prefix || pathname.startsWith(module.prefix + '/'),
  );
  if (!group || pathname.endsWith('/new')) return null;
  return (
    <nav aria-label="Section navigation" className="workspace-tabs mb-6">
      {group.items
        .filter((item) => !item[2] || hasPermission(item[2]))
        .map((item) => (
          <NavLink
            key={item[0]}
            to={item[0]}
            end
            className={({ isActive }) =>
              'flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-2 px-2 text-xs font-semibold ' +
              (isActive
                ? 'border-gold-500 text-app-primary'
                : 'border-transparent text-app-muted hover:text-app-primary')
            }
          >
            {item[1]}
          </NavLink>
        ))}
    </nav>
  );
}
