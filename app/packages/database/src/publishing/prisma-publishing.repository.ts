import { Injectable } from '@nestjs/common';
import type {
  PublicationAttemptRecord,
  PublicationDetail,
  PublicationRecord,
  PaginatedPublications,
  PublishingRepository,
} from '@parisian-shopper/application';
import { PrismaService } from '../prisma.service.js';

@Injectable()
export class PrismaPublishingRepository implements PublishingRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async create(input: {
    contentVersionId: string;
    creativeExportId: string | null;
    destinationChannel: string;
    destinationAccountId: string | null;
    requestedByUserId: string;
    idempotencyKey: string;
    campaignId: string | null;
    status: string;
  }): Promise<PublicationRecord> {
    const row = await this.prisma.publication.create({
      data: {
        contentVersionId: input.contentVersionId,
        creativeExportId: input.creativeExportId,
        destinationChannel: input.destinationChannel as never,
        destinationAccountId: input.destinationAccountId,
        requestedByUserId: input.requestedByUserId,
        idempotencyKey: input.idempotencyKey,
        campaignId: input.campaignId,
        status: input.status as never,
      },
    });
    return this.toPublicationRecord(row);
  }

  public async findById(id: string): Promise<PublicationDetail | null> {
    const row = await this.prisma.publication.findUnique({
      where: { id },
      include: {
        attempts: {
          orderBy: { attemptNumber: 'asc' },
        },
        contentVersion: {
          select: {
            id: true,
            versionNumber: true,
            contentJobId: true,
            structuredOutput: true,
          },
        },
        creativeExport: {
          select: {
            id: true,
            format: true,
            encoding: true,
            width: true,
            height: true,
            storageKey: true,
          },
        },
        requestedByUser: {
          select: {
            id: true,
            displayName: true,
          },
        },
        campaign: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });

    if (!row) return null;

    return {
      ...this.toPublicationRecord(row),
      attempts: row.attempts.map((a) => this.toAttemptRecord(a)),
      contentVersion: {
        id: row.contentVersion.id,
        versionNumber: row.contentVersion.versionNumber,
        contentJobId: row.contentVersion.contentJobId,
        structuredOutput: row.contentVersion.structuredOutput,
      },
      creativeExport: row.creativeExport
        ? {
            id: row.creativeExport.id,
            format: row.creativeExport.format,
            encoding: row.creativeExport.encoding,
            width: row.creativeExport.width,
            height: row.creativeExport.height,
            storageKey: row.creativeExport.storageKey,
          }
        : null,
      requestedByUser: {
        id: row.requestedByUser.id,
        displayName: row.requestedByUser.displayName,
      },
      campaign: row.campaign
        ? {
            id: row.campaign.id,
            code: row.campaign.code,
            name: row.campaign.name,
          }
        : null,
    };
  }

  public async findByIdempotencyKey(key: string): Promise<PublicationRecord | null> {
    const row = await this.prisma.publication.findUnique({
      where: { idempotencyKey: key },
    });
    return row ? this.toPublicationRecord(row) : null;
  }

  public async list(query: {
    page: number;
    limit: number;
    status?: string;
    channel?: string;
  }): Promise<PaginatedPublications> {
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.channel) where.destinationChannel = query.channel;

    const [items, total] = await Promise.all([
      this.prisma.publication.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.publication.count({ where }),
    ]);

    return {
      items: items.map((r) => this.toPublicationRecord(r)),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  public async updateStatus(
    id: string,
    status: string,
    extra?: {
      publishedAt?: Date;
      externalPublicationId?: string;
      cancellationReason?: string;
    },
  ): Promise<PublicationRecord> {
    const row = await this.prisma.publication.update({
      where: { id },
      data: {
        status: status as never,
        ...(extra?.publishedAt ? { publishedAt: extra.publishedAt } : {}),
        ...(extra?.externalPublicationId
          ? { externalPublicationId: extra.externalPublicationId }
          : {}),
        ...(extra?.cancellationReason ? { cancellationReason: extra.cancellationReason } : {}),
      },
    });
    return this.toPublicationRecord(row);
  }

  public async createAttempt(input: {
    publicationId: string;
    attemptNumber: number;
    status: string;
  }): Promise<PublicationAttemptRecord> {
    const row = await this.prisma.publicationAttempt.create({
      data: {
        publicationId: input.publicationId,
        attemptNumber: input.attemptNumber,
        status: input.status as never,
      },
    });
    return this.toAttemptRecord(row);
  }

  public async updateAttempt(
    id: string,
    update: {
      status: string;
      completedAt?: Date;
      providerResult?: unknown;
      externalPublicationId?: string;
      errorCode?: string;
      errorMessage?: string;
      retryEligible?: boolean;
    },
  ): Promise<PublicationAttemptRecord> {
    const row = await this.prisma.publicationAttempt.update({
      where: { id },
      data: {
        status: update.status as never,
        ...(update.completedAt ? { completedAt: update.completedAt } : {}),
        ...(update.providerResult !== undefined
          ? { providerResult: update.providerResult as never }
          : {}),
        ...(update.externalPublicationId
          ? { externalPublicationId: update.externalPublicationId }
          : {}),
        ...(update.errorCode ? { errorCode: update.errorCode } : {}),
        ...(update.errorMessage ? { errorMessage: update.errorMessage } : {}),
        ...(update.retryEligible !== undefined ? { retryEligible: update.retryEligible } : {}),
      },
    });
    return this.toAttemptRecord(row);
  }

  public async getAttemptCount(publicationId: string): Promise<number> {
    return this.prisma.publicationAttempt.count({
      where: { publicationId },
    });
  }

  public async findEligibleContentVersions(query: { page: number; limit: number }): Promise<{
    items: Array<{
      contentVersionId: string;
      versionNumber: number;
      contentJobId: string;
      productName: string;
      approvedAt: string;
      hasCreativeExports: boolean;
    }>;
    total: number;
  }> {
    // Find content versions that have been approved (have an APPROVED ApprovalEvent)
    const approvedVersions = await this.prisma.approvalEvent.findMany({
      where: { decision: 'APPROVED' },
      select: {
        contentVersionId: true,
        createdAt: true,
        contentVersion: {
          select: {
            id: true,
            versionNumber: true,
            contentJobId: true,
            productSnapshot: {
              select: {
                productName: true,
              },
            },
            creativeJobs: {
              select: {
                exports: {
                  select: { id: true },
                  take: 1,
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      distinct: ['contentVersionId'],
    });

    const total = approvedVersions.length;
    const start = (query.page - 1) * query.limit;
    const slice = approvedVersions.slice(start, start + query.limit);

    const items = slice.map((av) => {
      const productName = av.contentVersion.productSnapshot.productName;
      const hasCreativeExports = av.contentVersion.creativeJobs.some(
        (cj: { exports: { id: string }[] }) => cj.exports.length > 0,
      );
      return {
        contentVersionId: av.contentVersion.id,
        versionNumber: av.contentVersion.versionNumber,
        contentJobId: av.contentVersion.contentJobId,
        productName,
        approvedAt: av.createdAt.toISOString(),
        hasCreativeExports,
      };
    });

    return { items, total };
  }

  private toPublicationRecord(row: {
    id: string;
    contentVersionId: string;
    creativeExportId: string | null;
    destinationChannel: string;
    destinationAccountId: string | null;
    requestedByUserId: string;
    status: string;
    idempotencyKey: string;
    campaignId: string | null;
    scheduledAt: Date | null;
    publishedAt: Date | null;
    externalPublicationId: string | null;
    cancellationReason: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): PublicationRecord {
    return {
      id: row.id,
      contentVersionId: row.contentVersionId,
      creativeExportId: row.creativeExportId,
      destinationChannel: row.destinationChannel as PublicationRecord['destinationChannel'],
      destinationAccountId: row.destinationAccountId,
      requestedByUserId: row.requestedByUserId,
      status: row.status as PublicationRecord['status'],
      idempotencyKey: row.idempotencyKey,
      campaignId: row.campaignId,
      scheduledAt: row.scheduledAt,
      publishedAt: row.publishedAt,
      externalPublicationId: row.externalPublicationId,
      cancellationReason: row.cancellationReason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toAttemptRecord(row: {
    id: string;
    publicationId: string;
    attemptNumber: number;
    status: string;
    startedAt: Date;
    completedAt: Date | null;
    providerResult: unknown;
    externalPublicationId: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    retryEligible: boolean;
    createdAt: Date;
  }): PublicationAttemptRecord {
    return {
      id: row.id,
      publicationId: row.publicationId,
      attemptNumber: row.attemptNumber,
      status: row.status as PublicationAttemptRecord['status'],
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      providerResult: row.providerResult,
      externalPublicationId: row.externalPublicationId,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
      retryEligible: row.retryEligible,
      createdAt: row.createdAt,
    };
  }
}
