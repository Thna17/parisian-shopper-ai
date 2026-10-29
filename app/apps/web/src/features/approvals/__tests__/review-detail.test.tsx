import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../../test/test-utils.js';
import { ReviewDetailPage } from '../pages/ReviewDetailPage.js';
import { approvalsApi } from '../api/approvals-api.js';
import type { ReviewDeskDetail } from '../types/approvals.types.js';

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
        displayName: 'Independent Approver',
        roles: ['MARKETING_APPROVER'],
        permissions: ['VIEW_OWN_CONTENT', 'VIEW_ALL_CONTENT', 'APPROVE_CONTENT', 'REJECT_CONTENT'],
      },
    }),
    logout: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

describe('Four-Eyes Review Desk Detail (WEB-REVIEW-06 to WEB-REVIEW-12)', () => {
  const sampleDetail: ReviewDeskDetail = {
    job: {
      id: 'job-001-uuid',
      contentType: 'PRODUCT_SPOTLIGHT',
      language: 'EN',
      platform: 'INSTAGRAM',
      campaignContext: 'Spring floral spotlight campaign',
      status: 'UNDER_REVIEW',
      requesterUserId: 'usr-author-002',
      createdAt: '2026-10-29T10:00:00.000Z',
      updatedAt: '2026-10-29T10:00:05.000Z',
    },
    productSnapshot: {
      id: 'snap-001',
      sku: 'FIC-PERF-001',
      productName: 'Moonlit River Eau de Parfum',
      brand: 'Maison Imaginaire',
      priceUsd: 38.0,
      category: 'fragrance',
      description: 'A fictional floral fragrance used only for local testing.',
      imageUrl: 'https://assets.example.invalid/perfume1.jpg',
      fragranceNotes: {
        top: ['Bergamot', 'Pear'],
        heart: ['Jasmine'],
        base: ['Cedar', 'Musk'],
      },
      stockStatus: 'in_stock',
    },
    campaign: {
      id: 'camp-001',
      code: 'CAMP-SPRING',
      name: 'Spring Floral Launch',
      status: 'ACTIVE',
      objective: 'Brand Awareness',
    },
    versions: [
      {
        id: 'ver-001-uuid',
        versionNumber: 1,
        authorUserId: 'usr-author-002',
        headline: 'Original Moonlit River',
        englishCaption: 'Original Grasse breeze draft.',
        cta: 'Discover',
        hashtags: ['#MoonlitRiver'],
        createdAt: '2026-10-29T10:00:00.000Z',
      },
      {
        id: 'ver-002-uuid',
        versionNumber: 2,
        authorUserId: 'usr-author-002',
        headline: 'Moonlit River Luxury Fragrance',
        englishCaption: 'Experience the magic of Parisian evenings with crisp pear and jasmine.',
        cta: 'Shop the Collection',
        hashtags: ['#MoonlitRiver', '#ParisianShopper'],
        factsUsed: ['Moonlit River', '38.00', 'Bergamot'],
        createdAt: '2026-10-29T10:15:00.000Z',
      },
    ],
    targetVersion: {
      id: 'ver-002-uuid',
      versionNumber: 2,
      authorUserId: 'usr-author-002',
      headline: 'Moonlit River Luxury Fragrance',
      englishCaption: 'Experience the magic of Parisian evenings with crisp pear and jasmine.',
      cta: 'Shop the Collection',
      hashtags: ['#MoonlitRiver', '#ParisianShopper'],
      factsUsed: ['Moonlit River', '38.00', 'Bergamot'],
      createdAt: '2026-10-29T10:15:00.000Z',
      structuredOutput: {
        headline: 'Moonlit River Luxury Fragrance',
        english_caption: 'Experience the magic of Parisian evenings with crisp pear and jasmine.',
      },
    },
    validationResult: {
      id: 'val-002',
      status: 'PASSED',
      blockingCount: 0,
      warningCount: 0,
      findings: [],
    },
    approvalEvents: [],
    eligibility: {
      canApprove: true,
      canReject: true,
      ineligibilityReasons: [],
      selfRequested: false,
      selfAuthored: false,
      missingPermission: false,
      hasBlockingFindings: false,
      notUnderReview: false,
      isStaleVersion: false,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderDeskPage(detail: ReviewDeskDetail) {
    vi.mocked(approvalsApi.getDetail).mockResolvedValue(detail);
    return renderWithProviders(
      <Routes>
        <Route path="/approvals/:id" element={<ReviewDetailPage />} />
      </Routes>,
      { initialEntries: ['/approvals/job-001-uuid'] },
    );
  }

  it('WEB-REVIEW-06: renders complete review desk with product catalog truth ($38.00 MSRP), campaign context, and submitted copy draft', async () => {
    renderDeskPage(sampleDetail);

    expect(await screen.findByTestId('product-truth-panel')).toBeInTheDocument();
    expect(screen.getAllByText('Moonlit River Eau de Parfum').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('MSRP: $38.00 USD')).toBeInTheDocument();
    expect(screen.getAllByText('FIC-PERF-001').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Moonlit River Luxury Fragrance').length).toBeGreaterThanOrEqual(1);
  });

  it('WEB-REVIEW-07: enables "Approve Version 2" button and renders eligible banner for independent approver', async () => {
    renderDeskPage(sampleDetail);

    expect(await screen.findByTestId('eligibility-banner-eligible')).toBeInTheDocument();
    expect(screen.getByText('Four-Eyes Eligible Reviewer')).toBeInTheDocument();

    const approveBtn = screen.getByTestId('approve-decision-button');
    expect(approveBtn).toBeEnabled();
    expect(approveBtn).toHaveTextContent('Approve Version 2');
  });

  it('WEB-REVIEW-08: disables "Approve" button and renders Self-Approval Prohibited banner for requester', async () => {
    const selfRequestedDetail: ReviewDeskDetail = {
      ...sampleDetail,
      eligibility: {
        ...sampleDetail.eligibility,
        canApprove: false,
        selfRequested: true,
        ineligibilityReasons: ['SELF_REQUESTED'],
      },
    };

    renderDeskPage(selfRequestedDetail);

    expect(await screen.findByTestId('eligibility-banner-ineligible')).toBeInTheDocument();
    expect(screen.getByText(/Self-Approval Prohibited/i)).toBeInTheDocument();

    const approveBtn = screen.getByTestId('approve-decision-button');
    expect(approveBtn).toBeDisabled();
  });

  it('WEB-REVIEW-09: opens ApproveDecisionModal and records approval with optional comment', async () => {
    const user = userEvent.setup();
    vi.mocked(approvalsApi.approve).mockResolvedValueOnce({
      id: 'appr-event-1',
      contentJobId: 'job-001-uuid',
      contentVersionId: 'ver-002-uuid',
      approverUserId: 'usr-approver-001',
      decision: 'APPROVED',
      comment: 'Verified against catalog MSRP truth.',
      createdAt: '2026-10-29T10:20:00.000Z',
    });

    renderDeskPage(sampleDetail);

    const approveBtn = await screen.findByTestId('approve-decision-button');
    await user.click(approveBtn);

    expect(await screen.findByTestId('approve-decision-modal')).toBeInTheDocument();

    const commentInput = screen.getByPlaceholderText(/Verified copy against French catalog MSRP/i);
    await user.type(commentInput, 'Verified against catalog MSRP truth.');

    const confirmBtn = screen.getByRole('button', { name: /confirm approval/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(approvalsApi.approve).toHaveBeenCalledWith('job-001-uuid', {
        versionId: 'ver-002-uuid',
        comment: 'Verified against catalog MSRP truth.',
      });
    });
  });

  it('WEB-REVIEW-10: opens RejectDecisionModal, enforces min 3 chars, and records rejection', async () => {
    const user = userEvent.setup();
    vi.mocked(approvalsApi.reject).mockResolvedValueOnce({
      id: 'rej-event-1',
      contentJobId: 'job-001-uuid',
      contentVersionId: 'ver-002-uuid',
      approverUserId: 'usr-approver-001',
      decision: 'REJECTED',
      comment: 'Headline claims 50% discount which contradicts MSRP.',
      createdAt: '2026-10-29T10:20:00.000Z',
    });

    renderDeskPage(sampleDetail);

    const rejectBtn = await screen.findByTestId('reject-decision-button');
    await user.click(rejectBtn);

    expect(await screen.findByTestId('reject-decision-modal')).toBeInTheDocument();

    const reasonInput = screen.getByPlaceholderText(/Headline claims 50% discount/i);
    await user.type(reasonInput, 'Headline claims 50% discount which contradicts MSRP.');

    const confirmBtn = screen.getByRole('button', { name: /confirm rejection/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(approvalsApi.reject).toHaveBeenCalledWith('job-001-uuid', {
        versionId: 'ver-002-uuid',
        reason: 'Headline claims 50% discount which contradicts MSRP.',
      });
    });
  });

  it('WEB-REVIEW-11: renders automated factual consistency gate status and findings list', async () => {
    const detailWithFindings: ReviewDeskDetail = {
      ...sampleDetail,
      validationResult: {
        id: 'val-003',
        status: 'PASSED_WITH_WARNINGS',
        blockingCount: 0,
        warningCount: 1,
        findings: [
          {
            severity: 'WARNING',
            field: 'creative_brief',
            code: 'STYLE_EXCLAMATION_EXCESS',
            message: 'Tone exceeds recommended exclamation marks.',
          },
        ],
      },
    };

    renderDeskPage(detailWithFindings);

    expect(await screen.findByTestId('validation-findings-card')).toBeInTheDocument();
    expect(screen.getByText('PASSED_WITH_WARNINGS')).toBeInTheDocument();
    expect(screen.getByText('Tone exceeds recommended exclamation marks.')).toBeInTheDocument();
  });

  it('WEB-REVIEW-12: renders version comparison diff panel when viewing revised version > 1', async () => {
    renderDeskPage(sampleDetail);

    expect(await screen.findByTestId('version-comparison-panel')).toBeInTheDocument();
    expect(screen.getByText(/Version Revision Diff \(v1 → v2\)/i)).toBeInTheDocument();
    expect(screen.getByText('Original Moonlit River')).toBeInTheDocument();
    expect(screen.getAllByText('Moonlit River Luxury Fragrance').length).toBeGreaterThanOrEqual(1);
  });
});
