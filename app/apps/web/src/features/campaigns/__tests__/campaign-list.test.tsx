import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test/test-utils.js';
import { CampaignListPage } from '../pages/CampaignListPage.js';
import { campaignsApi } from '../api/campaigns-api.js';
import type { PaginatedCampaignsResponse, CampaignSummary } from '../types/campaign.types.js';

vi.mock('../api/campaigns-api.js', () => ({
  campaignsApi: {
    getCampaigns: vi.fn(),
    getCampaignById: vi.fn(),
    createCampaign: vi.fn(),
    updateCampaign: vi.fn(),
    changeCampaignStatus: vi.fn(),
    associateProduct: vi.fn(),
    removeProduct: vi.fn(),
  },
}));

vi.mock('../../../services/api/auth-api.js', () => ({
  authApi: {
    login: vi.fn(),
    getCurrentEmployee: vi.fn().mockResolvedValue({
      user: {
        id: 'user-admin',
        displayName: 'Merchandising Lead',
        roles: ['ADMIN'],
        permissions: ['VIEW_PRODUCTS', 'VIEW_OWN_CONTENT', 'CREATE_CONTENT', 'EDIT_CONTENT'],
      },
    }),
    logout: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

describe('Campaign List Feature (WEB-CAMP-01 to WEB-CAMP-06)', () => {
  const sampleCampaigns: CampaignSummary[] = [
    {
      id: 'camp-001',
      code: 'CAMP-ROSE-2026',
      name: 'Rose Impériale Spring Campaign',
      objective: "Luxury Mother's Day fragrance promotion",
      description: 'Social and VIP email preview',
      status: 'DRAFT',
      startDate: '2026-05-01T00:00:00.000Z',
      endDate: '2026-05-15T00:00:00.000Z',
      createdById: 'user-admin',
      createdByDisplayName: 'Admin Merchandiser',
      productCount: 2,
      heroProductSku: 'PERF-ROSE-001',
      heroProductTitle: 'Rose Impériale EDP 100ml',
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
    },
    {
      id: 'camp-002',
      code: 'CAMP-SUMMER-2026',
      name: 'Summer Riviera Aquatic Spotlight',
      objective: 'Launch summer aquatic fragrance lineup',
      description: null,
      status: 'ACTIVE',
      startDate: '2026-06-01T00:00:00.000Z',
      endDate: '2026-06-30T00:00:00.000Z',
      createdById: 'user-admin',
      createdByDisplayName: 'Admin Merchandiser',
      productCount: 4,
      heroProductSku: 'AQUA-RIV-002',
      heroProductTitle: 'Riviera Breeze Parfum',
      createdAt: '2026-04-10T00:00:00.000Z',
      updatedAt: '2026-04-10T00:00:00.000Z',
    },
  ];

  const emptyResponse: PaginatedCampaignsResponse = {
    items: [],
    total: 0,
    page: 1,
    limit: 12,
    totalPages: 1,
  };

  const populatedResponse: PaginatedCampaignsResponse = {
    items: sampleCampaigns,
    total: 2,
    page: 1,
    limit: 12,
    totalPages: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('WEB-CAMP-01: renders page header and empty state when no campaigns exist', async () => {
    vi.mocked(campaignsApi.getCampaigns).mockResolvedValueOnce(emptyResponse);

    renderWithProviders(<CampaignListPage />);

    expect(screen.getByText('Campaign Management')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('No campaigns yet')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /create first campaign/i })).toBeInTheDocument();
  });

  it('WEB-CAMP-02: renders campaign cards with codes, names, status badges, and hero products', async () => {
    vi.mocked(campaignsApi.getCampaigns).mockResolvedValueOnce(populatedResponse);

    renderWithProviders(<CampaignListPage />);

    await waitFor(() => {
      expect(screen.getByText('CAMP-ROSE-2026')).toBeInTheDocument();
      expect(screen.getByText('Rose Impériale Spring Campaign')).toBeInTheDocument();
      expect(screen.getByText('CAMP-SUMMER-2026')).toBeInTheDocument();
      expect(screen.getByText('Summer Riviera Aquatic Spotlight')).toBeInTheDocument();
    });

    // Verify hero product badges
    expect(screen.getByText('Rose Impériale EDP 100ml')).toBeInTheDocument();
    expect(screen.getByText('Riviera Breeze Parfum')).toBeInTheDocument();

    // Verify status badges
    expect(screen.getAllByText('Draft').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Active Live')).toBeInTheDocument();
  });

  it('WEB-CAMP-03: filters campaigns by status pill selection', async () => {
    vi.mocked(campaignsApi.getCampaigns).mockResolvedValue(populatedResponse);

    renderWithProviders(<CampaignListPage />);

    await waitFor(() => {
      expect(screen.getByText('CAMP-ROSE-2026')).toBeInTheDocument();
    });

    // Click 'Draft' status pill
    const draftButton = screen.getByRole('button', { name: /^Draft$/i });
    fireEvent.click(draftButton);

    await waitFor(() => {
      expect(campaignsApi.getCampaigns).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'DRAFT',
        }),
      );
    });
  });

  it('WEB-CAMP-04: filters campaigns by text search', async () => {
    const user = userEvent.setup();
    vi.mocked(campaignsApi.getCampaigns).mockResolvedValue(populatedResponse);

    renderWithProviders(<CampaignListPage />);

    await waitFor(() => {
      expect(screen.getByText('CAMP-ROSE-2026')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search campaigns by code/i);
    await user.type(searchInput, 'Riviera');

    await waitFor(() => {
      expect(campaignsApi.getCampaigns).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'Riviera',
        }),
      );
    });
  });

  it('WEB-CAMP-05: resets active filters when reset button is clicked', async () => {
    vi.mocked(campaignsApi.getCampaigns).mockResolvedValue(populatedResponse);

    renderWithProviders(<CampaignListPage />);

    await waitFor(() => {
      expect(screen.getByText('CAMP-ROSE-2026')).toBeInTheDocument();
    });

    // Click 'Active' status pill to activate a filter
    const activeButton = screen.getByRole('button', { name: /^Active$/i });
    fireEvent.click(activeButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /reset filters/i })).toBeInTheDocument();
    });

    // Click Reset
    fireEvent.click(screen.getByRole('button', { name: /reset filters/i }));

    await waitFor(() => {
      expect(campaignsApi.getCampaigns).toHaveBeenCalledWith(
        expect.objectContaining({
          status: undefined,
          search: undefined,
        }),
      );
    });
  });
});
