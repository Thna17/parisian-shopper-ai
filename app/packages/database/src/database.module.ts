import { Global, Module } from '@nestjs/common';
import {
  APPROVALS_REPOSITORY,
  BRAND_RULE_REPOSITORY,
  CONTENT_GENERATION_REPOSITORY,
  CREATIVE_APPROVAL_REPOSITORY,
  CREATIVE_JOB_REPOSITORY,
  CREATIVE_REVISION_REPOSITORY,
  PRODUCT_SNAPSHOT_REPOSITORY,
  TELEGRAM_WORKFLOW_REPOSITORY,
  VALIDATION_REPOSITORY,
  VISUAL_ASSET_REPOSITORY,
  VISUAL_VALIDATION_REPOSITORY,
  OUTBOX_RELAY_REPOSITORY,
} from '@parisian-shopper/application';

import { DatabaseHealthIndicator } from './database-health.indicator.js';
import {
  PrismaTransactionManager,
  TRANSACTION_MANAGER,
} from './outbox/prisma-transaction.manager.js';
import { PrismaOutboxRelayRepository } from './outbox/prisma-outbox-relay.repository.js';
import { PrismaService } from './prisma.service.js';
import { PrismaBrandRuleRepository } from './brand/prisma-brand-rule.repository.js';
import { PrismaContentGenerationRepository } from './content/prisma-content-generation.repository.js';
import { PrismaProductSnapshotRepository } from './product-snapshot/prisma-product-snapshot.repository.js';
import { PrismaValidationRepository } from './validation/prisma-validation.repository.js';
import { PrismaTelegramWorkflowRepository } from './telegram/prisma-telegram-workflow.repository.js';
import { PrismaApprovalsRepository } from './approvals/prisma-approvals.repository.js';
import {
  PrismaCreativeApprovalRepository,
  PrismaCreativeJobRepository,
  PrismaCreativeRevisionRepository,
  PrismaVisualAssetRepository,
  PrismaVisualValidationRepository,
} from './creative/index.js';

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
    PrismaTelegramWorkflowRepository,
    PrismaApprovalsRepository,
    PrismaCreativeJobRepository,
    PrismaVisualAssetRepository,
    PrismaVisualValidationRepository,
    PrismaCreativeRevisionRepository,
    PrismaCreativeApprovalRepository,
    PrismaOutboxRelayRepository,
    { provide: TRANSACTION_MANAGER, useExisting: PrismaTransactionManager },
    { provide: PRODUCT_SNAPSHOT_REPOSITORY, useExisting: PrismaProductSnapshotRepository },
    { provide: BRAND_RULE_REPOSITORY, useExisting: PrismaBrandRuleRepository },
    { provide: CONTENT_GENERATION_REPOSITORY, useExisting: PrismaContentGenerationRepository },
    { provide: VALIDATION_REPOSITORY, useExisting: PrismaValidationRepository },
    { provide: TELEGRAM_WORKFLOW_REPOSITORY, useExisting: PrismaTelegramWorkflowRepository },
    { provide: APPROVALS_REPOSITORY, useExisting: PrismaApprovalsRepository },
    { provide: CREATIVE_JOB_REPOSITORY, useExisting: PrismaCreativeJobRepository },
    { provide: VISUAL_ASSET_REPOSITORY, useExisting: PrismaVisualAssetRepository },
    { provide: VISUAL_VALIDATION_REPOSITORY, useExisting: PrismaVisualValidationRepository },
    { provide: CREATIVE_REVISION_REPOSITORY, useExisting: PrismaCreativeRevisionRepository },
    { provide: CREATIVE_APPROVAL_REPOSITORY, useExisting: PrismaCreativeApprovalRepository },
    { provide: OUTBOX_RELAY_REPOSITORY, useExisting: PrismaOutboxRelayRepository },
  ],
  exports: [
    PrismaService,
    DatabaseHealthIndicator,
    PrismaTransactionManager,
    PrismaProductSnapshotRepository,
    PrismaBrandRuleRepository,
    PrismaContentGenerationRepository,
    PrismaValidationRepository,
    PrismaTelegramWorkflowRepository,
    PrismaApprovalsRepository,
    PrismaCreativeJobRepository,
    PrismaVisualAssetRepository,
    PrismaVisualValidationRepository,
    PrismaCreativeRevisionRepository,
    PrismaCreativeApprovalRepository,
    PrismaOutboxRelayRepository,
    TRANSACTION_MANAGER,
    PRODUCT_SNAPSHOT_REPOSITORY,
    BRAND_RULE_REPOSITORY,
    CONTENT_GENERATION_REPOSITORY,
    VALIDATION_REPOSITORY,
    TELEGRAM_WORKFLOW_REPOSITORY,
    APPROVALS_REPOSITORY,
    CREATIVE_JOB_REPOSITORY,
    VISUAL_ASSET_REPOSITORY,
    VISUAL_VALIDATION_REPOSITORY,
    CREATIVE_REVISION_REPOSITORY,
    CREATIVE_APPROVAL_REPOSITORY,
    OUTBOX_RELAY_REPOSITORY,
  ],
})
export class DatabaseModule {}
