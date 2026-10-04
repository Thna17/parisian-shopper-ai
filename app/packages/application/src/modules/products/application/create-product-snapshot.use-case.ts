import { Inject, Injectable } from '@nestjs/common';
import { APPLICATION_LOGGER, type ApplicationLogger } from '@parisian-shopper/common';

import {
  normalizedProductEnvelopeSchema,
  type NormalizedProductEnvelope,
} from '../domain/product.schema.js';
import { InvalidProductDataError } from '../domain/product-errors.js';
import { PRODUCT_METRICS, type ProductMetrics } from './product-metrics.port.js';
import { calculateProductSnapshotHash } from './product-snapshot-hash.js';
import {
  PRODUCT_NORMALIZER_VERSION,
  PRODUCT_SNAPSHOT_REPOSITORY,
  type ProductSnapshot,
  type ProductSnapshotRepository,
} from './product-snapshot.repository.js';

@Injectable()
export class CreateProductSnapshotUseCase {
  public constructor(
    @Inject(PRODUCT_SNAPSHOT_REPOSITORY)
    private readonly snapshots: ProductSnapshotRepository,
    @Inject(PRODUCT_METRICS) private readonly metrics: ProductMetrics,
    @Inject(APPLICATION_LOGGER) private readonly logger: ApplicationLogger,
  ) {}

  public async execute(input: NormalizedProductEnvelope): Promise<ProductSnapshot> {
    const startedAt = performance.now();
    const parsed = normalizedProductEnvelopeSchema.safeParse(input);
    if (!parsed.success) {
      this.metrics.record({
        operation: 'createSnapshot',
        outcome: 'invalid_response',
        durationMs: Math.max(0, performance.now() - startedAt),
      });
      throw new InvalidProductDataError(parsed.error);
    }
    const product = parsed.data;
    const snapshot = await this.snapshots.create({
      product,
      snapshotHash: calculateProductSnapshotHash(product),
      normalizerVersion: PRODUCT_NORMALIZER_VERSION,
    });
    const durationMs = Math.max(0, Math.round((performance.now() - startedAt) * 100) / 100);
    this.metrics.record({ operation: 'createSnapshot', outcome: 'success', durationMs });
    this.logger.log('Immutable product snapshot created', {
      operation: 'createSnapshot',
      sku: product.product.sku,
      productSnapshotId: snapshot.id,
      snapshotHash: snapshot.snapshotHash,
      durationMs,
    });
    return snapshot;
  }
}
