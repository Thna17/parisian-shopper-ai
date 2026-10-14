import { Inject, Injectable } from '@nestjs/common';
import {
  type ApplicationLogger,
  APPLICATION_LOGGER,
  type OutboxWriter,
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
import {
  ASSET_STORAGE,
  type AssetStoragePort,
} from './asset-storage.port.js';
import {
  CREATIVE_PROVIDER,
  type CreativeProvider,
} from './creative-provider.port.js';
import {
  HERO_COMPOSITOR,
  type HeroCompositor,
} from './hero-compositor.port.js';
import {
  CONTENT_GENERATION_REPOSITORY,
  type ContentGenerationRepository,
} from '../../content/application/content-generation.repository.js';
import {
  PRODUCT_SNAPSHOT_REPOSITORY,
  type ProductSnapshotRepository,
} from '../../products/application/product-snapshot.repository.js';
import {
  VALIDATION_REPOSITORY,
  type ValidationRepository,
} from '../../validation/application/validation.repository.js';
import {
  ContentVersionNotEligibleForCreativeError,
  AssetNotFoundError,
} from '../domain/creative-errors.js';
import { DEFAULT_DEVELOPMENT_PROFILE } from '../domain/visual-profile.js';

export interface GenerateCreativeInput {
  readonly contentVersionId: string;
  readonly requestedBy: string;
  readonly format?: 'FEED_SQUARE' | 'STORY_VERTICAL';
  readonly stylePreset?: string;
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
  ) {}

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
    const validationResult = await this.textValidationRepo.findLatestByContentVersion(contentVersionId);
    if (!validationResult || (validationResult.status !== 'PASSED' && validationResult.status !== 'PASSED_WITH_WARNINGS')) {
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

    // 2. Create CreativeJob entity in REQUESTED status
    const creativeJob = await this.jobRepo.createJob({
      contentVersionId,
      productSnapshotId: contentVersion.productSnapshotId,
      brandRuleVersionId: contentVersion.brandRuleVersionId,
      requestedByUserId: requestedBy,
      aspectRatio: geometry.aspectRatio,
      creativeProfile: input.stylePreset ?? DEFAULT_DEVELOPMENT_PROFILE.profileName,
    });

    try {
      // 3. Fetch hero product asset via AssetStoragePort
      // Resolve canonical hero product storage key (from snapshot images or primary convention)
      const images = snapshot.product.product.images;
      const primaryImage = images?.find((img) => img.role === 'primary') ?? images?.[0];
      const casKey = primaryImage?.sha256 && /^[0-9a-f]{64}$/i.test(primaryImage.sha256)
        ? `cas/${primaryImage.sha256.slice(0, 2)}/${primaryImage.sha256.slice(2, 4)}/${primaryImage.sha256}.png`
        : undefined;
      const productStorageKey = casKey ?? (primaryImage?.sha256
        ? `products/${primaryImage.sha256}.png`
        : `products/${snapshot.id}.png`);

      let canonicalProductBuffer: Buffer | null = null;
      if (casKey) {
        canonicalProductBuffer = await this.storage.getAssetBuffer(casKey).catch(() => null);
      }
      if (!canonicalProductBuffer) {
        canonicalProductBuffer = await this.storage.getAssetBuffer(productStorageKey).catch(() => null);
      }
      if (!canonicalProductBuffer && primaryImage?.sha256) {
        canonicalProductBuffer = await this.storage.getAssetBuffer(primaryImage.sha256).catch(() => null);
      }

      if (!canonicalProductBuffer) {
        throw new AssetNotFoundError(casKey ?? productStorageKey);
      }

      const resolvedStorageKey = casKey ?? productStorageKey;
      const productMetadata = await this.storage.getMetadata(resolvedStorageKey).catch(() => null);
      let canonicalProductSha256 = productMetadata?.sha256Digest ?? primaryImage?.sha256;
      if (!canonicalProductSha256) {
        const { createHash } = await import('node:crypto');
        canonicalProductSha256 = createHash('sha256').update(canonicalProductBuffer).digest('hex');
      }

      // Transition job: REQUESTED -> GENERATING_BACKGROUND
      await this.jobRepo.transitionStatus(creativeJob.id, 'REQUESTED', 'GENERATING_BACKGROUND');

      // 4. Call CreativeProviderPort to generate aesthetic background canvas
      const backgroundAsset = await this.provider.generateBackground({
        creativeJobId: creativeJob.id,
        contentVersionId,
        briefText: contentVersion.structuredOutput.creative_brief ?? snapshot.product.product.product_name,
        stylePrompt: input.stylePreset ?? DEFAULT_DEVELOPMENT_PROFILE.profileName,
        targetWidth: geometry.width,
        targetHeight: geometry.height,
        aspectRatio: geometry.aspectRatio,
        creativeProfile: input.stylePreset ?? DEFAULT_DEVELOPMENT_PROFILE.profileName,
      });

      const { createHash } = await import('node:crypto');
      const backgroundSha256 = createHash('sha256').update(backgroundAsset.imageBuffer).digest('hex');

      // Transition job: GENERATING_BACKGROUND -> COMPOSITING
      await this.jobRepo.transitionStatus(creativeJob.id, 'GENERATING_BACKGROUND', 'COMPOSITING');

      // 5. Call HeroCompositorPort (SharpHeroCompositor) to deterministically composite hero product over background
      const compositeResult = await this.compositor.composite({
        creativeJobId: creativeJob.id,
        canonicalProductBuffer,
        canonicalProductMimeType: productMetadata?.mimeType ?? 'image/png',
        canonicalProductSha256,
        backgroundBuffer: backgroundAsset.imageBuffer,
        backgroundMimeType: backgroundAsset.mimeType,
        backgroundSha256,
        targetWidth: geometry.width,
        targetHeight: geometry.height,
        aspectRatio: geometry.aspectRatio,
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
          heroScale: compositeResult.heroScale,
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
        provider: backgroundAsset.providerId,
        model: backgroundAsset.model,
        promptVersion: 'ps-prompt-v1',
        creativeBriefVersion: 'ps-brief-v1',
        sourceProductAssetDigest: canonicalProductSha256,
        backgroundAssetDigest: backgroundSha256,
      });

      // 8. Transition CreativeJob to VALIDATING status (ready for automated validation)
      const updatedJob = await this.jobRepo.transitionStatus(creativeJob.id, 'COMPOSITING', 'VALIDATING');

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

      this.logger.log(`Creative generated successfully for job ${creativeJob.id}, asset ${visualAsset.id}`);

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
