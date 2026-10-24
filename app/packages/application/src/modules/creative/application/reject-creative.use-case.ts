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
  CreativeJobNotFoundError,
  VisualAssetNotFoundError,
  CreativeJobNotReadyForApprovalError,
} from '../domain/creative-errors.js';

export interface RejectCreativeInput {
  readonly creativeJobId: string;
  readonly visualAssetId: string;
  readonly rejectedBy: string;
  readonly rejecterRoles: readonly string[];
  readonly comment?: string;
  readonly outboxWriter?: OutboxWriter;
}

export interface RejectCreativeResult {
  readonly approvalEvent: CreativeApprovalEventRecord;
}

@Injectable()
export class RejectCreativeUseCase {
  public constructor(
    @Inject(CREATIVE_JOB_REPOSITORY)
    private readonly jobRepo: CreativeJobRepository,
    @Inject(VISUAL_ASSET_REPOSITORY)
    private readonly assetRepo: VisualAssetRepository,
    @Inject(CREATIVE_APPROVAL_REPOSITORY)
    private readonly approvalRepo: CreativeApprovalRepository,
    @Inject(APPLICATION_LOGGER)
    private readonly logger: ApplicationLogger,
    @Optional()
    private readonly permissions: PermissionService = new PermissionService(),
  ) {}

  public async execute(input: RejectCreativeInput): Promise<RejectCreativeResult> {
    const { creativeJobId, visualAssetId, rejectedBy, comment } = input;

    // 0. Enforce authorization: require Permission.REJECT_CREATIVE
    if (!this.permissions.hasAnyRolePermission(input.rejecterRoles, Permission.REJECT_CREATIVE)) {
      throw new ForbiddenError({ publicMessage: 'Permission denied: Cannot reject creative.' });
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

    // 3. Record CreativeApprovalEvent with decision CREATIVE_REJECTED
    const approvalEvent = await this.approvalRepo.recordApproval({
      creativeJobId,
      visualAssetId,
      approverUserId: rejectedBy,
      decision: 'CREATIVE_REJECTED',
      ...(comment !== undefined ? { comment } : {}),
    });

    // 4. Transition CreativeJob status: READY_FOR_REVIEW -> CREATIVE_REJECTED
    await this.jobRepo.transitionStatus(creativeJobId, 'READY_FOR_REVIEW', 'CREATIVE_REJECTED');

    // 5. Emit Outbox event: CREATIVE_REJECTED
    if (input.outboxWriter) {
      await input.outboxWriter.append({
        topic: 'CREATIVE_REJECTED',
        schemaVersion: 1,
        idempotencyKey: `creative-job:${creativeJobId}:rejected`,
        aggregateType: 'CreativeJob',
        aggregateId: creativeJobId,
        payload: {
          creativeJobId,
          visualAssetId,
          approvalEventId: approvalEvent.id,
          rejectedByUserId: rejectedBy,
          ...(comment !== undefined ? { comment } : {}),
        },
        occurredAt: new Date(),
        availableAt: new Date(),
      });
    }

    this.logger.log(`Creative job ${creativeJobId} rejected by user ${rejectedBy}`);

    return { approvalEvent };
  }
}
