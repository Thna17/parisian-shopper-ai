import { Inject, Injectable, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  type ApplicationLogger,
  APPLICATION_LOGGER,
  ForbiddenError,
  ValidationError,
} from '@parisian-shopper/common';
import {
  CREATIVE_JOB_REPOSITORY,
  type CreativeJobRepository,
  type CreativeJobRecord,
} from './creative-job.repository.js';
import {
  VISUAL_ASSET_REPOSITORY,
  type VisualAssetRepository,
  type VisualAssetRecord,
} from './visual-asset.repository.js';
import {
  CREATIVE_REVISION_REPOSITORY,
  type CreativeRevisionRepository,
} from './creative-revision.repository.js';
import { ASSET_STORAGE, type AssetStoragePort } from './asset-storage.port.js';
import { POSTER_COMPOSITOR, type PosterCompositor } from './poster-compositor.port.js';
import { SharpPosterCompositor } from '../infrastructure/sharp-poster-compositor.adapter.js';
import { ValidateCreativeUseCase } from './validate-creative.use-case.js';
import {
  PRODUCT_SNAPSHOT_REPOSITORY,
  type ProductSnapshot,
  type ProductSnapshotRepository,
} from '../../products/application/product-snapshot.repository.js';
import {
  CONTENT_GENERATION_REPOSITORY,
  type ContentGenerationRepository,
  type ContentVersion,
} from '../../content/application/content-generation.repository.js';
import { CREATIVE_PROVIDER, type CreativeProvider } from './creative-provider.port.js';
import { ProductAssetValidator } from '../domain/services/product-asset-validator.js';
import { Permission, PermissionService } from '../../auth/domain/permissions.js';
import {
  PosterCopyBuilder,
  type ProductFactsInput,
  type ValidatedContentInput,
} from '../domain/services/poster-copy-builder.js';
import { type PosterTemplateId, type PosterSpec } from '../domain/poster-spec.js';
import { resolveStylePreset } from '../domain/style-presets.js';
import {
  CreativeJobNotFoundError,
  VisualAssetNotFoundError,
  ProductAssetValidationError,
} from '../domain/creative-errors.js';

export interface EditTextPosterInput {
  readonly creativeJobId: string;
  readonly sourceVisualAssetId?: string;
  readonly textEdits: {
    readonly headline?: string;
    readonly secondaryHeadline?: string;
    readonly supportingText?: string;
    readonly price?: string;
    readonly promotionalPrice?: string;
    readonly cta?: string;
    readonly size?: string;
    readonly concentration?: string;
  };
  readonly actorUserId: string;
  readonly actorRoles: readonly string[];
}

export interface EditLayoutPosterInput {
  readonly creativeJobId: string;
  readonly sourceVisualAssetId?: string;
  readonly templateId?: PosterTemplateId;
  readonly productPlacement?: 'LEFT' | 'CENTER' | 'RIGHT';
  readonly productScale?: number;
  readonly textAlignment?: 'LEFT' | 'CENTER' | 'RIGHT';
  readonly showPriceBadge?: boolean;
  readonly actorUserId: string;
  readonly actorRoles: readonly string[];
}

export interface ChangeStylePosterInput {
  readonly creativeJobId: string;
  readonly sourceVisualAssetId?: string;
  readonly stylePreset: string;
  readonly actorUserId: string;
  readonly actorRoles: readonly string[];
}

export interface NewBackgroundPosterInput {
  readonly creativeJobId: string;
  readonly sourceVisualAssetId?: string;
  readonly actorUserId: string;
  readonly actorRoles: readonly string[];
}

export interface ReplaceProductAssetInput {
  readonly creativeJobId: string;
  readonly sku: string;
  readonly assetBuffer: Buffer;
  readonly mimeType: string;
  readonly actorUserId: string;
  readonly actorRoles: readonly string[];
}

export interface RevisePosterResult {
  readonly visualAsset: VisualAssetRecord;
  readonly isPassed: boolean;
  readonly posterBuffer: Buffer;
}

interface LoadedPosterContext {
  readonly job: CreativeJobRecord;
  readonly sourceAsset: VisualAssetRecord;
  readonly snapshot: ProductSnapshot;
  readonly contentVersion: ContentVersion;
  readonly productBuffer: Buffer;
  readonly backgroundBuffer: Buffer;
  readonly baseSpec: PosterSpec;
  readonly category: string;
}

/**
 * RevisePosterUseCase
 *
 * Implements granular poster revisions:
 * - EDIT_TEXT: changes typography only, zero AI spend.
 * - EDIT_LAYOUT: changes template, placement, scale, text alignment, zero AI spend.
 * - CHANGE_STYLE: generates new background with new preset only after confirmation.
 * - NEW_BACKGROUND: generates fresh background, preserves approved copy and canonical product.
 * - REPLACE_PRODUCT_ASSET: validates transparency, dimensions, SKU association; never silent overwrite.
 *
 * Invariant: Every revision creates a new immutable VisualAsset version
 * linked to source version and revision reason.
 */
@Injectable()
export class RevisePosterUseCase {
  private readonly posterCompositor: PosterCompositor;
  private readonly assetValidator: ProductAssetValidator;

  public constructor(
    @Inject(CREATIVE_JOB_REPOSITORY)
    private readonly jobRepo: CreativeJobRepository,
    @Inject(VISUAL_ASSET_REPOSITORY)
    private readonly assetRepo: VisualAssetRepository,
    @Inject(CREATIVE_REVISION_REPOSITORY)
    private readonly revisionRepo: CreativeRevisionRepository,
    @Inject(ASSET_STORAGE)
    private readonly storage: AssetStoragePort,
    @Inject(PRODUCT_SNAPSHOT_REPOSITORY)
    private readonly snapshotRepo: ProductSnapshotRepository,
    @Inject(CONTENT_GENERATION_REPOSITORY)
    private readonly contentRepo: ContentGenerationRepository,
    private readonly validateCreative: ValidateCreativeUseCase,
    private readonly permissions: PermissionService,
    @Inject(APPLICATION_LOGGER)
    private readonly logger: ApplicationLogger,
    @Optional()
    @Inject(POSTER_COMPOSITOR)
    posterCompositor?: PosterCompositor,
    @Optional()
    @Inject(CREATIVE_PROVIDER)
    private readonly creativeProvider?: CreativeProvider,
  ) {
    this.posterCompositor = posterCompositor ?? new SharpPosterCompositor();
    this.assetValidator = new ProductAssetValidator();
  }

  // 1. EDIT TEXT (Zero AI calls)
  public async editText(input: EditTextPosterInput): Promise<RevisePosterResult> {
    if (!this.permissions.hasAnyRolePermission(input.actorRoles, Permission.EDIT_CREATIVE)) {
      throw new ForbiddenError({ publicMessage: 'Permission denied: Cannot edit creative.' });
    }

    this.logger.log(`Executing EDIT_TEXT poster revision for job ${input.creativeJobId}`);
    const { job, sourceAsset, productBuffer, backgroundBuffer, baseSpec } = await this.loadContext(
      input.creativeJobId,
      input.sourceVisualAssetId,
    );

    const updatedSpec: PosterSpec = {
      ...baseSpec,
      ...(input.textEdits.headline ? { headline: input.textEdits.headline } : {}),
      ...(input.textEdits.secondaryHeadline
        ? { secondaryHeadline: input.textEdits.secondaryHeadline }
        : {}),
      ...(input.textEdits.supportingText ? { supportingText: input.textEdits.supportingText } : {}),
      ...(input.textEdits.price ? { price: input.textEdits.price } : {}),
      ...(input.textEdits.promotionalPrice
        ? { promotionalPrice: input.textEdits.promotionalPrice }
        : {}),
      ...(input.textEdits.cta ? { cta: input.textEdits.cta } : {}),
      ...(input.textEdits.size ? { size: input.textEdits.size } : {}),
      ...(input.textEdits.concentration ? { concentration: input.textEdits.concentration } : {}),
    };

    return this.renderAndSaveVersion({
      jobId: job.id,
      sourceAsset,
      spec: updatedSpec,
      productBuffer,
      backgroundBuffer,
      revisionType: 'EDIT_BACKGROUND',
      instruction: 'EDIT_TEXT: Typography adjustment',
      actorUserId: input.actorUserId,
    });
  }

  // 2. EDIT LAYOUT (Zero AI calls)
  public async editLayout(input: EditLayoutPosterInput): Promise<RevisePosterResult> {
    if (!this.permissions.hasAnyRolePermission(input.actorRoles, Permission.EDIT_CREATIVE)) {
      throw new ForbiddenError({ publicMessage: 'Permission denied: Cannot edit creative.' });
    }

    this.logger.log(`Executing EDIT_LAYOUT poster revision for job ${input.creativeJobId}`);
    const { job, sourceAsset, productBuffer, backgroundBuffer, baseSpec } = await this.loadContext(
      input.creativeJobId,
      input.sourceVisualAssetId,
    );

    const targetTemplate = input.templateId ?? baseSpec.templateId;
    const updatedSpec: PosterSpec = {
      ...baseSpec,
      templateId: targetTemplate,
      productPlacement: input.productPlacement ?? baseSpec.productPlacement,
      textPlacement: input.textAlignment ?? baseSpec.textPlacement,
      decorativeSelection: {
        ...baseSpec.decorativeSelection,
        badge:
          input.showPriceBadge === false ? 'NONE' : (baseSpec.decorativeSelection?.badge ?? 'PILL'),
      },
    };

    return this.renderAndSaveVersion({
      jobId: job.id,
      sourceAsset,
      spec: updatedSpec,
      productBuffer,
      backgroundBuffer,
      revisionType: 'EDIT_BACKGROUND',
      instruction: `EDIT_LAYOUT: Switched template to ${targetTemplate}`,
      actorUserId: input.actorUserId,
    });
  }

  // 3. CHANGE STYLE (Requires prior user confirmation; generates 1 new AI background)
  public async changeStyle(input: ChangeStylePosterInput): Promise<RevisePosterResult> {
    if (!this.permissions.hasAnyRolePermission(input.actorRoles, Permission.REGENERATE_CREATIVE)) {
      throw new ForbiddenError({ publicMessage: 'Permission denied: Cannot regenerate creative.' });
    }

    this.logger.log(
      `Executing CHANGE_STYLE poster revision for job ${input.creativeJobId} with preset ${input.stylePreset}`,
    );
    const { job, sourceAsset, productBuffer, baseSpec, category } = await this.loadContext(
      input.creativeJobId,
      input.sourceVisualAssetId,
    );

    if (!this.creativeProvider) {
      throw new ValidationError({ publicMessage: 'Creative image provider is not configured.' });
    }

    const preset = resolveStylePreset(input.stylePreset, category);
    const briefText = preset.buildPrompt({ category });
    const negativePrompt = preset.negativePrompt;

    const backgroundAsset = await this.creativeProvider.generateBackground({
      creativeJobId: job.id,
      contentVersionId: job.contentVersionId,
      briefText,
      stylePrompt: preset.id,
      negativePrompt,
      targetWidth: baseSpec.outputFormat.width,
      targetHeight: baseSpec.outputFormat.height,
      aspectRatio: baseSpec.outputFormat.aspectRatio,
      creativeProfile: preset.id,
    });

    const bgStored = await this.storage.saveAsset({
      buffer: backgroundAsset.imageBuffer,
      mimeType: backgroundAsset.mimeType,
      assetRole: 'GENERATED_BACKGROUND',
      width: backgroundAsset.width,
      height: backgroundAsset.height,
    });

    return this.renderAndSaveVersion({
      jobId: job.id,
      sourceAsset,
      spec: baseSpec,
      productBuffer,
      backgroundBuffer: backgroundAsset.imageBuffer,
      revisionType: 'EDIT_BACKGROUND',
      instruction: `CHANGE_STYLE: Switched to preset ${preset.name}`,
      actorUserId: input.actorUserId,
      backgroundAssetDigest: bgStored.sha256Digest,
      provider: backgroundAsset.providerId,
      model: backgroundAsset.model,
    });
  }

  // 4. NEW BACKGROUND (Generates 1 new AI background with current preset)
  public async newBackground(input: NewBackgroundPosterInput): Promise<RevisePosterResult> {
    if (!this.permissions.hasAnyRolePermission(input.actorRoles, Permission.REGENERATE_CREATIVE)) {
      throw new ForbiddenError({ publicMessage: 'Permission denied: Cannot regenerate creative.' });
    }

    this.logger.log(`Executing NEW_BACKGROUND poster revision for job ${input.creativeJobId}`);
    const { job, sourceAsset, productBuffer, baseSpec, category } = await this.loadContext(
      input.creativeJobId,
      input.sourceVisualAssetId,
    );

    if (!this.creativeProvider) {
      throw new ValidationError({ publicMessage: 'Creative image provider is not configured.' });
    }

    const preset = resolveStylePreset(job.creativeProfile, category);
    const briefText = preset.buildPrompt({ category });
    const negativePrompt = preset.negativePrompt;

    const backgroundAsset = await this.creativeProvider.generateBackground({
      creativeJobId: job.id,
      contentVersionId: job.contentVersionId,
      briefText,
      stylePrompt: preset.id,
      negativePrompt,
      targetWidth: baseSpec.outputFormat.width,
      targetHeight: baseSpec.outputFormat.height,
      aspectRatio: baseSpec.outputFormat.aspectRatio,
      creativeProfile: preset.id,
    });

    const bgStored = await this.storage.saveAsset({
      buffer: backgroundAsset.imageBuffer,
      mimeType: backgroundAsset.mimeType,
      assetRole: 'GENERATED_BACKGROUND',
      width: backgroundAsset.width,
      height: backgroundAsset.height,
    });

    return this.renderAndSaveVersion({
      jobId: job.id,
      sourceAsset,
      spec: baseSpec,
      productBuffer,
      backgroundBuffer: backgroundAsset.imageBuffer,
      revisionType: 'REGENERATE_BACKGROUND',
      instruction: 'NEW_BACKGROUND: Generated fresh AI background concept',
      actorUserId: input.actorUserId,
      backgroundAssetDigest: bgStored.sha256Digest,
      provider: backgroundAsset.providerId,
      model: backgroundAsset.model,
    });
  }

  // 5. REPLACE PRODUCT ASSET (Authorized upload with transparency & SKU validation)
  public async replaceProductAsset(input: ReplaceProductAssetInput): Promise<RevisePosterResult> {
    if (!this.permissions.hasAnyRolePermission(input.actorRoles, Permission.CREATE_CONTENT)) {
      throw new ForbiddenError({
        publicMessage: 'Permission denied: Cannot upload product assets.',
      });
    }

    this.logger.log(
      `Validating and replacing canonical product asset for job ${input.creativeJobId} and SKU ${input.sku}`,
    );

    // Validate transparency and integrity
    const validationResult = await this.assetValidator.validate({
      assetBuffer: input.assetBuffer,
      expectedSku: input.sku,
      mimeType: input.mimeType,
    });

    if (!validationResult.isValid) {
      throw new ProductAssetValidationError(
        `Uploaded product image failed validation: ${validationResult.findings.join('; ')}`,
      );
    }

    // Save the new verified product image in CAS storage
    const newProductStorage = await this.storage.saveAsset({
      buffer: validationResult.trimmedBuffer,
      mimeType: 'image/png',
      assetRole: 'CANONICAL_PRODUCT',
    });

    const { job, sourceAsset, backgroundBuffer, baseSpec } = await this.loadContext(
      input.creativeJobId,
    );

    return this.renderAndSaveVersion({
      jobId: job.id,
      sourceAsset,
      spec: baseSpec,
      productBuffer: validationResult.trimmedBuffer,
      backgroundBuffer,
      revisionType: 'EDIT_BACKGROUND',
      instruction: `REPLACE_PRODUCT_ASSET: Verified PNG asset uploaded (hash: #${newProductStorage.sha256Digest.slice(0, 8)})`,
      actorUserId: input.actorUserId,
      sourceProductAssetDigest: newProductStorage.sha256Digest,
    });
  }

  // Common context loader
  private async loadContext(
    creativeJobId: string,
    sourceVisualAssetId?: string,
  ): Promise<LoadedPosterContext> {
    const job = await this.jobRepo.findById(creativeJobId);
    if (!job) throw new CreativeJobNotFoundError(creativeJobId);

    const sourceAsset = sourceVisualAssetId
      ? await this.assetRepo.findById(sourceVisualAssetId)
      : await this.assetRepo.findLatestByJobId(creativeJobId);

    if (!sourceAsset) {
      throw new VisualAssetNotFoundError(sourceVisualAssetId ?? creativeJobId);
    }

    const snapshot = await this.snapshotRepo.findById(job.productSnapshotId);
    if (!snapshot) {
      throw new ValidationError({ publicMessage: 'Product snapshot not found.' });
    }

    const contentVersion = await this.contentRepo.findVersionById(job.contentVersionId);
    if (!contentVersion) {
      throw new ValidationError({ publicMessage: 'Content version not found.' });
    }

    // Resolve canonical product buffer
    const productBuffer = await this.resolveProductBuffer(
      snapshot,
      sourceAsset.sourceProductAssetDigest,
    );

    // Resolve background buffer
    const backgroundBuffer = await this.resolveBackgroundBuffer(sourceAsset);

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

    const baseSpec = PosterCopyBuilder.buildSpec(productFacts, validatedContent, {
      templateId: 'EDITORIAL_SPLIT',
      aspectRatio: job.aspectRatio === '9:16' ? '9:16' : '1:1',
    });

    return {
      job,
      sourceAsset,
      snapshot,
      contentVersion,
      productBuffer,
      backgroundBuffer,
      baseSpec,
      category: snapshot.product.product.category,
    };
  }

  private async renderAndSaveVersion(params: {
    jobId: string;
    sourceAsset: VisualAssetRecord;
    spec: PosterSpec;
    productBuffer: Buffer;
    backgroundBuffer: Buffer;
    revisionType: 'EDIT_BACKGROUND' | 'REGENERATE_BACKGROUND';
    instruction: string;
    actorUserId: string;
    backgroundAssetDigest?: string;
    sourceProductAssetDigest?: string;
    provider?: string;
    model?: string;
  }): Promise<RevisePosterResult> {
    const productSha =
      params.sourceProductAssetDigest ??
      createHash('sha256').update(params.productBuffer).digest('hex');
    const backgroundSha =
      params.backgroundAssetDigest ??
      createHash('sha256').update(params.backgroundBuffer).digest('hex');

    // Deterministic re-composition (0 AI calls)
    const renderResult = await this.posterCompositor.renderPoster({
      creativeJobId: params.jobId,
      posterSpec: params.spec,
      canonicalProductBuffer: params.productBuffer,
      canonicalProductMimeType: 'image/png',
      canonicalProductSha256: productSha,
      backgroundBuffer: params.backgroundBuffer,
      backgroundMimeType: 'image/png',
      backgroundSha256: backgroundSha,
    });

    // Save newly composited poster to CAS storage
    const storedPoster = await this.storage.saveAsset({
      buffer: renderResult.posterBuffer,
      mimeType: 'image/png',
      assetRole: 'COMPOSITED_CREATIVE',
    });

    // Create revision request record
    const revision = await this.revisionRepo.createRequest({
      creativeJobId: params.jobId,
      sourceVisualAssetId: params.sourceAsset.id,
      requestedByUserId: params.actorUserId,
      type: params.revisionType,
      instruction: params.instruction,
    });

    // Create new immutable VisualAsset record
    const newAsset = await this.assetRepo.createAsset({
      creativeJobId: params.jobId,
      assetRole: 'COMPOSITED_CREATIVE',
      mimeType: 'image/png',
      width: renderResult.width,
      height: renderResult.height,
      byteSize: renderResult.posterBuffer.length,
      sha256: storedPoster.sha256Digest,
      storageKey: storedPoster.storageKey,
      provider: params.provider ?? params.sourceAsset.provider ?? 'POSTER_COMPOSITOR',
      model: params.model ?? params.sourceAsset.model ?? 'deterministic',
      sourceProductAssetDigest: productSha,
      backgroundAssetDigest: backgroundSha,
    });

    // Mark revision completed
    await this.revisionRepo.completeRequest(revision.id, newAsset.id);

    // Run deterministic visual validation on the new asset
    const validation = await this.validateCreative.execute({
      creativeJobId: params.jobId,
      visualAssetId: newAsset.id,
    });

    return {
      visualAsset: newAsset,
      isPassed: validation.isPassed,
      posterBuffer: renderResult.posterBuffer,
    };
  }

  private async resolveProductBuffer(
    snapshot: ProductSnapshot,
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
