import { Injectable } from '@nestjs/common';
import {
  type CreateCreativeRevisionInput,
  type CreativeRevisionRepository,
  type CreativeRevisionRequestRecord,
  validateCreativeRevisionInstruction,
  CreativeActiveRevisionExistsError,
  CreativeRevisionValidationError,
} from '@parisian-shopper/application';
import { type CreativeRevisionRequest as PrismaCreativeRevisionRequest } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';

@Injectable()
export class PrismaCreativeRevisionRepository implements CreativeRevisionRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async createRequest(
    input: CreateCreativeRevisionInput,
  ): Promise<CreativeRevisionRequestRecord> {
    const validation = validateCreativeRevisionInstruction(input.type, input.instruction);
    if (!validation.valid) {
      throw new CreativeRevisionValidationError(validation.error ?? 'Invalid revision instruction');
    }

    return this.prisma.$transaction(async (tx) => {
      const active = await tx.creativeRevisionRequest.findFirst({
        where: {
          creativeJobId: input.creativeJobId,
          status: 'PENDING',
        },
      });
      if (active !== null) {
        throw new CreativeActiveRevisionExistsError(input.creativeJobId);
      }

      const created = await tx.creativeRevisionRequest.create({
        data: {
          creativeJobId: input.creativeJobId,
          sourceVisualAssetId: input.sourceVisualAssetId,
          requestedByUserId: input.requestedByUserId,
          instruction: validation.normalizedInstruction ?? null,
          type: input.type,
          status: 'PENDING',
        },
      });

      return toRecord(created);
    });
  }

  public async findById(id: string): Promise<CreativeRevisionRequestRecord | null> {
    const record = await this.prisma.creativeRevisionRequest.findUnique({
      where: { id },
    });
    return record === null ? null : toRecord(record);
  }

  public async findActiveByJobId(
    creativeJobId: string,
  ): Promise<CreativeRevisionRequestRecord | null> {
    const record = await this.prisma.creativeRevisionRequest.findFirst({
      where: {
        creativeJobId,
        status: 'PENDING',
      },
    });
    return record === null ? null : toRecord(record);
  }

  public async completeRequest(
    id: string,
    resultingVisualAssetId: string,
  ): Promise<CreativeRevisionRequestRecord> {
    const updated = await this.prisma.creativeRevisionRequest.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        resultingVisualAssetId,
      },
    });
    return toRecord(updated);
  }

  public async cancelRequest(id: string): Promise<CreativeRevisionRequestRecord> {
    const updated = await this.prisma.creativeRevisionRequest.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
    return toRecord(updated);
  }

  public async findByResultingAssetId(
    resultingVisualAssetId: string,
  ): Promise<CreativeRevisionRequestRecord | null> {
    const record = await this.prisma.creativeRevisionRequest.findFirst({
      where: { resultingVisualAssetId },
    });
    return record === null ? null : toRecord(record);
  }
}

function toRecord(row: PrismaCreativeRevisionRequest): CreativeRevisionRequestRecord {
  return {
    id: row.id,
    creativeJobId: row.creativeJobId,
    sourceVisualAssetId: row.sourceVisualAssetId,
    requestedByUserId: row.requestedByUserId,
    ...(row.instruction === null ? {} : { instruction: row.instruction }),
    type: row.type,
    status: row.status,
    ...(row.resultingVisualAssetId === null
      ? {}
      : { resultingVisualAssetId: row.resultingVisualAssetId }),
    createdAt: row.createdAt,
  };
}
