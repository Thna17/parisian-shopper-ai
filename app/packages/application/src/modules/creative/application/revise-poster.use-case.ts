import { Inject, Injectable, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  type ApplicationLogger,
  APPLICATION_LOGGER,
  type OutboxWriter,
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
import { isTerminalCreativeStatus } from '../domain/creative.js';
import {
  type InvalidationAssessment,
  type RevisionPlan,
  RevisionTargetType,
} from '../domain/revision/revision-plan.types.js';
import { SelectiveInvalidationEngine } from '../domain/revision/selective-invalidation.engine.js';
import {
  AmbiguousRevisionError,
  CreativeJobNotFoundError,
  CreativeStaleVersionError,
  CreativeTerminalStateError,
  LayerDriftViolationError,
  ProductAssetValidationError,
  VisualAssetNotFoundError,
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
  readonly outboxWriter?: OutboxWriter;
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
  readonly outboxWriter?: OutboxWriter;
}

export interface ChangeStylePosterInput {
  readonly creativeJobId: string;
  readonly sourceVisualAssetId?: string;
  readonly stylePreset: string;
  readonly actorUserId: string;
  readonly actorRoles: readonly string[];
  readonly outboxWriter?: OutboxWriter;
}

export interface NewBackgroundPosterInput {
  readonly creativeJobId: string;
  readonly sourceVisualAssetId?: string;
  readonly actorUserId: string;
  readonly actorRoles: readonly string[];
  readonly outboxWriter?: OutboxWriter;
}

export interface ReplaceProductAssetInput {
  readonly creativeJobId: string;
  readonly sku: string;
  readonly assetBuffer: Buffer;
  readonly mimeType: string;
  readonly actorUserId: string;
  readonly actorRoles: readonly string[];
  readonly outboxWriter?: OutboxWriter;
}

export interface ExecuteRevisionPlanInput {
  readonly creativeJobId: string;
  readonly plan: RevisionPlan;
  readonly actorUserId: string;
  readonly actorRoles: readonly string[];
  readonly sourceVisualAssetId?: string;
  readonly confirmed?: boolean;
  readonly productAssetBuffer?: Buffer;
  readonly productAssetMimeType?: string;
  readonly expectedSku?: string;
  readonly outboxWriter?: OutboxWriter;
}

export interface RevisePosterResult {
  readonly visualAsset: VisualAssetRecord;
  readonly isPassed: boolean;
  readonly posterBuffer: Buffer;
  readonly invalidationAssessment?: InvalidationAssessment;
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
  private readonly invalidationEngine: SelectiveInvalidationEngine;

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
    this.invalidationEngine = new SelectiveInvalidationEngine();
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
      ...(input.outboxWriter !== undefined ? { outboxWriter: input.outboxWriter } : {}),
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
      ...(input.outboxWriter !== undefined ? { outboxWriter: input.outboxWriter } : {}),
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
      ...(input.outboxWriter !== undefined ? { outboxWriter: input.outboxWriter } : {}),
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
      ...(input.outboxWriter !== undefined ? { outboxWriter: input.outboxWriter } : {}),
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
      ...(input.outboxWriter !== undefined ? { outboxWriter: input.outboxWriter } : {}),
    });
  }

  // 6. EXECUTE STRUCTURED REVISION PLAN (W31-D: Targeted Layer Compositing & Hash Preservation)
  public async executePlan(input: ExecuteRevisionPlanInput): Promise<RevisePosterResult> {
    const { plan, actorRoles, actorUserId, creativeJobId } = input;

    // 1. Authorization: check permissions based on execution strategy
    if (plan.executionStrategy === 'AI_BACKGROUND_REGEN') {
      if (!this.permissions.hasAnyRolePermission(actorRoles, Permission.REGENERATE_CREATIVE)) {
        throw new ForbiddenError({
          publicMessage: 'Permission denied: Cannot regenerate creative.',
        });
      }
    } else if (plan.executionStrategy === 'PRODUCT_ASSET_SWAP') {
      if (!this.permissions.hasAnyRolePermission(actorRoles, Permission.CREATE_CONTENT)) {
        throw new ForbiddenError({
          publicMessage: 'Permission denied: Cannot upload product assets.',
        });
      }
    } else {
      if (!this.permissions.hasAnyRolePermission(actorRoles, Permission.EDIT_CREATIVE)) {
        throw new ForbiddenError({ publicMessage: 'Permission denied: Cannot edit creative.' });
      }
    }

    // 2. Ambiguity & Confirmation invariant
    if (plan.requiresConfirmation && input.confirmed !== true) {
      throw new AmbiguousRevisionError(
        plan.confirmationReason ?? 'Proposed revision plan requires confirmation before execution',
        { planId: plan.id },
      );
    }

    this.logger.log(
      `Executing structured revision plan [${plan.id}] for job ${creativeJobId} (strategy: ${plan.executionStrategy})`,
    );

    // 3. Load Context
    const { job, sourceAsset, snapshot, productBuffer, backgroundBuffer, baseSpec, category } =
      await this.loadContext(creativeJobId, input.sourceVisualAssetId);

    // 4. Optimistic concurrency & base version verification
    const latestAsset = await this.assetRepo.findLatestByJobId(creativeJobId);
    const activeVersion = latestAsset?.versionNumber ?? sourceAsset.versionNumber;
    if (
      plan.baseVersionNumber !== undefined &&
      (plan.baseVersionNumber !== sourceAsset.versionNumber ||
        plan.baseVersionNumber !== activeVersion)
    ) {
      throw new CreativeStaleVersionError(
        `Target visual asset version (${activeVersion}) does not match expected revision base version (${plan.baseVersionNumber})`,
      );
    }

    // 5. Gather current cryptographic digests
    const previousDigests: Record<string, string> = {};
    if (sourceAsset.sourceProductAssetDigest) {
      previousDigests['PRODUCT_HERO'] = sourceAsset.sourceProductAssetDigest;
      previousDigests['HERO_CUTOUT'] = sourceAsset.sourceProductAssetDigest;
    }
    if (sourceAsset.backgroundAssetDigest) {
      previousDigests['BACKGROUND'] = sourceAsset.backgroundAssetDigest;
      previousDigests['GENERATED_BACKGROUND'] = sourceAsset.backgroundAssetDigest;
    }

    // 6. Compute selective invalidation assessment
    const invalidationAssessment = this.invalidationEngine.assessInvalidation({
      mutations: plan.mutations,
      currentDigests: previousDigests,
    });

    // 7. Apply targeted mutations to PosterSpec
    let updatedSpec: PosterSpec = { ...baseSpec };
    for (const mutation of plan.mutations) {
      switch (mutation.target) {
        case RevisionTargetType.HEADLINE:
          updatedSpec = { ...updatedSpec, headline: String(mutation.requestedValue) };
          break;
        case RevisionTargetType.SUBHEAD:
          updatedSpec = { ...updatedSpec, secondaryHeadline: String(mutation.requestedValue) };
          break;
        case RevisionTargetType.PRICE:
          updatedSpec = { ...updatedSpec, price: String(mutation.requestedValue) };
          break;
        case RevisionTargetType.PROMOTIONAL_PRICE:
          updatedSpec = { ...updatedSpec, promotionalPrice: String(mutation.requestedValue) };
          break;
        case RevisionTargetType.CTA:
          updatedSpec = { ...updatedSpec, cta: String(mutation.requestedValue) };
          break;
        case RevisionTargetType.PRODUCT_PLACEMENT:
          updatedSpec = {
            ...updatedSpec,
            productPlacement: mutation.requestedValue as 'LEFT' | 'CENTER' | 'RIGHT',
          };
          break;
        case RevisionTargetType.PRODUCT_SCALE: {
          const prevIntent =
            typeof updatedSpec.layoutIntent === 'object' && updatedSpec.layoutIntent !== null
              ? updatedSpec.layoutIntent
              : {};
          updatedSpec = {
            ...updatedSpec,
            layoutIntent: {
              ...prevIntent,
              productScale: Number(mutation.requestedValue),
            },
          };
          break;
        }
        case RevisionTargetType.TEMPLATE:
          updatedSpec = {
            ...updatedSpec,
            templateId: mutation.requestedValue as PosterTemplateId,
          };
          break;
        case RevisionTargetType.ASPECT_RATIO: {
          const ratio = mutation.requestedValue === '9:16' ? '9:16' : '1:1';
          updatedSpec = {
            ...updatedSpec,
            outputFormat: {
              ...updatedSpec.outputFormat,
              aspectRatio: ratio,
            },
          };
          break;
        }
        default:
          break;
      }
    }

    // 8. Resolve assets & digests per execution strategy
    let effectiveProductBuffer: Buffer;
    let effectiveProductSha: string;
    let effectiveBgBuffer: Buffer;
    let effectiveBgSha: string;
    let provider: string | undefined;
    let model: string | undefined;

    if (plan.executionStrategy === 'AI_BACKGROUND_REGEN') {
      if (!this.creativeProvider) {
        throw new ValidationError({ publicMessage: 'Creative image provider is not configured.' });
      }

      const styleMutation = plan.mutations.find(
        (m) => m.target === RevisionTargetType.STYLE_PRESET,
      );
      const preset = styleMutation
        ? resolveStylePreset(String(styleMutation.requestedValue), category)
        : resolveStylePreset(job.creativeProfile, category);

      const briefText = preset.buildPrompt({ category });
      const negativePrompt = preset.negativePrompt;

      const backgroundAsset = await this.creativeProvider.generateBackground({
        creativeJobId: job.id,
        contentVersionId: job.contentVersionId,
        briefText,
        stylePrompt: preset.id,
        negativePrompt,
        targetWidth: updatedSpec.outputFormat.width,
        targetHeight: updatedSpec.outputFormat.height,
        aspectRatio: updatedSpec.outputFormat.aspectRatio,
        creativeProfile: preset.id,
      });

      const bgStored = await this.storage.saveAsset({
        buffer: backgroundAsset.imageBuffer,
        mimeType: backgroundAsset.mimeType,
        assetRole: 'GENERATED_BACKGROUND',
        width: backgroundAsset.width,
        height: backgroundAsset.height,
      });

      effectiveBgBuffer = backgroundAsset.imageBuffer;
      effectiveBgSha = bgStored.sha256Digest;
      provider = backgroundAsset.providerId;
      model = backgroundAsset.model;

      effectiveProductBuffer = productBuffer;
      effectiveProductSha =
        sourceAsset.sourceProductAssetDigest ??
        createHash('sha256').update(productBuffer).digest('hex');
    } else if (plan.executionStrategy === 'PRODUCT_ASSET_SWAP') {
      if (!input.productAssetBuffer) {
        throw new ValidationError({
          publicMessage: 'Product asset buffer is required for PRODUCT_ASSET_SWAP.',
        });
      }

      const validationResult = await this.assetValidator.validate({
        assetBuffer: input.productAssetBuffer,
        expectedSku: input.expectedSku ?? snapshot.product.product.sku,
        mimeType: input.productAssetMimeType ?? 'image/png',
      });

      if (!validationResult.isValid) {
        throw new ProductAssetValidationError(
          `Uploaded product image failed validation: ${validationResult.findings.join('; ')}`,
        );
      }

      const newProductStorage = await this.storage.saveAsset({
        buffer: validationResult.trimmedBuffer,
        mimeType: 'image/png',
        assetRole: 'CANONICAL_PRODUCT',
      });

      effectiveProductBuffer = validationResult.trimmedBuffer;
      effectiveProductSha = newProductStorage.sha256Digest;

      effectiveBgBuffer = backgroundBuffer;
      effectiveBgSha =
        sourceAsset.backgroundAssetDigest ??
        createHash('sha256').update(backgroundBuffer).digest('hex');
    } else {
      // ZERO_AI_COMPOSITE, CANVAS_REFORMAT, etc.
      effectiveProductBuffer = productBuffer;
      effectiveProductSha =
        sourceAsset.sourceProductAssetDigest ??
        createHash('sha256').update(productBuffer).digest('hex');

      effectiveBgBuffer = backgroundBuffer;
      effectiveBgSha =
        sourceAsset.backgroundAssetDigest ??
        createHash('sha256').update(backgroundBuffer).digest('hex');
    }

    // 9. Zero-drift hash continuity verification
    const actualDigests: Record<string, string> = {
      PRODUCT_HERO: effectiveProductSha,
      HERO_CUTOUT: effectiveProductSha,
      BACKGROUND: effectiveBgSha,
      GENERATED_BACKGROUND: effectiveBgSha,
    };

    const driftCheck = this.invalidationEngine.verifyLayerDriftGuarantees({
      plan,
      previousDigests,
      actualDigests,
    });

    if (!driftCheck.isIntact) {
      throw new LayerDriftViolationError(driftCheck.violations.join('; '), {
        violations: driftCheck.violations,
      });
    }

    if (
      !invalidationAssessment.affectedLayerGroups.includes('PRODUCT_HERO') &&
      sourceAsset.sourceProductAssetDigest &&
      effectiveProductSha !== sourceAsset.sourceProductAssetDigest
    ) {
      throw new LayerDriftViolationError(
        `Product hero layer drift detected on non-targeted layer: expected ${sourceAsset.sourceProductAssetDigest}, got ${effectiveProductSha}`,
      );
    }

    if (
      !invalidationAssessment.affectedLayerGroups.includes('BACKGROUND') &&
      sourceAsset.backgroundAssetDigest &&
      effectiveBgSha !== sourceAsset.backgroundAssetDigest
    ) {
      throw new LayerDriftViolationError(
        `Background layer drift detected on non-targeted layer: expected ${sourceAsset.backgroundAssetDigest}, got ${effectiveBgSha}`,
      );
    }

    // 10. Re-composite & persist new immutable version
    const revisionType =
      plan.executionStrategy === 'AI_BACKGROUND_REGEN'
        ? 'REGENERATE_BACKGROUND'
        : 'EDIT_BACKGROUND';

    return this.renderAndSaveVersion({
      jobId: job.id,
      sourceAsset,
      spec: updatedSpec,
      productBuffer: effectiveProductBuffer,
      backgroundBuffer: effectiveBgBuffer,
      revisionType,
      instruction: `[${plan.id}] ${plan.rawInstruction}`,
      actorUserId,
      backgroundAssetDigest: effectiveBgSha,
      sourceProductAssetDigest: effectiveProductSha,
      provider,
      model,
      invalidationAssessment,
      plan,
      ...(input.outboxWriter !== undefined ? { outboxWriter: input.outboxWriter } : {}),
    });
  }

  // Common context loader
  private async loadContext(
    creativeJobId: string,
    sourceVisualAssetId?: string,
  ): Promise<LoadedPosterContext> {
    const job = await this.jobRepo.findById(creativeJobId);
    if (!job) throw new CreativeJobNotFoundError(creativeJobId);

    if (isTerminalCreativeStatus(job.status)) {
      throw new CreativeTerminalStateError(job.status);
    }

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
    backgroundAssetDigest?: string | undefined;
    sourceProductAssetDigest?: string | undefined;
    provider?: string | undefined;
    model?: string | undefined;
    invalidationAssessment?: InvalidationAssessment | undefined;
    plan?: RevisionPlan | undefined;
    outboxWriter?: OutboxWriter | undefined;
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

    // Emit enriched outbox event if outboxWriter is provided
    if (params.outboxWriter) {
      await params.outboxWriter.append({
        topic: 'CREATIVE_REVISED',
        schemaVersion: 1,
        idempotencyKey: `creative-job:${params.jobId}:revised:${newAsset.id}`,
        aggregateType: 'CreativeJob',
        aggregateId: params.jobId,
        payload: {
          creativeJobId: params.jobId,
          visualAssetId: newAsset.id,
          previousVisualAssetId: params.sourceAsset.id,
          versionNumber: newAsset.versionNumber,
          baseVersionNumber: params.sourceAsset.versionNumber,
          revisionType: params.revisionType,
          instruction: params.instruction,
          actorUserId: params.actorUserId,
          sha256: newAsset.sha256,
          storageKey: newAsset.storageKey,
          ...(params.plan !== undefined
            ? {
                planId: params.plan.id,
                rawInstruction: params.plan.rawInstruction,
                executionStrategy: params.plan.executionStrategy,
                mutations: params.plan.mutations,
              }
            : {}),
          ...(params.invalidationAssessment !== undefined
            ? {
                invalidationAssessment: {
                  invalidatedGateCodes: params.invalidationAssessment.invalidatedGateCodes,
                  preservedGateCodes: params.invalidationAssessment.preservedGateCodes,
                  invalidatedApprovalDomains:
                    params.invalidationAssessment.invalidatedApprovalDomains,
                  preservedApprovalDomains: params.invalidationAssessment.preservedApprovalDomains,
                  affectedLayerGroups: params.invalidationAssessment.affectedLayerGroups,
                  preservedLayerDigests: params.invalidationAssessment.preservedLayerDigests,
                },
              }
            : {}),
        },
        occurredAt: new Date(),
        availableAt: new Date(),
      });
    }

    // Run deterministic visual validation on the new asset
    const validation = await this.validateCreative.execute({
      creativeJobId: params.jobId,
      visualAssetId: newAsset.id,
    });

    return {
      visualAsset: newAsset,
      isPassed: validation.isPassed,
      posterBuffer: renderResult.posterBuffer,
      ...(params.invalidationAssessment
        ? { invalidationAssessment: params.invalidationAssessment }
        : {}),
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
