import { Injectable } from '@nestjs/common';
import {
  type CreateInvitationInput,
  type EmployeeInvitationRecord,
  type EmployeeInvitationRepository,
} from '@parisian-shopper/application';
import { PrismaService } from '../prisma.service.js';

@Injectable()
export class PrismaEmployeeInvitationRepository implements EmployeeInvitationRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async create(input: CreateInvitationInput): Promise<EmployeeInvitationRecord> {
    const record = await this.prisma.employeeInvitation.create({
      data: {
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        createdById: input.createdById ?? null,
      },
    });

    return this.toRecord(record);
  }

  public async findByTokenHash(tokenHash: string): Promise<EmployeeInvitationRecord | null> {
    const record = await this.prisma.employeeInvitation.findUnique({
      where: { tokenHash },
    });

    return record ? this.toRecord(record) : null;
  }

  public async markClaimed(id: string, claimedAt: Date): Promise<void> {
    await this.prisma.employeeInvitation.update({
      where: { id },
      data: { claimedAt },
    });
  }

  public async findPendingByUserId(
    userId: string,
    now: Date,
  ): Promise<EmployeeInvitationRecord | null> {
    const record = await this.prisma.employeeInvitation.findFirst({
      where: {
        userId,
        claimedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    return record ? this.toRecord(record) : null;
  }

  public async invalidatePendingForUser(userId: string): Promise<number> {
    const res = await this.prisma.employeeInvitation.updateMany({
      where: {
        userId,
        claimedAt: null,
      },
      data: {
        expiresAt: new Date(),
      },
    });

    return res.count;
  }

  private toRecord(record: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    claimedAt: Date | null;
    createdById: string | null;
    createdAt: Date;
  }): EmployeeInvitationRecord {
    return {
      id: record.id,
      userId: record.userId,
      tokenHash: record.tokenHash,
      expiresAt: record.expiresAt,
      claimedAt: record.claimedAt,
      createdById: record.createdById,
      createdAt: record.createdAt,
    };
  }
}
