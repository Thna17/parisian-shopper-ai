import { Injectable } from '@nestjs/common';
import type {
  BrandDatasetVersion as PrismaBrandDatasetVersion,
  BrandFeedbackRecord as PrismaBrandFeedbackRecord,
} from '@prisma/client';
import type { BrandDatasetRepository } from '@parisian-shopper/application';
import type {
  BrandDatasetStatus,
  BrandDatasetVersionRecord,
  CreateBrandDatasetInput,
  ReviewFeedbackRecord,
} from '@parisian-shopper/application';
import { PrismaService } from '../prisma.service.js';

@Injectable()
export class PrismaBrandDatasetRepository implements BrandDatasetRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async createDatasetVersion(
    input: CreateBrandDatasetInput,
  ): Promise<BrandDatasetVersionRecord> {
    const record = await this.prisma.brandDatasetVersion.create({
      data: {
        name: input.name,
        versionString: input.versionString,
        status: input.status ?? 'CURATING',
        gitCommitHash: input.gitCommitHash ?? null,
        approvedByUserId: input.approvedByUserId ?? null,
        assetCount: input.initialFeedbackIds?.length ?? 0,
      },
    });

    if (input.initialFeedbackIds && input.initialFeedbackIds.length > 0) {
      await this.prisma.brandFeedbackRecord.updateMany({
        where: { id: { in: [...input.initialFeedbackIds] } },
        data: { datasetVersionId: record.id },
      });
    }

    return this.mapDataset(record);
  }

  public async findById(id: string): Promise<BrandDatasetVersionRecord | null> {
    const record = await this.prisma.brandDatasetVersion.findUnique({
      where: { id },
    });
    return record ? this.mapDataset(record) : null;
  }

  public async findByVersionString(
    versionString: string,
  ): Promise<BrandDatasetVersionRecord | null> {
    const record = await this.prisma.brandDatasetVersion.findUnique({
      where: { versionString },
    });
    return record ? this.mapDataset(record) : null;
  }

  public async listDatasets(): Promise<readonly BrandDatasetVersionRecord[]> {
    const records = await this.prisma.brandDatasetVersion.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return records.map((r) => this.mapDataset(r));
  }

  public async updateStatus(
    id: string,
    status: BrandDatasetStatus,
  ): Promise<BrandDatasetVersionRecord> {
    const updated = await this.prisma.brandDatasetVersion.update({
      where: { id },
      data: { status },
    });
    return this.mapDataset(updated);
  }

  public async storeFeedbackRecords(
    records: readonly ReviewFeedbackRecord[],
  ): Promise<readonly ReviewFeedbackRecord[]> {
    const created: ReviewFeedbackRecord[] = [];
    for (const rec of records) {
      const res = await this.prisma.brandFeedbackRecord.create({
        data: {
          sourceType: rec.sourceType,
          contentJobId: rec.contentJobId ?? null,
          contentVersionId: rec.contentVersionId ?? null,
          originalText: rec.originalText,
          revisedText: rec.revisedText ?? null,
          decision: rec.decision,
          critiqueNotes: rec.critiqueNotes ?? null,
          toneFlags: rec.toneFlags ? [...rec.toneFlags] : [],
          reviewerUserId: rec.reviewerUserId ?? null,
          datasetVersionId: rec.datasetVersionId ?? null,
        },
      });
      created.push(this.mapFeedback(res));
    }
    return created;
  }

  public async listFeedback(datasetVersionId?: string): Promise<readonly ReviewFeedbackRecord[]> {
    const where = datasetVersionId ? { datasetVersionId } : {};
    const records = await this.prisma.brandFeedbackRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return records.map((r) => this.mapFeedback(r));
  }

  private mapDataset(r: PrismaBrandDatasetVersion): BrandDatasetVersionRecord {
    return {
      id: r.id,
      name: r.name,
      versionString: r.versionString,
      status: r.status,
      assetCount: r.assetCount,
      gitCommitHash: r.gitCommitHash,
      approvedByUserId: r.approvedByUserId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  private mapFeedback(r: PrismaBrandFeedbackRecord): ReviewFeedbackRecord {
    return {
      id: r.id,
      sourceType: r.sourceType as unknown as ReviewFeedbackRecord['sourceType'],
      contentJobId: r.contentJobId,
      contentVersionId: r.contentVersionId,
      originalText: r.originalText,
      revisedText: r.revisedText,
      decision: r.decision as unknown as ReviewFeedbackRecord['decision'],
      critiqueNotes: r.critiqueNotes,
      toneFlags: r.toneFlags,
      reviewerUserId: r.reviewerUserId,
      datasetVersionId: r.datasetVersionId,
      createdAt: r.createdAt,
    };
  }
}
