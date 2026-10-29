import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test/test-utils.js';
import { ReviewQueuePage } from '../pages/ReviewQueuePage.js';
import { approvalsApi } from '../api/approvals-api.js';
import type { ReviewQueueItem } from '../types/approvals.types.js';

vi.mock('../api/approvals-api.js', () => ({
  approvalsApi: {
    getQueue: vi.fn(),
    getPending: vi.fn(),
    getHistory: vi.fn(),
    getDetail: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
  },
}));

vi.mock('../../../services/api/auth-api.js', () => ({
  authApi: {
    login: vi.fn(),
    getCurrentEmployee: vi.fn().mockResolvedValue({
      user: {
        id: 'usr-approver-001',
        displayName: 'Governance Officer',
        roles: ['MARKETING_APPROVER'],
        permissions: ['VIEW_OWN_CONTENT', 'VIEW_ALL_CONTENT', 'APPROVE_CONTENT', 'REJECT_CONTENT'],
      },
    }),
    logout: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

describe('Four-Eyes Review Queue (WEB-REVIEW-01 to WEB-REVIEW-05)', () => {
  const sampleItems: ReviewQueueItem[] = [
    {
      jobId: 'job-001-uuid',
      jobStatus: 'UNDER_REVIEW',
      productSnapshotId: 'snap-001',
      sku: 'FIC-PERF-001',
      productName: 'Moonlit River Eau de Parfum',
      brand: 'Maison Imaginaire',
      priceUsd: 38.0,
      imageUrl: 'https://assets.example.invalid/perfume1.jpg',
      campaignId: 'camp-001',
      campaignCode: 'CAMP-SPRING',
      campaignName: 'Spring Floral Launch',
      requesterUserId: 'usr-other-002',
      requesterDisplayName: 'Creative Requester',
      currentVersionNumber: 1,
      targetVersionId: 'ver-001-uuid',
      targetVersionNumber: 1,
      targetVersionAuthorUserId: 'usr-other-002',
      headline: 'Captivating Moonlit River Essence',
      englishCaption: 'A fresh breeze over Grasse fields.',
      validationStatus: 'PASSED',
      blockingCount: 0,
      warningCount: 0,
      submittedAt: '2026-10-29T10:00:00.000Z',
      isEligibleToApprove: true,
      isEligibleToReject: true,
      ineligibilityReasons: [],
    },
    {
      jobId: 'job-002-uuid',
      jobStatus: 'UNDER_REVIEW',
      productSnapshotId: 'snap-002',
      sku: 'FIC-PERF-002',
      productName: 'Rose Impériale Intense',
      brand: 'Maison Imaginaire',
      priceUsd: 185.0,
      requesterUserId: 'usr-approver-001', // Self-requested by current user!
      requesterDisplayName: 'Governance Officer',
      currentVersionNumber: 2,
      targetVersionId: 'ver-002-uuid',
      targetVersionNumber: 2,
      targetVersionAuthorUserId: 'usr-approver-001',
      headline: 'Rose Impériale Evening Spotlight',
      validationStatus: 'PASSED_WITH_WARNINGS',
      blockingCount: 0,
      warningCount: 1,
      submittedAt: '2026-10-29T10:30:00.000Z',
      isEligibleToApprove: false,
      isEligibleToReject: true,
      ineligibilityReasons: ['SELF_REQUESTED', 'SELF_AUTHORED'],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('WEB-REVIEW-01: renders pending review queue with items, SKU, MSRP truth, and submitted draft info', async () => {
    vi.mocked(approvalsApi.getPending).mockResolvedValueOnce({
      items: sampleItems,
      total: 2,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    renderWithProviders(<ReviewQueuePage />);

    expect(await screen.findByText('Moonlit River Eau de Parfum')).toBeInTheDocument();
    expect(screen.getByText('Four-Eyes Review Desk')).toBeInTheDocument();
    expect(screen.getByText('Rose Impériale Intense')).toBeInTheDocument();
    expect(screen.getByText('FIC-PERF-001')).toBeInTheDocument();
    expect(screen.getByText('$38.00 MSRP')).toBeInTheDocument();
    expect(screen.getByText('Spring Floral Launch')).toBeInTheDocument();
  });

  it('WEB-REVIEW-02: displays "Eligible Reviewer" badge for independent approver', async () => {
    vi.mocked(approvalsApi.getPending).mockResolvedValueOnce({
      items: [sampleItems[0]!],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    renderWithProviders(<ReviewQueuePage />);

    expect(await screen.findByText('Moonlit River Eau de Parfum')).toBeInTheDocument();
    const badge = screen.getByTestId('eligibility-badge-job-001-uuid');
    expect(badge).toHaveTextContent('Eligible Reviewer');
  });

  it('WEB-REVIEW-03: displays "Self-Requested" badge and marks ineligible when job was requested by current employee', async () => {
    vi.mocked(approvalsApi.getPending).mockResolvedValueOnce({
      items: [sampleItems[1]!],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    renderWithProviders(<ReviewQueuePage />);

    expect(await screen.findByText('Rose Impériale Intense')).toBeInTheDocument();
    const badge = screen.getByTestId('eligibility-badge-job-002-uuid');
    expect(badge).toHaveTextContent('Self-Requested');
  });

  it('WEB-REVIEW-04: displays clean empty state when queue has no pending items', async () => {
    vi.mocked(approvalsApi.getPending).mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    });

    renderWithProviders(<ReviewQueuePage />);

    expect(await screen.findByTestId('review-queue-empty')).toBeInTheDocument();
    expect(screen.getByText('Review Queue Clear')).toBeInTheDocument();
  });

  it('WEB-REVIEW-05: searches queue and calls api with query search parameter', async () => {
    const user = userEvent.setup();
    vi.mocked(approvalsApi.getPending).mockResolvedValue({
      items: sampleItems,
      total: 2,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    renderWithProviders(<ReviewQueuePage />);

    const searchInput = await screen.findByPlaceholderText(/Search pending reviews by SKU/i);
    await user.type(searchInput, 'Moonlit');
    const submitBtn = screen.getByRole('button', { name: /search/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(approvalsApi.getPending).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'Moonlit' }),
      );
    });
  });
});
