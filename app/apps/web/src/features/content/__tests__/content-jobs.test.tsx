import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test/test-utils.js';
import { ContentJobsPage } from '../pages/ContentJobsPage.js';
import { contentApi } from '../api/content-api.js';
import type { PaginatedContentJobs, ContentJob } from '../types/content.types.js';

vi.mock('../api/content-api.js', () => ({
  contentApi: {
    getJobs: vi.fn(),
    getJobById: vi.fn(),
    createJob: vi.fn(),
    reviseManual: vi.fn(),
    submitForReview: vi.fn(),
  },
}));

vi.mock('../../../services/api/auth-api.js', () => ({
  authApi: {
    login: vi.fn(),
    getCurrentEmployee: vi.fn().mockResolvedValue({
      user: {
        id: 'usr-content-001',
        displayName: 'Merchandising Editor',
        roles: ['MARKETING_EDITOR'],
        permissions: ['VIEW_OWN_CONTENT', 'CREATE_CONTENT', 'EDIT_CONTENT'],
      },
    }),
    logout: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

describe('Content Studio Jobs List (WEB-CONTENT-01 to WEB-CONTENT-05)', () => {
  const sampleJobs: ContentJob[] = [
    {
      id: 'job-001-uuid',
      productSnapshotId: 'snap-001',
      brandRuleVersionId: 'rule-001',
      requesterUserId: 'usr-content-001',
      campaignId: null,
      contentType: 'PRODUCT_SPOTLIGHT',
      language: 'BILINGUAL',
      platform: 'TELEGRAM',
      status: 'DRAFT',
      createdAt: '2026-10-29T08:00:00.000Z',
      updatedAt: '2026-10-29T08:02:00.000Z',
    },
    {
      id: 'job-002-uuid',
      productSnapshotId: 'snap-002',
      brandRuleVersionId: 'rule-001',
      requesterUserId: 'usr-content-001',
      campaignId: 'camp-summer-001',
      contentType: 'SCENT_PYRAMID',
      language: 'KM',
      platform: 'INSTAGRAM',
      status: 'GENERATING',
      createdAt: '2026-10-29T08:10:00.000Z',
      updatedAt: '2026-10-29T08:10:05.000Z',
    },
    {
      id: 'job-003-uuid',
      productSnapshotId: 'snap-003',
      brandRuleVersionId: 'rule-001',
      requesterUserId: 'usr-content-001',
      campaignId: null,
      contentType: 'PROMOTION',
      language: 'EN',
      platform: 'FACEBOOK',
      status: 'UNDER_REVIEW',
      createdAt: '2026-10-29T07:30:00.000Z',
      updatedAt: '2026-10-29T07:45:00.000Z',
    },
  ];

  const mockPaginatedJobs: PaginatedContentJobs = {
    items: sampleJobs,
    total: 3,
    page: 1,
    limit: 20,
    totalPages: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(contentApi.getJobs).mockResolvedValue(mockPaginatedJobs);
  });

  it('WEB-CONTENT-01: Renders AI Content Studio header and generate button', async () => {
    renderWithProviders(<ContentJobsPage />, { initialEntries: ['/content'] });

    expect(await screen.findByText('AI Content Studio')).toBeInTheDocument();
    expect(screen.getByText('Generate New Content')).toBeInTheDocument();
    expect(screen.getByText('Luxury Copy')).toBeInTheDocument();
  });

  it('WEB-CONTENT-02: Renders list of content jobs with statuses and badges', async () => {
    renderWithProviders(<ContentJobsPage />, { initialEntries: ['/content'] });

    await waitFor(() => {
      expect(contentApi.getJobs).toHaveBeenCalled();
    });

    // Strategy & Platform descriptions
    expect(await screen.findByText('PRODUCT SPOTLIGHT')).toBeInTheDocument();
    expect(screen.getByText('SCENT PYRAMID')).toBeInTheDocument();
    expect(screen.getByText('PROMOTION')).toBeInTheDocument();

    // Check status badges
    expect(screen.getByText('Draft Copy')).toBeInTheDocument();
    expect(screen.getByText('Generating AI Copy')).toBeInTheDocument();
    expect(screen.getAllByText('Under Review').length).toBeGreaterThanOrEqual(2);
  });

  it('WEB-CONTENT-03: Filters jobs by status when filter tabs are clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContentJobsPage />, { initialEntries: ['/content'] });

    await waitFor(() => {
      expect(contentApi.getJobs).toHaveBeenCalled();
    });

    const generatingTab = screen.getByRole('button', { name: 'Generating' });
    await user.click(generatingTab);

    await waitFor(() => {
      expect(contentApi.getJobs).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        status: 'GENERATING',
      });
    });
  });

  it('WEB-CONTENT-04: Renders empty state when no jobs exist', async () => {
    vi.mocked(contentApi.getJobs).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    });

    renderWithProviders(<ContentJobsPage />, { initialEntries: ['/content'] });

    expect(await screen.findByText('No Content Jobs Found')).toBeInTheDocument();
    expect(screen.getByText('Generate Content Now')).toBeInTheDocument();
  });

  it('WEB-CONTENT-05: Handles refetch trigger cleanly', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContentJobsPage />, { initialEntries: ['/content'] });

    await waitFor(() => {
      expect(contentApi.getJobs).toHaveBeenCalledTimes(1);
    });

    const refreshBtn = screen.getByTitle('Refresh jobs');
    await user.click(refreshBtn);

    await waitFor(() => {
      expect(contentApi.getJobs).toHaveBeenCalledTimes(2);
    });
  });
});
