import { Injectable } from '@nestjs/common';
import type {
  BrandSourceArchiveRecord,
  BrandSourceRepository,
  CreateBrandSourceInput,
} from '@parisian-shopper/application';
import { type BrandSourceArchive as PrismaBrandSourceArchive } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';

@Injectable()
export class PrismaBrandSourceRepository implements BrandSourceRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async storeRawPost(input: CreateBrandSourceInput): Promise<BrandSourceArchiveRecord> {
    const created = await this.prisma.brandSourceArchive.create({
      data: {
        sourceSystem: input.sourceSystem,
        externalPostId: input.externalPostId,
        captionText: input.captionText,
        sanitizedCaptionText: input.sanitizedCaptionText,
        copyrightDeclared: input.copyrightDeclared,
        copyrightOwner: input.copyrightOwner,
        licenseReference: input.licenseReference,
        mediaCasKeys: [...input.mediaCasKeys],
        tags: [...input.tags],
        sha256Hex: input.sha256Hex,
        ingestedByUserId: input.ingestedByUserId,
      },
    });

    return this.mapRecord(created);
  }

  public async findById(id: string): Promise<BrandSourceArchiveRecord | null> {
    const record = await this.prisma.brandSourceArchive.findUnique({
      where: { id },
    });
    return record ? this.mapRecord(record) : null;
  }

  public async findBySha256(sha256Hex: string): Promise<BrandSourceArchiveRecord | null> {
    const record = await this.prisma.brandSourceArchive.findFirst({
      where: { sha256Hex },
    });
    return record ? this.mapRecord(record) : null;
  }

  public async listSources(limit = 100, offset = 0): Promise<readonly BrandSourceArchiveRecord[]> {
    const records = await this.prisma.brandSourceArchive.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
    return records.map((r) => this.mapRecord(r));
  }

  private mapRecord(r: PrismaBrandSourceArchive): BrandSourceArchiveRecord {
    return {
      id: r.id,
      sourceSystem: r.sourceSystem,
      externalPostId: r.externalPostId,
      captionText: r.captionText,
      sanitizedCaptionText: r.sanitizedCaptionText,
      copyrightDeclared: r.copyrightDeclared,
      copyrightOwner: r.copyrightOwner,
      licenseReference: r.licenseReference,
      mediaCasKeys: r.mediaCasKeys,
      tags: r.tags,
      sha256Hex: r.sha256Hex,
      ingestedByUserId: r.ingestedByUserId,
      createdAt: r.createdAt,
    };
  }
}
