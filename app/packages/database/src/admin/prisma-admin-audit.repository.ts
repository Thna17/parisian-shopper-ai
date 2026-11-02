import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  type AdminAuditRepository,
  type AuditEventRecord,
  type AuditListQuery,
  type PaginatedResult,
  type RecordAuditEventInput,
} from '@parisian-shopper/application';
import { PrismaService } from '../prisma.service.js';

@Injectable()
export class PrismaAdminAuditRepository implements AdminAuditRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async record(input: RecordAuditEventInput): Promise<AuditEventRecord> {
    const record = await this.prisma.auditEvent.create({
      data: {
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId ?? null,
        ...(input.metadata ? { metadata: input.metadata as Prisma.InputJsonValue } : {}),
      },
      include: {
        actorUser: {
          select: { displayName: true },
        },
      },
    });

    return {
      id: record.id,
      actorUserId: record.actorUserId,
      actorDisplayName: record.actorUser?.displayName ?? null,
      action: record.action,
      resourceType: record.resourceType,
      resourceId: record.resourceId,
      metadata: (record.metadata as Record<string, unknown>) ?? null,
      createdAt: record.createdAt,
    };
  }

  public async findPaginated(query: AuditListQuery): Promise<PaginatedResult<AuditEventRecord>> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.max(1, Math.min(100, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.AuditEventWhereInput = {};

    if (query.actorUserId) {
      where.actorUserId = query.actorUserId;
    }

    if (query.action) {
      where.action = {
        contains: query.action,
        mode: 'insensitive',
      };
    }

    if (query.resourceType) {
      where.resourceType = query.resourceType;
    }

    if (query.fromDate || query.toDate) {
      where.createdAt = {
        ...(query.fromDate ? { gte: query.fromDate } : {}),
        ...(query.toDate ? { lte: query.toDate } : {}),
      };
    }

    const [total, records] = await Promise.all([
      this.prisma.auditEvent.count({ where }),
      this.prisma.auditEvent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          actorUser: {
            select: { displayName: true },
          },
        },
      }),
    ]);

    const items: AuditEventRecord[] = records.map((r) => ({
      id: r.id,
      actorUserId: r.actorUserId,
      actorDisplayName: r.actorUser?.displayName ?? null,
      action: r.action,
      resourceType: r.resourceType,
      resourceId: r.resourceId,
      metadata: (r.metadata as Record<string, unknown>) ?? null,
      createdAt: r.createdAt,
    }));

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }
}
