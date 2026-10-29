import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../../test/test-utils.js';
import { PublishingWizardPage } from '../pages/PublishingWizardPage.js';
import { PublicationDetailPage } from '../pages/PublicationDetailPage.js';
import { publishingApi } from '../api/publishing-api.js';
import type {
  ChannelCapability,
  EligibleAsset,
  PublicationDetail,
} from '../types/publishing.types.js';

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

describe('Publishing Wizard and Detail Feature (WEB-PUB-09 to WEB-PUB-18)', () => {
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
  ];

  const sampleEligibleAssets: { items: EligibleAsset[]; total: number } = {
    items: [
      {
        contentVersionId: 'ver-001',
        versionNumber: 1,
        contentJobId: 'job-001',
        productName: 'Chanel No 5 Parfum',
        approvedAt: '2026-10-29T09:00:00.000Z',
        hasCreativeExports: true,
      },
    ],
    total: 1,
  };

  const sampleDetail: PublicationDetail = {
    id: 'pub-detail-001',
    contentVersionId: 'ver-001',
    creativeExportId: 'exp-001',
    destinationChannel: 'MANUAL_EXPORT',
    destinationAccountId: null,
    requestedByUserId: 'usr-admin-001',
    status: 'READY',
    idempotencyKey: 'idemp-detail-001',
    campaignId: 'camp-001',
    scheduledAt: null,
    publishedAt: null,
    externalPublicationId: null,
    cancellationReason: null,
    createdAt: '2026-10-29T10:00:00.000Z',
    updatedAt: '2026-10-29T10:00:00.000Z',
    attempts: [
      {
        id: 'att-001',
        publicationId: 'pub-detail-001',
        attemptNumber: 1,
        status: 'PROCESSING',
        startedAt: '2026-10-29T10:05:00.000Z',
        completedAt: null,
        providerResult: null,
        externalPublicationId: null,
        errorCode: null,
        errorMessage: null,
        retryEligible: false,
        createdAt: '2026-10-29T10:05:00.000Z',
      },
    ],
    contentVersion: {
      id: 'ver-001',
      versionNumber: 1,
      contentJobId: 'job-001',
      structuredOutput: { headline: 'Chanel No 5 Launch' },
    },
    creativeExport: {
      id: 'exp-001',
      format: 'INSTAGRAM_FEED',
      encoding: 'PNG',
      width: 1080,
      height: 1080,
      storageKey: 'exports/exp-001.png',
    },
    requestedByUser: {
      id: 'usr-admin-001',
      displayName: 'Admin Merchandiser',
    },
    campaign: {
      id: 'camp-001',
      code: 'CAMP-ROSE-2026',
      name: 'Rose Campaign',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(publishingApi.getDestinations).mockResolvedValue(sampleDestinations);
    vi.mocked(publishingApi.getEligibleAssets).mockResolvedValue(sampleEligibleAssets);
    vi.mocked(publishingApi.getPublicationById).mockResolvedValue(sampleDetail);
  });

  describe('Publishing Wizard', () => {
    it('WEB-PUB-09: renders eligible assets for distribution', async () => {
      renderWithProviders(<PublishingWizardPage />);

      expect(screen.getByText('Create Publication Request')).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByText('Chanel No 5 Parfum')).toBeInTheDocument();
      });
    });

    it('WEB-PUB-10: advances to destination selection after selecting asset', async () => {
      renderWithProviders(<PublishingWizardPage />);

      await waitFor(() => {
        expect(screen.getByText('Chanel No 5 Parfum')).toBeInTheDocument();
      });

      await userEvent.click(screen.getByText('Chanel No 5 Parfum'));
      await userEvent.click(screen.getByRole('button', { name: /Continue to Destination/i }));

      await waitFor(() => {
        expect(screen.getByText('Choose Destination Channel')).toBeInTheDocument();
        expect(screen.getAllByText('Manual Export').length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('Publication Detail', () => {
    it('WEB-PUB-11: renders publication detail with status and channel badge', async () => {
      renderWithProviders(
        <Routes>
          <Route path="/publishing/:id" element={<PublicationDetailPage />} />
        </Routes>,
        {
          initialEntries: ['/publishing/pub-detail-001'],
        },
      );

      await waitFor(() => {
        expect(screen.getByText('Publication #pub-deta')).toBeInTheDocument();
        expect(screen.getByText('Ready')).toBeInTheDocument();
        expect(screen.getAllByText('Manual Export').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('WEB-PUB-12: renders attempts timeline and action buttons', async () => {
      renderWithProviders(
        <Routes>
          <Route path="/publishing/:id" element={<PublicationDetailPage />} />
        </Routes>,
        {
          initialEntries: ['/publishing/pub-detail-001'],
        },
      );

      await waitFor(() => {
        expect(screen.getByText(/Dispatch & Delivery Attempts/i)).toBeInTheDocument();
        expect(screen.getByText('Attempt #1')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Confirm & Dispatch/i })).toBeInTheDocument();
      });
    });

    it('WEB-PUB-13: triggers confirmation action when clicking Confirm & Dispatch', async () => {
      vi.mocked(publishingApi.confirmPublication).mockResolvedValueOnce({
        ...sampleDetail,
        status: 'PUBLISHED',
      });

      renderWithProviders(
        <Routes>
          <Route path="/publishing/:id" element={<PublicationDetailPage />} />
        </Routes>,
        {
          initialEntries: ['/publishing/pub-detail-001'],
        },
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Confirm & Dispatch/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /Confirm & Dispatch/i }));

      await waitFor(() => {
        expect(publishingApi.confirmPublication).toHaveBeenCalledWith('pub-detail-001');
      });
    });
  });
});
