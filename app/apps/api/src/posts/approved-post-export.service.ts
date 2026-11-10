import { ProductMarketingEligibilityService } from '@parisian-shopper/application';
import { createHash } from 'node:crypto';
import { BrandGuidanceService, type PinnedBrandGuidance } from '@parisian-shopper/application';
import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  ASSET_STORAGE,
  PRODUCT_ASSET_ELIGIBILITY_EVALUATOR,
  type AssetStoragePort,
  ProductAssetEligibilityEvaluator,
  type PostActor,
  verifyPostImage,
} from '@parisian-shopper/application';
import { PrismaPostRepository } from '@parisian-shopper/database';
import { AppConfigService } from '@parisian-shopper/config';
import { ConflictError } from '@parisian-shopper/common';
export type ApprovedDownloadKind = 'poster' | 'caption-text' | 'caption-json' | 'manifest';
export interface ApprovedDownload {
  bytes: Buffer;
  mimeType: string;
  filename: string;
  sha256: string;
  revisionId: string;
}
const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
@Injectable()
export class ApprovedPostExportService {
  constructor(
    private readonly posts: PrismaPostRepository,
    @Inject(ASSET_STORAGE) private readonly storage: AssetStoragePort,
    @Inject(PRODUCT_ASSET_ELIGIBILITY_EVALUATOR)
    private readonly heroes: ProductAssetEligibilityEvaluator,
    private readonly config: AppConfigService,
    @Optional() private readonly guidance?: BrandGuidanceService,
    @Optional() private readonly productMarketing?: ProductMarketingEligibilityService,
  ) {}
  async prepare(
    id: string,
    revisionId: string,
    reviewRound: number,
    kind: ApprovedDownloadKind,
    actor: PostActor,
  ): Promise<ApprovedDownload> {
    const post = await this.posts.approvedExport(id, revisionId, reviewRound, actor);
    if (
      !post.factualValidation ||
      post.factualValidation.blockingCount ||
      !['PASSED', 'PASSED_WITH_WARNINGS'].includes(post.factualValidation.status)
    )
      throw new ConflictError({
        publicMessage:
          'The caption checks need attention. Save a corrected revision and have it reviewed before downloading.',
      });
    const revision = post.currentRevision;
    if (revision.brandSnapshot) {
      if (!this.guidance)
        throw new ConflictError({ publicMessage: 'Brand permission verification is unavailable.' });
      await this.guidance.verifyPinned(revision.brandSnapshot as unknown as PinnedBrandGuidance);
    }
    const productReleaseCheck = this.productMarketing
      ? await this.productMarketing.assert(
          {
            snapshotId: revision.productSnapshotId,
            postId: id,
            creationPlan: revision.creationPlan,
            brief: revision.brief,
            campaignId: revision.campaignId,
            caption: post.caption,
            action: 'EXPORT',
          },
          actor,
        )
      : null;
    const generation = revision.generation;
    const provenance = generation?.provenance as {
      kind?: string;
      productDigest?: string;
      registrationId?: string;
      historicalPostersUsed?: boolean;
      posterSpec?: { outputFormat?: { width: number; height: number } };
    } | null;
    if (
      this.config.nodeEnvironment === 'production' &&
      (generation?.provider === 'fake' || revision.visualAsset?.provider?.includes('fake'))
    )
      throw new ConflictError({
        publicMessage: 'Mock posters are not available as production exports.',
      });
    const asset = await this.posts.image(id, actor, revisionId);
    const bytes = await this.storage.getAssetBuffer(asset.storageKey);
    if (!bytes)
      throw new ConflictError({
        publicMessage: 'The approved poster file is missing. Restore it before downloading.',
      });
    const dimensions = generation ? provenance?.posterSpec?.outputFormat : revision.visualAsset;
    if (!dimensions)
      throw new ConflictError({
        publicMessage:
          'The saved poster dimensions are unavailable. Rebuild and review the poster before downloading.',
      });
    const image = await verifyPostImage(bytes, {
      ...dimensions,
      mimeType: asset.mimeType,
      sha256: asset.sha256,
    });
    const hero = await this.heroes
      .resolveAuthoritativeHeroEvidence(revision.productSnapshot.sku)
      .catch(() => {
        throw new ConflictError({
          publicMessage:
            'The product photo needs current approval and usage rights before downloading.',
        });
      });
    if (
      (provenance?.productDigest ?? revision.visualAsset?.sourceProductAssetDigest) !==
        hero.asset.sha256 ||
      (provenance?.registrationId && provenance.registrationId !== hero.registration.id)
    )
      throw new ConflictError({
        publicMessage:
          'The approved product photo changed. Rebuild and review this post before downloading.',
      });
    if (!post.caption)
      throw new ConflictError({ publicMessage: 'The approved caption is missing.' });
    const captionJson = Buffer.from(JSON.stringify(post.caption, null, 2) + '\n', 'utf8');
    const captionText = Buffer.from(
      [
        post.caption.headline,
        post.caption.english_caption,
        post.caption.khmer_caption,
        post.caption.cta,
        post.caption.hashtags.join(' '),
      ]
        .filter((value) => value !== null)
        .join('\n\n') + '\n',
      'utf8',
    );
    const approval = post.events.findLast(
      (event) =>
        event.action === 'APPROVE' &&
        event.revisionId === revisionId &&
        event.reviewRound === reviewRound,
    )!;
    const stem = `post-${post.id}-r${revision.revisionNumber}`;
    const manifest = {
      schemaVersion: 1,
      postId: id,
      revisionId,
      revisionNumber: revision.revisionNumber,
      reviewRound,
      approvalEventId: approval.id,
      approvedAt: approval.createdAt,
      approverUserId: approval.actorUserId,
      productSnapshotId: revision.productSnapshotId,
      campaign: revision.campaignSnapshot,
      channel: revision.channel,
      language: revision.language,
      captionRevisionId: revision.id,
      captionSourceVersionId: revision.captionVersionId,
      posterGenerationId: revision.generationId,
      posterSceneVersionId: revision.posterVersionId,
      visualAssetId: revision.visualAssetId,
      provenance: provenance?.kind ?? revision.visualAsset?.provider ?? 'unknown',
      historicalPostersUsed: provenance?.historicalPostersUsed ?? null,
      brandSnapshot: revision.brandSnapshot,
      productReleaseCheck,
      captionProvenance: revision.captionProvenance,
      poster: { ...image, filename: `${stem}.${image.extension}` },
      captions: { jsonSha256: digest(captionJson), textSha256: digest(captionText) },
    };
    const result: ApprovedDownload =
      kind === 'poster'
        ? {
            bytes,
            mimeType: image.mimeType,
            filename: `${stem}.${image.extension}`,
            sha256: image.sha256,
            revisionId,
          }
        : kind === 'caption-text'
          ? {
              bytes: captionText,
              mimeType: 'text/plain; charset=utf-8',
              filename: `${stem}-captions.txt`,
              sha256: digest(captionText),
              revisionId,
            }
          : kind === 'caption-json'
            ? {
                bytes: captionJson,
                mimeType: 'application/json; charset=utf-8',
                filename: `${stem}-captions.json`,
                sha256: digest(captionJson),
                revisionId,
              }
            : {
                bytes: Buffer.from(JSON.stringify(manifest, null, 2) + '\n'),
                mimeType: 'application/json; charset=utf-8',
                filename: `${stem}-manifest.json`,
                sha256: '',
                revisionId,
              };
    result.sha256 = digest(result.bytes);
    // Last approval check is serialized against edits, after asynchronous file/rights checks.
    await this.posts.recordApprovedExport(id, revisionId, reviewRound, actor, kind, result.sha256);
    return result;
  }
}
