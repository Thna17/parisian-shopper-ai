import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PostCaptionPanel } from '../pages/PostCaptionPanel.js';
import { apiClient } from '../../../services/api/api-client.js';
vi.mock('../../../services/api/api-client.js', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));
function mount() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <PostCaptionPanel id="post" revision={2} disabled={false} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.get).mockImplementation(
    (path: string) =>
      Promise.resolve(
        path.includes('/brands')
          ? [
              {
                version: { id: 'brand', name: 'Approved voice', version: 3, rules: {} },
                digest: 'd',
                approved: true,
                hasPlaceholders: false,
              },
            ]
          : { provider: 'fake', enabled: true, liveDispatchEnabled: false, attempt: null },
      ) as never,
  );
  vi.mocked(apiClient.post).mockResolvedValue({
    provider: 'fake',
    enabled: true,
    liveDispatchEnabled: false,
    attempt: { id: 'attempt', status: 'COMPLETE', provenance: { method: 'MOCK_AI_CAPTION' } },
  });
});
describe('separate caption generation', () => {
  it('requires an explicit approved brand selection and sends the saved revision without requesting a poster', async () => {
    mount();
    const generate = await screen.findByRole('button', { name: 'Generate caption' });
    expect(generate).toBeDisabled();
    await screen.findByRole('option', { name: 'Approved voice · version 3' });
    fireEvent.change(screen.getByLabelText('Approved caption brand guidance'), {
      target: { value: 'brand' },
    });
    fireEvent.click(generate);
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/v1/posts/post/caption', {
        expectedRevision: 2,
        method: 'AI',
        brandRuleVersionId: 'brand',
      }),
    );
    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/does not demonstrate real AI writing/)).toBeInTheDocument();
  });
  it('labels a chosen template as no AI and does not attach an unselected brand', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Use catalog template — no AI' }));
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/v1/posts/post/caption', {
        expectedRevision: 2,
        method: 'TEMPLATE',
      }),
    );
  });
  it('does not refresh over unsaved edits when a completed caption is observed', async () => {
    vi.mocked(apiClient.get).mockImplementation(
      (path: string) =>
        Promise.resolve(
          path.includes('/brands')
            ? []
            : {
                provider: 'fake',
                enabled: true,
                liveDispatchEnabled: false,
                attempt: {
                  id: 'attempt',
                  status: 'COMPLETE',
                  provenance: { method: 'MOCK_AI_CAPTION' },
                },
              },
        ) as never,
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    render(
      <QueryClientProvider client={client}>
        <PostCaptionPanel id="post" revision={2} disabled={true} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/Caption saved as a new revision/)).toBeInTheDocument();
    expect(invalidate).not.toHaveBeenCalled();
  });
  it('blocks another request when its outcome is uncertain and offers only local saved-response recovery', async () => {
    vi.mocked(apiClient.get).mockImplementation(
      (path: string) =>
        Promise.resolve(
          path.includes('/brands')
            ? []
            : {
                provider: 'fake',
                enabled: true,
                liveDispatchEnabled: false,
                attempt: { id: 'attempt', status: 'UNCERTAIN', error: 'Check provider outcome' },
              },
        ) as never,
    );
    mount();
    expect(await screen.findByText(/outcome uncertain/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use catalog template — no AI' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Generate caption' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Recover saved response' }));
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/v1/posts/post/caption/recover', {}),
    );
  });
  it('pins only the approved selected pack and reviewed examples, and labels image-reference limitations', async () => {
    vi.mocked(apiClient.get).mockImplementation(
      (path: string) =>
        Promise.resolve(
          path === '/v1/brand/guidance'
            ? [
                {
                  id: 'pack',
                  name: 'Business pack',
                  versionNumber: 4,
                  status: 'ACTIVE',
                  approvalId: 'decision',
                  ruleVersionId: 'rule',
                  guidance: { referenceSourceIds: ['approved-ref', 'unreviewed-ref'] },
                },
              ]
            : path === '/v1/brand/guidance/references'
              ? [
                  {
                    id: 'approved-ref',
                    version: 2,
                    status: 'APPROVED',
                    tags: ['selected example'],
                  },
                  {
                    id: 'unreviewed-ref',
                    version: 3,
                    status: 'UNREVIEWED',
                    tags: ['unreviewed example'],
                  },
                ]
              : path.includes('/brands')
                ? []
                : { provider: 'fake', enabled: true, liveDispatchEnabled: false, attempt: null },
        ) as never,
    );
    mount();
    await screen.findByRole('option', { name: 'Business pack · version 4' });
    fireEvent.change(screen.getByLabelText('Business-approved brand pack'), {
      target: { value: 'pack' },
    });
    expect(screen.queryByLabelText(/unreviewed example/)).not.toBeInTheDocument();
    expect(screen.getByText(/image provider does not receive/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/selected example/));
    fireEvent.click(screen.getByRole('button', { name: 'Generate caption' }));
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/v1/posts/post/caption', {
        expectedRevision: 2,
        method: 'AI',
        brandRuleVersionId: 'rule',
        brandProfileVersionId: 'pack',
        referenceSourceIds: ['approved-ref'],
      }),
    );
  });
});
