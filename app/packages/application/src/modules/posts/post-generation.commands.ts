import { ProductMarketingEligibilityService } from '../products/application/product-marketing-eligibility.service.js';
import { BrandGuidanceService } from '../brand/application/brand-guidance.service.js';
import type { PinnedBrandGuidance } from '../brand/domain/brand-guidance.schema.js';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { AppConfigService } from '@parisian-shopper/config';
import { ConflictError, ForbiddenError } from '@parisian-shopper/common';
import {
  PRODUCT_ASSET_ELIGIBILITY_EVALUATOR,
  type ProductAssetEligibilityEvaluator,
} from '../products/application/product-asset-eligibility-evaluator.js';
import {
  POST_IMAGE_PROVIDER,
  type PostImageProvider,
  type PostImageSettings,
} from './post-image-provider.js';
import { PostWorkflowService } from './post-workflow.service.js';
import type { PostActor } from './post-policy.js';
import { readPostCreationPlan } from './post-creation-plan.js';

export const POST_GENERATION_REPOSITORY = Symbol('POST_GENERATION_REPOSITORY');
export interface PostGenerationState {
  id: string;
  status: string;
  provider: string;
  model: string;
  sourceRevisionNumber: number;
  requestId: string | null;
  provenance: unknown;
}
export interface PostGenerationCommandsRepository {
  latest(postId: string): Promise<PostGenerationState | null>;
  enqueue(
    id: string,
    expectedRevision: number,
    actor: PostActor,
    provider: string,
    settings: PostImageSettings,
    evidence: {
      productDigest: string;
      productAssetId: string;
      registrationId: string;
      historicalPostersUsed: false;
      externalReferences: never[];
    },
  ): Promise<unknown>;
}
/** Preparing a request is separate from quoting/authorizing a potentially charged submission. */
@Injectable()
export class PostGenerationCommands {
  constructor(
    private readonly posts: PostWorkflowService,
    @Inject(POST_GENERATION_REPOSITORY)
    private readonly generations: PostGenerationCommandsRepository,
    private readonly config: AppConfigService,
    @Inject(PRODUCT_ASSET_ELIGIBILITY_EVALUATOR)
    private readonly heroes: ProductAssetEligibilityEvaluator,
    @Optional() @Inject(POST_IMAGE_PROVIDER) private readonly provider?: PostImageProvider | null,
    @Optional() private readonly guidance?: BrandGuidanceService,
    @Optional() private readonly productMarketing?: ProductMarketingEligibilityService,
  ) {}
  async state(id: string, actor: PostActor): Promise<PostGenerationState | null> {
    const post = await this.posts.get(id, actor);
    const row = await this.generations.latest(id);
    if (
      !row ||
      (row.sourceRevisionNumber !== post.revisionNumber &&
        post.currentRevision.generationId !== row.id)
    )
      return null;
    return {
      id: row.id,
      status: row.status,
      provider: row.provider,
      model: row.model,
      sourceRevisionNumber: row.sourceRevisionNumber,
      requestId: row.requestId,
      provenance: row.provenance,
    };
  }
  async prepare(id: string, expectedRevision: number, actor: PostActor): Promise<void> {
    if (!actor.permissions.includes('EDIT_CONTENT') || !actor.permissions.includes('EDIT_CREATIVE'))
      throw new ForbiddenError({ publicMessage: 'You cannot prepare poster generation.' });
    const config = this.config.postImages;
    if (
      config.provider === 'disabled' ||
      (config.provider === 'higgsfield' &&
        (!this.config.featureFlags.AI_IMAGE_GENERATION ||
          !this.config.featureFlags.CREATIVE_GENERATION))
    )
      throw new ConflictError({
        publicMessage:
          'Poster creation is not connected. Ask an administrator to configure an application image provider.',
      });
    const post = await this.posts.get(id, actor);
    if (!post.caption && config.provider !== 'fake')
      throw new ConflictError({
        publicMessage:
          'Prepare the caption first: generate it using approved brand guidance, use a labeled template, or write it. Caption approval is not required before creating the poster.',
      });
    if (
      post.currentRevision.generationId ||
      (post.currentRevision.posterVersionId && post.currentRevision.visualAssetId)
    )
      throw new ConflictError({
        publicMessage:
          'This version already has a poster. Use Regenerate poster or New design to prepare another version before requesting its cost.',
      });
    if (this.productMarketing) {
      const r = post.currentRevision;
      await this.productMarketing.assert(
        {
          snapshotId: r.productSnapshotId,
          postId: id,
          creationPlan: r.creationPlan,
          brief: r.brief,
          campaignId: r.campaignId,
          caption: post.caption,
          action: 'GENERATE',
        },
        actor,
      );
    }
    if (post.currentRevision.brandSnapshot) {
      if (!this.guidance)
        throw new ConflictError({ publicMessage: 'Brand guidance verification is unavailable.' });
      await this.guidance.verifyPinned(post.currentRevision.brandSnapshot as PinnedBrandGuidance);
    }
    if (post.factualValidation?.blockingCount)
      throw new ConflictError({
        publicMessage:
          'Correct the caption factual findings before creating the poster. Human caption approval is not required.',
      });
    if (readPostCreationPlan(post.currentRevision.creationPlan).format === 'VIDEO')
      throw new ConflictError({
        publicMessage:
          'Video generation through the application MCP connection is not available yet. This video brief is saved; no credits have been used.',
      });
    const hero = await this.heroes
      .resolveAuthoritativeHeroEvidence(post.currentRevision.productSnapshot.sku)
      .catch(() => {
        throw new ConflictError({
          publicMessage:
            'This product needs an approved product photo before a poster can be created. Open its catalog facts and ask an authorized colleague to approve the photo and usage rights.',
        });
      });
    if (!this.provider || this.provider.id !== config.provider)
      throw new ConflictError({ publicMessage: 'The configured poster provider is unavailable.' });
    await this.generations.enqueue(
      id,
      expectedRevision,
      actor,
      this.provider.id,
      this.provider.settings,
      {
        productDigest: hero.asset.sha256,
        productAssetId: hero.asset.id,
        registrationId: hero.registration.id,
        historicalPostersUsed: false,
        externalReferences: [],
      },
    );
  }
}
