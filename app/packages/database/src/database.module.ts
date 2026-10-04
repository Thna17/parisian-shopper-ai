import { Global, Module } from '@nestjs/common';

import { DatabaseHealthIndicator } from './database-health.indicator.js';
import {
  PrismaTransactionManager,
  TRANSACTION_MANAGER,
} from './outbox/prisma-transaction.manager.js';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  providers: [
    PrismaService,
    DatabaseHealthIndicator,
    PrismaTransactionManager,
    { provide: TRANSACTION_MANAGER, useExisting: PrismaTransactionManager },
  ],
  exports: [PrismaService, DatabaseHealthIndicator, PrismaTransactionManager, TRANSACTION_MANAGER],
})
export class DatabaseModule {}
