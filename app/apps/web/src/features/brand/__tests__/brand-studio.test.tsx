import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test/test-utils.js';
import { BrandProfilePage } from '../pages/BrandProfilePage.js';
import { BrandBenchmarkLabPage } from '../pages/BrandBenchmarkLabPage.js';
import { BrandDatasetsPage } from '../pages/BrandDatasetsPage.js';
import { brandApi } from '../api/brand-api.js';
import type {
  BrandProfileVersionRecord,
  BenchmarkEvaluationReport,
  BrandDatasetVersionRecord,
  ReviewFeedbackRecord,
} from '../types/brand.types.js';

vi.mock('../api/brand-api.js', () => ({
  brandApi: {
    getActiveBrandProfile: vi.fn(),
    listBrandProfiles: vi.fn(),
    createBrandProfile: vi.fn(),
    activateBrandProfile: vi.fn(),
    rollbackBrandProfile: vi.fn(),
    runBrandBenchmark: vi.fn(),
    listBrandFeedback: vi.fn(),
    listBrandDatasets: vi.fn(),
    curateBrandDataset: vi.fn(),
  },
}));

vi.mock('../../../services/api/auth-api.js', () => ({
  authApi: {
    login: vi.fn(),
    getCurrentEmployee: vi.fn().mockResolvedValue({
      user: {
        id: 'usr-brand-admin-01',
        displayName: 'Brand Director',
        roles: ['ADMIN'],
        permissions: ['MANAGE_BRAND_PROFILE', 'APPROVE_CONTENT', 'ADMIN'],
      },
    }),
    logout: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

const mockActiveProfile: BrandProfileVersionRecord = {
  id: 'profile-v1-uuid',
  versionNumber: 1,
  name: 'Parisian Luxury Core Identity v1',
  status: 'ACTIVE',
  evaluationPolicyId: 'eval-policy-core-v1',
  approvedByUserId: 'usr-brand-admin-01',
  activatedAt: '2026-11-01T10:05:00.000Z',
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:05:00.000Z',
  benchmarkReport: null,
  prohibitedPatterns: [],
  approvedExampleIds: ['collat-ex-001', 'collat-ex-002'],
  toneRules: {
    luxuryAttributes: ['Elegance', 'Exclusivity', 'Restraint', 'Clarity'],
    prohibitedHyperbole: ['cheapest', 'unbelievable deal', '100% best', 'crazy price'],
    allowedEmojis: ['✨', '💎', '🏛️'],
    maxEmojisPerPost: 2,
  },
  languagePolicy: {
    formality: 'LUXURY_FORMAL',
    primaryLanguage: 'BILINGUAL',
    khmerConventions: {
      scriptStyle: 'Moul',
      spacingRules: 'Zero-width space between phrases, standard punctuation',
      disallowedLoanwords: ['discount', 'cheap', 'best price'],
    },
    englishConventions: {
      tone: 'Understated Parisian Elegance',
      capitalization: 'SENTENCE_CASE',
    },
  },
  visualAestheticRules: {
    approvedColorPalettes: [
      { name: 'Haussmann Cream & Obsidian', hexCodes: ['#F9F6F0', '#1A1A1A', '#C9A96E'] },
    ],
    lightingStyles: ['Soft Daylight Atelier'],
    textures: ['Fine French Linen', 'Brushed Brass'],
    pedestals: ['Minimalist Stone Slab'],
  },
  typographyRules: {
    headlineFont: 'Playfair Display',
    bodyFontKhmer: 'Battambang',
    bodyFontLatin: 'Inter',
    minimumLeadingRatio: 1.4,
  },
  logoRules: {
    clearSpaceRatio: 0.25,
    allowedPlacements: ['TOP_CENTER', 'BOTTOM_CENTER'],
    defaultVariant: 'GOLD',
  },
};

const mockDraftProfile: BrandProfileVersionRecord = {
  ...mockActiveProfile,
  id: 'profile-v2-uuid',
  versionNumber: 2,
  name: 'Winter Parisian Haute Parfumerie v2 Draft',
  status: 'DRAFT',
  activatedAt: null,
};

const mockRetiredProfile: BrandProfileVersionRecord = {
  ...mockActiveProfile,
  id: 'profile-v0-uuid',
  versionNumber: 0,
  name: 'Heritage Autumn Parfumerie v0',
  status: 'RETIRED',
  activatedAt: '2026-10-01T10:00:00.000Z',
};

const mockBenchmarkReport: BenchmarkEvaluationReport = {
  benchmarkRunId: 'bench-run-001',
  profileId: 'profile-v1-uuid',
  profileVersionNumber: 1,
  testDatasetId: 'test-dataset-01',
  policyId: 'eval-policy-core-v1',
  totalTestCases: 1,
  passedTestCases: 1,
  overallScore: 0.95,
  toneScoreAverage: 0.94,
  typographyScoreAverage: 0.96,
  originalityScoreAverage: 0.98,
  passed: true,
  summaryViolations: [],
  evaluatedAt: '2026-11-03T12:00:00.000Z',
  testCaseEvaluations: [
    {
      testCaseId: 'custom-user-candidate-01',
      prompt: 'Introduce Moonlit River',
      candidateText: 'Moonlit River Eau de Parfum — A whisper of evening jasmine.',
      toneScore: 0.94,
      typographyScore: 0.96,
      originalityScore: 0.98,
      totalScore: 0.95,
      passed: true,
      detectedLuxuryAttributes: ['Elegance', 'Restraint'],
      detectedForbiddenPatterns: [],
      detectedLoanwords: [],
      originalityViolations: [],
    },
  ],
};

const mockDatasets: BrandDatasetVersionRecord[] = [
  {
    id: 'dataset-lora-v1',
    name: 'Autumn-Winter 2026 LoRA / DPO Snapshot',
    versionString: 'v2026.11.01-gold',
    status: 'ACTIVE',
    assetCount: 140,
    gitCommitHash: 'a1b2c3d4e5f67890123456789abcdef012345678',
    approvedByUserId: 'usr-brand-admin-01',
    createdAt: '2026-11-01T08:00:00.000Z',
    updatedAt: '2026-11-01T08:00:00.000Z',
  },
];

const mockFeedback: ReviewFeedbackRecord[] = [
  {
    id: 'fb-001',
    sourceType: 'REVIEW_DESK',
    contentJobId: 'job-perfume-01',
    originalText: 'Moonlit River Eau de Parfum luxury fragrance spotlight.',
    revisedText: null,
    decision: 'APPROVED',
    critiqueNotes: 'Flawless tone and elegance alignment.',
    toneFlags: [],
    createdAt: '2026-11-02T14:00:00.000Z',
  },
  {
    id: 'fb-002',
    sourceType: 'REVIEW_DESK',
    contentJobId: 'job-perfume-02',
    originalText: 'Get the cheapest perfume bottle deal today with unbelievable discounts.',
    revisedText: 'Experience the understated mastery of Parisian perfume.',
    decision: 'REJECTED',
    critiqueNotes: 'Used prohibited term "cheapest".',
    toneFlags: ['PROHIBITED_HYPERBOLE'],
    createdAt: '2026-11-02T15:30:00.000Z',
  },
];

describe('Brand Intelligence Studio (WEB-BRAND-01 to WEB-BRAND-04)', () => {
  const mockedBrandApi = vi.mocked(brandApi);

  beforeEach(() => {
    vi.clearAllMocks();
    mockedBrandApi.getActiveBrandProfile.mockResolvedValue(mockActiveProfile);
    mockedBrandApi.listBrandProfiles.mockResolvedValue([
      mockActiveProfile,
      mockDraftProfile,
      mockRetiredProfile,
    ]);
    mockedBrandApi.createBrandProfile.mockResolvedValue(mockDraftProfile);
    mockedBrandApi.activateBrandProfile.mockResolvedValue({
      ...mockDraftProfile,
      status: 'ACTIVE',
    });
    mockedBrandApi.rollbackBrandProfile.mockResolvedValue({
      rolledBackFromVersionId: 'profile-v1-uuid',
      restoredVersion: {
        ...mockRetiredProfile,
        status: 'ACTIVE',
      },
      reason: 'Critical tone misalignment in previous version.',
      rolledBackAt: '2026-11-03T12:00:00.000Z',
    });
    mockedBrandApi.runBrandBenchmark.mockResolvedValue(mockBenchmarkReport);
    mockedBrandApi.listBrandDatasets.mockResolvedValue(mockDatasets);
    mockedBrandApi.listBrandFeedback.mockResolvedValue(mockFeedback);
    mockedBrandApi.curateBrandDataset.mockResolvedValue({
      id: 'dataset-new-curated',
      name: 'Spring 2027 LoRA Dataset',
      versionString: 'v2026.11.03-gold',
      status: 'CURATING',
      assetCount: 1,
      gitCommitHash: 'feedbeef1234567890abcdef',
      approvedByUserId: 'usr-brand-admin-01',
      createdAt: '2026-11-03T16:00:00.000Z',
      updatedAt: '2026-11-03T16:00:00.000Z',
    });
  });

  describe('BrandProfilePage', () => {
    it('renders active brand profile, tone attributes, prohibited terms, and version history', async () => {
      renderWithProviders(<BrandProfilePage />);

      await waitFor(() => {
        expect(screen.getByText('Brand Intelligence Studio')).toBeInTheDocument();
      });

      // Verify tone attributes
      expect(screen.getByText('Elegance')).toBeInTheDocument();
      expect(screen.getByText('Exclusivity')).toBeInTheDocument();
      expect(screen.getByText('Restraint')).toBeInTheDocument();
      expect(screen.getByText('Clarity')).toBeInTheDocument();

      // Verify prohibited hyperbole
      expect(screen.getByText('cheapest')).toBeInTheDocument();
      expect(screen.getByText('unbelievable deal')).toBeInTheDocument();

      // Verify Khmer conventions
      expect(screen.getByText('Khmer Script:')).toBeInTheDocument();
      expect(screen.getByText('Moul')).toBeInTheDocument();

      // Verify versions listed
      expect(screen.getAllByText('Parisian Luxury Core Identity v1').length).toBeGreaterThan(0);
      expect(screen.getByText('Winter Parisian Haute Parfumerie v2 Draft')).toBeInTheDocument();
    });

    it('switches to draft profile and activates it', async () => {
      const user = userEvent.setup();
      renderWithProviders(<BrandProfilePage />);

      await waitFor(() => {
        expect(screen.getByText('Winter Parisian Haute Parfumerie v2 Draft')).toBeInTheDocument();
      });

      // Click on draft version card
      await user.click(screen.getByText('Winter Parisian Haute Parfumerie v2 Draft'));

      // Click Activate Profile button
      const activateBtn = screen.getByRole('button', { name: /Activate Profile/i });
      expect(activateBtn).toBeInTheDocument();
      await user.click(activateBtn);

      await waitFor(() => {
        expect(mockedBrandApi.activateBrandProfile).toHaveBeenCalledWith('profile-v2-uuid');
      });
    });

    it('opens emergency rollback modal and submits rollback to retired version', async () => {
      const user = userEvent.setup();
      renderWithProviders(<BrandProfilePage />);

      await waitFor(() => {
        expect(screen.getByText('Heritage Autumn Parfumerie v0')).toBeInTheDocument();
      });

      // Click on retired version card to select it
      await user.click(screen.getByText('Heritage Autumn Parfumerie v0'));

      // Click Rollback to This button
      const rollbackBtn = screen.getByRole('button', { name: /Rollback to This/i });
      expect(rollbackBtn).toBeInTheDocument();
      await user.click(rollbackBtn);

      // Verify modal opened
      expect(screen.getByText('Confirm Profile Rollback')).toBeInTheDocument();

      // Enter reason
      const reasonInput = screen.getByPlaceholderText(/Describe reason for emergency rollback/i);
      await user.type(reasonInput, 'Critical tone misalignment in previous version.');

      // Click confirm rollback
      const confirmBtn = screen.getByRole('button', { name: /Confirm Rollback/i });
      await user.click(confirmBtn);

      await waitFor(() => {
        expect(mockedBrandApi.rollbackBrandProfile).toHaveBeenCalledWith(
          'profile-v0-uuid',
          'Critical tone misalignment in previous version.',
        );
      });
    });

    it('opens create draft modal and creates a new profile version', async () => {
      const user = userEvent.setup();
      renderWithProviders(<BrandProfilePage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /New Profile Draft/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /New Profile Draft/i }));

      // Modal is visible
      expect(screen.getByText('Create New Brand Profile Draft')).toBeInTheDocument();

      const nameInput = screen.getByPlaceholderText(/e\.g\. PARISIAN_LUXURY_V2_HOLIDAY/i);
      await user.type(nameInput, 'Spring 2027 Editorial');
      const tone = screen.getByLabelText('Tone description');
      await user.clear(tone);
      await user.type(tone, 'Warm and welcoming');

      const submitBtn = screen.getByRole('button', { name: /Create Draft/i });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(mockedBrandApi.createBrandProfile).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Spring 2027 Editorial',
            languagePolicy: expect.objectContaining({
              primaryLanguage: 'KM',
              englishConventions: expect.objectContaining({ tone: 'Warm and welcoming' }),
            }),
            visualAestheticRules: expect.objectContaining({
              approvedColorPalettes: expect.arrayContaining([
                expect.objectContaining({ hexCodes: ['#B52230', '#FFFFFF'] }),
              ]),
            }),
            approvedExampleIds: [],
          }),
        );
      });
    });
  });

  describe('BrandBenchmarkLabPage', () => {
    it('renders benchmark interface with candidate copy inputs and controls', async () => {
      renderWithProviders(<BrandBenchmarkLabPage />);

      await waitFor(() => {
        expect(screen.getByText('Brand Benchmark & Anti-Regurgitation Lab')).toBeInTheDocument();
      });

      expect(screen.getByText('Candidate Copy Evaluator')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Execute Benchmark Suite/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Run Standard Suite/i })).toBeInTheDocument();
    });

    it('executes interactive candidate benchmark and displays score metrics', async () => {
      const user = userEvent.setup();
      renderWithProviders(<BrandBenchmarkLabPage />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Execute Benchmark Suite/i }),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Execute Benchmark Suite/i }));

      await waitFor(() => {
        expect(mockedBrandApi.runBrandBenchmark).toHaveBeenCalledWith(
          expect.objectContaining({
            profileId: 'profile-v1-uuid',
            testCases: expect.arrayContaining([
              expect.objectContaining({
                testCaseId: 'custom-user-candidate-01',
              }),
            ]),
          }),
        );
      });

      // Verify aggregate scores and pass banner are displayed
      await waitFor(() => {
        expect(screen.getByText('Benchmark Quality Gate PASSED')).toBeInTheDocument();
        expect(screen.getByText('Overall Score')).toBeInTheDocument();
        expect(screen.getAllByText('95%').length).toBeGreaterThan(0);
        expect(screen.getAllByText('94%').length).toBeGreaterThan(0); // Tone & Luxury Fidelity
        expect(screen.getAllByText('98%').length).toBeGreaterThan(0); // Novelty
      });
    });

    it('executes predefined standard test suite', async () => {
      const user = userEvent.setup();
      renderWithProviders(<BrandBenchmarkLabPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Run Standard Suite/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Run Standard Suite/i }));

      await waitFor(() => {
        expect(mockedBrandApi.runBrandBenchmark).toHaveBeenCalledWith({
          profileId: 'profile-v1-uuid',
        });
      });
    });
  });

  describe('BrandDatasetsPage', () => {
    it('displays dataset snapshots with partitions and review feedback telemetry', async () => {
      renderWithProviders(<BrandDatasetsPage />);

      await waitFor(() => {
        expect(
          screen.getByText('Curated Datasets & Review Feedback Ingestion'),
        ).toBeInTheDocument();
      });

      // Verify dataset card
      expect(screen.getByText('Autumn-Winter 2026 LoRA / DPO Snapshot')).toBeInTheDocument();
      expect(screen.getByText('v2026.11.01-gold')).toBeInTheDocument();
      expect(screen.getByText('140')).toBeInTheDocument(); // Asset count

      // Verify feedback telemetry items
      expect(
        screen.getByText('Moonlit River Eau de Parfum luxury fragrance spotlight.'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Get the cheapest perfume bottle deal today with unbelievable discounts.'),
      ).toBeInTheDocument();
      expect(screen.getByText('Used prohibited term "cheapest".')).toBeInTheDocument();
    });

    it('filters feedback items by decision', async () => {
      const user = userEvent.setup();
      renderWithProviders(<BrandDatasetsPage />);

      await waitFor(() => {
        expect(
          screen.getByText('Moonlit River Eau de Parfum luxury fragrance spotlight.'),
        ).toBeInTheDocument();
      });

      // Filter by APPROVED
      const approvedBtn = screen.getByRole('button', { name: 'APPROVED' });
      await user.click(approvedBtn);

      expect(
        screen.getByText('Moonlit River Eau de Parfum luxury fragrance spotlight.'),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(
          'Get the cheapest perfume bottle deal today with unbelievable discounts.',
        ),
      ).not.toBeInTheDocument();
    });

    it('opens curate modal and curates new snapshot from feedback', async () => {
      const user = userEvent.setup();
      renderWithProviders(<BrandDatasetsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Curate New Snapshot/i })).toBeInTheDocument();
      });

      // Select feedback checkbox
      const selectBoxes = await screen.findAllByRole('checkbox');
      if (selectBoxes[0]) {
        await user.click(selectBoxes[0]);
      }

      await user.click(screen.getByRole('button', { name: /Curate New Snapshot/i }));

      // Modal should appear
      expect(screen.getByText('Curate Brand Dataset Snapshot')).toBeInTheDocument();

      // Enter name
      const nameInput = screen.getByPlaceholderText(/e\.g\. Parisian Autumn 2026 Golden Corpus/i);
      await user.type(nameInput, 'Spring 2027 LoRA Dataset');

      // Enter git commit hash
      const hashInput = screen.getByPlaceholderText(/e\.g\. 5bb16ab/i);
      await user.type(hashInput, 'feedbeef1234567890abcdef');

      // Submit curation
      const submitBtn = screen.getByRole('button', { name: /Curate Snapshot/i });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(mockedBrandApi.curateBrandDataset).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Spring 2027 LoRA Dataset',
            gitCommitHash: 'feedbeef1234567890abcdef',
            initialFeedbackIds: ['fb-001'],
          }),
        );
      });
    });
  });
});
