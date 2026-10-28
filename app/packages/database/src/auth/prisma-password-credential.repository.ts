import { Injectable } from '@nestjs/common';
import {
  type CreatePasswordCredentialInput,
  type PasswordCredentialRecord,
  type PasswordCredentialRepository,
  type RecordLoginFailureInput,
  type UpdatePasswordHashInput,
} from '@parisian-shopper/application';
import { type PasswordCredential as PrismaPasswordCredential } from '@prisma/client';

import { PrismaService } from '../prisma.service.js';

@Injectable()
export class PrismaPasswordCredentialRepository implements PasswordCredentialRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findByUserId(userId: string): Promise<PasswordCredentialRecord | null> {
    const record = await this.prisma.passwordCredential.findUnique({
      where: { userId },
    });
    return record ? this.toDomain(record) : null;
  }

  public async create(input: CreatePasswordCredentialInput): Promise<PasswordCredentialRecord> {
    const record = await this.prisma.passwordCredential.create({
      data: {
        userId: input.userId,
        passwordHash: input.passwordHash,
        hashAlgorithm: input.hashAlgorithm ?? 'argon2id',
      },
    });
    return this.toDomain(record);
  }

  public async updatePasswordHash(
    input: UpdatePasswordHashInput,
  ): Promise<PasswordCredentialRecord> {
    const record = await this.prisma.passwordCredential.update({
      where: { userId: input.userId },
      data: {
        passwordHash: input.passwordHash,
        hashAlgorithm: input.hashAlgorithm ?? 'argon2id',
        failedLogins: 0,
        lockedUntil: null,
      },
    });
    return this.toDomain(record);
  }

  public async recordLoginFailure(
    input: RecordLoginFailureInput,
  ): Promise<PasswordCredentialRecord> {
    const record = await this.prisma.passwordCredential.update({
      where: { userId: input.userId },
      data: {
        failedLogins: { increment: 1 },
        ...(input.lockedUntil !== undefined ? { lockedUntil: input.lockedUntil } : {}),
      },
    });
    return this.toDomain(record);
  }

  public async resetLoginFailures(userId: string): Promise<void> {
    await this.prisma.passwordCredential.updateMany({
      where: { userId },
      data: {
        failedLogins: 0,
        lockedUntil: null,
      },
    });
  }

  public async deleteByUserId(userId: string): Promise<boolean> {
    const result = await this.prisma.passwordCredential.deleteMany({
      where: { userId },
    });
    return result.count > 0;
  }

  private toDomain(record: PrismaPasswordCredential): PasswordCredentialRecord {
    return {
      id: record.id,
      userId: record.userId,
      passwordHash: record.passwordHash,
      hashAlgorithm: record.hashAlgorithm,
      failedLogins: record.failedLogins,
      lockedUntil: record.lockedUntil,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
