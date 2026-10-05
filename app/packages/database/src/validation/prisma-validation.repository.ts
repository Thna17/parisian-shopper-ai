import { Injectable } from '@nestjs/common';
import {
  type CreateValidationResult,
  type PersistedValidationFinding,
  type PersistedValidationResult,
  type ValidationRepository,
} from '@parisian-shopper/application';
import { FindingCode, FindingSeverity, ValidationStatus } from '@parisian-shopper/application';
import { Prisma, type ValidationFinding, type ValidationResult } from '@prisma/client';

import { PrismaService } from '../prisma.service.js';

type ResultWithFindings = ValidationResult & { findings: ValidationFinding[] };

@Injectable()
export class PrismaValidationRepository implements ValidationRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async create(input: CreateValidationResult): Promise<PersistedValidationResult> {
    return this.prisma.$transaction(
      async (tx) => {
        const lockKey = `${input.contentVersionId}:${input.outcome.validatorVersion}`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
        const existing = await tx.validationResult.findUnique({
          where: {
            contentVersionId_validatorVersion: {
              contentVersionId: input.contentVersionId,
              validatorVersion: input.outcome.validatorVersion,
            },
          },
          include: { findings: { orderBy: { createdAt: 'asc' } } },
        });
        if (existing !== null) return toResult(existing);

        const created = await tx.validationResult.create({
          data: {
            contentVersionId: input.contentVersionId,
            validatorVersion: input.outcome.validatorVersion,
            status: input.outcome.status,
            findingCount: input.outcome.findingCount,
            blockingCount: input.outcome.blockingCount,
            warningCount: input.outcome.warningCount,
            infoCount: input.outcome.infoCount,
            findings: {
              create: input.outcome.findings.map((finding) => ({
                field: finding.field,
                severity: finding.severity,
                code: finding.code,
                message: finding.message,
                expectedValue: toNullableJson(finding.expectedValue),
                actualValue: toNullableJson(finding.actualValue),
                sourcePath: finding.sourcePath ?? null,
                contentPath: finding.contentPath ?? null,
                metadata: toNullableJson(finding.metadata),
              })),
            },
          },
          include: { findings: { orderBy: { createdAt: 'asc' } } },
        });
        await tx.outboxEvent.create({
          data: {
            topic: 'CONTENT_VALIDATION_COMPLETED',
            schemaVersion: 1,
            idempotencyKey: `validation-result:${created.id}:completed`,
            aggregateType: 'ContentVersion',
            aggregateId: input.contentVersionId,
            payload: {
              contentVersionId: input.contentVersionId,
              validationResultId: created.id,
              validatorVersion: created.validatorVersion,
              status: created.status,
            },
            occurredAt: created.createdAt,
            availableAt: created.createdAt,
          },
        });
        return toResult(created);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  public async findByContentVersionAndValidatorVersion(
    contentVersionId: string,
    validatorVersion: string,
  ): Promise<PersistedValidationResult | null> {
    const record = await this.prisma.validationResult.findUnique({
      where: { contentVersionId_validatorVersion: { contentVersionId, validatorVersion } },
      include: { findings: { orderBy: { createdAt: 'asc' } } },
    });
    return record === null ? null : toResult(record);
  }

  public async findLatestByContentVersion(
    contentVersionId: string,
  ): Promise<PersistedValidationResult | null> {
    const record = await this.prisma.validationResult.findFirst({
      where: { contentVersionId },
      orderBy: { createdAt: 'desc' },
      include: { findings: { orderBy: { createdAt: 'asc' } } },
    });
    return record === null ? null : toResult(record);
  }
}

function toResult(record: ResultWithFindings): PersistedValidationResult {
  return {
    id: record.id,
    contentVersionId: record.contentVersionId,
    validatorVersion: record.validatorVersion,
    status: ValidationStatus[record.status],
    findingCount: record.findingCount,
    blockingCount: record.blockingCount,
    warningCount: record.warningCount,
    infoCount: record.infoCount,
    createdAt: record.createdAt,
    findings: record.findings.map(toFinding),
  };
}

function toFinding(record: ValidationFinding): PersistedValidationFinding {
  return {
    id: record.id,
    validationResultId: record.validationResultId,
    field: record.field,
    severity: FindingSeverity[record.severity],
    code: FindingCode[record.code as keyof typeof FindingCode],
    message: record.message,
    ...(record.expectedValue === null ? {} : { expectedValue: record.expectedValue }),
    ...(record.actualValue === null ? {} : { actualValue: record.actualValue }),
    ...(record.sourcePath === null ? {} : { sourcePath: record.sourcePath }),
    ...(record.contentPath === null ? {} : { contentPath: record.contentPath }),
    ...(record.metadata === null
      ? {}
      : { metadata: record.metadata as Readonly<Record<string, unknown>> }),
    createdAt: record.createdAt,
  };
}

function toNullableJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === undefined ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}
