import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  type ApplicationLogger,
  APPLICATION_LOGGER,
  type OutboxWriter,
  ForbiddenError,
  ValidationError,
} from '@parisian-shopper/common';
import { Permission, PermissionService } from '../../auth/domain/permissions.js';
import { CREATIVE_JOB_REPOSITORY, type CreativeJobRepository } from './creative-job.repository.js';
import {
  VISUAL_ASSET_REPOSITORY,
  type VisualAssetRepository,
  type VisualAssetRecord,
} from './visual-asset.repository.js';
import {
  CREATIVE_APPROVAL_REPOSITORY,
  type CreativeApprovalRepository,
  type CreativeApprovalEventRecord,
} from './creative-approval.repository.js';
import {
  CREATIVE_SCENE_REPOSITORY,
  type CreativeSceneRepository,
} from './creative-scene.repository.js';
import {
  CreativeJobNotFoundError,
  VisualAssetNotFoundError,
  CreativeJobNotReadyForApprovalError,
  CreativeAlreadyApprovedError,
  CreativeAlreadyRejectedError,
} from '../domain/creative-errors.js';
import { type CreativeSceneVersionRecord } from '../domain/scene/creative-scene.types.js';

export interface RejectCreativeInput {
  readonly creativeJobId: string;
  readonly visualAssetId?: string | undefined;
  readonly sceneVersionId?: string | undefined;
  readonly rejectedBy: string;
  readonly rejecterRoles: readonly string[];
  readonly comment?: string | undefined;
  readonly outboxWriter?: OutboxWriter | undefined;
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
    @Optional()
    @Inject(CREATIVE_SCENE_REPOSITORY)
    private readonly sceneRepo?: CreativeSceneRepository,
  ) {}

  public async execute(input: RejectCreativeInput): Promise<RejectCreativeResult> {
    const { creativeJobId, rejectedBy, comment } = input;

    // 0. Enforce authorization: require Permission.REJECT_CREATIVE
    if (!this.permissions.hasAnyRolePermission(input.rejecterRoles, Permission.REJECT_CREATIVE)) {
      throw new ForbiddenError({ publicMessage: 'Permission denied: Cannot reject creative.' });
    }

    // 1. Verify CreativeJob exists and is in reviewable state (READY_FOR_REVIEW)
    const job = await this.jobRepo.findById(creativeJobId);
    if (!job) {
      throw new CreativeJobNotFoundError(creativeJobId);
    }

    const approvals: readonly CreativeApprovalEventRecord[] =
      (await this.approvalRepo.findByJobId(creativeJobId)) ?? [];
    if (Array.isArray(approvals)) {
      if (approvals.some((a: CreativeApprovalEventRecord) => a.decision === 'CREATIVE_REJECTED')) {
        throw new CreativeAlreadyRejectedError('Creative has already been rejected.');
      }
      if (approvals.some((a: CreativeApprovalEventRecord) => a.decision === 'CREATIVE_APPROVED')) {
        throw new CreativeAlreadyApprovedError('Creative has already been approved.');
      }
    }

    if (job.status !== 'READY_FOR_REVIEW') {
      throw new CreativeJobNotReadyForApprovalError(creativeJobId, job.status);
    }

    // 2. Resolve Scene & SceneVersion (if scene repository is wired)
    let sceneVersion: CreativeSceneVersionRecord | null = null;
    if (this.sceneRepo) {
      const scene = await this.sceneRepo.findByJobId(creativeJobId);
      if (scene) {
        if (input.sceneVersionId) {
          sceneVersion = await this.sceneRepo.findVersionById(input.sceneVersionId);
          if (!sceneVersion || sceneVersion.sceneId !== scene.id) {
            throw new ValidationError({
              publicMessage: `Target scene version does not belong to creative job ${creativeJobId}.`,
            });
          }
        } else {
          sceneVersion = await this.sceneRepo.findLatestVersionBySceneId(scene.id);
        }
      }
    }

    // 3. Resolve VisualAsset
    let asset: VisualAssetRecord;
    if (input.visualAssetId) {
      const foundAsset = await this.assetRepo.findById(input.visualAssetId);
      if (!foundAsset || foundAsset.creativeJobId !== creativeJobId) {
        throw new VisualAssetNotFoundError(input.visualAssetId);
      }
      asset = foundAsset;
    } else {
      const latestAsset = await this.assetRepo.findLatestByJobId(creativeJobId);
      if (!latestAsset) {
        throw new VisualAssetNotFoundError(creativeJobId);
      }
      asset = latestAsset;
    }

    // 4. Record CreativeApprovalEvent with decision CREATIVE_REJECTED
    const effectiveComment =
      comment && comment.trim().length > 0 ? comment.trim() : 'Rejected by reviewer';
    const approvalEvent = await this.approvalRepo.recordApproval({
      creativeJobId,
      visualAssetId: asset.id,
      ...(sceneVersion ? { sceneVersionId: sceneVersion.id } : {}),
      approverUserId: rejectedBy,
      decision: 'CREATIVE_REJECTED',
      comment: effectiveComment,
    });

    // 5. Transition CreativeJob status: READY_FOR_REVIEW -> CREATIVE_REJECTED
    await this.jobRepo.transitionStatus(creativeJobId, 'READY_FOR_REVIEW', 'CREATIVE_REJECTED');

    // 5b. Transition SceneVersionState to REJECTED and isExportEligible to false
    if (this.sceneRepo?.updateVersionState && sceneVersion) {
      await this.sceneRepo.updateVersionState(sceneVersion.id, {
        status: 'REJECTED',
        isExportEligible: false,
        invalidationReason: effectiveComment,
      });
    }

    // 6. Emit Outbox event: CREATIVE_REJECTED
    if (input.outboxWriter) {
      await input.outboxWriter.append({
        topic: 'CREATIVE_REJECTED',
        schemaVersion: 1,
        idempotencyKey: `creative-job:${creativeJobId}:rejected:${approvalEvent.id}`,
        aggregateType: 'CreativeJob',
        aggregateId: creativeJobId,
        payload: {
          creativeJobId,
          visualAssetId: asset.id,
          ...(sceneVersion ? { sceneVersionId: sceneVersion.id } : {}),
          approvalEventId: approvalEvent.id,
          rejectedByUserId: rejectedBy,
          comment: effectiveComment,
        },
        occurredAt: new Date(),
        availableAt: new Date(),
      });
    }

    this.logger.log(`Creative job ${creativeJobId} rejected by user ${rejectedBy}`);

    return { approvalEvent };
  }
}
