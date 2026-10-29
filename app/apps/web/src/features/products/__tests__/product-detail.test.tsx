import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../../test/test-utils.js';
import { ProductDetailPage } from '../pages/ProductDetailPage.js';
import { productsApi } from '../api/products-api.js';
import type { ProductDetail, ProductReadiness } from '../types/product.types.js';

vi.mock('../api/products-api.js', () => ({
  productsApi: {
    getProducts: vi.fn(),
    getProductById: vi.fn(),
    getProductReadiness: vi.fn(),
    getProductFacts: vi.fn(),
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
        permissions: ['VIEW_PRODUCTS', 'CREATE_CONTENT'],
      },
    }),
    logout: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

describe('Product Detail (WEB-PROD-06 to WEB-PROD-08, WEB-PROD-11)', () => {
  const sampleProductDetail: ProductDetail = {
    id: '4b68e914-7e04-4ec5-b6d8-f860189d2d01',
    sku: 'FIC-PERF-001',
    brand: 'Maison Imaginaire',
    title: 'Moonlit River Eau de Parfum',
    category: 'fragrance',
    description: 'A fictional floral fragrance used for local catalog integration testing.',
    price: { amount: 38.0, currency: 'USD' },
    stockStatus: 'in_stock',
    lifecycleStatus: 'active',
    productUrl: 'https://shop.example.invalid/products/FIC-PERF-001',
    capturedAt: '2026-10-24T12:00:00.000Z',
    sourceUpdatedAt: '2026-10-24T10:00:00.000Z',
    snapshotHash: 'hash-abc-001-digest-canonical',
    normalizerVersion: 'phase-1b-v1',
    provenance: {
      sourceSystem: 'fictional-local-catalog',
      sourceRecordId: 'fixture-product-001',
      retrievedAt: '2026-10-24T12:00:00.000Z',
    },
    specs: {
      concentration: 'Eau de Parfum',
      size: '75 ml',
      countryOfOrigin: 'France',
      gender: null,
    },
    scentPyramid: {
      topNotes: ['Fictional bergamot', 'Fictional pear'],
      heartNotes: ['Fictional jasmine'],
      baseNotes: ['Fictional cedar', 'Fictional musk'],
    },
    images: [
      {
        url: 'https://cdn.example.invalid/perfume1-highres.png',
        role: 'primary',
        rightsState: 'VERIFIED',
        isHeroCutout: true,
      },
    ],
    registeredAssets: [
      {
        id: 'reg-001',
        role: 'HERO_CUTOUT',
        rightsState: 'VERIFIED',
        rightsNotes: 'Exclusive license verified for campaign generation',
      },
    ],
  };

  const sampleReadiness: ProductReadiness = {
    productId: sampleProductDetail.id,
    sku: sampleProductDetail.sku,
    freshnessState: 'FRESH',
    isReadyForContent: true,
    hasApprovedAssets: true,
    assetCount: 1,
    lastAssessedAt: '2026-10-24T12:30:00.000Z',
    blockingReasons: [],
    findings: [
      {
        category: 'COMMERCIAL_FACTS',
        status: 'PASSED',
        message: 'Verified retail price of USD 38.00 recorded.',
      },
      {
        category: 'FRESHNESS',
        status: 'PASSED',
        message: 'Product facts are verified fresh within policy TTL.',
      },
      {
        category: 'ASSETS',
        status: 'PASSED',
        message: 'Active approved and verified HERO_CUTOUT asset available.',
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // WEB-PROD-06 — Product detail navigation
  it('WEB-PROD-06: renders product detail page matching URL param :id', async () => {
    vi.mocked(productsApi.getProductById).mockResolvedValue(sampleProductDetail);
    vi.mocked(productsApi.getProductReadiness).mockResolvedValue(sampleReadiness);

    renderWithProviders(
      <Routes>
        <Route path="/products/:id" element={<ProductDetailPage />} />
      </Routes>,
      { initialEntries: [`/products/${sampleProductDetail.id}`] },
    );

    await waitFor(() => {
      expect(screen.getByText('Moonlit River Eau de Parfum')).toBeInTheDocument();
      expect(screen.getByText('Back to Products Catalog')).toBeInTheDocument();
      expect(screen.getByText('Maison Imaginaire')).toBeInTheDocument();
    });

    expect(productsApi.getProductById).toHaveBeenCalledWith(sampleProductDetail.id);
  });

  // WEB-PROD-07 — Verified facts rendering
  it('WEB-PROD-07: renders authoritative specifications, scent pyramid, and retail price without markup', async () => {
    vi.mocked(productsApi.getProductById).mockResolvedValue(sampleProductDetail);
    vi.mocked(productsApi.getProductReadiness).mockResolvedValue(sampleReadiness);

    renderWithProviders(
      <Routes>
        <Route path="/products/:id" element={<ProductDetailPage />} />
      </Routes>,
      { initialEntries: [`/products/${sampleProductDetail.id}`] },
    );

    await waitFor(() => {
      expect(screen.getByText('$38.00')).toBeInTheDocument();
      expect(screen.getByText('Verified Commercial Facts')).toBeInTheDocument();
      expect(screen.getByText('Eau de Parfum')).toBeInTheDocument();
      expect(screen.getByText('75 ml')).toBeInTheDocument();
      expect(screen.getByText('France')).toBeInTheDocument();
      expect(screen.getByText('Fictional bergamot')).toBeInTheDocument();
      expect(screen.getByText('Fictional jasmine')).toBeInTheDocument();
      expect(screen.getByText('Fictional cedar')).toBeInTheDocument();
    });
  });

  // WEB-PROD-08 — Readiness state
  it('WEB-PROD-08: renders factual readiness gauge with verified gate findings', async () => {
    vi.mocked(productsApi.getProductById).mockResolvedValue(sampleProductDetail);
    vi.mocked(productsApi.getProductReadiness).mockResolvedValue(sampleReadiness);

    renderWithProviders(
      <Routes>
        <Route path="/products/:id" element={<ProductDetailPage />} />
      </Routes>,
      { initialEntries: [`/products/${sampleProductDetail.id}`] },
    );

    await waitFor(() => {
      expect(screen.getByTestId('product-readiness-panel')).toBeInTheDocument();
      expect(screen.getByText('Eligible for Creative Studio')).toBeInTheDocument();
      expect(
        screen.getByText('All Authoritative Commercial Facts & Rights Satisfied'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Active approved and verified HERO_CUTOUT asset available.'),
      ).toBeInTheDocument();
    });
  });

  // WEB-PROD-11 — Unauthorized state / 404 error recovery
  it('WEB-PROD-11: safely displays 404 error and navigation link when product does not exist', async () => {
    vi.mocked(productsApi.getProductById).mockRejectedValue(
      new Error("Product snapshot 'missing-id' was not found"),
    );

    renderWithProviders(
      <Routes>
        <Route path="/products/:id" element={<ProductDetailPage />} />
      </Routes>,
      { initialEntries: ['/products/missing-id'] },
    );

    await waitFor(() => {
      expect(screen.getByText('Product Snapshot Not Found')).toBeInTheDocument();
      expect(screen.getByText('Return to Catalog')).toBeInTheDocument();
    });
  });
});
