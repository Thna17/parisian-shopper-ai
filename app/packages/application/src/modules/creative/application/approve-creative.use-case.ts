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
  VISUAL_VALIDATION_REPOSITORY,
  type VisualValidationRepository,
} from './visual-validation.repository.js';
import {
  CREATIVE_SCENE_REPOSITORY,
  type CreativeSceneRepository,
} from './creative-scene.repository.js';
import {
  PRODUCT_SNAPSHOT_REPOSITORY,
  type ProductSnapshotRepository,
} from '../../products/application/product-snapshot.repository.js';
import {
  PRODUCT_ASSET_ELIGIBILITY_EVALUATOR,
  type ProductAssetEligibilityEvaluator,
} from '../../products/application/product-asset-eligibility-evaluator.js';
import {
  CREATIVE_REVISION_REPOSITORY,
  type CreativeRevisionRepository,
} from './creative-revision.repository.js';
import {
  CreativeJobNotFoundError,
  VisualAssetNotFoundError,
  CreativeJobNotReadyForApprovalError,
  CreativeAlreadyApprovedError,
  CreativeAlreadyRejectedError,
  CreativeValidationFailedError,
  CreativeStaleVersionError,
  SelfApprovalProhibitedError,
  CreativeAssetRightsNotClearedError,
  CreativeFactualMismatchError,
} from '../domain/creative-errors.js';
import { type CreativeSceneVersionRecord } from '../domain/scene/creative-scene.types.js';

export interface ApproveCreativeInput {
  readonly creativeJobId: string;
  readonly visualAssetId?: string | undefined;
  readonly sceneVersionId?: string | undefined;
  readonly approvedBy: string;
  readonly approverRoles: readonly string[];
  readonly comment?: string | undefined;
  readonly outboxWriter?: OutboxWriter | undefined;
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
    @Optional()
    @Inject(CREATIVE_SCENE_REPOSITORY)
    private readonly sceneRepo?: CreativeSceneRepository,
    @Optional()
    @Inject(PRODUCT_SNAPSHOT_REPOSITORY)
    private readonly snapshotRepo?: ProductSnapshotRepository,
    @Optional()
    @Inject(PRODUCT_ASSET_ELIGIBILITY_EVALUATOR)
    private readonly assetEvaluator?: ProductAssetEligibilityEvaluator,
    @Optional()
    @Inject(CREATIVE_REVISION_REPOSITORY)
    private readonly revisionRepo?: CreativeRevisionRepository,
  ) {}

  public async execute(input: ApproveCreativeInput): Promise<ApproveCreativeResult> {
    const { creativeJobId, approvedBy, comment } = input;

    // 0. Enforce authorization: require Permission.APPROVE_CREATIVE
    if (!this.permissions.hasAnyRolePermission(input.approverRoles, Permission.APPROVE_CREATIVE)) {
      throw new ForbiddenError({ publicMessage: 'Permission denied: Cannot approve creative.' });
    }

    // 1. Verify CreativeJob exists and is in reviewable state (READY_FOR_REVIEW)
    const job = await this.jobRepo.findById(creativeJobId);
    if (!job) {
      throw new CreativeJobNotFoundError(creativeJobId);
    }

    const approvals: readonly CreativeApprovalEventRecord[] =
      (await this.approvalRepo.findByJobId(creativeJobId)) ?? [];
    if (Array.isArray(approvals)) {
      if (approvals.some((a: CreativeApprovalEventRecord) => a.decision === 'CREATIVE_APPROVED')) {
        throw new CreativeAlreadyApprovedError('Creative has already been approved.');
      }
      if (approvals.some((a: CreativeApprovalEventRecord) => a.decision === 'CREATIVE_REJECTED')) {
        throw new CreativeAlreadyRejectedError('Creative has already been rejected.');
      }
    }

    if (job.status !== 'READY_FOR_REVIEW') {
      throw new CreativeJobNotReadyForApprovalError(creativeJobId, job.status);
    }

    // 2. Resolve Scene & SceneVersion (if scene repository is wired)
    let sceneVersion: CreativeSceneVersionRecord | null = null;
    let initialSceneVersion: CreativeSceneVersionRecord | null = null;
    if (this.sceneRepo) {
      const scene = await this.sceneRepo.findByJobId(creativeJobId);
      if (scene) {
        initialSceneVersion = await this.sceneRepo.findVersionByNumber(scene.id, 1);
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

        // Invariant: Cannot approve a stale/superseded scene version
        if (sceneVersion && scene.currentVersionNumber > sceneVersion.versionNumber) {
          throw new CreativeStaleVersionError(
            `Cannot approve scene version v${sceneVersion.versionNumber} because a newer version exists (v${scene.currentVersionNumber}).`,
          );
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

    // Invariant: cannot approve a stale visual asset if a newer version exists for this job
    const latestAsset = await this.assetRepo.findLatestByJobId(creativeJobId);
    if (
      latestAsset &&
      latestAsset.id !== asset.id &&
      latestAsset.versionNumber > asset.versionNumber
    ) {
      throw new CreativeStaleVersionError(
        `Cannot approve visual asset ${asset.id} (v${asset.versionNumber}) because a newer version exists (v${latestAsset.versionNumber})`,
      );
    }

    // 4. Four-Eyes Independent Reviewer Enforcement
    // 4a. Original Creator Self-Approval Prohibited
    if (job.requestedByUserId && job.requestedByUserId === approvedBy) {
      throw new SelfApprovalProhibitedError(
        'Four-eyes policy violation: Creative job requester cannot approve their own creative.',
      );
    }
    if (
      initialSceneVersion?.requestedByUserId &&
      initialSceneVersion.requestedByUserId === approvedBy
    ) {
      throw new SelfApprovalProhibitedError(
        'Four-eyes policy violation: Initial scene creator cannot approve their own creative.',
      );
    }

    // 4b. Revision Author Self-Approval Prohibited
    if (sceneVersion?.requestedByUserId && sceneVersion.requestedByUserId === approvedBy) {
      throw new SelfApprovalProhibitedError(
        'Four-eyes policy violation: Version author cannot approve their own creative revision.',
      );
    }
    if (this.revisionRepo?.findByResultingAssetId) {
      const revision = await this.revisionRepo.findByResultingAssetId(asset.id);
      if (revision && revision.requestedByUserId === approvedBy) {
        throw new SelfApprovalProhibitedError(
          'Four-eyes policy violation: Version author cannot approve their own creative revision.',
        );
      }
    }

    // 5. Visual Validation Gate Check (must be PASSED/PASSED_WITH_WARNINGS with 0 blocking)
    const validationResult = await this.validationRepo.findLatestByAssetId(asset.id);
    if (
      !validationResult ||
      (validationResult.status !== 'PASSED' &&
        validationResult.status !== 'PASSED_WITH_WARNINGS') ||
      validationResult.blockingCount > 0
    ) {
      throw new CreativeValidationFailedError(asset.id, validationResult?.blockingCount ?? 1);
    }

    // 6. Asset Rights & Commercial Factual Validation (if repositories are wired)
    if (this.snapshotRepo && job.productSnapshotId) {
      const snapshot = await this.snapshotRepo.findById(job.productSnapshotId);
      if (!snapshot) {
        throw new ValidationError({
          publicMessage: 'Product snapshot not found for creative job.',
        });
      }

      // 6a. Asset Rights Gate: Evaluate product asset rights freshness
      if (this.assetEvaluator) {
        const sku = snapshot.product?.product?.sku;
        if (sku) {
          try {
            const heroEvidence = await this.assetEvaluator.resolveAuthoritativeHeroEvidence(sku);
            if (
              heroEvidence.registration?.rightsState !== 'VERIFIED' ||
              heroEvidence.approvalEvent?.decision !== 'APPROVED'
            ) {
              throw new CreativeAssetRightsNotClearedError(
                `Product asset rights for SKU ${sku} are not verified or cleared.`,
              );
            }
          } catch (err: unknown) {
            if (err instanceof CreativeAssetRightsNotClearedError) {
              throw err;
            }
            throw new CreativeAssetRightsNotClearedError(
              `Failed authoritative asset rights evaluation: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      }

      // 6b. Commercial Factual Validation: SKU and product alignment
      if (sceneVersion && sceneVersion.productSnapshotId !== job.productSnapshotId) {
        throw new CreativeFactualMismatchError(
          'Commercial validation failed: Scene product snapshot does not match creative job.',
        );
      }
    }

    // 7. Record CreativeApprovalEvent
    const approvalEvent = await this.approvalRepo.recordApproval({
      creativeJobId,
      visualAssetId: asset.id,
      ...(sceneVersion ? { sceneVersionId: sceneVersion.id } : {}),
      approverUserId: approvedBy,
      decision: 'CREATIVE_APPROVED',
      ...(comment !== undefined ? { comment } : {}),
      visualValidationResultId: validationResult.id,
    });

    // 8. Transition CreativeJob status: READY_FOR_REVIEW -> CREATIVE_APPROVED
    await this.jobRepo.transitionStatus(creativeJobId, 'READY_FOR_REVIEW', 'CREATIVE_APPROVED');

    // 8b. Transition SceneVersionState to APPROVED and isExportEligible to true
    if (this.sceneRepo?.updateVersionState && sceneVersion) {
      await this.sceneRepo.updateVersionState(sceneVersion.id, {
        status: 'APPROVED',
        isExportEligible: true,
      });
    }

    // 9. Emit Outbox event: CREATIVE_APPROVED
    if (input.outboxWriter) {
      await input.outboxWriter.append({
        topic: 'CREATIVE_APPROVED',
        schemaVersion: 1,
        idempotencyKey: `creative-job:${creativeJobId}:approved:${approvalEvent.id}`,
        aggregateType: 'CreativeJob',
        aggregateId: creativeJobId,
        payload: {
          creativeJobId,
          visualAssetId: asset.id,
          ...(sceneVersion ? { sceneVersionId: sceneVersion.id } : {}),
          approvalEventId: approvalEvent.id,
          approverUserId: approvedBy,
        },
        occurredAt: new Date(),
        availableAt: new Date(),
      });
    }

    this.logger.log(
      `Creative job ${creativeJobId} (asset ${asset.id}${sceneVersion ? `, scene v${sceneVersion.versionNumber}` : ''}) approved by independent reviewer ${approvedBy}`,
    );

    return { approvalEvent };
  }
}
