import { Injectable } from '@nestjs/common';
import {
  type CreateUserSessionInput,
  type UserSessionRecord,
  type UserSessionRepository,
} from '@parisian-shopper/application';
import { type UserSession as PrismaUserSession } from '@prisma/client';

import { PrismaService } from '../prisma.service.js';

@Injectable()
export class PrismaUserSessionRepository implements UserSessionRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async create(input: CreateUserSessionInput): Promise<UserSessionRecord> {
    const record = await this.prisma.userSession.create({
      data: {
        userId: input.userId,
        sessionTokenHash: input.sessionTokenHash,
        expiresAt: input.expiresAt,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        ...(input.createdAt ? { createdAt: input.createdAt } : {}),
        ...(input.lastActiveAt ? { lastActiveAt: input.lastActiveAt } : {}),
      },
    });
    return this.toDomain(record);
  }

  public async findById(id: string): Promise<UserSessionRecord | null> {
    const record = await this.prisma.userSession.findUnique({
      where: { id },
    });
    return record ? this.toDomain(record) : null;
  }

  public async findByTokenHash(sessionTokenHash: string): Promise<UserSessionRecord | null> {
    const record = await this.prisma.userSession.findUnique({
      where: { sessionTokenHash },
    });
    return record ? this.toDomain(record) : null;
  }

  public async findActiveByTokenHash(
    sessionTokenHash: string,
    now: Date,
  ): Promise<UserSessionRecord | null> {
    const record = await this.prisma.userSession.findFirst({
      where: {
        sessionTokenHash,
        revokedAt: null,
        expiresAt: { gt: now },
      },
    });
    return record ? this.toDomain(record) : null;
  }

  public async findActiveByUserId(
    userId: string,
    now: Date,
  ): Promise<readonly UserSessionRecord[]> {
    const records = await this.prisma.userSession.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((record) => this.toDomain(record));
  }

  public async touch(id: string, lastActiveAt: Date): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: { id, revokedAt: null },
      data: { lastActiveAt },
    });
  }

  public async revoke(id: string, revokedAt: Date): Promise<boolean> {
    const result = await this.prisma.userSession.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt },
    });
    return result.count > 0;
  }

  public async revokeAllForUser(userId: string, revokedAt: Date): Promise<number> {
    const result = await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt },
    });
    return result.count;
  }

  public async deleteExpired(now: Date): Promise<number> {
    const result = await this.prisma.userSession.deleteMany({
      where: { expiresAt: { lte: now } },
    });
    return result.count;
  }

  private toDomain(record: PrismaUserSession): UserSessionRecord {
    return {
      id: record.id,
      userId: record.userId,
      sessionTokenHash: record.sessionTokenHash,
      ipAddress: record.ipAddress,
      userAgent: record.userAgent,
      createdAt: record.createdAt,
      lastActiveAt: record.lastActiveAt,
      expiresAt: record.expiresAt,
      revokedAt: record.revokedAt,
    };
  }
}
