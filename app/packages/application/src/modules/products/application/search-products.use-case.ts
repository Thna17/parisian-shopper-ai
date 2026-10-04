import { Inject, Injectable } from '@nestjs/common';
import { APPLICATION_LOGGER, type ApplicationLogger } from '@parisian-shopper/common';

import { ProductSourceResponseInvalidError } from '../domain/product-errors.js';
import { parseSearchInput, type SearchProductsInput } from '../domain/product-input.js';
import { normalizedProductEnvelopeSchema } from '../domain/product.schema.js';
import { PRODUCT_METRICS, type ProductMetrics } from './product-metrics.port.js';
import {
  PRODUCT_SOURCE,
  type ProductSearchResult,
  type ProductSource,
} from './product-source.port.js';

@Injectable()
export class SearchProductsUseCase {
  public constructor(
    @Inject(PRODUCT_SOURCE) private readonly source: ProductSource,
    @Inject(PRODUCT_METRICS) private readonly metrics: ProductMetrics,
    @Inject(APPLICATION_LOGGER) private readonly logger: ApplicationLogger,
  ) {}

  public async execute(input: SearchProductsInput): Promise<ProductSearchResult> {
    const startedAt = performance.now();
    const validated = parseSearchInput(input);

    try {
      const result = await this.source.search(validated);
      const normalizedItems = [];
      for (const item of result.items) {
        const parsed = normalizedProductEnvelopeSchema.safeParse(item);
        if (!parsed.success) {
          this.record(startedAt, 'invalid_response');
          this.logInvalidResponse(validated.query.length, startedAt);
          throw new ProductSourceResponseInvalidError(parsed.error);
        }
        normalizedItems.push(parsed.data);
      }
      if (result.items.length > validated.limit) {
        this.record(startedAt, 'invalid_response');
        this.logInvalidResponse(validated.query.length, startedAt);
        throw new ProductSourceResponseInvalidError(
          new Error('Product source exceeded the requested result limit'),
        );
      }

      const normalized: ProductSearchResult = { items: normalizedItems };
      this.record(startedAt, 'success', normalized.items.length);
      this.logger.log('Product source search completed', {
        operation: 'search',
        queryLength: validated.query.length,
        resultCount: normalized.items.length,
        sourceAdapter: this.source.adapterName,
        durationMs: elapsed(startedAt),
      });
      return normalized;
    } catch (error: unknown) {
      if (!(error instanceof ProductSourceResponseInvalidError)) {
        this.record(startedAt, 'failure');
        this.logger.warn('Product source search failed', {
          operation: 'search',
          queryLength: validated.query.length,
          sourceAdapter: this.source.adapterName,
          durationMs: elapsed(startedAt),
        });
      }
      throw error;
    }
  }

  private record(
    startedAt: number,
    outcome: 'success' | 'invalid_response' | 'failure',
    resultCount?: number,
  ): void {
    this.metrics.record({
      operation: 'search',
      outcome,
      durationMs: elapsed(startedAt),
      sourceAdapter: this.source.adapterName,
      ...(resultCount === undefined ? {} : { resultCount }),
    });
  }

  private logInvalidResponse(queryLength: number, startedAt: number): void {
    this.logger.warn('Product source search returned invalid data', {
      operation: 'search',
      queryLength,
      sourceAdapter: this.source.adapterName,
      durationMs: elapsed(startedAt),
    });
  }
}

function elapsed(startedAt: number): number {
  return Math.max(0, Math.round((performance.now() - startedAt) * 100) / 100);
}
