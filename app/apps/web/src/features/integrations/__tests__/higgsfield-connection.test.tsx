import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HiggsfieldConnectionPage } from '../HiggsfieldConnectionPage.js';
import { McpCreditQuotePanel } from '../../posts/pages/McpCreditQuotePanel.js';
import { apiClient } from '../../../services/api/api-client.js';
import { postsApi, type PostGeneration } from '../../posts/api/posts-api.js';
vi.mock('../../../services/api/api-client.js', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));
vi.mock('../../posts/api/posts-api.js', () => ({
  postsApi: { quoteCredits: vi.fn(), confirmCredits: vi.fn() },
}));
let budget = true;
vi.mock('../../auth/hooks/use-permissions.js', () => ({
  usePermissions: () => ({ hasPermission: () => budget }),
}));
function show(element: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      {element}
    </QueryClientProvider>,
  );
}
const row = {
  id: 'request',
  sourceRevisionNumber: 1,
  status: 'AWAITING_CONFIRMATION',
  provider: 'higgsfield_mcp',
  model: 'gpt_image_2_6',
  settings: {},
  references: [],
  prompt: 'Studio',
  caption: null,
  error: null,
  estimatedCostUsd: null,
  actualCostUsd: null,
  provenance: null,
  creditQuote: {
    credits: 0.25,
    balance: 100,
    workspaceId: 'business',
    connectionEpoch: 2,
    fingerprint: 'f'.repeat(64),
    expiresAt: new Date(Date.now() + 300000).toISOString(),
    params: { model: 'gpt_image_2_6', prompt: 'Studio' },
  },
} satisfies PostGeneration;
beforeEach(() => {
  vi.clearAllMocks();
  budget = true;
});
describe('business Higgsfield connection and credit confirmation', () => {
  it('shows missing setup without offering a working connection or hiding API separation', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      status: 'DISCONNECTED',
      configured: false,
      dispatchEnabled: false,
      sharedUseConfirmed: false,
      billing: 'MCP credits, separate from API USD',
      message: 'Configure server encryption and callback.',
    });
    show(<HiggsfieldConnectionPage />);
    expect(
      await screen.findByText('Configure server encryption and callback.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect Higgsfield' })).toBeDisabled();
    expect(screen.getByText(/MCP credits, separate from API USD/)).toBeInTheDocument();
  });
  it('checks the connected workspace read-only and recovers a failed check', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (path) =>
      path.endsWith('/workspaces')
        ? { workspaces: [] }
        : {
            status: 'CONNECTED',
            configured: true,
            dispatchEnabled: false,
            sharedUseConfirmed: false,
            billing: 'credits',
            message: 'Connected',
          },
    );
    vi.mocked(apiClient.post)
      .mockRejectedValueOnce(new Error('Reconnect required'))
      .mockResolvedValueOnce({ workspaceId: 'business', workspaceName: 'Team', balance: 100 });
    show(<HiggsfieldConnectionPage />);
    const button = await screen.findByRole('button', {
      name: 'Check connection and credit balance',
    });
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent('Reconnect required');
    fireEvent.click(button);
    expect(await screen.findByText(/Current balance: 100 credits/)).toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledWith('/v1/integrations/higgsfield-mcp/check', {});
  });
  it('requires an explicit accessible workspace choice and does not authorize generation', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (path) =>
      path.endsWith('/workspaces')
        ? {
            workspaces: [
              {
                id: 'workspace-1',
                name: 'Personal workspace',
                type: 'private',
                plan: 'pro',
                selected: false,
              },
            ],
          }
        : {
            status: 'CONNECTED',
            configured: true,
            dispatchEnabled: false,
            sharedUseConfirmed: false,
            billing: 'credits',
            message: 'Connected',
          },
    );
    vi.mocked(apiClient.post).mockResolvedValue({ status: 'CONNECTED' });
    show(<HiggsfieldConnectionPage />);
    const select = await screen.findByRole('combobox', { name: 'Workspace', exact: true });
    expect(screen.getByRole('button', { name: 'Use this workspace' })).toBeDisabled();
    fireEvent.change(select, { target: { value: 'workspace-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use this workspace' }));
    expect(await screen.findByText(/Workspace saved/)).toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledWith('/v1/integrations/higgsfield-mcp/workspace', {
      workspaceId: 'workspace-1',
    });
    expect(postsApi.confirmCredits).not.toHaveBeenCalled();
  });
  it('requires explicit authorization for the exact fingerprint before dispatch', async () => {
    vi.mocked(postsApi.confirmCredits).mockResolvedValue({
      generation: row,
      provider: 'higgsfield_mcp',
      setupMessage: 'Prepared',
      expectedCostUsd: null,
      currentBalanceUsd: null,
    });
    show(<McpCreditQuotePanel id="post" row={row} disabled={false} dispatchEnabled />);
    const confirm = screen.getByRole('button', { name: 'Confirm 0.25 credits and generate' });
    expect(confirm).toBeDisabled();
    expect(postsApi.confirmCredits).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(postsApi.confirmCredits).toHaveBeenCalledWith('post', 'request', 'f'.repeat(64)),
    );
  });
  it('requires checking authorization again when a quote changes in another browser', () => {
    const client = new QueryClient();
    const content = (updated: PostGeneration) => (
      <QueryClientProvider client={client}>
        <McpCreditQuotePanel id="post" row={updated} disabled={false} dispatchEnabled />
      </QueryClientProvider>
    );
    const view = render(content(row));
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Confirm 0.25 credits and generate' })).toBeEnabled();
    view.rerender(
      content({ ...row, creditQuote: { ...row.creditQuote, fingerprint: 'a'.repeat(64) } }),
    );
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(
      screen.getByRole('button', { name: 'Confirm 0.25 credits and generate' }),
    ).toBeDisabled();
    expect(postsApi.confirmCredits).not.toHaveBeenCalled();
  });
  it('does not authorize disabled dispatch or an expired quote', () => {
    show(
      <McpCreditQuotePanel
        id="post"
        row={{ ...row, creditQuote: { ...row.creditQuote, expiresAt: '2020-01-01T00:00:00Z' } }}
        disabled={false}
        dispatchEnabled={false}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox'));
    expect(
      screen.getByRole('button', { name: 'Confirm 0.25 credits and generate' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Get current credit quote' })).toBeEnabled();
    expect(postsApi.confirmCredits).not.toHaveBeenCalled();
  });
  it('gives a non-budget user a practical next step without a spending button', () => {
    budget = false;
    show(<McpCreditQuotePanel id="post" row={row} disabled={false} dispatchEnabled />);
    expect(
      screen.queryByRole('button', { name: 'Confirm 0.25 credits and generate' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/authorized budget administrator/)).toBeInTheDocument();
  });
});
