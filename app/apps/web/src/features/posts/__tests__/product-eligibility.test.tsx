import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProductEligibilityPanel } from '../components/ProductEligibilityPanel.js';
import { ProductMarketingPolicyPage } from '../../products/pages/ProductMarketingPolicyPage.js';
import { apiClient } from '../../../services/api/api-client.js';
vi.mock('../../../services/api/api-client.js', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));
const response = {
  eligible: false,
  source: {
    system: 'Fixture catalog',
    url: 'https://example.invalid/product',
    asOf: '2026-11-01T10:00:00Z',
    sourceUpdatedAt: '2026-11-01T09:00:00Z',
    checkedAt: '2026-11-07T10:00:00Z',
    status: 'UNAVAILABLE',
    freshness: 'SOURCE_UNAVAILABLE',
  },
  policy: null,
  issues: [
    {
      code: 'SOURCE_UNAVAILABLE',
      message: 'The source is unavailable. These are saved facts.',
      alternatives: ['Keep editing and retry later.'],
      blocking: true,
    },
  ],
  changedScopes: [],
  currentSnapshotId: null,
  historyWarnings: [],
};
function mount(view: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {view}
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.get).mockResolvedValue(response);
  vi.mocked(apiClient.post).mockResolvedValue(response);
});
describe('staff product freshness and policy presentation', () => {
  it('shows saved as-of time and honest source outage alternatives', async () => {
    mount(<ProductEligibilityPanel postId="post" revision={3} canEdit />);
    expect(await screen.findByText(/Source: Fixture catalog/)).toBeInTheDocument();
    expect(screen.getByText(/UNAVAILABLE · SOURCE_UNAVAILABLE/)).toBeInTheDocument();
    expect(screen.getByText(/Keep editing and retry/)).toBeInTheDocument();
    expect(screen.queryByText(/Current checks passed/)).not.toBeInTheDocument();
  });
  it('requests a separate facts revision after a material change rather than editing approved values', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      ...response,
      changedScopes: ['catalogPrice'],
      currentSnapshotId: 'new-snapshot',
    });
    mount(<ProductEligibilityPanel postId="post" revision={3} canEdit />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Use latest facts in a new revision' }),
    );
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/v1/posts/post/refresh-product', {
        expectedRevision: 3,
      }),
    );
    expect(screen.getByText(/clears its caption and poster/)).toBeInTheDocument();
  });
  it('labels intentional campaign repeats advisory rather than preventing them', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      ...response,
      eligible: true,
      issues: [],
      historyWarnings: [
        {
          code: 'CAMPAIGN_REPEAT',
          message: 'Repeating this product may be intentional.',
          postId: 'prior',
        },
      ],
    });
    mount(<ProductEligibilityPanel postId="post" revision={3} canEdit />);
    expect(await screen.findByText(/advisory only/)).toBeInTheDocument();
    expect(screen.getByText(/Campaign repeats are allowed/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Previous post' })).toHaveAttribute(
      'href',
      '/posts/prior',
    );
  });
  it('starts business policy inputs blank and requires explicit confirmation', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(null);
    mount(<ProductMarketingPolicyPage />);
    expect(await screen.findByText('No approved policy is active.')).toBeInTheDocument();
    expect(screen.getByLabelText('Policy name')).toHaveValue('');
    expect(
      screen.getByRole('button', { name: 'Approve and activate this policy version' }),
    ).toBeDisabled();
    expect(
      screen.getByText(/No stock action or production freshness window is invented/),
    ).toBeInTheDocument();
  });
});
