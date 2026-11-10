export const PRODUCT_CATALOG_SYNC_ENQUEUER = Symbol('PRODUCT_CATALOG_SYNC_ENQUEUER');

export interface ProductCatalogSyncJobInput {
  readonly requestedBy?: string | undefined;
  readonly force?: boolean | undefined;
  readonly skus?: readonly string[] | undefined;
  readonly maxPages?: number | undefined;
  readonly limit?: number | undefined;
  readonly source?: 'cron' | 'manual' | 'webhook' | undefined;
}

export interface ProductCatalogSyncEnqueuer {
  enqueue(data?: ProductCatalogSyncJobInput): Promise<{ jobId: string }>;
}
