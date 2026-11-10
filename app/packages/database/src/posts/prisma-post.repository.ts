import { appendPostEvent } from './post-outbox.js';
import { createHash } from 'node:crypto';
import { canonicalJson } from '@parisian-shopper/application';
import { type SavePostInput, type PostRepository } from '@parisian-shopper/application';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@parisian-shopper/common';
import {
  assertPostDecision,
  readPostCreationPlan,
  type PostCreationPlan,
  assertPostLinks,
  assertPostOwner,
  assertPostTransition,
  canReadPost,
  type PostActor,
  aiContentOutputSchema,
  validateOutputForLanguage,
  DeterministicFactualValidator,
  type AIContentOutput,
  type FactualValidationOutcome,
} from '@parisian-shopper/application';
import { toSnapshotDomain } from '../product-snapshot/prisma-product-snapshot.repository.js';
import { PrismaService } from '../prisma.service.js';

export type { SavePostInput } from '@parisian-shopper/application';

const revisionInclude = {
  captionGeneration: true,
  generation: {
    select: {
      id: true,
      postId: true,
      status: true,
      caption: true,
      provenance: true,
      provider: true,
      model: true,
      imageKey: true,
      imageSha256: true,
      sourceRevision: {
        select: { productSnapshotId: true, channel: true, language: true, authorUserId: true },
      },
      estimatedCostUsd: true,
      estimatedCredits: true,
      actualCredits: true,
      creditQuote: true,
      actualCostUsd: true,
      requestId: true,
      settings: true,
      references: true,
    },
  },
  author: { select: { id: true, displayName: true } },
  productSnapshot: {
    select: {
      id: true,
      sku: true,
      productName: true,
      brand: true,
      price: true,
      currency: true,
      images: true,
      category: true,
      description: true,
      stockStatus: true,
      fragranceNotes: true,
      concentration: true,
      size: true,
    },
  },
  campaign: { select: { id: true, code: true, name: true } },
  captionVersion: {
    select: {
      id: true,
      contentJobId: true,
      versionNumber: true,
      structuredOutput: true,
      approvalEvents: true,
      contentJob: { select: { requesterUserId: true } },
      revisionRequest: { select: { requestedByUserId: true } },
    },
  },
  posterVersion: {
    select: {
      id: true,
      sceneId: true,
      versionNumber: true,
      state: true,
      approvalEvents: true,
      requestedByUserId: true,
      scene: { select: { creativeJob: { select: { requestedByUserId: true } } } },
    },
  },
  visualAsset: {
    select: {
      id: true,
      width: true,
      height: true,
      sha256: true,
      provider: true,
      model: true,
      sceneVersionId: true,
      sourceProductAssetDigest: true,
    },
  },
} satisfies Prisma.PostRevisionInclude;

const postInclude = {
  creator: { select: { id: true, displayName: true } },
  revisions: { orderBy: { revisionNumber: 'desc' }, include: revisionInclude },
  events: {
    orderBy: { createdAt: 'asc' },
    include: { actor: { select: { id: true, displayName: true } } },
  },
} satisfies Prisma.PostInclude;
type PostRecord = Prisma.PostGetPayload<{ include: typeof postInclude }>;
export type PostDetailRecord = PostRecord & {
  currentRevision: PostRecord['revisions'][number];
  canEdit: boolean;
  canReview: boolean;
  reviewReason: string;
  previewUrl: string | null;
  caption: AIContentOutput | null;
  factualValidation: FactualValidationOutcome | null;
  canDownload: boolean;
  downloadReason: string;
  existingPublications: { id: string; destinationChannel: string; status: string }[];
};
export interface PostListResult {
  items: {
    id: string;
    status: string;
    revisionNumber: number;
    productName: string | undefined;
    creatorName: string;
    updatedAt: Date;
  }[];
  total: number;
  page: number;
  totalPages: number;
}
export interface PostCandidatesResult {
  captions: {
    id: string;
    versionNumber: number;
    contentJobId: string;
    structuredOutput: Prisma.JsonValue;
  }[];
  posters: {
    id: string;
    sceneId: string;
    versionNumber: number;
    scene: { title: string };
    renderedAssets: { id: string; width: number; height: number }[];
  }[];
  limit: number;
}

function parsePostCaption(value: unknown, language: SavePostInput['language']): AIContentOutput {
  try {
    return validateOutputForLanguage(value, language);
  } catch {
    throw new ValidationError({
      publicMessage:
        'Complete the required caption fields and use valid hashtags for the selected language before saving.',
    });
  }
}

function contributors(creatorId: string, revisions: PostRecord['revisions']): string[] {
  return [
    creatorId,
    ...revisions.flatMap((r) => [
      r.authorUserId,
      r.captionVersion?.contentJob.requesterUserId,
      r.captionVersion?.revisionRequest?.requestedByUserId,
      r.posterVersion?.requestedByUserId,
      r.posterVersion?.scene.creativeJob.requestedByUserId,
    ]),
  ].filter((value): value is string => Boolean(value));
}

@Injectable()
export class PrismaPostRepository implements PostRepository<
  PostDetailRecord,
  PostListResult,
  PostCandidatesResult
> {
  constructor(private readonly prisma: PrismaService) {}

  async image(
    id: string,
    actor: PostActor,
    revisionId?: string,
  ): Promise<{ storageKey: string; mimeType: string; sha256: string }> {
    const post = await this.get(id, actor);
    const revision = revisionId
      ? post.revisions.find((r) => r.id === revisionId)
      : post.currentRevision;
    if (!revision) throw new NotFoundError({ publicMessage: 'Saved post revision not found.' });
    if (revision.generation?.status === 'COMPLETE' && revision.generation.imageKey)
      return {
        storageKey: revision.generation.imageKey,
        mimeType: 'image/png',
        sha256: revision.generation.imageSha256!,
      };
    if (!revision.visualAssetId)
      throw new NotFoundError({ publicMessage: 'No saved poster image is linked.' });
    return this.prisma.visualAsset.findUniqueOrThrow({
      where: { id: revision.visualAssetId },
      select: { storageKey: true, mimeType: true, sha256: true },
    });
  }

  async canPreviewStorageKey(key: string, actor: PostActor): Promise<boolean> {
    const all =
      actor.permissions.includes('VIEW_ALL_CONTENT') ||
      actor.permissions.includes('APPROVE_CONTENT');
    const generated = await this.prisma.postGeneration.findFirst({
      where: {
        OR: [{ imageKey: key }, { backgroundKey: key }],
        ...(!all ? { post: { creatorUserId: actor.id } } : {}),
      },
      select: { id: true },
    });
    if (generated) return true;
    const asset = await this.prisma.visualAsset.findFirst({
      where: { storageKey: key, ...(!all ? { creativeJob: { requestedByUserId: actor.id } } : {}) },
      select: { id: true },
    });
    if (asset) return true;
    const exported = await this.prisma.creativeExport.findFirst({
      where: { storageKey: key, ...(!all ? { creativeJob: { requestedByUserId: actor.id } } : {}) },
      select: { id: true },
    });
    if (exported) return true;
    return (
      actor.permissions.includes('VIEW_PRODUCTS') &&
      Boolean(
        await this.prisma.productAsset.findFirst({
          where: { storageKey: key },
          select: { id: true },
        }),
      )
    );
  }
  async approvedExport(
    id: string,
    revisionId: string,
    reviewRound: number,
    actor: PostActor,
  ): Promise<PostDetailRecord> {
    if (!actor.permissions.includes('EXPORT_CREATIVE'))
      throw new ForbiddenError({
        publicMessage: 'You do not have permission to download approved posts.',
      });
    const post = await this.get(id, actor);
    if (
      !post.canDownload ||
      post.currentRevision.id !== revisionId ||
      post.reviewRound !== reviewRound
    )
      throw new ConflictError({
        publicMessage:
          'This saved version is not the current approved post. Refresh the post and download its approved revision.',
      });
    const decision = post.events.findLast(
      (event) =>
        event.action === 'APPROVE' &&
        event.revisionId === revisionId &&
        event.reviewRound === reviewRound,
    );
    if (
      !decision ||
      contributors(post.creatorUserId, post.revisions).includes(decision.actorUserId)
    )
      throw new ForbiddenError({
        publicMessage: 'An independent final approval is required before downloading.',
      });
    return post;
  }
  async recordApprovedExport(
    id: string,
    revisionId: string,
    reviewRound: number,
    actor: PostActor,
    kind: string,
    checksum: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM posts WHERE id = ${id}::uuid FOR UPDATE`;
      const post = await tx.post.findUniqueOrThrow({
        where: { id },
        include: { revisions: { orderBy: { revisionNumber: 'desc' }, take: 1 } },
      });
      if (!canReadPost(actor, post.creatorUserId))
        throw new ForbiddenError({ publicMessage: 'You cannot download this post.' });
      if (
        post.status !== 'APPROVED' ||
        post.reviewRound !== reviewRound ||
        post.revisions[0]?.id !== revisionId ||
        !actor.permissions.includes('EXPORT_CREATIVE')
      )
        throw new ConflictError({
          publicMessage:
            'The post changed while preparing the download. Refresh and try again after approval.',
        });
      await appendPostEvent(tx, {
        data: {
          postId: id,
          revisionId,
          actorUserId: actor.id,
          action: 'APPROVED_DOWNLOAD',
          reviewRound,
          comment: `${kind}; SHA-256 ${checksum}`,
        },
      });
    });
  }
  async candidates(id: string, actor: PostActor): Promise<PostCandidatesResult> {
    const post = await this.get(id, actor);
    const current = post.currentRevision;
    const canViewOthers =
      actor.permissions.includes('VIEW_ALL_CONTENT') ||
      actor.permissions.includes('APPROVE_CONTENT');
    const captions = await this.prisma.contentVersion.findMany({
      where: {
        productSnapshotId: current.productSnapshotId,
        contentJob: {
          platform: current.channel,
          language: current.language,
          ...(!canViewOthers ? { requesterUserId: actor.id } : {}),
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, versionNumber: true, contentJobId: true, structuredOutput: true },
    });
    const posters = await this.prisma.creativeSceneVersion.findMany({
      where: {
        productSnapshotId: current.productSnapshotId,
        ...(current.captionVersionId
          ? { sourceContentVersionId: current.captionVersionId }
          : { id: '00000000-0000-4000-8000-000000000000' }),
        ...(!canViewOthers ? { scene: { creativeJob: { requestedByUserId: actor.id } } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        sceneId: true,
        versionNumber: true,
        scene: { select: { title: true } },
        renderedAssets: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, width: true, height: true },
        },
      },
    });
    return {
      captions: captions.filter((c) => aiContentOutputSchema.safeParse(c.structuredOutput).success),
      posters,
      limit: 100,
    };
  }

  private async validateLinks(
    tx: Prisma.TransactionClient,
    input: SavePostInput,
    actor: PostActor,
  ): Promise<void> {
    if (
      !(await tx.productSnapshot.findUnique({
        where: { id: input.productSnapshotId },
        select: { id: true },
      }))
    )
      throw new NotFoundError({ publicMessage: 'Product not found.' });
    if (
      input.campaignId &&
      !(await tx.campaign.findUnique({ where: { id: input.campaignId }, select: { id: true } }))
    )
      throw new NotFoundError({ publicMessage: 'Campaign not found.' });
    let plan: PostCreationPlan;
    try {
      plan = readPostCreationPlan(input.creationPlan);
    } catch {
      throw new ValidationError({
        publicMessage: 'Choose a supported content type, format and design style.',
      });
    }
    if (
      plan.format === 'VIDEO' &&
      (input.generationId || input.posterVersionId || input.visualAssetId)
    )
      throw new ValidationError({
        publicMessage:
          'A poster image cannot be linked as a video. Video generation is not connected yet.',
      });
    if (input.generationId) {
      const generation = await tx.postGeneration.findUnique({
        where: { id: input.generationId },
        include: { sourceRevision: true },
      });
      const owner = generation
        ? await tx.post.findUnique({ where: { id: generation.postId } })
        : null;
      if (
        !generation ||
        !owner ||
        (owner.creatorUserId !== actor.id && !canReadPost(actor, owner.creatorUserId))
      )
        throw new ForbiddenError({ publicMessage: 'You cannot use this saved poster.' });
      const originalPlan = readPostCreationPlan(generation.sourceRevision.creationPlan);
      if (
        plan.style !== originalPlan.style ||
        plan.purpose !== originalPlan.purpose ||
        plan.format !== originalPlan.format
      )
        throw new ValidationError({
          publicMessage: 'Create a new poster after changing its content type or visual style.',
        });
      if (input.captionVersionId || input.posterVersionId || input.visualAssetId)
        throw new ValidationError({ publicMessage: 'Use one saved poster source for this post.' });
      if (
        generation.status !== 'COMPLETE' ||
        !generation.imageKey ||
        generation.sourceRevision.productSnapshotId !== input.productSnapshotId ||
        generation.sourceRevision.channel !== input.channel ||
        generation.sourceRevision.language !== input.language
      )
        throw new ValidationError({
          publicMessage:
            'The saved poster must match this product, channel and language. Prepare a new poster after changing these details.',
        });
    }
    if (input.captionDraft) parsePostCaption(input.captionDraft, input.language);
    const caption = input.captionVersionId
      ? await tx.contentVersion.findUnique({
          where: { id: input.captionVersionId },
          include: { contentJob: true },
        })
      : null;
    const poster = input.posterVersionId
      ? await tx.creativeSceneVersion.findUnique({
          where: { id: input.posterVersionId },
          include: { scene: { include: { creativeJob: true } } },
        })
      : null;
    const asset = input.visualAssetId
      ? await tx.visualAsset.findUnique({ where: { id: input.visualAssetId } })
      : null;
    if (caption) {
      try {
        parsePostCaption(caption.structuredOutput, input.language);
      } catch {
        throw new ValidationError({
          publicMessage:
            'This caption uses an invalid or older format. Repair it in Captions before linking it to a post.',
        });
      }
    }
    if (
      (input.captionVersionId && !caption) ||
      (input.posterVersionId && !poster) ||
      (input.visualAssetId && !asset)
    )
      throw new NotFoundError({
        publicMessage: 'A selected caption, poster, or image no longer exists.',
      });
    // Do not let a creator use another employee's private caption by guessing its ID.
    if (caption && !canReadPost(actor, caption.contentJob.requesterUserId))
      throw new ForbiddenError({ publicMessage: 'You cannot use this caption.' });
    if (
      poster?.scene.creativeJob.requestedByUserId &&
      !canReadPost(actor, poster.scene.creativeJob.requestedByUserId)
    )
      throw new ForbiddenError({ publicMessage: 'You cannot use this poster.' });
    assertPostLinks({
      productId: input.productSnapshotId,
      ...(caption ? { captionProductId: caption.productSnapshotId, captionId: caption.id } : {}),
      ...(poster
        ? {
            posterProductId: poster.productSnapshotId,
            posterVersionId: poster.id,
            posterCaptionId: poster.sourceContentVersionId,
          }
        : {}),
      hasAsset: Boolean(asset),
      ...(asset ? { assetSceneVersionId: asset.sceneVersionId } : {}),
    });
    if (
      asset &&
      poster &&
      (asset.creativeJobId !== poster.scene.creativeJobId ||
        asset.assetRole !== 'COMPOSITED_CREATIVE')
    )
      throw new ValidationError({
        publicMessage: 'The saved image must be the completed render for this poster.',
      });
    if (
      caption &&
      (caption.contentJob.platform !== input.channel ||
        caption.contentJob.language !== input.language)
    )
      throw new ValidationError({
        publicMessage: 'The caption must match the selected channel and language.',
      });
    if (
      input.campaignId &&
      caption?.contentJob.campaignId &&
      caption.contentJob.campaignId !== input.campaignId
    )
      throw new ValidationError({ publicMessage: 'The caption belongs to a different campaign.' });
    if (poster?.scene.campaignId && poster.scene.campaignId !== input.campaignId)
      throw new ValidationError({ publicMessage: 'The poster belongs to a different campaign.' });
  }

  private async validateCaption(
    tx: Pick<Prisma.TransactionClient, 'productSnapshot'>,
    productId: string,
    value: unknown,
    language: SavePostInput['language'],
  ): Promise<FactualValidationOutcome> {
    const snapshot = await tx.productSnapshot.findUniqueOrThrow({ where: { id: productId } });
    const structuredOutput = parsePostCaption(value, language);
    return new DeterministicFactualValidator().validate({
      productSnapshot: toSnapshotDomain(snapshot),
      contentVersion: {
        id: 'post-caption',
        contentJobId: 'post',
        versionNumber: 1,
        brandRuleVersionId: 'post',
        productSnapshotId: productId,
        generationAttemptId: 'post',
        provider: 'post-draft',
        model: 'staff-edited',
        promptVersion: 'post-review-v1',
        structuredOutput,
        createdAt: new Date(),
      },
    });
  }
  private async revisionData(
    tx: Prisma.TransactionClient,
    input: SavePostInput,
  ): Promise<
    Omit<SavePostInput, 'captionDraft' | 'creationPlan' | 'requestKey'> & {
      creationPlan: Prisma.InputJsonObject | typeof Prisma.DbNull;
      captionDraft: Prisma.InputJsonObject | typeof Prisma.DbNull;
      captionValidation: Prisma.InputJsonObject | typeof Prisma.DbNull;
      campaignSnapshot: Prisma.InputJsonObject | typeof Prisma.DbNull;
      captionProvenance: Prisma.InputJsonObject | typeof Prisma.DbNull;
    }
  > {
    const caption = input.captionDraft
      ? parsePostCaption(input.captionDraft, input.language)
      : null;
    const validation = caption
      ? await this.validateCaption(tx, input.productSnapshotId, caption, input.language)
      : null;
    const campaign = input.campaignId
      ? await tx.campaign.findUniqueOrThrow({
          where: { id: input.campaignId },
          select: { id: true, name: true, code: true, objective: true, description: true },
        })
      : null;
    const { requestKey: _requestKey, ...revisionInput } = input;
    return {
      ...revisionInput,
      captionProvenance: input.captionDraft ? { method: 'STAFF_DRAFT' } : Prisma.DbNull,
      creationPlan: input.creationPlan
        ? { ...readPostCreationPlan(input.creationPlan) }
        : Prisma.DbNull,
      campaignSnapshot: campaign ? { ...campaign } : Prisma.DbNull,
      captionDraft: caption ? { ...caption } : Prisma.DbNull,
      captionValidation: validation
        ? (JSON.parse(JSON.stringify(validation)) as Prisma.InputJsonObject)
        : Prisma.DbNull,
    };
  }
  async create(input: SavePostInput, actor: PostActor): Promise<PostDetailRecord> {
    if (!actor.permissions.includes('CREATE_CONTENT'))
      throw new ForbiddenError({ publicMessage: 'You cannot create posts.' });
    const requestHash = createHash('sha256')
      .update(
        canonicalJson({
          ...input,
          requestKey: undefined,
        }),
      )
      .digest('hex');
    const post = await this.prisma.$transaction(async (tx) => {
      if (input.requestKey) {
        if (input.requestKey.length > 160 || !input.requestKey.trim())
          throw new ValidationError({ publicMessage: 'Invalid post request key.' });
        const lock = `${actor.id}:${input.requestKey}`;
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${lock}, 0))`;
        const existing = await tx.post.findUnique({
          where: {
            creatorUserId_requestKey: { creatorUserId: actor.id, requestKey: input.requestKey },
          },
        });
        if (existing) {
          if (existing.requestHash !== requestHash)
            throw new ConflictError({
              publicMessage:
                'This request was already saved with different details. Open the saved post or start a new request.',
            });
          return existing;
        }
      }
      if (input.generationId)
        throw new ValidationError({
          publicMessage: 'Saved generated posters can only remain in their original post.',
        });
      await this.validateLinks(tx, input, actor);
      const created = await tx.post.create({
        data: {
          creatorUserId: actor.id,
          ...(input.requestKey ? { requestKey: input.requestKey, requestHash } : {}),
          revisions: {
            create: {
              ...(await this.revisionData(tx, input)),
              authorUserId: actor.id,
              revisionNumber: 1,
            },
          },
        },
        include: { revisions: true },
      });
      await appendPostEvent(tx, {
        data: {
          postId: created.id,
          revisionId: created.revisions[0]!.id,
          actorUserId: actor.id,
          action: 'CREATED',
        },
      });
      return created;
    });
    return this.get(post.id, actor);
  }

  async list(
    actor: PostActor,
    page = 1,
    scope: 'all' | 'mine' | 'reviews' | 'approved' = 'all',
  ): Promise<PostListResult> {
    const visibility =
      actor.permissions.includes('VIEW_ALL_CONTENT') ||
      actor.permissions.includes('APPROVE_CONTENT')
        ? {}
        : { creatorUserId: actor.id };
    const where: Prisma.PostWhereInput = {
      AND: [
        visibility,
        ...(scope === 'mine' ? [{ creatorUserId: actor.id }] : []),
        ...(scope === 'approved' ? [{ status: 'APPROVED' as const }] : []),
        ...(scope === 'reviews' ? [{ status: 'UNDER_REVIEW' as const }] : []),
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.post.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * 20,
        take: 20,
        include: {
          creator: { select: { displayName: true } },
          revisions: {
            orderBy: { revisionNumber: 'desc' },
            take: 1,
            include: { productSnapshot: { select: { productName: true } } },
          },
        },
      }),
      this.prisma.post.count({ where }),
    ]);
    return {
      items: items.map((p) => ({
        id: p.id,
        status: p.status,
        revisionNumber: p.revisionNumber,
        productName: p.revisions[0]?.productSnapshot.productName,
        creatorName: p.creator.displayName,
        updatedAt: p.updatedAt,
      })),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / 20)),
    };
  }

  async get(id: string, actor: PostActor): Promise<PostDetailRecord> {
    const post = await this.prisma.post.findUnique({ where: { id }, include: postInclude });
    if (!post)
      throw new NotFoundError({
        publicMessage: 'Post not found. Older caption links are available in Captions.',
      });
    if (!canReadPost(actor, post.creatorUserId))
      throw new ForbiddenError({ publicMessage: 'You cannot view this post.' });
    const current = post.revisions[0]!;
    let canReview = false;
    let reviewReason = '';
    try {
      assertPostDecision(actor, post.status, contributors(post.creatorUserId, post.revisions));
      canReview = true;
    } catch (error) {
      reviewReason =
        error instanceof Error ? error.message : 'Ask an authorized colleague to review.';
    }
    const captionValue =
      current.captionDraft ??
      current.generation?.caption ??
      current.captionVersion?.structuredOutput;
    const caption = captionValue ? parsePostCaption(captionValue, current.language) : null;
    const factualValidation = caption
      ? await this.validateCaption(
          this.prisma,
          current.productSnapshotId,
          caption,
          current.language,
        )
      : null;
    const decision = post.events.findLast(
      (event) =>
        event.action === 'APPROVE' &&
        event.revisionId === current.id &&
        event.reviewRound === post.reviewRound,
    );
    const independentDecision = Boolean(
      decision && !contributors(post.creatorUserId, post.revisions).includes(decision.actorUserId),
    );
    const canDownload =
      post.status === 'APPROVED' &&
      independentDecision &&
      actor.permissions.includes('EXPORT_CREATIVE');
    const downloadReason =
      post.status !== 'APPROVED'
        ? 'Downloads are available after independent approval of the complete post.'
        : !actor.permissions.includes('EXPORT_CREATIVE')
          ? 'Ask a colleague with approved-poster download permission to download these files.'
          : !independentDecision
            ? 'This revision has no matching final approval. Ask an authorized colleague to review it.'
            : '';
    const originalCaption = current.captionVersion
      ? parsePostCaption(current.captionVersion.structuredOutput, current.language)
      : null;
    const existingPublications =
      post.status === 'APPROVED' &&
      actor.permissions.includes('PUBLISH_CREATIVE') &&
      current.captionVersionId &&
      current.visualAssetId &&
      JSON.stringify(caption) === JSON.stringify(originalCaption)
        ? await this.prisma.publication.findMany({
            where: {
              contentVersionId: current.captionVersionId,
              creativeExport: { visualAssetId: current.visualAssetId, validationStatus: 'PASSED' },
            },
            select: { id: true, destinationChannel: true, status: true },
            take: 20,
          })
        : [];
    return {
      ...post,
      canDownload,
      downloadReason,
      existingPublications,
      caption,
      factualValidation,
      currentRevision: current,
      canReview,
      reviewReason,
      canEdit:
        post.creatorUserId === actor.id &&
        actor.permissions.includes('EDIT_CONTENT') &&
        post.status !== 'UNDER_REVIEW',
      previewUrl:
        current.visualAssetId || current.generation?.status === 'COMPLETE'
          ? `/v1/posts/${post.id}/image?revisionId=${current.id}`
          : null,
    };
  }

  async revise(
    id: string,
    expectedRevision: number,
    input: SavePostInput,
    actor: PostActor,
  ): Promise<PostDetailRecord> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM posts WHERE id = ${id}::uuid FOR UPDATE`;
      const post = await tx.post.findUnique({ where: { id } });
      if (!post) throw new NotFoundError({ publicMessage: 'Post not found.' });
      assertPostOwner(actor, post.creatorUserId);
      if (
        await tx.postGeneration.findFirst({
          where: {
            postId: id,
            status: {
              in: [
                'AWAITING_CONFIRMATION',
                'QUEUED',
                'PREPARING',
                'SUBMITTING',
                'GENERATING',
                'COMPOSITING',
                'UNCERTAIN',
              ],
            },
          },
        })
      )
        throw new ConflictError({
          publicMessage:
            'Wait for the image request to finish or be reconciled before changing this post.',
        });
      if (
        await tx.postCaptionAttempt.count({
          where: { postId: id, status: { in: ['QUEUED', 'GENERATING', 'UNCERTAIN'] } },
        })
      )
        throw new ConflictError({
          publicMessage: 'Finish or reconcile the caption request before editing this draft.',
        });
      const status = assertPostTransition(post.status, 'EDIT');
      if (input.creationPlan === undefined) {
        const previous = await tx.postRevision.findUniqueOrThrow({
          where: { postId_revisionNumber: { postId: id, revisionNumber: post.revisionNumber } },
        });
        input = {
          ...input,
          creationPlan: previous.creationPlan ? readPostCreationPlan(previous.creationPlan) : null,
        };
      }
      if (
        input.generationId &&
        !(await tx.postGeneration.findFirst({ where: { id: input.generationId, postId: id } }))
      )
        throw new ValidationError({ publicMessage: 'This saved poster belongs to another post.' });
      await this.validateLinks(tx, input, actor);
      const changed = await tx.post.updateMany({
        where: { id, revisionNumber: expectedRevision, status: post.status },
        data: { status, revisionNumber: { increment: 1 } },
      });
      if (changed.count !== 1)
        throw new ConflictError({ publicMessage: 'The post changed. Refresh before saving.' });
      const prior = await tx.postRevision.findUniqueOrThrow({
        where: { postId_revisionNumber: { postId: id, revisionNumber: expectedRevision } },
      });
      const unchangedCaption =
        canonicalJson(prior.captionDraft) === canonicalJson(input.captionDraft ?? null) &&
        prior.language === input.language &&
        prior.productSnapshotId === input.productSnapshotId;
      const revision = await tx.postRevision.create({
        data: {
          ...(await this.revisionData(tx, input)),
          brandSnapshot: prior.brandSnapshot ?? Prisma.DbNull,
          captionGenerationId: unchangedCaption ? prior.captionGenerationId : null,
          captionProvenance: unchangedCaption
            ? (prior.captionProvenance ?? Prisma.DbNull)
            : {
                method: 'STAFF_EDIT',
                authorUserId: actor.id,
                ...(prior.captionGenerationId
                  ? { basedOnCaptionGenerationId: prior.captionGenerationId }
                  : {}),
              },
          postId: id,
          revisionNumber: expectedRevision + 1,
          authorUserId: actor.id,
        },
      });
      await appendPostEvent(tx, {
        data: {
          postId: id,
          revisionId: revision.id,
          actorUserId: actor.id,
          action: post.status === 'APPROVED' ? 'APPROVAL_INVALIDATED_BY_EDIT' : 'REVISED',
        },
      });
    });
    return this.get(id, actor);
  }

  async prepareVariation(
    id: string,
    expectedRevision: number,
    actor: PostActor,
    intent: 'REGENERATE' | 'NEW_DESIGN',
    style: PostCreationPlan['style'],
    feedback: string,
  ): Promise<PostDetailRecord> {
    const current = await this.get(id, actor);
    assertPostOwner(actor, current.creatorUserId);
    if (current.revisionNumber !== expectedRevision)
      throw new ConflictError({
        publicMessage: 'This post changed. Refresh before requesting another design.',
      });
    const source = current.currentRevision;
    if (intent === 'REGENERATE' && !source.creationPlan)
      throw new ConflictError({
        publicMessage: 'This older post has no recorded style. Choose a style and use New design.',
      });
    const plan = readPostCreationPlan(source.creationPlan);
    if (plan.format !== 'POSTER')
      throw new ConflictError({
        publicMessage:
          'Video generation is not connected. Keep your video brief or create a poster.',
      });
    if (feedback.trim().length < 3 || feedback.trim().length > 1000)
      throw new ValidationError({
        publicMessage: 'Describe the changes you want (3–1000 characters).',
      });
    return this.revise(
      id,
      expectedRevision,
      {
        productSnapshotId: source.productSnapshotId,
        brief: source.brief,
        channel: source.channel,
        language: source.language,
        campaignId: source.campaignId,
        captionDraft:
          source.captionDraft ||
          !source.generationId ||
          (source.generation?.provenance as { captionMethod?: string } | null)?.captionMethod ===
            'staff-draft'
            ? current.caption
            : null,
        generationId: null,
        captionVersionId: null,
        posterVersionId: null,
        visualAssetId: null,
        creationPlan: {
          ...plan,
          style: intent === 'NEW_DESIGN' ? style : plan.style,
          feedback: feedback.trim(),
          intent,
        },
      },
      actor,
    );
  }

  async transition(
    id: string,
    expectedRevision: number,
    action: 'SUBMIT' | 'APPROVE' | 'REQUEST_CHANGES' | 'REJECT',
    comment: string | undefined,
    actor: PostActor,
    expectedReviewRound?: number,
  ): Promise<PostDetailRecord> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM posts WHERE id = ${id}::uuid FOR UPDATE`;
      const post = await tx.post.findUnique({
        where: { id },
        include: { revisions: { orderBy: { revisionNumber: 'desc' }, include: revisionInclude } },
      });
      if (!post) throw new NotFoundError({ publicMessage: 'Post not found.' });
      const revision = post.revisions[0]!;
      if (
        revision.revisionNumber !== expectedRevision ||
        (action !== 'SUBMIT' && expectedReviewRound !== post.reviewRound)
      )
        throw new ConflictError({
          publicMessage: 'This review is out of date. Refresh the complete post before deciding.',
        });
      if (action === 'SUBMIT') assertPostOwner(actor, post.creatorUserId);
      else {
        assertPostDecision(actor, post.status, contributors(post.creatorUserId, post.revisions));
      }
      if (
        await tx.postCaptionAttempt.count({
          where: { postId: id, status: { in: ['QUEUED', 'GENERATING', 'UNCERTAIN'] } },
        })
      )
        throw new ConflictError({
          publicMessage: 'Finish or reconcile the caption request before review.',
        });
      const status = assertPostTransition(post.status, action);
      if (action === 'SUBMIT' && readPostCreationPlan(revision.creationPlan).format === 'VIDEO')
        throw new ValidationError({
          publicMessage:
            'Video generation and video review are not connected. Prepare a poster instead, or keep this video brief as a draft.',
        });
      if (['REQUEST_CHANGES', 'REJECT'].includes(action) && (!comment || comment.trim().length < 3))
        throw new ValidationError({
          publicMessage: 'Explain what needs to change (at least three characters).',
        });
      let validationSnapshot: FactualValidationOutcome | null = null;
      if (!['REQUEST_CHANGES', 'REJECT'].includes(action)) {
        if (revision.campaignId && !revision.campaignSnapshot)
          throw new ValidationError({
            publicMessage:
              'Save a new revision to capture the campaign context before final review.',
          });
        const caption =
          revision.captionDraft ??
          revision.generation?.caption ??
          revision.captionVersion?.structuredOutput;
        if (!caption)
          throw new ValidationError({
            publicMessage: 'Save a caption before sending the complete post for review.',
          });
        const result = await this.validateCaption(
          tx,
          revision.productSnapshotId,
          caption,
          revision.language,
        );
        validationSnapshot = result;
        if (result.blockingCount || !['PASSED', 'PASSED_WITH_WARNINGS'].includes(result.status))
          throw new ValidationError({
            publicMessage:
              'Correct the caption factual findings before review: ' +
              result.findings
                .filter((f) => f.severity === 'BLOCKING')
                .map((f) => f.message)
                .join(' '),
          });
      }
      if (!['REQUEST_CHANGES', 'REJECT'].includes(action) && revision.generationId) {
        const generated = revision.generation;
        if (
          !generated ||
          generated.postId !== id ||
          generated.status !== 'COMPLETE' ||
          !generated.imageKey ||
          !generated.caption ||
          !generated.provenance
        )
          throw new ValidationError({
            publicMessage: 'The complete generated draft must be saved before review.',
          });
        const checks = (
          generated.provenance as {
            checks?: {
              visual?: { status?: string; blockingCount?: number };
              safety?: { blockingCount?: number };
            };
          }
        ).checks;
        if (
          !checks?.visual ||
          !['PASSED', 'PASSED_WITH_WARNINGS'].includes(checks.visual.status ?? '') ||
          checks.visual.blockingCount !== 0 ||
          checks.safety?.blockingCount !== 0
        )
          throw new ValidationError({ publicMessage: 'Poster checks must pass before review.' });
        parsePostCaption(generated.caption, revision.language);
      }
      if (!['REQUEST_CHANGES', 'REJECT'].includes(action) && !revision.generationId) {
        if (!revision.captionVersionId || !revision.posterVersionId || !revision.visualAssetId)
          throw new ValidationError({
            publicMessage:
              'Choose a caption, poster version, and saved poster image before review.',
          });
        await this.validateLinks(
          tx,
          {
            ...revision,
            creationPlan: revision.creationPlan
              ? readPostCreationPlan(revision.creationPlan)
              : null,
            captionDraft: revision.captionDraft
              ? parsePostCaption(revision.captionDraft, revision.language)
              : null,
          },
          actor,
        );
        const captionCheck = await tx.validationResult.findFirst({
          where: { contentVersionId: revision.captionVersionId },
          orderBy: { createdAt: 'desc' },
        });
        const imageCheck = await tx.visualValidationResult.findFirst({
          where: { visualAssetId: revision.visualAssetId },
          orderBy: { createdAt: 'desc' },
        });
        if (
          !captionCheck ||
          !['PASSED', 'PASSED_WITH_WARNINGS'].includes(captionCheck.status) ||
          captionCheck.blockingCount > 0 ||
          !imageCheck ||
          !['PASSED', 'PASSED_WITH_WARNINGS'].includes(imageCheck.status) ||
          imageCheck.blockingCount > 0
        )
          throw new ValidationError({
            publicMessage: 'Caption and poster checks must pass before review.',
          });
      }
      const changed = await tx.post.updateMany({
        where: {
          id,
          revisionNumber: expectedRevision,
          status: post.status,
          reviewRound: post.reviewRound,
        },
        data: { status, ...(action === 'SUBMIT' ? { reviewRound: { increment: 1 } } : {}) },
      });
      if (changed.count !== 1 || revision.revisionNumber !== expectedRevision)
        throw new ConflictError({
          publicMessage: 'This is an older revision. Refresh before deciding.',
        });
      await appendPostEvent(tx, {
        data: {
          postId: id,
          revisionId: revision.id,
          actorUserId: actor.id,
          action,
          validationSnapshot: validationSnapshot
            ? (JSON.parse(JSON.stringify(validationSnapshot)) as Prisma.InputJsonObject)
            : Prisma.DbNull,
          reviewRound: action === 'SUBMIT' ? post.reviewRound + 1 : post.reviewRound,
          ...(comment ? { comment: comment.trim() } : {}),
        },
      });
    });
    return this.get(id, actor);
  }
}
