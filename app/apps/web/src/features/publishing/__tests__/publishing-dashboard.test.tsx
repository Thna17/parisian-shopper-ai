import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test/test-utils.js';
import { PublishingDashboardPage } from '../pages/PublishingDashboardPage.js';
import { publishingApi } from '../api/publishing-api.js';
import type { ChannelCapability, PaginatedPublications } from '../types/publishing.types.js';

vi.mock('../api/publishing-api.js', () => ({
  publishingApi: {
    getPublications: vi.fn(),
    getPublicationById: vi.fn(),
    createPublication: vi.fn(),
    confirmPublication: vi.fn(),
    retryPublication: vi.fn(),
    cancelPublication: vi.fn(),
    getEligibleAssets: vi.fn(),
    getDestinations: vi.fn(),
  },
}));

vi.mock('../../../services/api/auth-api.js', () => ({
  authApi: {
    login: vi.fn(),
    getCurrentEmployee: vi.fn().mockResolvedValue({
      user: {
        id: 'usr-admin-001',
        displayName: 'Admin Merchandiser',
        roles: ['ADMIN'],
        permissions: ['VIEW_OWN_CONTENT', 'VIEW_ALL_CONTENT', 'PUBLISH_CREATIVE'],
      },
    }),
    logout: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

describe('Publishing Dashboard Feature (WEB-PUB-01 to WEB-PUB-08)', () => {
  const sampleDestinations: ChannelCapability[] = [
    {
      channel: 'MANUAL_EXPORT',
      displayName: 'Manual Export',
      connected: true,
      enabled: true,
    },
    {
      channel: 'TELEGRAM_CHANNEL',
      displayName: 'Telegram Channel',
      connected: true,
      enabled: false,
      reason: 'Live publishing disabled pending W61 controlled publishing verification',
    },
    {
      channel: 'FACEBOOK_PAGE',
      displayName: 'Facebook Page',
      connected: false,
      enabled: false,
      reason: 'No Facebook integration configured',
    },
    {
      channel: 'INSTAGRAM',
      displayName: 'Instagram',
      connected: false,
      enabled: false,
      reason: 'No Instagram integration configured',
    },
  ];

  const samplePublications: PaginatedPublications = {
    items: [
      {
        id: 'pub-001',
        contentVersionId: 'ver-001',
        creativeExportId: 'exp-001',
        destinationChannel: 'MANUAL_EXPORT',
        destinationAccountId: null,
        requestedByUserId: 'usr-admin-001',
        status: 'READY',
        idempotencyKey: 'idemp-dash-001',
        campaignId: 'camp-001',
        scheduledAt: null,
        publishedAt: null,
        externalPublicationId: null,
        cancellationReason: null,
        createdAt: '2026-10-29T10:00:00.000Z',
        updatedAt: '2026-10-29T10:00:00.000Z',
      },
      {
        id: 'pub-002',
        contentVersionId: 'ver-002',
        creativeExportId: null,
        destinationChannel: 'TELEGRAM_CHANNEL',
        destinationAccountId: '@atelier_pp',
        requestedByUserId: 'usr-admin-001',
        status: 'PUBLISHED',
        idempotencyKey: 'idemp-dash-002',
        campaignId: null,
        scheduledAt: null,
        publishedAt: '2026-10-29T11:00:00.000Z',
        externalPublicationId: 'msg_98765',
        cancellationReason: null,
        createdAt: '2026-10-29T10:30:00.000Z',
        updatedAt: '2026-10-29T11:00:00.000Z',
      },
    ],
    total: 2,
    page: 1,
    limit: 15,
    totalPages: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(publishingApi.getDestinations).mockResolvedValue(sampleDestinations);
    vi.mocked(publishingApi.getPublications).mockResolvedValue(samplePublications);
  });

  it('WEB-PUB-01: renders page title, subtitle, and destination channel readiness', async () => {
    renderWithProviders(<PublishingDashboardPage />);

    expect(screen.getByText('Publishing & Distribution Desk')).toBeInTheDocument();
    expect(
      screen.getByText(/Manage secure, deliberate distribution of verified content/i),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Manual Export')).toBeInTheDocument();
      expect(screen.getByText('Telegram Channel')).toBeInTheDocument();
    });
  });

  it('WEB-PUB-02: renders publications table with correct columns and status badges', async () => {
    renderWithProviders(<PublishingDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('pub-001…')).toBeInTheDocument();
      expect(screen.getByText('pub-002…')).toBeInTheDocument();
    });

    expect(screen.getAllByText('Ready').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Published').length).toBeGreaterThanOrEqual(1);
  });

  it('WEB-PUB-03: renders "New Publication" action button for users with PUBLISH_CREATIVE permission', async () => {
    renderWithProviders(<PublishingDashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /New Publication/i })).toBeInTheDocument();
    });
  });

  it('WEB-PUB-04: filters publications by status when selecting from dropdown', async () => {
    renderWithProviders(<PublishingDashboardPage />);

    await waitFor(() => {
      expect(screen.getByLabelText('Filter by Status')).toBeInTheDocument();
    });

    const statusSelect = screen.getByLabelText('Filter by Status');
    await userEvent.selectOptions(statusSelect, 'READY');

    await waitFor(() => {
      expect(publishingApi.getPublications).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'READY' }),
      );
    });
  });
});
