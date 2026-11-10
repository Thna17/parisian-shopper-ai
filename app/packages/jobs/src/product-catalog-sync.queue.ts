import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { AppConfigService, FeatureFlag, FeatureFlagService } from '@parisian-shopper/config';
import {
  PRODUCT_CATALOG_SYNC_ENQUEUER,
  type ProductCatalogSyncEnqueuer,
  type ProductCatalogSyncJobInput,
} from '@parisian-shopper/application';
import { Queue } from 'bullmq';

import { createBullMqConnection } from './bullmq-connection.js';
import { ProductCatalogSyncJobName, QueueName } from './queue-names.js';
import { QueueRegistry } from './queue.registry.js';
import { ValkeyConnectionService } from './valkey-connection.service.js';

export {
  PRODUCT_CATALOG_SYNC_ENQUEUER,
  type ProductCatalogSyncEnqueuer,
  type ProductCatalogSyncJobInput,
};

@Injectable()
export class ProductCatalogSyncQueue implements OnModuleInit, ProductCatalogSyncEnqueuer {
  public constructor(
    private readonly valkey: ValkeyConnectionService,
    private readonly registry: QueueRegistry,
    private readonly config: AppConfigService,
    @Optional() private readonly flags?: Pick<FeatureFlagService, 'isEnabled'>,
  ) {}

  public async onModuleInit(): Promise<void> {
    if (this.flags !== undefined && !this.flags.isEnabled(FeatureFlag.PRODUCT_API)) {
      return;
    }

    const client = await this.valkey.createDedicatedClient('product-catalog-sync-queue');
    const queue = new Queue<ProductCatalogSyncJobInput>(QueueName.PRODUCT_CATALOG_SYNC, {
      connection: createBullMqConnection(client),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: { count: 1_000 },
        removeOnFail: { count: 5_000 },
      },
    });

    this.registry.register(QueueName.PRODUCT_CATALOG_SYNC, queue);
    await queue.waitUntilReady();

    // Register BullMQ recurring job on configurable cron schedule (default: every 6 hours)
    const cronSchedule = this.config.productApi?.syncCron ?? '0 */6 * * *';
    await queue.upsertJobScheduler(
      'product-catalog-sync-repeatable',
      { pattern: cronSchedule },
      {
        name: ProductCatalogSyncJobName.SYNC_CATALOG,
        data: { source: 'cron' },
      },
    );
  }

  public async enqueue(data?: ProductCatalogSyncJobInput): Promise<{ jobId: string }> {
    const queue = this.registry.get(QueueName.PRODUCT_CATALOG_SYNC);
    const jobId = `catalog-sync-${Date.now()}`;
    await queue.add(ProductCatalogSyncJobName.SYNC_CATALOG, data ?? { source: 'manual' }, {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2_000 },
    });
    return { jobId };
  }
}
