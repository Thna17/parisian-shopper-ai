import { Injectable } from '@nestjs/common';
import {
  calculateProductDependencyHashes,
  type ProductRevalidationUnitOfWork,
  type RevalidationUnitOfWorkInput,
  type RevalidationUnitOfWorkResult,
} from '@parisian-shopper/application';
import { type Prisma } from '@prisma/client';

import { PrismaService } from '../prisma.service.js';
import { toAssessmentDomain } from './prisma-product-freshness-assessment.repository.js';
import { toSnapshotDomain } from './prisma-product-snapshot.repository.js';

@Injectable()
export class PrismaProductRevalidationUnitOfWork implements ProductRevalidationUnitOfWork {
  public constructor(private readonly prisma: PrismaService) {}

  public async execute(input: RevalidationUnitOfWorkInput): Promise<RevalidationUnitOfWorkResult> {
    return this.prisma.$transaction(async (tx) => {
      let finalSnapshot = input.currentSnapshot;
      let isNewSnapshotCreated = false;

      if (input.newSnapshotInput) {
        const source = input.newSnapshotInput.product;
        const hashes =
          input.newSnapshotInput.dependencyHashes ?? calculateProductDependencyHashes(source);

        const snapshotRecord = await tx.productSnapshot.create({
          data: {
            sku: source.product.sku,
            productName: source.product.product_name,
            brand: source.product.brand,
            category: source.product.category,
            price: source.product.price,
            currency: source.product.currency,
            promoPrice: source.product.promo_price ?? null,
            discount: (source.product.discount ?? null) as Prisma.InputJsonValue,
            description: source.product.description ?? null,
            images: (source.product.images ?? null) as Prisma.InputJsonValue,
            stockStatus: source.product.stock_status,
            productUrl: source.product.product_url ?? null,
            fragranceNotes: (source.product.fragrance_notes ?? null) as Prisma.InputJsonValue,
            concentration: (source.product.concentration ?? null) as Prisma.InputJsonValue,
            size: (source.product.size ?? null) as Prisma.InputJsonValue,
            countryOfOrigin: (source.product.country_of_origin ?? null) as Prisma.InputJsonValue,
            similarityClaims: (source.product.similarity_claims ?? null) as Prisma.InputJsonValue,
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
            normalizerVersion: input.newSnapshotInput.normalizerVersion,
          },
        });
        finalSnapshot = toSnapshotDomain(snapshotRecord);
        isNewSnapshotCreated = true;
      }

      const assessmentInput = input.assessment(finalSnapshot.id);
      const assessmentRecord = await tx.productFreshnessAssessment.create({
        data: {
          snapshotId: assessmentInput.snapshotId,
          evaluatedAt: assessmentInput.evaluatedAt,
          policyId: assessmentInput.policyId,
          policyVersion: assessmentInput.policyVersion,
          freshnessState: assessmentInput.freshnessState,
          revalidationOutcome: assessmentInput.revalidationOutcome,
          sourceAvailability: assessmentInput.sourceAvailability,
          reasonCodes: [...assessmentInput.reasonCodes],
          evidence: assessmentInput.evidence as Prisma.InputJsonValue,
          comparedSnapshotId: assessmentInput.comparedSnapshotId ?? null,
          actorUserId: assessmentInput.actorUserId ?? null,
          idempotencyKey: assessmentInput.idempotencyKey ?? null,
        },
      });

      const finalAssessment = toAssessmentDomain(assessmentRecord);

      const outboxEvents = input.outboxEvents({
        snapshot: finalSnapshot,
        assessment: finalAssessment,
      });

      for (const event of outboxEvents) {
        await tx.outboxEvent.create({
          data: {
            topic: event.topic,
            schemaVersion: event.schemaVersion,
            idempotencyKey: event.idempotencyKey,
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId ?? null,
            payload: event.payload as Prisma.InputJsonValue,
            occurredAt: event.occurredAt,
            availableAt: event.availableAt,
          },
        });
      }

      return {
        snapshot: finalSnapshot,
        isNewSnapshotCreated,
        assessment: finalAssessment,
      };
    });
  }
}
