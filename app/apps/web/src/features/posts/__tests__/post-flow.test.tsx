import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultCreationPlan } from '../components/CreationChoices.js';
import { CreatePostPage } from '../pages/CreatePostPage.js';
import { PostDraftPage } from '../pages/PostDraftPage.js';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  detail: vi.fn(),
  revise: vi.fn(),
  submit: vi.fn(),
}));
vi.mock('../../content/components/ProductContextSelector.js', () => ({
  ProductContextSelector: ({ onSelect }: { onSelect: (p: unknown) => void }) => (
    <button
      onClick={() =>
        onSelect({
          id: 'p1',
          title: 'Rose',
          brand: 'Maison',
          sku: 'R1',
          category: 'Perfume',
          price: { currency: 'USD', amount: 45 },
        })
      }
    >
      Choose Rose
    </button>
  ),
}));
vi.mock('../../products/hooks/use-products.js', () => ({
  useProductDetail: () => ({ data: { description: 'Catalog description' } }),
}));
vi.mock('../../campaigns/hooks/use-campaigns.js', () => ({
  useCampaigns: () => ({
    data: { items: [{ id: 'campaign1', name: 'Spring', code: 'SPRING-1', status: 'ACTIVE' }] },
  }),
}));
vi.mock('../use-posts.js', () => ({
  useCreatePost: () => ({ mutateAsync: mocks.create, isPending: false }),
}));
vi.mock('../../content/hooks/use-content.js', () => ({
  useCreateContentJob: () => ({ mutateAsync: mocks.create, isPending: false }),
  useContentJobDetail: () => mocks.detail(),
  useReviseContent: () => ({ mutateAsync: mocks.revise }),
  useSubmitContentForReview: () => ({ mutateAsync: mocks.submit }),
}));
vi.mock('../../auth/hooks/use-permissions.js', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('guided post flow', () => {
  it('persists the product, brief, channel, language and campaign without generating content', async () => {
    mocks.create.mockResolvedValue({ id: 'job1' });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={['/posts/new']}>
          <Routes>
            <Route path="/posts/new" element={<CreatePostPage />} />
            <Route path="/posts/:id" element={<p>Draft opened</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByRole('button', { name: 'Continue to post details' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Choose Rose' }));
    expect(screen.getByText(/USD 45.00/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to post details' }));
    fireEvent.change(screen.getByLabelText(/What would you like to share/), {
      target: { value: 'A spring gift' },
    });
    fireEvent.change(screen.getByLabelText('Channel'), { target: { value: 'INSTAGRAM' } });
    expect(screen.getByRole('option', { name: 'Spring — SPRING-1 (ACTIVE)' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Campaign (optional)'), {
      target: { value: 'campaign1' },
    });
    expect(screen.getByText(/Saving this draft does not start AI generation/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save post draft' }));
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith({
        requestKey: expect.stringMatching(/^web:/),
        creationPlan: defaultCreationPlan,
        productSnapshotId: 'p1',
        language: 'BILINGUAL',
        channel: 'INSTAGRAM',
        campaignId: 'campaign1',
        brief: 'A spring gift',
      }),
    );
    expect(await screen.findByText('Draft opened')).toBeInTheDocument();
  });
  it('does not show a poster or allow review when caption validation has not passed', () => {
    mocks.detail.mockReturnValue({
      data: {
        job: { id: 'job1', status: 'DRAFT' },
        product: { title: 'Rose' },
        currentVersion: {
          id: 'v1',
          structuredOutput: { headline: 'Hello', cta: 'Discover', hashtags: [] },
        },
        latestValidationResult: { status: 'BLOCKED', blockingCount: 1 },
      },
    });
    render(
      <MemoryRouter initialEntries={['/posts/job1']}>
        <Routes>
          <Route path="/posts/:id" element={<PostDraftPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('No poster is linked to this view')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send caption for review' })).toBeDisabled();
    expect(screen.getByText(/different authorized colleague/)).toBeInTheDocument();
  });

  it('edits the selected caption field and submits the validated version for review', async () => {
    let versionId = 'v1';
    mocks.revise.mockImplementation(async () => {
      versionId = 'v2';
      return {};
    });
    mocks.submit.mockResolvedValue({});
    mocks.detail.mockImplementation(() => ({
      data: {
        job: { id: 'job1', status: 'DRAFT' },
        product: { title: 'Rose' },
        currentVersion: {
          id: versionId,
          structuredOutput: {
            headline: 'Hello',
            english_caption: versionId === 'v2' ? 'Updated caption' : 'Original',
            khmer_caption: 'សួស្តី',
            cta: 'Discover',
            hashtags: [],
          },
        },
        latestValidationResult: { status: 'PASSED', blockingCount: 0 },
      },
    }));
    render(
      <MemoryRouter initialEntries={['/posts/job1']}>
        <Routes>
          <Route path="/posts/:id" element={<PostDraftPage />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit caption' }));
    fireEvent.change(screen.getByLabelText('Field to edit'), {
      target: { value: 'englishCaption' },
    });
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'Updated caption' } });
    expect(screen.getByRole('button', { name: 'Send caption for review' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save change' }));
    await waitFor(() =>
      expect(mocks.revise).toHaveBeenCalledWith({
        currentVersionId: 'v1',
        field: 'englishCaption',
        newValue: 'Updated caption',
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Send caption for review' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send caption for review' }));
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith('v2'));
  });

  it('shows a retry action when a draft cannot be loaded', () => {
    mocks.detail.mockReturnValue({ isError: true, refetch: vi.fn() });
    render(
      <MemoryRouter initialEntries={['/posts/job1']}>
        <Routes>
          <Route path="/posts/:id" element={<PostDraftPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load this draft');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });
});
