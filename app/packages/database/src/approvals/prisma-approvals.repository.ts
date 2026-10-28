import { Injectable } from '@nestjs/common';
import {
  ActiveRevisionConflictError,
  ContentAlreadyApprovedError,
  ContentAlreadyRejectedError,
  ContentNotApprovalEligibleError,
  InvalidReviewStateError,
  SelfApprovalProhibitedError,
  StaleContentVersionError,
  assertContentJobTransition,
  type ApprovalEventRecord,
  type ApprovalStatusView,
  type ApprovalsRepository,
  type ContentReviewState,
  type CreateApprovalInput,
  type CreatePendingInteractionInput,
  type CreateRevisionRequestInput,
  type PendingReviewInteractionRecord,
  type RevisionRequestRecord,
} from '@parisian-shopper/application';
import { ValidationError } from '@parisian-shopper/common';
import {
  Prisma,
  type ApprovalEvent as PrismaApprovalEvent,
  type RevisionRequest as PrismaRevisionRequest,
  type TelegramPendingReviewInteraction as PrismaPendingInteraction,
} from '@prisma/client';

import { PrismaService } from '../prisma.service.js';

@Injectable()
export class PrismaApprovalsRepository implements ApprovalsRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async createRevisionRequest(
    input: CreateRevisionRequestInput,
  ): Promise<RevisionRequestRecord> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockJob(tx, input.contentJobId);
        const job = await tx.contentJob.findUnique({ where: { id: input.contentJobId } });
        if (job === null) {
          throw new ValidationError({ publicMessage: 'Content job was not found.' });
        }
        if (job.status === 'GENERATING' || job.status === 'REVISION_REQUESTED') {
          throw new ActiveRevisionConflictError('A new version is already being generated.');
        }
        if (job.status !== 'UNDER_REVIEW') {
          throw new InvalidReviewStateError(
            `Content job is not in reviewable state (currently ${job.status}).`,
          );
        }

        const sourceVersion = await tx.contentVersion.findUnique({
          where: { id: input.sourceContentVersionId },
        });
        if (sourceVersion === null || sourceVersion.contentJobId !== job.id) {
          throw new ValidationError({
            publicMessage: 'Source content version does not belong to this content job.',
          });
        }

        const maxVersion = await tx.contentVersion.aggregate({
          where: { contentJobId: job.id },
          _max: { versionNumber: true },
        });
        if (sourceVersion.versionNumber !== maxVersion._max.versionNumber) {
          throw new StaleContentVersionError(
            'A newer version is available. Review the latest draft before revising.',
          );
        }

        const activePending = await tx.revisionRequest.findFirst({
          where: { contentJobId: job.id, status: 'PENDING' },
        });
        if (activePending !== null) {
          throw new ActiveRevisionConflictError('A new version is already being generated.');
        }

        const revision = await tx.revisionRequest.create({
          data: {
            contentJobId: job.id,
            sourceContentVersionId: sourceVersion.id,
            requestedByUserId: input.requestedByUserId,
            type: input.type,
            instruction: input.instruction ?? null,
            status: 'PENDING',
          },
        });

        assertContentJobTransition(job.status, 'REVISION_REQUESTED');
        await tx.contentJob.update({
          where: { id: job.id },
          data: { status: 'REVISION_REQUESTED' },
        });

        await tx.outboxEvent.create({
          data: {
            topic: 'CONTENT_REVISION_REQUESTED',
            schemaVersion: 1,
            idempotencyKey: `revision-request:${revision.id}:requested`,
            aggregateType: 'ContentJob',
            aggregateId: job.id,
            payload: {
              contentJobId: job.id,
              revisionRequestId: revision.id,
              sourceContentVersionId: sourceVersion.id,
              type: revision.type,
            },
            occurredAt: revision.createdAt,
            availableAt: revision.createdAt,
          },
        });

        return toRevisionRecord(revision);
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        (err.code === 'P2002' || err.code === 'P2034')
      ) {
        throw new ActiveRevisionConflictError('A new version is already being generated.');
      }
      throw err;
    }
  }

  public async findActiveRevisionRequest(
    contentJobId: string,
  ): Promise<RevisionRequestRecord | null> {
    const record = await this.prisma.revisionRequest.findFirst({
      where: { contentJobId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    return record === null ? null : toRevisionRecord(record);
  }

  public async findRevisionRequestsByJobId(
    contentJobId: string,
  ): Promise<readonly RevisionRequestRecord[]> {
    const records = await this.prisma.revisionRequest.findMany({
      where: { contentJobId },
      orderBy: { createdAt: 'asc' },
    });
    return records.map(toRevisionRecord);
  }

  public async createApproval(input: CreateApprovalInput): Promise<ApprovalEventRecord> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockJob(tx, input.contentJobId);
        const job = await tx.contentJob.findUnique({ where: { id: input.contentJobId } });
        if (job === null) {
          throw new ValidationError({ publicMessage: 'Content job was not found.' });
        }

        if (job.status === 'APPROVED') {
          throw new ContentAlreadyApprovedError('Content has already been approved.');
        }

        if (job.status === 'REJECTED') {
          throw new ContentAlreadyRejectedError('Content has already been rejected.');
        }

        if (job.status !== 'UNDER_REVIEW') {
          throw new InvalidReviewStateError(
            `Content job is not in reviewable state (currently ${job.status}).`,
          );
        }

        const targetVersion = await tx.contentVersion.findUnique({
          where: { id: input.contentVersionId },
        });
        if (targetVersion === null || targetVersion.contentJobId !== job.id) {
          throw new ValidationError({
            publicMessage: 'Target content version does not belong to this content job.',
          });
        }

        if (input.decision === 'APPROVED') {
          if (job.requesterUserId === input.approverUserId) {
            throw new SelfApprovalProhibitedError(
              'Four-eyes policy violation: Content job requester cannot approve their own content.',
            );
          }

          if (targetVersion.revisionRequestId !== null) {
            const revision = await tx.revisionRequest.findUnique({
              where: { id: targetVersion.revisionRequestId },
            });
            if (revision !== null && revision.requestedByUserId === input.approverUserId) {
              throw new SelfApprovalProhibitedError(
                'Four-eyes policy violation: Version author cannot approve their own content revision.',
              );
            }
          }

          const maxVersion = await tx.contentVersion.aggregate({
            where: { contentJobId: job.id },
            _max: { versionNumber: true },
          });
          if (targetVersion.versionNumber !== maxVersion._max.versionNumber) {
            throw new StaleContentVersionError();
          }

          const validation = await tx.validationResult.findFirst({
            where: { contentVersionId: targetVersion.id },
            orderBy: { createdAt: 'desc' },
          });
          if (validation === null) {
            throw new ContentNotApprovalEligibleError('Content version has not been validated.');
          }
          if (
            validation.blockingCount > 0 ||
            (validation.status !== 'PASSED' && validation.status !== 'PASSED_WITH_WARNINGS')
          ) {
            throw new ContentNotApprovalEligibleError(
              'Content version is blocked by factual validation and cannot be approved.',
            );
          }

          const approval = await tx.approvalEvent.create({
            data: {
              contentJobId: job.id,
              contentVersionId: targetVersion.id,
              approverUserId: input.approverUserId,
              decision: 'APPROVED',
              comment: input.comment ?? null,
              validationResultId: validation.id,
            },
            include: { approverUser: true },
          });

          assertContentJobTransition(job.status, 'APPROVED');
          await tx.contentJob.update({
            where: { id: job.id },
            data: { status: 'APPROVED' },
          });

          await tx.outboxEvent.create({
            data: {
              topic: 'CONTENT_APPROVED',
              schemaVersion: 1,
              idempotencyKey: `approval-event:${approval.id}:approved`,
              aggregateType: 'ContentJob',
              aggregateId: job.id,
              payload: {
                contentJobId: job.id,
                contentVersionId: targetVersion.id,
                approvalEventId: approval.id,
                approverUserId: input.approverUserId,
              },
              occurredAt: approval.createdAt,
              availableAt: approval.createdAt,
            },
          });

          return toApprovalRecord(approval);
        } else {
          // REJECTED
          const validation = await tx.validationResult.findFirst({
            where: { contentVersionId: targetVersion.id },
            orderBy: { createdAt: 'desc' },
          });

          const approval = await tx.approvalEvent.create({
            data: {
              contentJobId: job.id,
              contentVersionId: targetVersion.id,
              approverUserId: input.approverUserId,
              decision: 'REJECTED',
              comment: input.comment ?? null,
              validationResultId: validation?.id ?? null,
            },
            include: { approverUser: true },
          });

          assertContentJobTransition(job.status, 'REJECTED');
          await tx.contentJob.update({
            where: { id: job.id },
            data: { status: 'REJECTED' },
          });

          await tx.outboxEvent.create({
            data: {
              topic: 'CONTENT_REJECTED',
              schemaVersion: 1,
              idempotencyKey: `approval-event:${approval.id}:rejected`,
              aggregateType: 'ContentJob',
              aggregateId: job.id,
              payload: {
                contentJobId: job.id,
                contentVersionId: targetVersion.id,
                approvalEventId: approval.id,
                approverUserId: input.approverUserId,
                comment: input.comment ?? null,
              },
              occurredAt: approval.createdAt,
              availableAt: approval.createdAt,
            },
          });

          return toApprovalRecord(approval);
        }
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        (err.code === 'P2002' || err.code === 'P2034')
      ) {
        if (input.decision === 'APPROVED') {
          throw new ContentAlreadyApprovedError('Content has already been approved.');
        } else {
          throw new ContentAlreadyRejectedError('Content has already been rejected.');
        }
      }
      throw err;
    }
  }

  public async findApprovalEventByJobId(contentJobId: string): Promise<ApprovalEventRecord | null> {
    const record = await this.prisma.approvalEvent.findFirst({
      where: { contentJobId },
      orderBy: { createdAt: 'desc' },
      include: { approverUser: true },
    });
    return record === null ? null : toApprovalRecord(record);
  }

  public async getReviewState(contentJobId: string): Promise<ContentReviewState | null> {
    const job = await this.prisma.contentJob.findUnique({
      where: { id: contentJobId },
      include: {
        productSnapshot: true,
        versions: {
          orderBy: { versionNumber: 'asc' },
          include: {
            validationResults: { orderBy: { createdAt: 'desc' }, take: 1 },
            revisionRequest: true,
          },
        },
        revisionRequests: {
          where: { status: 'PENDING' },
          take: 1,
        },
        approvalEvents: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { approverUser: true },
        },
      },
    });

    if (job === null) return null;

    const currentVersion = job.versions.at(-1);
    const activeRevision = job.revisionRequests[0];
    const latestApproval = job.approvalEvents[0];

    return {
      jobId: job.id,
      jobStatus: job.status,
      productSnapshotId: job.productSnapshotId,
      sku: job.productSnapshot.sku,
      productName: job.productSnapshot.productName,
      requesterUserId: job.requesterUserId,
      currentVersionNumber: currentVersion?.versionNumber ?? 0,
      versions: job.versions.map((ver) => {
        const val = ver.validationResults[0];
        const output = ver.structuredOutput as { headline?: string } | null;
        return {
          id: ver.id,
          versionNumber: ver.versionNumber,
          authorUserId: ver.revisionRequest?.requestedByUserId ?? job.requesterUserId,
          createdAt: ver.createdAt,
          ...(val === undefined
            ? {}
            : { validationStatus: val.status, blockingCount: val.blockingCount }),
          approvalEligible:
            val !== undefined &&
            val.blockingCount === 0 &&
            (val.status === 'PASSED' || val.status === 'PASSED_WITH_WARNINGS'),
          headline: output?.headline ?? '',
        };
      }),
      ...(activeRevision ? { activeRevision: toRevisionRecord(activeRevision) } : {}),
      ...(latestApproval ? { approvalEvent: toApprovalRecord(latestApproval) } : {}),
    };
  }

  public async getApprovalStatus(contentJobId: string): Promise<ApprovalStatusView | null> {
    const job = await this.prisma.contentJob.findUnique({
      where: { id: contentJobId },
      include: {
        versions: { orderBy: { versionNumber: 'desc' }, take: 1 },
        approvalEvents: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            approverUser: true,
            contentVersion: true,
          },
        },
      },
    });

    if (job === null) return null;

    const latestVersion = job.versions[0];
    const approval = job.approvalEvents[0];

    return {
      jobId: job.id,
      jobStatus: job.status,
      latestVersionNumber: latestVersion?.versionNumber ?? 0,
      ...(approval === undefined
        ? {}
        : {
            approvedVersionNumber: approval.contentVersion.versionNumber,
            decision: approval.decision,
            approverUserId: approval.approverUserId,
            approverDisplayName: approval.approverUser.displayName,
            decidedAt: approval.createdAt,
            ...(approval.comment === null ? {} : { comment: approval.comment }),
          }),
    };
  }

  public async createPendingInteraction(
    input: CreatePendingInteractionInput,
  ): Promise<PendingReviewInteractionRecord> {
    // Cancel any existing active pending interactions for this identity
    await this.prisma.telegramPendingReviewInteraction.updateMany({
      where: {
        telegramIdentityId: input.telegramIdentityId,
        completedAt: null,
        cancelledAt: null,
      },
      data: { cancelledAt: new Date() },
    });

    const record = await this.prisma.telegramPendingReviewInteraction.create({
      data: {
        telegramIdentityId: input.telegramIdentityId,
        contentJobId: input.contentJobId,
        contentVersionId: input.contentVersionId,
        action: input.action,
        expiresAt: input.expiresAt,
      },
    });

    return toPendingRecord(record);
  }

  public async findActivePendingInteraction(
    telegramIdentityId: string,
    now: Date,
  ): Promise<PendingReviewInteractionRecord | null> {
    const record = await this.prisma.telegramPendingReviewInteraction.findFirst({
      where: {
        telegramIdentityId,
        completedAt: null,
        cancelledAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    return record === null ? null : toPendingRecord(record);
  }

  public async completePendingInteraction(id: string, now: Date): Promise<void> {
    await this.prisma.telegramPendingReviewInteraction.update({
      where: { id },
      data: { completedAt: now },
    });
  }

  public async cancelPendingInteraction(id: string, now: Date): Promise<void> {
    await this.prisma.telegramPendingReviewInteraction.update({
      where: { id },
      data: { cancelledAt: now },
    });
  }
}

async function lockJob(tx: Prisma.TransactionClient, id: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))`;
}

function toRevisionRecord(record: PrismaRevisionRequest): RevisionRequestRecord {
  return {
    id: record.id,
    contentJobId: record.contentJobId,
    sourceContentVersionId: record.sourceContentVersionId,
    requestedByUserId: record.requestedByUserId,
    type: record.type,
    status: record.status,
    createdAt: record.createdAt,
    ...(record.instruction === null ? {} : { instruction: record.instruction }),
    ...(record.resultingContentVersionId === null
      ? {}
      : { resultingContentVersionId: record.resultingContentVersionId }),
  };
}

function toApprovalRecord(
  record: PrismaApprovalEvent & { approverUser?: { displayName: string } },
): ApprovalEventRecord {
  return {
    id: record.id,
    contentJobId: record.contentJobId,
    contentVersionId: record.contentVersionId,
    approverUserId: record.approverUserId,
    decision: record.decision,
    createdAt: record.createdAt,
    ...(record.approverUser ? { approverDisplayName: record.approverUser.displayName } : {}),
    ...(record.comment === null ? {} : { comment: record.comment }),
    ...(record.validationResultId === null
      ? {}
      : { validationResultId: record.validationResultId }),
  };
}

function toPendingRecord(record: PrismaPendingInteraction): PendingReviewInteractionRecord {
  return {
    id: record.id,
    telegramIdentityId: record.telegramIdentityId,
    contentJobId: record.contentJobId,
    contentVersionId: record.contentVersionId,
    action: record.action,
    expiresAt: record.expiresAt,
    createdAt: record.createdAt,
    ...(record.completedAt === null ? {} : { completedAt: record.completedAt }),
    ...(record.cancelledAt === null ? {} : { cancelledAt: record.cancelledAt }),
  };
}
