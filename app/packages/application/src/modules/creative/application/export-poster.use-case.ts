import { Inject, Injectable, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {
  type ApplicationLogger,
  APPLICATION_LOGGER,
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
import { ASSET_STORAGE, type AssetStoragePort } from './asset-storage.port.js';
import { POSTER_COMPOSITOR, type PosterCompositor } from './poster-compositor.port.js';
import { SharpPosterCompositor } from '../infrastructure/sharp-poster-compositor.adapter.js';
import {
  PRODUCT_SNAPSHOT_REPOSITORY,
  type ProductSnapshotRepository,
} from '../../products/application/product-snapshot.repository.js';
import {
  CREATIVE_APPROVAL_REPOSITORY,
  type CreativeApprovalRepository,
} from './creative-approval.repository.js';
import {
  CONTENT_GENERATION_REPOSITORY,
  type ContentGenerationRepository,
} from '../../content/application/content-generation.repository.js';
import {
  PosterCopyBuilder,
  type ProductFactsInput,
  type ValidatedContentInput,
} from '../domain/services/poster-copy-builder.js';
import { type PosterAspectRatio, type PosterTemplateId } from '../domain/poster-spec.js';
import {
  CreativeJobNotFoundError,
  VisualAssetNotFoundError,
  ProductAssetValidationError,
} from '../domain/creative-errors.js';

export type ExportFormat = 'SQUARE_1080' | 'PORTRAIT_1080_1350' | 'STORY_1080_1920';
export type ExportEncoding = 'PNG' | 'JPEG';

export interface ExportPosterInput {
  readonly creativeJobId: string;
  readonly visualAssetId?: string | undefined;
  readonly format: ExportFormat;
  readonly encoding: ExportEncoding;
  readonly quality?: number | undefined;
  readonly actorUserId: string;
  readonly actorRoles: readonly string[];
}

export interface ExportPosterResult {
  readonly buffer: Buffer;
  readonly mimeType: 'image/png' | 'image/jpeg';
  readonly filename: string;
  readonly width: number;
  readonly height: number;
  readonly sha256: string;
  readonly byteSize: number;
}

const FORMAT_CONFIG: Record<
  ExportFormat,
  { width: number; height: number; aspectRatio: PosterAspectRatio }
> = {
  SQUARE_1080: { width: 1080, height: 1080, aspectRatio: '1:1' },
  PORTRAIT_1080_1350: { width: 1080, height: 1350, aspectRatio: '4:5' },
  STORY_1080_1920: { width: 1080, height: 1920, aspectRatio: '9:16' },
};

/**
 * ExportPosterUseCase
 *
 * Implements high-resolution multi-format exports for approved posters.
 * Re-renders the deterministic layout engine at the target dimensions (1:1, 4:5, 9:16)
 * rather than stretching an existing raster bitmap.
 */
@Injectable()
export class ExportPosterUseCase {
  private readonly posterCompositor: PosterCompositor;

  public constructor(
    @Inject(CREATIVE_JOB_REPOSITORY)
    private readonly jobRepo: CreativeJobRepository,
    @Inject(VISUAL_ASSET_REPOSITORY)
    private readonly assetRepo: VisualAssetRepository,
    @Inject(ASSET_STORAGE)
    private readonly storage: AssetStoragePort,
    @Inject(PRODUCT_SNAPSHOT_REPOSITORY)
    private readonly snapshotRepo: ProductSnapshotRepository,
    @Inject(CONTENT_GENERATION_REPOSITORY)
    private readonly contentRepo: ContentGenerationRepository,
    @Inject(CREATIVE_APPROVAL_REPOSITORY)
    private readonly approvalRepo: CreativeApprovalRepository,
    @Inject(APPLICATION_LOGGER)
    private readonly logger: ApplicationLogger,
    @Optional()
    @Inject(POSTER_COMPOSITOR)
    posterCompositor?: PosterCompositor,
    @Optional()
    private readonly permissions: PermissionService = new PermissionService(),
  ) {
    this.posterCompositor = posterCompositor ?? new SharpPosterCompositor();
  }

  public async execute(input: ExportPosterInput): Promise<ExportPosterResult> {
    if (!this.permissions.hasAnyRolePermission(input.actorRoles, Permission.EXPORT_CREATIVE)) {
      throw new ForbiddenError({ publicMessage: 'Permission denied: Cannot export poster.' });
    }

    const config = FORMAT_CONFIG[input.format];
    if (!config) {
      throw new ValidationError({ publicMessage: `Unsupported export format: ${input.format}` });
    }

    const job = await this.jobRepo.findById(input.creativeJobId);
    if (!job) throw new CreativeJobNotFoundError(input.creativeJobId);

    if (job.status !== 'CREATIVE_APPROVED') {
      throw new ValidationError({
        publicMessage: `Creative job ${job.id} is not approved for export (current status: ${job.status})`,
      });
    }

    let asset: VisualAssetRecord | null = null;

    if (input.visualAssetId) {
      asset = await this.assetRepo.findById(input.visualAssetId);
      if (!asset) throw new VisualAssetNotFoundError(input.visualAssetId);

      if (asset.creativeJobId !== job.id) {
        throw new VisualAssetNotFoundError(asset.id);
      }

      const approvals = await this.approvalRepo.findByAssetId(asset.id);
      const isApproved = approvals.some(
        (event) =>
          event.creativeJobId === input.creativeJobId &&
          event.visualAssetId === asset!.id &&
          event.decision === 'CREATIVE_APPROVED',
      );
      if (!isApproved) {
        throw new ValidationError({
          publicMessage: `Visual asset ${asset.id} has not been approved for export.`,
        });
      }
    } else {
      const approvals = await this.approvalRepo.findByJobId(input.creativeJobId);
      const approvedEvents = approvals.filter(
        (event) =>
          event.creativeJobId === input.creativeJobId && event.decision === 'CREATIVE_APPROVED',
      );
      const distinctApprovedAssetIds = Array.from(
        new Set(approvedEvents.map((event) => event.visualAssetId)),
      );

      if (distinctApprovedAssetIds.length === 0) {
        throw new ValidationError({
          publicMessage: `Creative job ${job.id} has no approved visual asset for export.`,
        });
      }

      if (distinctApprovedAssetIds.length > 1) {
        throw new ValidationError({
          publicMessage: `Multiple distinct approved visual assets found for creative job ${job.id}. An explicit visualAssetId is required.`,
        });
      }

      const approvedAssetId = distinctApprovedAssetIds[0]!;
      asset = await this.assetRepo.findById(approvedAssetId);
      if (!asset) throw new VisualAssetNotFoundError(approvedAssetId);

      if (asset.creativeJobId !== job.id) {
        throw new VisualAssetNotFoundError(asset.id);
      }
    }

    const snapshot = await this.snapshotRepo.findById(job.productSnapshotId);
    if (!snapshot) throw new ValidationError({ publicMessage: 'Product snapshot not found.' });

    const contentVersion = await this.contentRepo.findVersionById(job.contentVersionId);
    if (!contentVersion) throw new ValidationError({ publicMessage: 'Content version not found.' });

    // Load authentic product buffer
    const productBuffer = await this.resolveProductBuffer(snapshot, asset.sourceProductAssetDigest);
    const productSha = createHash('sha256').update(productBuffer).digest('hex');

    // Load background buffer
    const backgroundBuffer = await this.resolveBackgroundBuffer(asset);
    const backgroundSha = createHash('sha256').update(backgroundBuffer).digest('hex');

    // Build format-specific poster spec
    const productFacts: ProductFactsInput = {
      sku: snapshot.product.product.sku,
      title: snapshot.product.product.product_name,
      brand: snapshot.product.product.brand,
      priceAmount: snapshot.product.product.price,
      currency: snapshot.product.product.currency ?? 'USD',
      volumeMl: snapshot.product.product.size
        ? parseFloat(snapshot.product.product.size.value) || 100
        : 100,
      ...(snapshot.product.product.fragrance_notes
        ? {
            fragranceNotes: {
              top: snapshot.product.product.fragrance_notes.top,
              heart: snapshot.product.product.fragrance_notes.heart,
              base: snapshot.product.product.fragrance_notes.base,
            },
          }
        : {}),
    };

    const validatedContent: ValidatedContentInput = {
      headline: contentVersion.structuredOutput.headline,
      secondaryHeadline: contentVersion.structuredOutput.english_caption ?? undefined,
      cta: contentVersion.structuredOutput.cta ?? undefined,
    };

    const templateId: PosterTemplateId =
      input.format === 'STORY_1080_1920' ? 'CENTERED_HERO' : 'EDITORIAL_SPLIT';

    const posterSpec = PosterCopyBuilder.buildSpec(productFacts, validatedContent, {
      templateId,
      aspectRatio: config.aspectRatio,
    });

    this.logger.log(
      `Re-rendering poster for export format ${input.format} (${config.width}x${config.height})`,
    );

    // Re-render poster at target dimensions without stretching
    const renderResult = await this.posterCompositor.renderPoster({
      creativeJobId: job.id,
      posterSpec,
      canonicalProductBuffer: productBuffer,
      canonicalProductMimeType: 'image/png',
      canonicalProductSha256: productSha,
      backgroundBuffer,
      backgroundMimeType: 'image/png',
      backgroundSha256: backgroundSha,
    });

    // Encode to requested output format
    let finalBuffer: Buffer;
    let mimeType: 'image/png' | 'image/jpeg';
    let ext: string;

    if (input.encoding === 'JPEG') {
      mimeType = 'image/jpeg';
      ext = 'jpg';
      finalBuffer = await sharp(renderResult.posterBuffer)
        .jpeg({ quality: input.quality ?? 95, mozjpeg: true })
        .toBuffer();
    } else {
      mimeType = 'image/png';
      ext = 'png';
      finalBuffer = await sharp(renderResult.posterBuffer).png({ compressionLevel: 9 }).toBuffer();
    }

    const sha256 = createHash('sha256').update(finalBuffer).digest('hex');
    const safeSku = snapshot.product.product.sku.replace(/[^A-Za-z0-9_-]/g, '_');
    const filename = `poster-${safeSku}-${config.width}x${config.height}.${ext}`;

    return {
      buffer: finalBuffer,
      mimeType,
      filename,
      width: config.width,
      height: config.height,
      sha256,
      byteSize: finalBuffer.length,
    };
  }

  private async resolveProductBuffer(
    snapshot: { product: { product: { sku: string } }; id: string },
    expectedSha256?: string,
  ): Promise<Buffer> {
    const sku = snapshot.product.product.sku;
    if (expectedSha256) {
      const casKey = `cas/${expectedSha256.slice(0, 2)}/${expectedSha256.slice(2, 4)}/${expectedSha256}.png`;
      const buf = await this.storage.getAssetBuffer(casKey).catch(() => null);
      if (buf) return buf;
    }

    const candidateFiles = [
      path.resolve('.data/assets/products', `${sku}.png`),
      path.resolve(process.cwd(), '.data/assets/products', `${sku}.png`),
      path.resolve('products', `${sku}.png`),
      path.resolve(process.cwd(), 'products', `${sku}.png`),
      path.resolve('.data/assets/products', `${snapshot.id}.png`),
    ];

    for (const file of candidateFiles) {
      if (fs.existsSync(file)) {
        const buf = await fs.promises.readFile(file);
        if (buf.length > 0) return buf;
      }
    }

    throw new ProductAssetValidationError(`Canonical product image missing for SKU ${sku}`);
  }

  private async resolveBackgroundBuffer(sourceAsset: VisualAssetRecord): Promise<Buffer> {
    if (sourceAsset.backgroundAssetDigest) {
      const casKey = `cas/${sourceAsset.backgroundAssetDigest.slice(0, 2)}/${sourceAsset.backgroundAssetDigest.slice(2, 4)}/${sourceAsset.backgroundAssetDigest}.png`;
      const buf = await this.storage.getAssetBuffer(casKey).catch(() => null);
      if (buf) return buf;
    }

    const posterBuf = await this.storage.getAssetBuffer(sourceAsset.storageKey).catch(() => null);
    if (posterBuf) return posterBuf;

    throw new ValidationError({ publicMessage: 'Background buffer could not be loaded.' });
  }
}
