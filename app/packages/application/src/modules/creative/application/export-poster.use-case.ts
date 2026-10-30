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
  type OutboxWriter,
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
  CREATIVE_SCENE_REPOSITORY,
  type CreativeSceneRepository,
} from './creative-scene.repository.js';
import {
  CREATIVE_APPROVAL_REPOSITORY,
  type CreativeApprovalRepository,
} from './creative-approval.repository.js';
import {
  CONTENT_GENERATION_REPOSITORY,
  type ContentGenerationRepository,
} from '../../content/application/content-generation.repository.js';
import {
  CREATIVE_EXPORT_REPOSITORY,
  type CreativeExportRepository,
  type CreativeExportRecord,
} from './creative-export.repository.js';
import {
  HARD_VISUAL_GATES_ENGINE,
  HardVisualGatesEngine,
} from '../domain/services/hard-visual-gates.engine.js';
import { type TypographyBlockInput } from '../domain/services/hard-visual-gates.port.js';
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
  readonly outboxWriter?: OutboxWriter | undefined;
}

export interface ExportPosterResult {
  readonly buffer: Buffer;
  readonly mimeType: 'image/png' | 'image/jpeg';
  readonly filename: string;
  readonly width: number;
  readonly height: number;
  readonly sha256: string;
  readonly byteSize: number;
  readonly exportId?: string | undefined;
  readonly storageKey?: string | undefined;
  readonly validationStatus?: string | undefined;
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
    @Optional()
    @Inject(CREATIVE_EXPORT_REPOSITORY)
    private readonly exportRepo?: CreativeExportRepository,
    @Optional()
    @Inject(HARD_VISUAL_GATES_ENGINE)
    private readonly hardGatesEngine?: HardVisualGatesEngine,
    @Optional()
    @Inject('OUTBOX_WRITER')
    private readonly defaultOutboxWriter?: OutboxWriter,
    @Optional()
    @Inject(CREATIVE_SCENE_REPOSITORY)
    private readonly sceneRepo?: CreativeSceneRepository,
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

    // SceneVersionState verification (if scene exists)
    if (this.sceneRepo) {
      const scene = await this.sceneRepo.findByJobId(job.id);
      if (scene) {
        const sceneVersion = await this.sceneRepo.findVersionByNumber(
          scene.id,
          asset.versionNumber,
        );
        if (sceneVersion?.state) {
          if (sceneVersion.state.status !== 'APPROVED' || !sceneVersion.state.isExportEligible) {
            throw new ValidationError({
              publicMessage: `Scene version v${sceneVersion.versionNumber} is not approved for export (current state: ${sceneVersion.state.status}).`,
            });
          }
        }
        if (scene.currentVersionNumber > asset.versionNumber && !input.visualAssetId) {
          throw new ValidationError({
            publicMessage: `Cannot export unapproved scene revision: active scene revision is v${scene.currentVersionNumber}, while only v${asset.versionNumber} is approved.`,
          });
        }
      }
    }

    const snapshot = await this.snapshotRepo.findById(job.productSnapshotId);
    if (!snapshot) throw new ValidationError({ publicMessage: 'Product snapshot not found.' });

    const contentVersion = await this.contentRepo.findVersionById(job.contentVersionId);
    if (!contentVersion) throw new ValidationError({ publicMessage: 'Content version not found.' });

    // Idempotency check: Reuse existing export if already recorded in ledger and CAS
    if (this.exportRepo) {
      const existing = await this.exportRepo.findByAssetAndFormat(
        asset.id,
        input.format,
        input.encoding,
      );
      if (existing) {
        const cachedBuffer = await this.storage
          .getAssetBuffer(existing.storageKey)
          .catch(() => null);
        if (cachedBuffer) {
          this.logger.log(
            `Reusing existing cached export ${existing.id} for asset ${asset.id} (${input.format}, ${input.encoding})`,
          );
          const safeSku = snapshot.product.product.sku.replace(/[^A-Za-z0-9_-]/g, '_');
          const ext = input.encoding === 'JPEG' ? 'jpg' : 'png';
          const filename = `poster-${safeSku}-${config.width}x${config.height}.${ext}`;
          const mimeType = input.encoding === 'JPEG' ? 'image/jpeg' : 'image/png';
          return {
            buffer: cachedBuffer,
            mimeType,
            filename,
            width: existing.width,
            height: existing.height,
            sha256: existing.sha256,
            byteSize: existing.byteSize,
            exportId: existing.id,
            storageKey: existing.storageKey,
            validationStatus: existing.validationStatus,
          };
        }
      }
    }

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

    // Post-adaptation hard visual gate verification
    if (this.hardGatesEngine) {
      const heroElement = renderResult.layoutManifest.elements.find(
        (e) =>
          e.type === 'PRODUCT' ||
          e.id.toLowerCase().includes('hero') ||
          e.id.toLowerCase().includes('product'),
      );
      const ctaElement = renderResult.layoutManifest.elements.find(
        (e) => e.type === 'BUTTON' || e.id.toLowerCase().includes('cta'),
      );
      const typographyBlocks: TypographyBlockInput[] = renderResult.layoutManifest.elements
        .filter((e) => e.type === 'TEXT')
        .map((e) => ({
          role: e.id,
          text: e.text ?? '',
          box: e.boundingBox,
          textColor: (e as { textColor?: string }).textColor ?? '#1A1A1A',
        }));

      const gateOutcome = await this.hardGatesEngine.evaluate({
        assetBuffer: renderResult.posterBuffer,
        expectedSha256: renderResult.sha256,
        aspectRatio: config.aspectRatio,
        width: config.width,
        height: config.height,
        productAssetBuffer: productBuffer,
        productSha256: productSha,
        heroBoundingBox: heroElement?.boundingBox,
        ctaBoundingBox: ctaElement?.boundingBox,
        typographyBlocks: typographyBlocks.length > 0 ? typographyBlocks : undefined,
        productSnapshot: snapshot,
        factualInput: {
          productSnapshot: snapshot,
          typographyBlocks: typographyBlocks.length > 0 ? typographyBlocks : undefined,
          renderedSnapshotHash: snapshot.snapshotHash,
          sceneSku: snapshot.product.product.sku,
        },
        renderedSnapshotHash: snapshot.snapshotHash,
        sceneSku: snapshot.product.product.sku,
      });

      if (!gateOutcome.isPassed) {
        const failureMessages = gateOutcome.failures
          .map((f) => `[${f.code}] ${f.message}`)
          .join('; ');
        this.logger.warn(`Export failed post-adaptation hard visual gates: ${failureMessages}`);
        throw new ValidationError({
          publicMessage: `Export layout adaptation failed hard visual gates: ${failureMessages}`,
          details: { failures: gateOutcome.failures },
        });
      }
    }

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

    // Save to Content-Addressable Storage (CAS)
    let storageKey = `cas/${sha256.slice(0, 2)}/${sha256.slice(2, 4)}/${sha256}.${ext}`;
    try {
      const stored = await this.storage.saveAsset({
        buffer: finalBuffer,
        mimeType,
        assetRole: 'COMPOSITED_CREATIVE',
        width: config.width,
        height: config.height,
      });
      storageKey = stored.storageKey;
    } catch (err: unknown) {
      this.logger.warn(
        `Failed to store export in CAS, falling back to deterministic key: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Persist immutable export ledger record
    let exportRecord: CreativeExportRecord | null = null;
    if (this.exportRepo) {
      exportRecord = await this.exportRepo.createExport({
        creativeJobId: job.id,
        visualAssetId: asset.id,
        format: input.format,
        encoding: input.encoding,
        width: config.width,
        height: config.height,
        aspectRatio: config.aspectRatio,
        byteSize: finalBuffer.length,
        sha256,
        storageKey,
        quality: input.encoding === 'JPEG' ? (input.quality ?? 95) : undefined,
        validationStatus: 'PASSED',
        exportedByUserId: input.actorUserId,
      });
    }

    // Emit Outbox event: CREATIVE_EXPORTED
    const effectiveOutbox = input.outboxWriter ?? this.defaultOutboxWriter;
    if (effectiveOutbox && exportRecord) {
      await effectiveOutbox.append({
        topic: 'CREATIVE_EXPORTED',
        schemaVersion: 1,
        idempotencyKey: `creative-export:${exportRecord.id}:exported`,
        aggregateType: 'CreativeExport',
        aggregateId: exportRecord.id,
        payload: {
          exportId: exportRecord.id,
          creativeJobId: job.id,
          visualAssetId: asset.id,
          format: input.format,
          encoding: input.encoding,
          width: config.width,
          height: config.height,
          aspectRatio: config.aspectRatio,
          byteSize: finalBuffer.length,
          sha256,
          storageKey,
          exportedByUserId: input.actorUserId,
          validationStatus: exportRecord.validationStatus,
        },
        occurredAt: new Date(),
        availableAt: new Date(),
      });
      this.logger.log(
        `Emitted CREATIVE_EXPORTED outbox telemetry event for export ${exportRecord.id}`,
      );
    }

    return {
      buffer: finalBuffer,
      mimeType,
      filename,
      width: config.width,
      height: config.height,
      sha256,
      byteSize: finalBuffer.length,
      ...(exportRecord
        ? {
            exportId: exportRecord.id,
            storageKey: exportRecord.storageKey,
            validationStatus: exportRecord.validationStatus,
          }
        : {
            storageKey,
            validationStatus: 'PASSED',
          }),
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
