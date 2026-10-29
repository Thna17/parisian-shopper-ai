import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test/test-utils.js';
import { ApprovalHistoryPage } from '../pages/ApprovalHistoryPage.js';
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

describe('Four-Eyes Approval Decision History (WEB-REVIEW-13 to WEB-REVIEW-14)', () => {
  const sampleHistoryItems: ReviewQueueItem[] = [
    {
      jobId: 'job-appr-001',
      jobStatus: 'APPROVED',
      productSnapshotId: 'snap-001',
      sku: 'FIC-PERF-001',
      productName: 'Moonlit River Eau de Parfum',
      brand: 'Maison Imaginaire',
      priceUsd: 38.0,
      campaignName: 'Spring Floral Launch',
      requesterUserId: 'usr-requester-002',
      requesterDisplayName: 'Creative Requester',
      currentVersionNumber: 1,
      targetVersionId: 'ver-001-uuid',
      targetVersionNumber: 1,
      headline: 'Captivating Moonlit River Essence',
      validationStatus: 'PASSED',
      blockingCount: 0,
      warningCount: 0,
      submittedAt: '2026-10-29T10:00:00.000Z',
      latestApproval: {
        decision: 'APPROVED',
        approverUserId: 'usr-approver-001',
        approverDisplayName: 'Governance Officer',
        comment: 'Verified against catalog MSRP truth.',
        decidedAt: '2026-10-29T10:15:00.000Z',
      },
      isEligibleToApprove: false,
      isEligibleToReject: false,
      ineligibilityReasons: ['NOT_UNDER_REVIEW'],
    },
    {
      jobId: 'job-rej-002',
      jobStatus: 'REJECTED',
      productSnapshotId: 'snap-002',
      sku: 'FIC-PERF-002',
      productName: 'Rose Impériale Intense',
      brand: 'Maison Imaginaire',
      priceUsd: 185.0,
      requesterUserId: 'usr-requester-002',
      requesterDisplayName: 'Creative Requester',
      currentVersionNumber: 1,
      targetVersionId: 'ver-002-uuid',
      targetVersionNumber: 1,
      headline: 'Rose Impériale Discount Sensation',
      validationStatus: 'BLOCKED',
      blockingCount: 1,
      warningCount: 0,
      submittedAt: '2026-10-29T11:00:00.000Z',
      latestApproval: {
        decision: 'REJECTED',
        approverUserId: 'usr-approver-001',
        approverDisplayName: 'Governance Officer',
        comment: 'Headline claims 50% discount which contradicts catalog MSRP.',
        decidedAt: '2026-10-29T11:10:00.000Z',
      },
      isEligibleToApprove: false,
      isEligibleToReject: false,
      ineligibilityReasons: ['NOT_UNDER_REVIEW'],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('WEB-REVIEW-13: renders decision history page with approved and rejected cards and reviewer attribution', async () => {
    vi.mocked(approvalsApi.getHistory).mockResolvedValueOnce({
      items: sampleHistoryItems,
      total: 2,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    renderWithProviders(<ApprovalHistoryPage />);

    expect(await screen.findByText('Moonlit River Eau de Parfum')).toBeInTheDocument();
    expect(screen.getByText('Approval Decision History')).toBeInTheDocument();
    expect(screen.getByText('Rose Impériale Intense')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });

  it('WEB-REVIEW-14: displays empty state when no historical decisions exist', async () => {
    vi.mocked(approvalsApi.getHistory).mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    });

    renderWithProviders(<ApprovalHistoryPage />);

    expect(await screen.findByTestId('approval-history-empty')).toBeInTheDocument();
    expect(screen.getByText('No Decisions Recorded')).toBeInTheDocument();
  });
});
