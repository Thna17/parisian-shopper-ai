import { Global, Module } from '@nestjs/common';
import {
  BRAND_RULE_REPOSITORY,
  CONTENT_GENERATION_REPOSITORY,
  PRODUCT_SNAPSHOT_REPOSITORY,
  VALIDATION_REPOSITORY,
} from '@parisian-shopper/application';

import { DatabaseHealthIndicator } from './database-health.indicator.js';
import {
  PrismaTransactionManager,
  TRANSACTION_MANAGER,
} from './outbox/prisma-transaction.manager.js';
import { PrismaService } from './prisma.service.js';
import { PrismaBrandRuleRepository } from './brand/prisma-brand-rule.repository.js';
import { PrismaContentGenerationRepository } from './content/prisma-content-generation.repository.js';
import { PrismaProductSnapshotRepository } from './product-snapshot/prisma-product-snapshot.repository.js';
import { PrismaValidationRepository } from './validation/prisma-validation.repository.js';

@Global()
@Module({
  providers: [
    PrismaService,
    DatabaseHealthIndicator,
    PrismaTransactionManager,
    PrismaProductSnapshotRepository,
    PrismaBrandRuleRepository,
    PrismaContentGenerationRepository,
    PrismaValidationRepository,
    { provide: TRANSACTION_MANAGER, useExisting: PrismaTransactionManager },
    { provide: PRODUCT_SNAPSHOT_REPOSITORY, useExisting: PrismaProductSnapshotRepository },
    { provide: BRAND_RULE_REPOSITORY, useExisting: PrismaBrandRuleRepository },
    { provide: CONTENT_GENERATION_REPOSITORY, useExisting: PrismaContentGenerationRepository },
    { provide: VALIDATION_REPOSITORY, useExisting: PrismaValidationRepository },
  ],
  exports: [
    PrismaService,
    DatabaseHealthIndicator,
    PrismaTransactionManager,
    PrismaProductSnapshotRepository,
    PrismaBrandRuleRepository,
    PrismaContentGenerationRepository,
    PrismaValidationRepository,
    TRANSACTION_MANAGER,
    PRODUCT_SNAPSHOT_REPOSITORY,
    BRAND_RULE_REPOSITORY,
    CONTENT_GENERATION_REPOSITORY,
    VALIDATION_REPOSITORY,
  ],
})
export class DatabaseModule {}
