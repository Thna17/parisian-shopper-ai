import { Injectable } from '@nestjs/common';
import type {
  BrandProfileRepository,
  BrandProfileStatus,
  BrandProfileVersionDraft,
  BrandProfileVersionRecord,
  LanguagePolicy,
  LogoRules,
  ToneRules,
  TypographyRules,
  VisualAestheticRules,
} from '@parisian-shopper/application';
import { type BrandProfileVersion as PrismaBrandProfileVersion, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';

@Injectable()
export class PrismaBrandProfileRepository implements BrandProfileRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async createDraft(draft: BrandProfileVersionDraft): Promise<BrandProfileVersionRecord> {
    const existing = await this.prisma.brandProfileVersion.findMany({
      where: { name: draft.name },
      orderBy: { versionNumber: 'desc' },
      take: 1,
    });
    const nextVersionNumber = existing[0] ? existing[0].versionNumber + 1 : 1;

    const created = await this.prisma.brandProfileVersion.create({
      data: {
        name: draft.name,
        versionNumber: nextVersionNumber,
        status: 'DRAFT',
        evaluationPolicyId: draft.evaluationPolicyId,
        languagePolicy: draft.languagePolicy as unknown as Prisma.InputJsonValue,
        toneRules: draft.toneRules as unknown as Prisma.InputJsonValue,
        visualAestheticRules: draft.visualAestheticRules as unknown as Prisma.InputJsonValue,
        typographyRules: draft.typographyRules as unknown as Prisma.InputJsonValue,
        logoRules: draft.logoRules as unknown as Prisma.InputJsonValue,
        approvedExampleIds: [...draft.approvedExampleIds],
        prohibitedPatterns: [...draft.prohibitedPatterns],
        approvedByUserId: draft.approvedByUserId,
      },
    });

    return this.mapRecord(created);
  }

  public async findById(id: string): Promise<BrandProfileVersionRecord | null> {
    const record = await this.prisma.brandProfileVersion.findUnique({
      where: { id },
    });
    return record ? this.mapRecord(record) : null;
  }

  public async findByNameAndVersion(
    name: string,
    versionNumber: number,
  ): Promise<BrandProfileVersionRecord | null> {
    const record = await this.prisma.brandProfileVersion.findUnique({
      where: {
        name_versionNumber: {
          name,
          versionNumber,
        },
      },
    });
    return record ? this.mapRecord(record) : null;
  }

  public async findActive(): Promise<BrandProfileVersionRecord | null> {
    const record = await this.prisma.brandProfileVersion.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: [{ activatedAt: 'desc' }, { createdAt: 'desc' }],
    });
    return record ? this.mapRecord(record) : null;
  }

  public async listProfiles(): Promise<readonly BrandProfileVersionRecord[]> {
    const records = await this.prisma.brandProfileVersion.findMany({
      orderBy: [{ versionNumber: 'desc' }, { createdAt: 'desc' }],
    });
    return records.map((r) => this.mapRecord(r));
  }

  public async updateStatus(
    id: string,
    status: BrandProfileStatus,
  ): Promise<BrandProfileVersionRecord> {
    const updated = await this.prisma.brandProfileVersion.update({
      where: { id },
      data: { status },
    });
    return this.mapRecord(updated);
  }

  public async activateVersion(
    id: string,
    approvedByUserId: string,
  ): Promise<BrandProfileVersionRecord> {
    return this.prisma.$transaction(async (tx) => {
      // Retire currently active profiles
      await tx.brandProfileVersion.updateMany({
        where: { status: 'ACTIVE' },
        data: { status: 'RETIRED' },
      });

      // Activate target profile
      const activated = await tx.brandProfileVersion.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          activatedAt: new Date(),
          approvedByUserId,
        },
      });

      return this.mapRecord(activated);
    });
  }

  public async rollbackToVersion(
    targetVersionId: string,
    authorizedUserId: string,
  ): Promise<{
    revokedProfile: BrandProfileVersionRecord | null;
    restoredProfile: BrandProfileVersionRecord;
  }> {
    return this.prisma.$transaction(async (tx) => {
      // Find currently active profile
      const currentActive = await tx.brandProfileVersion.findFirst({
        where: { status: 'ACTIVE' },
      });

      let revokedProfile: BrandProfileVersionRecord | null = null;
      if (currentActive) {
        const revoked = await tx.brandProfileVersion.update({
          where: { id: currentActive.id },
          data: { status: 'REVOKED' },
        });
        revokedProfile = this.mapRecord(revoked);
      }

      // Restore target profile to ACTIVE
      const restored = await tx.brandProfileVersion.update({
        where: { id: targetVersionId },
        data: {
          status: 'ACTIVE',
          activatedAt: new Date(),
          approvedByUserId: authorizedUserId,
        },
      });

      return {
        revokedProfile,
        restoredProfile: this.mapRecord(restored),
      };
    });
  }

  private mapRecord(r: PrismaBrandProfileVersion): BrandProfileVersionRecord {
    return {
      id: r.id,
      versionNumber: r.versionNumber,
      name: r.name,
      status: r.status,
      evaluationPolicyId: r.evaluationPolicyId,
      languagePolicy: r.languagePolicy as unknown as LanguagePolicy,
      toneRules: r.toneRules as unknown as ToneRules,
      visualAestheticRules: r.visualAestheticRules as unknown as VisualAestheticRules,
      typographyRules: r.typographyRules as unknown as TypographyRules,
      logoRules: r.logoRules as unknown as LogoRules,
      approvedExampleIds: r.approvedExampleIds,
      prohibitedPatterns: r.prohibitedPatterns,
      benchmarkReport: r.benchmarkReport as Record<string, unknown> | null,
      approvedByUserId: r.approvedByUserId,
      activatedAt: r.activatedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
