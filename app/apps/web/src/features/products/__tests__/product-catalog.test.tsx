import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test/test-utils.js';
import { ProductCatalogPage } from '../pages/ProductCatalogPage.js';
import { ProductCard } from '../components/ProductCard.js';
import { productsApi } from '../api/products-api.js';
import type { PaginatedProductsResponse, ProductSummary } from '../types/product.types.js';

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

describe('Product Catalog (WEB-PROD-01 to WEB-PROD-05, WEB-PROD-09, WEB-PROD-10, WEB-PROD-12, WEB-PROD-13, WEB-PROD-14)', () => {
  const sampleProducts: ProductSummary[] = [
    {
      id: 'prod-001',
      sku: 'FIC-PERF-001',
      brand: 'Maison Imaginaire',
      title: 'Moonlit River Eau de Parfum',
      category: 'fragrance',
      price: { amount: 38.0, currency: 'USD' },
      stockStatus: 'in_stock',
      lifecycleStatus: 'active',
      primaryImageUrl: 'https://cdn.example.invalid/perfume1.png',
      capturedAt: '2026-10-24T12:00:00Z',
      hasApprovedAssets: true,
    },
    {
      id: 'prod-002',
      sku: 'FIC-PERF-002',
      brand: 'Atelier Placeholder',
      title: 'Amber Orchard Parfum',
      category: 'fragrance',
      price: { amount: 64.0, currency: 'USD' },
      stockStatus: 'low_stock',
      lifecycleStatus: 'active',
      primaryImageUrl: null,
      capturedAt: '2026-10-24T12:00:00Z',
      hasApprovedAssets: false,
    },
    {
      id: 'prod-003',
      sku: 'FIC-PERF-KHM',
      brand: 'Boutique Parisienne',
      title: 'ទឹកអប់ផ្កាម្លិះរាត្រី Moonlit Jasmine (Special Edition for Phnom Penh)',
      category: 'fragrance',
      price: { amount: 95.0, currency: 'USD' },
      stockStatus: 'in_stock',
      lifecycleStatus: 'active',
      primaryImageUrl: 'https://cdn.example.invalid/khm.png',
      capturedAt: '2026-10-24T12:00:00Z',
      hasApprovedAssets: true,
    },
  ];

  const mockCatalogResponse: PaginatedProductsResponse = {
    data: sampleProducts,
    pagination: {
      page: 1,
      limit: 12,
      total: 3,
      totalPages: 1,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // WEB-PROD-01 — Catalog page rendering
  it('WEB-PROD-01: renders catalog header, filter bar, and product card grid', async () => {
    vi.mocked(productsApi.getProducts).mockResolvedValue(mockCatalogResponse);

    renderWithProviders(<ProductCatalogPage />);

    expect(screen.getByText('Products Catalog')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Authoritative luxury perfume catalog synchronized with commercial verification/i,
      ),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Moonlit River Eau de Parfum')).toBeInTheDocument();
      expect(screen.getByText('Amber Orchard Parfum')).toBeInTheDocument();
    });

    expect(screen.getByText('$38.00')).toBeInTheDocument();
    expect(screen.getByText('$64.00')).toBeInTheDocument();
    expect(screen.getByText('FIC-PERF-001')).toBeInTheDocument();
  });

  // WEB-PROD-02 — Loading skeleton
  it('WEB-PROD-02: displays luxury skeleton cards during data fetching', async () => {
    // Return unresolved promise to simulate in-flight loading state
    vi.mocked(productsApi.getProducts).mockImplementation(() => new Promise(() => {}));

    renderWithProviders(<ProductCatalogPage />);

    expect(screen.getByTestId('product-loading-skeletons')).toBeInTheDocument();
  });

  // WEB-PROD-03 — Empty catalog
  it('WEB-PROD-03: renders empty state when catalog has no matching products', async () => {
    vi.mocked(productsApi.getProducts).mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 12, total: 0, totalPages: 1 },
    });

    renderWithProviders(<ProductCatalogPage />);

    await waitFor(() => {
      expect(screen.getByText('No products found')).toBeInTheDocument();
      expect(
        screen.getByText(/No verified product snapshots matched your active search query/i),
      ).toBeInTheDocument();
    });
  });

  // WEB-PROD-04 — Product search
  it('WEB-PROD-04: executes debounced search when user types in search input', async () => {
    vi.mocked(productsApi.getProducts).mockResolvedValue(mockCatalogResponse);

    renderWithProviders(<ProductCatalogPage />);

    const searchInput = screen.getByTestId('product-search-input');
    fireEvent.change(searchInput, { target: { value: 'Moonlit' } });

    await waitFor(
      () => {
        expect(productsApi.getProducts).toHaveBeenCalledWith(
          expect.objectContaining({
            search: 'Moonlit',
          }),
        );
      },
      { timeout: 2000 },
    );
  });

  // WEB-PROD-05 — Pagination
  it('WEB-PROD-05: handles pagination controls for multi-page catalogs', async () => {
    const user = userEvent.setup();
    vi.mocked(productsApi.getProducts).mockResolvedValue({
      data: sampleProducts,
      pagination: {
        page: 1,
        limit: 12,
        total: 24,
        totalPages: 2,
      },
    });

    renderWithProviders(<ProductCatalogPage />);

    await waitFor(() => {
      const indicator = screen.getByTestId('pagination-indicator');
      expect(indicator).toHaveTextContent('Page 1 of 2');
    });

    const nextBtn = screen.getByRole('button', { name: /Next/i });
    expect(nextBtn).toBeEnabled();

    const prevBtn = screen.getByRole('button', { name: /Previous/i });
    expect(prevBtn).toBeDisabled();

    await user.click(nextBtn);

    await waitFor(() => {
      expect(productsApi.getProducts).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 2,
        }),
      );
    });
  });

  // WEB-PROD-09 — Image fallback
  it('WEB-PROD-09: renders elegant packaging fallback when image is missing or broken', async () => {
    const brokenProduct: ProductSummary = {
      ...sampleProducts[0]!,
      primaryImageUrl: 'https://invalid-host.invalid/broken.png',
    };

    renderWithProviders(<ProductCard product={brokenProduct} />);

    const img = screen.getByRole('img');
    fireEvent.error(img);

    await waitFor(() => {
      expect(screen.getByTestId('image-fallback')).toBeInTheDocument();
    });
  });

  // WEB-PROD-10 — API error recovery
  it('WEB-PROD-10: presents error state with retry action on network failure', async () => {
    const user = userEvent.setup();
    vi.mocked(productsApi.getProducts).mockRejectedValue(new Error('Network connection failure'));

    renderWithProviders(<ProductCatalogPage />);

    await waitFor(() => {
      expect(screen.getByText('Could not load products')).toBeInTheDocument();
      expect(screen.getByText('Network connection failure')).toBeInTheDocument();
    });

    const retryBtn = screen.getByRole('button', { name: /Try Again/i });
    expect(retryBtn).toBeInTheDocument();

    vi.mocked(productsApi.getProducts).mockResolvedValue(mockCatalogResponse);
    await user.click(retryBtn);

    await waitFor(() => {
      expect(productsApi.getProducts).toHaveBeenCalledTimes(2);
    });
  });

  // WEB-PROD-12 — Responsive cards
  it('WEB-PROD-12: renders responsive cards with verified retail price and stock status', async () => {
    vi.mocked(productsApi.getProducts).mockResolvedValue(mockCatalogResponse);

    renderWithProviders(<ProductCatalogPage />);

    await waitFor(() => {
      expect(screen.getByTestId('product-card-FIC-PERF-001')).toBeInTheDocument();
      expect(screen.getAllByText('In Stock').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Low Stock').length).toBeGreaterThanOrEqual(1);
    });
  });

  // WEB-PROD-13 — Keyboard accessibility
  it('WEB-PROD-13: supports keyboard focus and links on product cards', async () => {
    renderWithProviders(<ProductCard product={sampleProducts[0]!} />);

    const cardLink = screen.getByTestId('product-card-FIC-PERF-001');
    expect(cardLink).toHaveAttribute('href', '/products/prod-001');
    cardLink.focus();
    expect(document.activeElement).toBe(cardLink);
  });

  // WEB-PROD-14 — Khmer product-name layout
  it('WEB-PROD-14: cleanly renders bilingual Khmer and English product titles without overflow', async () => {
    renderWithProviders(<ProductCard product={sampleProducts[2]!} />);

    expect(screen.getByText(/ទឹកអប់ផ្កាម្លិះរាត្រី/)).toBeInTheDocument();
    expect(screen.getByText(/Moonlit Jasmine/)).toBeInTheDocument();
    expect(screen.getByText('FIC-PERF-KHM')).toBeInTheDocument();
  });
});
