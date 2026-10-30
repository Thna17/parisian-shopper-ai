import { Injectable } from '@nestjs/common';
import {
  type CreativeApprovalEventRecord,
  type CreativeApprovalRepository,
  type RecordCreativeApprovalInput,
  CreativeApprovalMismatchedAssetError,
} from '@parisian-shopper/application';
import { type CreativeApprovalEvent as PrismaCreativeApprovalEvent } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';

@Injectable()
export class PrismaCreativeApprovalRepository implements CreativeApprovalRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async recordApproval(
    input: RecordCreativeApprovalInput,
  ): Promise<CreativeApprovalEventRecord> {
    if (input.visualValidationResultId !== undefined && input.visualValidationResultId !== null) {
      const validationResult = await this.prisma.visualValidationResult.findUnique({
        where: { id: input.visualValidationResultId },
        select: { visualAssetId: true },
      });
      if (validationResult === null || validationResult.visualAssetId !== input.visualAssetId) {
        throw new CreativeApprovalMismatchedAssetError(
          input.visualAssetId,
          input.visualValidationResultId,
        );
      }
    }

    const created = await this.prisma.creativeApprovalEvent.create({
      data: {
        creativeJobId: input.creativeJobId,
        visualAssetId: input.visualAssetId,
        sceneVersionId: input.sceneVersionId ?? null,
        approverUserId: input.approverUserId,
        decision: input.decision,
        comment: input.comment ?? null,
        visualValidationResultId: input.visualValidationResultId ?? null,
      },
      include: {
        approverUser: true,
      },
    });

    return toRecord(created);
  }

  public async findByJobId(creativeJobId: string): Promise<readonly CreativeApprovalEventRecord[]> {
    const rows = await this.prisma.creativeApprovalEvent.findMany({
      where: { creativeJobId },
      orderBy: { createdAt: 'desc' },
      include: { approverUser: true },
    });
    return rows.map(toRecord);
  }

  public async findByAssetId(
    visualAssetId: string,
  ): Promise<readonly CreativeApprovalEventRecord[]> {
    const rows = await this.prisma.creativeApprovalEvent.findMany({
      where: { visualAssetId },
      orderBy: { createdAt: 'desc' },
      include: { approverUser: true },
    });
    return rows.map(toRecord);
  }

  public async findBySceneVersionId(
    sceneVersionId: string,
  ): Promise<readonly CreativeApprovalEventRecord[]> {
    const rows = await this.prisma.creativeApprovalEvent.findMany({
      where: { sceneVersionId },
      orderBy: { createdAt: 'desc' },
      include: { approverUser: true },
    });
    return rows.map(toRecord);
  }

  public async findLatestApprovalByJobId(
    creativeJobId: string,
  ): Promise<CreativeApprovalEventRecord | null> {
    const row = await this.prisma.creativeApprovalEvent.findFirst({
      where: { creativeJobId },
      orderBy: { createdAt: 'desc' },
      include: { approverUser: true },
    });
    return row ? toRecord(row) : null;
  }
}

function toRecord(
  row: PrismaCreativeApprovalEvent & { approverUser?: { displayName: string } | null },
): CreativeApprovalEventRecord {
  return {
    id: row.id,
    creativeJobId: row.creativeJobId,
    visualAssetId: row.visualAssetId,
    ...(row.sceneVersionId ? { sceneVersionId: row.sceneVersionId } : {}),
    approverUserId: row.approverUserId,
    decision: row.decision,
    ...(row.comment === null ? {} : { comment: row.comment }),
    ...(row.visualValidationResultId === null
      ? {}
      : { visualValidationResultId: row.visualValidationResultId }),
    createdAt: row.createdAt,
    ...(row.approverUser?.displayName ? { approverDisplayName: row.approverUser.displayName } : {}),
  };
}
