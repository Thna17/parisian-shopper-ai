import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  type CreateEmployeeInput,
  type EmployeeDetail,
  type EmployeeListQuery,
  type EmployeeRepository,
  type EmployeeSummary,
  type PaginatedResult,
  type RoleCode,
  type SafeUserSession,
  LastActiveAdminError,
} from '@parisian-shopper/application';
import { PrismaService } from '../prisma.service.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function maskTelegramUserId(raw: bigint | string): string {
  const s = String(raw);
  if (s.length <= 4) return s;
  return `${'•'.repeat(Math.min(8, Math.max(4, s.length - 4)))}${s.slice(-4)}`;
}

@Injectable()
export class PrismaEmployeeRepository implements EmployeeRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findPaginated(query: EmployeeListQuery): Promise<PaginatedResult<EmployeeSummary>> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.max(1, Math.min(100, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const now = new Date();
    const where: Prisma.UserWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.role) {
      where.roles = {
        some: {
          role: { code: query.role },
          revokedAt: null,
        },
      };
    }

    if (query.search && query.search.trim().length > 0) {
      const search = query.search.trim();
      const isUuid = UUID_REGEX.test(search);
      const normalizedUsername = search.replace(/^@/, '');

      where.OR = [
        ...(isUuid ? [{ id: search }] : []),
        { displayName: { contains: search, mode: 'insensitive' } },
        {
          telegramIdentities: {
            some: {
              telegramUsername: { contains: normalizedUsername, mode: 'insensitive' },
            },
          },
        },
      ];
    }

    const [total, records] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          roles: {
            where: { revokedAt: null },
            include: { role: true },
          },
          telegramIdentities: {
            where: { disabledAt: null },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          sessions: {
            where: {
              revokedAt: null,
              expiresAt: { gt: now },
            },
            select: { id: true },
          },
        },
      }),
    ]);

    const rolePriority: Record<string, number> = {
      ADMIN: 1,
      MARKETING_APPROVER: 2,
      MARKETING_EDITOR: 3,
      VIEWER: 4,
    };
    const items: EmployeeSummary[] = records.map((u) => {
      const activeRoles = u.roles
        .map((r) => r.role.code as RoleCode)
        .sort((a, b) => (rolePriority[a] ?? 99) - (rolePriority[b] ?? 99));
      const telegramUsername = u.telegramIdentities[0]?.telegramUsername ?? null;

      return {
        id: u.id,
        displayName: u.displayName,
        status: u.status,
        roles: activeRoles,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        disabledAt: u.disabledAt,
        telegramUsername,
        activeSessionsCount: u.sessions.length,
      };
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  public async findById(id: string): Promise<EmployeeDetail | null> {
    if (!UUID_REGEX.test(id)) return null;

    const now = new Date();
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        roles: {
          where: { revokedAt: null },
          include: { role: true },
        },
        telegramIdentities: {
          where: { disabledAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        passwordCredential: {
          select: { id: true },
        },
        sessions: {
          where: {
            revokedAt: null,
            expiresAt: { gt: now },
          },
          select: { id: true },
        },
      },
    });

    if (!user) return null;

    const latestSession = await this.prisma.userSession.findFirst({
      where: { userId: id },
      orderBy: { lastActiveAt: 'desc' },
      select: { lastActiveAt: true },
    });

    const rolePriority: Record<string, number> = {
      ADMIN: 1,
      MARKETING_APPROVER: 2,
      MARKETING_EDITOR: 3,
      VIEWER: 4,
    };
    const activeRoles = user.roles
      .map((r) => r.role.code as RoleCode)
      .sort((a, b) => (rolePriority[a] ?? 99) - (rolePriority[b] ?? 99));
    const telegramPrimary = user.telegramIdentities[0] ?? null;

    return {
      id: user.id,
      displayName: user.displayName,
      status: user.status,
      roles: activeRoles,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      disabledAt: user.disabledAt,
      hasPassword: Boolean(user.passwordCredential),
      telegram: telegramPrimary
        ? {
            id: telegramPrimary.id,
            telegramUserId: String(telegramPrimary.telegramUserId),
            maskedTelegramUserId: maskTelegramUserId(telegramPrimary.telegramUserId),
            telegramUsername: telegramPrimary.telegramUsername,
            displayName: telegramPrimary.displayName,
            lastSeenAt: telegramPrimary.lastSeenAt,
            disabledAt: telegramPrimary.disabledAt,
          }
        : null,
      activeSessionsCount: user.sessions.length,
      recentActivity: {
        lastActiveAt: latestSession?.lastActiveAt ?? null,
      },
    };
  }

  public async create(input: CreateEmployeeInput): Promise<EmployeeDetail> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          displayName: input.displayName.trim(),
          status: 'ACTIVE',
        },
      });

      if (input.roleCodes.length > 0) {
        const roles = await tx.role.findMany({
          where: {
            code: { in: Array.from(input.roleCodes) },
          },
        });

        for (const role of roles) {
          await tx.userRole.create({
            data: {
              userId: user.id,
              roleId: role.id,
              assignedAt: new Date(),
            },
          });
        }
      }

      const created = await this.findById(user.id);
      if (!created) {
        throw new Error(`Failed to retrieve newly created employee: ${user.id}`);
      }
      return created;
    });
  }

  public async updateDisplayName(id: string, displayName: string): Promise<EmployeeDetail> {
    await this.prisma.user.update({
      where: { id },
      data: { displayName: displayName.trim() },
    });

    const updated = await this.findById(id);
    if (!updated) {
      throw new Error(`Employee not found after display name update: ${id}`);
    }
    return updated;
  }

  public async updateRoles(
    id: string,
    roleCodes: readonly RoleCode[],
    actorId: string,
  ): Promise<EmployeeDetail> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Transactional check for last active administrator lockout protection
      const currentTarget = await tx.user.findUnique({
        where: { id },
        include: {
          roles: {
            where: { revokedAt: null },
            include: { role: true },
          },
        },
      });

      const currentHasAdmin = currentTarget?.roles.some((r) => r.role.code === 'ADMIN') ?? false;
      const newHasAdmin = roleCodes.includes('ADMIN');

      if (currentHasAdmin && !newHasAdmin && currentTarget?.status === 'ACTIVE') {
        // Acquire row-level lock on ADMIN role row to serialize concurrent demotions/suspensions
        await tx.$queryRaw`SELECT id FROM roles WHERE code = 'ADMIN' FOR UPDATE`;

        const activeAdminsCount = await tx.user.count({
          where: {
            status: 'ACTIVE',
            roles: {
              some: {
                role: { code: 'ADMIN' },
                revokedAt: null,
              },
            },
          },
        });

        if (activeAdminsCount <= 1) {
          throw new LastActiveAdminError();
        }
      }

      const now = new Date();

      await tx.userRole.updateMany({
        where: {
          userId: id,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      });

      if (roleCodes.length > 0) {
        const roles = await tx.role.findMany({
          where: {
            code: { in: Array.from(roleCodes) },
          },
        });

        for (const role of roles) {
          await tx.userRole.upsert({
            where: {
              userId_roleId: {
                userId: id,
                roleId: role.id,
              },
            },
            update: {
              assignedById: actorId,
              assignedAt: now,
              revokedAt: null,
            },
            create: {
              userId: id,
              roleId: role.id,
              assignedById: actorId,
              assignedAt: now,
              revokedAt: null,
            },
          });
        }
      }

      const updated = await this.findById(id);
      if (!updated) {
        throw new Error(`Employee not found after roles update: ${id}`);
      }
      return updated;
    });
  }

  public async suspend(id: string, _actorId: string): Promise<EmployeeDetail> {
    return this.prisma.$transaction(async (tx) => {
      const currentTarget = await tx.user.findUnique({
        where: { id },
        include: {
          roles: {
            where: { revokedAt: null },
            include: { role: true },
          },
        },
      });

      const hasAdmin = currentTarget?.roles.some((r) => r.role.code === 'ADMIN') ?? false;
      if (hasAdmin && currentTarget?.status === 'ACTIVE') {
        // Acquire row-level lock on ADMIN role row to serialize concurrent demotions/suspensions
        await tx.$queryRaw`SELECT id FROM roles WHERE code = 'ADMIN' FOR UPDATE`;

        const activeAdminsCount = await tx.user.count({
          where: {
            status: 'ACTIVE',
            roles: {
              some: {
                role: { code: 'ADMIN' },
                revokedAt: null,
              },
            },
          },
        });

        if (activeAdminsCount <= 1) {
          throw new LastActiveAdminError();
        }
      }

      await tx.user.update({
        where: { id },
        data: {
          status: 'DISABLED',
          disabledAt: new Date(),
        },
      });

      const updated = await this.findById(id);
      if (!updated) {
        throw new Error(`Employee not found after suspension: ${id}`);
      }
      return updated;
    });
  }

  public async reactivate(id: string, _actorId: string): Promise<EmployeeDetail> {
    await this.prisma.user.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        disabledAt: null,
      },
    });

    const updated = await this.findById(id);
    if (!updated) {
      throw new Error(`Employee not found after reactivation: ${id}`);
    }
    return updated;
  }

  public async countActiveAdmins(): Promise<number> {
    return this.prisma.user.count({
      where: {
        status: 'ACTIVE',
        roles: {
          some: {
            role: { code: 'ADMIN' },
            revokedAt: null,
          },
        },
      },
    });
  }

  public async existsByDisplayName(displayName: string, excludeId?: string): Promise<boolean> {
    const existing = await this.prisma.user.findFirst({
      where: {
        displayName: {
          equals: displayName.trim(),
          mode: 'insensitive',
        },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    return Boolean(existing);
  }

  public async findSessionsByUserId(userId: string): Promise<readonly SafeUserSession[]> {
    if (!UUID_REGEX.test(userId)) return [];

    const now = new Date();
    const sessions = await this.prisma.userSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return sessions.map((s) => ({
      id: s.id,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
      lastActiveAt: s.lastActiveAt,
      expiresAt: s.expiresAt,
      revokedAt: s.revokedAt,
      isActive: s.revokedAt === null && s.expiresAt > now,
    }));
  }
}
