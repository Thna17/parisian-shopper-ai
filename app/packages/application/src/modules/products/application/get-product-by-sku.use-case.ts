import { Inject, Injectable } from '@nestjs/common';
import { APPLICATION_LOGGER, type ApplicationLogger } from '@parisian-shopper/common';

import {
  ProductNotFoundError,
  ProductSourceResponseInvalidError,
} from '../domain/product-errors.js';
import { type GetProductBySkuInput, parseSku } from '../domain/product-input.js';
import {
  normalizedProductEnvelopeSchema,
  type NormalizedProductEnvelope,
} from '../domain/product.schema.js';
import { PRODUCT_METRICS, type ProductMetrics } from './product-metrics.port.js';
import { PRODUCT_SOURCE, type ProductSource } from './product-source.port.js';

@Injectable()
export class GetProductBySkuUseCase {
  public constructor(
    @Inject(PRODUCT_SOURCE) private readonly source: ProductSource,
    @Inject(PRODUCT_METRICS) private readonly metrics: ProductMetrics,
    @Inject(APPLICATION_LOGGER) private readonly logger: ApplicationLogger,
  ) {}

  public async execute(input: GetProductBySkuInput): Promise<NormalizedProductEnvelope> {
    const startedAt = performance.now();
    const sku = parseSku(input.sku);

    try {
      const result = await this.source.getBySku(sku);
      if (result === null) {
        this.record(startedAt, 'not_found');
        this.logger.log('Product source lookup returned no product', {
          operation: 'getBySku',
          sku,
          sourceAdapter: this.source.adapterName,
          durationMs: elapsed(startedAt),
        });
        throw new ProductNotFoundError(sku);
      }
      const parsed = normalizedProductEnvelopeSchema.safeParse(result);
      if (!parsed.success) {
        this.record(startedAt, 'invalid_response');
        this.logger.warn('Product source lookup returned invalid data', {
          operation: 'getBySku',
          sku,
          sourceAdapter: this.source.adapterName,
          durationMs: elapsed(startedAt),
        });
        throw new ProductSourceResponseInvalidError(parsed.error);
      }

      this.record(startedAt, 'success');
      this.logger.log('Product source lookup completed', {
        operation: 'getBySku',
        sku,
        sourceAdapter: this.source.adapterName,
        durationMs: elapsed(startedAt),
      });
      return parsed.data;
    } catch (error: unknown) {
      if (!(
        error instanceof ProductNotFoundError || error instanceof ProductSourceResponseInvalidError
      )) {
        this.record(startedAt, 'failure');
        this.logger.warn('Product source lookup failed', {
          operation: 'getBySku',
          sku,
          sourceAdapter: this.source.adapterName,
          durationMs: elapsed(startedAt),
        });
      }
      throw error;
    }
  }

  private record(
    startedAt: number,
    outcome: 'success' | 'not_found' | 'invalid_response' | 'failure',
  ): void {
    this.metrics.record({
      operation: 'getBySku',
      outcome,
      durationMs: elapsed(startedAt),
      sourceAdapter: this.source.adapterName,
    });
  }
}

function elapsed(startedAt: number): number {
  return Math.max(0, Math.round((performance.now() - startedAt) * 100) / 100);
}
