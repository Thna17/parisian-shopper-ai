import { Injectable } from '@nestjs/common';
import {
  type PersistVisualValidationInput,
  type VisualValidationFindingRecord,
  type VisualValidationRepository,
  type VisualValidationResultRecord,
} from '@parisian-shopper/application';
import {
  Prisma,
  type VisualValidationFinding as PrismaVisualValidationFinding,
  type VisualValidationResult as PrismaVisualValidationResult,
} from '@prisma/client';
import { PrismaService } from '../prisma.service.js';

type ResultWithFindings = PrismaVisualValidationResult & {
  findings: PrismaVisualValidationFinding[];
};

@Injectable()
export class PrismaVisualValidationRepository implements VisualValidationRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async persistResult(
    input: PersistVisualValidationInput,
  ): Promise<VisualValidationResultRecord> {
    const blockingCount = input.findings.filter((f) => f.severity === 'BLOCKING').length;
    const warningCount = input.findings.filter((f) => f.severity === 'WARNING').length;
    const infoCount = input.findings.filter((f) => f.severity === 'INFO').length;
    const findingCount = input.findings.length;

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.visualValidationResult.create({
        data: {
          visualAssetId: input.visualAssetId,
          validatorVersion: input.validatorVersion,
          status: input.status,
          findingCount,
          blockingCount,
          warningCount,
          infoCount,
          findings: {
            create: input.findings.map((finding) => ({
              field: finding.field,
              severity: finding.severity,
              code: finding.code,
              message: finding.message,
              metadata:
                finding.metadata === undefined
                  ? Prisma.JsonNull
                  : (finding.metadata as Prisma.InputJsonValue),
            })),
          },
        },
        include: { findings: true },
      });

      return toResultRecord(created);
    });
  }

  public async findByAssetId(
    visualAssetId: string,
  ): Promise<readonly VisualValidationResultRecord[]> {
    const results = await this.prisma.visualValidationResult.findMany({
      where: { visualAssetId },
      include: { findings: true },
      orderBy: { createdAt: 'desc' },
    });
    return results.map(toResultRecord);
  }

  public async findLatestByAssetId(
    visualAssetId: string,
  ): Promise<VisualValidationResultRecord | null> {
    const result = await this.prisma.visualValidationResult.findFirst({
      where: { visualAssetId },
      include: { findings: true },
      orderBy: { createdAt: 'desc' },
    });
    return result === null ? null : toResultRecord(result);
  }
}

function toResultRecord(row: ResultWithFindings): VisualValidationResultRecord {
  return {
    id: row.id,
    visualAssetId: row.visualAssetId,
    validatorVersion: row.validatorVersion,
    status: row.status,
    findingCount: row.findingCount,
    blockingCount: row.blockingCount,
    warningCount: row.warningCount,
    infoCount: row.infoCount,
    findings: row.findings.map(toFindingRecord),
    createdAt: row.createdAt,
  };
}

function toFindingRecord(row: PrismaVisualValidationFinding): VisualValidationFindingRecord {
  return {
    id: row.id,
    visualValidationResultId: row.visualValidationResultId,
    field: row.field,
    severity: row.severity,
    code: row.code,
    message: row.message,
    ...(row.metadata === null
      ? {}
      : { metadata: row.metadata as Readonly<Record<string, unknown>> }),
    createdAt: row.createdAt,
  };
}
