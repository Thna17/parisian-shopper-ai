import { describe, expect, it, jest } from '@jest/globals';

import {
  AmbiguousProductIdentifierError,
  ProductSourceAuthFailedError,
  ProductSourceRateLimitedError,
  ProductSourceResponseInvalidError,
  ProductSourceTimeoutError,
  ProductSourceUnavailableError,
} from '../domain/product-errors.js';
import { MekhlaProductSource } from './mekhla-product-source.js';
import type { RawMekhlaProductItem } from './mekhla-product-source.js';

function createSampleItem(overrides: Partial<RawMekhlaProductItem> = {}): RawMekhlaProductItem {
  return {
    id: 'prod_geparlys_3700134410542',
    name: 'Yes I Am The King Gold',
    brand: 'Geparlys',
    shortCode: 'G32',
    sku: null,
    price: '125',
    compareAtPrice: null,
    description: 'A luxurious woody fragrance.',
    type: 'PERFUME',
    status: 'ACTIVE',
    category: {
      id: 'cat_001',
      name: "Men's Perfumes G",
      slug: 'mens-perfumes-g',
    },
    stockQuantity: 10,
    lowStockThreshold: 10,
    trackInventory: true,
    createdAt: '2026-07-13T10:55:52.773Z',
    updatedAt: '2026-09-09T12:39:15.229Z',
    images: [
      {
        url: '/api/v1/products/media/2026/08/20/img1.webp',
        alt: 'Bottle front',
        sortOrder: 0,
      },
      {
        url: 'https://cdn.example.invalid/img2.webp',
        alt: 'Bottle box',
        sortOrder: 1,
      },
    ],
    details: {
      perfumeProfile: {
        topNotes: ['Lemon', 'Nutmeg', 'Coriander'],
        heartNotes: ['Tonka', 'Lavender', 'Iris'],
        baseNotes: ['Frankincense', 'Moss', 'Musk'],
        concentration: 'Eau de Parfum',
        sizeLabel: '100 mL',
      },
    },
    variants: [
      {
        id: 'var_001',
        sku: 'SKU-KING-01',
        barcode: '3700134410542',
        price: '125',
        isActive: true,
        isDefault: true,
      },
    ],
    defaultVariant: {
      id: 'var_001',
      sku: 'SKU-KING-01',
      barcode: '3700134410542',
      price: '125',
      isActive: true,
      isDefault: true,
    },
    selectedVariant: null,
    ...overrides,
  };
}

function createCollectionResponse(
  items: RawMekhlaProductItem[],
  pagination: { page?: number; limit?: number; totalItems?: number; totalPages?: number } = {},
): Record<string, unknown> {
  const fullPagination = {
    page: pagination.page ?? 1,
    limit: pagination.limit ?? 250,
    totalItems: pagination.totalItems ?? items.length,
    totalPages: pagination.totalPages ?? 1,
  };
  return {
    success: true,
    message: 'Products fetched',
    data: {
      items,
      pagination: fullPagination,
    },
  };
}

function createDetailResponse(item: RawMekhlaProductItem): Record<string, unknown> {
  return {
    success: true,
    message: 'Product fetched',
    data: item,
  };
}

function mockResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  const isString = typeof body === 'string';
  const text = isString ? body : JSON.stringify(body);
  const headerMap = new Headers({
    'content-type': 'application/json',
    ...headers,
  });

  return {
    ok: status >= 200 && status < 300,
    status,
    headers: headerMap,
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(isString ? JSON.parse(text) : body),
  } as unknown as Response;
}

describe('MekhlaProductSource', () => {
  const defaultOptions = {
    baseUrl: 'https://api.mekhla.digital',
    businessId: 'cmpwgnlpv0001li15e3n16uhc',
    currency: 'USD',
    allowedHosts: ['api.mekhla.digital'],
    timeoutMs: 1000,
    maxRetries: 2,
    sleepFn: (): Promise<void> => Promise.resolve(),
  };

  describe('configuration & host safety', () => {
    it('rejects missing or empty baseUrl', () => {
      expect(() => new MekhlaProductSource({ ...defaultOptions, baseUrl: '' })).toThrow(
        ProductSourceUnavailableError,
      );
    });

    it('rejects non-HTTPS baseUrl', () => {
      let caughtError: unknown;
      try {
        new MekhlaProductSource({
          ...defaultOptions,
          baseUrl: 'http://api.mekhla.digital',
        });
      } catch (error) {
        caughtError = error;
      }
      expect(caughtError).toBeInstanceOf(ProductSourceUnavailableError);
      expect((caughtError as ProductSourceUnavailableError).cause).toMatchObject({
        message: expect.stringContaining('must use HTTPS protocol'),
      });
    });

    it('rejects embedded credentials in baseUrl', () => {
      let caughtError: unknown;
      try {
        new MekhlaProductSource({
          ...defaultOptions,
          baseUrl: 'https://user:pass@api.mekhla.digital',
        });
      } catch (error) {
        caughtError = error;
      }
      expect(caughtError).toBeInstanceOf(ProductSourceUnavailableError);
      expect((caughtError as ProductSourceUnavailableError).cause).toMatchObject({
        message: expect.stringContaining('must not contain embedded credentials'),
      });
    });

    it('rejects unexpected port in baseUrl', () => {
      let caughtError: unknown;
      try {
        new MekhlaProductSource({
          ...defaultOptions,
          baseUrl: 'https://api.mekhla.digital:8443',
        });
      } catch (error) {
        caughtError = error;
      }
      expect(caughtError).toBeInstanceOf(ProductSourceUnavailableError);
      expect((caughtError as ProductSourceUnavailableError).cause).toMatchObject({
        message: expect.stringContaining('must not specify an unexpected port'),
      });
    });

    it('rejects hostile or unapproved hosts', () => {
      let caughtError: unknown;
      try {
        new MekhlaProductSource({
          ...defaultOptions,
          baseUrl: 'https://malicious.example.com',
          allowedHosts: ['api.mekhla.digital'],
        });
      } catch (error) {
        caughtError = error;
      }
      expect(caughtError).toBeInstanceOf(ProductSourceUnavailableError);
      expect((caughtError as ProductSourceUnavailableError).cause).toMatchObject({
        message: expect.stringContaining(
          "host 'malicious.example.com' is not in allowed hosts list",
        ),
      });
    });

    it('rejects missing business ID', () => {
      let caughtError: unknown;
      try {
        new MekhlaProductSource({ ...defaultOptions, businessId: '  ' });
      } catch (error) {
        caughtError = error;
      }
      expect(caughtError).toBeInstanceOf(ProductSourceUnavailableError);
      expect((caughtError as ProductSourceUnavailableError).cause).toMatchObject({
        message: expect.stringContaining('PRODUCT_API_BUSINESS_ID is required'),
      });
    });
  });

  describe('getBySku lookup', () => {
    it('successfully looks up product by shortCode and fetches detail', async () => {
      const sampleItem = createSampleItem({ shortCode: 'G32' });
      const mockFetch = jest
        .fn<typeof fetch>()
        .mockResolvedValueOnce(mockResponse(200, createCollectionResponse([sampleItem])))
        .mockResolvedValueOnce(mockResponse(200, createDetailResponse(sampleItem)));

      const source = new MekhlaProductSource({
        ...defaultOptions,
        fetchFn: mockFetch,
      });

      const result = await source.getBySku('G32');

      expect(result).not.toBeNull();
      expect(result?.product.sku).toBe('G32');
      expect(result?.product.product_name).toBe('Yes I Am The King Gold');
      expect(result?.product.price).toBe('125');
      expect(result?.product.currency).toBe('USD');
      expect(result?.source_record_id).toBe('prod_geparlys_3700134410542');
      expect(result?.product.images?.[0]?.url).toBe(
        'https://api.mekhla.digital/api/v1/products/media/2026/08/20/img1.webp',
      );
      expect(result?.product.images?.[0]?.role).toBe('primary');
      expect(result?.product.images?.[1]?.role).toBe('gallery');

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const [collectionCall, detailCall] = mockFetch.mock.calls;
      const collectionUrl =
        typeof collectionCall?.[0] === 'string'
          ? collectionCall[0]
          : ((collectionCall?.[0] as URL | undefined)?.href ?? '');
      const detailUrl =
        typeof detailCall?.[0] === 'string'
          ? detailCall[0]
          : ((detailCall?.[0] as URL | undefined)?.href ?? '');
      expect(collectionUrl).toContain('/api/v1/products?');
      expect(collectionUrl).toContain('search=G32');
      expect(collectionUrl).toContain('summaryMode=false');
      expect(collectionUrl).toContain('limit=250');
      expect(detailUrl).toContain('/api/v1/products/prod_geparlys_3700134410542');
    });

    it('performs case-insensitive exact matching for shortCode', async () => {
      const sampleItem = createSampleItem({ shortCode: 'G32' });
      const mockFetch = jest
        .fn<typeof fetch>()
        .mockResolvedValueOnce(mockResponse(200, createCollectionResponse([sampleItem])))
        .mockResolvedValueOnce(mockResponse(200, createDetailResponse(sampleItem)));

      const source = new MekhlaProductSource({
        ...defaultOptions,
        fetchFn: mockFetch,
      });

      const result = await source.getBySku('g32');
      expect(result).not.toBeNull();
      expect(result?.product.sku).toBe('G32');
    });

    it('successfully looks up product by variant barcode', async () => {
      const sampleItem = createSampleItem({
        shortCode: null,
        defaultVariant: null,
        variants: [
          {
            id: 'var_001',
            barcode: '0012345678901',
            price: '50',
            isActive: true,
          },
        ],
      });

      const mockFetch = jest
        .fn<typeof fetch>()
        .mockResolvedValueOnce(mockResponse(200, createCollectionResponse([sampleItem])))
        .mockResolvedValueOnce(mockResponse(200, createDetailResponse(sampleItem)));

      const source = new MekhlaProductSource({
        ...defaultOptions,
        fetchFn: mockFetch,
      });

      const result = await source.getBySku('0012345678901');
      expect(result).not.toBeNull();
      // Leading zeroes preserved
      expect(result?.product.sku).toBe('0012345678901');
    });

    it('prefers shortCode over barcode for normalized SKU', async () => {
      const sampleItem = createSampleItem({
        shortCode: 'G32',
        variants: [
          {
            id: 'var_001',
            barcode: '3700134410542',
            price: '125',
            isActive: true,
          },
        ],
      });

      const mockFetch = jest
        .fn<typeof fetch>()
        .mockResolvedValueOnce(mockResponse(200, createCollectionResponse([sampleItem])))
        .mockResolvedValueOnce(mockResponse(200, createDetailResponse(sampleItem)));

      const source = new MekhlaProductSource({
        ...defaultOptions,
        fetchFn: mockFetch,
      });

      // Even when looking up by barcode, normalized SKU remains preferred shortCode
      const result = await source.getBySku('3700134410542');
      expect(result).not.toBeNull();
      expect(result?.product.sku).toBe('G32');
    });

    it('falls back to barcode when shortCode is missing', async () => {
      const sampleItem = createSampleItem({
        shortCode: null,
        defaultVariant: {
          id: 'var_default',
          barcode: '999888777666',
          price: '80',
          isActive: true,
        },
      });

      const mockFetch = jest
        .fn<typeof fetch>()
        .mockResolvedValueOnce(mockResponse(200, createCollectionResponse([sampleItem])))
        .mockResolvedValueOnce(mockResponse(200, createDetailResponse(sampleItem)));

      const source = new MekhlaProductSource({
        ...defaultOptions,
        fetchFn: mockFetch,
      });

      const result = await source.getBySku('999888777666');
      expect(result).not.toBeNull();
      expect(result?.product.sku).toBe('999888777666');
    });

    it('fails validation when both shortCode and active barcode are missing', async () => {
      const invalidItem = createSampleItem({
        shortCode: null,
        variants: [],
        defaultVariant: null,
        selectedVariant: null,
        details: {},
      });

      const mockFetch = jest
        .fn<typeof fetch>()
        .mockResolvedValueOnce(mockResponse(200, createCollectionResponse([invalidItem])));

      const source = new MekhlaProductSource({
        ...defaultOptions,
        fetchFn: mockFetch,
      });

      await expect(source.search({ query: 'item', limit: 5 })).rejects.toThrow(
        ProductSourceResponseInvalidError,
      );
    });

    it('fails closed when multiple distinct products match the same exact identifier', async () => {
      const item1 = createSampleItem({ id: 'prod_1', shortCode: 'DUP01' });
      const item2 = createSampleItem({ id: 'prod_2', shortCode: 'dup01' });

      const mockFetch = jest
        .fn<typeof fetch>()
        .mockResolvedValueOnce(mockResponse(200, createCollectionResponse([item1, item2])));

      const source = new MekhlaProductSource({
        ...defaultOptions,
        fetchFn: mockFetch,
      });

      await expect(source.getBySku('DUP01')).rejects.toThrow(AmbiguousProductIdentifierError);
    });

    it('returns null when product collection returns no matching items', async () => {
      const mockFetch = jest
        .fn<typeof fetch>()
        .mockResolvedValueOnce(mockResponse(200, createCollectionResponse([])));

      const source = new MekhlaProductSource({
        ...defaultOptions,
        fetchFn: mockFetch,
      });

      const result = await source.getBySku('UNKNOWN-999');
      expect(result).toBeNull();
    });

    it('returns null when detail endpoint returns 404', async () => {
      const sampleItem = createSampleItem({ shortCode: 'G32' });
      const mockFetch = jest
        .fn<typeof fetch>()
        .mockResolvedValueOnce(mockResponse(200, createCollectionResponse([sampleItem])))
        .mockResolvedValueOnce(mockResponse(404, { success: false, message: 'Product not found' }));

      const source = new MekhlaProductSource({
        ...defaultOptions,
        fetchFn: mockFetch,
      });

      const result = await source.getBySku('G32');
      expect(result).toBeNull();
    });

    it('looks up exact shortCode match on page 2', async () => {
      const unrelated = createSampleItem({ id: 'p_unrelated', shortCode: 'G320' });
      const target = createSampleItem({ id: 'p_target', shortCode: 'G32' });

      const mockFetch = jest
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          mockResponse(
            200,
            createCollectionResponse([unrelated], {
              page: 1,
              limit: 250,
              totalItems: 2,
              totalPages: 2,
            }),
          ),
        )
        .mockResolvedValueOnce(
          mockResponse(
            200,
            createCollectionResponse([target], {
              page: 2,
              limit: 250,
              totalItems: 2,
              totalPages: 2,
            }),
          ),
        )
        .mockResolvedValueOnce(mockResponse(200, createDetailResponse(target)));

      const source = new MekhlaProductSource({
        ...defaultOptions,
        fetchFn: mockFetch,
      });

      const result = await source.getBySku('G32');
      expect(result).not.toBeNull();
      expect(result?.product.sku).toBe('G32');
      expect(result?.source_record_id).toBe('p_target');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('looks up exact barcode match on page 2', async () => {
      const unrelated = createSampleItem({
        id: 'p_unrelated',
        shortCode: 'OTHER',
        defaultVariant: null,
        variants: [{ id: 'v_unrelated', barcode: '9999999999999', isActive: true, price: '100' }],
      });
      const target = createSampleItem({
        id: 'p_target',
        shortCode: null,
        variants: [{ id: 'v1', barcode: '3700134410542', isActive: true, price: '120' }],
      });

      const mockFetch = jest
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          mockResponse(
            200,
            createCollectionResponse([unrelated], {
              page: 1,
              limit: 250,
              totalItems: 2,
              totalPages: 2,
            }),
          ),
        )
        .mockResolvedValueOnce(
          mockResponse(
            200,
            createCollectionResponse([target], {
              page: 2,
              limit: 250,
              totalItems: 2,
              totalPages: 2,
            }),
          ),
        )
        .mockResolvedValueOnce(mockResponse(200, createDetailResponse(target)));

      const source = new MekhlaProductSource({
        ...defaultOptions,
        fetchFn: mockFetch,
      });

      const result = await source.getBySku('3700134410542');
      expect(result).not.toBeNull();
      expect(result?.product.sku).toBe('3700134410542');
      expect(result?.source_record_id).toBe('p_target');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('returns null when no match found after all reported pages are examined', async () => {
      const unrelated1 = createSampleItem({ id: 'p_1', shortCode: 'G32-A' });
      const unrelated2 = createSampleItem({ id: 'p_2', shortCode: 'G32-B' });

      const mockFetch = jest
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          mockResponse(
            200,
            createCollectionResponse([unrelated1], {
              page: 1,
              limit: 250,
              totalItems: 2,
              totalPages: 2,
            }),
          ),
        )
        .mockResolvedValueOnce(
          mockResponse(
            200,
            createCollectionResponse([unrelated2], {
              page: 2,
              limit: 250,
              totalItems: 2,
              totalPages: 2,
            }),
          ),
        );

      const source = new MekhlaProductSource({
        ...defaultOptions,
        fetchFn: mockFetch,
      });

      const result = await source.getBySku('G32');
      expect(result).toBeNull();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('duplicate copies of the same product ID across pages do not create false ambiguity', async () => {
      const item = createSampleItem({ id: 'prod_dup', shortCode: 'G32' });

      const mockFetch = jest
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          mockResponse(
            200,
            createCollectionResponse([item], {
              page: 1,
              limit: 250,
              totalItems: 2,
              totalPages: 2,
            }),
          ),
        )
        .mockResolvedValueOnce(
          mockResponse(
            200,
            createCollectionResponse([item], {
              page: 2,
              limit: 250,
              totalItems: 2,
              totalPages: 2,
            }),
          ),
        )
        .mockResolvedValueOnce(mockResponse(200, createDetailResponse(item)));

      const source = new MekhlaProductSource({
        ...defaultOptions,
        fetchFn: mockFetch,
      });

      const result = await source.getBySku('G32');
      expect(result).not.toBeNull();
      expect(result?.product.sku).toBe('G32');
      expect(result?.source_record_id).toBe('prod_dup');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('different matching product IDs across different pages produce AmbiguousProductIdentifierError', async () => {
      const item1 = createSampleItem({ id: 'prod_1', shortCode: 'G32' });
      const item2 = createSampleItem({ id: 'prod_2', shortCode: 'G32' });

      const mockFetch = jest
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          mockResponse(
            200,
            createCollectionResponse([item1], {
              page: 1,
              limit: 250,
              totalItems: 2,
              totalPages: 2,
            }),
          ),
        )
        .mockResolvedValueOnce(
          mockResponse(
            200,
            createCollectionResponse([item2], {
              page: 2,
              limit: 250,
              totalItems: 2,
              totalPages: 2,
            }),
          ),
        );

      const source = new MekhlaProductSource({
        ...defaultOptions,
        fetchFn: mockFetch,
      });

      await expect(source.getBySku('G32')).rejects.toThrow(AmbiguousProductIdentifierError);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('pagination exceeding the safety cap fails closed with ProductSourceUnavailableError', async () => {
      const mockFetch = jest.fn<typeof fetch>().mockResolvedValueOnce(
        mockResponse(
          200,
          createCollectionResponse([], {
            page: 1,
            limit: 250,
            totalItems: 2500,
            totalPages: 11,
          }),
        ),
      );

      const source = new MekhlaProductSource({
        ...defaultOptions,
        maxLookupPages: 10,
        fetchFn: mockFetch,
      });

      await expect(source.getBySku('G32')).rejects.toThrow(ProductSourceUnavailableError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('malformed pagination fails validation with ProductSourceResponseInvalidError', async () => {
      const mockFetch = jest.fn<typeof fetch>().mockResolvedValueOnce(
        mockResponse(200, {
          success: true,
          message: 'ok',
          data: {
            items: [],
            pagination: { page: 99, limit: 250, totalItems: 10, totalPages: 1 },
          },
        }),
      );

      const source = new MekhlaProductSource({
        ...defaultOptions,
        fetchFn: mockFetch,
      });

      await expect(source.getBySku('G32')).rejects.toThrow(ProductSourceResponseInvalidError);
    });

    it('page requests never exceed the configured safety boundary', async () => {
      const mockFetch = jest.fn<typeof fetch>().mockResolvedValueOnce(
        mockResponse(
          200,
          createCollectionResponse([], {
            page: 1,
            limit: 250,
            totalItems: 1000,
            totalPages: 4,
          }),
        ),
      );

      const source = new MekhlaProductSource({
        ...defaultOptions,
        maxLookupPages: 3,
        fetchFn: mockFetch,
      });

      await expect(source.getBySku('G32')).rejects.toThrow(ProductSourceUnavailableError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('search behavior', () => {
    it('successfully searches products with summaryMode=true and bounds limit', async () => {
      const items = [
        createSampleItem({ id: 'item_1', shortCode: 'G01' }),
        createSampleItem({ id: 'item_2', shortCode: 'G02' }),
      ];

      const mockFetch = jest
        .fn<typeof fetch>()
        .mockResolvedValueOnce(mockResponse(200, createCollectionResponse(items)));

      const source = new MekhlaProductSource({
        ...defaultOptions,
        fetchFn: mockFetch,
      });

      const result = await source.search({ query: 'Geparlys', limit: 10 });
      expect(result.items).toHaveLength(2);
      expect(result.items[0]?.product.sku).toBe('G01');
      expect(result.items[1]?.product.sku).toBe('G02');

      const firstCallArg = mockFetch.mock.calls[0]?.[0];
      const urlCalled =
        typeof firstCallArg === 'string'
          ? firstCallArg
          : ((firstCallArg as URL | undefined)?.href ?? '');
      expect(urlCalled).toContain('summaryMode=true');
      expect(urlCalled).toContain('status=ACTIVE');
      expect(urlCalled).toContain('type=PERFUME');
      expect(urlCalled).toContain('includeCounts=false');
      expect(urlCalled).toContain('limit=10');
    });

    it('bounds requested limit to maximum 50', async () => {
      const items = [createSampleItem({ id: 'item_1', shortCode: 'G01' })];
      const mockFetch = jest
        .fn<typeof fetch>()
        .mockResolvedValueOnce(mockResponse(200, createCollectionResponse(items)));

      const source = new MekhlaProductSource({
        ...defaultOptions,
        fetchFn: mockFetch,
      });

      await source.search({ query: 'Geparlys', limit: 50 });
      const firstCallArg = mockFetch.mock.calls[0]?.[0];
      const urlCalled =
        typeof firstCallArg === 'string'
          ? firstCallArg
          : ((firstCallArg as URL | undefined)?.href ?? '');
      expect(urlCalled).toContain('limit=50');
    });
  });

  describe('headers, security, and credentials', () => {
    it('sends X-Active-Business-Id and Accept headers', async () => {
      const mockFetch = jest
        .fn<typeof fetch>()
        .mockResolvedValueOnce(mockResponse(200, createCollectionResponse([])));

      const source = new MekhlaProductSource({
        ...defaultOptions,
        businessId: 'cmpwgnlpv0001li15e3n16uhc',
        fetchFn: mockFetch,
      });

      await source.search({ query: 'test', limit: 5 });
      const options = mockFetch.mock.calls[0]?.[1];
      const headers = options?.headers as Record<string, string>;
      expect(headers['X-Active-Business-Id']).toBe('cmpwgnlpv0001li15e3n16uhc');
      expect(headers['Accept']).toBe('application/json');
      expect(headers['Authorization']).toBeUndefined();
    });

    it('sends Authorization header when token is explicitly configured', async () => {
      const mockFetch = jest
        .fn<typeof fetch>()
        .mockResolvedValueOnce(mockResponse(200, createCollectionResponse([])));

      const source = new MekhlaProductSource({
        ...defaultOptions,
        token: 'secret-token-xyz',
        fetchFn: mockFetch,
      });

      await source.search({ query: 'test', limit: 5 });
      const options = mockFetch.mock.calls[0]?.[1];
      const headers = options?.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer secret-token-xyz');
    });

    it('enforces redirect: error to prevent host escape', async () => {
      const mockFetch = jest
        .fn<typeof fetch>()
        .mockResolvedValueOnce(mockResponse(200, createCollectionResponse([])));

      const source = new MekhlaProductSource({
        ...defaultOptions,
        fetchFn: mockFetch,
      });

      await source.search({ query: 'test', limit: 5 });
      const options = mockFetch.mock.calls[0]?.[1];
      expect(options?.redirect).toBe('error');
    });
  });

  describe('data mapping & normalization', () => {
    it('preserves test price of 0.1 without imposing arbitrary minimum', async () => {
      const itemWithLowPrice = createSampleItem({ price: '0.1' });
      const mockFetch = jest
        .fn<typeof fetch>()
        .mockResolvedValueOnce(mockResponse(200, createCollectionResponse([itemWithLowPrice])));

      const source = new MekhlaProductSource({
        ...defaultOptions,
        fetchFn: mockFetch,
      });

      const result = await source.search({ query: 'Queen', limit: 5 });
      expect(result.items[0]?.product.price).toBe('0.1');
    });

    it('derives stock status accurately across all conditions', async () => {
      // 1. trackInventory=false -> unknown
      const unknownItem = createSampleItem({
        id: 'i1',
        shortCode: 'S1',
        trackInventory: false,
      });
      // 2. stockQuantity <= 0 -> out_of_stock
      const oosItem = createSampleItem({
        id: 'i2',
        shortCode: 'S2',
        stockQuantity: 0,
        lowStockThreshold: 5,
      });
      // 3. stockQuantity <= lowStockThreshold -> low_stock
      const lowItem = createSampleItem({
        id: 'i3',
        shortCode: 'S3',
        stockQuantity: 3,
        lowStockThreshold: 5,
      });
      // 4. stockQuantity > lowStockThreshold -> in_stock
      const inStockItem = createSampleItem({
        id: 'i4',
        shortCode: 'S4',
        stockQuantity: 20,
        lowStockThreshold: 5,
      });

      const mockFetch = jest
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          mockResponse(200, createCollectionResponse([unknownItem, oosItem, lowItem, inStockItem])),
        );

      const source = new MekhlaProductSource({
        ...defaultOptions,
        fetchFn: mockFetch,
      });

      const result = await source.search({ query: 'all', limit: 10 });
      expect(result.items[0]?.product.stock_status).toBe('unknown');
      expect(result.items[1]?.product.stock_status).toBe('out_of_stock');
      expect(result.items[2]?.product.stock_status).toBe('low_stock');
      expect(result.items[3]?.product.stock_status).toBe('in_stock');
    });

    it('resolves relative image URLs against base URL and enforces HTTPS', async () => {
      const item = createSampleItem({
        images: [{ url: '/media/perfume.webp', alt: 'Perfume' }],
      });

      const mockFetch = jest
        .fn<typeof fetch>()
        .mockResolvedValueOnce(mockResponse(200, createCollectionResponse([item])));

      const source = new MekhlaProductSource({
        ...defaultOptions,
        baseUrl: 'https://api.mekhla.digital',
        fetchFn: mockFetch,
      });

      const result = await source.search({ query: 'test', limit: 5 });
      expect(result.items[0]?.product.images?.[0]?.url).toBe(
        'https://api.mekhla.digital/media/perfume.webp',
      );
    });

    it('rejects HTTP image URLs as insecure', async () => {
      const itemWithHttpImage = createSampleItem({
        images: [{ url: 'http://insecure.example.com/pic.jpg', alt: 'Bad' }],
      });

      const mockFetch = jest
        .fn<typeof fetch>()
        .mockResolvedValueOnce(mockResponse(200, createCollectionResponse([itemWithHttpImage])));

      const source = new MekhlaProductSource({
        ...defaultOptions,
        fetchFn: mockFetch,
      });

      await expect(source.search({ query: 'test', limit: 5 })).rejects.toThrow(
        ProductSourceResponseInvalidError,
      );
    });

    it('maps perfume notes, concentration, and size cleanly', async () => {
      const item = createSampleItem({
        details: {
          perfumeProfile: {
            topNotes: ['Bergamot', 'Mandarin'],
            heartNotes: ['Rose', 'Jasmine'],
            baseNotes: ['Amber', 'Vanilla'],
            concentration: 'Eau de Toilette',
            sizeLabel: '90 mL',
          },
        },
      });

      const mockFetch = jest
        .fn<typeof fetch>()
        .mockResolvedValueOnce(mockResponse(200, createCollectionResponse([item])));

      const source = new MekhlaProductSource({
        ...defaultOptions,
        fetchFn: mockFetch,
      });

      const result = await source.search({ query: 'test', limit: 5 });
      const p = result.items[0]?.product;
      expect(p?.fragrance_notes).toEqual({
        top: ['Bergamot', 'Mandarin'],
        heart: ['Rose', 'Jasmine'],
        base: ['Amber', 'Vanilla'],
      });
      expect(p?.concentration).toEqual({
        code: 'EDT',
        label: 'Eau de Toilette',
      });
      expect(p?.size).toEqual({
        value: '90',
        unit: 'ml',
        display: '90 mL',
      });
    });

    it('safely omits size if sizeLabel is unparseable', async () => {
      const item = createSampleItem({
        details: {
          perfumeProfile: {
            sizeLabel: 'Unparseable gibberish',
          },
        },
      });

      const mockFetch = jest
        .fn<typeof fetch>()
        .mockResolvedValueOnce(mockResponse(200, createCollectionResponse([item])));

      const source = new MekhlaProductSource({
        ...defaultOptions,
        fetchFn: mockFetch,
      });

      const result = await source.search({ query: 'test', limit: 5 });
      expect(result.items[0]?.product.size).toBeUndefined();
    });
  });

  describe('failure behavior and retries', () => {
    it('throws ProductSourceAuthFailedError on 401 and does not retry', async () => {
      const mockFetch = jest
        .fn<typeof fetch>()
        .mockResolvedValueOnce(mockResponse(401, { success: false, message: 'Unauthorized' }));

      const source = new MekhlaProductSource({
        ...defaultOptions,
        fetchFn: mockFetch,
      });

      await expect(source.search({ query: 'test', limit: 5 })).rejects.toThrow(
        ProductSourceAuthFailedError,
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('throws ProductSourceAuthFailedError on 403 and does not retry', async () => {
      const mockFetch = jest
        .fn<typeof fetch>()
        .mockResolvedValueOnce(mockResponse(403, { success: false, message: 'Forbidden' }));

      const source = new MekhlaProductSource({
        ...defaultOptions,
        fetchFn: mockFetch,
      });

      await expect(source.search({ query: 'test', limit: 5 })).rejects.toThrow(
        ProductSourceAuthFailedError,
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('throws ProductSourceResponseInvalidError on 400 bad request without retrying', async () => {
      const mockFetch = jest
        .fn<typeof fetch>()
        .mockResolvedValueOnce(mockResponse(400, { success: false, message: 'Bad request' }));

      const source = new MekhlaProductSource({
        ...defaultOptions,
        fetchFn: mockFetch,
      });

      await expect(source.search({ query: 'test', limit: 5 })).rejects.toThrow(
        ProductSourceResponseInvalidError,
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('retries on retryable 500 error and succeeds', async () => {
      const sampleItem = createSampleItem();
      const mockFetch = jest
        .fn<typeof fetch>()
        .mockResolvedValueOnce(mockResponse(500, { success: false, message: 'Server error' }))
        .mockResolvedValueOnce(mockResponse(200, createCollectionResponse([sampleItem])));

      const source = new MekhlaProductSource({
        ...defaultOptions,
        maxRetries: 2,
        fetchFn: mockFetch,
      });

      const result = await source.search({ query: 'test', limit: 5 });
      expect(result.items).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('retries on 429 and parses Retry-After header', async () => {
      const sampleItem = createSampleItem();
      const sleepSpy = jest.fn<(ms: number) => Promise<void>>().mockResolvedValue();
      const mockFetch = jest
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          mockResponse(429, { message: 'Too Many Requests' }, { 'Retry-After': '2' }),
        )
        .mockResolvedValueOnce(mockResponse(200, createCollectionResponse([sampleItem])));

      const source = new MekhlaProductSource({
        ...defaultOptions,
        maxRetries: 2,
        fetchFn: mockFetch,
        sleepFn: sleepSpy,
      });

      const result = await source.search({ query: 'test', limit: 5 });
      expect(result.items).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(sleepSpy).toHaveBeenCalledWith(2000);
    });

    it('throws ProductSourceRateLimitedError on 429 retry exhaustion', async () => {
      const mockFetch = jest
        .fn<typeof fetch>()
        .mockResolvedValue(mockResponse(429, { message: 'Too Many Requests' }));

      const source = new MekhlaProductSource({
        ...defaultOptions,
        maxRetries: 1,
        fetchFn: mockFetch,
      });

      await expect(source.search({ query: 'test', limit: 5 })).rejects.toThrow(
        ProductSourceRateLimitedError,
      );
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws ProductSourceUnavailableError on 5xx retry exhaustion', async () => {
      const mockFetch = jest
        .fn<typeof fetch>()
        .mockResolvedValue(mockResponse(503, { message: 'Service Unavailable' }));

      const source = new MekhlaProductSource({
        ...defaultOptions,
        maxRetries: 2,
        fetchFn: mockFetch,
      });

      await expect(source.search({ query: 'test', limit: 5 })).rejects.toThrow(
        ProductSourceUnavailableError,
      );
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('retries on network failure and throws ProductSourceUnavailableError on exhaustion', async () => {
      const mockFetch = jest
        .fn<typeof fetch>()
        .mockRejectedValue(new Error('fetch failed: ECONNREFUSED'));

      const source = new MekhlaProductSource({
        ...defaultOptions,
        maxRetries: 1,
        fetchFn: mockFetch,
      });

      await expect(source.search({ query: 'test', limit: 5 })).rejects.toThrow(
        ProductSourceUnavailableError,
      );
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws ProductSourceTimeoutError when request times out and retries are exhausted', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      const mockFetch = jest.fn<typeof fetch>().mockRejectedValue(abortError);

      const source = new MekhlaProductSource({
        ...defaultOptions,
        maxRetries: 1,
        fetchFn: mockFetch,
      });

      await expect(source.search({ query: 'test', limit: 5 })).rejects.toThrow(
        ProductSourceTimeoutError,
      );
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws ProductSourceResponseInvalidError on malformed JSON', async () => {
      const mockFetch = jest
        .fn<typeof fetch>()
        .mockResolvedValueOnce(mockResponse(200, 'Invalid JSON <not json>'));

      const source = new MekhlaProductSource({
        ...defaultOptions,
        fetchFn: mockFetch,
      });

      await expect(source.search({ query: 'test', limit: 5 })).rejects.toThrow(
        ProductSourceResponseInvalidError,
      );
    });

    it('throws ProductSourceResponseInvalidError on malformed success envelope', async () => {
      const mockFetch = jest.fn<typeof fetch>().mockResolvedValueOnce(
        mockResponse(200, {
          success: true,
          // Missing message, data, pagination
        }),
      );

      const source = new MekhlaProductSource({
        ...defaultOptions,
        fetchFn: mockFetch,
      });

      await expect(source.search({ query: 'test', limit: 5 })).rejects.toThrow(
        ProductSourceResponseInvalidError,
      );
    });

    it('times out when server returns headers but body reading stalls', async () => {
      const mockFetch = jest.fn<typeof fetch>().mockImplementation((_url, init) => {
        const signal = init?.signal as AbortSignal | undefined;
        return Promise.resolve({
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          text: () =>
            new Promise<string>((_, reject) => {
              if (signal?.aborted) {
                const err = new Error('The operation was aborted');
                err.name = 'AbortError';
                reject(err);
                return;
              }
              signal?.addEventListener('abort', () => {
                const err = new Error('The operation was aborted');
                err.name = 'AbortError';
                reject(err);
              });
            }),
        } as unknown as Response);
      });

      const source = new MekhlaProductSource({
        ...defaultOptions,
        timeoutMs: 30,
        maxRetries: 0,
        fetchFn: mockFetch,
      });

      await expect(source.getBySku('G32')).rejects.toThrow(ProductSourceTimeoutError);
    });

    it('throws ProductSourceResponseInvalidError when collection returns 200 with success: false', async () => {
      const mockFetch = jest.fn<typeof fetch>().mockResolvedValueOnce(
        mockResponse(200, {
          success: false,
          message: 'Operation failed upstream',
          data: {
            items: [],
            pagination: { page: 1, limit: 250, totalItems: 0, totalPages: 0 },
          },
        }),
      );

      const source = new MekhlaProductSource({
        ...defaultOptions,
        fetchFn: mockFetch,
      });

      await expect(source.getBySku('G32')).rejects.toThrow(ProductSourceResponseInvalidError);
    });

    it('throws ProductSourceResponseInvalidError when detail returns 200 with success: false', async () => {
      const sampleItem = createSampleItem({ shortCode: 'G32' });
      const mockFetch = jest
        .fn<typeof fetch>()
        .mockResolvedValueOnce(mockResponse(200, createCollectionResponse([sampleItem])))
        .mockResolvedValueOnce(
          mockResponse(200, {
            success: false,
            message: 'Detail fetch failed upstream',
            data: sampleItem,
          }),
        );

      const source = new MekhlaProductSource({
        ...defaultOptions,
        fetchFn: mockFetch,
      });

      await expect(source.getBySku('G32')).rejects.toThrow(ProductSourceResponseInvalidError);
    });

    it('rejects product when only sourceBarcode is present', async () => {
      const itemWithOnlySourceBarcode = createSampleItem({
        id: 'p_only_sb',
        shortCode: null,
        variants: [],
        defaultVariant: null,
        selectedVariant: null,
        details: {
          importMeta: {
            sourceBarcode: '3700134410542',
          },
        },
      });

      const mockFetch = jest
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          mockResponse(200, createCollectionResponse([itemWithOnlySourceBarcode])),
        );

      const source = new MekhlaProductSource({
        ...defaultOptions,
        fetchFn: mockFetch,
      });

      const result = await source.getBySku('3700134410542');
      expect(result).toBeNull();

      mockFetch.mockResolvedValueOnce(
        mockResponse(200, createCollectionResponse([itemWithOnlySourceBarcode])),
      );
      await expect(source.search({ query: 'test', limit: 5 })).rejects.toThrow(
        ProductSourceResponseInvalidError,
      );
    });

    it('inactive variant barcodes cannot become the normalized SKU', async () => {
      const itemWithInactiveVariant = createSampleItem({
        shortCode: null,
        variants: [
          {
            id: 'v_inactive',
            barcode: '111222333',
            isActive: false,
          },
        ],
        defaultVariant: null,
        selectedVariant: null,
      });

      const mockFetch = jest
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          mockResponse(200, createCollectionResponse([itemWithInactiveVariant])),
        );

      const source = new MekhlaProductSource({
        ...defaultOptions,
        fetchFn: mockFetch,
      });

      await expect(source.search({ query: 'test', limit: 5 })).rejects.toThrow(
        ProductSourceResponseInvalidError,
      );
    });

    it('active variant barcode remains the valid fallback when shortCode is missing', async () => {
      const itemWithActiveVariant = createSampleItem({
        shortCode: null,
        variants: [
          {
            id: 'v_active',
            barcode: '888777666555',
            isActive: true,
          },
        ],
        defaultVariant: null,
        selectedVariant: null,
      });

      const mockFetch = jest
        .fn<typeof fetch>()
        .mockResolvedValueOnce(mockResponse(200, createCollectionResponse([itemWithActiveVariant])))
        .mockResolvedValueOnce(mockResponse(200, createDetailResponse(itemWithActiveVariant)));

      const source = new MekhlaProductSource({
        ...defaultOptions,
        fetchFn: mockFetch,
      });

      const result = await source.getBySku('888777666555');
      expect(result).not.toBeNull();
      expect(result?.product.sku).toBe('888777666555');
    });
  });
});
