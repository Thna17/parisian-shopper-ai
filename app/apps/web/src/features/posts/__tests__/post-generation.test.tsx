import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PostGenerationPanel } from '../pages/PostGenerationPanel.js';
import { postsApi, type PostGenerationInfo } from '../api/posts-api.js';
vi.mock('../../auth/hooks/use-permissions.js', () => ({
  usePermissions: () => ({ hasPermission: () => false }),
}));
vi.mock('../api/posts-api.js', () => ({
  postsApi: {
    generation: vi.fn(),
    generate: vi.fn(),
    reconcile: vi.fn(),
    quoteCredits: vi.fn(),
    confirmCredits: vi.fn(),
  },
}));
function renderPanel() {
  return render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <PostGenerationPanel id="post" revision={1} disabled={false} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
const fixture = {
  provider: 'fake',
  setupMessage: 'Test mode: no provider charge.',
  currentBalanceUsd: null,
  expectedCostUsd: '0',
  generation: {
    id: 'generation',
    sourceRevisionNumber: 1,
    status: 'UNCERTAIN',
    provider: 'fake',
    model: 'fake-background-v1',
    settings: {},
    references: [],
    prompt: 'Background only',
    caption: null,
    error: null,
    estimatedCostUsd: '0',
    actualCostUsd: null,
    provenance: null,
  },
} satisfies PostGenerationInfo;
describe('saved post generation feedback', () => {
  beforeEach(() => vi.clearAllMocks());
  it('explains missing setup and disables creation without pretending there is an image', async () => {
    vi.mocked(postsApi.generation).mockResolvedValue({
      ...fixture,
      generation: null,
      provider: 'disabled',
      setupMessage: 'Poster creation is not connected.',
    });
    renderPanel();
    expect(await screen.findByText('Poster creation is not connected.')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create poster using saved caption' }),
    ).toBeDisabled();
    expect(postsApi.generate).not.toHaveBeenCalled();
  });
  it('prepares and quotes from one staff action without submitting a paid generation', async () => {
    const ready: PostGenerationInfo = {
      ...fixture,
      provider: 'higgsfield_mcp',
      generation: null,
      mcpConnection: {
        status: 'CONNECTED',
        configured: true,
        dispatchEnabled: true,
        sharedUseConfirmed: true,
      },
    };
    const prepared: PostGenerationInfo = {
      ...ready,
      generation: {
        ...fixture.generation,
        status: 'AWAITING_CONFIRMATION',
        provider: 'higgsfield_mcp',
      },
    };
    vi.mocked(postsApi.generation).mockResolvedValue(ready);
    vi.mocked(postsApi.generate).mockResolvedValue(prepared);
    vi.mocked(postsApi.quoteCredits).mockResolvedValue(prepared);
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Check cost to create poster' }));
    await waitFor(() => expect(postsApi.quoteCredits).toHaveBeenCalledWith('post'));
    expect(postsApi.generate).toHaveBeenCalledTimes(1);
    expect(postsApi.confirmCredits).not.toHaveBeenCalled();
  });
  it('shows confirmed queued work without asking for a second spending confirmation', async () => {
    vi.mocked(postsApi.generation).mockResolvedValue({
      ...fixture,
      provider: 'higgsfield_mcp',
      generation: {
        ...fixture.generation,
        provider: 'higgsfield_mcp',
        status: 'AWAITING_CONFIRMATION',
        spendingConfirmed: true,
      },
    });
    renderPanel();
    expect(await screen.findByText('Spending confirmed — waiting to start')).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Higgsfield credit quote' }),
    ).not.toBeInTheDocument();
  });
  it('checks an uncertain request without offering another paid submission', async () => {
    vi.mocked(postsApi.generation).mockResolvedValue(fixture);
    vi.mocked(postsApi.reconcile).mockResolvedValue(fixture);
    renderPanel();
    const button = await screen.findByRole('button', { name: 'Check existing request' });
    expect(
      screen.queryByRole('button', { name: 'Create poster using saved caption' }),
    ).not.toBeInTheDocument();
    fireEvent.click(button);
    await waitFor(() => expect(postsApi.reconcile).toHaveBeenCalledWith('post'));
    expect(postsApi.generate).not.toHaveBeenCalled();
  });
  it('labels a fake MCP transport image as a mock using recorded provenance', async () => {
    vi.mocked(postsApi.generation).mockResolvedValue({
      ...fixture,
      provider: 'higgsfield_mcp',
      generation: {
        ...fixture.generation,
        status: 'COMPLETE',
        provider: 'higgsfield_mcp',
        provenance: { kind: 'MOCK' },
      },
    });
    renderPanel();
    expect(await screen.findByText(/Mock image — for testing only/)).toBeInTheDocument();
    expect(screen.queryByText(/^AI background with/)).not.toBeInTheDocument();
  });
  it('labels a completed mock and unknown actual costs honestly', async () => {
    vi.mocked(postsApi.generation).mockResolvedValue({
      ...fixture,
      generation: { ...fixture.generation, status: 'COMPLETE' },
    });
    renderPanel();
    expect(await screen.findByText('Poster saved with its caption')).toBeInTheDocument();
    expect(screen.getByText(/Mock image — for testing only/)).toHaveTextContent(
      'No historical posters were used',
    );
    expect(screen.getByText(/Actual cost: Unknown/)).toBeInTheDocument();
    expect(postsApi.generate).not.toHaveBeenCalled();
  });
});
