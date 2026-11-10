import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConflictError, ForbiddenError, ValidationError } from '@parisian-shopper/common';
import {
  assertPostOwner,
  canonicalJson,
  aiContentOutputSchema,
  type PostCaptionRepository,
  type CaptionAttempt,
  type CaptionBrandOption,
  type PostActor,
  type AIContentOutput,
  type FactualValidationOutcome,
} from '@parisian-shopper/application';
import { PrismaService } from '../prisma.service.js';
import { PrismaBrandRuleRepository } from '../brand/prisma-brand-rule.repository.js';
import { appendPostEvent } from './post-outbox.js';
const json = (v: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
@Injectable()
export class PrismaPostCaptionRepository implements PostCaptionRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandsRepository: PrismaBrandRuleRepository,
  ) {}
  async brands(): Promise<CaptionBrandOption[]> {
    const approvedRules = await this.prisma.postCaptionBrandApproval.findMany({
      select: { brandRuleVersionId: true },
    });
    const versions = await this.prisma.brandRuleVersion.findMany({
      where: {
        OR: [{ status: 'ACTIVE' }, { id: { in: approvedRules.map((r) => r.brandRuleVersionId) } }],
      },
      select: { id: true },
    });
    const options = await Promise.all(
      versions.map(async (row) => {
        try {
          const version = (await this.brandsRepository.findById(row.id))!;
          const digest = createHash('sha256').update(canonicalJson(version.rules)).digest('hex');
          const approved = Boolean(
            await this.prisma.postCaptionBrandApproval.findUnique({
              where: {
                brandRuleVersionId_rulesDigest: { brandRuleVersionId: row.id, rulesDigest: digest },
              },
            }),
          );
          return {
            version,
            digest,
            approved,
            hasPlaceholders: JSON.stringify(version.rules).includes('TODO_BUSINESS_CONFIRMATION'),
          };
        } catch {
          return null;
        }
      }),
    );
    return options.filter((row): row is CaptionBrandOption => row !== null);
  }
  async approveBrand(id: string, digest: string, actor: PostActor): Promise<void> {
    if (!actor.permissions.includes('ADMIN'))
      throw new ForbiddenError({
        publicMessage: 'An administrator must review and approve brand guidance.',
      });
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM brand_rule_versions WHERE id = ${id}::uuid FOR UPDATE`;
      const version = await new PrismaBrandRuleRepository(tx as unknown as PrismaService).findById(
        id,
      );
      if (
        !version ||
        version.status !== 'ACTIVE' ||
        JSON.stringify(version.rules).includes('TODO_BUSINESS_CONFIRMATION')
      )
        throw new ValidationError({
          publicMessage:
            'Complete the brand guidance and activate it before business approval. Placeholder rules cannot be approved.',
        });
      if (createHash('sha256').update(canonicalJson(version.rules)).digest('hex') !== digest)
        throw new ConflictError({
          publicMessage: 'Brand guidance changed. Review the current rules before approving.',
        });
      if (
        await tx.postCaptionBrandApproval.findUnique({
          where: {
            brandRuleVersionId_rulesDigest: { brandRuleVersionId: id, rulesDigest: digest },
          },
        })
      )
        return;
      await tx.postCaptionBrandApproval.create({
        data: {
          brandRuleVersionId: id,
          rulesDigest: digest,
          rulesSnapshot: json(version.rules),
          approvedByUserId: actor.id,
        },
      });
    });
  }
  async enqueue(input: Parameters<PostCaptionRepository['enqueue']>[0]): Promise<CaptionAttempt> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM posts WHERE id = ${input.postId}::uuid FOR UPDATE`;
      const post = await tx.post.findUniqueOrThrow({ where: { id: input.postId } });
      assertPostOwner(input.actor, post.creatorUserId);
      if (
        post.revisionNumber !== input.expectedRevision ||
        !['DRAFT', 'CHANGES_REQUESTED'].includes(post.status)
      )
        throw new ConflictError({
          publicMessage:
            'Save an editable draft and refresh its revision before generating a caption.',
        });
      const revision = await tx.postRevision.findUniqueOrThrow({
        where: { postId_revisionNumber: { postId: post.id, revisionNumber: post.revisionNumber } },
      });
      const existing = await tx.postCaptionAttempt.findUnique({
        where: { sourceRevisionId: revision.id },
      });
      if (existing) {
        if (
          existing.method !== input.method ||
          existing.brandRuleVersionId !== input.brandRuleVersionId ||
          existing.brandRuleDigest !== input.brandRuleDigest ||
          existing.provider !== input.provider ||
          existing.model !== input.model ||
          canonicalJson(existing.context) !== canonicalJson(input.context)
        )
          throw new ConflictError({
            publicMessage:
              'This revision already has a different caption request. Open its status before preparing another revision.',
          });
        return existing as CaptionAttempt;
      }
      const active = await tx.postCaptionAttempt.count({
        where: { postId: post.id, status: { in: ['QUEUED', 'GENERATING', 'UNCERTAIN'] } },
      });
      const image = await tx.postGeneration.count({
        where: {
          postId: post.id,
          status: {
            in: [
              'AWAITING_CONFIRMATION',
              'QUEUED',
              'PREPARING',
              'SUBMITTING',
              'GENERATING',
              'UNCERTAIN',
              'COMPOSITING',
            ],
          },
        },
      });
      if (active || image)
        throw new ConflictError({
          publicMessage:
            'Finish or reconcile the existing caption or poster request before changing this draft.',
        });
      return (await tx.postCaptionAttempt.create({
        data: {
          postId: post.id,
          sourceRevisionId: revision.id,
          sourceRevisionNumber: post.revisionNumber,
          requesterUserId: input.actor.id,
          brandRuleVersionId: input.brandRuleVersionId,
          brandRuleDigest: input.brandRuleDigest,
          method: input.method,
          provider: input.provider,
          model: input.model,
          context: input.context ? json(input.context) : Prisma.DbNull,
          deadline: new Date(Date.now() + input.timeoutMs + 10000),
        },
      })) as CaptionAttempt;
    });
  }
  async latest(postId: string): Promise<CaptionAttempt | null> {
    await this.prisma.postCaptionAttempt.updateMany({
      where: {
        postId,
        status: 'GENERATING',
        deadline: { lt: new Date() },
      },
      data: {
        status: 'UNCERTAIN',
        error:
          'The caption request ended without a confirmed attachment. Recover a saved response if available; otherwise ask an administrator to reconcile the provider outcome. Do not resubmit.',
      },
    });
    await this.prisma.postCaptionAttempt.updateMany({
      where: { postId, status: 'QUEUED', deadline: { lt: new Date() } },
      data: {
        status: 'FAILED',
        error: 'The caption request did not start. Save a new revision to try again.',
      },
    });
    return (await this.prisma.postCaptionAttempt.findFirst({
      where: { postId },
      orderBy: { createdAt: 'desc' },
    })) as CaptionAttempt | null;
  }
  async claim(id: string): Promise<boolean> {
    return (
      (
        await this.prisma.postCaptionAttempt.updateMany({
          where: { id, status: 'QUEUED', deadline: { gt: new Date() } },
          data: { status: 'GENERATING' },
        })
      ).count === 1
    );
  }
  async capture(
    id: string,
    output: unknown,
    provenance: Record<string, unknown>,
    providerRequestId?: string,
  ): Promise<void> {
    const result = await this.prisma.postCaptionAttempt.updateMany({
      where: { id, status: { in: ['GENERATING', 'UNCERTAIN'] }, output: { equals: Prisma.DbNull } },
      data: {
        output: json(output),
        provenance: json(provenance),
        ...(providerRequestId ? { providerRequestId } : {}),
      },
    });
    if (result.count !== 1)
      throw new ConflictError({
        publicMessage:
          'The caption result could not be saved safely. Check its existing request before continuing.',
      });
  }
  async fail(id: string, status: 'FAILED' | 'UNCERTAIN' | 'BLOCKED', error: string): Promise<void> {
    await this.prisma.postCaptionAttempt.updateMany({
      where: { id, status: { notIn: ['COMPLETE'] } },
      data: { status, error },
    });
  }
  async finish(
    id: string,
    output: AIContentOutput,
    validation: FactualValidationOutcome,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.postCaptionAttempt.findUniqueOrThrow({ where: { id } });
      await tx.$queryRaw`SELECT id FROM posts WHERE id = ${row.postId}::uuid FOR UPDATE`;
      const post = await tx.post.findUniqueOrThrow({ where: { id: row.postId } });
      if (row.status === 'COMPLETE') return;
      if (
        !row.output ||
        canonicalJson(aiContentOutputSchema.parse(row.output)) !== canonicalJson(output) ||
        validation.blockingCount ||
        !['PASSED', 'PASSED_WITH_WARNINGS'].includes(validation.status)
      )
        throw new ValidationError({
          publicMessage: 'Caption checks must pass before saving this generated revision.',
        });
      if (
        post.revisionNumber !== row.sourceRevisionNumber ||
        !['DRAFT', 'CHANGES_REQUESTED'].includes(post.status)
      )
        throw new ConflictError({
          publicMessage:
            'The source draft changed. The caption is retained in its attempt; it cannot replace a newer revision.',
        });
      const source = await tx.postRevision.findUniqueOrThrow({
        where: { id: row.sourceRevisionId },
      });
      const revision = await tx.postRevision.create({
        data: {
          postId: post.id,
          revisionNumber: post.revisionNumber + 1,
          authorUserId: row.requesterUserId,
          productSnapshotId: source.productSnapshotId,
          campaignId: source.campaignId,
          campaignSnapshot: source.campaignSnapshot ?? Prisma.DbNull,
          brief: source.brief,
          channel: source.channel,
          language: source.language,
          creationPlan: source.creationPlan ?? Prisma.DbNull,
          captionDraft: json(output),
          captionValidation: json(validation),
          captionGenerationId: row.id,
          brandSnapshot:
            (row.provenance as { brandGuidance?: Prisma.InputJsonValue } | null)?.brandGuidance ??
            Prisma.DbNull,
          captionProvenance: row.provenance ?? Prisma.DbNull,
        },
      });
      await tx.post.update({
        where: { id: post.id },
        data: { revisionNumber: { increment: 1 }, status: 'DRAFT' },
      });
      await tx.postCaptionAttempt.update({
        where: { id },
        data: { status: 'COMPLETE', validation: json(validation), error: null },
      });
      await appendPostEvent(tx, {
        data: {
          postId: post.id,
          revisionId: revision.id,
          actorUserId: row.requesterUserId,
          action: row.method === 'AI' ? 'AI_CAPTION_SAVED' : 'TEMPLATE_CAPTION_SAVED',
        },
      });
    });
  }
}
