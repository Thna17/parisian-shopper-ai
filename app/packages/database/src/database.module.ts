import { Global, Module } from '@nestjs/common';
import {
  APPROVALS_REPOSITORY,
  BRAND_RULE_REPOSITORY,
  CAMPAIGN_REPOSITORY,
  CONTENT_GENERATION_REPOSITORY,
  CREATIVE_APPROVAL_REPOSITORY,
  CREATIVE_EXPORT_REPOSITORY,
  CREATIVE_JOB_REPOSITORY,
  CREATIVE_REVISION_REPOSITORY,
  CREATIVE_SCENE_REPOSITORY,
  FRESHNESS_POLICY_REPOSITORY,
  OUTBOX_RELAY_REPOSITORY,
  PASSWORD_CREDENTIAL_REPOSITORY,
  PRODUCT_ASSET_REGISTRATION_UNIT_OF_WORK,
  PRODUCT_ASSET_REPOSITORY,
  PRODUCT_FRESHNESS_ASSESSMENT_REPOSITORY,
  PRODUCT_REVALIDATION_UNIT_OF_WORK,
  PRODUCT_SNAPSHOT_REPOSITORY,
  PUBLISHING_REPOSITORY,
  TELEGRAM_WORKFLOW_REPOSITORY,
  USER_ACCOUNT_REPOSITORY,
  USER_SESSION_REPOSITORY,
  VALIDATION_REPOSITORY,
  VISUAL_ASSET_REPOSITORY,
  VISUAL_VALIDATION_REPOSITORY,
} from '@parisian-shopper/application';

import { DatabaseHealthIndicator } from './database-health.indicator.js';
import {
  PrismaStandaloneOutboxWriter,
  PrismaTransactionManager,
  TRANSACTION_MANAGER,
} from './outbox/prisma-transaction.manager.js';
import { PrismaOutboxRelayRepository } from './outbox/prisma-outbox-relay.repository.js';
import { PrismaService } from './prisma.service.js';
import { PrismaBrandRuleRepository } from './brand/prisma-brand-rule.repository.js';
import { PrismaContentGenerationRepository } from './content/prisma-content-generation.repository.js';
import { PrismaFreshnessPolicyRepository } from './product-snapshot/prisma-freshness-policy.repository.js';
import { PrismaProductFreshnessAssessmentRepository } from './product-snapshot/prisma-product-freshness-assessment.repository.js';
import { PrismaProductRevalidationUnitOfWork } from './product-snapshot/prisma-product-revalidation.unit-of-work.js';
import { PrismaProductSnapshotRepository } from './product-snapshot/prisma-product-snapshot.repository.js';
import { PrismaProductAssetRepository } from './product-asset/prisma-product-asset.repository.js';
import { PrismaProductAssetRegistrationUnitOfWork } from './product-asset/prisma-product-asset-registration.unit-of-work.js';
import { PrismaValidationRepository } from './validation/prisma-validation.repository.js';
import { PrismaTelegramWorkflowRepository } from './telegram/prisma-telegram-workflow.repository.js';
import { PrismaApprovalsRepository } from './approvals/prisma-approvals.repository.js';
import { PrismaPasswordCredentialRepository } from './auth/prisma-password-credential.repository.js';
import { PrismaUserSessionRepository } from './auth/prisma-user-session.repository.js';
import { PrismaUserAccountRepository } from './auth/prisma-user-account.repository.js';
import { PrismaCampaignRepository } from './campaigns/prisma-campaign.repository.js';
import { PrismaPublishingRepository } from './publishing/prisma-publishing.repository.js';
import {
  PrismaCreativeApprovalRepository,
  PrismaCreativeExportRepository,
  PrismaCreativeJobRepository,
  PrismaCreativeRevisionRepository,
  PrismaCreativeSceneRepository,
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
    PrismaPasswordCredentialRepository,
    PrismaUserSessionRepository,
    PrismaUserAccountRepository,
    PrismaCampaignRepository,
    PrismaPublishingRepository,
    PrismaCreativeJobRepository,
    PrismaVisualAssetRepository,
    PrismaVisualValidationRepository,
    PrismaCreativeRevisionRepository,
    PrismaCreativeApprovalRepository,
    PrismaCreativeExportRepository,
    PrismaCreativeSceneRepository,
    PrismaOutboxRelayRepository,
    PrismaProductFreshnessAssessmentRepository,
    PrismaFreshnessPolicyRepository,
    PrismaProductRevalidationUnitOfWork,
    PrismaProductAssetRepository,
    PrismaProductAssetRegistrationUnitOfWork,
    {
      provide: PrismaStandaloneOutboxWriter,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): PrismaStandaloneOutboxWriter =>
        new PrismaStandaloneOutboxWriter(prisma),
    },

    { provide: TRANSACTION_MANAGER, useExisting: PrismaTransactionManager },
    { provide: 'OUTBOX_WRITER', useExisting: PrismaStandaloneOutboxWriter },
    { provide: PRODUCT_SNAPSHOT_REPOSITORY, useExisting: PrismaProductSnapshotRepository },
    { provide: PRODUCT_ASSET_REPOSITORY, useExisting: PrismaProductAssetRepository },
    {
      provide: PRODUCT_ASSET_REGISTRATION_UNIT_OF_WORK,
      useExisting: PrismaProductAssetRegistrationUnitOfWork,
    },
    {
      provide: PRODUCT_FRESHNESS_ASSESSMENT_REPOSITORY,
      useExisting: PrismaProductFreshnessAssessmentRepository,
    },
    { provide: FRESHNESS_POLICY_REPOSITORY, useExisting: PrismaFreshnessPolicyRepository },
    {
      provide: PRODUCT_REVALIDATION_UNIT_OF_WORK,
      useExisting: PrismaProductRevalidationUnitOfWork,
    },
    { provide: BRAND_RULE_REPOSITORY, useExisting: PrismaBrandRuleRepository },
    { provide: CONTENT_GENERATION_REPOSITORY, useExisting: PrismaContentGenerationRepository },
    { provide: VALIDATION_REPOSITORY, useExisting: PrismaValidationRepository },
    { provide: TELEGRAM_WORKFLOW_REPOSITORY, useExisting: PrismaTelegramWorkflowRepository },
    { provide: APPROVALS_REPOSITORY, useExisting: PrismaApprovalsRepository },
    { provide: PASSWORD_CREDENTIAL_REPOSITORY, useExisting: PrismaPasswordCredentialRepository },
    { provide: USER_SESSION_REPOSITORY, useExisting: PrismaUserSessionRepository },
    { provide: USER_ACCOUNT_REPOSITORY, useExisting: PrismaUserAccountRepository },
    { provide: CAMPAIGN_REPOSITORY, useExisting: PrismaCampaignRepository },
    { provide: PUBLISHING_REPOSITORY, useExisting: PrismaPublishingRepository },
    { provide: CREATIVE_JOB_REPOSITORY, useExisting: PrismaCreativeJobRepository },
    { provide: VISUAL_ASSET_REPOSITORY, useExisting: PrismaVisualAssetRepository },
    { provide: VISUAL_VALIDATION_REPOSITORY, useExisting: PrismaVisualValidationRepository },
    { provide: CREATIVE_REVISION_REPOSITORY, useExisting: PrismaCreativeRevisionRepository },
    { provide: CREATIVE_APPROVAL_REPOSITORY, useExisting: PrismaCreativeApprovalRepository },
    { provide: CREATIVE_EXPORT_REPOSITORY, useExisting: PrismaCreativeExportRepository },
    { provide: CREATIVE_SCENE_REPOSITORY, useExisting: PrismaCreativeSceneRepository },
    { provide: OUTBOX_RELAY_REPOSITORY, useExisting: PrismaOutboxRelayRepository },
  ],
  exports: [
    PrismaService,
    DatabaseHealthIndicator,
    PrismaTransactionManager,
    PrismaStandaloneOutboxWriter,
    PrismaProductSnapshotRepository,
    PrismaProductAssetRepository,
    PrismaProductAssetRegistrationUnitOfWork,
    PrismaProductFreshnessAssessmentRepository,
    PrismaFreshnessPolicyRepository,
    PrismaProductRevalidationUnitOfWork,
    PrismaBrandRuleRepository,
    PrismaContentGenerationRepository,
    PrismaValidationRepository,
    PrismaTelegramWorkflowRepository,
    PrismaApprovalsRepository,
    PrismaPasswordCredentialRepository,
    PrismaUserSessionRepository,
    PrismaUserAccountRepository,
    PrismaCampaignRepository,
    PrismaPublishingRepository,
    PrismaCreativeJobRepository,
    PrismaVisualAssetRepository,
    PrismaVisualValidationRepository,
    PrismaCreativeRevisionRepository,
    PrismaCreativeApprovalRepository,
    PrismaCreativeExportRepository,
    PrismaCreativeSceneRepository,
    PrismaOutboxRelayRepository,
    TRANSACTION_MANAGER,
    'OUTBOX_WRITER',
    PRODUCT_SNAPSHOT_REPOSITORY,
    PRODUCT_ASSET_REPOSITORY,
    PRODUCT_ASSET_REGISTRATION_UNIT_OF_WORK,
    PRODUCT_FRESHNESS_ASSESSMENT_REPOSITORY,
    FRESHNESS_POLICY_REPOSITORY,
    PRODUCT_REVALIDATION_UNIT_OF_WORK,
    BRAND_RULE_REPOSITORY,
    CONTENT_GENERATION_REPOSITORY,
    VALIDATION_REPOSITORY,
    TELEGRAM_WORKFLOW_REPOSITORY,
    APPROVALS_REPOSITORY,
    PASSWORD_CREDENTIAL_REPOSITORY,
    USER_SESSION_REPOSITORY,
    USER_ACCOUNT_REPOSITORY,
    CAMPAIGN_REPOSITORY,
    PUBLISHING_REPOSITORY,
    CREATIVE_JOB_REPOSITORY,
    VISUAL_ASSET_REPOSITORY,
    VISUAL_VALIDATION_REPOSITORY,
    CREATIVE_REVISION_REPOSITORY,
    CREATIVE_APPROVAL_REPOSITORY,
    CREATIVE_EXPORT_REPOSITORY,
    CREATIVE_SCENE_REPOSITORY,
    OUTBOX_RELAY_REPOSITORY,
  ],
})
export class DatabaseModule {}
