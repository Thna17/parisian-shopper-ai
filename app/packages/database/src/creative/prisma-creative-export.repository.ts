import { Injectable } from '@nestjs/common';
import {
  type CreateCreativeExportInput,
  type CreativeExportRecord,
  type CreativeExportRepository,
  type ExportEncoding,
  type ExportFormat,
  CreativeExportConflictError,
  CreativeJobNotFoundError,
  VisualAssetNotFoundError,
} from '@parisian-shopper/application';
import { Prisma, type CreativeExport as PrismaCreativeExport } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';

@Injectable()
export class PrismaCreativeExportRepository implements CreativeExportRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async createExport(input: CreateCreativeExportInput): Promise<CreativeExportRecord> {
    try {
      const created = await this.prisma.creativeExport.create({
        data: {
          creativeJobId: input.creativeJobId,
          visualAssetId: input.visualAssetId,
          format: input.format,
          encoding: input.encoding,
          width: input.width,
          height: input.height,
          aspectRatio: input.aspectRatio,
          byteSize: input.byteSize,
          sha256: input.sha256,
          storageKey: input.storageKey,
          quality: input.quality ?? null,
          validationStatus: input.validationStatus ?? 'PASSED',
          exportedByUserId: input.exportedByUserId,
        },
      });
      return toRecord(created);
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') {
          throw new CreativeExportConflictError(input.visualAssetId, input.format, input.encoding);
        }
        if (err.code === 'P2003') {
          const fieldName = (err.meta?.field_name as string) ?? '';
          if (fieldName.includes('visual_asset_id')) {
            throw new VisualAssetNotFoundError(input.visualAssetId);
          }
          if (fieldName.includes('creative_job_id')) {
            throw new CreativeJobNotFoundError(input.creativeJobId);
          }
        }
      }
      throw err;
    }
  }

  public async findById(id: string): Promise<CreativeExportRecord | null> {
    const row = await this.prisma.creativeExport.findUnique({
      where: { id },
    });
    return row ? toRecord(row) : null;
  }

  public async findByAssetAndFormat(
    visualAssetId: string,
    format: ExportFormat,
    encoding: ExportEncoding,
  ): Promise<CreativeExportRecord | null> {
    const row = await this.prisma.creativeExport.findUnique({
      where: {
        visualAssetId_format_encoding: {
          visualAssetId,
          format,
          encoding,
        },
      },
    });
    return row ? toRecord(row) : null;
  }

  public async listByJobId(creativeJobId: string): Promise<readonly CreativeExportRecord[]> {
    const rows = await this.prisma.creativeExport.findMany({
      where: { creativeJobId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRecord);
  }

  public async listByVisualAssetId(
    visualAssetId: string,
  ): Promise<readonly CreativeExportRecord[]> {
    const rows = await this.prisma.creativeExport.findMany({
      where: { visualAssetId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRecord);
  }
}

function toRecord(row: PrismaCreativeExport): CreativeExportRecord {
  return {
    id: row.id,
    creativeJobId: row.creativeJobId,
    visualAssetId: row.visualAssetId,
    format: row.format,
    encoding: row.encoding,
    width: row.width,
    height: row.height,
    aspectRatio: row.aspectRatio,
    byteSize: row.byteSize,
    sha256: row.sha256,
    storageKey: row.storageKey,
    ...(row.quality === null ? {} : { quality: row.quality }),
    validationStatus: row.validationStatus,
    exportedByUserId: row.exportedByUserId,
    createdAt: row.createdAt,
  };
}
