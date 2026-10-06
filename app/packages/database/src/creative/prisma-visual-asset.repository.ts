import { Injectable } from '@nestjs/common';
import {
  type CreateVisualAssetInput,
  type VisualAssetRecord,
  type VisualAssetRepository,
  CreativeAssetConflictError,
  CreativeJobNotFoundError,
} from '@parisian-shopper/application';
import { Prisma, type VisualAsset as PrismaVisualAsset } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';

@Injectable()
export class PrismaVisualAssetRepository implements VisualAssetRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async createAsset(input: CreateVisualAssetInput): Promise<VisualAssetRecord> {
    return this.prisma.$transaction(async (tx) => {
      // Row lock on CreativeJob to serialize version allocation under concurrency
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM creative_jobs WHERE id = ${input.creativeJobId}::uuid FOR UPDATE
      `;
      if (locked.length === 0) {
        throw new CreativeJobNotFoundError(input.creativeJobId);
      }

      const latest = await tx.visualAsset.findFirst({
        where: { creativeJobId: input.creativeJobId },
        orderBy: { versionNumber: 'desc' },
        select: { versionNumber: true },
      });
      const nextVersion = (latest?.versionNumber ?? 0) + 1;

      try {
        const created = await tx.visualAsset.create({
          data: {
            creativeJobId: input.creativeJobId,
            versionNumber: nextVersion,
            assetRole: input.assetRole,
            mimeType: input.mimeType,
            width: input.width,
            height: input.height,
            byteSize: input.byteSize,
            sha256: input.sha256,
            storageKey: input.storageKey,
            provider: input.provider ?? null,
            model: input.model ?? null,
            seed: input.seed ?? null,
            promptVersion: input.promptVersion ?? null,
            creativeBriefVersion: input.creativeBriefVersion ?? null,
            sourceProductAssetDigest: input.sourceProductAssetDigest,
            backgroundAssetDigest: input.backgroundAssetDigest ?? null,
          },
        });
        return toRecord(created);
      } catch (err: unknown) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new CreativeAssetConflictError(input.creativeJobId, nextVersion);
        }
        throw err;
      }
    });
  }

  public async findById(id: string): Promise<VisualAssetRecord | null> {
    const asset = await this.prisma.visualAsset.findUnique({ where: { id } });
    return asset === null ? null : toRecord(asset);
  }

  public async findByJobAndVersion(
    creativeJobId: string,
    versionNumber: number,
  ): Promise<VisualAssetRecord | null> {
    const asset = await this.prisma.visualAsset.findUnique({
      where: {
        creativeJobId_versionNumber: {
          creativeJobId,
          versionNumber,
        },
      },
    });
    return asset === null ? null : toRecord(asset);
  }

  public async listByJobId(creativeJobId: string): Promise<readonly VisualAssetRecord[]> {
    const assets = await this.prisma.visualAsset.findMany({
      where: { creativeJobId },
      orderBy: { versionNumber: 'asc' },
    });
    return assets.map(toRecord);
  }

  public async findLatestByJobId(creativeJobId: string): Promise<VisualAssetRecord | null> {
    const asset = await this.prisma.visualAsset.findFirst({
      where: { creativeJobId },
      orderBy: { versionNumber: 'desc' },
    });
    return asset === null ? null : toRecord(asset);
  }
}

function toRecord(row: PrismaVisualAsset): VisualAssetRecord {
  return {
    id: row.id,
    creativeJobId: row.creativeJobId,
    versionNumber: row.versionNumber,
    assetRole: row.assetRole,
    mimeType: row.mimeType,
    width: row.width,
    height: row.height,
    byteSize: row.byteSize,
    sha256: row.sha256,
    storageKey: row.storageKey,
    ...(row.provider === null ? {} : { provider: row.provider }),
    ...(row.model === null ? {} : { model: row.model }),
    ...(row.seed === null ? {} : { seed: row.seed }),
    ...(row.promptVersion === null ? {} : { promptVersion: row.promptVersion }),
    ...(row.creativeBriefVersion === null
      ? {}
      : { creativeBriefVersion: row.creativeBriefVersion }),
    sourceProductAssetDigest: row.sourceProductAssetDigest,
    ...(row.backgroundAssetDigest === null
      ? {}
      : { backgroundAssetDigest: row.backgroundAssetDigest }),
    createdAt: row.createdAt,
  };
}
