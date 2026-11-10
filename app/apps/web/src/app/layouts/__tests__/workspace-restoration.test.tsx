import { prototypeRoute } from '../prototype-route-aliases.js';
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OverviewPage } from '../../../features/overview/pages/overview-page.js';
import { Sidebar } from '../sidebar.js';
import { Topbar } from '../topbar.js';
import { CreativeTemplatesPage } from '../../../features/creative/pages/CreativeTemplatesPage.js';
import { postsApi } from '../../../features/posts/api/posts-api.js';
import { campaignsApi } from '../../../features/campaigns/api/campaigns-api.js';
import { creativeApi } from '../../../features/creative/api/creative-api.js';
import { Permission } from '../../../types/auth.types.js';
import { workspacePageLabel } from '../workspace-navigation.js';
const auth = vi.hoisted(() => ({
  employee: { displayName: 'Fixture Staff', roles: ['ADMIN'], permissions: ['ADMIN'] },
  logout: vi.fn(),
  isLoggingOut: false,
}));
vi.mock('../../../features/auth/context/auth-context.js', () => ({ useAuth: () => auth }));
vi.mock('../../../features/posts/api/posts-api.js', () => ({
  postsApi: { list: vi.fn() },
  postStatusLabel: { DRAFT: 'Draft' },
}));
vi.mock('../../../features/campaigns/api/campaigns-api.js', () => ({
  campaignsApi: { getCampaigns: vi.fn() },
}));
vi.mock('../../../features/creative/api/creative-api.js', () => ({
  creativeApi: { getTemplates: vi.fn() },
}));
function mount(node: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}
function Location() {
  return (
    <output aria-label="Current location">{useLocation().pathname + useLocation().search}</output>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  auth.employee = { displayName: 'Fixture Staff', roles: ['ADMIN'], permissions: ['ADMIN'] };
  vi.mocked(postsApi.list).mockImplementation(async (_page, scope) => ({
    total: scope === 'mine' ? 1 : 0,
    page: 1,
    totalPages: 1,
    items:
      scope === 'mine'
        ? [
            {
              id: 'saved-post',
              status: 'DRAFT',
              productName: 'Saved catalog product',
              revisionNumber: 2,
              creatorName: 'Fixture Staff',
              updatedAt: '2026-11-10T00:00:00Z',
            },
          ]
        : [],
  }));
  vi.mocked(campaignsApi.getCampaigns).mockResolvedValue({
    total: 0,
    page: 1,
    totalPages: 1,
    limit: 4,
    items: [],
  });
});
describe('Prompt 11 restoration connected to application data', () => {
  it('uses saved Post scopes and campaign endpoints instead of prototype fixtures', async () => {
    mount(<OverviewPage />);
    expect(await screen.findByText('Saved catalog product')).toBeInTheDocument();
    expect(postsApi.list).toHaveBeenCalledWith(1, 'reviews');
    expect(postsApi.list).toHaveBeenCalledWith(1, 'approved');
    expect(screen.getByRole('link', { name: /Saved catalog product/ })).toHaveAttribute(
      'href',
      '/posts/saved-post',
    );
    expect(screen.queryByText(/fictional company/i)).not.toBeInTheDocument();
  });
  it('shows unavailable state and recovery when a backend request fails', async () => {
    vi.mocked(postsApi.list).mockRejectedValue(new Error('offline'));
    mount(<OverviewPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Posts could not be loaded');
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: 'Try again' })[0]!);
    await waitFor(() => expect(vi.mocked(postsApi.list).mock.calls.length).toBeGreaterThan(3));
  });
  it('restores grouped navigation while retaining saved work and permission checks', () => {
    auth.employee = {
      displayName: 'Viewer',
      roles: [],
      permissions: [Permission.VIEW_OWN_CONTENT],
    };
    mount(<Sidebar />);
    expect(screen.getByRole('heading', { name: 'Workspace' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Creative Library' })).toHaveAttribute(
      'href',
      '/creative/library',
    );
    expect(screen.getByRole('link', { name: 'My posts' })).toHaveAttribute('href', '/posts');
    expect(screen.queryByRole('link', { name: 'Team & Access' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Create a post' })).not.toBeInTheDocument();
  });
  it('searches the real product catalog using an encoded query', () => {
    mount(
      <>
        <Topbar onToggleMobileMenu={() => {}} />
        <Location />
      </>,
    );
    const field = screen.getByRole('textbox', { name: 'Search products in workspace' });
    fireEvent.change(field, { target: { value: 'Rose & Gold' } });
    fireEvent.submit(screen.getByRole('search'));
    expect(screen.getByLabelText('Current location')).toHaveTextContent(
      '/products?q=Rose%20%26%20Gold',
    );
  });
  it('loads registered templates and links the selected ID into the existing wizard', async () => {
    vi.mocked(creativeApi.getTemplates).mockResolvedValue([
      {
        id: 'CENTERED_HERO',
        name: 'Registered hero',
        description: 'From the template service',
        version: '1',
        defaultLanguage: 'BILINGUAL',
        supportedAspectRatios: ['1:1'],
      },
    ]);
    mount(<CreativeTemplatesPage />);
    expect(await screen.findByText('Registered hero')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Use this layout' })).toHaveAttribute(
      'href',
      '/creative/new?template=CENTERED_HERO',
    );
  });
  it('maps historical detail URLs to the correct workspace label', () => {
    expect(workspacePageLabel('/creative/projects/existing')).toBe('Creative Studio');
    expect(workspacePageLabel('/posts/existing')).toBe('Your posts');
    expect(prototypeRoute('#/module/templates')).toBe('/creative/templates');
    expect(prototypeRoute('#/studio')).toBe('/creative');
    expect(prototypeRoute('#/module/unknown')).toBeUndefined();
  });
});
