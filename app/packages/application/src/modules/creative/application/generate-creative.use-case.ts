import * as fs from 'node:fs';
import * as path from 'node:path';
import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  type ApplicationLogger,
  APPLICATION_LOGGER,
  type OutboxWriter,
  ApplicationError,
} from '@parisian-shopper/common';
import {
  CREATIVE_JOB_REPOSITORY,
  type CreativeJobRecord,
  type CreativeJobRepository,
} from './creative-job.repository.js';
import {
  VISUAL_ASSET_REPOSITORY,
  type VisualAssetRecord,
  type VisualAssetRepository,
} from './visual-asset.repository.js';
import { ASSET_STORAGE, type AssetStoragePort } from './asset-storage.port.js';
import { CREATIVE_PROVIDER, type CreativeProvider } from './creative-provider.port.js';
import { HERO_COMPOSITOR, type HeroCompositor } from './hero-compositor.port.js';
import {
  CONTENT_GENERATION_REPOSITORY,
  type ContentGenerationRepository,
} from '../../content/application/content-generation.repository.js';
import {
  PRODUCT_SNAPSHOT_REPOSITORY,
  type ProductSnapshotRepository,
} from '../../products/application/product-snapshot.repository.js';
import {
  PRODUCT_ASSET_ELIGIBILITY_EVALUATOR,
  ProductAssetEligibilityEvaluator,
} from '../../products/application/product-asset-eligibility-evaluator.js';
import {
  VALIDATION_REPOSITORY,
  type ValidationRepository,
} from '../../validation/application/validation.repository.js';
import {
  ContentVersionNotEligibleForCreativeError,
  CanonicalProductImageMissingError,
} from '../domain/creative-errors.js';
import { ProductAssetLegacyFallbackDisabledError } from '../../products/domain/product-asset-errors.js';
import { resolveStylePreset } from '../domain/style-presets.js';
import {
  PRODUCT_ASSET_VALIDATOR,
  ProductAssetValidator,
} from '../domain/services/product-asset-validator.js';
import {
  BACKGROUND_QUALITY_VALIDATOR,
  BackgroundQualityValidator,
} from '../domain/services/background-quality-validator.js';
import { deriveLayoutIntentForTemplate } from '../domain/layout-intent.js';
import { POSTER_COMPOSITOR, type PosterCompositor } from './poster-compositor.port.js';

export interface GenerateCreativeInput {
  readonly contentVersionId: string;
  readonly requestedBy: string;
  readonly format?: 'FEED_SQUARE' | 'STORY_VERTICAL';
  readonly stylePreset?: string;
  readonly templateId?: 'EDITORIAL_SPLIT' | 'CENTERED_HERO' | 'SCENT_STORY' | 'KHMER_SEASONAL';
  readonly conceptCount?: 1 | 2; // defaults to 1; 2 allowed only when explicitly requested
  readonly reuseBackgroundBuffer?: Buffer; // Zero-AI re-layout support
  readonly reuseBackgroundAssetId?: string; // Zero-AI re-layout support
  readonly outboxWriter?: OutboxWriter;
}

export interface GenerateCreativeResult {
  readonly creativeJob: CreativeJobRecord;
  readonly visualAsset: VisualAssetRecord;
}

const FORMAT_GEOMETRY = {
  FEED_SQUARE: { width: 1080, height: 1080, aspectRatio: '1:1' },
  STORY_VERTICAL: { width: 1080, height: 1920, aspectRatio: '9:16' },
} as const;

@Injectable()
export class GenerateCreativeUseCase {
  private readonly productAssetValidator: ProductAssetValidator;
  private readonly backgroundQualityValidator: BackgroundQualityValidator;
  private readonly posterCompositor?: PosterCompositor | undefined;

  public constructor(
    @Inject(CREATIVE_JOB_REPOSITORY)
    private readonly jobRepo: CreativeJobRepository,
    @Inject(VISUAL_ASSET_REPOSITORY)
    private readonly assetRepo: VisualAssetRepository,
    @Inject(ASSET_STORAGE)
    private readonly storage: AssetStoragePort,
    @Inject(CREATIVE_PROVIDER)
    private readonly provider: CreativeProvider,
    @Inject(HERO_COMPOSITOR)
    private readonly compositor: HeroCompositor,
    @Inject(CONTENT_GENERATION_REPOSITORY)
    private readonly contentRepo: ContentGenerationRepository,
    @Inject(PRODUCT_SNAPSHOT_REPOSITORY)
    private readonly snapshotRepo: ProductSnapshotRepository,
    @Inject(VALIDATION_REPOSITORY)
    private readonly textValidationRepo: ValidationRepository,
    @Inject(APPLICATION_LOGGER)
    private readonly logger: ApplicationLogger,
    @Optional()
    @Inject(PRODUCT_ASSET_VALIDATOR)
    productAssetValidator?: ProductAssetValidator,
    @Optional()
    @Inject(BACKGROUND_QUALITY_VALIDATOR)
    backgroundQualityValidator?: BackgroundQualityValidator,
    @Optional()
    @Inject(POSTER_COMPOSITOR)
    posterCompositor?: PosterCompositor,
    @Optional()
    @Inject(PRODUCT_ASSET_ELIGIBILITY_EVALUATOR)
    private readonly assetEligibilityEvaluator?: ProductAssetEligibilityEvaluator,
    @Optional()
    @Inject('ALLOW_LEGACY_PRODUCT_ASSET_FALLBACK')
    allowLegacyProductAssetFallback?: boolean,
  ) {
    this.productAssetValidator = productAssetValidator ?? new ProductAssetValidator();
    this.backgroundQualityValidator =
      backgroundQualityValidator ?? new BackgroundQualityValidator();
    this.allowLegacyProductAssetFallback =
      process.env.NODE_ENV === 'production' ? false : (allowLegacyProductAssetFallback ?? false);
  }

  private readonly allowLegacyProductAssetFallback: boolean;

  public async execute(input: GenerateCreativeInput): Promise<GenerateCreativeResult> {
    const { contentVersionId, requestedBy } = input;
    const format = input.format ?? 'FEED_SQUARE';
    const geometry = FORMAT_GEOMETRY[format] ?? FORMAT_GEOMETRY.FEED_SQUARE;

    // 1. Verify parent ContentVersion exists
    const contentVersion = await this.contentRepo.findVersionById(contentVersionId);
    if (!contentVersion) {
      throw new ContentVersionNotEligibleForCreativeError(
        contentVersionId,
        'Content version does not exist',
      );
    }

    // Verify parent ContentVersion is in VALIDATED or APPROVED state
    const validationResult =
      await this.textValidationRepo.findLatestByContentVersion(contentVersionId);
    if (
      !validationResult ||
      (validationResult.status !== 'PASSED' && validationResult.status !== 'PASSED_WITH_WARNINGS')
    ) {
      throw new ContentVersionNotEligibleForCreativeError(
        contentVersionId,
        `Content version validation status is '${validationResult?.status ?? 'UNVALIDATED'}'. Must be PASSED or PASSED_WITH_WARNINGS.`,
      );
    }

    // Fetch snapshot for brand, product, and canonical image details
    const snapshot = await this.snapshotRepo.findById(contentVersion.productSnapshotId);
    if (!snapshot) {
      throw new ContentVersionNotEligibleForCreativeError(
        contentVersionId,
        `Associated product snapshot ${contentVersion.productSnapshotId} not found`,
      );
    }

    // Look up parent job to inherit user's selected style preset from Telegram
    const parentJob = await this.contentRepo.findJobById(contentVersion.contentJobId);
    const category = snapshot.product.product.category;
    const requestedPresetKey = input.stylePreset ?? parentJob?.campaignContext;
    const preset = resolveStylePreset(requestedPresetKey, category);

    // 2. Resolve canonical hero product asset BEFORE creating paid creative job
    const sku = snapshot.product?.product?.sku;
    const images = snapshot.product?.product?.images;
    const primaryImage = images?.find((img) => img.role === 'primary') ?? images?.[0];
    let expectedSha256 =
      primaryImage?.sha256 && /^[0-9a-f]{64}$/i.test(primaryImage.sha256)
        ? primaryImage.sha256.toLowerCase()
        : undefined;

    let canonicalProductBuffer: Buffer | null = null;

    // Step 0: Governed Product Asset Registry (W12)
    if (this.assetEligibilityEvaluator && sku) {
      if (!this.allowLegacyProductAssetFallback) {
        // In production and whenever fallback is disabled: strictly require governed hero cutout
        const eligibility = await this.assetEligibilityEvaluator.evaluateHeroEligibility(sku);
        if (!eligibility.isEligible) {
          if (eligibility.reasonCode === 'NO_HERO_ASSET_REGISTERED') {
            throw new ProductAssetLegacyFallbackDisabledError(sku);
          }
          // For specific failure modes (opaque, unapproved, rights, etc.), throw the typed domain error
          await this.assetEligibilityEvaluator.assertHeroEligible(sku);
        }
        canonicalProductBuffer = eligibility.buffer!;
        expectedSha256 = eligibility.asset!.sha256;
      } else {
        const eligibility = await this.assetEligibilityEvaluator.evaluateHeroEligibility(sku);
        if (eligibility.isEligible && eligibility.buffer && eligibility.asset) {
          canonicalProductBuffer = eligibility.buffer;
          expectedSha256 = eligibility.asset.sha256;
        } else if (
          eligibility.reasonCode &&
          eligibility.reasonCode !== 'NO_HERO_ASSET_REGISTERED'
        ) {
          await this.assetEligibilityEvaluator.assertHeroEligible(sku);
        }
      }
    } else if (!this.allowLegacyProductAssetFallback) {
      throw new ProductAssetLegacyFallbackDisabledError(sku ?? 'UNKNOWN');
    }

    // Legacy fallback allowed ONLY when explicitly enabled (test/dev)
    if (!canonicalProductBuffer && this.allowLegacyProductAssetFallback) {
      const casKey = expectedSha256
        ? `cas/${expectedSha256.slice(0, 2)}/${expectedSha256.slice(2, 4)}/${expectedSha256}.png`
        : undefined;
      const productStorageKey =
        casKey ??
        (primaryImage?.sha256
          ? `products/${primaryImage.sha256}.png`
          : `products/${snapshot.id}.png`);

      if (casKey) {
        canonicalProductBuffer = await this.storage.getAssetBuffer(casKey).catch(() => null);
      }

      if (!canonicalProductBuffer) {
        const candidateFiles = [
          sku ? path.resolve('.data/assets/products', `${sku}.png`) : null,
          sku ? path.resolve(process.cwd(), '.data/assets/products', `${sku}.png`) : null,
          sku ? path.resolve('products', `${sku}.png`) : null,
          sku ? path.resolve(process.cwd(), 'products', `${sku}.png`) : null,
          path.resolve('.data/assets/products', `${snapshot.id}.png`),
          path.resolve(process.cwd(), '.data/assets/products', `${snapshot.id}.png`),
        ].filter((p): p is string => Boolean(p));

        for (const candidatePath of candidateFiles) {
          try {
            if (fs.existsSync(candidatePath)) {
              const fileBuf = await fs.promises.readFile(candidatePath);
              if (fileBuf && fileBuf.length > 0) {
                await this.storage
                  .saveAsset({
                    buffer: fileBuf,
                    mimeType: 'image/png',
                    assetRole: 'CANONICAL_PRODUCT',
                  })
                  .catch(() => null);
                canonicalProductBuffer = fileBuf;
                break;
              }
            }
          } catch {
            // continue search
          }
        }
      }

      if (!canonicalProductBuffer) {
        canonicalProductBuffer = await this.storage
          .getAssetBuffer(productStorageKey)
          .catch(() => null);
      }
      if (!canonicalProductBuffer && primaryImage?.sha256) {
        canonicalProductBuffer = await this.storage
          .getAssetBuffer(primaryImage.sha256)
          .catch(() => null);
      }
    }

    if (!canonicalProductBuffer) {
      if (!this.allowLegacyProductAssetFallback) {
        throw new ProductAssetLegacyFallbackDisabledError(sku ?? 'UNKNOWN');
      }
      throw new CanonicalProductImageMissingError(sku, {
        productSnapshotId: snapshot.id,
        expectedSha256,
      });
    }

    // Step 5: Validate authentic product asset (alpha, dimensions, ratios, no placeholders)
    const validatedAsset = await this.productAssetValidator.assertValid({
      assetBuffer: canonicalProductBuffer,
      expectedSku: sku ?? 'UNKNOWN_SKU',
      expectedSha256,
      mimeType: primaryImage ? 'image/png' : undefined,
    });

    const canonicalProductSha256 = validatedAsset.actualSha256;

    // 3. Create CreativeJob entity in REQUESTED status ONLY after hero asset is verified
    const creativeJob = await this.jobRepo.createJob({
      contentVersionId,
      productSnapshotId: contentVersion.productSnapshotId,
      brandRuleVersionId: contentVersion.brandRuleVersionId,
      requestedByUserId: requestedBy,
      aspectRatio: geometry.aspectRatio,
      creativeProfile: preset.id,
    });

    try {
      // Transition job: REQUESTED -> GENERATING_BACKGROUND
      await this.jobRepo.transitionStatus(creativeJob.id, 'REQUESTED', 'GENERATING_BACKGROUND');

      // 4. Derive LayoutIntent for template-aware background generation
      const templateId =
        input.templateId ??
        (preset.id === 'BOTANICAL_SCENT_STORY' || preset.id === 'SCENT_PYRAMID'
          ? 'SCENT_STORY'
          : preset.id === 'CAMBODIAN_IVORY_CELEBRATION' || preset.id === 'KHMER_CELEBRATION'
            ? 'KHMER_SEASONAL'
            : preset.id === 'PARISIAN_MORNING_ATELIER' || preset.id === 'ATELIER_HAUSSMANN'
              ? 'EDITORIAL_SPLIT'
              : 'CENTERED_HERO');

      const layoutIntent = deriveLayoutIntentForTemplate(
        templateId,
        geometry.width,
        geometry.height,
      );

      // Support zero-AI re-layout by reusing existing background asset if supplied
      let backgroundBuffer: Buffer | null = null;
      let backgroundMimeType: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png';
      let backgroundProviderId = this.provider.providerId;
      let backgroundModel = 'ai-imagegen';

      if (input.reuseBackgroundBuffer && input.reuseBackgroundBuffer.length > 0) {
        backgroundBuffer = input.reuseBackgroundBuffer;
        backgroundProviderId = 'reused_asset';
        backgroundModel = 'reused_background';
        this.logger.log(
          `Reusing existing background buffer for creative job ${creativeJob.id} with zero AI cost`,
        );
      } else if (input.reuseBackgroundAssetId) {
        const existingAsset = await this.assetRepo.findById(input.reuseBackgroundAssetId);
        if (existingAsset) {
          const loadedBuffer = await this.storage.getAssetBuffer(existingAsset.storageKey);
          if (loadedBuffer && loadedBuffer.length > 0) {
            backgroundBuffer = loadedBuffer;
            backgroundMimeType =
              (existingAsset.mimeType as 'image/png' | 'image/jpeg' | 'image/webp') || 'image/png';
            backgroundProviderId = existingAsset.provider ?? 'reused_asset';
            backgroundModel = existingAsset.model ?? 'reused_background';
            this.logger.log(`Reusing background from asset ${existingAsset.id} with zero AI cost`);
          }
        }
      }

      if (!backgroundBuffer) {
        // Enforce variant controls: default 1 concept; 2 allowed only when explicitly requested
        const conceptCount = input.conceptCount === 2 ? 2 : 1;
        this.logger.log(
          `Generating ${conceptCount} background concept(s) using preset ${preset.id} and template ${templateId}`,
        );

        // Category-generic prompt: strictly omits specific product name
        const briefText = preset.buildPrompt({ layoutIntent, category });
        const negativePrompt = preset.negativePrompt;

        const backgroundAsset = await this.provider.generateBackground({
          creativeJobId: creativeJob.id,
          contentVersionId,
          briefText,
          stylePrompt: preset.id,
          negativePrompt,
          targetWidth: geometry.width,
          targetHeight: geometry.height,
          aspectRatio: geometry.aspectRatio,
          creativeProfile: preset.id,
          layoutIntent,
        });

        backgroundBuffer = backgroundAsset.imageBuffer;
        backgroundMimeType = backgroundAsset.mimeType;
        backgroundProviderId = backgroundAsset.providerId;
        backgroundModel = backgroundAsset.model;
      }

      // Pre-composition Background Quality Validation
      const qualityResult = await this.backgroundQualityValidator.validateBackground({
        backgroundBuffer,
        expectedWidth: geometry.width,
        expectedHeight: geometry.height,
        expectedAspectRatio: geometry.aspectRatio,
        layoutIntent,
      });

      if (qualityResult.blockingCount > 0) {
        const issues = qualityResult.findings
          .filter((f) => f.severity === 'BLOCKING')
          .map((f) => f.message)
          .join('; ');
        throw new ApplicationError({
          code: 'AI_OUTPUT_INVALID',
          publicMessage: `AI-generated background failed quality control: ${issues}`,
          details: { findings: qualityResult.findings, metrics: qualityResult.metrics },
        });
      }

      const { createHash } = await import('node:crypto');
      const backgroundSha256 = createHash('sha256').update(backgroundBuffer).digest('hex');

      // Transition job: GENERATING_BACKGROUND -> COMPOSITING
      await this.jobRepo.transitionStatus(creativeJob.id, 'GENERATING_BACKGROUND', 'COMPOSITING');

      // 5. Call HeroCompositorPort (SharpHeroCompositor) to deterministically composite hero product over background
      const compositeResult = await this.compositor.composite({
        creativeJobId: creativeJob.id,
        canonicalProductBuffer,
        canonicalProductMimeType: validatedAsset.mimeType,
        canonicalProductSha256,
        backgroundBuffer,
        backgroundMimeType,
        backgroundSha256,
        targetWidth: geometry.width,
        targetHeight: geometry.height,
        aspectRatio: geometry.aspectRatio,
        heroPlacement: 'CENTER',
        pedestalYPercent: 0.72,
        enableContactShadow: true,
      });

      // 6. Persist composite asset via AssetStoragePort
      const storedComposite = await this.storage.saveAsset({
        buffer: compositeResult.compositedBuffer,
        mimeType: compositeResult.mimeType,
        assetRole: 'COMPOSITED_CREATIVE',
        width: compositeResult.width,
        height: compositeResult.height,
        metadata: {
          compositorVersion: compositeResult.compositorVersion,
          heroBoundingBox: compositeResult.heroBoundingBox,
          sourceBoundingBox: compositeResult.sourceBoundingBox,
          contactShadowBoundingBox: compositeResult.contactShadowBoundingBox,
          heroScale: compositeResult.heroScale,
          heroPlacement: compositeResult.heroPlacement,
          productDigest: compositeResult.productDigest,
          backgroundDigest: compositeResult.backgroundDigest,
        },
      });

      // 7. Record VisualAsset in database linked to CreativeJob
      const visualAsset = await this.assetRepo.createAsset({
        creativeJobId: creativeJob.id,
        assetRole: 'COMPOSITED_CREATIVE',
        mimeType: storedComposite.mimeType,
        width: compositeResult.width,
        height: compositeResult.height,
        byteSize: storedComposite.byteSize,
        sha256: storedComposite.sha256Digest,
        storageKey: storedComposite.storageKey,
        provider: backgroundProviderId,
        model: backgroundModel,
        promptVersion: 'ps-prompt-v1',
        creativeBriefVersion: 'ps-brief-v1',
        sourceProductAssetDigest: canonicalProductSha256,
        backgroundAssetDigest: backgroundSha256,
      });

      // 8. Transition CreativeJob to VALIDATING status (ready for automated validation)
      const updatedJob = await this.jobRepo.transitionStatus(
        creativeJob.id,
        'COMPOSITING',
        'VALIDATING',
      );

      // 9. Emit Outbox event: CREATIVE_GENERATED
      if (input.outboxWriter) {
        await input.outboxWriter.append({
          topic: 'CREATIVE_GENERATED',
          schemaVersion: 1,
          idempotencyKey: `creative-job:${creativeJob.id}:generated`,
          aggregateType: 'CreativeJob',
          aggregateId: creativeJob.id,
          payload: {
            creativeJobId: creativeJob.id,
            visualAssetId: visualAsset.id,
            contentVersionId,
            sha256: visualAsset.sha256,
            storageKey: visualAsset.storageKey,
          },
          occurredAt: new Date(),
          availableAt: new Date(),
        });
      }

      this.logger.log(
        `Creative generated successfully for job ${creativeJob.id}, asset ${visualAsset.id}`,
      );

      return {
        creativeJob: updatedJob,
        visualAsset,
      };
    } catch (error: unknown) {
      // If error occurs, transition job to FAILED if not already failed
      try {
        const latestJob = await this.jobRepo.findById(creativeJob.id);
        if (latestJob && latestJob.status !== 'FAILED') {
          await this.jobRepo.transitionStatus(creativeJob.id, latestJob.status, 'FAILED');
        }
      } catch (transitionErr) {
        this.logger.error(`Failed to transition job ${creativeJob.id} to FAILED`, {
          error: String(transitionErr),
        });
      }
      throw error;
    }
  }
}
