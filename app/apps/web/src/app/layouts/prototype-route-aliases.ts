/** Known Prompt 11 bookmarks enter the authenticated, API-backed application. */
export function prototypeRoute(hash: string): string | undefined {
  const aliases: Record<string, string> = {
    overview: '/',
    campaigns: '/campaigns',
    products: '/products',
    content: '/content',
    creative: '/creative',
    library: '/creative/library',
    templates: '/creative/templates',
    review: '/posts/reviews',
    brand: '/brand/profile',
    publishing: '/publishing',
    analytics: '/analytics',
    usage: '/budget/overview',
    operations: '/operations',
    team: '/admin/employees',
    settings: '/admin/settings',
  };
  if (hash === '#/studio') return '/creative';
  const match = /^#\/module\/([a-z]+)$/u.exec(hash);
  return match ? aliases[match[1]] : undefined;
}
