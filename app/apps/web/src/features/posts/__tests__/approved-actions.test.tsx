import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApprovedPostActions } from '../pages/ApprovedPostActions.js';
import { downloadApprovedPost, savePostDownload, type StaffPost } from '../api/posts-api.js';
vi.mock('../api/posts-api.js', async (original) => ({
  ...(await original<typeof import('../api/posts-api.js')>()),
  downloadApprovedPost: vi.fn(),
  savePostDownload: vi.fn(),
}));
const post = {
  id: 'post',
  status: 'APPROVED',
  revisionNumber: 4,
  reviewRound: 2,
  canDownload: true,
  currentRevision: { id: 'approved-revision' },
} as StaffPost;
function show(value = post, dirty = false) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <MemoryRouter>
        <ApprovedPostActions post={value} dirty={dirty} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => vi.clearAllMocks());
describe('approved Post actions', () => {
  it('downloads only the displayed approval and exposes unavailable publishing destinations truthfully', async () => {
    const file = { blob: new Blob(['png']), filename: 'approved.png' };
    vi.mocked(downloadApprovedPost).mockResolvedValue(file);
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Download poster' }));
    await waitFor(() =>
      expect(downloadApprovedPost).toHaveBeenCalledWith('post', 'approved-revision', 2, 'poster'),
    );
    expect(savePostDownload).toHaveBeenCalled();
    expect(screen.getByText(/checksum check/)).toBeInTheDocument();
    expect(screen.getByText(/Facebook: unavailable/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /publish/i })).not.toBeInTheDocument();
  });
  it('restricts unapproved and unauthorized exports and disables downloads during edits', () => {
    const first = show({
      ...post,
      status: 'DRAFT',
      canDownload: false,
      downloadReason: 'Independent approval is required.',
    });
    expect(screen.queryByRole('button', { name: 'Download poster' })).not.toBeInTheDocument();
    expect(screen.getByText('Independent approval is required.')).toBeInTheDocument();
    first.unmount();
    show(post, true);
    expect(screen.getByRole('button', { name: 'Download poster' })).toBeDisabled();
  });
  it('offers recovery after a failed download and never saves failed bytes', async () => {
    vi.mocked(downloadApprovedPost).mockRejectedValue(
      new Error('The saved version changed. Refresh this post.'),
    );
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Download captions (.txt)' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The saved version changed');
    expect(screen.getByRole('button', { name: 'Try download again' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Refresh approval status' })).toBeEnabled();
    expect(savePostDownload).not.toHaveBeenCalled();
  });
});
