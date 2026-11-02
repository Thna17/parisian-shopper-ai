import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders } from '../../../test/test-utils.js';
import { EmployeeDirectoryPage } from '../pages/EmployeeDirectoryPage.js';
import { EmployeeDetailPage } from '../pages/EmployeeDetailPage.js';
import { OrganizationSettingsPage } from '../pages/OrganizationSettingsPage.js';
import { AdministrativeAuditPage } from '../pages/AdministrativeAuditPage.js';
import { AdminOverviewPage } from '../pages/AdminOverviewPage.js';
import { OnboardingClaimPage } from '../pages/OnboardingClaimPage.js';
import { adminApi } from '../api/admin-api.js';
import type {
  EmployeeSummary,
  EmployeeDetail,
  SafeUserSession,
  SystemSettingsOverview,
  AuditEventRecord,
} from '../types/admin.types.js';

vi.mock('../api/admin-api.js', () => ({
  adminApi: {
    listEmployees: vi.fn(),
    getEmployeeDetail: vi.fn(),
    createEmployee: vi.fn(),
    updateEmployeeProfile: vi.fn(),
    updateEmployeeRoles: vi.fn(),
    suspendEmployee: vi.fn(),
    reactivateEmployee: vi.fn(),
    getEmployeeSessions: vi.fn(),
    revokeSessions: vi.fn(),
    createOnboardingToken: vi.fn(),
    getSettings: vi.fn(),
    updateSetting: vi.fn(),
    listAudit: vi.fn(),
    claimOnboarding: vi.fn(),
  },
}));

vi.mock('../../../services/api/auth-api.js', () => ({
  authApi: {
    login: vi.fn(),
    getCurrentEmployee: vi.fn().mockResolvedValue({
      user: {
        id: 'admin-lead-001',
        displayName: 'Security Architect',
        roles: ['ADMIN'],
        permissions: ['ADMIN', 'VIEW_OPERATIONAL_ANALYTICS', 'VIEW_AI_COSTS'],
      },
    }),
    logout: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

const mockSummaryEmployees: EmployeeSummary[] = [
  {
    id: 'emp-1',
    displayName: 'Aurelie Moreau',
    status: 'ACTIVE',
    roles: ['MARKETING_EDITOR'],
    createdAt: '2026-01-10T00:00:00Z',
    updatedAt: '2026-01-10T00:00:00Z',
    disabledAt: null,
    telegramUsername: 'aurelie_m',
    activeSessionsCount: 2,
  },
  {
    id: 'emp-2',
    displayName: 'Claire Laurent',
    status: 'DISABLED',
    roles: ['VIEWER'],
    createdAt: '2026-01-12T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
    disabledAt: '2026-01-15T00:00:00Z',
    telegramUsername: null,
    activeSessionsCount: 0,
  },
];

const mockDetailEmployee: EmployeeDetail = {
  id: 'emp-1',
  displayName: 'Aurelie Moreau',
  status: 'ACTIVE',
  roles: ['MARKETING_EDITOR'],
  createdAt: '2026-01-10T00:00:00Z',
  updatedAt: '2026-01-10T00:00:00Z',
  disabledAt: null,
  hasPassword: true,
  telegram: {
    id: 'tg-1',
    telegramUserId: '9876543210',
    maskedTelegramUserId: '••••••3210',
    telegramUsername: 'aurelie_m',
    displayName: 'Aurelie M.',
    lastSeenAt: '2026-02-01T10:00:00Z',
    disabledAt: null,
  },
  activeSessionsCount: 1,
  recentActivity: { lastActiveAt: '2026-02-01T12:00:00Z' },
};

const mockSessions: SafeUserSession[] = [
  {
    id: 'sess-1',
    ipAddress: '192.168.1.100',
    userAgent: 'Mozilla/5.0 Safari/605',
    createdAt: '2026-02-01T08:00:00Z',
    lastActiveAt: '2026-02-01T12:00:00Z',
    expiresAt: '2026-02-02T08:00:00Z',
    revokedAt: null,
    isActive: true,
  },
];

const mockSettingsOverview: SystemSettingsOverview = {
  organization: {
    name: 'Maison Parisienne',
    contactEmail: 'contact@maison.fr',
    timezone: 'Europe/Paris',
    defaultLanguage: 'fr',
  },
  workflow: {
    sessionTtlHours: 8,
    maxLoginFailures: 5,
    lockoutDurationMinutes: 15,
    requireFourEyesCreative: true,
    requireFourEyesContent: true,
  },
  notifications: {
    telegramNotificationsEnabled: true,
    alertThresholdPercent: 80,
  },
  aiBudgetSummary: {
    monthlyCeiling: 20,
    perRequestCeiling: 1,
    costControlUrl: '/analytics/costs',
  },
  rawSettings: [],
};

const mockAuditLogs: AuditEventRecord[] = [
  {
    id: 'aud-1',
    actorUserId: 'admin-lead-001',
    actorDisplayName: 'Security Architect',
    action: 'EMPLOYEE_ROLES_UPDATED',
    resourceType: 'USER',
    resourceId: 'emp-1',
    metadata: { roles: ['MARKETING_EDITOR', 'MARKETING_APPROVER'] },
    createdAt: '2026-02-01T14:30:00Z',
  },
];

describe('Admin Web Feature Suite (ADMIN-01 to ADMIN-20 UI)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders AdminOverviewPage with KPI counts and quick navigation cards', async () => {
    vi.mocked(adminApi.listEmployees).mockResolvedValueOnce({
      items: mockSummaryEmployees,
      total: 2,
      page: 1,
      limit: 100,
      totalPages: 1,
    });

    renderWithProviders(<AdminOverviewPage />);

    expect(screen.getByText(/Workspace Administration & Governance/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Staff & Employee Directory')).toBeInTheDocument();
      expect(screen.getByText('System Settings & Governance')).toBeInTheDocument();
      expect(screen.getByText('Security Audit Ledger')).toBeInTheDocument();
    });
  });

  it('renders EmployeeDirectoryPage and displays employee records and status badges', async () => {
    vi.mocked(adminApi.listEmployees).mockResolvedValue({
      items: mockSummaryEmployees,
      total: 2,
      page: 1,
      limit: 15,
      totalPages: 1,
    });

    renderWithProviders(<EmployeeDirectoryPage />);

    expect(screen.getByText(/Staff & Employee Directory/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Aurelie Moreau')).toBeInTheDocument();
      expect(screen.getByText('Claire Laurent')).toBeInTheDocument();
      expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Suspended').length).toBeGreaterThan(0);
    });
  });

  it('provisions a new employee via modal and displays the one-time token', async () => {
    const user = userEvent.setup();
    vi.mocked(adminApi.listEmployees).mockResolvedValue({
      items: mockSummaryEmployees,
      total: 2,
      page: 1,
      limit: 15,
      totalPages: 1,
    });
    vi.mocked(adminApi.createEmployee).mockResolvedValueOnce({
      employee: mockDetailEmployee,
      rawOnboardingToken: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      expiresAt: '2026-02-08T00:00:00Z',
    });

    renderWithProviders(<EmployeeDirectoryPage />);

    const provisionBtn = screen.getByRole('button', { name: /Provision Employee/i });
    await user.click(provisionBtn);

    expect(screen.getByText('Provision New Employee')).toBeInTheDocument();

    const nameInput = screen.getByPlaceholderText(/Claire Laurent/i);
    await user.type(nameInput, 'Alexandre Dumas');

    const submitBtn = screen.getByRole('button', { name: /Generate Invitation/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(adminApi.createEmployee).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: 'Alexandre Dumas',
        }),
      );
      expect(screen.getByText(/Employee Successfully Provisioned/i)).toBeInTheDocument();
      expect(screen.getByDisplayValue(/0123456789abcdef/i)).toBeInTheDocument();
    });
  });

  it('renders EmployeeDetailPage with role management, Telegram identity, and active sessions', async () => {
    vi.mocked(adminApi.getEmployeeDetail).mockResolvedValue(mockDetailEmployee);
    vi.mocked(adminApi.getEmployeeSessions).mockResolvedValue({ sessions: mockSessions });

    renderWithProviders(
      <Routes>
        <Route path="/admin/employees/:id" element={<EmployeeDetailPage />} />
      </Routes>,
      { initialEntries: ['/admin/employees/emp-1'] },
    );

    await waitFor(() => {
      expect(screen.getByText('Aurelie Moreau')).toBeInTheDocument();
      expect(screen.getByText('Assigned Platform Roles')).toBeInTheDocument();
      expect(screen.getByText('@aurelie_m')).toBeInTheDocument();
      expect(screen.getByText('••••••3210')).toBeInTheDocument();
      expect(screen.getByText('192.168.1.100')).toBeInTheDocument();
    });
  });

  it('renders OrganizationSettingsPage and saves workflow policies', async () => {
    const user = userEvent.setup();
    vi.mocked(adminApi.getSettings).mockResolvedValueOnce(mockSettingsOverview);
    vi.mocked(adminApi.updateSetting).mockResolvedValueOnce({
      id: 's-1',
      key: 'WORKFLOW_POLICIES',
      category: 'WORKFLOW',
      value: { sessionTtlHours: 12 },
      description: null,
      updatedById: 'admin-lead-001',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });

    renderWithProviders(<OrganizationSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Workspace Configuration & Policies')).toBeInTheDocument();
      expect(screen.getByText('Workflow & Four-Eyes Governance')).toBeInTheDocument();
    });

    const saveWorkflowBtn = screen.getByRole('button', { name: /Save Policies/i });
    await user.click(saveWorkflowBtn);

    await waitFor(() => {
      expect(adminApi.updateSetting).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'WORKFLOW_POLICIES',
        }),
      );
    });
  });

  it('renders AdministrativeAuditPage and lists recorded audit events', async () => {
    vi.mocked(adminApi.listAudit).mockResolvedValueOnce({
      items: mockAuditLogs,
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    renderWithProviders(<AdministrativeAuditPage />);

    expect(screen.getByText(/Administrative & Security Audit Trail/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('EMPLOYEE_ROLES_UPDATED')).toBeInTheDocument();
      expect(screen.getByText('Security Architect')).toBeInTheDocument();
    });
  });

  it('validates password complexity and successfully claims onboarding account in OnboardingClaimPage', async () => {
    const user = userEvent.setup();
    vi.mocked(adminApi.claimOnboarding).mockResolvedValueOnce({
      success: true,
      userId: 'emp-1',
      displayName: 'Aurelie Moreau',
    });

    renderWithProviders(<OnboardingClaimPage />);

    expect(screen.getByText(/Welcome to Parisian Shopper AI/i)).toBeInTheDocument();

    const tokenInput = screen.getByPlaceholderText(/Paste your 64-character token/i);
    const passwordInput = screen.getByPlaceholderText(/Enter strong password/i);
    const confirmInput = screen.getByPlaceholderText(/Re-enter password/i);

    await user.type(tokenInput, '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
    await user.type(passwordInput, 'ValidPassword#2026');
    await user.type(confirmInput, 'ValidPassword#2026');

    const claimBtn = screen.getByRole('button', { name: /Claim Account & Activate/i });
    expect(claimBtn).not.toBeDisabled();

    await user.click(claimBtn);

    await waitFor(() => {
      expect(adminApi.claimOnboarding).toHaveBeenCalledWith({
        token: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        password: 'ValidPassword#2026',
      });
      expect(screen.getByText(/Account Successfully Activated!/i)).toBeInTheDocument();
    });
  });
});
