import { Global, Module } from '@nestjs/common';
import {
  CONTENT_GENERATION_ENQUEUER,
  CREATIVE_GENERATION_ENQUEUER,
  PRODUCT_CATALOG_SYNC_ENQUEUER,
  CompositorMetricsTracker,
} from '@parisian-shopper/application';

import { QueueRegistry } from './queue.registry.js';
import { ValkeyConnectionService } from './valkey-connection.service.js';
import { WorkerRegistry } from './worker.registry.js';
import { ContentGenerationQueue } from './content-generation.queue.js';
import {
  CREATIVE_GENERATION_ENQUEUER as _CREATIVE_ENQUEUER,
  CreativeGenerationQueue,
} from './creative-generation.queue.js';
import {
  PRODUCT_CATALOG_SYNC_ENQUEUER as _CATALOG_ENQUEUER,
  ProductCatalogSyncQueue,
} from './product-catalog-sync.queue.js';
import { AIMetricsTracker } from './metrics/ai-metrics.tracker.js';
import { PrometheusMetricsService } from './metrics/prometheus-metrics.service.js';

@Global()
@Module({
  providers: [
    ValkeyConnectionService,
    QueueRegistry,
    WorkerRegistry,
    ContentGenerationQueue,
    CreativeGenerationQueue,
    ProductCatalogSyncQueue,
    AIMetricsTracker,
    CompositorMetricsTracker,
    PrometheusMetricsService,
    { provide: CONTENT_GENERATION_ENQUEUER, useExisting: ContentGenerationQueue },
    { provide: CREATIVE_GENERATION_ENQUEUER, useExisting: CreativeGenerationQueue },
    { provide: PRODUCT_CATALOG_SYNC_ENQUEUER, useExisting: ProductCatalogSyncQueue },
  ],
  exports: [
    ValkeyConnectionService,
    QueueRegistry,
    WorkerRegistry,
    ContentGenerationQueue,
    CreativeGenerationQueue,
    ProductCatalogSyncQueue,
    AIMetricsTracker,
    CompositorMetricsTracker,
    PrometheusMetricsService,
    CONTENT_GENERATION_ENQUEUER,
    CREATIVE_GENERATION_ENQUEUER,
    PRODUCT_CATALOG_SYNC_ENQUEUER,
  ],
})
export class JobsModule {}
