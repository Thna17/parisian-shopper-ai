import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test/test-utils.js';
import { ContentCreationWizard } from '../pages/ContentCreationWizard.js';
import { contentApi } from '../api/content-api.js';
import { productsApi } from '../../products/api/products-api.js';
import { campaignsApi } from '../../campaigns/api/campaigns-api.js';
import type { PaginatedProductsResponse } from '../../products/types/product.types.js';
import type { PaginatedCampaignsResponse } from '../../campaigns/types/campaign.types.js';

vi.mock('../api/content-api.js', () => ({
  contentApi: {
    createJob: vi.fn(),
  },
}));

vi.mock('../../products/api/products-api.js', () => ({
  productsApi: {
    getProducts: vi.fn(),
  },
}));

vi.mock('../../campaigns/api/campaigns-api.js', () => ({
  campaignsApi: {
    getCampaigns: vi.fn(),
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
        permissions: ['CREATE_CONTENT', 'VIEW_OWN_CONTENT'],
      },
    }),
    logout: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

describe('Content Creation Wizard (WEB-CONTENT-06 to WEB-CONTENT-10)', () => {
  const mockProducts: PaginatedProductsResponse = {
    data: [
      {
        id: 'prod-snap-001',
        sku: 'FIC-PERF-001',
        brand: 'Maison Fictif',
        title: 'Rose Absolue Eau de Parfum',
        category: 'Fragrance',
        price: { amount: 185.0, currency: 'USD' },
        stockStatus: 'IN_STOCK',
        lifecycleStatus: 'ACTIVE',
        primaryImageUrl: 'https://images.example.com/rose.jpg',
        capturedAt: '2026-10-28T00:00:00.000Z',
      },
    ],
    pagination: {
      page: 1,
      limit: 12,
      total: 1,
      totalPages: 1,
    },
  };

  const mockCampaigns: PaginatedCampaignsResponse = {
    items: [
      {
        id: 'camp-summer-001',
        code: 'CAMP-SUMMER-2026',
        name: 'Summer Riviera Spotlight',
        objective: 'Summer launch',
        description: null,
        status: 'ACTIVE',
        startDate: '2026-06-01T00:00:00.000Z',
        endDate: '2026-06-30T00:00:00.000Z',
        createdById: 'usr-content-001',
        createdByDisplayName: 'Admin',
        productCount: 1,
        heroProductSku: 'FIC-PERF-001',
        heroProductTitle: 'Rose Absolue Eau de Parfum',
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
    ],
    total: 1,
    page: 1,
    limit: 50,
    totalPages: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(productsApi.getProducts).mockResolvedValue(mockProducts);
    vi.mocked(campaignsApi.getCampaigns).mockResolvedValue(mockCampaigns);
  });

  it('WEB-CONTENT-06: Renders step 1 product selector and disables Continue until selected', async () => {
    renderWithProviders(<ContentCreationWizard />, { initialEntries: ['/content/new'] });

    expect(await screen.findByText('1. Select Product Context')).toBeInTheDocument();
    const continueBtn = screen.getByRole('button', { name: /Continue to Strategy/i });
    expect(continueBtn).toBeDisabled();
  });

  it('WEB-CONTENT-07: Selecting a product enables Continue to step 2', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContentCreationWizard />, { initialEntries: ['/content/new'] });

    const productCard = await screen.findByText('Rose Absolue Eau de Parfum');
    await user.click(productCard);

    expect(await screen.findByText(/Selected: Rose Absolue Eau de Parfum/i)).toBeInTheDocument();
    const continueBtn = screen.getByRole('button', { name: /Continue to Strategy/i });
    expect(continueBtn).toBeEnabled();

    await user.click(continueBtn);
    expect(await screen.findByText('2. Content Strategy & Language')).toBeInTheDocument();
  });

  it('WEB-CONTENT-08: Progresses through Step 2 (Strategy & Language) to Step 3', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContentCreationWizard />, { initialEntries: ['/content/new'] });

    // Step 1: Select product
    const productCard = await screen.findByText('Rose Absolue Eau de Parfum');
    await user.click(productCard);
    await user.click(screen.getByRole('button', { name: /Continue to Strategy/i }));

    // Step 2: Choose Strategy
    expect(await screen.findByText('2. Content Strategy & Language')).toBeInTheDocument();
    const scentPyramidBtn = screen.getByText('Scent Pyramid');
    await user.click(scentPyramidBtn);

    const continueToStep3Btn = screen.getByRole('button', {
      name: /Continue to Platform & Campaign/i,
    });
    await user.click(continueToStep3Btn);

    // Step 3 should now be visible
    expect(await screen.findByText('3. Target Platform & Campaign Context')).toBeInTheDocument();
  });

  it('WEB-CONTENT-09: Step 3 configures platform and optional campaign association', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContentCreationWizard />, { initialEntries: ['/content/new'] });

    // Step 1
    const productCard = await screen.findByText('Rose Absolue Eau de Parfum');
    await user.click(productCard);
    await user.click(screen.getByRole('button', { name: /Continue to Strategy/i }));

    // Step 2
    await screen.findByText('2. Content Strategy & Language');
    await user.click(screen.getByRole('button', { name: /Continue to Platform & Campaign/i }));

    // Step 3
    expect(await screen.findByText('3. Target Platform & Campaign Context')).toBeInTheDocument();
    expect(screen.getByText('Telegram VIP Channel')).toBeInTheDocument();
    expect(screen.getByText('Instagram Captions')).toBeInTheDocument();

    // Select Instagram
    await user.click(screen.getByText('Instagram Captions'));

    // Step 4
    await user.click(screen.getByRole('button', { name: /Review & Enqueue/i }));
    expect(await screen.findByText('4. Review & Enqueue Content Generation')).toBeInTheDocument();
  });

  it('WEB-CONTENT-10: Step 4 displays summary and enforces duplicate-click protection', async () => {
    const user = userEvent.setup();
    let resolveCreate: (value: any) => void;
    const createPromise = new Promise((res) => {
      resolveCreate = res;
    });
    vi.mocked(contentApi.createJob).mockReturnValue(createPromise as any);

    renderWithProviders(<ContentCreationWizard />, { initialEntries: ['/content/new'] });

    // Step 1
    const productCard = await screen.findByText('Rose Absolue Eau de Parfum');
    await user.click(productCard);
    await user.click(screen.getByRole('button', { name: /Continue to Strategy/i }));

    // Step 2
    await screen.findByText('2. Content Strategy & Language');
    await user.click(screen.getByRole('button', { name: /Continue to Platform & Campaign/i }));

    // Step 3
    await screen.findByText('3. Target Platform & Campaign Context');
    await user.click(screen.getByRole('button', { name: /Review & Enqueue/i }));

    // Step 4: Summary Check
    expect(await screen.findByText('Job Configuration Summary')).toBeInTheDocument();
    expect(screen.getByText(/MSRP: \$185.00/i)).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: /Generate Brand-Safe Copy/i });
    await user.click(submitBtn);

    // Verify loading / disabled state during flight (duplicate-click protection)
    expect(submitBtn).toBeDisabled();
    expect(screen.getByText(/Enqueuing Generation Job.../i)).toBeInTheDocument();

    // Resolve createJob
    resolveCreate!({
      id: 'job-new-123',
      productSnapshotId: 'prod-snap-001',
      brandRuleVersionId: 'rule-001',
      requesterUserId: 'usr-content-001',
      contentType: 'PRODUCT_SPOTLIGHT',
      language: 'BILINGUAL',
      platform: 'TELEGRAM',
      status: 'REQUESTED',
      createdAt: '2026-10-29T09:00:00.000Z',
      updatedAt: '2026-10-29T09:00:00.000Z',
    });

    await waitFor(() => {
      expect(contentApi.createJob).toHaveBeenCalledWith(
        expect.objectContaining({
          productSnapshotId: 'prod-snap-001',
          contentType: 'PRODUCT_SPOTLIGHT',
          language: 'BILINGUAL',
          platform: 'TELEGRAM',
        }),
      );
    });
  });
});
