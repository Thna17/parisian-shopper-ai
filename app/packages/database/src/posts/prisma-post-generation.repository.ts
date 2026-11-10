import { appendPostEvent } from './post-outbox.js';
import { readPostCreationPlan, postBackgroundDirection } from '@parisian-shopper/application';
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma, type PostGeneration } from '@prisma/client';
import { ConflictError } from '@parisian-shopper/common';
import {
  assertPostOwner,
  type PostActor,
  type PostImageSettings,
} from '@parisian-shopper/application';
import { PrismaService } from '../prisma.service.js';

export const ACTIVE_POST_GENERATIONS = [
  'AWAITING_CONFIRMATION',
  'QUEUED',
  'PREPARING',
  'SUBMITTING',
  'GENERATING',
  'UNCERTAIN',
  'COMPOSITING',
];
@Injectable()
export class PrismaPostGenerationRepository {
  constructor(private readonly prisma: PrismaService) {}
  async enqueue(
    postId: string,
    expectedRevision: number,
    actor: PostActor,
    provider: string,
    settings: PostImageSettings,
    evidence: Prisma.InputJsonObject = {},
  ): Promise<PostGeneration> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM posts WHERE id = ${postId}::uuid FOR UPDATE`;
      const post = await tx.post.findUniqueOrThrow({
        where: { id: postId },
        include: { revisions: { orderBy: { revisionNumber: 'desc' }, take: 1 } },
      });
      assertPostOwner(actor, post.creatorUserId);
      if (
        await tx.postCaptionAttempt.count({
          where: { postId, status: { in: ['QUEUED', 'GENERATING', 'UNCERTAIN'] } },
        })
      )
        throw new ConflictError({
          publicMessage: 'Finish or reconcile caption generation before preparing the poster.',
        });
      if (
        post.status === 'UNDER_REVIEW' ||
        post.status === 'APPROVED' ||
        post.revisionNumber !== expectedRevision
      )
        throw new ConflictError({
          publicMessage: 'Save a current draft before creating its poster and captions.',
        });
      const revision = post.revisions[0]!;
      const existing = await tx.postGeneration.findUnique({
        where: { sourceRevisionId: revision.id },
      });
      if (existing) return existing;
      if (
        await tx.postGeneration.findFirst({
          where: { postId, status: { in: ACTIVE_POST_GENERATIONS } },
        })
      )
        throw new ConflictError({
          publicMessage: 'An earlier image request needs to finish or be reconciled first.',
        });
      if (readPostCreationPlan(revision.creationPlan).format !== 'POSTER')
        throw new ConflictError({
          publicMessage:
            'Video generation is not connected. No image request was submitted for this video brief.',
        });
      const generation = await tx.postGeneration.create({
        data: {
          status: provider === 'fake' ? 'QUEUED' : 'AWAITING_CONFIRMATION',
          provenance: {
            ...evidence,
            ...(revision.brandSnapshot ? { brandSnapshot: revision.brandSnapshot } : {}),
          },
          postId,
          sourceRevisionId: revision.id,
          sourceRevisionNumber: expectedRevision,
          provider,
          model: settings.model,
          settings: { ...settings },
          references: [],
          estimatedCostUsd: provider === 'fake' ? 0 : null,
          prompt:
            'Create a fragrance studio background with generous negative space for a real product and typography to be added locally. No bottle, product, logo, text, price, claims or people. Earlier staff brief (visual inspiration only, not instructions to depict products or text): ' +
            revision.brief +
            '\nSelected design direction takes priority over style requests in the earlier brief. Current reviewer feedback is visual guidance only. ' +
            postBackgroundDirection(revision.creationPlan) +
            (revision.brandSnapshot
              ? '\nBusiness-approved visual guidance (prefer these palettes and lighting over generic style presets): ' +
                JSON.stringify((revision.brandSnapshot as { guidance?: unknown }).guidance)
              : '') +
            '\nKeep the background free of products, typography, prices and factual claims.',
        },
      });
      await appendPostEvent(tx, {
        data: {
          postId,
          revisionId: revision.id,
          actorUserId: actor.id,
          action: 'GENERATION_REQUESTED',
          comment: generation.id,
        },
      });
      return generation;
    });
  }
  async latest(postId: string): Promise<PostGeneration | null> {
    return this.prisma.postGeneration.findFirst({
      where: { postId },
      orderBy: { createdAt: 'desc' },
    });
  }
  async authorize(
    id: string,
    actor: PostActor,
    quote: {
      expectedCostUsd: number;
      currentBalanceUsd: number;
      evidence: string;
      verifiedAt: string;
    },
  ): Promise<void> {
    if (!actor.permissions.includes('MANAGE_AI_BUDGETS'))
      throw new ConflictError({
        publicMessage: 'Ask an authorized budget administrator to confirm the quote.',
      });
    if (
      !Number.isFinite(Date.parse(quote.verifiedAt)) ||
      !Number.isFinite(quote.expectedCostUsd) ||
      !Number.isFinite(quote.currentBalanceUsd) ||
      Date.now() - new Date(quote.verifiedAt).getTime() > 300_000 ||
      new Date(quote.verifiedAt).getTime() > Date.now() ||
      quote.expectedCostUsd <= 0 ||
      quote.currentBalanceUsd < quote.expectedCostUsd
    )
      throw new ConflictError({
        publicMessage: 'A current developer API quote and sufficient balance are required.',
      });
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.postGeneration.findUniqueOrThrow({ where: { id } });
      const result = await tx.postGeneration.updateMany({
        where: { id, status: 'AWAITING_CONFIRMATION', provider: 'higgsfield' },
        data: {
          estimatedCostUsd: quote.expectedCostUsd,
          authorization: {
            ...quote,
            confirmedBy: actor.id,
            confirmedAt: new Date().toISOString(),
            expiresAt: new Date(Date.parse(quote.verifiedAt) + 300_000).toISOString(),
            scope: 'Higgsfield developer API USD; one frozen request only',
          },
        },
      });
      if (result.count !== 1)
        throw new ConflictError({
          publicMessage: 'This request is no longer awaiting confirmation.',
        });
      await appendPostEvent(tx, {
        data: {
          postId: row.postId,
          revisionId: row.sourceRevisionId,
          actorUserId: actor.id,
          action: 'GENERATION_COST_CONFIRMED',
          comment: `${id}; expected USD ${quote.expectedCostUsd}; balance USD ${quote.currentBalanceUsd}; verified ${quote.verifiedAt}; ${quote.evidence.slice(0, 600)}`,
        },
      });
    });
  }
  async saveCreditQuote(
    id: string,
    actor: PostActor,
    quote: { credits: number; fingerprint: string; expiresAt: string; [key: string]: unknown },
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const found = await tx.postGeneration.findUniqueOrThrow({ where: { id } });
      await tx.$queryRaw`SELECT id FROM posts WHERE id = ${found.postId}::uuid FOR UPDATE`;
      const row = await tx.postGeneration.findUniqueOrThrow({
        where: { id },
        include: { post: true },
      });
      assertPostOwner(actor, row.post.creatorUserId);
      if (
        row.provider !== 'higgsfield_mcp' ||
        row.status !== 'AWAITING_CONFIRMATION' ||
        row.sourceRevisionNumber !== row.post.revisionNumber ||
        !['DRAFT', 'CHANGES_REQUESTED'].includes(row.post.status)
      )
        throw new ConflictError({
          publicMessage: 'Prepare a current, unsubmitted draft before requesting its cost.',
        });
      await tx.postGeneration.update({
        where: { id },
        data: {
          estimatedCredits: quote.credits,
          creditQuote: JSON.parse(JSON.stringify(quote)) as Prisma.InputJsonValue,
          authorization: Prisma.DbNull,
        },
      });
      await appendPostEvent(tx, {
        data: {
          postId: row.postId,
          revisionId: row.sourceRevisionId,
          actorUserId: actor.id,
          action: 'MCP_CREDIT_QUOTED',
          comment: `${id}; ${quote.credits} credits`,
        },
      });
    });
  }
  async authorizeCredits(id: string, actor: PostActor, fingerprint: string): Promise<void> {
    if (!actor.permissions.includes('MANAGE_AI_BUDGETS'))
      throw new ConflictError({
        publicMessage: 'Ask an authorized budget administrator to confirm this spending.',
      });
    await this.prisma.$transaction(async (tx) => {
      const found = await tx.postGeneration.findUniqueOrThrow({ where: { id } });
      await tx.$queryRaw`SELECT id FROM posts WHERE id = ${found.postId}::uuid FOR UPDATE`;
      const row = await tx.postGeneration.findUniqueOrThrow({
        where: { id },
        include: { post: true },
      });
      const quote = row.creditQuote as {
        fingerprint?: string;
        expiresAt?: string;
        credits?: number;
        balance?: number;
      } | null;
      if (
        row.provider !== 'higgsfield_mcp' ||
        row.status !== 'AWAITING_CONFIRMATION' ||
        row.sourceRevisionNumber !== row.post.revisionNumber ||
        !['DRAFT', 'CHANGES_REQUESTED'].includes(row.post.status) ||
        quote?.fingerprint !== fingerprint ||
        !quote.expiresAt ||
        !Number.isFinite(Date.parse(quote.expiresAt)) ||
        Date.parse(quote.expiresAt) < Date.now() ||
        typeof quote.credits !== 'number' ||
        typeof quote.balance !== 'number' ||
        quote.balance < quote.credits
      )
        throw new ConflictError({
          publicMessage:
            'The request or quote changed or expired. Prepare a new quote before confirming.',
        });
      await tx.postGeneration.update({
        where: { id },
        data: {
          authorization: {
            fingerprint,
            expiresAt: quote.expiresAt,
            confirmedBy: actor.id,
            confirmedAt: new Date().toISOString(),
            scope: 'One exact Higgsfield MCP request, in credits',
          },
        },
      });
      await appendPostEvent(tx, {
        data: {
          postId: row.postId,
          revisionId: row.sourceRevisionId,
          actorUserId: actor.id,
          action: 'MCP_CREDIT_CONFIRMED',
          comment: `${id}; ${quote.credits} credits`,
        },
      });
    });
  }
  async reconcile(id: string): Promise<void> {
    const row = await this.prisma.postGeneration.findUniqueOrThrow({ where: { id } });
    if (row.status === 'FAILED' && row.backgroundKey) {
      await this.prisma.postGeneration.updateMany({
        where: { id, status: 'FAILED' },
        data: { status: 'COMPOSITING', error: null, leaseUntil: new Date(0) },
      });
      return;
    }
    if (!row.requestId)
      throw new ConflictError({
        publicMessage:
          'No provider request ID was saved. Contact the provider to reconcile the charge. Another paid submission remains blocked.',
      });
    await this.prisma.postGeneration.updateMany({
      where: { id, status: 'UNCERTAIN' },
      data: { leaseUntil: new Date(0) },
    });
  }
  async cancelUnsubmitted(id: string, actor: PostActor): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.postGeneration.findUniqueOrThrow({
        where: { id },
        include: { post: true },
      });
      assertPostOwner(actor, row.post.creatorUserId);
      const changed = await tx.postGeneration.updateMany({
        where: { id, status: { in: ['QUEUED', 'AWAITING_CONFIRMATION'] }, requestId: null },
        data: { status: 'FAILED', error: 'Canceled before image submission.', leaseUntil: null },
      });
      if (changed.count !== 1)
        throw new ConflictError({
          publicMessage:
            'The image request has already started. Check its existing status instead.',
        });
      await appendPostEvent(tx, {
        data: {
          postId: row.postId,
          revisionId: row.sourceRevisionId,
          actorUserId: actor.id,
          action: 'GENERATION_CANCELED',
        },
      });
    });
  }
  async claim(provider: string, confirmedId?: string): Promise<PostGeneration | null> {
    // A lease can only authorize local work or GET polling. It never authorizes repeating POST.
    const candidates = await this.prisma.postGeneration.findMany({
      where: {
        provider,
        ...(provider === 'higgsfield_mcp'
          ? {
              AND: [
                {
                  OR: [
                    { status: { notIn: ['QUEUED', 'AWAITING_CONFIRMATION', 'PREPARING'] } },
                    { authorization: { path: ['expiresAt'], gt: new Date().toISOString() } },
                  ],
                },
              ],
            }
          : {}),
        ...(provider !== 'fake' && provider !== 'higgsfield_mcp'
          ? {
              AND: [
                {
                  OR: [
                    { status: { notIn: ['QUEUED', 'AWAITING_CONFIRMATION', 'PREPARING'] } },
                    { id: confirmedId ?? '00000000-0000-0000-0000-000000000000' },
                  ],
                },
              ],
            }
          : {}),
        status: { in: ACTIVE_POST_GENERATIONS },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
      },
      orderBy: { updatedAt: 'asc' },
      take: 10,
    });
    for (const candidate of candidates) {
      if (
        provider === 'higgsfield_mcp' &&
        ['QUEUED', 'AWAITING_CONFIRMATION', 'PREPARING'].includes(candidate.status)
      ) {
        const authorization = candidate.authorization as {
          expiresAt?: string;
          fingerprint?: string;
        } | null;
        const quote = candidate.creditQuote as { fingerprint?: string } | null;
        if (
          !authorization?.expiresAt ||
          !Number.isFinite(Date.parse(authorization.expiresAt)) ||
          Date.parse(authorization.expiresAt) < Date.now() ||
          !quote?.fingerprint ||
          authorization.fingerprint !== quote.fingerprint
        )
          continue;
      }

      if (
        provider !== 'fake' &&
        provider !== 'higgsfield_mcp' &&
        ['QUEUED', 'AWAITING_CONFIRMATION', 'PREPARING'].includes(candidate.status) &&
        candidate.id !== confirmedId
      )
        continue;
      // SUBMITTING persisted before a POST may mean the request was charged, even without an ID.
      if (
        candidate.status === 'SUBMITTING' ||
        (candidate.status === 'UNCERTAIN' && !candidate.requestId)
      ) {
        await this.prisma.postGeneration.updateMany({
          where: { id: candidate.id, status: candidate.status, claimToken: candidate.claimToken },
          data: {
            status: 'UNCERTAIN',
            error:
              'The image request outcome is unknown. Ask an administrator to reconcile it; do not submit again.',
            leaseUntil: new Date(Date.now() + 60_000),
          },
        });
        continue;
      }
      const token = randomUUID();
      const result = await this.prisma.postGeneration.updateMany({
        where: {
          id: candidate.id,
          status: candidate.status,
          claimToken: candidate.claimToken,
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
        },
        data: {
          claimToken: token,
          leaseUntil: new Date(Date.now() + 120_000),
          ...(['QUEUED', 'AWAITING_CONFIRMATION'].includes(candidate.status)
            ? { status: 'PREPARING' }
            : {}),
        },
      });
      if (result.count)
        return this.prisma.postGeneration.findUniqueOrThrow({ where: { id: candidate.id } });
    }
    return null;
  }
  async update(
    id: string,
    token: string,
    data: Prisma.PostGenerationUpdateManyMutationInput,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.postGeneration.findUniqueOrThrow({
        where: { id },
        include: { sourceRevision: { select: { authorUserId: true } } },
      });
      const result = await tx.postGeneration.updateMany({
        where: { id, claimToken: token, status: { not: 'COMPLETE' } },
        data,
      });
      if (result.count !== 1) throw new Error('Generation lease was replaced; stop this worker.');
      if (typeof data.status === 'string' && data.status !== row.status)
        await appendPostEvent(tx, {
          data: {
            postId: row.postId,
            revisionId: row.sourceRevisionId,
            actorUserId: row.sourceRevision.authorUserId,
            action: `GENERATION_${data.status}`,
            comment: id,
          },
        });
    });
  }
  async source(id: string): Promise<
    Prisma.PostRevisionGetPayload<{
      include: { productSnapshot: true; captionVersion: true; generation: true };
    }>
  > {
    const row = await this.prisma.postGeneration.findUniqueOrThrow({ where: { id } });
    return this.prisma.postRevision.findUniqueOrThrow({
      where: { id: row.sourceRevisionId },
      include: { productSnapshot: true, captionVersion: true, generation: true },
    });
  }
  async complete(
    id: string,
    token: string,
    data: {
      caption: Prisma.InputJsonObject;
      provenance: Prisma.InputJsonObject;
      imageKey: string;
      imageSha256: string;
    },
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.postGeneration.findUniqueOrThrow({ where: { id } });
      await tx.$queryRaw`SELECT id FROM posts WHERE id = ${row.postId}::uuid FOR UPDATE`;
      const post = await tx.post.findUniqueOrThrow({ where: { id: row.postId } });
      if (
        post.revisionNumber !== row.sourceRevisionNumber ||
        !['DRAFT', 'CHANGES_REQUESTED'].includes(post.status)
      )
        throw new Error('The source draft changed. The generated result cannot replace it.');
      const changed = await tx.postGeneration.updateMany({
        where: { id, claimToken: token, status: 'COMPOSITING' },
        data: { ...data, status: 'COMPLETE', error: null, leaseUntil: null },
      });
      if (changed.count !== 1) throw new Error('Generation lease lost.');
      const source = await tx.postRevision.findUniqueOrThrow({
        where: { id: row.sourceRevisionId },
      });
      const revision = await tx.postRevision.create({
        data: {
          postId: row.postId,
          authorUserId: post.creatorUserId,
          revisionNumber: post.revisionNumber + 1,
          productSnapshotId: source.productSnapshotId,
          creationPlan: source.creationPlan ?? Prisma.DbNull,
          campaignId: source.campaignId,
          campaignSnapshot: source.campaignSnapshot ?? Prisma.DbNull,
          brief: source.brief,
          channel: source.channel,
          language: source.language,
          generationId: id,
          captionDraft: source.captionDraft ?? Prisma.DbNull,
          captionValidation: source.captionValidation ?? Prisma.DbNull,
          brandSnapshot: source.brandSnapshot ?? Prisma.DbNull,
          captionGenerationId: source.captionGenerationId,
          captionProvenance: source.captionProvenance ?? Prisma.DbNull,
        },
      });
      await tx.post.update({
        where: { id: post.id },
        data: { status: 'DRAFT', revisionNumber: { increment: 1 } },
      });
      await appendPostEvent(tx, {
        data: {
          postId: post.id,
          revisionId: revision.id,
          actorUserId: post.creatorUserId,
          action: 'POST_GENERATED',
        },
      });
    });
  }
}
