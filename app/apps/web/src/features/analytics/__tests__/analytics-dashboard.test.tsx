import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test/test-utils.js';
import { AnalyticsOverviewPage } from '../pages/AnalyticsOverviewPage.js';
import { CostControlPage } from '../pages/CostControlPage.js';
import { ContentPerformancePanel } from '../components/ContentPerformancePanel.js';
import { CampaignActivityPanel } from '../components/CampaignActivityPanel.js';
import { CreativeProductionPanel } from '../components/CreativeProductionPanel.js';
import { PublishingStatusPanel } from '../components/PublishingStatusPanel.js';
import { BudgetUtilizationCard } from '../components/BudgetUtilizationCard.js';
import { DateRangeFilter } from '../components/DateRangeFilter.js';
import { CostLedgerTable } from '../components/CostLedgerTable.js';
import { UnreconciledUsagePanel } from '../components/UnreconciledUsagePanel.js';
import { analyticsApi } from '../api/analytics-api.js';
import { authApi } from '../../../services/api/auth-api.js';
import type {
  OperationalKpis,
  BudgetUtilization,
  ContentAnalytics,
  CampaignAnalytics,
  CreativeAnalytics,
  PublishingAnalytics,
  AiUsageAnalytics,
  PaginatedCostLedger,
  UnreconciledUsage,
} from '../types/analytics.types.js';

vi.mock('../api/analytics-api.js', () => ({
  analyticsApi: {
    getOverview: vi.fn(),
    getContent: vi.fn(),
    getCampaigns: vi.fn(),
    getCreative: vi.fn(),
    getPublishing: vi.fn(),
    getAiUsage: vi.fn(),
    getBudgetUtilization: vi.fn(),
    createBudget: vi.fn(),
    updateBudget: vi.fn(),
    getCostLedger: vi.fn(),
    getUnreconciled: vi.fn(),
    reconcile: vi.fn(),
  },
}));

vi.mock('../../../services/api/auth-api.js', () => ({
  authApi: {
    login: vi.fn(),
    getCurrentEmployee: vi.fn().mockResolvedValue({
      user: {
        id: 'usr-admin-001',
        displayName: 'Ops Lead',
        roles: ['ADMIN'],
        permissions: [
          'VIEW_OWN_CONTENT',
          'VIEW_ALL_CONTENT',
          'VIEW_OPERATIONAL_ANALYTICS',
          'VIEW_AI_COSTS',
          'MANAGE_AI_BUDGETS',
        ],
      },
    }),
    logout: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

const mockOverview: OperationalKpis = {
  totalContentJobs: 42,
  completedGenerations: 38,
  failedGenerations: 4,
  pendingReviews: 12,
  approvedVersions: 26,
  rejectedVersions: 5,
  activeCampaigns: 7,
  creativeProjects: 15,
  publicationsDelivered: 19,
  publicationsFailed: 2,
  totalAiCostUsd: 14.8525,
  confirmedAiCostUsd: 12.501,
  reservedAiCostUsd: 2.3515,
  asOf: '2026-10-30T10:00:00.000Z',
};

const mockBudget: BudgetUtilization = {
  policyId: 'pol-001',
  currency: 'USD',
  monthlyCeiling: 20.0,
  perRequestCeiling: 0.5,
  softAlertThreshold: 0.8,
  periodStart: '2026-10-01T00:00:00.000Z',
  periodEnd: '2026-11-01T00:00:00.000Z',
  settledCostUsd: 12.5,
  activeReservedCostUsd: 2.35,
  unreconciledExposureUsd: 0.0,
  totalCommittedCostUsd: 14.85,
  remainingHeadroomUsd: 5.15,
  utilizationPercent: 74.25,
  isExhausted: false,
  isSoftAlertTriggered: false,
  asOf: '2026-10-30T10:00:00.000Z',
};

const mockContentAnalytics: ContentAnalytics = {
  totalJobs: 42,
  draftJobs: 3,
  generatingJobs: 1,
  pendingReviewJobs: 12,
  approvedJobs: 21,
  rejectedJobs: 5,
  totalAttempts: 55,
  successfulAttempts: 50,
  failedAttempts: 5,
  averageDurationMs: 3200,
  dailyActivity: [
    { date: '2026-10-29', created: 10, succeeded: 9, failed: 1 },
    { date: '2026-10-30', created: 15, succeeded: 14, failed: 1 },
  ],
};

const mockCampaignAnalytics: CampaignAnalytics = {
  totalCampaigns: 8,
  draftCampaigns: 1,
  plannedCampaigns: 2,
  activeCampaigns: 4,
  completedCampaigns: 1,
  archivedCampaigns: 0,
  totalProductsAssociated: 24,
  totalContentJobsAssociated: 32,
  campaignsSummary: [
    {
      id: 'cmp-1',
      code: 'CMP-PARIS-AUTUMN',
      name: 'Autumn Heritage Collection',
      status: 'ACTIVE',
      productCount: 12,
      contentJobCount: 18,
      publicationCount: 9,
    },
  ],
};

const mockCreativeAnalytics: CreativeAnalytics = {
  totalCreativeProjects: 15,
  renderAttempts: 30,
  successfulRenders: 28,
  failedRenders: 2,
  approvedScenes: 18,
  rejectedScenes: 3,
  exportArtifacts: 22,
  byFormat: [
    { format: '1:1', count: 12 },
    { format: '4:5', count: 6 },
    { format: '9:16', count: 4 },
  ],
};

const mockPublishingAnalytics: PublishingAnalytics = {
  totalPublications: 25,
  draftPublications: 2,
  readyPublications: 1,
  queuedPublications: 0,
  processingPublications: 0,
  publishedCount: 19,
  failedCount: 2,
  cancelledCount: 1,
  unknownOutcomes: 0,
  byChannel: [
    { channel: 'TELEGRAM_CHANNEL', total: 15, published: 13, failed: 2 },
    { channel: 'MANUAL_EXPORT', total: 10, published: 10, failed: 0 },
  ],
  attemptSuccessRatePercent: 92.5,
};

const mockAiUsage: AiUsageAnalytics = {
  totalAttempts: 55,
  successfulAttempts: 50,
  failedAttempts: 5,
  totalInputTokens: 120500,
  totalOutputTokens: 45000,
  totalTokens: 165500,
  estimatedCostUsd: 14.85,
  confirmedCostUsd: 12.5,
  reservedCostUsd: 2.35,
  byProviderModel: [
    {
      provider: 'OPENAI',
      model: 'gpt-4o-mini',
      requests: 45,
      inputTokens: 90000,
      outputTokens: 35000,
      estimatedCostUsd: 4.5,
      confirmedCostUsd: 4.25,
    },
    {
      provider: 'OPENAI',
      model: 'gpt-4o',
      requests: 10,
      inputTokens: 30500,
      outputTokens: 10000,
      estimatedCostUsd: 10.35,
      confirmedCostUsd: 8.25,
    },
  ],
  dailyUsage: [],
};

const mockLedger: PaginatedCostLedger = {
  items: [
    {
      id: 'led-1',
      type: 'USAGE',
      referenceId: 'usg-1',
      provider: 'OPENAI',
      model: 'gpt-4o-mini',
      status: 'CONFIRMED',
      costKnowledge: 'CONFIRMED',
      amountUsd: 0.0042,
      inputTokens: 1500,
      outputTokens: 400,
      idempotencyKey: 'idem-key-001',
      createdAt: '2026-10-30T09:30:00.000Z',
    },
    {
      id: 'led-2',
      type: 'RESERVATION',
      referenceId: 'res-1',
      provider: 'OPENAI',
      model: 'gpt-4o',
      status: 'ACTIVE',
      costKnowledge: 'CEILING_ESTIMATED',
      amountUsd: 0.015,
      inputTokens: null,
      outputTokens: null,
      idempotencyKey: 'idem-key-002',
      createdAt: '2026-10-30T09:45:00.000Z',
    },
  ],
  total: 2,
  page: 1,
  limit: 10,
  totalPages: 1,
};

const mockUnreconciled: UnreconciledUsage[] = [
  {
    reservationId: 'res-unrec-01',
    idempotencyKey: 'timeout-req-123',
    contentJobId: 'job-999',
    creativeJobId: null,
    reservedAmount: 0.0125,
    status: 'UNRECONCILED',
    createdAt: '2026-10-30T08:00:00.000Z',
    expiresAt: '2026-10-30T08:30:00.000Z',
    reason: 'Upstream HTTP timeout during completion generation',
  },
];

describe('Web Analytics & Cost Control Workstation (WEB-ANALYTICS-01 to 15)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(analyticsApi.getOverview).mockResolvedValue(mockOverview);
    vi.mocked(analyticsApi.getBudgetUtilization).mockResolvedValue(mockBudget);
    vi.mocked(analyticsApi.getContent).mockResolvedValue(mockContentAnalytics);
    vi.mocked(analyticsApi.getCampaigns).mockResolvedValue(mockCampaignAnalytics);
    vi.mocked(analyticsApi.getCreative).mockResolvedValue(mockCreativeAnalytics);
    vi.mocked(analyticsApi.getPublishing).mockResolvedValue(mockPublishingAnalytics);
    vi.mocked(analyticsApi.getAiUsage).mockResolvedValue(mockAiUsage);
    vi.mocked(analyticsApi.getCostLedger).mockResolvedValue(mockLedger);
    vi.mocked(analyticsApi.getUnreconciled).mockResolvedValue([]);
  });

  // WEB-ANALYTICS-01
  it('WEB-ANALYTICS-01: Renders Analytics Dashboard with tabs/cards and KPIs', async () => {
    renderWithProviders(<AnalyticsOverviewPage />);
    expect(screen.getByText('Operational Analytics & Telemetry')).toBeInTheDocument();
    expect(screen.getByTestId('date-range-filter')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('nav-cost-control-btn')).toBeInTheDocument();
    });
  });

  // WEB-ANALYTICS-02
  it('WEB-ANALYTICS-02: Displays live operational KPI counts (content, campaigns, creative, publishing, AI cost)', async () => {
    renderWithProviders(<AnalyticsOverviewPage />);
    await waitFor(() => {
      expect(screen.getByTestId('kpi-content-jobs')).toHaveTextContent('42');
      expect(screen.getByTestId('kpi-pending-reviews')).toHaveTextContent('12');
      expect(screen.getByTestId('kpi-active-campaigns')).toHaveTextContent('7');
      expect(screen.getByTestId('kpi-creative-projects')).toHaveTextContent('15');
      expect(screen.getByTestId('kpi-publications-delivered')).toHaveTextContent('19');
      expect(screen.getByTestId('kpi-ai-cost')).toHaveTextContent('$14.85');
    });
  });

  // WEB-ANALYTICS-03
  it('WEB-ANALYTICS-03: Renders budget utilization progress bar with monthly ceiling and committed cost', () => {
    renderWithProviders(<BudgetUtilizationCard utilization={mockBudget} canManageBudget={true} />);
    expect(screen.getByTestId('monthly-ceiling-val')).toHaveTextContent('$20.00');
    expect(screen.getByTestId('committed-cost-val')).toHaveTextContent('$14.8500');
    expect(screen.getByTestId('remaining-headroom-val')).toHaveTextContent('$5.1500');
    expect(screen.getByTestId('budget-progress-bar')).toHaveStyle({ width: '74.25%' });
  });

  // WEB-ANALYTICS-04
  it('WEB-ANALYTICS-04: Shows soft alert indicator / warning when threshold exceeded', () => {
    const softAlertBudget: BudgetUtilization = {
      ...mockBudget,
      totalCommittedCostUsd: 17.5,
      utilizationPercent: 87.5,
      isSoftAlertTriggered: true,
      isExhausted: false,
    };
    renderWithProviders(<BudgetUtilizationCard utilization={softAlertBudget} />);
    expect(screen.getByTestId('budget-soft-alert')).toBeInTheDocument();
    expect(screen.getByTestId('budget-soft-alert')).toHaveTextContent(/87.5%/);
  });

  // WEB-ANALYTICS-05
  it('WEB-ANALYTICS-05: Shows budget exhausted banner / badge when 100% reached', () => {
    const exhaustedBudget: BudgetUtilization = {
      ...mockBudget,
      totalCommittedCostUsd: 20.0,
      remainingHeadroomUsd: 0.0,
      utilizationPercent: 100.0,
      isExhausted: true,
      isSoftAlertTriggered: true,
    };
    renderWithProviders(<BudgetUtilizationCard utilization={exhaustedBudget} />);
    expect(screen.getByTestId('budget-exhausted-alert')).toBeInTheDocument();
    expect(screen.getByText(/AI Spending Cap Reached:/)).toBeInTheDocument();
  });

  // WEB-ANALYTICS-06
  it('WEB-ANALYTICS-06: Displays estimated vs confirmed cost distinction', async () => {
    renderWithProviders(<CostControlPage />);
    await waitFor(() => {
      expect(screen.getByTestId('ai-confirmed-cost')).toHaveTextContent('$12.5000');
      expect(screen.getByTestId('ai-estimated-cost')).toHaveTextContent('$14.8500');
      expect(screen.getByTestId('ai-reserved-cost')).toHaveTextContent('$2.3500');
    });
  });

  // WEB-ANALYTICS-07
  it('WEB-ANALYTICS-07: Date range filter updates query parameters / refetches data', async () => {
    const user = userEvent.setup();
    const handleRangeChange = vi.fn();
    renderWithProviders(<DateRangeFilter value={{}} onChange={handleRangeChange} />);

    const btn7d = screen.getByRole('button', { name: 'Last 7 Days' });
    await user.click(btn7d);

    expect(handleRangeChange).toHaveBeenCalledWith(
      expect.objectContaining({
        timezone: 'UTC',
        startDate: expect.any(String),
        endDate: expect.any(String),
      }),
    );
  });

  // WEB-ANALYTICS-08
  it('WEB-ANALYTICS-08: Content performance panel displays job lifecycle stats and daily activity', () => {
    renderWithProviders(<ContentPerformancePanel analytics={mockContentAnalytics} />);
    expect(screen.getByTestId('content-total-jobs')).toHaveTextContent('42');
    expect(screen.getByTestId('content-total-attempts')).toHaveTextContent('55');
    expect(screen.getByTestId('content-success-rate')).toHaveTextContent('90.9%');
    expect(screen.getByTestId('status-draft')).toHaveTextContent('3');
    expect(screen.getByTestId('status-generating')).toHaveTextContent('1');
    expect(screen.getByTestId('status-pending-review')).toHaveTextContent('12');
    expect(screen.getByTestId('status-approved')).toHaveTextContent('21');
    expect(screen.getByTestId('status-rejected')).toHaveTextContent('5');
    expect(screen.getByText('2026-10-29')).toBeInTheDocument();
  });

  // WEB-ANALYTICS-09
  it('WEB-ANALYTICS-09: Campaign activity panel lists campaigns and product associations', () => {
    renderWithProviders(<CampaignActivityPanel analytics={mockCampaignAnalytics} />);
    expect(screen.getByTestId('campaigns-total')).toHaveTextContent('8');
    expect(screen.getByTestId('campaigns-active')).toHaveTextContent('4');
    expect(screen.getByTestId('campaigns-products')).toHaveTextContent('24');
    expect(screen.getByText('CMP-PARIS-AUTUMN')).toBeInTheDocument();
    expect(screen.getByText('Autumn Heritage Collection')).toBeInTheDocument();
  });

  // WEB-ANALYTICS-10
  it('WEB-ANALYTICS-10: Creative production panel shows render counts and format breakdown', () => {
    renderWithProviders(<CreativeProductionPanel analytics={mockCreativeAnalytics} />);
    expect(screen.getByTestId('creative-total-projects')).toHaveTextContent('15');
    expect(screen.getByTestId('creative-total-renders')).toHaveTextContent('30');
    expect(screen.getByTestId('creative-approved-scenes')).toHaveTextContent('18');
    expect(screen.getByTestId('creative-export-artifacts')).toHaveTextContent('22');
    expect(screen.getByTestId('format-1:1')).toHaveTextContent('12');
    expect(screen.getByTestId('format-4:5')).toHaveTextContent('6');
    expect(screen.getByTestId('format-9:16')).toHaveTextContent('4');
  });

  // WEB-ANALYTICS-11
  it('WEB-ANALYTICS-11: Publishing status panel shows channel breakdowns and attempt rates', () => {
    renderWithProviders(<PublishingStatusPanel analytics={mockPublishingAnalytics} />);
    expect(screen.getByTestId('publishing-total')).toHaveTextContent('25');
    expect(screen.getByTestId('publishing-published')).toHaveTextContent('19');
    expect(screen.getByTestId('publishing-failed')).toHaveTextContent('2');
    expect(screen.getByTestId('publishing-success-rate')).toHaveTextContent('92.5%');
    expect(screen.getByTestId('channel-row-TELEGRAM_CHANNEL')).toBeInTheDocument();
    expect(screen.getByTestId('channel-row-MANUAL_EXPORT')).toBeInTheDocument();
  });

  // WEB-ANALYTICS-12
  it('WEB-ANALYTICS-12: AI cost ledger displays reservations, settlements, idempotency keys, tokens', () => {
    renderWithProviders(<CostLedgerTable data={mockLedger} page={1} onPageChange={vi.fn()} />);
    expect(screen.getByTestId('ledger-row-led-1')).toBeInTheDocument();
    expect(screen.getByTestId('ledger-row-led-2')).toBeInTheDocument();
    expect(screen.getByText('idem-key-001')).toBeInTheDocument();
    expect(screen.getByText('idem-key-002')).toBeInTheDocument();
    expect(screen.getByText('$0.0042')).toBeInTheDocument();
    expect(screen.getByText('$0.0150')).toBeInTheDocument();
  });

  // WEB-ANALYTICS-13
  it('WEB-ANALYTICS-13: Unreconciled usage banner displays count and allows manual reconciliation action', async () => {
    const user = userEvent.setup();
    const handleReconcile = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <UnreconciledUsagePanel items={mockUnreconciled} onReconcile={handleReconcile} />,
    );

    expect(screen.getByText(/Unreconciled Provider Dispatches \(1\)/)).toBeInTheDocument();
    expect(screen.getByTestId('reconcile-btn-res-unrec-01')).toBeInTheDocument();

    await user.click(screen.getByTestId('reconcile-btn-res-unrec-01'));
    expect(screen.getByTestId('reconcile-modal')).toBeInTheDocument();

    await user.click(screen.getByTestId('confirm-reconciliation-btn'));
    expect(handleReconcile).toHaveBeenCalledWith(
      'res-unrec-01',
      expect.objectContaining({
        resolution: 'SETTLE_CONFIRMED',
        notes: expect.any(String),
      }),
    );
  });

  // WEB-ANALYTICS-14
  it('WEB-ANALYTICS-14: Budget adjustment modal/form updates ceiling for authorized admin/manager (MANAGE_AI_BUDGETS)', async () => {
    const user = userEvent.setup();
    vi.mocked(analyticsApi.updateBudget).mockResolvedValue({ id: 'pol-001' } as any);

    renderWithProviders(<CostControlPage />);

    await waitFor(() => {
      expect(screen.getByTestId('adjust-budget-btn')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('adjust-budget-btn'));
    expect(screen.getByTestId('adjust-budget-modal')).toBeInTheDocument();

    const input = screen.getByTestId('budget-ceiling-input');
    await user.clear(input);
    await user.type(input, '25');

    await user.click(screen.getByTestId('save-budget-btn'));

    expect(analyticsApi.updateBudget).toHaveBeenCalledWith(
      'pol-001',
      expect.objectContaining({
        monthlyCeiling: 25,
      }),
    );
  });

  // WEB-ANALYTICS-15
  it('WEB-ANALYTICS-15: Permission gating: non-analytics roles receive restricted views', async () => {
    vi.mocked(authApi.getCurrentEmployee).mockResolvedValue({
      user: {
        id: 'usr-guest-001',
        displayName: 'Guest Viewer',
        status: 'ACTIVE',
        roles: ['VIEWER'],
        permissions: ['VIEW_OWN_CONTENT'],
      },
    });

    renderWithProviders(<AnalyticsOverviewPage />);

    await waitFor(() => {
      expect(screen.queryByTestId('nav-cost-control-btn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('budget-utilization-card')).not.toBeInTheDocument();
    });
  });
});
