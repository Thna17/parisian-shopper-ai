import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  type ApplicationLogger,
  APPLICATION_LOGGER,
  ForbiddenError,
} from '@parisian-shopper/common';
import { Permission, PermissionService } from '../../auth/domain/permissions.js';
import {
  PRODUCT_SNAPSHOT_REPOSITORY,
  type ProductSnapshotRepository,
} from '../../products/application/product-snapshot.repository.js';
import {
  PRODUCT_ASSET_ELIGIBILITY_EVALUATOR,
  ProductAssetEligibilityEvaluator,
} from '../../products/application/product-asset-eligibility-evaluator.js';
import {
  CONTENT_GENERATION_REPOSITORY,
  type ContentGenerationRepository,
} from '../../content/application/content-generation.repository.js';
import {
  BRAND_RULE_REPOSITORY,
  type BrandRuleRepository,
} from '../../brand/application/brand-rule.repository.js';
import {
  AUTHORITATIVE_SCENE_EVIDENCE_VERIFIER,
  AuthoritativeSceneEvidenceVerifier,
} from './services/authoritative-scene-evidence-verifier.js';
import {
  STANDARD_ASPECT_RATIO_DIMENSIONS,
  type CreativeSceneVersionRecord,
  type OutboxEventDraft,
  type ReviseSceneInput,
} from '../domain/scene/creative-scene.types.js';
import { CreativeSceneNotFoundError } from '../domain/scene/creative-scene-errors.js';
import { validateSceneGraph } from '../domain/scene/creative-scene.validator.js';
import { computeDependencyHash, computeSceneHash } from '../domain/scene/scene-hash.js';
import {
  CREATIVE_SCENE_REPOSITORY,
  type CreativeSceneRepository,
} from './creative-scene.repository.js';

@Injectable()
export class ReviseSceneUseCase {
  private readonly evidenceVerifier: AuthoritativeSceneEvidenceVerifier;

  public constructor(
    @Inject(CREATIVE_SCENE_REPOSITORY)
    private readonly sceneRepo: CreativeSceneRepository,
    @Inject(PermissionService)
    private readonly permissions: PermissionService,
    @Inject(PRODUCT_SNAPSHOT_REPOSITORY)
    private readonly snapshotRepo: ProductSnapshotRepository,
    @Inject(PRODUCT_ASSET_ELIGIBILITY_EVALUATOR)
    private readonly assetEvaluator: ProductAssetEligibilityEvaluator,
    @Inject(CONTENT_GENERATION_REPOSITORY)
    private readonly contentRepo: ContentGenerationRepository,
    @Inject(BRAND_RULE_REPOSITORY)
    private readonly brandRepo: BrandRuleRepository,
    @Optional()
    @Inject(APPLICATION_LOGGER)
    private readonly logger?: ApplicationLogger,
    @Optional()
    @Inject(AUTHORITATIVE_SCENE_EVIDENCE_VERIFIER)
    evidenceVerifier?: AuthoritativeSceneEvidenceVerifier,
  ) {
    this.evidenceVerifier =
      evidenceVerifier ??
      new AuthoritativeSceneEvidenceVerifier(
        this.snapshotRepo,
        this.assetEvaluator,
        this.contentRepo,
        this.brandRepo,
      );
  }

  public async execute(input: ReviseSceneInput): Promise<CreativeSceneVersionRecord> {
    // 1. Enforce authorization: require Permission.EDIT_CREATIVE
    if (!input.requesterUserId || input.requesterUserId.trim() === '') {
      throw new ForbiddenError({
        publicMessage: 'Permission denied: requesterUserId is required.',
      });
    }
    if (!this.permissions.hasAnyRolePermission(input.requesterRoles, Permission.EDIT_CREATIVE)) {
      throw new ForbiddenError({
        publicMessage: 'Permission denied: Cannot revise creative scene.',
      });
    }

    // 2. Lookup Scene & Parent Version
    const scene = await this.sceneRepo.findById(input.sceneId);
    if (!scene) {
      throw new CreativeSceneNotFoundError(input.sceneId);
    }

    const parentVersion = await this.sceneRepo.findVersionByNumber(
      input.sceneId,
      input.expectedVersionNumber,
    );
    if (!parentVersion) {
      throw new CreativeSceneNotFoundError(input.sceneId);
    }

    const nextVersionNumber = input.expectedVersionNumber + 1;
    const templateId = input.templateId ?? parentVersion.templateId;
    const templateVersion = input.templateVersion ?? parentVersion.templateVersion;
    const stylePresetId =
      input.stylePresetId !== undefined ? input.stylePresetId : parentVersion.stylePresetId;
    const language = input.language ?? parentVersion.language;
    const safeMargins = input.safeMargins ?? parentVersion.safeMargins;
    const brandProfileVersionId =
      input.brandProfileVersionId ?? parentVersion.brandProfileVersionId;
    const sourceContentVersionId =
      input.sourceContentVersionId ?? parentVersion.sourceContentVersionId;
    const productSnapshotId = input.productSnapshotId ?? parentVersion.productSnapshotId;

    // 3. Validate Geometry & Scene Graph
    const dimensions = STANDARD_ASPECT_RATIO_DIMENSIONS[parentVersion.aspectRatio];
    validateSceneGraph(
      input.layers,
      parentVersion.aspectRatio,
      dimensions.width,
      dimensions.height,
      safeMargins,
    );

    // 4. Authoritative Evidence Verification & Complete Relationship Chain (Fail-Closed)
    const verifiedEvidence = await this.evidenceVerifier.verifyAuthoritativeSceneEvidence({
      layers: input.layers,
      productSnapshotId,
      sourceContentVersionId,
      brandProfileVersionId,
      templateId,
      templateVersion,
      aspectRatio: parentVersion.aspectRatio,
      language,
    });
    const dependencies = verifiedEvidence.dependencies;

    // 5. Deterministic Hashes
    const dependencyHash = computeDependencyHash(dependencies);
    const sceneHash = computeSceneHash({
      aspectRatio: parentVersion.aspectRatio,
      dependencyHash,
      height: dimensions.height,
      language,
      layers: input.layers,
      safeMargins,
      stylePresetId,
      templateId,
      templateVersion,
      width: dimensions.width,
    });

    // 7. Prepare Atomic Outbox Events (Mandatory non-empty tuple)
    const now = new Date();
    const outboxEvents: OutboxEventDraft[] = [];

    // If parent version was approved, prior approval cannot authorize revised version
    if (parentVersion.state?.status === 'APPROVED') {
      outboxEvents.push({
        topic: 'creative.approval.rendered_ineligible',
        schemaVersion: 1,
        idempotencyKey: `scene:${scene.id}:v${parentVersion.versionNumber}:invalidated_by_v${nextVersionNumber}`,
        aggregateType: 'CreativeScene',
        aggregateId: scene.id,
        payload: {
          sceneId: scene.id,
          priorVersionNumber: parentVersion.versionNumber,
          newVersionNumber: nextVersionNumber,
          reason: `Scene revised with operation ${input.operationCode}: ${input.changeReason}`,
          occurredAt: now.toISOString(),
        },
        occurredAt: now,
        availableAt: now,
      });
    }

    outboxEvents.push({
      topic: 'creative.scene.version_created',
      schemaVersion: 1,
      idempotencyKey: `scene:${scene.id}:v${nextVersionNumber}:created`,
      aggregateType: 'CreativeScene',
      aggregateId: scene.id,
      payload: {
        sceneId: scene.id,
        versionNumber: nextVersionNumber,
        parentVersionId: parentVersion.id,
        operationCode: input.operationCode,
        sceneHash,
        dependencyHash,
        requestedByUserId: input.requesterUserId,
        occurredAt: now.toISOString(),
      },
      occurredAt: now,
      availableAt: now,
    });

    const nonNullOutboxEvents: [OutboxEventDraft, ...OutboxEventDraft[]] = [
      outboxEvents[0]!,
      ...outboxEvents.slice(1),
    ];

    // 8. Atomic Revision Persistence
    const newVersion = await this.sceneRepo.createRevision({
      sceneId: scene.id,
      expectedVersionNumber: input.expectedVersionNumber,
      templateId,
      templateVersion,
      stylePresetId,
      language,
      safeMargins,
      brandProfileVersionId,
      sourceContentVersionId,
      productSnapshotId,
      sceneHash,
      dependencyHash,
      changeReason: input.changeReason,
      operationCode: input.operationCode,
      requestedByUserId: input.requesterUserId,
      metadata: input.metadata,
      layers: input.layers,
      dependencies,
      outboxEvents: nonNullOutboxEvents,
    });

    this.logger?.log('Creative scene revised atomically', {
      sceneId: scene.id,
      versionNumber: newVersion.versionNumber,
      sceneHash,
      dependencyHash,
    });

    return newVersion;
  }
}
