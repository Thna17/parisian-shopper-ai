import { Permission } from '../../types/auth.types.js';

/** Prompt 11 information architecture, mapped to real application routes. */
export const workspaceNavigation = [
  {
    title: 'Workspace',
    items: [
      { to: '/', label: 'Overview', icon: 'overview', permission: Permission.VIEW_OWN_CONTENT },
      {
        to: '/campaigns',
        label: 'Campaigns',
        icon: 'campaign',
        permission: Permission.VIEW_OWN_CONTENT,
      },
      {
        to: '/products',
        label: 'Products & Promotions',
        icon: 'product',
        permission: Permission.VIEW_PRODUCTS,
      },
    ],
  },
  {
    title: 'Create',
    items: [
      {
        to: '/posts/new',
        label: 'Create a post',
        icon: 'sparkles',
        permission: Permission.CREATE_CONTENT,
      },
      {
        to: '/content',
        label: 'Content Studio',
        icon: 'caption',
        permission: Permission.VIEW_OWN_CONTENT,
      },
      {
        to: '/creative',
        label: 'Creative Studio',
        icon: 'creative',
        permission: Permission.VIEW_OWN_CONTENT,
      },
      {
        to: '/creative/library',
        label: 'Creative Library',
        icon: 'library',
        permission: Permission.VIEW_OWN_CONTENT,
      },
      {
        to: '/creative/templates',
        label: 'Templates',
        icon: 'template',
        permission: Permission.VIEW_OWN_CONTENT,
      },
    ],
  },
  {
    title: 'Govern',
    items: [
      {
        to: '/posts/reviews',
        label: 'Review & Approvals',
        icon: 'review',
        permission: Permission.VIEW_OWN_CONTENT,
      },
      {
        to: '/brand/profile',
        label: 'Brand Intelligence',
        icon: 'brand',
        permission: Permission.MANAGE_BRAND_PROFILE,
      },
      {
        to: '/publishing',
        label: 'Publishing',
        icon: 'publish',
        permission: Permission.VIEW_OWN_CONTENT,
      },
    ],
  },
  {
    title: 'Intelligence',
    items: [
      {
        to: '/analytics',
        label: 'Analytics',
        icon: 'analytics',
        permission: Permission.VIEW_OPERATIONAL_ANALYTICS,
      },
      {
        to: '/budget/overview',
        label: 'AI Usage & Budgets',
        icon: 'budget',
        permission: Permission.FINANCE_READ,
      },
      {
        to: '/analytics/costs',
        label: 'AI Cost Control',
        icon: 'cost',
        permission: Permission.VIEW_AI_COSTS,
      },
      {
        to: '/operations',
        label: 'Operations',
        icon: 'settings',
        permission: Permission.VIEW_OPERATIONAL_ANALYTICS,
      },
    ],
  },
  {
    title: 'Administration',
    items: [
      {
        to: '/admin/employees',
        label: 'Team & Access',
        icon: 'team',
        permission: Permission.ADMIN,
      },
      {
        to: '/admin/settings',
        label: 'Workspace Settings',
        icon: 'settings',
        permission: Permission.ADMIN,
      },
      {
        to: '/admin/audit',
        label: 'Security & Audit',
        icon: 'audit',
        permission: Permission.ADMIN,
      },
      {
        to: '/settings/higgsfield',
        label: 'Higgsfield Connection',
        icon: 'sparkles',
        permission: Permission.ADMIN,
      },
    ],
  },
] as const;

export function workspacePageLabel(pathname: string): string {
  const exact = workspaceNavigation
    .flatMap((group) => [...group.items])
    .find((item) => item.to === pathname);
  if (exact) return exact.label;
  if (pathname.startsWith('/posts')) return 'Your posts';
  return (
    workspaceNavigation
      .flatMap((group) => [...group.items])
      .filter((item) => item.to !== '/' && pathname.startsWith(item.to + '/'))
      .sort((a, b) => b.to.length - a.to.length)[0]?.label ?? 'Workspace'
  );
}
