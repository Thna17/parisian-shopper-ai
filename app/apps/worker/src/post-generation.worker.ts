import { ProductMarketingEligibilityService } from '@parisian-shopper/application';
import {
  BrandGuidanceService,
  type PinnedBrandGuidance,
  type PosterSpec,
} from '@parisian-shopper/application';
import { McpBeforeSubmitError } from '@parisian-shopper/creative-providers';
import { createHash } from 'node:crypto';
import {
  Inject,
  Injectable,
  Optional,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import {
  ASSET_STORAGE,
  POSTER_COMPOSITOR,
  POST_IMAGE_PROVIDER,
  PRODUCT_ASSET_ELIGIBILITY_EVALUATOR,
  DeterministicVisualValidator,
  VisualSafetyScanner,
  type AssetStoragePort,
  type PosterCompositor,
  type PostImageProvider,
  ProductAssetEligibilityEvaluator,
  validateOutputForLanguage,
} from '@parisian-shopper/application';
import { AppConfigService } from '@parisian-shopper/config';
import { PrismaPostGenerationRepository } from '@parisian-shopper/database';

@Injectable()
export class PostGenerationWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(
    private readonly ledger: PrismaPostGenerationRepository,
    private readonly config: AppConfigService,
    @Inject(POST_IMAGE_PROVIDER) private readonly provider: PostImageProvider | null,
    @Inject(PRODUCT_ASSET_ELIGIBILITY_EVALUATOR)
    private readonly heroes: ProductAssetEligibilityEvaluator,
    @Inject(ASSET_STORAGE) private readonly storage: AssetStoragePort,
    @Inject(POSTER_COMPOSITOR) private readonly compositor: PosterCompositor,
    @Optional() private readonly guidance?: BrandGuidanceService,
    @Optional() private readonly productMarketing?: ProductMarketingEligibilityService,
  ) {}
  onModuleInit(): void {
    if (this.provider)
      this.timer = setInterval(() => {
        void this.tick().catch(() => undefined);
      }, 3000);
  }
  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
  async tick(): Promise<void> {
    if (this.running || !this.provider) return;
    this.running = true;
    try {
      await this.process();
    } finally {
      this.running = false;
    }
  }
  private async process(): Promise<void> {
    const provider = this.provider!;
    const row = await this.ledger.claim(provider.id, this.config.postImages.confirmedRequestId);
    if (!row?.claimToken) return;
    const token = row.claimToken;
    let stage = row.status;
    try {
      const source = await this.ledger.source(row.id);
      const product = source.productSnapshot;
      const brand = source.brandSnapshot as unknown as PinnedBrandGuidance | null;
      if (brand) {
        if (!this.guidance) throw new Error('Brand verification is unavailable.');
        await this.guidance.verifyPinned(brand);
        if (!brand.guidance.channels[source.channel])
          throw new Error('The approved profile has no layout for this channel.');
      }
      if (product.lifecycleStatus !== 'active')
        throw new Error('This product is no longer active in the catalog.');
      if (
        JSON.stringify(row.settings) !==
        JSON.stringify(JSON.parse(JSON.stringify(provider.settings)))
      ) {
        // JSONB key ordering is not stable. Compare individual settings below instead.
        const frozen = row.settings as Record<string, unknown>;
        if (Object.entries(provider.settings).some(([key, value]) => frozen[key] !== value))
          throw new Error('The selected image configuration changed.');
      }
      const hero = await this.heroes.resolveAuthoritativeHeroEvidence(product.sku);
      const pinned = row.provenance as Record<string, unknown> | null;
      if (pinned?.productDigest && pinned.productDigest !== hero.asset.sha256)
        throw new Error('The pinned approved product image changed.');
      const evidence = {
        productSnapshotId: product.id,
        snapshotDigest: product.snapshotHash,
        productAssetId: hero.asset.id,
        registrationId: hero.registration.id,
        assessmentId: hero.assessment.id,
        approvalEventId: hero.approvalEvent.id,
        rightsEventId: hero.rightsEvent.id,
        productDigest: hero.asset.sha256,
        captionMethod:
          (source.captionProvenance as { method?: string } | null)?.method ??
          (source.captionDraft
            ? 'STAFF_DRAFT'
            : source.captionVersion
              ? 'LINKED_CAPTION_VERSION'
              : 'MOCK_CAPTION'),
        captionGenerationId: source.captionGenerationId,
        captionProvenance: source.captionProvenance,
        creationPlan: source.creationPlan,
        historicalPostersUsed: false,
        brandProfile: brand,
        referenceGuidedImage: false,
        imageInputReferences: [],
        referenceGuided: false,
        externalReferences: [],
        ...(provider.id === 'higgsfield_mcp'
          ? {
              billingUnit: 'Higgsfield MCP credits',
              creditQuote: JSON.parse(JSON.stringify(row.creditQuote)) as typeof row.creditQuote,
            }
          : {}),
        kind:
          provider.id === 'fake' || provider.testOnly
            ? 'MOCK'
            : 'GENERATED_BACKGROUND_WITH_AUTHENTIC_PRODUCT',
      };
      const suggestedCaption = {
        headline: product.productName,
        english_caption:
          source.language === 'KM'
            ? null
            : `${product.productName} by ${product.brand}. ${product.currency} ${product.price.toFixed(2)}.`,
        khmer_caption:
          source.language === 'EN'
            ? null
            : `${product.productName} ពី ${product.brand}។ តម្លៃ ${product.price.toFixed(2)} ${product.currency}។`,
        cta: 'Contact Parisian Shopper for details.',
        hashtags: ['#ParisianShopper'],
        creative_brief: source.brief || 'Product presentation',
        facts_used: [
          `sku:${product.sku}`,
          `name:${product.productName}`,
          `brand:${product.brand}`,
          `price:${product.price.toFixed(2)} ${product.currency}`,
        ],
        warnings: ['Catalog-based suggested caption. Human review required.'],
        missing_information: [],
      };
      const savedCaption =
        source.captionDraft ??
        source.captionVersion?.structuredOutput ??
        source.generation?.caption;
      if (!savedCaption && provider.id !== 'fake' && !provider.testOnly)
        throw new Error(
          'Prepare an AI caption, a labeled template or staff caption before creating the poster.',
        );
      const caption = validateOutputForLanguage(savedCaption ?? suggestedCaption, source.language);
      if (stage === 'PREPARING') {
        if (
          provider.id !== 'fake' &&
          (!this.config.featureFlags.AI_IMAGE_GENERATION ||
            !this.config.featureFlags.CREATIVE_GENERATION)
        )
          throw new Error('Image creation is disabled.');
        const authorization = row.authorization as { expiresAt?: string } | null;
        if (
          provider.id !== 'fake' &&
          provider.id !== 'higgsfield_mcp' &&
          (this.config.postImages.confirmedRequestId !== row.id ||
            !authorization?.expiresAt ||
            Date.parse(authorization.expiresAt) < Date.now())
        )
          throw new Error(
            'This exact request has not been confirmed with a current quote and balance.',
          );
        if (this.productMarketing)
          await this.productMarketing.assert(
            {
              snapshotId: source.productSnapshotId,
              postId: source.postId,
              creationPlan: source.creationPlan,
              brief: source.brief,
              campaignId: source.campaignId,
              action: 'GENERATE',
            },
            { id: source.authorUserId, permissions: ['VIEW_OWN_CONTENT'] },
          );
        if (brand) await this.guidance!.verifyPinned(brand);
        await this.ledger.update(row.id, token, {
          caption,
          provenance: JSON.parse(JSON.stringify(evidence)) as Parameters<
            PrismaPostGenerationRepository['complete']
          >[2]['provenance'],
          status: 'SUBMITTING',
        });
        stage = 'SUBMITTING';
        const submitted = await provider.submit(row.prompt, row.id);
        // Persist the ID BEFORE polling. If this write fails, never submit again.
        await this.ledger.update(row.id, token, {
          requestId: submitted.requestId,
          status: 'GENERATING',
        });
        row.requestId = submitted.requestId;
        stage = 'GENERATING';
      } else {
        const old = row.provenance as Record<string, unknown> | null;
        if (
          old?.productDigest !== hero.asset.sha256 ||
          old?.registrationId !== hero.registration.id
        )
          throw new Error(
            'The approved product image changed. Ask an administrator to review this result.',
          );
      }
      let backgroundKey = row.backgroundKey;
      if (!backgroundKey) {
        if (!row.requestId) throw new Error('No saved image request ID is available.');
        const status = await provider.status(row.requestId);
        if (status.state === 'generating') {
          await this.ledger.update(row.id, token, {
            status: 'GENERATING',
            error: null,
            leaseUntil: new Date(Date.now() + 10_000),
          });
          return;
        }
        if (status.state === 'failed') {
          await this.ledger.update(row.id, token, {
            status: 'FAILED',
            error: status.reason,
            leaseUntil: null,
          });
          return;
        }
        const bytes = await provider.download(status.imageUrl);
        const saved = await this.storage.saveAsset({
          buffer: bytes,
          mimeType: 'image/png',
          assetRole: 'GENERATED_BACKGROUND',
        });
        backgroundKey = saved.storageKey;
        await this.ledger.update(row.id, token, {
          backgroundKey,
          status: 'COMPOSITING',
          ...(status.actualCostUsd !== undefined ? { actualCostUsd: status.actualCostUsd } : {}),
        });
      } else await this.ledger.update(row.id, token, { status: 'COMPOSITING' });
      stage = 'COMPOSITING';
      if (brand) await this.guidance!.verifyPinned(brand);
      const background = await this.storage.getAssetBuffer(backgroundKey);
      if (!background) throw new Error('The saved background could not be loaded.');
      const channelLayout = brand?.guidance.channels[source.channel];
      const posterSpec: PosterSpec = {
        templateId: channelLayout?.templateId ?? 'EDITORIAL_SPLIT',
        outputFormat: { aspectRatio: '1:1' as const, width: 1080, height: 1080 },
        language: source.language,
        headline: product.productName.slice(0, 45),
        price: product.price.toFixed(2),
        currency: product.currency,
        cta: brand
          ? source.language === 'KM'
            ? brand.guidance.ctaKhmer
            : brand.guidance.ctaEnglish
          : 'PARISIAN SHOPPER',
        productPlacement: channelLayout?.productPlacement ?? 'RIGHT',
        textPlacement: channelLayout?.textPlacement ?? 'LEFT',
        ...(brand
          ? {
              logoAssetRef: {
                brandName: brand.guidance.textOnlyBrandName,
                ...(brand.logo ? { storageKey: brand.logo.media[0]!.storageKey } : {}),
              },
            }
          : {}),
        palette: {
          id: 'parisian-neutral',
          textColor: channelLayout?.textColor ?? '#FFFFFF',
          accentColor: channelLayout?.accentColor ?? '#C6A768',
          secondaryTextColor: '#F5F1EA',
          panelBackground: channelLayout?.panelBackground ?? '#20313D',
        },
        commercialProvenance: {
          productSnapshotId: product.id,
          snapshotDigest: product.snapshotHash,
          priceValue: product.price.toFixed(2),
          currency: product.currency,
        },
      };
      const logoBuffer = brand?.logo ? await this.guidance!.logo(brand) : undefined;
      if (brand?.logo && !logoBuffer) throw new Error('Approved logo bytes are unavailable.');
      const image = await this.compositor.renderPoster({
        creativeJobId: row.id,
        posterSpec,
        canonicalProductBuffer: hero.buffer,
        canonicalProductMimeType: hero.asset.mimeType,
        canonicalProductSha256: hero.asset.sha256,
        ...(logoBuffer && brand?.logo
          ? { logoBuffer, logoMimeType: brand.logo.media[0]!.mimeType }
          : {}),
        backgroundBuffer: background,
        backgroundMimeType: 'image/png',
        backgroundSha256: createHash('sha256').update(background).digest('hex'),
      });
      const visualCheck = await new DeterministicVisualValidator().validate({
        assetBuffer: image.posterBuffer,
        expectedSha256: image.sha256,
        targetAspectRatio: '1:1',
        targetWidth: 1080,
        targetHeight: 1080,
        productAssetBuffer: hero.buffer,
        productSha256: hero.asset.sha256,
      });
      const safetyCheck = new VisualSafetyScanner().scan({
        promptMetadata: {
          briefText: source.brief,
          overlayText: `${posterSpec.headline} ${posterSpec.price} ${posterSpec.cta}`,
        },
      });
      if (
        visualCheck.blockingCount ||
        safetyCheck.blockingCount ||
        !['PASSED', 'PASSED_WITH_WARNINGS'].includes(visualCheck.status)
      )
        throw new Error('Poster checks failed.');
      const saved = await this.storage.saveAsset({
        buffer: image.posterBuffer,
        mimeType: image.mimeType,
        assetRole: 'COMPOSITED_CREATIVE',
        width: image.width,
        height: image.height,
      });
      await this.ledger.complete(row.id, token, {
        caption,
        provenance: {
          ...(JSON.parse(JSON.stringify(evidence)) as Parameters<
            PrismaPostGenerationRepository['complete']
          >[2]['provenance']),
          checks: {
            visual: {
              status: visualCheck.status,
              blockingCount: visualCheck.blockingCount,
              validatorVersion: visualCheck.validatorVersion,
              findings: visualCheck.findings.map((f) => ({
                code: f.code,
                severity: f.severity,
                message: f.message,
              })),
            },
            safety: {
              status: safetyCheck.status,
              blockingCount: safetyCheck.blockingCount,
              findings: safetyCheck.findings.map((f) => ({ code: f.code, message: f.message })),
            },
            caption:
              (source.captionProvenance as { method?: string } | null)?.method ??
              (savedCaption ? 'SAVED_CAPTION_SCHEMA_VALIDATED' : 'MOCK_CAPTION'),
          },
          posterSpec: JSON.parse(JSON.stringify(posterSpec)) as Parameters<
            PrismaPostGenerationRepository['complete']
          >[2]['provenance'],
          compositorVersion: image.compositorVersion,
          productDigest: image.productDigest,
          backgroundDigest: image.backgroundDigest,
          outputDigest: image.outputDigest,
        },
        imageKey: saved.storageKey,
        imageSha256: saved.sha256Digest,
      });
    } catch (error) {
      // Errors after dispatch are ambiguous unless a documented terminal response was observed.
      const uncertain =
        !(error instanceof McpBeforeSubmitError) &&
        ['SUBMITTING', 'GENERATING', 'UNCERTAIN'].includes(stage);
      await this.ledger.update(row.id, token, {
        status: uncertain ? 'UNCERTAIN' : 'FAILED',
        error:
          error instanceof McpBeforeSubmitError
            ? error.message
            : uncertain
              ? 'The image service outcome needs checking. Your request will not be submitted again.'
              : 'The draft could not be prepared or saved. Check the approved product image and contact an administrator.',
        leaseUntil: uncertain ? new Date(Date.now() + 30_000) : null,
      });
    }
  }
}
