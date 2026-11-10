import {
  ProductMarketingEligibilityService,
  type ProductMarketingCheck,
} from '../products/application/product-marketing-eligibility.service.js';
import { createHash } from 'node:crypto';
import { BrandGuidanceService } from '../brand/application/brand-guidance.service.js';
import type { PinnedBrandGuidance } from '../brand/domain/brand-guidance.schema.js';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConflictError, ForbiddenError, ValidationError } from '@parisian-shopper/common';
import {
  ASSET_STORAGE,
  type AssetStoragePort,
} from '../creative/application/asset-storage.port.js';
import {
  PRODUCT_ASSET_ELIGIBILITY_EVALUATOR,
  type ProductAssetEligibilityEvaluator,
} from '../products/application/product-asset-eligibility-evaluator.js';
import { readPostCreationPlan, type PostCreationPlan } from './post-creation-plan.js';
import {
  POST_REPOSITORY,
  type PostRepository,
  type PostWorkflowView,
  type PostListView,
  type SavePostInput,
  type PostDecision,
} from './post-workflow.port.js';
import type { PostActor } from './post-policy.js';

/** Both transports call these commands; repositories retain atomic version/decision enforcement. */
@Injectable()
export class PostWorkflowService<
  T extends PostWorkflowView = PostWorkflowView,
  L = PostListView,
  C = unknown,
> {
  constructor(
    @Inject(POST_REPOSITORY) private readonly posts: PostRepository<T, L, C>,
    @Inject(PRODUCT_ASSET_ELIGIBILITY_EVALUATOR)
    private readonly heroes: ProductAssetEligibilityEvaluator,
    @Inject(ASSET_STORAGE) private readonly storage: AssetStoragePort,
    @Optional() private readonly guidance?: BrandGuidanceService,
    @Optional() private readonly productMarketing?: ProductMarketingEligibilityService,
  ) {}
  async productCheck(
    id: string,
    actor: PostActor,
    recheck = false,
  ): Promise<ProductMarketingCheck> {
    const post = await this.get(id, actor);
    if (!this.productMarketing)
      throw new ConflictError({ publicMessage: 'Product eligibility checking is not connected.' });
    const r = post.currentRevision;
    return this.productMarketing.check(
      {
        snapshotId: r.productSnapshotId,
        creationPlan: r.creationPlan,
        brief: r.brief,
        campaignId: r.campaignId,
        postId: id,
        action: 'DRAFT',
        recheck,
      },
      actor,
    );
  }
  async refreshProductFacts(id: string, expectedRevision: number, actor: PostActor): Promise<T> {
    const post = await this.get(id, actor);
    if (
      !post.canEdit ||
      post.creatorUserId !== actor.id ||
      expectedRevision !== post.revisionNumber
    )
      throw new ConflictError({
        publicMessage: 'Open an editable current version before updating its product facts.',
      });
    if (!this.productMarketing)
      throw new ConflictError({ publicMessage: 'Product checking is unavailable.' });
    const r = post.currentRevision;
    const current = await this.productMarketing.latestRevisionFacts(
      {
        snapshotId: r.productSnapshotId,
        postId: id,
        creationPlan: r.creationPlan,
        action: 'DRAFT',
      },
      actor,
    );
    if (current === r.productSnapshotId) return post;
    return this.revise(
      id,
      expectedRevision,
      {
        productSnapshotId: current,
        brief: r.brief,
        channel: r.channel as SavePostInput['channel'],
        language: r.language as SavePostInput['language'],
        campaignId: r.campaignId,
        creationPlan: readPostCreationPlan(r.creationPlan),
        captionDraft: null,
        captionVersionId: null,
        posterVersionId: null,
        visualAssetId: null,
        generationId: null,
      },
      actor,
    );
  }
  private readable(actor: PostActor): void {
    if (!actor.permissions.includes('VIEW_OWN_CONTENT'))
      throw new ForbiddenError({ publicMessage: 'You cannot access posts.' });
  }
  private validateInput(input: SavePostInput): void {
    if (
      typeof input.brief !== 'string' ||
      input.brief.length > 2000 ||
      !['FACEBOOK', 'INSTAGRAM', 'TELEGRAM', 'GENERIC'].includes(input.channel) ||
      !['KM', 'EN', 'BILINGUAL'].includes(input.language) ||
      (input.requestKey !== undefined &&
        (!input.requestKey.trim() || input.requestKey.length > 160))
    )
      throw new ValidationError({
        publicMessage: 'Use valid post details and a brief of at most 2,000 characters.',
      });
    try {
      readPostCreationPlan(input.creationPlan);
    } catch {
      throw new ValidationError({
        publicMessage: 'Choose a supported content purpose, format and design style.',
      });
    }
  }
  create(input: SavePostInput, actor: PostActor): Promise<T> {
    this.readable(actor);
    this.validateInput(input);
    return this.posts.create(input, actor);
  }
  get(id: string, actor: PostActor): Promise<T> {
    this.readable(actor);
    return this.posts.get(id, actor);
  }
  list(
    actor: PostActor,
    page?: number,
    scope?: 'all' | 'mine' | 'reviews' | 'approved',
  ): Promise<L> {
    this.readable(actor);
    return this.posts.list(actor, page, scope);
  }
  revise(id: string, expectedRevision: number, input: SavePostInput, actor: PostActor): Promise<T> {
    this.readable(actor);
    this.validateInput(input);
    return this.posts.revise(id, expectedRevision, input, actor);
  }
  variation(
    id: string,
    expectedRevision: number,
    actor: PostActor,
    intent: 'REGENERATE' | 'NEW_DESIGN',
    style?: PostCreationPlan['style'],
    feedback?: string,
  ): Promise<T> {
    this.readable(actor);
    return this.posts.prepareVariation(id, expectedRevision, actor, intent, style, feedback);
  }
  candidates(id: string, actor: PostActor): Promise<C> {
    this.readable(actor);
    return this.posts.candidates(id, actor);
  }
  async preview(id: string, actor: PostActor, revisionId: string): Promise<Buffer> {
    this.readable(actor);
    const post = await this.posts.get(id, actor);
    if (post.currentRevision.id !== revisionId)
      throw new ConflictError({
        publicMessage: 'This preview is out of date. Open the latest post.',
      });
    const asset = await this.posts.image(id, actor, revisionId);
    const bytes = await this.storage.getAssetBuffer(asset.storageKey);
    if (!bytes || createHash('sha256').update(bytes).digest('hex') !== asset.sha256)
      throw new ConflictError({
        publicMessage: 'The saved poster is unavailable or failed its integrity check.',
      });
    return bytes;
  }
  async decide(
    id: string,
    dto: {
      expectedRevision: number;
      expectedReviewRound?: number;
      action: PostDecision;
      comment?: string;
    },
    actor: PostActor,
  ): Promise<T> {
    this.readable(actor);
    if (
      ['REQUEST_CHANGES', 'REJECT'].includes(dto.action) &&
      (!dto.comment || dto.comment.trim().length < 3 || dto.comment.length > 1000)
    )
      throw new ValidationError({
        publicMessage: 'Explain the requested changes in 3 to 1,000 characters.',
      });
    const post = await this.posts.get(id, actor);
    if (
      post.revisionNumber !== dto.expectedRevision ||
      (dto.action !== 'SUBMIT' && post.reviewRound !== dto.expectedReviewRound)
    )
      throw new ConflictError({
        publicMessage: 'This review is out of date. Refresh the complete post before deciding.',
      });
    if (
      (dto.action === 'SUBMIT' && post.creatorUserId === actor.id) ||
      (dto.action === 'APPROVE' && post.canReview)
    ) {
      if (post.currentRevision.brandSnapshot) {
        if (!this.guidance)
          throw new ConflictError({
            publicMessage: 'Brand permission verification is unavailable.',
          });
        await this.guidance.verifyPinned(post.currentRevision.brandSnapshot as PinnedBrandGuidance);
      }
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
            action: 'REVIEW',
          },
          actor,
        );
      }
      const asset = await this.posts.image(id, actor, post.currentRevision.id);
      const bytes = await this.storage.getAssetBuffer(asset.storageKey);
      if (!bytes || createHash('sha256').update(bytes).digest('hex') !== asset.sha256)
        throw new ConflictError({
          publicMessage:
            'The saved poster is missing or failed its integrity check. Restore or rebuild it before review.',
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
              'The product photo needs current approval and usage rights before this post can be reviewed.',
          });
        });
      const provenance = post.currentRevision.generation?.provenance as
        { productDigest?: string; registrationId?: string } | undefined;
      const expectedDigest =
        provenance?.productDigest ?? post.currentRevision.visualAsset?.sourceProductAssetDigest;
      if (
        expectedDigest !== hero.asset.sha256 ||
        (provenance?.registrationId && provenance.registrationId !== hero.registration.id)
      )
        throw new ConflictError({
          publicMessage:
            'The approved product photo changed. Rebuild the poster using the approved photo, then send a new revision for review.',
        });
    }
    return this.posts.transition(
      id,
      dto.expectedRevision,
      dto.action,
      dto.comment,
      actor,
      dto.expectedReviewRound,
    );
  }
}
