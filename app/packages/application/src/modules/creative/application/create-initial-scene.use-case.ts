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
  type CreateInitialSceneInput,
  type CreativeSceneRecord,
  type CreativeSceneVersionRecord,
  type OutboxEventDraft,
} from '../domain/scene/creative-scene.types.js';
import { validateSceneGraph } from '../domain/scene/creative-scene.validator.js';
import { computeDependencyHash, computeSceneHash } from '../domain/scene/scene-hash.js';
import {
  CREATIVE_SCENE_REPOSITORY,
  type CreativeSceneRepository,
} from './creative-scene.repository.js';

export interface CreateInitialSceneResult {
  readonly scene: CreativeSceneRecord;
  readonly version: CreativeSceneVersionRecord;
}

@Injectable()
export class CreateInitialSceneUseCase {
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

  public async execute(input: CreateInitialSceneInput): Promise<CreateInitialSceneResult> {
    // 1. Enforce authorization: require Permission.EDIT_CREATIVE
    if (!input.requesterUserId || input.requesterUserId.trim() === '') {
      throw new ForbiddenError({
        publicMessage: 'Permission denied: requesterUserId is required.',
      });
    }
    if (!this.permissions.hasAnyRolePermission(input.requesterRoles, Permission.EDIT_CREATIVE)) {
      throw new ForbiddenError({
        publicMessage: 'Permission denied: Cannot create creative scene.',
      });
    }

    // 2. Validate Canvas Geometry & Complete Scene Graph
    const dimensions = STANDARD_ASPECT_RATIO_DIMENSIONS[input.aspectRatio];
    validateSceneGraph(
      input.layers,
      input.aspectRatio,
      dimensions.width,
      dimensions.height,
      input.safeMargins,
    );

    // 3. Authoritative Evidence Verification & Complete Relationship Chain (Fail-Closed)
    const verifiedEvidence = await this.evidenceVerifier.verifyAuthoritativeSceneEvidence({
      layers: input.layers,
      productSnapshotId: input.productSnapshotId,
      sourceContentVersionId: input.sourceContentVersionId,
      brandProfileVersionId: input.brandProfileVersionId,
      templateId: input.templateId,
      templateVersion: input.templateVersion,
      aspectRatio: input.aspectRatio,
      language: input.language,
    });
    const dependencies = verifiedEvidence.dependencies;

    // 4. Deterministic Hashes
    const dependencyHash = computeDependencyHash(dependencies);
    const sceneHash = computeSceneHash({
      aspectRatio: input.aspectRatio,
      dependencyHash,
      height: dimensions.height,
      language: input.language,
      layers: input.layers,
      safeMargins: input.safeMargins,
      stylePresetId: input.stylePresetId,
      templateId: input.templateId,
      templateVersion: input.templateVersion,
      width: dimensions.width,
    });

    // 6. Outbox Event Draft (Mandatory)
    const now = new Date();
    const outboxEvent: OutboxEventDraft = {
      topic: 'creative.scene.version_created',
      schemaVersion: 1,
      idempotencyKey: `scene:initial:${input.creativeJobId}:v1`,
      aggregateType: 'CreativeScene',
      aggregateId: input.creativeJobId,
      payload: {
        creativeJobId: input.creativeJobId,
        versionNumber: 1,
        parentVersionId: null,
        operationCode: 'INITIAL_DRAFT',
        sceneHash,
        dependencyHash,
        requestedByUserId: input.requesterUserId,
        occurredAt: now.toISOString(),
      },
      occurredAt: now,
      availableAt: now,
    };

    // 7. Atomic Persistence
    const result = await this.sceneRepo.createInitialScene({
      creativeJobId: input.creativeJobId,
      campaignId: input.campaignId,
      title: input.title,
      aspectRatio: input.aspectRatio,
      width: dimensions.width,
      height: dimensions.height,
      templateId: input.templateId,
      templateVersion: input.templateVersion,
      stylePresetId: input.stylePresetId,
      language: input.language,
      safeMargins: input.safeMargins,
      brandProfileVersionId: input.brandProfileVersionId,
      sourceContentVersionId: input.sourceContentVersionId,
      productSnapshotId: input.productSnapshotId,
      sceneHash,
      dependencyHash,
      layers: input.layers,
      dependencies,
      requestedByUserId: input.requesterUserId,
      metadata: input.metadata,
      outboxEvent,
    });

    this.logger?.log('Initial creative scene version created atomically', {
      sceneId: result.scene.id,
      versionId: result.version.id,
      sceneHash,
      dependencyHash,
    });

    return result;
  }
}
