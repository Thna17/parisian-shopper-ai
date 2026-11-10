import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PostWorkspacePage } from '../pages/PostWorkspacePage.js';
import { PostsListPage } from '../pages/PostsListPage.js';
import { postsApi, type StaffPost } from '../api/posts-api.js';
vi.mock('../api/posts-api.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/posts-api.js')>()),
  postsApi: {
    generation: vi.fn().mockResolvedValue({
      generation: null,
      provider: 'disabled',
      setupMessage: 'Poster creation is not connected.',
    }),
    get: vi.fn(),
    list: vi.fn(),
    candidates: vi.fn(),
    revise: vi.fn(),
    action: vi.fn(),
    variation: vi.fn(),
  },
}));
vi.mock('../../auth/hooks/use-permissions.js', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));
const revision = {
  id: 'revision1',
  revisionNumber: 1,
  authorUserId: 'creator',
  author: { id: 'creator', displayName: 'Creator' },
  createdAt: '2026-11-05T00:00:00Z',
  productSnapshotId: 'product',
  brief: 'A saved brief',
  channel: 'FACEBOOK',
  language: 'BILINGUAL',
  campaignId: 'campaign',
  campaign: { id: 'campaign', name: 'Launch', code: 'L1' },
  captionVersionId: 'caption',
  captionVersion: {
    id: 'caption',
    contentJobId: 'job',
    versionNumber: 2,
    structuredOutput: {
      headline: 'Verified title',
      english_caption: 'English text',
      khmer_caption: 'ក្លិនក្រអូប',
      cta: 'Discover',
      hashtags: [],
    },
  },
  posterVersionId: 'poster',
  posterVersion: { id: 'poster', sceneId: 'scene', versionNumber: 3 },
  visualAssetId: 'asset',
  productSnapshot: {
    id: 'product',
    productName: 'Rose',
    sku: 'R1',
    brand: 'Maison',
    price: '45',
    currency: 'USD',
    images: [],
  },
};
const fixture = {
  id: 'post1',
  creatorUserId: 'creator',
  reviewRound: 0,
  status: 'DRAFT',
  revisionNumber: 1,
  currentRevision: revision,
  revisions: [revision],
  events: [],
  canEdit: true,
  canReview: false,
  reviewReason: 'Ask a colleague',
  previewUrl: '/v1/posts/post1/image',
} as StaffPost;
function show(path: string, element: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/posts/:id" element={element} />
          <Route path="/posts" element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.mocked(postsApi.generation).mockResolvedValue({
    generation: null,
    provider: 'disabled',
    setupMessage: 'Poster creation is not connected.',
    currentBalanceUsd: null,
    expectedCostUsd: null,
  });
  vi.clearAllMocks();
  vi.mocked(postsApi.get).mockResolvedValue(fixture);
  vi.mocked(postsApi.candidates).mockResolvedValue({ captions: [], posters: [] });
});
describe('persistent post workspace', () => {
  it('requires saving an approved edit before offering generation or review again', async () => {
    vi.mocked(postsApi.get).mockResolvedValue({
      ...fixture,
      status: 'APPROVED',
      canEdit: true,
      canReview: false,
    });
    show('/posts/post1', <PostWorkspacePage />);
    expect(
      await screen.findByText(
        'This exact post revision is approved. Editing requires another review.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Send complete post for review' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Create poster and caption' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit caption and details' }));
    expect(screen.getByLabelText('Brief')).toBeEnabled();
  });
  it('gives an eligible reviewer their own next action', async () => {
    vi.mocked(postsApi.get).mockResolvedValue({
      ...fixture,
      status: 'UNDER_REVIEW',
      canEdit: false,
      canReview: true,
    });
    show('/posts/post1', <PostWorkspacePage />);
    expect(
      await screen.findByText(
        'Review the saved poster and captions below, then approve or request changes.',
      ),
    ).toBeInTheDocument();
  });
  it('pauses editing and gives a recovery action while a submission is uncertain', async () => {
    vi.mocked(postsApi.generation).mockResolvedValue({
      provider: 'fake',
      setupMessage: 'Test mode',
      currentBalanceUsd: null,
      expectedCostUsd: '0',
      generation: {
        id: 'pending',
        status: 'UNCERTAIN',
        sourceRevisionNumber: 1,
        provider: 'fake',
        model: 'fake',
        settings: {},
        references: [],
        prompt: '',
        caption: null,
        error: null,
        estimatedCostUsd: '0',
        actualCostUsd: null,
        provenance: null,
      },
    });
    show('/posts/post1', <PostWorkspacePage />);
    expect(
      await screen.findByText(
        'Check the existing image request below. Do not submit another request while its outcome is unknown.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Edit caption and details' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Regenerate poster' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send complete post for review' })).toBeDisabled();
  });
  it('loads both captions and the exact linked image after direct navigation', async () => {
    show('/posts/post1', <PostWorkspacePage />);
    expect(await screen.findByRole('heading', { name: 'Rose' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Saved caption' })).getByText('English text'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Saved caption' })).getByText('ក្លិនក្រអូប'),
    ).toBeInTheDocument();
    expect(screen.getByAltText('Saved poster for Rose')).toHaveAttribute(
      'src',
      '/v1/posts/post1/image',
    );
    expect(screen.getByText(/Linked poster version 3/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Approve this post revision' }),
    ).not.toBeInTheDocument();
  });
  it('saves an immutable revision with all associations and prevents submitting unsaved changes', async () => {
    vi.mocked(postsApi.revise).mockResolvedValue({
      ...fixture,
      revisionNumber: 2,
      currentRevision: {
        ...fixture.currentRevision,
        id: 'revision2',
        revisionNumber: 2,
        brief: 'Updated brief',
      },
    });
    show('/posts/post1', <PostWorkspacePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit caption and details' }));
    const brief = screen.getByLabelText('Brief');
    fireEvent.change(brief, { target: { value: 'Updated brief' } });
    expect(screen.getByRole('button', { name: 'Send complete post for review' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save new revision' }));
    await waitFor(() =>
      expect(postsApi.revise).toHaveBeenCalledWith(
        'post1',
        1,
        expect.objectContaining({
          brief: 'Updated brief',
          captionVersionId: 'caption',
          posterVersionId: 'poster',
          visualAssetId: 'asset',
        }),
      ),
    );
    expect(await screen.findByText(/Draft · Revision 2/)).toBeInTheDocument();
  });
  it('cancels local edits and restores the saved caption without creating a revision', async () => {
    show('/posts/post1', <PostWorkspacePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit caption and details' }));
    fireEvent.change(screen.getByLabelText('English caption'), {
      target: { value: 'Unsaved change' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel editing' }));
    expect(screen.queryByLabelText('English caption')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit caption and details' }));
    expect(screen.getByLabelText('English caption')).toHaveValue('English text');
    expect(postsApi.revise).not.toHaveBeenCalled();
  });
  it('lists saved posts with resumable links', async () => {
    vi.mocked(postsApi.list).mockResolvedValue({
      items: [
        {
          id: 'post1',
          status: 'DRAFT',
          productName: 'Rose',
          revisionNumber: 1,
          creatorName: 'Creator',
          updatedAt: '2026-11-05T00:00:00Z',
        },
      ],
      page: 1,
      totalPages: 1,
      total: 1,
    });
    show('/posts', <PostsListPage />);
    expect(await screen.findByRole('link', { name: /Rose/ })).toHaveAttribute(
      'href',
      '/posts/post1',
    );
  });
  it('edits draft captions without changing the standalone caption and disables submission until saved', async () => {
    vi.mocked(postsApi.revise).mockResolvedValue({
      ...fixture,
      revisionNumber: 2,
      currentRevision: { ...fixture.currentRevision, revisionNumber: 2, id: 'revision2' },
    });
    show('/posts/post1', <PostWorkspacePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit caption and details' }));
    const caption = screen.getByLabelText('English caption');
    fireEvent.change(caption, { target: { value: 'Updated staff caption' } });
    fireEvent.change(screen.getByLabelText('Hashtags'), {
      target: { value: '#ParisianShopper #Fragrance' },
    });
    expect(screen.getByRole('button', { name: 'Send complete post for review' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save new revision' }));
    await waitFor(() =>
      expect(postsApi.revise).toHaveBeenCalledWith(
        'post1',
        1,
        expect.objectContaining({
          captionVersionId: 'caption',
          posterVersionId: 'poster',
          visualAssetId: 'asset',
          captionDraft: expect.objectContaining({
            english_caption: 'Updated staff caption',
            hashtags: ['#ParisianShopper', '#Fragrance'],
          }),
        }),
      ),
    );
  });
  it('reviews the complete saved post, waits for the poster to load and sends the exact submission token', async () => {
    const review = {
      ...fixture,
      status: 'UNDER_REVIEW' as const,
      canEdit: false,
      canReview: true,
      reviewRound: 3,
    };
    vi.mocked(postsApi.get).mockResolvedValue(review);
    vi.mocked(postsApi.action).mockResolvedValue({
      ...review,
      status: 'APPROVED',
      canReview: false,
    });
    show('/posts/post1', <PostWorkspacePage />);
    const approve = await screen.findByRole('button', { name: 'Approve this post revision' });
    expect(approve).toBeDisabled();
    expect(screen.getByText(/Intended channel: FACEBOOK/)).toBeInTheDocument();
    expect(
      screen.getByText(/Sending for review places it in the web Reviews queue/),
    ).toBeInTheDocument();
    fireEvent.load(screen.getByAltText('Saved poster for Rose'));
    expect(approve).toBeEnabled();
    fireEvent.click(approve);
    await waitFor(() => expect(postsApi.action).toHaveBeenCalledWith('post1', 1, 'APPROVE', '', 3));
    expect(await screen.findByText('This complete post revision is approved.')).toBeInTheDocument();
  });
  it('requires actionable changes feedback and shows it to the creator in an editable draft', async () => {
    const review = {
      ...fixture,
      status: 'UNDER_REVIEW' as const,
      canEdit: false,
      canReview: true,
      reviewRound: 1,
    };
    vi.mocked(postsApi.get).mockResolvedValue(review);
    vi.mocked(postsApi.action).mockResolvedValue({
      ...review,
      status: 'CHANGES_REQUESTED',
      canReview: false,
      events: [
        {
          id: 'decision',
          action: 'REQUEST_CHANGES',
          comment: 'Make the caption clearer',
          revisionId: 'revision1',
          createdAt: '2026-11-06T00:00:00Z',
          reviewRound: 1,
          actor: { displayName: 'Reviewer' },
        },
      ],
    });
    show('/posts/post1', <PostWorkspacePage />);
    const changes = await screen.findByRole('button', { name: 'Request changes' });
    expect(changes).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Review note (required for changes or rejection)'), {
      target: { value: 'Make the caption clearer' },
    });
    fireEvent.click(changes);
    await waitFor(() =>
      expect(postsApi.action).toHaveBeenCalledWith(
        'post1',
        1,
        'REQUEST_CHANGES',
        'Make the caption clearer',
        1,
      ),
    );
    expect(await screen.findByRole('region', { name: 'Reviewer feedback' })).toHaveTextContent(
      'Make the caption clearer',
    );
    expect(
      screen.getByText('Feedback saved. The creator can now edit and resubmit.'),
    ).toBeInTheDocument();
  });
  it('creates a new design revision through the version API without dispatching generation', async () => {
    vi.mocked(postsApi.variation).mockResolvedValue({
      ...fixture,
      revisionNumber: 2,
      currentRevision: {
        ...revision,
        id: 'revision2',
        revisionNumber: 2,
        generationId: null,
        posterVersionId: null,
        visualAssetId: null,
      },
    } as StaffPost);
    show('/posts/post1', <PostWorkspacePage />);
    const note = await screen.findByLabelText('What should change?');
    expect(screen.getByRole('button', { name: 'New design' })).toBeDisabled();
    fireEvent.change(note, { target: { value: 'Make it lighter with more space' } });
    fireEvent.change(screen.getByLabelText('New design style'), { target: { value: 'MINIMAL' } });
    fireEvent.click(screen.getByRole('button', { name: 'New design' }));
    await waitFor(() =>
      expect(postsApi.variation).toHaveBeenCalledWith(
        'post1',
        1,
        'NEW_DESIGN',
        'MINIMAL',
        'Make it lighter with more space',
      ),
    );
  });
  it('explains unavailable video and hides poster dispatch in a saved video brief', async () => {
    vi.mocked(postsApi.get).mockResolvedValue({
      ...fixture,
      previewUrl: null,
      currentRevision: {
        ...fixture.currentRevision,
        creationPlan: {
          format: 'VIDEO',
          purpose: 'CUSTOM',
          style: 'LUXURY',
          feedback: '',
          intent: 'INITIAL',
        },
        generationId: null,
        captionVersionId: null,
        posterVersionId: null,
        visualAssetId: null,
      },
    });
    show('/posts/post1', <PostWorkspacePage />);
    expect(
      await screen.findByRole('heading', { name: 'Your video brief is saved' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Create poster and caption' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send complete post for review' })).toBeDisabled();
  });
  it('explains the independent human requirement and blocks the creator from approving', async () => {
    vi.mocked(postsApi.get).mockResolvedValue({
      ...fixture,
      status: 'UNDER_REVIEW',
      canEdit: false,
      canReview: false,
      reviewRound: 1,
      reviewReason: 'You created, requested, or edited this post.',
    });
    show('/posts/post1', <PostWorkspacePage />);
    expect(
      await screen.findByText(/Ask a different authorized colleague to open this post/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /A second account used by the same person is not an independent human review/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Approve this post revision' }),
    ).not.toBeInTheDocument();
  });
});
