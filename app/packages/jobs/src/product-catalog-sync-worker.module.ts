import { Module } from '@nestjs/common';
import { ApplicationModule } from '@parisian-shopper/application';

import { JobsModule } from './jobs.module.js';
import { ProductCatalogSyncWorker } from './product-catalog-sync.worker.js';

@Module({
  imports: [ApplicationModule, JobsModule],
  providers: [ProductCatalogSyncWorker],
  exports: [ProductCatalogSyncWorker],
})
export class ProductCatalogSyncWorkerModule {}
