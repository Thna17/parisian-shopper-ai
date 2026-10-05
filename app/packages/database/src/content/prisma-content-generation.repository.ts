import { Injectable } from '@nestjs/common';
import {
  aiContentOutputSchema,
  assertContentJobTransition,
  type BeginGenerationInput,
  type BeginGenerationResult,
  type CompleteGenerationInput,
  type ContentGenerationRepository,
  ContentGenerationError,
  type ContentJob,
  type ContentVersion,
  type CreateContentJobInput,
  type FailGenerationInput,
  type GenerationAttempt,
} from '@parisian-shopper/application';
import {
  Prisma,
  type ContentJob as PrismaContentJob,
  type ContentVersion as PrismaContentVersion,
  type GenerationAttempt as PrismaGenerationAttempt,
} from '@prisma/client';

import { PrismaService } from '../prisma.service.js';

@Injectable()
export class PrismaContentGenerationRepository implements ContentGenerationRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async createJob(input: CreateContentJobInput): Promise<ContentJob> {
    return this.prisma.$transaction(async (tx) => {
      const job = await tx.contentJob.create({ data: input });
      await tx.outboxEvent.create({
        data: {
          topic: 'CONTENT_GENERATION_REQUESTED',
          schemaVersion: 1,
          idempotencyKey: `content-job:${job.id}:generation-requested`,
          aggregateType: 'ContentJob',
          aggregateId: job.id,
          payload: { contentJobId: job.id },
          occurredAt: job.createdAt,
          availableAt: job.createdAt,
        },
      });
      return toJob(job);
    });
  }

  public async findJobById(id: string): Promise<ContentJob | null> {
    const record = await this.prisma.contentJob.findUnique({ where: { id } });
    return record === null ? null : toJob(record);
  }

  public async findVersionById(id: string): Promise<ContentVersion | null> {
    const record = await this.prisma.contentVersion.findUnique({ where: { id } });
    return record === null ? null : toVersion(record);
  }

  public async beginGeneration(input: BeginGenerationInput): Promise<BeginGenerationResult> {
    return this.prisma.$transaction(
      async (tx) => {
        await lockJob(tx, input.contentJobId);
        const job = await tx.contentJob.findUnique({ where: { id: input.contentJobId } });
        if (job === null) throw notFound();
        if (
          job.status === 'DRAFT' ||
          job.status === 'UNDER_REVIEW' ||
          job.status === 'APPROVED' ||
          job.status === 'REJECTED'
        ) {
          return { disposition: 'ALREADY_COMPLETE', job: toJob(job) };
        }
        let sourceStatus = job.status;
        if (job.status === 'GENERATING') {
          const activeAttempt = await tx.generationAttempt.findFirst({
            where: { contentJobId: job.id, status: 'RUNNING' },
            orderBy: { attemptNumber: 'desc' },
          });
          const staleBefore = new Date(Date.now() - input.staleAfterMs);
          if (activeAttempt !== null && activeAttempt.startedAt > staleBefore) {
            return { disposition: 'ALREADY_RUNNING', job: toJob(job) };
          }
          if (activeAttempt !== null) {
            await tx.generationAttempt.update({
              where: { id: activeAttempt.id },
              data: {
                status: 'FAILED',
                completedAt: new Date(),
                errorCode: 'AI_ATTEMPT_ABANDONED',
                errorMetadata: { reason: 'stale_worker_lease' },
              },
            });
          }
          await tx.contentJob.update({ where: { id: job.id }, data: { status: 'FAILED' } });
          sourceStatus = 'FAILED';
        }
        assertContentJobTransition(sourceStatus, 'GENERATING');
        const activeRevision = await tx.revisionRequest.findFirst({
          where: { contentJobId: job.id, status: 'PENDING' },
          orderBy: { createdAt: 'desc' },
        });
        const aggregate = await tx.generationAttempt.aggregate({
          where: { contentJobId: job.id },
          _max: { attemptNumber: true },
        });
        const attempt = await tx.generationAttempt.create({
          data: {
            contentJobId: job.id,
            attemptNumber: (aggregate._max.attemptNumber ?? 0) + 1,
            provider: input.provider,
            model: input.model,
            promptVersion: input.promptVersion,
            status: 'RUNNING',
            startedAt: new Date(),
          },
        });
        const updated = await tx.contentJob.update({
          where: { id: job.id },
          data: { status: 'GENERATING' },
        });
        return {
          disposition: 'STARTED',
          job: toJob(updated),
          attempt: toAttempt(attempt),
          ...(activeRevision === null
            ? {}
            : {
                activeRevision: {
                  id: activeRevision.id,
                  type: activeRevision.type,
                  sourceContentVersionId: activeRevision.sourceContentVersionId,
                  ...(activeRevision.instruction === null
                    ? {}
                    : { instruction: activeRevision.instruction }),
                },
              }),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  public async completeGeneration(input: CompleteGenerationInput): Promise<ContentVersion> {
    return this.prisma.$transaction(
      async (tx) => {
        await lockJob(tx, input.contentJobId);
        const job = await tx.contentJob.findUnique({ where: { id: input.contentJobId } });
        if (job === null) throw notFound();
        if (job.status !== 'GENERATING') throw invalidState(job.status);
        const attempt = await tx.generationAttempt.findUnique({ where: { id: input.attemptId } });
        if (attempt === null || attempt.contentJobId !== job.id || attempt.status !== 'RUNNING') {
          throw new ContentGenerationError({
            code: 'INVALID_CONTENT_JOB_STATE',
            publicMessage: 'The generation attempt is no longer active.',
          });
        }
        const pendingRevision = await tx.revisionRequest.findFirst({
          where: { contentJobId: job.id, status: 'PENDING' },
          orderBy: { createdAt: 'desc' },
        });
        const aggregate = await tx.contentVersion.aggregate({
          where: { contentJobId: job.id },
          _max: { versionNumber: true },
        });
        const version = await tx.contentVersion.create({
          data: {
            contentJobId: job.id,
            versionNumber: (aggregate._max.versionNumber ?? 0) + 1,
            brandRuleVersionId: job.brandRuleVersionId,
            productSnapshotId: job.productSnapshotId,
            generationAttemptId: attempt.id,
            revisionRequestId: pendingRevision?.id ?? null,
            provider: input.provider,
            model: input.model,
            promptVersion: input.promptVersion,
            structuredOutput: toJson(input.output),
            providerMetadata:
              input.providerMetadata === undefined ? Prisma.DbNull : toJson(input.providerMetadata),
          },
        });
        if (pendingRevision !== null) {
          await tx.revisionRequest.update({
            where: { id: pendingRevision.id },
            data: {
              status: 'COMPLETED',
              resultingContentVersionId: version.id,
            },
          });
        }
        await tx.generationAttempt.update({
          where: { id: attempt.id },
          data: {
            status: 'SUCCEEDED',
            completedAt: new Date(),
            latencyMs: input.latencyMs,
            inputTokenCount: input.inputTokens ?? null,
            outputTokenCount: input.outputTokens ?? null,
            totalTokenCount: input.totalTokens ?? null,
          },
        });
        assertContentJobTransition(job.status, 'DRAFT');
        await tx.contentJob.update({ where: { id: job.id }, data: { status: 'DRAFT' } });
        await tx.outboxEvent.create({
          data: {
            topic: 'CONTENT_VERSION_CREATED',
            schemaVersion: 1,
            idempotencyKey: `content-version:${version.id}:created`,
            aggregateType: 'ContentJob',
            aggregateId: job.id,
            payload: { contentJobId: job.id, contentVersionId: version.id },
            occurredAt: version.createdAt,
            availableAt: version.createdAt,
          },
        });
        return toVersion(version);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  public async failGeneration(input: FailGenerationInput): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        await lockJob(tx, input.contentJobId);
        const job = await tx.contentJob.findUnique({ where: { id: input.contentJobId } });
        if (job === null) throw notFound();
        const attempt = await tx.generationAttempt.findUnique({ where: { id: input.attemptId } });
        if (attempt === null || attempt.contentJobId !== job.id || attempt.status !== 'RUNNING')
          return;
        await tx.generationAttempt.update({
          where: { id: attempt.id },
          data: {
            status: input.status,
            completedAt: new Date(),
            latencyMs: input.latencyMs,
            errorCode: input.errorCode,
            errorMetadata:
              input.errorMetadata === undefined ? Prisma.DbNull : toJson(input.errorMetadata),
          },
        });
        await tx.revisionRequest.updateMany({
          where: { contentJobId: job.id, status: 'PENDING' },
          data: { status: 'FAILED' },
        });
        if (job.status === 'GENERATING') {
          assertContentJobTransition(job.status, 'FAILED');
          await tx.contentJob.update({ where: { id: job.id }, data: { status: 'FAILED' } });
          const occurredAt = new Date();
          await tx.outboxEvent.create({
            data: {
              topic: 'CONTENT_GENERATION_FAILED',
              schemaVersion: 1,
              idempotencyKey: `content-job:${job.id}:generation-failed:${attempt.id}`,
              aggregateType: 'ContentJob',
              aggregateId: job.id,
              payload: { contentJobId: job.id, errorCode: input.errorCode },
              occurredAt,
              availableAt: occurredAt,
            },
          });
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  public async findVersionsByJobId(contentJobId: string): Promise<readonly ContentVersion[]> {
    return (
      await this.prisma.contentVersion.findMany({
        where: { contentJobId },
        orderBy: { versionNumber: 'asc' },
      })
    ).map(toVersion);
  }

  public async findAttemptsByJobId(contentJobId: string): Promise<readonly GenerationAttempt[]> {
    return (
      await this.prisma.generationAttempt.findMany({
        where: { contentJobId },
        orderBy: { attemptNumber: 'asc' },
      })
    ).map(toAttempt);
  }
}

async function lockJob(tx: Prisma.TransactionClient, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM content_jobs WHERE id = ${id}::uuid FOR UPDATE`;
}

function toJob(record: PrismaContentJob): ContentJob {
  return {
    id: record.id,
    productSnapshotId: record.productSnapshotId,
    brandRuleVersionId: record.brandRuleVersionId,
    requesterUserId: record.requesterUserId,
    ...(record.telegramCreateFlowId === null
      ? {}
      : { telegramCreateFlowId: record.telegramCreateFlowId }),
    contentType: record.contentType,
    language: record.language,
    platform: record.platform,
    ...(record.campaignContext === null ? {} : { campaignContext: record.campaignContext }),
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function toAttempt(record: PrismaGenerationAttempt): GenerationAttempt {
  return {
    id: record.id,
    contentJobId: record.contentJobId,
    attemptNumber: record.attemptNumber,
    provider: record.provider,
    model: record.model,
    promptVersion: record.promptVersion,
    status: record.status,
    startedAt: record.startedAt,
    ...(record.completedAt === null ? {} : { completedAt: record.completedAt }),
    ...(record.errorCode === null ? {} : { errorCode: record.errorCode }),
  };
}

function toVersion(record: PrismaContentVersion): ContentVersion {
  return {
    id: record.id,
    contentJobId: record.contentJobId,
    versionNumber: record.versionNumber,
    brandRuleVersionId: record.brandRuleVersionId,
    productSnapshotId: record.productSnapshotId,
    generationAttemptId: record.generationAttemptId,
    ...(record.revisionRequestId === null ? {} : { revisionRequestId: record.revisionRequestId }),
    provider: record.provider,
    model: record.model,
    promptVersion: record.promptVersion,
    structuredOutput: aiContentOutputSchema.parse(record.structuredOutput),
    createdAt: record.createdAt,
  };
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function notFound(): ContentGenerationError {
  return new ContentGenerationError({
    code: 'CONTENT_JOB_NOT_FOUND',
    publicMessage: 'Content job was not found.',
  });
}

function invalidState(status: string): ContentGenerationError {
  return new ContentGenerationError({
    code: 'INVALID_CONTENT_JOB_STATE',
    publicMessage: 'Content job is not in a valid state for this operation.',
    details: { status },
  });
}
