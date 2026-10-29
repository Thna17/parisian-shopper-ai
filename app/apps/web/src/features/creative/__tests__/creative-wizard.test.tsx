import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test/test-utils.js';
import { CreativeWizardPage } from '../pages/CreativeWizardPage.js';
import { productsApi } from '../../products/api/products-api.js';
import { contentApi } from '../../content/api/content-api.js';
import { creativeApi } from '../api/creative-api.js';

vi.mock('../../products/api/products-api.js', () => ({
  productsApi: {
    getProducts: vi.fn(),
  },
}));

vi.mock('../../content/api/content-api.js', () => ({
  contentApi: {
    getJobs: vi.fn(),
  },
}));

vi.mock('../api/creative-api.js', () => ({
  creativeApi: {
    getTemplates: vi.fn(),
    createProject: vi.fn(),
  },
}));

vi.mock('../../../services/api/auth-api.js', () => ({
  authApi: {
    login: vi.fn(),
    getCurrentEmployee: vi.fn().mockResolvedValue({
      user: {
        id: 'usr-creative-001',
        displayName: 'Creative Editor',
        roles: ['MARKETING_EDITOR'],
        permissions: ['VIEW_OWN_CONTENT', 'EDIT_CREATIVE'],
      },
    }),
    logout: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

describe('Creative Wizard Creation Flow (WEB-CREATIVE-13 to WEB-CREATIVE-16)', () => {
  const sampleProducts = {
    data: [
      {
        id: 'snap-001',
        sku: 'FIC-PERF-001',
        brand: 'Maison Imaginaire',
        title: 'Moonlit River Eau de Parfum',
        category: 'fragrance',
        price: { amount: 38.0, currency: 'USD' },
        stockStatus: 'in_stock',
        lifecycleStatus: 'ACTIVE',
        capturedAt: '2026-10-29T10:00:00.000Z',
      },
    ],
    pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
  };

  const sampleContentJobs = {
    items: [
      {
        id: 'cv-001',
        productSnapshotId: 'snap-001',
        brandRuleVersionId: 'rule-001',
        requesterUserId: 'usr-creative-001',
        campaignId: null,
        contentType: 'PRODUCT_SPOTLIGHT',
        language: 'EN',
        platform: 'INSTAGRAM',
        status: 'APPROVED',
        createdAt: '2026-10-29T09:00:00.000Z',
        updatedAt: '2026-10-29T09:05:00.000Z',
      },
    ],
    total: 1,
    page: 1,
    limit: 50,
    totalPages: 1,
  };

  const sampleTemplates = [
    {
      id: 'EDITORIAL_SPLIT' as const,
      name: 'Editorial Split',
      description: 'Asymmetric editorial split with serif typography',
      supportedAspectRatios: ['1:1' as const, '4:5' as const],
      defaultLanguage: 'EN' as const,
      version: '1.0.0',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(productsApi.getProducts).mockResolvedValue(sampleProducts as any);
    vi.mocked(contentApi.getJobs).mockResolvedValue(sampleContentJobs as any);
    vi.mocked(creativeApi.getTemplates).mockResolvedValue(sampleTemplates);
  });

  it('WEB-CREATIVE-13 to WEB-CREATIVE-16: walks through all 4 wizard steps and creates poster project', async () => {
    const user = userEvent.setup();
    vi.mocked(creativeApi.createProject).mockResolvedValue({
      scene: {
        id: 'scene-created-001',
        creativeJobId: 'job-001',
        campaignId: null,
        title: 'Moonlit River Launch Poster',
        currentVersionNumber: 1,
        createdAt: '2026-10-29T10:00:00.000Z',
        updatedAt: '2026-10-29T10:00:00.000Z',
      },
      version: {} as any,
    });

    renderWithProviders(<CreativeWizardPage />, {
      initialEntries: ['/creative/new'],
    });

    // Step 1: Select Verified Product
    await waitFor(() => {
      expect(screen.getByText('Moonlit River Eau de Parfum')).toBeInTheDocument();
      expect(screen.getByText('FIC-PERF-001')).toBeInTheDocument();
      expect(screen.getByText('$38.00 USD')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Moonlit River Eau de Parfum'));
    await user.click(screen.getByRole('button', { name: /Continue/i }));

    // Step 2: Select Source Content Version
    await waitFor(() => {
      expect(screen.getByText(/Select Source Content Version/i)).toBeInTheDocument();
      expect(screen.getByText(/Content Job #cv-001/i)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Content Job #cv-001/i));
    await user.click(screen.getByRole('button', { name: /Continue/i }));

    // Step 3: Choose Template & Aspect Ratio
    await waitFor(() => {
      expect(screen.getByText(/Editorial Split/i)).toBeInTheDocument();
      expect(screen.getByText('Square Feed')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Square Feed'));
    await user.click(screen.getByText(/Editorial Split/i));
    await user.click(screen.getByRole('button', { name: /Continue/i }));

    // Step 4: Review & Initialize
    await waitFor(() => {
      expect(screen.getByText(/Initialize Scene Composition/i)).toBeInTheDocument();
      expect(
        screen.getByDisplayValue(/Moonlit River Eau de Parfum — Official Poster/i),
      ).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole('button', { name: /Create & Launch Studio/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(creativeApi.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          productSnapshotId: 'snap-001',
          sourceContentVersionId: 'cv-001',
          templateId: 'EDITORIAL_SPLIT',
          aspectRatio: '1:1',
        }),
      );
    });
  });
});
