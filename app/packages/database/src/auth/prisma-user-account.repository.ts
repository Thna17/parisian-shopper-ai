import { Injectable } from '@nestjs/common';
import {
  type AuthenticatedUserAccount,
  type RoleCode,
  type UserAccountRepository,
  resolvePermissionsForRoles,
} from '@parisian-shopper/application';
import { PrismaService } from '../prisma.service.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class PrismaUserAccountRepository implements UserAccountRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findByLoginIdentifier(identifier: string): Promise<AuthenticatedUserAccount | null> {
    const trimmed = identifier.trim();
    if (!trimmed) return null;

    const isUuid = UUID_REGEX.test(trimmed);
    const normalizedUsername = trimmed.replace(/^@/, '');

    const record = await this.prisma.user.findFirst({
      where: {
        OR: [
          ...(isUuid ? [{ id: trimmed }] : []),
          { displayName: { equals: trimmed, mode: 'insensitive' } },
          {
            telegramIdentities: {
              some: {
                telegramUsername: { equals: normalizedUsername, mode: 'insensitive' },
              },
            },
          },
        ],
      },
      include: {
        roles: {
          where: { revokedAt: null },
          include: { role: true },
        },
        passwordCredential: true,
      },
    });

    return record ? this.toAccount(record) : null;
  }

  public async findById(userId: string): Promise<AuthenticatedUserAccount | null> {
    if (!UUID_REGEX.test(userId)) return null;

    const record = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          where: { revokedAt: null },
          include: { role: true },
        },
        passwordCredential: true,
      },
    });

    return record ? this.toAccount(record) : null;
  }

  private toAccount(record: {
    id: string;
    displayName: string;
    status: 'ACTIVE' | 'DISABLED';
    disabledAt: Date | null;
    roles: Array<{ role: { code: string } }>;
    passwordCredential: {
      id: string;
      userId: string;
      passwordHash: string;
      hashAlgorithm: string;
      failedLogins: number;
      lockedUntil: Date | null;
      createdAt: Date;
      updatedAt: Date;
    } | null;
  }): AuthenticatedUserAccount {
    const roleCodes = record.roles.map((r) => r.role.code as RoleCode);
    const permissions = resolvePermissionsForRoles(roleCodes);

    return {
      id: record.id,
      displayName: record.displayName,
      status: record.status,
      disabledAt: record.disabledAt,
      roles: roleCodes,
      permissions,
      passwordCredential: record.passwordCredential
        ? {
            id: record.passwordCredential.id,
            userId: record.passwordCredential.userId,
            passwordHash: record.passwordCredential.passwordHash,
            hashAlgorithm: record.passwordCredential.hashAlgorithm,
            failedLogins: record.passwordCredential.failedLogins,
            lockedUntil: record.passwordCredential.lockedUntil,
            createdAt: record.passwordCredential.createdAt,
            updatedAt: record.passwordCredential.updatedAt,
          }
        : null,
    };
  }
}
