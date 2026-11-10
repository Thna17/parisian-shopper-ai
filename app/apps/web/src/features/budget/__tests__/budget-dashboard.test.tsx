import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test/test-utils.js';
import { BudgetOverviewPage } from '../pages/BudgetOverviewPage.js';
import { UsageLedgerPage } from '../pages/UsageLedgerPage.js';
import { ReconciliationDeskPage } from '../pages/ReconciliationDeskPage.js';
import { CircuitBreakerStatusCard } from '../components/CircuitBreakerStatusCard.js';
import { budgetApi } from '../api/budget-api.js';
import type {
  ActiveBudgetReport,
  BudgetPolicyRecord,
  UsageLedgerEntryRecord,
  UsageReservationRecord,
  CircuitBreakerStatus,
} from '../types/budget.types.js';

vi.mock('../api/budget-api.js', () => ({
  budgetApi: {
    getActivePolicy: vi.fn(),
    listPolicies: vi.fn(),
    updatePolicy: vi.fn(),
    listLedgerEntries: vi.fn(),
    listUnreconciled: vi.fn(),
    reconcileReservation: vi.fn(),
    getRouterCapabilities: vi.fn(),
  },
}));

vi.mock('../../../services/api/auth-api.js', () => ({
  authApi: {
    login: vi.fn(),
    getCurrentEmployee: vi.fn().mockResolvedValue({
      user: {
        id: 'usr-fin-001',
        displayName: 'Financial Controller',
        roles: ['ADMIN'],
        permissions: ['FINANCE_READ', 'FINANCE_WRITE', 'VIEW_AI_COSTS', 'MANAGE_AI_BUDGETS'],
      },
    }),
    logout: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

const mockActivePolicy: BudgetPolicyRecord = {
  id: 'policy-w50-001',
  version: '1.0.0',
  scopeType: 'GLOBAL',
  scopeId: 'GLOBAL',
  currency: 'USD',
  monthlyCeiling: 20.0,
  dailyCeiling: 10.0,
  perOperationMax: 2.0,
  softAlertThreshold: 0.8,
  enforceHardCap: true,
  maxDailyRetries: 3,
  reservationTtlSeconds: 300,
  allowedProviders: ['codex_cli', 'openai', 'fake'],
  allowedFallbacks: ['openai', 'fake'],
  effectiveFrom: '2026-11-01T00:00:00.000Z',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

const mockActiveReport: ActiveBudgetReport = {
  policy: mockActivePolicy,
  quota: {
    policyId: 'policy-w50-001',
    policyVersion: '1.0.0',
    scopeType: 'GLOBAL',
    scopeId: 'GLOBAL',
    currency: 'USD',
    monthlyCeiling: 20.0,
    dailyCeiling: 10.0,
    perOperationMax: 2.0,
    softAlertThreshold: 0.8,
    totalSettledSpendMonth: 16.5,
    totalSettledSpendDay: 4.25,
    activeReservedExposure: 0.15,
    remainingMonthlyHeadroom: 3.35,
    remainingDailyHeadroom: 5.6,
    isMonthlyCeilingExhausted: false,
    isDailyCeilingExhausted: false,
    isSoftAlertTriggered: true,
    asOf: '2026-11-03T18:00:00.000Z',
  },
};

const mockLedgerEntries: readonly UsageLedgerEntryRecord[] = [
  {
    id: 'entry-001',
    entryType: 'RESERVATION_HOLD',
    reservationId: 'res-hold-101',
    settlementKey: 'key-hold-101',
    amount: 0.05,
    currency: 'USD',
    costKnowledge: 'ESTIMATED',
    modelId: 'gpt-4o-mini',
    tokenCount: 1250,
    recordedAt: '2026-11-03T17:30:00.000Z',
    exchangeRateSource: 'ECB_DAILY',
    exchangeRate: 1.0,
    quoteCurrency: 'USD',
    systemComponent: 'BUDGET_ROUTER',
    createdAt: '2026-11-03T17:30:00.000Z',
  },
  {
    id: 'entry-002',
    entryType: 'COST_COMMITMENT',
    reservationId: 'res-commit-102',
    settlementKey: 'key-commit-102',
    amount: 0.042,
    currency: 'USD',
    costKnowledge: 'EXACT',
    modelId: 'gpt-4o-mini',
    tokenCount: 980,
    recordedAt: '2026-11-03T17:32:00.000Z',
    exchangeRateSource: 'ECB_DAILY',
    exchangeRate: 1.0,
    quoteCurrency: 'USD',
    systemComponent: 'SETTLEMENT_WORKER',
    createdAt: '2026-11-03T17:32:00.000Z',
  },
  {
    id: 'entry-003',
    entryType: 'RESERVATION_RELEASE',
    reservationId: 'res-rel-103',
    settlementKey: 'key-rel-103',
    amount: 0.05,
    currency: 'USD',
    costKnowledge: 'ZERO_CONFIRMED',
    modelId: 'dall-e-3',
    recordedAt: '2026-11-03T17:35:00.000Z',
    exchangeRateSource: 'ECB_DAILY',
    exchangeRate: 1.0,
    quoteCurrency: 'USD',
    systemComponent: 'CANCEL_USE_CASE',
    createdAt: '2026-11-03T17:35:00.000Z',
  },
  {
    id: 'entry-004',
    entryType: 'CORRECTION',
    reservationId: 'res-corr-104',
    settlementKey: 'key-corr-104',
    amount: -0.01,
    currency: 'USD',
    costKnowledge: 'EXACT',
    modelId: 'gpt-4o-mini',
    recordedAt: '2026-11-03T17:40:00.000Z',
    exchangeRateSource: 'ECB_DAILY',
    exchangeRate: 1.0,
    quoteCurrency: 'USD',
    systemComponent: 'MANUAL_RECONCILIATION',
    createdAt: '2026-11-03T17:40:00.000Z',
  },
];

const mockHeldReservations: readonly UsageReservationRecord[] = [
  {
    id: 'res-held-999',
    idempotencyKey: 'idemp-timeout-dispatch-01',
    budgetPolicyVersionId: 'policy-w50-001',
    userId: 'usr-operator-01',
    tenantId: 'tenant-main',
    providerId: 'openai',
    modelId: 'gpt-4o',
    estimatedCost: 0.085,
    currency: 'USD',
    state: 'HELD_FOR_RECONCILIATION',
    createdAt: '2026-11-03T16:00:00.000Z',
    expiresAt: '2026-11-03T16:05:00.000Z',
    version: 2,
  },
];

describe('Enterprise AI Budget & Usage Governance (W50 Financial Tests)', () => {
  const mockedBudgetApi = vi.mocked(budgetApi);

  beforeEach(() => {
    vi.clearAllMocks();
    mockedBudgetApi.getActivePolicy.mockResolvedValue(mockActiveReport);
    mockedBudgetApi.listPolicies.mockResolvedValue([mockActivePolicy]);
    mockedBudgetApi.updatePolicy.mockResolvedValue({
      ...mockActivePolicy,
      monthlyCeiling: 25.0,
      dailyCeiling: 12.0,
      softAlertThreshold: 0.85,
    });
    mockedBudgetApi.listLedgerEntries.mockResolvedValue({
      items: mockLedgerEntries,
      total: mockLedgerEntries.length,
    });
    mockedBudgetApi.listUnreconciled.mockResolvedValue(mockHeldReservations);
    mockedBudgetApi.reconcileReservation.mockResolvedValue(mockLedgerEntries[1]!);
    mockedBudgetApi.getRouterCapabilities.mockResolvedValue({
      providerId: 'codex_cli',
      modelId: 'gpt-4o-mini',
      capability: 'TEXT_GENERATION',
      modality: 'TEXT',
      currency: 'USD',
      healthy: true,
      circuitState: 'CLOSED',
    });
  });

  describe('CircuitBreakerStatusCard', () => {
    it('renders modality indicators with circuit states and cooldown timers', () => {
      const customStatuses: CircuitBreakerStatus[] = [
        {
          modality: 'TEXT',
          providerId: 'codex_cli',
          state: 'CLOSED',
          consecutiveFailures: 0,
          cooldownSecondsRemaining: 0,
        },
        {
          modality: 'IMAGE',
          providerId: 'openai',
          state: 'OPEN',
          consecutiveFailures: 4,
          cooldownSecondsRemaining: 90,
        },
        {
          modality: 'VIDEO',
          providerId: 'runway',
          state: 'HALF_OPEN',
          consecutiveFailures: 2,
          cooldownSecondsRemaining: 15,
        },
      ];

      renderWithProviders(<CircuitBreakerStatusCard statuses={customStatuses} />);

      expect(screen.getByText('Modality Circuit Breaker Health')).toBeInTheDocument();
      expect(screen.getByText('TEXT')).toBeInTheDocument();
      expect(screen.getByText('IMAGE')).toBeInTheDocument();
      expect(screen.getByText('VIDEO')).toBeInTheDocument();

      expect(screen.getByText('CLOSED')).toBeInTheDocument();
      expect(screen.getByText('OPEN')).toBeInTheDocument();
      expect(screen.getByText('HALF_OPEN')).toBeInTheDocument();

      expect(screen.getByText('90s')).toBeInTheDocument();
      expect(screen.getByText('15s')).toBeInTheDocument();
      expect(screen.getByText('Traffic Nominally Routed')).toBeInTheDocument();
      expect(screen.getByText('Dispatch Halted')).toBeInTheDocument();
    });
  });

  describe('BudgetOverviewPage', () => {
    it('renders spend gauges, ceilings, soft-alert threshold banner, and routing cards', async () => {
      renderWithProviders(<BudgetOverviewPage />);

      await waitFor(() => {
        expect(screen.getByText('Enterprise AI Budget & Usage Governance')).toBeInTheDocument();
      });

      // Daily Spend vs Daily Ceiling
      expect(screen.getByText('Daily Spend vs Daily Ceiling')).toBeInTheDocument();
      expect(screen.getByText('$4.250 / $10.00')).toBeInTheDocument();

      // Monthly Spend vs Monthly Ceiling
      expect(screen.getByText('Monthly Spend vs Monthly Ceiling')).toBeInTheDocument();
      expect(screen.getByText('$16.500 / $20.00')).toBeInTheDocument();

      // Dynamic Soft-Alert Threshold Banner
      expect(
        screen.getByText(/Dynamic Soft-Alert Threshold Exceeded \(80%\)/i),
      ).toBeInTheDocument();
      expect(screen.getByText('Warning Threshold Active')).toBeInTheDocument();

      // Provider capability routing cards
      expect(screen.getByText('Provider Capability Routing Health')).toBeInTheDocument();
      expect(screen.getByText(/Selected provider: codex_cli/)).toBeInTheDocument();
      expect(screen.getByText('Circuit breaker status is not available.')).toBeInTheDocument();
      expect(screen.queryByText('openai')).not.toBeInTheDocument();
    });

    it('does not invent spending limits when no policy is configured', async () => {
      mockedBudgetApi.getActivePolicy.mockResolvedValue({ policy: null, quota: null });
      renderWithProviders(<BudgetOverviewPage />);
      expect(await screen.findByText(/No active budget policy is configured/)).toBeInTheDocument();
      expect(screen.queryByText('Daily Spend vs Daily Ceiling')).not.toBeInTheDocument();
    });

    it('opens configure policy modal and updates ceilings and soft alert threshold', async () => {
      const user = userEvent.setup();
      renderWithProviders(<BudgetOverviewPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Configure Policy/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Configure Policy/i }));

      // Modal is visible
      expect(screen.getByText('Configure AI Financial Policy')).toBeInTheDocument();

      const monthlyInput = screen.getByLabelText(/Monthly Ceiling/i);
      await user.clear(monthlyInput);
      await user.type(monthlyInput, '25');

      const dailyInput = screen.getByLabelText(/Daily Ceiling/i);
      await user.clear(dailyInput);
      await user.type(dailyInput, '12');

      const submitBtn = screen.getByRole('button', { name: /Save Policy/i });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(mockedBudgetApi.updatePolicy).toHaveBeenCalledWith(
          'policy-w50-001',
          expect.objectContaining({
            monthlyCeiling: 25,
            dailyCeiling: 12,
          }),
        );
      });
    });
  });

  describe('UsageLedgerPage', () => {
    it('renders immutable ledger table with entry types, tokens, cost, and forex provenance tags', async () => {
      renderWithProviders(<UsageLedgerPage />);

      await waitFor(() => {
        expect(screen.getByText('Immutable AI Usage Ledger')).toBeInTheDocument();
      });

      // Entry Types
      expect(screen.getByText('RESERVATION_HOLD')).toBeInTheDocument();
      expect(screen.getByText('COST_COMMITMENT')).toBeInTheDocument();
      expect(screen.getByText('RESERVATION_RELEASE')).toBeInTheDocument();
      expect(screen.getByText('CORRECTION')).toBeInTheDocument();

      // Reservation IDs & models
      expect(screen.getByText('res-hold-101')).toBeInTheDocument();
      expect(screen.getByText('res-commit-102')).toBeInTheDocument();
      expect(screen.getByText('1250 tokens')).toBeInTheDocument();

      // Forex Provenance Tags
      expect(screen.getAllByText(/ECB_DAILY : 1.0000 USD/i).length).toBeGreaterThan(0);
    });

    it('filters ledger entries by entry type tab', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UsageLedgerPage />);

      await waitFor(() => {
        expect(screen.getByText('res-hold-101')).toBeInTheDocument();
      });

      const holdTab = screen.getByRole('button', { name: 'Reservation Holds' });
      await user.click(holdTab);

      await waitFor(() => {
        expect(mockedBudgetApi.listLedgerEntries).toHaveBeenCalledWith(
          expect.objectContaining({
            entryType: 'RESERVATION_HOLD',
          }),
        );
      });
    });

    it('submits search filter by reservation ID', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UsageLedgerPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search reservation ID/i)).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/Search reservation ID/i);
      await user.type(searchInput, 'res-commit-102');

      const searchBtn = screen.getByRole('button', { name: 'Search' });
      await user.click(searchBtn);

      await waitFor(() => {
        expect(mockedBudgetApi.listLedgerEntries).toHaveBeenCalledWith(
          expect.objectContaining({
            reservationId: 'res-commit-102',
          }),
        );
      });
    });
  });

  describe('ReconciliationDeskPage', () => {
    it('renders held reservations awaiting operator reconciliation', async () => {
      renderWithProviders(<ReconciliationDeskPage />);

      await waitFor(() => {
        expect(screen.getByText('Financial Reconciliation Desk')).toBeInTheDocument();
      });

      expect(screen.getByText('res-held-999')).toBeInTheDocument();
      expect(screen.getAllByText('HELD_FOR_RECONCILIATION').length).toBeGreaterThan(0);
      expect(screen.getByText(/idemp-timeout-dispatch-01/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Confirm Invoice Charge/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Release Unbilled Hold/i })).toBeInTheDocument();
    });

    it('confirms external invoice charge with reconciliation reference', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ReconciliationDeskPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Confirm Invoice Charge/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Confirm Invoice Charge/i }));

      // Modal appears
      expect(screen.getByText('Confirm External Invoice Charge')).toBeInTheDocument();

      const invoiceInput = screen.getByPlaceholderText(/e\.g\. INV-2026-10-99882/i);
      await user.clear(invoiceInput);
      await user.type(invoiceInput, 'INV-2026-11-AUDIT-101');

      const submitBtn = screen.getByRole('button', { name: /Confirm & Commit Charge/i });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(mockedBudgetApi.reconcileReservation).toHaveBeenCalledWith(
          'res-held-999',
          expect.objectContaining({
            isCharged: true,
            reconciliationRef: 'INV-2026-11-AUDIT-101',
            costKnowledge: 'EXACT',
          }),
        );
      });
    });

    it('releases unbilled hold with zero charge confirmed', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ReconciliationDeskPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Release Unbilled Hold/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Release Unbilled Hold/i }));

      // Release modal appears
      expect(screen.getByText('Release Unbilled Reservation Hold')).toBeInTheDocument();

      const submitBtn = screen.getByRole('button', { name: /Confirm & Release Hold/i });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(mockedBudgetApi.reconcileReservation).toHaveBeenCalledWith(
          'res-held-999',
          expect.objectContaining({
            confirmedAmount: 0,
            isCharged: false,
            costKnowledge: 'ZERO_CONFIRMED',
          }),
        );
      });
    });
  });
});
