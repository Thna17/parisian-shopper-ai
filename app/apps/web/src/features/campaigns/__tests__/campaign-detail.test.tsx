import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../../test/test-utils.js';
import { CampaignDetailPage } from '../pages/CampaignDetailPage.js';
import { campaignsApi } from '../api/campaigns-api.js';
import type { CampaignDetail } from '../types/campaign.types.js';

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

vi.mock('../../products/api/products-api.js', () => ({
  productsApi: {
    getProducts: vi.fn().mockResolvedValue({ data: [], pagination: { total: 0 } }),
    getProductById: vi.fn(),
  },
}));

vi.mock('../../../services/api/auth-api.js', () => ({
  authApi: {
    login: vi.fn(),
    getCurrentEmployee: vi.fn().mockResolvedValue({
      user: {
        id: 'user-admin',
        displayName: 'Admin Merchandiser',
        roles: ['ADMIN'],
        permissions: [
          'VIEW_PRODUCTS',
          'VIEW_OWN_CONTENT',
          'VIEW_ALL_CONTENT',
          'CREATE_CONTENT',
          'EDIT_CONTENT',
          'APPROVE_CONTENT',
        ],
      },
    }),
    logout: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

describe('Campaign Detail Feature (WEB-CAMP-07 to WEB-CAMP-12)', () => {
  const sampleDetail: CampaignDetail = {
    id: 'camp-001',
    code: 'CAMP-ROSE-2026',
    name: 'Rose Impériale Spring Campaign',
    objective: "Luxury Mother's Day fragrance promotion",
    description: 'High-end floral activation for VIP clients',
    status: 'DRAFT',
    startDate: '2026-05-01T00:00:00.000Z',
    endDate: '2026-05-15T00:00:00.000Z',
    createdById: 'user-admin',
    createdByDisplayName: 'Admin Merchandiser',
    productCount: 1,
    heroProductSku: 'PERF-ROSE-001',
    heroProductTitle: 'Rose Impériale EDP 100ml',
    products: [
      {
        id: 'assoc-001',
        campaignId: 'camp-001',
        productSnapshotId: 'snap-001',
        sortOrder: 0,
        isHero: true,
        notes: 'Featured hero floral fragrance',
        targetPromoPrice: 195.0,
        targetDiscountPercent: 15.2,
        createdAt: '2026-05-01T00:00:00.000Z',
        productSku: 'PERF-ROSE-001',
        productTitle: 'Rose Impériale EDP 100ml',
        brandName: 'Maison Royale',
        catalogPriceUsd: 230.0,
        heroAssetUrl: null,
      },
    ],
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('WEB-CAMP-07: renders campaign detail with brief, schedule, and associated products', async () => {
    vi.mocked(campaignsApi.getCampaignById).mockResolvedValue(sampleDetail);

    renderWithProviders(
      <Routes>
        <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
      </Routes>,
      { initialEntries: ['/campaigns/camp-001'] },
    );

    await waitFor(() => {
      expect(screen.getByText('Rose Impériale Spring Campaign')).toBeInTheDocument();
      expect(screen.getByText(/Campaign Code: CAMP-ROSE-2026/i)).toBeInTheDocument();
      expect(screen.getByText("Luxury Mother's Day fragrance promotion")).toBeInTheDocument();
      expect(screen.getByText('PERF-ROSE-001')).toBeInTheDocument();
      expect(screen.getAllByText('$230.00').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('WEB-CAMP-08: displays Commercial Integrity Invariant and distinguishes verified MSRP from draft target promo price', async () => {
    vi.mocked(campaignsApi.getCampaignById).mockResolvedValue(sampleDetail);

    renderWithProviders(
      <Routes>
        <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
      </Routes>,
      { initialEntries: ['/campaigns/camp-001'] },
    );

    await waitFor(() => {
      // Invariant banner
      expect(screen.getByText(/Authoritative Commercial Integrity Invariant/i)).toBeInTheDocument();

      // MSRP is verified catalog fact
      expect(screen.getByText('Catalog Total MSRP')).toBeInTheDocument();

      // Target Promo Price is draft proposal
      expect(screen.getByText('Proposed Target Total')).toBeInTheDocument();
      expect(screen.getAllByText('$195.00').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('-15.2%')).toBeInTheDocument();
    });
  });

  it('WEB-CAMP-09: advances campaign status from DRAFT to PLANNED', async () => {
    vi.mocked(campaignsApi.getCampaignById).mockResolvedValue(sampleDetail);
    vi.mocked(campaignsApi.changeCampaignStatus).mockResolvedValue({
      ...sampleDetail,
      status: 'PLANNED',
    });

    renderWithProviders(
      <Routes>
        <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
      </Routes>,
      { initialEntries: ['/campaigns/camp-001'] },
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /advance to planned/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /advance to planned/i }));

    await waitFor(() => {
      expect(campaignsApi.changeCampaignStatus).toHaveBeenCalledWith('camp-001', 'PLANNED');
    });
  });

  it('WEB-CAMP-10: updates strategic brief fields and saves changes', async () => {
    const user = userEvent.setup();
    vi.mocked(campaignsApi.getCampaignById).mockResolvedValue(sampleDetail);
    vi.mocked(campaignsApi.updateCampaign).mockResolvedValue({
      ...sampleDetail,
      name: 'Rose Impériale Spring 2026 Luxury Spotlight',
    });

    renderWithProviders(
      <Routes>
        <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
      </Routes>,
      { initialEntries: ['/campaigns/camp-001'] },
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /edit brief/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /edit brief/i }));

    const nameInput = screen.getByLabelText(/campaign name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Rose Impériale Spring 2026 Luxury Spotlight');

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(campaignsApi.updateCampaign).toHaveBeenCalledWith(
        'camp-001',
        expect.objectContaining({
          name: 'Rose Impériale Spring 2026 Luxury Spotlight',
        }),
      );
    });
  });

  it('WEB-CAMP-12: removes product association from campaign', async () => {
    vi.mocked(campaignsApi.getCampaignById).mockResolvedValue(sampleDetail);
    vi.mocked(campaignsApi.removeProduct).mockResolvedValue();

    renderWithProviders(
      <Routes>
        <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
      </Routes>,
      { initialEntries: ['/campaigns/camp-001'] },
    );

    await waitFor(() => {
      expect(screen.getByText('Rose Impériale EDP 100ml')).toBeInTheDocument();
    });

    const removeBtn = screen.getByRole('button', {
      name: /remove rose impériale edp 100ml from campaign/i,
    });
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(campaignsApi.removeProduct).toHaveBeenCalledWith('camp-001', 'assoc-001');
    });
  });
});
