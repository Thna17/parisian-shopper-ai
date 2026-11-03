import { Injectable } from '@nestjs/common';
import {
  type ProviderPricingRepository,
  type ProviderPricingVersionDraft,
  type ProviderPricingVersionRecord,
} from '@parisian-shopper/application';
import { Prisma, type ProviderPricingVersion } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';

@Injectable()
export class PrismaProviderPricingRepository implements ProviderPricingRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findActivePricing(
    providerId: string,
    modelId: string,
    date = new Date(),
  ): Promise<ProviderPricingVersionRecord | null> {
    const pricing = await this.prisma.providerPricingVersion.findFirst({
      where: {
        providerId,
        modelId,
        approvalStatus: 'APPROVED',
        effectiveFrom: { lte: date },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    if (!pricing) return null;
    return this.mapPricing(pricing);
  }

  public async createPricingVersion(
    draft: ProviderPricingVersionDraft,
  ): Promise<ProviderPricingVersionRecord> {
    const created = await this.prisma.providerPricingVersion.create({
      data: {
        id: draft.id,
        providerId: draft.providerId,
        modelId: draft.modelId,
        capability: draft.capability,
        modality: draft.modality,
        pricingUnit: draft.pricingUnit,
        inputTokenRate:
          draft.inputTokenRate !== undefined && draft.inputTokenRate !== null
            ? new Prisma.Decimal(draft.inputTokenRate)
            : null,
        outputTokenRate:
          draft.outputTokenRate !== undefined && draft.outputTokenRate !== null
            ? new Prisma.Decimal(draft.outputTokenRate)
            : null,
        imageRateByResolution:
          draft.imageRateByResolution !== undefined && draft.imageRateByResolution !== null
            ? (draft.imageRateByResolution as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        videoRateByDuration:
          draft.videoRateByDuration !== undefined && draft.videoRateByDuration !== null
            ? (draft.videoRateByDuration as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        subscriptionRules:
          draft.subscriptionRules !== undefined && draft.subscriptionRules !== null
            ? (draft.subscriptionRules as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        currency: draft.currency ?? 'USD',
        source: draft.source,
        pricingSourceUrl: draft.pricingSourceUrl,
        sourceRetrievedAt: draft.sourceRetrievedAt,
        effectiveFrom: draft.effectiveFrom,
        effectiveTo: draft.effectiveTo ?? null,
        approvalStatus: draft.approvalStatus ?? 'PROPOSED',
        approvedByUserId: draft.approvedByUserId ?? null,
      },
    });

    return this.mapPricing(created);
  }

  public async listPricingVersions(
    providerId?: string,
  ): Promise<readonly ProviderPricingVersionRecord[]> {
    const where: Prisma.ProviderPricingVersionWhereInput = {};
    if (providerId) where.providerId = providerId;

    const records = await this.prisma.providerPricingVersion.findMany({
      where,
      orderBy: { effectiveFrom: 'desc' },
    });

    return records.map((p) => this.mapPricing(p));
  }

  private mapPricing(p: ProviderPricingVersion): ProviderPricingVersionRecord {
    return {
      id: p.id,
      providerId: p.providerId,
      modelId: p.modelId,
      capability: p.capability,
      modality: p.modality,
      pricingUnit: p.pricingUnit,
      inputTokenRate: p.inputTokenRate ? Number(p.inputTokenRate) : null,
      outputTokenRate: p.outputTokenRate ? Number(p.outputTokenRate) : null,
      imageRateByResolution: p.imageRateByResolution as Record<string, string | number> | null,
      videoRateByDuration: p.videoRateByDuration as Record<string, string | number> | null,
      subscriptionRules: p.subscriptionRules as Record<string, unknown> | null,
      currency: p.currency,
      source: p.source,
      pricingSourceUrl: p.pricingSourceUrl,
      sourceRetrievedAt: p.sourceRetrievedAt,
      effectiveFrom: p.effectiveFrom,
      effectiveTo: p.effectiveTo,
      approvalStatus: p.approvalStatus,
      approvedByUserId: p.approvedByUserId,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }
}
