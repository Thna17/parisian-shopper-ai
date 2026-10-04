import { Global, Module } from '@nestjs/common';
import { PRODUCT_SNAPSHOT_REPOSITORY } from '@parisian-shopper/application';

import { DatabaseHealthIndicator } from './database-health.indicator.js';
import {
  PrismaTransactionManager,
  TRANSACTION_MANAGER,
} from './outbox/prisma-transaction.manager.js';
import { PrismaService } from './prisma.service.js';
import { PrismaProductSnapshotRepository } from './product-snapshot/prisma-product-snapshot.repository.js';

@Global()
@Module({
  providers: [
    PrismaService,
    DatabaseHealthIndicator,
    PrismaTransactionManager,
    PrismaProductSnapshotRepository,
    { provide: TRANSACTION_MANAGER, useExisting: PrismaTransactionManager },
    { provide: PRODUCT_SNAPSHOT_REPOSITORY, useExisting: PrismaProductSnapshotRepository },
  ],
  exports: [
    PrismaService,
    DatabaseHealthIndicator,
    PrismaTransactionManager,
    PrismaProductSnapshotRepository,
    TRANSACTION_MANAGER,
    PRODUCT_SNAPSHOT_REPOSITORY,
  ],
})
export class DatabaseModule {}
