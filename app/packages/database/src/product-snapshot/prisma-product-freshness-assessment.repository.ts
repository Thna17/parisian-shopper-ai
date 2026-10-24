import { Injectable } from '@nestjs/common';
import {
  type CreateFreshnessAssessmentInput,
  type ProductFreshnessAssessment,
  type ProductFreshnessAssessmentRepository,
} from '@parisian-shopper/application';
import { type ProductFreshnessAssessment as PrismaAssessment, type Prisma } from '@prisma/client';

import { PrismaService } from '../prisma.service.js';

@Injectable()
export class PrismaProductFreshnessAssessmentRepository implements ProductFreshnessAssessmentRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async create(input: CreateFreshnessAssessmentInput): Promise<ProductFreshnessAssessment> {
    const record = await this.prisma.productFreshnessAssessment.create({
      data: {
        snapshotId: input.snapshotId,
        evaluatedAt: input.evaluatedAt,
        policyId: input.policyId,
        policyVersion: input.policyVersion,
        freshnessState: input.freshnessState,
        revalidationOutcome: input.revalidationOutcome,
        sourceAvailability: input.sourceAvailability,
        reasonCodes: [...input.reasonCodes],
        evidence: input.evidence as Prisma.InputJsonValue,
        comparedSnapshotId: input.comparedSnapshotId ?? null,
        actorUserId: input.actorUserId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });

    return toAssessmentDomain(record);
  }

  public async findLatestForSnapshot(
    snapshotId: string,
  ): Promise<ProductFreshnessAssessment | null> {
    const record = await this.prisma.productFreshnessAssessment.findFirst({
      where: { snapshotId },
      orderBy: { evaluatedAt: 'desc' },
    });
    return record === null ? null : toAssessmentDomain(record);
  }

  public async listForSnapshot(
    snapshotId: string,
    limit = 20,
  ): Promise<readonly ProductFreshnessAssessment[]> {
    const records = await this.prisma.productFreshnessAssessment.findMany({
      where: { snapshotId },
      orderBy: { evaluatedAt: 'desc' },
      take: Math.min(100, Math.max(1, limit)),
    });
    return records.map(toAssessmentDomain);
  }

  public async findByIdempotencyKey(key: string): Promise<ProductFreshnessAssessment | null> {
    const record = await this.prisma.productFreshnessAssessment.findUnique({
      where: { idempotencyKey: key },
    });
    return record === null ? null : toAssessmentDomain(record);
  }
}

export function toAssessmentDomain(record: PrismaAssessment): ProductFreshnessAssessment {
  return {
    id: record.id,
    snapshotId: record.snapshotId,
    evaluatedAt: record.evaluatedAt,
    policyId: record.policyId,
    policyVersion: record.policyVersion,
    freshnessState: record.freshnessState,
    revalidationOutcome: record.revalidationOutcome,
    sourceAvailability: record.sourceAvailability,
    reasonCodes: record.reasonCodes,
    evidence: (record.evidence ?? {}) as Record<string, unknown>,
    comparedSnapshotId: record.comparedSnapshotId ?? undefined,
    actorUserId: record.actorUserId ?? undefined,
    idempotencyKey: record.idempotencyKey ?? undefined,
    createdAt: record.createdAt,
  };
}
