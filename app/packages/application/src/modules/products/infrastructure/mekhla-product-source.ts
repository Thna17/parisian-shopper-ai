import { z } from 'zod';

import {
  type ProductSearchResult,
  type ProductSource,
  type ProductSourceSearchInput,
} from '../application/product-source.port.js';
import {
  AmbiguousProductIdentifierError,
  ProductNotFoundError,
  ProductSourceAuthFailedError,
  ProductSourceRateLimitedError,
  ProductSourceResponseInvalidError,
  ProductSourceTimeoutError,
  ProductSourceUnavailableError,
} from '../domain/product-errors.js';
import { parseSearchInput, parseSku } from '../domain/product-input.js';
import {
  decimalStringSchema,
  normalizedProductEnvelopeSchema,
  type NormalizedProductEnvelope,
} from '../domain/product.schema.js';

export interface MekhlaProductSourceOptions {
  readonly baseUrl: string;
  readonly businessId: string;
  readonly currency?: string | undefined;
  readonly allowedHosts?: readonly string[] | undefined;
  readonly timeoutMs?: number | undefined;
  readonly maxRetries?: number | undefined;
  readonly token?: string | undefined;
  readonly sourceSystem?: string | undefined;
  readonly maxLookupPages?: number | undefined;
  readonly fetchFn?: typeof fetch | undefined;
  readonly sleepFn?: ((ms: number) => Promise<void>) | undefined;
}

export const rawMekhlaPaginationSchema = z
  .object({
    page: z.number().int().min(1),
    limit: z.number().int().min(1),
    totalItems: z.number().int().min(0),
    totalPages: z.number().int().min(0),
  })
  .passthrough();

export const rawMekhlaVariantSchema = z
  .object({
    id: z.string().min(1).optional(),
    sku: z.string().nullable().optional(),
    barcode: z.string().nullable().optional(),
    isActive: z.boolean().optional(),
    isDefault: z.boolean().optional(),
    price: z.union([z.string(), z.number()]).optional(),
    stockQuantity: z.number().nullable().optional(),
  })
  .passthrough();

export const rawMekhlaProductItemSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    brand: z.string().min(1),
    shortCode: z.string().nullable().optional(),
    sku: z.string().nullable().optional(),
    price: z.union([z.string(), z.number()]),
    compareAtPrice: z.union([z.string(), z.number()]).nullable().optional(),
    description: z.string().nullable().optional(),
    type: z.string().optional(),
    status: z.string(),
    categoryId: z.string().nullable().optional(),
    category: z
      .object({
        id: z.string().optional(),
        name: z.string().min(1),
        slug: z.string().optional(),
      })
      .passthrough(),
    stockQuantity: z.number().nullable().optional(),
    lowStockThreshold: z.number().nullable().optional(),
    trackInventory: z.boolean().nullable().optional(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    images: z
      .array(
        z
          .object({
            url: z.string().min(1),
            alt: z.string().nullable().optional(),
            sortOrder: z.number().optional(),
          })
          .passthrough(),
      )
      .optional()
      .default([]),
    details: z
      .object({
        perfumeProfile: z
          .object({
            topNotes: z.array(z.string()).optional(),
            heartNotes: z.array(z.string()).optional(),
            baseNotes: z.array(z.string()).optional(),
            concentration: z.string().optional(),
            sizeLabel: z.string().optional(),
          })
          .passthrough()
          .optional(),
        importMeta: z
          .object({
            sourceBarcode: z.string().optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
    variants: z.array(rawMekhlaVariantSchema).optional().default([]),
    defaultVariant: rawMekhlaVariantSchema.nullable().optional(),
    selectedVariant: rawMekhlaVariantSchema.nullable().optional(),
  })
  .passthrough();

export type RawMekhlaProductItem = z.infer<typeof rawMekhlaProductItemSchema>;

export const rawMekhlaCollectionEnvelopeSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({
      items: z.array(rawMekhlaProductItemSchema),
      pagination: rawMekhlaPaginationSchema,
    }),
  })
  .passthrough();

export const rawMekhlaDetailEnvelopeSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: rawMekhlaProductItemSchema,
  })
  .passthrough();

export class MekhlaProductSource implements ProductSource {
  public readonly adapterName = 'mekhla-http';

  private readonly baseUrl: string;
  private readonly businessId: string;
  private readonly currency: string;
  private readonly allowedHosts: readonly string[];
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly token?: string | undefined;
  private readonly sourceSystem: string;
  private readonly maxLookupPages: number;
  private readonly fetchFn: typeof fetch;
  private readonly sleepFn: (ms: number) => Promise<void>;

  public constructor(options: MekhlaProductSourceOptions) {
    if (!options.baseUrl || typeof options.baseUrl !== 'string') {
      throw new ProductSourceUnavailableError(new Error('PRODUCT_API_BASE_URL is required'));
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(options.baseUrl);
    } catch {
      throw new ProductSourceUnavailableError(
        new Error(`Invalid PRODUCT_API_BASE_URL: '${options.baseUrl}'`),
      );
    }

    if (parsedUrl.protocol !== 'https:') {
      throw new ProductSourceUnavailableError(
        new Error('PRODUCT_API_BASE_URL must use HTTPS protocol'),
      );
    }

    if (parsedUrl.username || parsedUrl.password) {
      throw new ProductSourceUnavailableError(
        new Error('PRODUCT_API_BASE_URL must not contain embedded credentials'),
      );
    }

    if (parsedUrl.port && parsedUrl.port !== '443') {
      throw new ProductSourceUnavailableError(
        new Error('PRODUCT_API_BASE_URL must not specify an unexpected port'),
      );
    }

    const allowedHosts = (
      options.allowedHosts && options.allowedHosts.length > 0
        ? options.allowedHosts
        : ['api.mekhla.digital']
    ).map((host) => host.trim().toLowerCase());

    if (!allowedHosts.includes(parsedUrl.hostname.toLowerCase())) {
      throw new ProductSourceUnavailableError(
        new Error(`PRODUCT_API_BASE_URL host '${parsedUrl.hostname}' is not in allowed hosts list`),
      );
    }

    if (!options.businessId || options.businessId.trim().length === 0) {
      throw new ProductSourceUnavailableError(new Error('PRODUCT_API_BUSINESS_ID is required'));
    }

    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.businessId = options.businessId.trim();
    this.currency = options.currency?.trim() || 'USD';
    this.allowedHosts = Object.freeze(allowedHosts);
    this.timeoutMs = options.timeoutMs ?? 3000;
    this.maxRetries = options.maxRetries ?? 2;
    this.token = options.token?.trim() || undefined;
    this.sourceSystem = options.sourceSystem?.trim() || 'mekhla-product-api';
    this.maxLookupPages =
      typeof options.maxLookupPages === 'number' && options.maxLookupPages > 0
        ? options.maxLookupPages
        : 10;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
    this.sleepFn =
      options.sleepFn ??
      ((ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  public async getBySku(input: string): Promise<NormalizedProductEnvelope | null> {
    const code = parseSku(input);
    const maxPages = this.maxLookupPages;
    let currentPage = 1;
    let totalPages = 1;
    const matchedCandidatesById = new Map<string, RawMekhlaProductItem>();

    while (currentPage <= totalPages) {
      if (currentPage > maxPages) {
        throw new ProductSourceUnavailableError(
          new Error(
            `Exact lookup pagination exceeded safety boundary of ${maxPages} pages for identifier "${code}"`,
          ),
        );
      }

      const collectionUrl = this.buildCollectionUrl({
        page: currentPage,
        limit: 250,
        search: code,
        status: 'ACTIVE',
        type: 'PERFUME',
        includeCounts: false,
        summaryMode: false,
      });

      const collectionData = await this.executeFetch(collectionUrl);
      const parsedEnvelope = rawMekhlaCollectionEnvelopeSchema.safeParse(collectionData);
      if (!parsedEnvelope.success) {
        throw new ProductSourceResponseInvalidError(parsedEnvelope.error);
      }

      const { items, pagination } = parsedEnvelope.data.data;

      if (pagination.page !== currentPage) {
        throw new ProductSourceResponseInvalidError(
          new Error(
            `Pagination page mismatch: expected ${currentPage}, received ${pagination.page}`,
          ),
        );
      }

      if (pagination.totalPages > maxPages) {
        throw new ProductSourceUnavailableError(
          new Error(
            `Upstream product catalog pagination (${pagination.totalPages} pages) exceeded safety cap (${maxPages} pages) for identifier "${code}"`,
          ),
        );
      }

      totalPages = pagination.totalPages;

      for (const item of items) {
        if (matchesExactIdentifier(item, code)) {
          matchedCandidatesById.set(item.id, item);
        }
      }

      if (matchedCandidatesById.size > 1) {
        throw new AmbiguousProductIdentifierError(code, Array.from(matchedCandidatesById.keys()));
      }

      currentPage++;
    }

    if (matchedCandidatesById.size === 0) {
      return null;
    }

    const matchedItem = Array.from(matchedCandidatesById.values())[0];
    if (!matchedItem) {
      return null;
    }

    const detailUrl = this.buildDetailUrl(matchedItem.id);
    let detailData: unknown;
    try {
      detailData = await this.executeFetch(detailUrl);
    } catch (error) {
      if (error instanceof ProductNotFoundError) {
        return null;
      }
      throw error;
    }

    const parsedDetail = rawMekhlaDetailEnvelopeSchema.safeParse(detailData);
    if (!parsedDetail.success) {
      throw new ProductSourceResponseInvalidError(parsedDetail.error);
    }

    return this.normalizeItem(parsedDetail.data.data);
  }

  public async search(input: ProductSourceSearchInput): Promise<ProductSearchResult> {
    const validated = parseSearchInput(input);
    const boundedLimit = Math.min(Math.max(1, validated.limit), 50, 250);

    const collectionUrl = this.buildCollectionUrl({
      page: 1,
      limit: boundedLimit,
      search: validated.query,
      status: 'ACTIVE',
      type: 'PERFUME',
      includeCounts: false,
      summaryMode: true,
    });

    const collectionData = await this.executeFetch(collectionUrl);
    const parsedEnvelope = rawMekhlaCollectionEnvelopeSchema.safeParse(collectionData);
    if (!parsedEnvelope.success) {
      throw new ProductSourceResponseInvalidError(parsedEnvelope.error);
    }

    const items = parsedEnvelope.data.data.items;
    const normalizedItems: NormalizedProductEnvelope[] = [];

    for (const item of items) {
      const normalized = this.normalizeItem(item);
      normalizedItems.push(normalized);
    }

    return {
      items: normalizedItems.slice(0, validated.limit),
    };
  }

  private buildCollectionUrl(params: {
    page: number;
    limit: number;
    search?: string;
    status?: string;
    type?: string;
    includeCounts?: boolean;
    summaryMode?: boolean;
  }): URL {
    const url = new URL(`${this.baseUrl}/api/v1/products`);
    url.searchParams.set('page', String(params.page));
    url.searchParams.set('limit', String(params.limit));
    url.searchParams.set('sort', 'newest');
    url.searchParams.set('status', params.status ?? 'ACTIVE');
    url.searchParams.set('type', params.type ?? 'PERFUME');
    url.searchParams.set('includeCounts', params.includeCounts ? 'true' : 'false');
    if (params.summaryMode !== undefined) {
      url.searchParams.set('summaryMode', params.summaryMode ? 'true' : 'false');
    }
    if (params.search && params.search.trim().length > 0) {
      url.searchParams.set('search', params.search.trim());
    }
    return url;
  }

  private buildDetailUrl(productId: string): URL {
    return new URL(`${this.baseUrl}/api/v1/products/${encodeURIComponent(productId)}`);
  }

  private async executeFetch(url: URL): Promise<unknown> {
    const requestHeaders: Record<string, string> = {
      'X-Active-Business-Id': this.businessId,
      Accept: 'application/json',
      'User-Agent': 'parisian-shopper-ai/1.0',
    };

    if (this.token) {
      requestHeaders.Authorization = `Bearer ${this.token}`;
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      let timerCleared = false;
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, this.timeoutMs);

      const clearTimer = (): void => {
        if (!timerCleared) {
          clearTimeout(timeoutId);
          timerCleared = true;
        }
      };

      try {
        const response = await this.fetchFn(url.toString(), {
          method: 'GET',
          headers: requestHeaders,
          redirect: 'error',
          signal: controller.signal,
        });

        if (response.status >= 200 && response.status < 300) {
          const rawText = await response.text();
          try {
            return JSON.parse(rawText);
          } catch (jsonError) {
            throw new ProductSourceResponseInvalidError(jsonError);
          }
        }

        if (response.status === 400) {
          throw new ProductSourceResponseInvalidError(
            new Error(`Product API returned bad request (400)`),
          );
        }

        if (response.status === 401 || response.status === 403) {
          throw new ProductSourceAuthFailedError(
            new Error(`Product API authentication/authorization failed (${response.status})`),
          );
        }

        if (response.status === 404) {
          throw new ProductNotFoundError(url.pathname);
        }

        const isRetryable =
          response.status === 408 ||
          response.status === 429 ||
          (response.status >= 500 && response.status <= 504);

        if (isRetryable && attempt < this.maxRetries) {
          clearTimer();
          let waitMs = this.calculateBackoff(attempt);
          if (response.status === 429) {
            const retryAfterHeader = response.headers.get('Retry-After');
            const parsedWait = parseRetryAfter(retryAfterHeader);
            if (parsedWait !== null) {
              waitMs = Math.min(parsedWait, 5000);
            }
          }
          await this.sleepFn(waitMs);
          continue;
        }

        if (response.status === 429) {
          throw new ProductSourceRateLimitedError(
            new Error(`Product API rate limited (429) after ${attempt + 1} attempts`),
          );
        }

        throw new ProductSourceUnavailableError(
          new Error(`Product API unavailable with status ${response.status}`),
        );
      } catch (error) {
        if (
          error instanceof ProductNotFoundError ||
          error instanceof ProductSourceAuthFailedError ||
          error instanceof ProductSourceResponseInvalidError ||
          error instanceof ProductSourceRateLimitedError
        ) {
          throw error;
        }

        const isAbort =
          error instanceof Error &&
          (error.name === 'AbortError' || error.message.includes('aborted'));

        lastError = isAbort
          ? new ProductSourceTimeoutError(new Error(`Product API request timed out`))
          : new ProductSourceUnavailableError(error);

        if (attempt < this.maxRetries) {
          clearTimer();
          const waitMs = this.calculateBackoff(attempt);
          await this.sleepFn(waitMs);
          continue;
        }

        throw lastError;
      } finally {
        clearTimer();
      }
    }

    throw lastError ?? new ProductSourceUnavailableError();
  }

  private calculateBackoff(attempt: number): number {
    const base = 250 * Math.pow(2, attempt);
    const jitter = Math.floor(Math.random() * 100);
    return Math.min(2000, base + jitter);
  }

  private normalizeItem(item: RawMekhlaProductItem): NormalizedProductEnvelope {
    return mapMekhlaToNormalized(item, {
      baseUrl: this.baseUrl,
      currency: this.currency,
      sourceSystem: this.sourceSystem,
    });
  }
}

export function extractNormalizedSku(item: RawMekhlaProductItem): string {
  if (typeof item.shortCode === 'string' && item.shortCode.trim().length > 0) {
    return item.shortCode.trim();
  }

  const preferredVariants = [item.selectedVariant, item.defaultVariant].filter(Boolean);
  for (const variant of preferredVariants) {
    if (
      variant &&
      variant.isActive !== false &&
      typeof variant.barcode === 'string' &&
      variant.barcode.trim().length > 0
    ) {
      return variant.barcode.trim();
    }
  }

  if (Array.isArray(item.variants)) {
    for (const variant of item.variants) {
      if (
        variant &&
        variant.isActive !== false &&
        typeof variant.barcode === 'string' &&
        variant.barcode.trim().length > 0
      ) {
        return variant.barcode.trim();
      }
    }
  }

  throw new ProductSourceResponseInvalidError(
    new Error(`Product '${item.id}' has no shortCode or active variant barcode`),
  );
}

export function matchesExactIdentifier(item: RawMekhlaProductItem, searchKey: string): boolean {
  const normalizedKey = searchKey.trim();
  const lowerKey = normalizedKey.toLowerCase();

  if (typeof item.shortCode === 'string' && item.shortCode.trim().length > 0) {
    if (item.shortCode.trim().toLowerCase() === lowerKey) {
      return true;
    }
  }

  if (typeof item.sku === 'string' && item.sku.trim().length > 0) {
    if (item.sku.trim().toLowerCase() === lowerKey) {
      return true;
    }
  }

  const allVariants = [
    item.selectedVariant,
    item.defaultVariant,
    ...(Array.isArray(item.variants) ? item.variants : []),
  ].filter(Boolean);

  for (const v of allVariants) {
    if (v && v.isActive !== false) {
      if (typeof v.sku === 'string' && v.sku.trim().toLowerCase() === lowerKey) {
        return true;
      }
      if (typeof v.barcode === 'string' && v.barcode.trim() === normalizedKey) {
        return true;
      }
    }
  }

  return false;
}

export function mapMekhlaToNormalized(
  item: RawMekhlaProductItem,
  options: {
    baseUrl: string;
    currency: string;
    sourceSystem?: string;
  },
): NormalizedProductEnvelope {
  const sku = extractNormalizedSku(item);
  const regularPrice = toCanonicalDecimalString(item.price);
  const stockStatus = deriveStockStatus(item);
  const lifecycleStatus = mapLifecycleStatus(item.status);

  const images = (item.images || []).map((img, idx) => {
    const resolvedUrl = resolveImageUrl(img.url, options.baseUrl);
    return {
      url: resolvedUrl,
      role: idx === 0 ? ('primary' as const) : ('gallery' as const),
      position: idx + 1,
      alt_text: img.alt?.trim() ? img.alt.trim() : undefined,
    };
  });

  const perfumeProfile = item.details?.perfumeProfile;
  const fragranceNotes = parseFragranceNotes(perfumeProfile);
  const concentration = parseConcentration(perfumeProfile?.concentration);
  const size = parseSize(perfumeProfile?.sizeLabel);

  const productObj: Record<string, unknown> = {
    sku,
    product_name: item.name.trim(),
    brand: item.brand.trim(),
    category: item.category.name.trim(),
    price: regularPrice,
    currency: options.currency,
    stock_status: stockStatus,
  };

  if (item.description && item.description.trim().length > 0) {
    productObj.description = item.description.trim();
  }

  if (images.length > 0) {
    productObj.images = images;
  }

  if (fragranceNotes) {
    productObj.fragrance_notes = fragranceNotes;
  }

  if (concentration) {
    productObj.concentration = concentration;
  }

  if (size) {
    productObj.size = size;
  }

  const envelopeObj = {
    schema_version: '1.0' as const,
    source_system: options.sourceSystem ?? 'mekhla-product-api',
    source_record_id: item.id,
    source_version: item.updatedAt,
    retrieved_at: new Date().toISOString(),
    source_updated_at: new Date(item.updatedAt).toISOString(),
    lifecycle_status: lifecycleStatus,
    product: productObj,
  };

  try {
    return normalizedProductEnvelopeSchema.parse(envelopeObj);
  } catch (schemaError) {
    throw new ProductSourceResponseInvalidError(schemaError);
  }
}

export function toCanonicalDecimalString(price: string | number): string {
  const rawString = String(price).trim();
  try {
    return decimalStringSchema.parse(rawString);
  } catch {
    throw new ProductSourceResponseInvalidError(
      new Error(`Invalid decimal price format: '${rawString}'`),
    );
  }
}

export function deriveStockStatus(item: {
  trackInventory?: boolean | null | undefined;
  stockQuantity?: number | null | undefined;
  lowStockThreshold?: number | null | undefined;
}): 'unknown' | 'out_of_stock' | 'low_stock' | 'in_stock' {
  if (item.trackInventory === false) {
    return 'unknown';
  }
  const quantity = typeof item.stockQuantity === 'number' ? item.stockQuantity : 0;
  if (quantity <= 0) {
    return 'out_of_stock';
  }
  const threshold = typeof item.lowStockThreshold === 'number' ? item.lowStockThreshold : 0;
  if (quantity <= threshold) {
    return 'low_stock';
  }
  return 'in_stock';
}

export function mapLifecycleStatus(status: string): 'active' | 'discontinued' | 'deleted' {
  const upper = status.trim().toUpperCase();
  if (upper === 'ACTIVE' || upper === 'LOW_STOCK' || upper === 'OUT_OF_STOCK') {
    return 'active';
  }
  if (upper === 'ARCHIVED' || upper === 'INACTIVE' || upper === 'DRAFT') {
    return 'discontinued';
  }
  return 'discontinued';
}

export function resolveImageUrl(rawUrl: string, baseUrl: string): string {
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith('http://')) {
    throw new ProductSourceResponseInvalidError(
      new Error(`Image URL '${trimmed}' must use HTTPS protocol`),
    );
  }

  let resolved: URL;
  try {
    resolved = new URL(trimmed, baseUrl);
  } catch (err) {
    throw new ProductSourceResponseInvalidError(
      new Error(`Failed to resolve image URL '${trimmed}': ${String(err)}`),
    );
  }

  if (resolved.protocol !== 'https:') {
    throw new ProductSourceResponseInvalidError(
      new Error(`Resolved image URL '${resolved.toString()}' must use HTTPS protocol`),
    );
  }

  return resolved.toString();
}

export function parseConcentration(
  raw?: string | null,
): { code: string; label: string } | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const label = raw.trim();
  if (label.length === 0) return undefined;
  const lower = label.toLowerCase();
  let code: string;
  if (lower.includes('extrait')) {
    code = 'EXTRAIT';
  } else if (lower.includes('eau de parfum') || lower.includes('edp')) {
    code = 'EDP';
  } else if (lower.includes('eau de toilette') || lower.includes('edt')) {
    code = 'EDT';
  } else if (lower.includes('eau de cologne') || lower.includes('edc')) {
    code = 'EDC';
  } else if (lower.includes('parfum')) {
    code = 'PARFUM';
  } else {
    code = label
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '_')
      .slice(0, 40);
  }
  return { code, label };
}

export function parseSize(
  raw?: string | null,
): { value: string; unit: string; display: string } | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const display = raw.trim();
  if (display.length === 0) return undefined;

  const mlMatch = display.match(/^(\d+(?:\.\d+)?)\s*(ml|mL|ML)\b/i);
  if (mlMatch && mlMatch[1]) {
    return {
      value: toCanonicalDecimalString(mlMatch[1]),
      unit: 'ml',
      display,
    };
  }

  const flOzMatch = display.match(/^(\d+(?:\.\d+)?)\s*(fl\.?\s*oz\.?|oz)\b/i);
  if (flOzMatch && flOzMatch[1]) {
    return {
      value: toCanonicalDecimalString(flOzMatch[1]),
      unit: 'fl oz',
      display,
    };
  }

  const simpleMatch = display.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)$/);
  if (simpleMatch && simpleMatch[1] && simpleMatch[2]) {
    return {
      value: toCanonicalDecimalString(simpleMatch[1]),
      unit: simpleMatch[2].toLowerCase(),
      display,
    };
  }

  return undefined;
}

export function parseFragranceNotes(
  perfumeProfile?: unknown,
): { top: string[]; heart: string[]; base: string[] } | undefined {
  if (!perfumeProfile || typeof perfumeProfile !== 'object') return undefined;
  const profile = perfumeProfile as Record<string, unknown>;

  const cleanArray = (val: unknown): string[] => {
    if (!Array.isArray(val)) return [];
    return val
      .filter((item): item is string => typeof item === 'string')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length <= 100);
  };

  const top = cleanArray(profile.topNotes);
  const heart = cleanArray(profile.heartNotes);
  const base = cleanArray(profile.baseNotes);

  if (top.length === 0 && heart.length === 0 && base.length === 0) {
    return undefined;
  }

  return { top, heart, base };
}

export function parseRetryAfter(headerValue?: string | null): number | null {
  if (!headerValue || typeof headerValue !== 'string') return null;
  const trimmed = headerValue.trim();
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10) * 1000;
  }
  const dateMs = Date.parse(trimmed);
  if (!isNaN(dateMs)) {
    const diff = dateMs - Date.now();
    return diff > 0 ? diff : 0;
  }
  return null;
}
