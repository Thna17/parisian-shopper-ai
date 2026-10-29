import { Injectable } from '@nestjs/common';
import {
  type AddCampaignProductInput,
  type CampaignDetail,
  type CampaignProductRecord,
  type CampaignRepository,
  type CampaignStatus,
  type CampaignSummary,
  type CreateCampaignInput,
  type ListCampaignsQuery,
  type PaginatedCampaigns,
  type UpdateCampaignInput,
} from '@parisian-shopper/application';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';

interface PrismaCampaignRecord {
  id: string;
  code: string;
  name: string;
  objective: string;
  description: string | null;
  status: string;
  startDate: Date | null;
  endDate: Date | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: { displayName: string } | null;
  products: Array<{
    id: string;
    campaignId: string;
    productSnapshotId: string;
    sortOrder: number;
    isHero: boolean;
    notes: string | null;
    targetPromoPrice: Prisma.Decimal | null;
    targetDiscountPercent: Prisma.Decimal | null;
    createdAt: Date;
    productSnapshot?: {
      sku: string;
      productName: string;
      brand: string;
      price: Prisma.Decimal;
      images?: Prisma.JsonValue | null;
    } | null;
  }>;
}

@Injectable()
export class PrismaCampaignRepository implements CampaignRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findById(id: string): Promise<CampaignDetail | null> {
    const record = await this.prisma.campaign.findUnique({
      where: { id },
      include: {
        createdBy: { select: { displayName: true } },
        products: {
          orderBy: { sortOrder: 'asc' },
          include: {
            productSnapshot: {
              select: {
                sku: true,
                productName: true,
                brand: true,
                price: true,
                images: true,
              },
            },
          },
        },
      },
    });

    return record ? this.toDetail(record) : null;
  }

  public async findByCode(code: string): Promise<CampaignDetail | null> {
    const record = await this.prisma.campaign.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        createdBy: { select: { displayName: true } },
        products: {
          orderBy: { sortOrder: 'asc' },
          include: {
            productSnapshot: {
              select: {
                sku: true,
                productName: true,
                brand: true,
                price: true,
                images: true,
              },
            },
          },
        },
      },
    });

    return record ? this.toDetail(record) : null;
  }

  public async findPaginated(query: ListCampaignsQuery): Promise<PaginatedCampaigns> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.CampaignWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.createdById ? { createdById: query.createdById } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
              { objective: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, records] = await Promise.all([
      this.prisma.campaign.count({ where }),
      this.prisma.campaign.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: { select: { displayName: true } },
          _count: { select: { products: true } },
          products: {
            where: { isHero: true },
            take: 1,
            include: {
              productSnapshot: {
                select: {
                  sku: true,
                  productName: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const items: CampaignSummary[] = records.map((record) => {
      const heroProduct = record.products[0]?.productSnapshot;
      return {
        id: record.id,
        code: record.code,
        name: record.name,
        objective: record.objective,
        description: record.description,
        status: record.status,
        startDate: record.startDate,
        endDate: record.endDate,
        createdById: record.createdById,
        createdByDisplayName: record.createdBy?.displayName,
        productCount: record._count.products,
        heroProductSku: heroProduct?.sku,
        heroProductTitle: heroProduct?.productName,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      };
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  public async create(input: CreateCampaignInput): Promise<CampaignDetail> {
    const record = await this.prisma.campaign.create({
      data: {
        code: input.code.toUpperCase(),
        name: input.name,
        objective: input.objective,
        ...(input.description !== undefined ? { description: input.description } : {}),
        status: input.status ?? 'DRAFT',
        ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
        ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
        createdById: input.createdById,
      },
      include: {
        createdBy: { select: { displayName: true } },
        products: {
          include: {
            productSnapshot: {
              select: {
                sku: true,
                productName: true,
                brand: true,
                price: true,
                images: true,
              },
            },
          },
        },
      },
    });

    return this.toDetail(record);
  }

  public async update(id: string, input: UpdateCampaignInput): Promise<CampaignDetail> {
    const record = await this.prisma.campaign.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.objective !== undefined ? { objective: input.objective } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
        ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
      },
      include: {
        createdBy: { select: { displayName: true } },
        products: {
          orderBy: { sortOrder: 'asc' },
          include: {
            productSnapshot: {
              select: {
                sku: true,
                productName: true,
                brand: true,
                price: true,
                images: true,
              },
            },
          },
        },
      },
    });

    return this.toDetail(record);
  }

  public async updateStatus(id: string, status: CampaignStatus): Promise<CampaignDetail> {
    const record = await this.prisma.campaign.update({
      where: { id },
      data: { status },
      include: {
        createdBy: { select: { displayName: true } },
        products: {
          orderBy: { sortOrder: 'asc' },
          include: {
            productSnapshot: {
              select: {
                sku: true,
                productName: true,
                brand: true,
                price: true,
                images: true,
              },
            },
          },
        },
      },
    });

    return this.toDetail(record);
  }

  public async addProduct(
    campaignId: string,
    input: AddCampaignProductInput,
  ): Promise<CampaignProductRecord> {
    const record = await this.prisma.campaignProduct.create({
      data: {
        campaignId,
        productSnapshotId: input.productSnapshotId,
        sortOrder: input.sortOrder ?? 0,
        isHero: input.isHero ?? false,
        notes: input.notes ?? null,
        targetPromoPrice:
          input.targetPromoPrice !== undefined && input.targetPromoPrice !== null
            ? new Prisma.Decimal(input.targetPromoPrice)
            : null,
        targetDiscountPercent:
          input.targetDiscountPercent !== undefined && input.targetDiscountPercent !== null
            ? new Prisma.Decimal(input.targetDiscountPercent)
            : null,
      },
      include: {
        productSnapshot: {
          select: {
            sku: true,
            productName: true,
            brand: true,
            price: true,
            images: true,
          },
        },
      },
    });

    const snapshot = record.productSnapshot;
    const heroAssetUrl = this.extractHeroImageUrl(snapshot?.images);

    return {
      id: record.id,
      campaignId: record.campaignId,
      productSnapshotId: record.productSnapshotId,
      sortOrder: record.sortOrder,
      isHero: record.isHero,
      notes: record.notes,
      targetPromoPrice: record.targetPromoPrice ? Number(record.targetPromoPrice) : null,
      targetDiscountPercent: record.targetDiscountPercent
        ? Number(record.targetDiscountPercent)
        : null,
      createdAt: record.createdAt,
      productSku: snapshot?.sku,
      productTitle: snapshot?.productName,
      brandName: snapshot?.brand,
      catalogPriceUsd: snapshot?.price ? Number(snapshot.price) : undefined,
      heroAssetUrl,
    };
  }

  public async removeProduct(
    campaignId: string,
    productSnapshotIdOrAssocId: string,
  ): Promise<void> {
    await this.prisma.campaignProduct.deleteMany({
      where: {
        campaignId,
        OR: [{ id: productSnapshotIdOrAssocId }, { productSnapshotId: productSnapshotIdOrAssocId }],
      },
    });
  }

  public async delete(id: string): Promise<void> {
    await this.prisma.campaign.delete({ where: { id } });
  }

  private toDetail(record: PrismaCampaignRecord): CampaignDetail {
    const products: CampaignProductRecord[] = record.products.map((p) => {
      const snapshot = p.productSnapshot;
      const heroAssetUrl = this.extractHeroImageUrl(snapshot?.images);
      return {
        id: p.id,
        campaignId: p.campaignId,
        productSnapshotId: p.productSnapshotId,
        sortOrder: p.sortOrder,
        isHero: p.isHero,
        notes: p.notes,
        targetPromoPrice: p.targetPromoPrice ? Number(p.targetPromoPrice) : null,
        targetDiscountPercent: p.targetDiscountPercent ? Number(p.targetDiscountPercent) : null,
        createdAt: p.createdAt,
        productSku: snapshot?.sku,
        productTitle: snapshot?.productName,
        brandName: snapshot?.brand,
        catalogPriceUsd: snapshot?.price ? Number(snapshot.price) : undefined,
        heroAssetUrl,
      };
    });

    return {
      id: record.id,
      code: record.code,
      name: record.name,
      objective: record.objective,
      description: record.description,
      status: record.status as CampaignStatus,
      startDate: record.startDate,
      endDate: record.endDate,
      createdById: record.createdById,
      createdByDisplayName: record.createdBy?.displayName,
      productCount: products.length,
      heroProductSku: products.find((p) => p.isHero)?.productSku ?? products[0]?.productSku,
      heroProductTitle: products.find((p) => p.isHero)?.productTitle ?? products[0]?.productTitle,
      products,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private extractHeroImageUrl(images: Prisma.JsonValue | null | undefined): string | null {
    if (!images || !Array.isArray(images)) return null;
    const hero = (images as Array<Record<string, unknown>>).find((img) => Boolean(img?.['isHero']));
    const candidate = hero ?? (images[0] as Record<string, unknown> | undefined);
    return typeof candidate?.['url'] === 'string' ? candidate['url'] : null;
  }
}
