import { Injectable } from '@nestjs/common';
import {
  normalizedProductEnvelopeSchema,
  type CreateProductSnapshotRecord,
  type NormalizedProductEnvelope,
  type ProductSnapshot,
  type ProductSnapshotRepository,
} from '@parisian-shopper/application';
import { Prisma, type ProductSnapshot as PrismaProductSnapshot } from '@prisma/client';

import { PrismaService } from '../prisma.service.js';

@Injectable()
export class PrismaProductSnapshotRepository implements ProductSnapshotRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async create(input: CreateProductSnapshotRecord): Promise<ProductSnapshot> {
    const source = normalizedProductEnvelopeSchema.parse(input.product);
    const product = source.product;
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
        snapshotHash: input.snapshotHash,
        normalizerVersion: input.normalizerVersion,
      },
    });

    return toDomain(record);
  }

  public async findById(id: string): Promise<ProductSnapshot | null> {
    const record = await this.prisma.productSnapshot.findUnique({ where: { id } });
    return record === null ? null : toDomain(record);
  }
}

function toDomain(record: PrismaProductSnapshot): ProductSnapshot {
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

  return {
    id: record.id,
    product,
    snapshotHash: record.snapshotHash,
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
