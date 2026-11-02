import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  type SystemSettingRecord,
  type SystemSettingRepository,
  type UpsertSystemSettingInput,
} from '@parisian-shopper/application';
import { PrismaService } from '../prisma.service.js';

@Injectable()
export class PrismaSystemSettingRepository implements SystemSettingRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findAll(): Promise<readonly SystemSettingRecord[]> {
    const records = await this.prisma.systemSetting.findMany({
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    });

    return records.map((r) => this.toRecord(r));
  }

  public async findByKey(key: string): Promise<SystemSettingRecord | null> {
    const record = await this.prisma.systemSetting.findUnique({
      where: { key },
    });

    return record ? this.toRecord(record) : null;
  }

  public async upsert(input: UpsertSystemSettingInput): Promise<SystemSettingRecord> {
    const record = await this.prisma.systemSetting.upsert({
      where: { key: input.key },
      create: {
        key: input.key,
        category: input.category ?? 'GENERAL',
        value: input.value as Prisma.InputJsonValue,
        description: input.description ?? null,
        updatedById: input.updatedById ?? null,
      },
      update: {
        value: input.value as Prisma.InputJsonValue,
        ...(input.category ? { category: input.category } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        updatedById: input.updatedById ?? null,
      },
    });

    return this.toRecord(record);
  }

  private toRecord(record: {
    id: string;
    key: string;
    category: string;
    value: Prisma.JsonValue;
    description: string | null;
    updatedById: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): SystemSettingRecord {
    return {
      id: record.id,
      key: record.key,
      category: record.category,
      value: (record.value as Record<string, unknown>) ?? {},
      description: record.description,
      updatedById: record.updatedById,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
