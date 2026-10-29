import { Injectable } from '@nestjs/common';
import {
  calculateProductDependencyHashes,
  normalizedProductEnvelopeSchema,
  type CreateProductSnapshotRecord,
  type ListProductSnapshotsQuery,
  type NormalizedProductEnvelope,
  type PaginatedProductSnapshots,
  type ProductDependencyHashes,
  type ProductSnapshot,
  type ProductSnapshotRepository,
} from '@parisian-shopper/application';
import {
  Prisma,
  ProductStockStatus,
  type ProductSnapshot as PrismaProductSnapshot,
} from '@prisma/client';

import { PrismaService } from '../prisma.service.js';

@Injectable()
export class PrismaProductSnapshotRepository implements ProductSnapshotRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async create(input: CreateProductSnapshotRecord): Promise<ProductSnapshot> {
    const source = normalizedProductEnvelopeSchema.parse(input.product);
    const product = source.product;
    const hashes = input.dependencyHashes ?? calculateProductDependencyHashes(source);

    const record = await this.prisma.productSnapshot.create({
      data: {
        sku: product.sku,
        productName: product.product_name,
        brand: product.brand,
        category: product.category,
        price: product.price,
        currency: product.currency,
        promoPrice: product.promo_price ?? null,
        discount: toNullableJson(product.discount),
        description: product.description ?? null,
        images: toNullableJson(product.images),
        stockStatus: product.stock_status,
        productUrl: product.product_url ?? null,
        fragranceNotes: toNullableJson(product.fragrance_notes),
        concentration: toNullableJson(product.concentration),
        size: toNullableJson(product.size),
        countryOfOrigin: toNullableJson(product.country_of_origin),
        similarityClaims: toNullableJson(product.similarity_claims),
        sourceSchemaVersion: source.schema_version,
        sourceSystem: source.source_system,
        sourceRecordId: source.source_record_id ?? null,
        sourceVersion: source.source_version ?? null,
        sourceUpdatedAt: new Date(source.source_updated_at),
        retrievedAt: new Date(source.retrieved_at),
        sourceEtag: source.etag ?? null,
        lifecycleStatus: source.lifecycle_status,
        snapshotHash: hashes.full,
        catalogPriceHash: hashes.catalogPrice,
        campaignPriceHash: hashes.campaignPrice,
        stockHash: hashes.stock,
        promotionHash: hashes.promotion,
        permanentFactsHash: hashes.permanentFacts,
        visualAssetHash: hashes.visualAssets,
        normalizerVersion: input.normalizerVersion,
      },
    });

    return toSnapshotDomain(record);
  }

  public async findById(id: string): Promise<ProductSnapshot | null> {
    const record = await this.prisma.productSnapshot.findUnique({ where: { id } });
    return record === null ? null : toSnapshotDomain(record);
  }

  public async findLatestBySku(sku: string): Promise<ProductSnapshot | null> {
    const record = await this.prisma.productSnapshot.findFirst({
      where: { sku },
      orderBy: { createdAt: 'desc' },
    });
    return record === null ? null : toSnapshotDomain(record);
  }

  public async findPaginated(
    query: ListProductSnapshotsQuery = {},
  ): Promise<PaginatedProductSnapshots> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.ProductSnapshotWhereInput = {};

    if (query.search && query.search.trim() !== '') {
      const q = query.search.trim();
      where.OR = [
        { productName: { contains: q, mode: 'insensitive' } },
        { brand: { contains: q, mode: 'insensitive' } },
        { sku: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (query.brand && query.brand.trim() !== '') {
      where.brand = { equals: query.brand.trim(), mode: 'insensitive' };
    }

    if (query.category && query.category.trim() !== '') {
      where.category = { equals: query.category.trim(), mode: 'insensitive' };
    }

    if (query.stockStatus && query.stockStatus.trim() !== '') {
      const normalizedStock = query.stockStatus
        .trim()
        .toLowerCase()
        .replace(/-/g, '_') as ProductStockStatus;
      if (Object.values(ProductStockStatus).includes(normalizedStock)) {
        where.stockStatus = normalizedStock;
      }
    }

    const [records, totalGrouped] = await Promise.all([
      this.prisma.productSnapshot.findMany({
        where,
        distinct: ['sku'],
        orderBy: [{ sku: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.productSnapshot.groupBy({
        by: ['sku'],
        where,
      }),
    ]);

    const total = totalGrouped.length;
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items: records.map(toSnapshotDomain),
      total,
      page,
      limit,
      totalPages,
    };
  }
}

export function toSnapshotDomain(record: PrismaProductSnapshot): ProductSnapshot {
  const optionalProductFields = {
    ...(record.promoPrice === null ? {} : { promo_price: record.promoPrice.toString() }),
    ...(record.discount === null ? {} : { discount: record.discount }),
    ...(record.description === null ? {} : { description: record.description }),
    ...(record.images === null ? {} : { images: record.images }),
    ...(record.productUrl === null ? {} : { product_url: record.productUrl }),
    ...(record.fragranceNotes === null ? {} : { fragrance_notes: record.fragranceNotes }),
    ...(record.concentration === null ? {} : { concentration: record.concentration }),
    ...(record.size === null ? {} : { size: record.size }),
    ...(record.countryOfOrigin === null ? {} : { country_of_origin: record.countryOfOrigin }),
    ...(record.similarityClaims === null ? {} : { similarity_claims: record.similarityClaims }),
  };
  const optionalSourceFields = {
    ...(record.sourceRecordId === null ? {} : { source_record_id: record.sourceRecordId }),
    ...(record.sourceVersion === null ? {} : { source_version: record.sourceVersion }),
    ...(record.sourceEtag === null ? {} : { etag: record.sourceEtag }),
  };
  const product: NormalizedProductEnvelope = normalizedProductEnvelopeSchema.parse({
    schema_version: record.sourceSchemaVersion,
    source_system: record.sourceSystem,
    ...optionalSourceFields,
    retrieved_at: record.retrievedAt.toISOString(),
    source_updated_at: record.sourceUpdatedAt.toISOString(),
    lifecycle_status: record.lifecycleStatus,
    product: {
      sku: record.sku,
      product_name: record.productName,
      brand: record.brand,
      category: record.category,
      price: record.price.toString(),
      currency: record.currency,
      ...optionalProductFields,
      stock_status: record.stockStatus,
    },
  });

  const calculatedHashes = calculateProductDependencyHashes(product);
  const dependencyHashes: ProductDependencyHashes =
    record.catalogPriceHash &&
    record.campaignPriceHash &&
    record.stockHash &&
    record.promotionHash &&
    record.permanentFactsHash &&
    record.visualAssetHash
      ? {
          full: record.snapshotHash,
          catalogPrice: record.catalogPriceHash,
          campaignPrice: record.campaignPriceHash,
          stock: record.stockHash,
          promotion: record.promotionHash,
          permanentFacts: record.permanentFactsHash,
          visualAssets: record.visualAssetHash,
        }
      : {
          ...calculatedHashes,
          full: record.snapshotHash,
        };

  return {
    id: record.id,
    product,
    snapshotHash: record.snapshotHash,
    dependencyHashes,
    normalizerVersion: record.normalizerVersion,
    createdAt: record.createdAt,
  };
}

function toNullableJson(value: unknown): Prisma.InputJsonValue | Prisma.NullTypes.DbNull {
  return value === undefined ? Prisma.DbNull : toJsonValue(value);
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  if (typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(toJsonValue);
  }
  if (typeof value === 'object') {
    if (value === null) {
      throw new TypeError('Product snapshot JSON fields cannot contain null values');
    }
    const result: Record<string, Prisma.InputJsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) {
        result[key] = toJsonValue(item);
      }
    }
    return result;
  }
  throw new TypeError('Product snapshot JSON must contain only JSON-compatible values');
}
