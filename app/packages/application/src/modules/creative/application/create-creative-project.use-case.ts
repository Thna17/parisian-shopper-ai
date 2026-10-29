import { Inject, Injectable, Optional } from '@nestjs/common';
import { ForbiddenError, NotFoundError, ValidationError } from '@parisian-shopper/common';
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
import { CREATIVE_JOB_REPOSITORY, type CreativeJobRepository } from './creative-job.repository.js';
import {
  CreateInitialSceneUseCase,
  type CreateInitialSceneResult,
} from './create-initial-scene.use-case.js';
import {
  STANDARD_ASPECT_RATIO_DIMENSIONS,
  type PosterAspectRatio,
  type SceneLanguage,
  type SceneLayerDraft,
  type SceneTemplateId,
  type SafeMargins,
} from '../domain/scene/creative-scene.types.js';

export interface CreateCreativeProjectInput {
  readonly title: string;
  readonly productSnapshotId: string;
  readonly sourceContentVersionId: string;
  readonly templateId: SceneTemplateId;
  readonly aspectRatio: PosterAspectRatio;
  readonly language: SceneLanguage;
  readonly campaignId?: string | undefined;
  readonly productAssetId?: string | undefined;
  readonly requesterUserId: string;
  readonly requesterRoles: readonly string[];
}

@Injectable()
export class CreateCreativeProjectUseCase {
  private readonly permissions: PermissionService;

  public constructor(
    @Inject(CreateInitialSceneUseCase)
    private readonly createInitialSceneUseCase: CreateInitialSceneUseCase,
    @Inject(CREATIVE_JOB_REPOSITORY)
    private readonly jobRepo: CreativeJobRepository,
    @Inject(PRODUCT_SNAPSHOT_REPOSITORY)
    private readonly snapshotRepo: ProductSnapshotRepository,
    @Inject(PRODUCT_ASSET_ELIGIBILITY_EVALUATOR)
    private readonly assetEvaluator: ProductAssetEligibilityEvaluator,
    @Inject(CONTENT_GENERATION_REPOSITORY)
    private readonly contentRepo: ContentGenerationRepository,
    @Inject(BRAND_RULE_REPOSITORY)
    private readonly brandRepo: BrandRuleRepository,
    @Optional()
    @Inject(PermissionService)
    permissions?: PermissionService,
  ) {
    this.permissions = permissions ?? new PermissionService();
  }

  public async execute(input: CreateCreativeProjectInput): Promise<CreateInitialSceneResult> {
    if (!this.permissions.hasAnyRolePermission(input.requesterRoles, Permission.EDIT_CREATIVE)) {
      throw new ForbiddenError({
        publicMessage: 'Permission denied: Cannot create creative project.',
      });
    }

    const snapshot = await this.snapshotRepo.findById(input.productSnapshotId);
    if (!snapshot) {
      throw new NotFoundError({
        publicMessage: `Product snapshot "${input.productSnapshotId}" not found.`,
      });
    }

    const sku = snapshot.product?.product?.sku;
    if (!sku) {
      throw new ValidationError({
        publicMessage: `Product snapshot "${input.productSnapshotId}" has no valid SKU.`,
      });
    }

    const contentVersion = await this.contentRepo.findVersionById(input.sourceContentVersionId);
    if (!contentVersion) {
      throw new NotFoundError({
        publicMessage: `Content version "${input.sourceContentVersionId}" not found.`,
      });
    }

    if (contentVersion.productSnapshotId !== input.productSnapshotId) {
      throw new ValidationError({
        publicMessage: `Content version does not belong to product snapshot "${input.productSnapshotId}".`,
      });
    }

    // Resolve Brand Rule Version
    const brandRuleVersionId = contentVersion.brandRuleVersionId;
    const brandRule = await this.brandRepo.findById(brandRuleVersionId);
    if (!brandRule) {
      throw new NotFoundError({
        publicMessage: `Brand rule version "${brandRuleVersionId}" not found.`,
      });
    }

    // Resolve Authoritative Hero Asset Evidence
    const heroEvidence = await this.assetEvaluator.resolveAuthoritativeHeroEvidence(sku, {
      ...(input.productAssetId ? { productAssetId: input.productAssetId } : {}),
    });

    // Create CreativeJob
    const creativeJob = await this.jobRepo.createJob({
      contentVersionId: contentVersion.id,
      productSnapshotId: snapshot.id,
      brandRuleVersionId,
      requestedByUserId: input.requesterUserId,
      aspectRatio: input.aspectRatio,
      creativeProfile: 'PARISIAN_LUXURY_ATELIER',
    });

    // Geometry and safe margins
    const dimensions = STANDARD_ASPECT_RATIO_DIMENSIONS[input.aspectRatio];
    const safeMargins: SafeMargins =
      input.aspectRatio === '9:16'
        ? { top: 250, bottom: 350, left: 80, right: 80 }
        : input.aspectRatio === '4:5'
          ? { top: 120, bottom: 120, left: 80, right: 80 }
          : { top: 80, bottom: 80, left: 80, right: 80 };

    // Build initial layers
    const layers = this.buildInitialLayers({
      templateId: input.templateId,
      aspectRatio: input.aspectRatio,
      dimensions,
      safeMargins,
      snapshot,
      contentVersion,
      heroEvidence,
    });

    return this.createInitialSceneUseCase.execute({
      creativeJobId: creativeJob.id,
      ...(input.campaignId ? { campaignId: input.campaignId } : {}),
      title: input.title,
      aspectRatio: input.aspectRatio,
      templateId: input.templateId,
      templateVersion: '1.0.0',
      language: input.language,
      safeMargins,
      brandProfileVersionId: brandRuleVersionId,
      sourceContentVersionId: contentVersion.id,
      productSnapshotId: snapshot.id,
      layers,
      requesterUserId: input.requesterUserId,
      requesterRoles: input.requesterRoles,
    });
  }

  private buildInitialLayers(options: {
    readonly templateId: SceneTemplateId;
    readonly aspectRatio: PosterAspectRatio;
    readonly dimensions: { width: number; height: number };
    readonly safeMargins: SafeMargins;
    readonly snapshot: import('../../products/application/product-snapshot.repository.js').ProductSnapshot;
    readonly contentVersion: import('../../content/application/content-generation.repository.js').ContentVersion;
    readonly heroEvidence: import('../../products/application/product-asset-eligibility-evaluator.js').AuthoritativeHeroEvidence;
  }): readonly SceneLayerDraft[] {
    const { dimensions, snapshot, contentVersion, heroEvidence, templateId, aspectRatio } = options;
    const { width, height } = dimensions;

    const productName = snapshot.product?.product?.product_name ?? 'Luxury Fragrance';
    const brand = snapshot.product?.product?.brand ?? 'Parisian Atelier';
    const priceFormatted = `$${Number(snapshot.product?.product?.price ?? 0).toFixed(2)} USD`;
    const headlineText = contentVersion.structuredOutput?.headline ?? productName;
    const subheadText =
      contentVersion.structuredOutput?.english_caption ?? `${brand} — Eau de Parfum`;

    // Coordinates according to template and aspect ratio
    let heroBounds = { x: 240, y: 300, width: 600, height: 600 };
    let typoBounds = { x: 80, y: 920, width: width - 160, height: 140 };
    let shadowBounds = { x: 260, y: 880, width: 560, height: 80 };

    if (templateId === 'EDITORIAL_SPLIT' && aspectRatio === '1:1') {
      heroBounds = { x: 480, y: 160, width: 520, height: 760 };
      typoBounds = { x: 80, y: 220, width: 380, height: 640 };
      shadowBounds = { x: 500, y: 860, width: 480, height: 60 };
    } else if (aspectRatio === '9:16') {
      heroBounds = { x: 190, y: 550, width: 700, height: 750 };
      typoBounds = { x: 80, y: 1320, width: width - 160, height: 200 };
      shadowBounds = { x: 220, y: 1260, width: 640, height: 80 };
    }

    return [
      {
        layerKey: 'bg_01',
        layerGroup: 'BACKGROUND',
        layerType: 'GENERATED_BACKGROUND',
        name: 'Background Ambiance',
        zIndex: 0,
        visible: true,
        opacity: 1,
        blendMode: 'NORMAL',
        bounds: { x: 0, y: 0, width, height },
        payloadSchemaVersion: 1,
        sortOrder: 0,
        payload: {
          assetType: 'GENERATED_BACKGROUND',
          casStorageKey: 'cas/backgrounds/parisian-atelier-default.png',
          sha256: 'e'.repeat(64),
          provider: 'system-default',
          model: 'parisian-atelier-v1',
          promptVersion: '1.0.0',
        },
      },
      {
        layerKey: 'shadow_01',
        layerGroup: 'SURFACE_SHADOW',
        layerType: 'CONTACT_SHADOW',
        name: 'Pedestal Shadow',
        zIndex: 100,
        visible: true,
        opacity: 0.45,
        blendMode: 'MULTIPLY',
        bounds: shadowBounds,
        payloadSchemaVersion: 1,
        sortOrder: 1,
        payload: {
          shadowType: 'CONTACT_SHADOW',
          blurRadius: 24,
          color: '#1a1815',
        },
      },
      {
        layerKey: 'hero_01',
        layerGroup: 'PRODUCT_HERO',
        layerType: 'HERO_CUTOUT',
        name: 'Product Hero Cutout',
        zIndex: 200,
        visible: true,
        opacity: 1,
        blendMode: 'NORMAL',
        bounds: heroBounds,
        payloadSchemaVersion: 1,
        sortOrder: 2,
        payload: {
          productSnapshotId: snapshot.id,
          productAssetId: heroEvidence.asset.id,
          productAssetRegistrationId: heroEvidence.registration.id,
          validationAssessmentId: heroEvidence.assessment.id,
          validatorVersion: heroEvidence.assessment.validatorVersion,
          rightsEventId: heroEvidence.rightsEvent.id,
          approvalEventId: heroEvidence.approvalEvent.id,
          assetRole: 'HERO_CUTOUT',
          casStorageKey: heroEvidence.asset.storageKey,
          sha256: heroEvidence.asset.sha256,
          mimeType: heroEvidence.asset.mimeType === 'image/webp' ? 'image/webp' : 'image/png',
          format: 'png',
          byteSize: heroEvidence.asset.byteSize,
          width: heroEvidence.asset.width,
          height: heroEvidence.asset.height,
          pixelCount: heroEvidence.asset.width * heroEvidence.asset.height,
          channels: 4,
          hasAlpha: true as const,
          transparencyRatio: 0.35,
          rightsState: 'VERIFIED' as const,
          approvalDecision: 'APPROVED' as const,
          alphaEvidence: {
            hasAlpha: true,
            transparencyRatio: 0.35,
          },
          containmentConfig: {
            containmentPassed: true,
            x: heroBounds.x,
            y: heroBounds.y,
            width: heroBounds.width,
            height: heroBounds.height,
          },
        },
      },
      {
        layerKey: 'typo_01',
        layerGroup: 'TYPOGRAPHY',
        layerType: 'TYPOGRAPHY_BLOCK',
        name: 'Brand Typography & Price',
        zIndex: 300,
        visible: true,
        opacity: 1,
        blendMode: 'NORMAL',
        bounds: typoBounds,
        payloadSchemaVersion: 1,
        sortOrder: 3,
        payload: {
          headline: {
            text: headlineText,
            fontFamily: 'Playfair Display',
            fontWeight: 700,
            fontSize: 44,
            color: '#1C1A17',
          },
          subheadline: {
            text: subheadText,
            fontFamily: 'Montserrat',
            fontWeight: 500,
            fontSize: 20,
            color: '#554F47',
          },
          priceBadge: {
            regularPrice: priceFormatted,
            currency: 'USD',
          },
        },
      },
    ];
  }
}
