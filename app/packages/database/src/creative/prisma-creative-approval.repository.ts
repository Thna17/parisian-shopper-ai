import { Injectable } from '@nestjs/common';
import {
  type CreativeApprovalEventRecord,
  type CreativeApprovalRepository,
  type RecordCreativeApprovalInput,
} from '@parisian-shopper/application';
import { type CreativeApprovalEvent as PrismaCreativeApprovalEvent } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';

@Injectable()
export class PrismaCreativeApprovalRepository implements CreativeApprovalRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async recordApproval(
    input: RecordCreativeApprovalInput,
  ): Promise<CreativeApprovalEventRecord> {
    const created = await this.prisma.creativeApprovalEvent.create({
      data: {
        creativeJobId: input.creativeJobId,
        visualAssetId: input.visualAssetId,
        approverUserId: input.approverUserId,
        decision: input.decision,
        comment: input.comment ?? null,
        visualValidationResultId: input.visualValidationResultId ?? null,
      },
    });

    return toRecord(created);
  }

  public async findByJobId(creativeJobId: string): Promise<readonly CreativeApprovalEventRecord[]> {
    const rows = await this.prisma.creativeApprovalEvent.findMany({
      where: { creativeJobId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRecord);
  }

  public async findByAssetId(
    visualAssetId: string,
  ): Promise<readonly CreativeApprovalEventRecord[]> {
    const rows = await this.prisma.creativeApprovalEvent.findMany({
      where: { visualAssetId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRecord);
  }
}

function toRecord(row: PrismaCreativeApprovalEvent): CreativeApprovalEventRecord {
  return {
    id: row.id,
    creativeJobId: row.creativeJobId,
    visualAssetId: row.visualAssetId,
    approverUserId: row.approverUserId,
    decision: row.decision,
    ...(row.comment === null ? {} : { comment: row.comment }),
    ...(row.visualValidationResultId === null
      ? {}
      : { visualValidationResultId: row.visualValidationResultId }),
    createdAt: row.createdAt,
  };
}
