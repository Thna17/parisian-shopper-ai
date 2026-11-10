/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, jest } from '@jest/globals';
import {
  type SyncMekhlaCatalogUseCase,
  type SyncMekhlaCatalogResult,
} from '@parisian-shopper/application';
import { type ApplicationLogger } from '@parisian-shopper/common';
import { type Job, UnrecoverableError } from 'bullmq';

import {
  type ProductCatalogSyncJobInput,
  ProductCatalogSyncQueue,
} from '../product-catalog-sync.queue.js';
import { ProductCatalogSyncWorker } from '../product-catalog-sync.worker.js';
import { ProductCatalogSyncJobName, QueueName } from '../queue-names.js';
import { type ValkeyConnectionService } from '../valkey-connection.service.js';
import { type WorkerRegistry } from '../worker.registry.js';
import { type QueueRegistry } from '../queue.registry.js';
import { type AppConfigService } from '@parisian-shopper/config';

describe('ProductCatalogSyncWorker & Queue', () => {
  const mockSyncResult: SyncMekhlaCatalogResult = {
    status: 'COMPLETED',
    synced: 5,
    skipped: 10,
    totalDiscovered: 15,
    cutoutsProcessed: 3,
    durationMs: 250,
    syncedSkus: ['SKU-1', 'SKU-2'],
    skippedSkus: ['SKU-3'],
    errors: [],
  };

  const mockLogger: ApplicationLogger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  const mockValkey = {
    createDedicatedClient: jest.fn<ValkeyConnectionService['createDedicatedClient']>(),
  } as unknown as ValkeyConnectionService;

  const mockWorkerRegistry = {
    register: jest.fn<WorkerRegistry['register']>(),
  } as unknown as WorkerRegistry;

  const mockQueueRegistry = {
    register: jest.fn<QueueRegistry['register']>(),
    get: jest.fn<QueueRegistry['get']>(),
  } as unknown as QueueRegistry;

  it('processes SYNC_CATALOG job successfully and triggers catalog synchronization', async () => {
    const mockSyncUseCase = {
      execute: jest.fn<SyncMekhlaCatalogUseCase['execute']>().mockResolvedValue(mockSyncResult),
    } as unknown as SyncMekhlaCatalogUseCase;

    const worker = new ProductCatalogSyncWorker(
      mockValkey,
      mockWorkerRegistry,
      mockSyncUseCase,
      mockLogger,
    );

    const mockJob = {
      id: 'job-catalog-sync-1',
      name: ProductCatalogSyncJobName.SYNC_CATALOG,
      data: {
        source: 'cron',
        force: false,
        maxPages: 5,
      },
      attemptsMade: 1,
    } as unknown as Job<ProductCatalogSyncJobInput>;

    await worker.process(mockJob);

    expect(mockSyncUseCase.execute).toHaveBeenCalledWith({
      source: 'cron',
      force: false,
      maxPages: 5,
      limit: undefined,
      skus: undefined,
    });
    expect(mockLogger.log).toHaveBeenCalledWith(
      'Product catalog synchronization worker started',
      expect.objectContaining({ jobId: 'job-catalog-sync-1' }),
    );
  });

  it('throws UnrecoverableError for unsupported job names', async () => {
    const mockSyncUseCase = {
      execute: jest.fn<SyncMekhlaCatalogUseCase['execute']>(),
    } as unknown as SyncMekhlaCatalogUseCase;

    const worker = new ProductCatalogSyncWorker(
      mockValkey,
      mockWorkerRegistry,
      mockSyncUseCase,
      mockLogger,
    );

    const invalidJob = {
      id: 'job-invalid-1',
      name: 'UNKNOWN_JOB_NAME',
      data: {},
      attemptsMade: 1,
    } as unknown as Job<ProductCatalogSyncJobInput>;

    await expect(worker.process(invalidJob)).rejects.toThrow(UnrecoverableError);
    expect(mockSyncUseCase.execute).not.toHaveBeenCalled();
  });

  it('enqueues on-demand synchronization job on the product-catalog-sync queue', async () => {
    const mockBullQueue = {
      add: jest
        .fn<(...args: readonly unknown[]) => Promise<{ id: string }>>()
        .mockResolvedValue({ id: 'queued-job-1' }),
    };
    (mockQueueRegistry.get as jest.Mock).mockReturnValue(mockBullQueue);

    const mockConfig = {
      productApi: {
        syncCron: '0 */6 * * *',
      },
    } as unknown as AppConfigService;

    const queue = new ProductCatalogSyncQueue(mockValkey, mockQueueRegistry, mockConfig);

    const result = await queue.enqueue({
      source: 'manual',
      force: true,
      skus: ['FIC-PERF-001'],
    });

    expect(result.jobId).toMatch(/^catalog-sync-\d+$/);
    expect(mockQueueRegistry.get).toHaveBeenCalledWith(QueueName.PRODUCT_CATALOG_SYNC);
    expect(mockBullQueue.add).toHaveBeenCalledWith(
      ProductCatalogSyncJobName.SYNC_CATALOG,
      { source: 'manual', force: true, skus: ['FIC-PERF-001'] },
      expect.objectContaining({ attempts: 3 }),
    );
  });
});
