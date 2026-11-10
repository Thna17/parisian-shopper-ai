import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { SyncMekhlaCatalogUseCase } from '@parisian-shopper/application';
import { APPLICATION_LOGGER, type ApplicationLogger } from '@parisian-shopper/common';
import { type Job, UnrecoverableError, Worker } from 'bullmq';

import { createBullMqConnection } from './bullmq-connection.js';
import { type ProductCatalogSyncJobInput } from './product-catalog-sync.queue.js';
import { ProductCatalogSyncJobName, QueueName } from './queue-names.js';
import { ValkeyConnectionService } from './valkey-connection.service.js';
import { WorkerRegistry } from './worker.registry.js';

@Injectable()
export class ProductCatalogSyncWorker implements OnModuleInit {
  public constructor(
    private readonly valkey: ValkeyConnectionService,
    private readonly registry: WorkerRegistry,
    private readonly syncUseCase: SyncMekhlaCatalogUseCase,
    @Inject(APPLICATION_LOGGER)
    private readonly logger: ApplicationLogger,
  ) {}

  public async onModuleInit(): Promise<void> {
    const client = await this.valkey.createDedicatedClient('product-catalog-sync-worker');
    const worker = new Worker<ProductCatalogSyncJobInput, void>(
      QueueName.PRODUCT_CATALOG_SYNC,
      (job) => this.process(job),
      {
        connection: createBullMqConnection(client),
        concurrency: 1, // Single worker concurrency for sequential catalog sync integrity
        lockDuration: 120_000, // 2 minutes lock duration for deep catalog sweeps
      },
    );

    this.registry.register(QueueName.PRODUCT_CATALOG_SYNC, worker);
    await worker.waitUntilReady();
  }

  public async process(job: Job<ProductCatalogSyncJobInput>): Promise<void> {
    if (job.name !== ProductCatalogSyncJobName.SYNC_CATALOG) {
      throw new UnrecoverableError(`Unsupported product-catalog-sync job name: ${job.name}`);
    }

    const startedAt = new Date();
    this.logger.log('Product catalog synchronization worker started', {
      jobId: job.id,
      attempt: job.attemptsMade,
      source: job.data?.source ?? 'unknown',
      force: job.data?.force ?? false,
      startedAt: startedAt.toISOString(),
    });

    try {
      const result = await this.syncUseCase.execute({
        force: job.data?.force,
        skus: job.data?.skus,
        maxPages: job.data?.maxPages,
        limit: job.data?.limit,
        source: job.data?.source,
      });

      this.logger.log('Product catalog synchronization worker completed successfully', {
        jobId: job.id,
        synced: result.synced,
        skipped: result.skipped,
        cutoutsProcessed: result.cutoutsProcessed,
        totalDiscovered: result.totalDiscovered,
        durationMs: result.durationMs,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Product catalog synchronization worker job failed: ${errorMsg}`, {
        jobId: job.id,
        error: errorMsg,
      });
      throw error;
    }
  }
}
