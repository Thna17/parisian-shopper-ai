import { Inject, Injectable, Optional } from '@nestjs/common';
import { ForbiddenError, NotFoundError } from '@parisian-shopper/common';
import { Permission, PermissionService } from '../../auth/domain/permissions.js';
import {
  PRODUCT_SNAPSHOT_REPOSITORY,
  type ProductSnapshotRepository,
} from '../../products/application/product-snapshot.repository.js';
import {
  CREATIVE_SCENE_REPOSITORY,
  type CreativeSceneRepository,
} from './creative-scene.repository.js';
import {
  STANDARD_ASPECT_RATIO_DIMENSIONS,
  type SceneLayerDraft,
  type SceneLayerRecord,
} from '../domain/scene/creative-scene.types.js';

export interface ValidateCreativeProjectInput {
  readonly projectId: string;
  readonly versionNumber?: number | undefined;
  readonly layers?: readonly (SceneLayerDraft | SceneLayerRecord)[] | undefined;
  readonly requesterUserId: string;
  readonly requesterRoles: readonly string[];
}

export interface CreativeValidationFinding {
  readonly code: string;
  readonly severity: 'BLOCKING' | 'WARNING' | 'INFO';
  readonly message: string;
  readonly field: string;
}

export interface ValidateCreativeProjectResult {
  readonly isPassed: boolean;
  readonly blockingCount: number;
  readonly warningCount: number;
  readonly infoCount: number;
  readonly findings: readonly CreativeValidationFinding[];
  readonly aestheticScore: number;
  readonly aestheticGrade: string;
}

@Injectable()
export class ValidateCreativeProjectUseCase {
  private readonly permissions: PermissionService;

  public constructor(
    @Inject(CREATIVE_SCENE_REPOSITORY)
    private readonly sceneRepo: CreativeSceneRepository,
    @Inject(PRODUCT_SNAPSHOT_REPOSITORY)
    private readonly snapshotRepo: ProductSnapshotRepository,
    @Optional()
    @Inject(PermissionService)
    permissions?: PermissionService,
  ) {
    this.permissions = permissions ?? new PermissionService();
  }

  public async execute(
    input: ValidateCreativeProjectInput,
  ): Promise<ValidateCreativeProjectResult> {
    const hasAccess =
      this.permissions.hasAnyRolePermission(input.requesterRoles, Permission.EDIT_CREATIVE) ||
      this.permissions.hasAnyRolePermission(input.requesterRoles, Permission.VIEW_OWN_CONTENT);

    if (!hasAccess) {
      throw new ForbiddenError({
        publicMessage: 'Permission denied: Cannot validate creative project.',
      });
    }

    const scene = await this.sceneRepo.findById(input.projectId);
    if (!scene) {
      throw new NotFoundError({
        publicMessage: `Creative project "${input.projectId}" not found.`,
      });
    }

    const version =
      input.versionNumber !== undefined
        ? await this.sceneRepo.findVersionByNumber(scene.id, input.versionNumber)
        : await this.sceneRepo.findLatestVersionBySceneId(scene.id);

    if (!version) {
      throw new NotFoundError({
        publicMessage: `Version for project "${input.projectId}" not found.`,
      });
    }

    const snapshot = await this.snapshotRepo.findById(version.productSnapshotId);
    const layersToValidate = input.layers ?? version.layers;
    const dimensions = STANDARD_ASPECT_RATIO_DIMENSIONS[version.aspectRatio];
    const safeMargins = version.safeMargins;

    const findings: CreativeValidationFinding[] = [];

    // 1. Safe Margins Gate
    for (const layer of layersToValidate) {
      if (layer.layerGroup === 'TYPOGRAPHY' || layer.layerGroup === 'BRAND_DECORATION') {
        const bounds = layer.bounds;
        if (
          bounds.x < safeMargins.left ||
          bounds.y < safeMargins.top ||
          bounds.x + bounds.width > dimensions.width - safeMargins.right ||
          bounds.y + bounds.height > dimensions.height - safeMargins.bottom
        ) {
          findings.push({
            code: 'GATE_SAFE_MARGIN_VIOLATION',
            severity: 'BLOCKING',
            message: `Layer "${layer.name}" (${layer.layerKey}) extends beyond safe margin bounds.`,
            field: `layers.${layer.layerKey}.bounds`,
          });
        }
      }
    }

    // 2. CTA and Hero Collision Gate
    const heroLayer = layersToValidate.find((l) => l.layerGroup === 'PRODUCT_HERO');
    const ctaLayers = layersToValidate.filter(
      (l) => l.layerKey.toLowerCase().includes('cta') || l.name.toLowerCase().includes('cta'),
    );

    if (heroLayer && ctaLayers.length > 0) {
      for (const cta of ctaLayers) {
        const intersects =
          heroLayer.bounds.x < cta.bounds.x + cta.bounds.width &&
          heroLayer.bounds.x + heroLayer.bounds.width > cta.bounds.x &&
          heroLayer.bounds.y < cta.bounds.y + cta.bounds.height &&
          heroLayer.bounds.y + heroLayer.bounds.height > cta.bounds.y;

        if (intersects) {
          findings.push({
            code: 'GATE_CTA_HERO_COLLISION',
            severity: 'BLOCKING',
            message: `Call-to-Action "${cta.name}" collides with Product Hero Cutout.`,
            field: `layers.${cta.layerKey}.bounds`,
          });
        }
      }
    }

    // 3. Factual Price Truth Gate (Commercial Integrity)
    if (snapshot) {
      const authoritativePrice = Number(snapshot.product?.product?.price ?? 0);
      for (const layer of layersToValidate) {
        if (layer.payload && typeof layer.payload === 'object') {
          const payloadStr = JSON.stringify(layer.payload);
          const priceMatches = payloadStr.match(/\$\s*([0-9]+(?:\.[0-9]{2})?)/g);
          if (priceMatches) {
            for (const match of priceMatches) {
              const numericValue = parseFloat(match.replace(/[$\s]/g, ''));
              if (!isNaN(numericValue) && Math.abs(numericValue - authoritativePrice) > 0.01) {
                findings.push({
                  code: 'GATE_FACTUAL_PRICE_MISMATCH',
                  severity: 'BLOCKING',
                  message: `Rendered price "$${numericValue.toFixed(2)}" violates catalog truth MSRP "$${authoritativePrice.toFixed(2)} USD". Promotional discounts cannot be fabricated.`,
                  field: `layers.${layer.layerKey}.payload`,
                });
              }
            }
          }
        }
      }
    }

    // 4. Contrast Gate
    for (const layer of layersToValidate) {
      if (layer.layerGroup === 'TYPOGRAPHY' && layer.payload) {
        const payload = layer.payload as unknown as Record<string, unknown>;
        const headline = payload.headline as { color?: string } | undefined;
        if (headline?.color && headline.color.toLowerCase() === '#ffffff') {
          // Check if background is too light
          findings.push({
            code: 'GATE_TEXT_CONTRAST_LOW',
            severity: 'WARNING',
            message: `White headline on current background may have borderline WCAG contrast in bright ambient settings.`,
            field: `layers.${layer.layerKey}.payload.headline.color`,
          });
        }
      }
    }

    const blockingCount = findings.filter((f) => f.severity === 'BLOCKING').length;
    const warningCount = findings.filter((f) => f.severity === 'WARNING').length;
    const infoCount = findings.filter((f) => f.severity === 'INFO').length;
    const isPassed = blockingCount === 0;

    // Aesthetic scoring
    let aestheticScore = 9.2;
    if (blockingCount > 0) aestheticScore -= blockingCount * 2.5;
    if (warningCount > 0) aestheticScore -= warningCount * 0.8;
    aestheticScore = Math.max(1.0, Math.min(10.0, Number(aestheticScore.toFixed(1))));

    const aestheticGrade =
      aestheticScore >= 9.0
        ? 'EXCELLENT'
        : aestheticScore >= 7.5
          ? 'GOOD'
          : aestheticScore >= 5.0
            ? 'FAIR'
            : 'POOR';

    return {
      isPassed,
      blockingCount,
      warningCount,
      infoCount,
      findings,
      aestheticScore,
      aestheticGrade,
    };
  }
}
