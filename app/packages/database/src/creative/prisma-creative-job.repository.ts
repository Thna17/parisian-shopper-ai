import { Injectable } from '@nestjs/common';
import {
  type CreateCreativeJobInput,
  type CreativeJobRecord,
  type CreativeJobRepository,
  type CreativeJobStatus,
  assertCreativeJobTransition,
  CreativeInvalidTransitionError,
  CreativeJobNotFoundError,
} from '@parisian-shopper/application';
import { type CreativeJob as PrismaCreativeJob } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';

@Injectable()
export class PrismaCreativeJobRepository implements CreativeJobRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async createJob(input: CreateCreativeJobInput): Promise<CreativeJobRecord> {
    const job = await this.prisma.creativeJob.create({
      data: {
        contentVersionId: input.contentVersionId,
        productSnapshotId: input.productSnapshotId,
        brandRuleVersionId: input.brandRuleVersionId,
        requestedByUserId: input.requestedByUserId ?? null,
        targetPlatform: input.targetPlatform ?? 'GENERIC',
        aspectRatio: input.aspectRatio ?? '1:1',
        creativeProfile: input.creativeProfile ?? 'PARISIAN_LUXURY_ATELIER',
        status: 'REQUESTED',
      },
    });
    return toRecord(job);
  }

  public async findById(id: string): Promise<CreativeJobRecord | null> {
    const job = await this.prisma.creativeJob.findUnique({ where: { id } });
    return job === null ? null : toRecord(job);
  }

  public async findByContentVersionId(
    contentVersionId: string,
  ): Promise<readonly CreativeJobRecord[]> {
    const jobs = await this.prisma.creativeJob.findMany({
      where: { contentVersionId },
      orderBy: { createdAt: 'desc' },
    });
    return jobs.map(toRecord);
  }

  public async transitionStatus(
    id: string,
    expectedCurrent: CreativeJobStatus,
    target: CreativeJobStatus,
  ): Promise<CreativeJobRecord> {
    assertCreativeJobTransition(expectedCurrent, target);

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.creativeJob.findUnique({ where: { id } });
      if (current === null) {
        throw new CreativeJobNotFoundError(id);
      }
      if (current.status !== expectedCurrent) {
        throw new CreativeInvalidTransitionError(current.status, target);
      }
      const updated = await tx.creativeJob.update({
        where: { id },
        data: { status: target },
      });
      return toRecord(updated);
    });
  }
}

function toRecord(row: PrismaCreativeJob): CreativeJobRecord {
  return {
    id: row.id,
    contentVersionId: row.contentVersionId,
    productSnapshotId: row.productSnapshotId,
    brandRuleVersionId: row.brandRuleVersionId,
    ...(row.requestedByUserId === null ? {} : { requestedByUserId: row.requestedByUserId }),
    status: row.status,
    targetPlatform: row.targetPlatform,
    aspectRatio: row.aspectRatio,
    creativeProfile: row.creativeProfile,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
