import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../../test/test-utils.js';
import { ContentJobDetailPage } from '../pages/ContentJobDetailPage.js';
import { contentApi } from '../api/content-api.js';
import type { ContentJobDetail, ContentVersion, ValidationResult } from '../types/content.types.js';

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

describe('Content Job Detail Page (WEB-CONTENT-11 to WEB-CONTENT-16)', () => {
  const version1: ContentVersion = {
    id: 'ver-001-uuid',
    contentJobId: 'job-001-uuid',
    versionNumber: 1,
    provider: 'FAKE_AI',
    model: 'fake-luxury-v1',
    promptVersion: '1.0.0',
    structuredOutput: {
      headline: 'Rose Absolue — An Ode to Parisian Splendor',
      english_caption:
        'Experience the velvety essence of Grasse May roses with precious woody depth. Available at $185.00 MSRP.',
      khmer_caption: 'បទពិសោធន៍ក្លិនផ្កាកុលាបដ៏ប្រណិតពីទីក្រុងប៉ារីស។ តម្លៃ $185.00 MSRP។',
      cta: 'Contact your VIP luxury advisor via Telegram.',
      hashtags: ['#ParisianShopper', '#LuxuryFragrance', '#RoseAbsolue'],
      facts_used: ['MSRP $185.00', 'Rose de Mai', 'Maison Fictif'],
    },
    createdAt: '2026-10-29T08:02:00.000Z',
  };

  const validationResult1: ValidationResult = {
    id: 'val-001-uuid',
    contentVersionId: 'ver-001-uuid',
    validatorVersion: '1.0.0',
    status: 'PASSED',
    findingCount: 0,
    blockingCount: 0,
    warningCount: 0,
    infoCount: 0,
    findings: [],
    createdAt: '2026-10-29T08:02:05.000Z',
  };

  const mockJobDetail: ContentJobDetail = {
    job: {
      id: 'job-001-uuid',
      productSnapshotId: 'snap-001',
      brandRuleVersionId: 'rule-001',
      requesterUserId: 'usr-content-001',
      campaignId: 'camp-summer-001',
      contentType: 'PRODUCT_SPOTLIGHT',
      language: 'BILINGUAL',
      platform: 'TELEGRAM',
      status: 'DRAFT',
      createdAt: '2026-10-29T08:00:00.000Z',
      updatedAt: '2026-10-29T08:02:00.000Z',
    },
    product: {
      id: 'snap-001',
      sku: 'FIC-PERF-001',
      title: 'Rose Absolue Eau de Parfum',
      brand: 'Maison Fictif',
      priceUsd: 185.0,
      category: 'Fragrance',
    },
    campaign: {
      id: 'camp-summer-001',
      code: 'CAMP-SUMMER-2026',
      name: 'Summer Riviera Spotlight',
      status: 'ACTIVE',
    },
    attempts: [
      {
        id: 'att-001',
        contentJobId: 'job-001-uuid',
        attemptNumber: 1,
        provider: 'FAKE_AI',
        model: 'fake-luxury-v1',
        promptVersion: '1.0.0',
        status: 'SUCCEEDED',
        startedAt: '2026-10-29T08:00:05.000Z',
        completedAt: '2026-10-29T08:01:50.000Z',
      },
    ],
    versions: [version1],
    currentVersion: version1,
    latestValidationResult: validationResult1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(contentApi.getJobById).mockResolvedValue(mockJobDetail);
  });

  it('WEB-CONTENT-11: Renders generating progress card when job status is GENERATING', async () => {
    vi.mocked(contentApi.getJobById).mockResolvedValue({
      ...mockJobDetail,
      job: { ...mockJobDetail.job, status: 'GENERATING' },
      currentVersion: null,
      versions: [],
      latestValidationResult: null,
      attempts: [
        {
          id: 'att-001',
          contentJobId: 'job-001-uuid',
          attemptNumber: 1,
          provider: 'FAKE_AI',
          model: 'fake-luxury-v1',
          promptVersion: '1.0.0',
          status: 'RUNNING',
          startedAt: '2026-10-29T08:00:05.000Z',
        },
      ],
    });

    renderWithProviders(
      <Routes>
        <Route path="/content/jobs/:id" element={<ContentJobDetailPage />} />
      </Routes>,
      { initialEntries: ['/content/jobs/job-001-uuid'] },
    );

    expect(await screen.findByText(/Synthesizing Luxury Marketing Copy/i)).toBeInTheDocument();
    expect(screen.getByText(/Executing brand-safe text synthesis/i)).toBeInTheDocument();
  });

  it('WEB-CONTENT-12: Renders copy preview with headline, captions, CTA, and hashtags', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/content/jobs/:id" element={<ContentJobDetailPage />} />
      </Routes>,
      { initialEntries: ['/content/jobs/job-001-uuid'] },
    );

    expect(
      await screen.findByText('Rose Absolue — An Ode to Parisian Splendor'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Grasse May roses with precious woody depth/i)).toBeInTheDocument();
    expect(screen.getByText(/Contact your VIP luxury advisor/i)).toBeInTheDocument();
    expect(screen.getByText('#RoseAbsolue')).toBeInTheDocument();
  });

  it('WEB-CONTENT-13: Displays factual truth compliance findings panel', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/content/jobs/:id" element={<ContentJobDetailPage />} />
      </Routes>,
      { initialEntries: ['/content/jobs/job-001-uuid'] },
    );

    expect(await screen.findByText('Factual Truth & Brand Compliance')).toBeInTheDocument();
    expect(screen.getByText('Verified Factual')).toBeInTheDocument();
    expect(screen.getByText(/matched verified catalog snapshots exactly/i)).toBeInTheDocument();
  });

  it('WEB-CONTENT-14: Switches to edit mode, saves revision, and displays version update', async () => {
    const user = userEvent.setup();

    const version2: ContentVersion = {
      ...version1,
      id: 'ver-002-uuid',
      versionNumber: 2,
      structuredOutput: {
        ...version1.structuredOutput,
        headline: 'Rose Absolue — Pure Parisian Splendor',
      },
      createdAt: '2026-10-29T08:05:00.000Z',
    };

    vi.mocked(contentApi.reviseManual).mockResolvedValue({
      version: version2,
      validationResult: validationResult1,
    });

    renderWithProviders(
      <Routes>
        <Route path="/content/jobs/:id" element={<ContentJobDetailPage />} />
      </Routes>,
      { initialEntries: ['/content/jobs/job-001-uuid'] },
    );

    // Click Revise Copy
    const editBtn = await screen.findByRole('button', { name: /Revise Copy/i });
    await user.click(editBtn);

    // Verify Editor Form is rendered
    expect(
      await screen.findByText(/Revise Copy \(Creates New Immutable Version\)/i),
    ).toBeInTheDocument();

    const headlineInput = screen.getByDisplayValue('Rose Absolue — An Ode to Parisian Splendor');
    await user.clear(headlineInput);
    await user.type(headlineInput, 'Rose Absolue — Pure Parisian Splendor');

    const saveBtn = screen.getByRole('button', { name: /Save New Version/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(contentApi.reviseManual).toHaveBeenCalledWith(
        'job-001-uuid',
        expect.objectContaining({
          currentVersionId: 'ver-001-uuid',
          field: 'headline',
          newValue: 'Rose Absolue — Pure Parisian Splendor',
        }),
      );
    });

    expect(
      await screen.findByText(/Saved revision as Version 2 with re-evaluated compliance/i),
    ).toBeInTheDocument();
  });

  it('WEB-CONTENT-15: Displays version history and allows navigating between versions', async () => {
    const user = userEvent.setup();

    const version2: ContentVersion = {
      ...version1,
      id: 'ver-002-uuid',
      versionNumber: 2,
      revisionRequestId: 'rev-001',
      structuredOutput: {
        ...version1.structuredOutput,
        headline: 'Rose Absolue — Edition Deux',
      },
      createdAt: '2026-10-29T08:05:00.000Z',
    };

    vi.mocked(contentApi.getJobById).mockResolvedValue({
      ...mockJobDetail,
      versions: [version1, version2],
      currentVersion: version2,
    });

    renderWithProviders(
      <Routes>
        <Route path="/content/jobs/:id" element={<ContentJobDetailPage />} />
      </Routes>,
      { initialEntries: ['/content/jobs/job-001-uuid'] },
    );

    expect(await screen.findByText('Version History (2 versions)')).toBeInTheDocument();

    // Click Version 1 button in history list
    const v1Btn = screen.getByRole('button', { name: /Version 1/i });
    await user.click(v1Btn);

    // Should now display Version 1 headline
    expect(
      screen.getAllByText('Rose Absolue — An Ode to Parisian Splendor').length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('WEB-CONTENT-16: Enables Four-Eyes submit for review when no blocking findings exist', async () => {
    const user = userEvent.setup();

    vi.mocked(contentApi.submitForReview).mockResolvedValue({
      ...mockJobDetail.job,
      status: 'UNDER_REVIEW',
    });

    renderWithProviders(
      <Routes>
        <Route path="/content/jobs/:id" element={<ContentJobDetailPage />} />
      </Routes>,
      { initialEntries: ['/content/jobs/job-001-uuid'] },
    );

    expect(await screen.findByText('Submit for Four-Eyes Review')).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: /Submit for Review/i });
    expect(submitBtn).toBeEnabled();

    await user.click(submitBtn);

    await waitFor(() => {
      expect(contentApi.submitForReview).toHaveBeenCalledWith('job-001-uuid', 'ver-001-uuid');
    });

    expect(
      await screen.findByText('Submitted version for independent review.'),
    ).toBeInTheDocument();
  });
});
