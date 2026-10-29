import { createHash } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import sharp from 'sharp';
import {
  type ApplicationLogger,
  APPLICATION_LOGGER,
  ForbiddenError,
  NotFoundError,
} from '@parisian-shopper/common';
import { Permission, PermissionService } from '../../auth/domain/permissions.js';
import {
  PRODUCT_SNAPSHOT_REPOSITORY,
  type ProductSnapshotRepository,
} from '../../products/application/product-snapshot.repository.js';
import {
  CREATIVE_SCENE_REPOSITORY,
  type CreativeSceneRepository,
} from './creative-scene.repository.js';
import { CREATIVE_JOB_REPOSITORY, type CreativeJobRepository } from './creative-job.repository.js';
import { VISUAL_ASSET_REPOSITORY, type VisualAssetRepository } from './visual-asset.repository.js';
import {
  VISUAL_VALIDATION_REPOSITORY,
  type VisualValidationRepository,
} from './visual-validation.repository.js';
import { ASSET_STORAGE, type AssetStoragePort } from './asset-storage.port.js';
import { STANDARD_ASPECT_RATIO_DIMENSIONS } from '../domain/scene/creative-scene.types.js';
import { FontRegistry } from '../infrastructure/fonts/font-registry.js';
import { ValidateCreativeProjectUseCase } from './validate-creative-project.use-case.js';

export interface RenderCreativePreviewInput {
  readonly projectId: string;
  readonly versionNumber?: number | undefined;
  readonly requesterUserId: string;
  readonly requesterRoles: readonly string[];
}

export interface RenderCreativePreviewResult {
  readonly visualAssetId: string;
  readonly storageKey: string;
  readonly width: number;
  readonly height: number;
  readonly sha256: string;
  readonly byteSize: number;
  readonly mimeType: 'image/png';
  readonly validationStatus: 'PASSED' | 'PASSED_WITH_WARNINGS' | 'FAILED';
  readonly isPassed: boolean;
  readonly findings: readonly {
    readonly code: string;
    readonly severity: string;
    readonly message: string;
    readonly field: string;
  }[];
  readonly aestheticScore?: number | undefined;
  readonly previewUrl: string;
}

@Injectable()
export class RenderCreativePreviewUseCase {
  private readonly permissions: PermissionService;

  public constructor(
    @Inject(CREATIVE_SCENE_REPOSITORY)
    private readonly sceneRepo: CreativeSceneRepository,
    @Inject(CREATIVE_JOB_REPOSITORY)
    private readonly jobRepo: CreativeJobRepository,
    @Inject(VISUAL_ASSET_REPOSITORY)
    private readonly assetRepo: VisualAssetRepository,
    @Inject(VISUAL_VALIDATION_REPOSITORY)
    private readonly validationRepo: VisualValidationRepository,
    @Inject(ASSET_STORAGE)
    private readonly storage: AssetStoragePort,
    @Inject(PRODUCT_SNAPSHOT_REPOSITORY)
    private readonly snapshotRepo: ProductSnapshotRepository,
    @Inject(ValidateCreativeProjectUseCase)
    private readonly validator: ValidateCreativeProjectUseCase,
    @Optional()
    @Inject(PermissionService)
    permissions?: PermissionService,
    @Optional()
    @Inject(APPLICATION_LOGGER)
    private readonly logger?: ApplicationLogger,
  ) {
    this.permissions = permissions ?? new PermissionService();
  }

  public async execute(input: RenderCreativePreviewInput): Promise<RenderCreativePreviewResult> {
    const hasAccess =
      this.permissions.hasAnyRolePermission(input.requesterRoles, Permission.REGENERATE_CREATIVE) ||
      this.permissions.hasAnyRolePermission(input.requesterRoles, Permission.EDIT_CREATIVE);

    if (!hasAccess) {
      throw new ForbiddenError({
        publicMessage: 'Permission denied: Cannot render creative preview.',
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

    const job = await this.jobRepo.findById(scene.creativeJobId);
    if (!job) {
      throw new NotFoundError({
        publicMessage: `Creative job "${scene.creativeJobId}" not found.`,
      });
    }

    const snapshot = await this.snapshotRepo.findById(version.productSnapshotId);
    const dimensions = STANDARD_ASPECT_RATIO_DIMENSIONS[version.aspectRatio];
    const { width, height } = dimensions;

    // 1. Run server-side validation on scene layers
    const validation = await this.validator.execute({
      projectId: scene.id,
      versionNumber: version.versionNumber,
      layers: version.layers,
      requesterUserId: input.requesterUserId,
      requesterRoles: input.requesterRoles,
    });

    // 2. Render composite raster buffer via Sharp
    const compositeBuffer = await this.renderSceneComposite({
      width,
      height,
      version,
      snapshot,
    });

    const sha256 = createHash('sha256').update(compositeBuffer).digest('hex').toLowerCase();
    const byteSize = compositeBuffer.length;
    const storageKey = `cas/previews/${scene.id}/v${version.versionNumber}_${sha256.slice(0, 12)}.png`;

    // 3. Save buffer to CAS storage
    await this.storage.saveAsset({
      buffer: compositeBuffer,
      mimeType: 'image/png',
      assetRole: 'COMPOSITED_CREATIVE',
      width,
      height,
    });

    // 4. Save VisualAsset in repository
    const visualAsset = await this.assetRepo.createAsset({
      creativeJobId: job.id,
      assetRole: 'COMPOSITED_CREATIVE',
      mimeType: 'image/png',
      width,
      height,
      byteSize,
      sha256,
      storageKey,
      sourceProductAssetDigest: sha256,
      provider: 'sharp-hybrid-compositor',
      model: 'parisian-engine-v1',
    });

    // 5. Save VisualValidationResult in repository
    const validationStatus =
      validation.blockingCount > 0
        ? 'BLOCKED'
        : validation.warningCount > 0
          ? 'PASSED_WITH_WARNINGS'
          : 'PASSED';

    await this.validationRepo.persistResult({
      visualAssetId: visualAsset.id,
      validatorVersion: '1.0.0',
      status: validationStatus,
      findings: validation.findings.map((f) => ({
        code: f.code,
        severity: f.severity,
        message: f.message,
        field: f.field,
      })),
    });

    // 6. If validation passed and job was in REQUESTED, transition to READY_FOR_REVIEW
    if (validation.isPassed && job.status === 'REQUESTED') {
      try {
        await this.jobRepo.transitionStatus(job.id, 'REQUESTED', 'READY_FOR_REVIEW');
      } catch (e) {
        this.logger?.warn('Could not transition job status to READY_FOR_REVIEW', {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const previewStatus =
      validation.blockingCount > 0
        ? 'FAILED'
        : validation.warningCount > 0
          ? 'PASSED_WITH_WARNINGS'
          : 'PASSED';

    return {
      visualAssetId: visualAsset.id,
      storageKey,
      width,
      height,
      sha256,
      byteSize,
      mimeType: 'image/png',
      validationStatus: previewStatus,
      isPassed: validation.isPassed,
      findings: validation.findings,
      aestheticScore: validation.aestheticScore,
      previewUrl: `/v1/creative/renders/${visualAsset.id}/file`,
    };
  }

  private async renderSceneComposite(options: {
    readonly width: number;
    readonly height: number;
    readonly version: import('../domain/scene/creative-scene.types.js').CreativeSceneVersionRecord;
    readonly snapshot:
      import('../../products/application/product-snapshot.repository.js').ProductSnapshot | null;
  }): Promise<Buffer> {
    const { width, height, version, snapshot } = options;

    // Load fonts CSS
    const fontCss = FontRegistry.getInstance().getFontFaceCss();

    // Extract copy from layers
    const typoLayer = version.layers.find((l) => l.layerGroup === 'TYPOGRAPHY');
    const heroLayer = version.layers.find((l) => l.layerGroup === 'PRODUCT_HERO');

    const typoPayload = (typoLayer?.payload as unknown as Record<string, unknown>) ?? {};
    const headline =
      (typoPayload.headline as { text?: string; color?: string })?.text ??
      snapshot?.product?.product?.product_name ??
      'Parisian Atelier';
    const subhead =
      (typoPayload.subhead as { text?: string; color?: string })?.text ??
      snapshot?.product?.product?.brand ??
      'Eau de Parfum';
    const priceText =
      (typoPayload.priceTag as { text?: string; color?: string })?.text ??
      `$${Number(snapshot?.product?.product?.price ?? 0).toFixed(2)} USD`;

    const headlineColor = (typoPayload.headline as { color?: string })?.color ?? '#1C1A17';
    const subheadColor = (typoPayload.subhead as { color?: string })?.color ?? '#554F47';
    const priceColor = (typoPayload.priceTag as { color?: string })?.color ?? '#B59761';

    const heroBounds = heroLayer?.bounds ?? { x: 240, y: 300, width: 600, height: 600 };
    const typoBounds = typoLayer?.bounds ?? { x: 80, y: 920, width: width - 160, height: 140 };

    // Build SVG overlay
    const svgOverlay = `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      ${fontCss}
      .headline { font-family: 'Playfair Display', serif; font-size: 42px; font-weight: 700; fill: ${headlineColor}; }
      .subhead { font-family: 'Inter', sans-serif; font-size: 20px; font-weight: 500; fill: ${subheadColor}; }
      .price { font-family: 'Inter', sans-serif; font-size: 22px; font-weight: 700; fill: ${priceColor}; }
      .badge-bg { fill: #FAF8F5; stroke: #E6DFD5; stroke-width: 1.5; rx: 8; }
      .safe-frame { fill: none; stroke: rgba(181, 151, 97, 0.2); stroke-dasharray: 6 6; stroke-width: 1; }
    </style>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#F9F8F6"/>
      <stop offset="100%" stop-color="#EFECE6"/>
    </linearGradient>
    <radialGradient id="pedestalGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="rgba(0,0,0,0.18)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.0)"/>
    </radialGradient>
  </defs>

  <!-- Background Canvas -->
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#bgGrad)"/>

  <!-- Pedestal Grounding Shadow -->
  <ellipse cx="${heroBounds.x + heroBounds.width / 2}" cy="${heroBounds.y + heroBounds.height + 20}" rx="${heroBounds.width * 0.45}" ry="35" fill="url(#pedestalGrad)"/>

  <!-- Product Silhouette Mockup Box -->
  <rect x="${heroBounds.x}" y="${heroBounds.y}" width="${heroBounds.width}" height="${heroBounds.height}" rx="16" fill="rgba(240, 235, 226, 0.5)" stroke="#D4C9B8" stroke-width="2"/>
  <text x="${heroBounds.x + heroBounds.width / 2}" y="${heroBounds.y + heroBounds.height / 2}" font-family="Inter, sans-serif" font-size="18" fill="#8C8275" text-anchor="middle">
    [Product Hero: ${snapshot?.product?.product?.sku ?? 'HERO_CUTOUT'}]
  </text>

  <!-- Typography Block -->
  <g transform="translate(${typoBounds.x}, ${typoBounds.y})">
    <text x="0" y="40" class="headline">${this.escapeXml(headline)}</text>
    <text x="0" y="75" class="subhead">${this.escapeXml(subhead)}</text>
    <g transform="translate(0, 95)">
      <rect x="0" y="0" width="200" height="42" class="badge-bg"/>
      <text x="16" y="28" class="price">${this.escapeXml(priceText)}</text>
    </g>
  </g>
</svg>
`.trim();

    return sharp(Buffer.from(svgOverlay)).png({ compressionLevel: 8 }).toBuffer();
  }

  private escapeXml(unsafe: string): string {
    return unsafe.replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '&':
          return '&amp;';
        case "'":
          return '&apos;';
        case '"':
          return '&quot;';
        default:
          return c;
      }
    });
  }
}
