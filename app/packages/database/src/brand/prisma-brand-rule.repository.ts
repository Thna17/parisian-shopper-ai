import { Injectable } from '@nestjs/common';
import {
  brandRulesSchema,
  type BrandRuleRepository,
  type BrandRuleVersion,
  type CreateBrandRuleVersionInput,
} from '@parisian-shopper/application';
import { Prisma, type BrandRuleVersion as PrismaBrandRuleVersion } from '@prisma/client';

import { PrismaService } from '../prisma.service.js';

@Injectable()
export class PrismaBrandRuleRepository implements BrandRuleRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async create(input: CreateBrandRuleVersionInput): Promise<BrandRuleVersion> {
    const rules = brandRulesSchema.parse(input.rules);
    const record = await this.prisma.brandRuleVersion.create({
      data: {
        name: input.name,
        version: input.version,
        status: input.status,
        languageRules: toJson(rules.language),
        toneRules: toJson(rules.tone),
        ctaRules: toJson(rules.cta),
        promotionRules: toJson(rules.promotion),
        perfumeClaimRules: toJson(rules.perfumeClaims),
        platformRules: toJson(rules.platforms),
        visualGuidance: toJson(rules.visualGuidance),
        ...(input.activatedAt === undefined ? {} : { activatedAt: input.activatedAt }),
      },
    });
    return toDomain(record);
  }

  public async findById(id: string): Promise<BrandRuleVersion | null> {
    const record = await this.prisma.brandRuleVersion.findUnique({ where: { id } });
    return record === null ? null : toDomain(record);
  }
}

function toDomain(record: PrismaBrandRuleVersion): BrandRuleVersion {
  return {
    id: record.id,
    name: record.name,
    version: record.version,
    status: record.status,
    rules: brandRulesSchema.parse({
      language: record.languageRules,
      tone: record.toneRules,
      cta: record.ctaRules,
      promotion: record.promotionRules,
      perfumeClaims: record.perfumeClaimRules,
      platforms: record.platformRules,
      visualGuidance: record.visualGuidance,
    }),
    createdAt: record.createdAt,
    ...(record.activatedAt === null ? {} : { activatedAt: record.activatedAt }),
  };
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
