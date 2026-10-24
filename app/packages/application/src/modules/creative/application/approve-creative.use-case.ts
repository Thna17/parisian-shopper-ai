import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  type ApplicationLogger,
  APPLICATION_LOGGER,
  type OutboxWriter,
  ForbiddenError,
} from '@parisian-shopper/common';
import { Permission, PermissionService } from '../../auth/domain/permissions.js';
import { CREATIVE_JOB_REPOSITORY, type CreativeJobRepository } from './creative-job.repository.js';
import { VISUAL_ASSET_REPOSITORY, type VisualAssetRepository } from './visual-asset.repository.js';
import {
  CREATIVE_APPROVAL_REPOSITORY,
  type CreativeApprovalRepository,
  type CreativeApprovalEventRecord,
} from './creative-approval.repository.js';
import {
  VISUAL_VALIDATION_REPOSITORY,
  type VisualValidationRepository,
} from './visual-validation.repository.js';
import {
  CreativeJobNotFoundError,
  VisualAssetNotFoundError,
  CreativeJobNotReadyForApprovalError,
  CreativeValidationFailedError,
} from '../domain/creative-errors.js';

export interface ApproveCreativeInput {
  readonly creativeJobId: string;
  readonly visualAssetId: string;
  readonly approvedBy: string;
  readonly approverRoles: readonly string[];
  readonly comment?: string;
  readonly outboxWriter?: OutboxWriter;
}

export interface ApproveCreativeResult {
  readonly approvalEvent: CreativeApprovalEventRecord;
}

@Injectable()
export class ApproveCreativeUseCase {
  public constructor(
    @Inject(CREATIVE_JOB_REPOSITORY)
    private readonly jobRepo: CreativeJobRepository,
    @Inject(VISUAL_ASSET_REPOSITORY)
    private readonly assetRepo: VisualAssetRepository,
    @Inject(CREATIVE_APPROVAL_REPOSITORY)
    private readonly approvalRepo: CreativeApprovalRepository,
    @Inject(VISUAL_VALIDATION_REPOSITORY)
    private readonly validationRepo: VisualValidationRepository,
    @Inject(APPLICATION_LOGGER)
    private readonly logger: ApplicationLogger,
    @Optional()
    private readonly permissions: PermissionService = new PermissionService(),
  ) {}

  public async execute(input: ApproveCreativeInput): Promise<ApproveCreativeResult> {
    const { creativeJobId, visualAssetId, approvedBy, comment } = input;

    // 0. Enforce authorization: require Permission.APPROVE_CREATIVE
    if (!this.permissions.hasAnyRolePermission(input.approverRoles, Permission.APPROVE_CREATIVE)) {
      throw new ForbiddenError({ publicMessage: 'Permission denied: Cannot approve creative.' });
    }

    // 1. Verify CreativeJob exists and is in reviewable state (READY_FOR_REVIEW)
    const job = await this.jobRepo.findById(creativeJobId);
    if (!job) {
      throw new CreativeJobNotFoundError(creativeJobId);
    }
    if (job.status !== 'READY_FOR_REVIEW') {
      throw new CreativeJobNotReadyForApprovalError(creativeJobId, job.status);
    }

    // 2. Verify VisualAsset exists and belongs to this job
    const asset = await this.assetRepo.findById(visualAssetId);
    if (!asset || asset.creativeJobId !== creativeJobId) {
      throw new VisualAssetNotFoundError(visualAssetId);
    }

    // 3. Invariant: Only valid assets with PASSED / PASSED_WITH_WARNINGS validation results can be transitioned to APPROVED
    const validationResult = await this.validationRepo.findLatestByAssetId(visualAssetId);
    if (
      !validationResult ||
      (validationResult.status !== 'PASSED' && validationResult.status !== 'PASSED_WITH_WARNINGS')
    ) {
      throw new CreativeValidationFailedError(visualAssetId, validationResult?.blockingCount ?? 1);
    }

    // 4. Record CreativeApprovalEvent
    const approvalEvent = await this.approvalRepo.recordApproval({
      creativeJobId,
      visualAssetId,
      approverUserId: approvedBy,
      decision: 'CREATIVE_APPROVED',
      ...(comment !== undefined ? { comment } : {}),
      visualValidationResultId: validationResult.id,
    });

    // 5. Transition CreativeJob status: READY_FOR_REVIEW -> CREATIVE_APPROVED
    await this.jobRepo.transitionStatus(creativeJobId, 'READY_FOR_REVIEW', 'CREATIVE_APPROVED');

    // 6. Emit Outbox event: CREATIVE_APPROVED
    if (input.outboxWriter) {
      await input.outboxWriter.append({
        topic: 'CREATIVE_APPROVED',
        schemaVersion: 1,
        idempotencyKey: `creative-job:${creativeJobId}:approved`,
        aggregateType: 'CreativeJob',
        aggregateId: creativeJobId,
        payload: {
          creativeJobId,
          visualAssetId,
          approvalEventId: approvalEvent.id,
          approverUserId: approvedBy,
        },
        occurredAt: new Date(),
        availableAt: new Date(),
      });
    }

    this.logger.log(`Creative job ${creativeJobId} approved by user ${approvedBy}`);

    return { approvalEvent };
  }
}
