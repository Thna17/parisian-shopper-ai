import { Inject, Injectable, Optional } from '@nestjs/common';
import { APPLICATION_LOGGER, type ApplicationLogger } from '@parisian-shopper/common';
import {
  PRODUCT_ASSET_ELIGIBILITY_EVALUATOR,
  PRODUCT_ASSET_REPOSITORY,
  PRODUCT_FRESHNESS_ASSESSMENT_REPOSITORY,
  PRODUCT_SNAPSHOT_REPOSITORY,
  ProductAssetEligibilityEvaluator,
  type ProductAssetRepository,
  type ProductFreshnessAssessmentRepository,
  ProductSnapshotNotFoundError,
  type ProductSnapshot,
  type ProductSnapshotRepository,
} from '@parisian-shopper/application';
import { ListProductsQueryDto } from './dto/list-products-query.dto.js';
import {
  type PaginatedProductsResponseDto,
  type ProductDetailDto,
  type ProductReadinessFinding,
  type ProductReadinessResponseDto,
  type ProductSummaryDto,
  type ScentPyramidDto,
  type VerifiedProductFactsDto,
} from './dto/product-response.dto.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class ProductsService {
  public constructor(
    @Inject(PRODUCT_SNAPSHOT_REPOSITORY)
    private readonly snapshotRepo: ProductSnapshotRepository,
    @Optional()
    @Inject(PRODUCT_ASSET_REPOSITORY)
    private readonly assetRepo?: ProductAssetRepository,
    @Optional()
    @Inject(PRODUCT_FRESHNESS_ASSESSMENT_REPOSITORY)
    private readonly assessmentRepo?: ProductFreshnessAssessmentRepository,
    @Optional()
    @Inject(PRODUCT_ASSET_ELIGIBILITY_EVALUATOR)
    private readonly assetEvaluator?: ProductAssetEligibilityEvaluator,
    @Inject(APPLICATION_LOGGER)
    private readonly logger?: ApplicationLogger,
  ) {}

  public async listProducts(query: ListProductsQueryDto): Promise<PaginatedProductsResponseDto> {
    const search = (query.search ?? query.q ?? '').trim();
    const brand = query.brand?.trim();
    const category = query.category?.trim();
    const stockStatus = query.stockStatus?.trim();
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));

    if (this.snapshotRepo.findPaginated) {
      const paginated = await this.snapshotRepo.findPaginated({
        search: search || undefined,
        brand: brand || undefined,
        category: category || undefined,
        stockStatus: stockStatus || undefined,
        page,
        limit,
      });

      const data = paginated.items.map((snapshot) => this.toSummaryDto(snapshot));

      return {
        data,
        pagination: {
          page: paginated.page,
          limit: paginated.limit,
          total: paginated.total,
          totalPages: paginated.totalPages,
        },
      };
    }

    // Fallback if repository doesn't have custom paginated query
    return {
      data: [],
      pagination: {
        page,
        limit,
        total: 0,
        totalPages: 1,
      },
    };
  }

  public async getProductById(idOrSku: string): Promise<ProductDetailDto> {
    const snapshot = await this.resolveSnapshot(idOrSku);
    const product = snapshot.product.product;
    const sku = product.sku;

    // Look up registered assets if asset repo available
    let registeredAssets: ProductDetailDto['registeredAssets'];
    let heroAssetRegistered = false;

    if (this.assetRepo) {
      try {
        const registrations = await this.assetRepo.findRegistrationsBySku(sku);
        registeredAssets = registrations.map((r) => {
          if (r.role === 'HERO_CUTOUT') {
            heroAssetRegistered = true;
          }
          return {
            id: r.id,
            role: r.role,
            rightsState: r.rightsState,
            rightsNotes: r.rightsNotes ?? null,
            rightsExpiresAt: r.rightsExpiresAt ? r.rightsExpiresAt.toISOString() : null,
          };
        });
      } catch {
        registeredAssets = [];
      }
    }

    const images: ProductDetailDto['images'] = (product.images ?? []).map((img, idx) => ({
      url: img.url,
      role: img.role,
      altText: img.alt_text ?? `${product.brand} ${product.product_name}`,
      rightsState: 'VERIFIED',
      isHeroCutout: img.role === 'primary' && heroAssetRegistered && idx === 0,
    }));

    const scentPyramid = this.extractScentPyramid(product.fragrance_notes);

    return {
      id: snapshot.id,
      sku: product.sku,
      brand: product.brand,
      title: product.product_name,
      category: product.category,
      description: product.description ?? null,
      price: {
        amount: parseFloat(product.price) || 0,
        currency: product.currency,
      },
      promoPrice: product.promo_price
        ? {
            amount: parseFloat(product.promo_price) || 0,
            currency: product.currency,
          }
        : null,
      stockStatus: product.stock_status,
      lifecycleStatus: snapshot.product.lifecycle_status,
      productUrl: product.product_url ?? null,
      capturedAt: snapshot.createdAt.toISOString(),
      sourceUpdatedAt: snapshot.product.source_updated_at,
      snapshotHash: snapshot.snapshotHash,
      normalizerVersion: snapshot.normalizerVersion,
      provenance: {
        sourceSystem: snapshot.product.source_system,
        sourceRecordId: snapshot.product.source_record_id ?? null,
        sourceVersion: snapshot.product.source_version ?? null,
        retrievedAt: snapshot.product.retrieved_at,
      },
      specs: {
        concentration: product.concentration?.label ?? product.concentration?.code ?? null,
        size:
          product.size?.display ??
          (product.size ? `${product.size.value} ${product.size.unit}` : null),
        countryOfOrigin: product.country_of_origin?.name ?? product.country_of_origin?.code ?? null,
        gender: null,
      },
      scentPyramid,
      similarityClaims: (product.similarity_claims ?? []).map((c) => ({
        claimId: c.claim_id,
        text: c.text,
        status: c.status,
      })),
      images,
      registeredAssets,
    };
  }

  public async getProductReadiness(idOrSku: string): Promise<ProductReadinessResponseDto> {
    const snapshot = await this.resolveSnapshot(idOrSku);
    const sku = snapshot.product.product.sku;
    const findings: ProductReadinessFinding[] = [];
    const blockingReasons: string[] = [];

    // 1. Commercial Facts Check
    const priceAmount = parseFloat(snapshot.product.product.price);
    if (!Number.isFinite(priceAmount) || priceAmount <= 0) {
      findings.push({
        category: 'COMMERCIAL_FACTS',
        status: 'BLOCKED',
        message: 'Invalid or missing retail price in snapshot.',
        code: 'PRICE_INVALID',
      });
      blockingReasons.push('PRICE_INVALID');
    } else {
      findings.push({
        category: 'COMMERCIAL_FACTS',
        status: 'PASSED',
        message: `Verified retail price of ${snapshot.product.product.currency} ${snapshot.product.product.price} recorded.`,
      });
    }

    if (snapshot.product.product.stock_status === 'out_of_stock') {
      findings.push({
        category: 'COMMERCIAL_FACTS',
        status: 'WARNING',
        message: 'Product is currently marked out of stock.',
        code: 'OUT_OF_STOCK',
      });
    }

    // 2. Freshness Assessment Check
    let freshnessState: ProductReadinessResponseDto['freshnessState'] = 'UNASSESSED';
    let lastAssessedAt: string | null = null;

    if (this.assessmentRepo) {
      try {
        const assessment = await this.assessmentRepo.findLatestForSnapshot(snapshot.id);
        if (assessment) {
          lastAssessedAt = assessment.evaluatedAt.toISOString();
          freshnessState =
            assessment.freshnessState as ProductReadinessResponseDto['freshnessState'];

          if (assessment.freshnessState === 'FRESH') {
            findings.push({
              category: 'FRESHNESS',
              status: 'PASSED',
              message: 'Product facts are verified fresh within policy TTL.',
            });
          } else if (assessment.freshnessState === 'AGING') {
            findings.push({
              category: 'FRESHNESS',
              status: 'WARNING',
              message:
                'Product facts are aging. Revalidation recommended prior to final publishing.',
              code: 'FACTS_AGING',
            });
          } else if (assessment.freshnessState === 'STALE') {
            findings.push({
              category: 'FRESHNESS',
              status: 'BLOCKED',
              message: 'Product facts are stale. Revalidation required.',
              code: 'FACTS_STALE',
            });
            blockingReasons.push('FACTS_STALE');
          } else {
            findings.push({
              category: 'FRESHNESS',
              status: 'BLOCKED',
              message: 'Product facts have been evaluated as invalid.',
              code: 'FACTS_INVALID',
            });
            blockingReasons.push('FACTS_INVALID');
          }
        } else {
          findings.push({
            category: 'FRESHNESS',
            status: 'WARNING',
            message: 'No freshness assessment recorded yet for this snapshot.',
            code: 'FRESHNESS_UNASSESSED',
          });
        }
      } catch (err) {
        this.logger?.warn('Failed to query freshness assessment', { err, sku });
      }
    }

    // 3. Asset Rights & Hero Eligibility Check
    let hasApprovedAssets = false;
    let assetCount: number;

    if (this.assetEvaluator) {
      try {
        const heroResult = await this.assetEvaluator.evaluateHeroEligibility(sku);
        hasApprovedAssets = heroResult.isEligible;

        if (heroResult.isEligible) {
          findings.push({
            category: 'ASSETS',
            status: 'PASSED',
            message: 'Active approved and verified HERO_CUTOUT asset available.',
          });
        } else {
          findings.push({
            category: 'ASSETS',
            status: 'WARNING',
            message: heroResult.message ?? 'Hero cutout asset not approved or verified.',
            code: heroResult.reasonCode ?? 'HERO_ASSET_INELIGIBLE',
          });
        }
      } catch (err) {
        this.logger?.warn('Failed to evaluate hero asset eligibility', { err, sku });
      }
    }

    if (this.assetRepo) {
      try {
        const registrations = await this.assetRepo.findRegistrationsBySku(sku);
        assetCount = registrations.length;
      } catch {
        assetCount = snapshot.product.product.images?.length ?? 0;
      }
    } else {
      assetCount = snapshot.product.product.images?.length ?? 0;
    }

    const isReadyForContent = blockingReasons.length === 0;

    return {
      productId: snapshot.id,
      sku,
      freshnessState,
      isReadyForContent,
      hasApprovedAssets,
      assetCount,
      lastAssessedAt,
      blockingReasons,
      findings,
    };
  }

  public async getProductFacts(idOrSku: string): Promise<VerifiedProductFactsDto> {
    const snapshot = await this.resolveSnapshot(idOrSku);
    const product = snapshot.product.product;
    const scentPyramid = this.extractScentPyramid(product.fragrance_notes);

    return {
      productId: snapshot.id,
      sku: product.sku,
      brand: product.brand,
      productName: product.product_name,
      category: product.category,
      price: {
        amount: parseFloat(product.price) || 0,
        currency: product.currency,
      },
      promoPrice: product.promo_price
        ? {
            amount: parseFloat(product.promo_price) || 0,
            currency: product.currency,
          }
        : null,
      stockStatus: product.stock_status,
      description: product.description ?? null,
      specifications: {
        concentration: product.concentration?.label ?? product.concentration?.code ?? null,
        size:
          product.size?.display ??
          (product.size ? `${product.size.value} ${product.size.unit}` : null),
        countryOfOrigin: product.country_of_origin?.name ?? product.country_of_origin?.code ?? null,
        similarityClaims: (product.similarity_claims ?? []).map((c) => c.text),
      },
      scentPyramid,
      provenance: {
        sourceSystem: snapshot.product.source_system,
        sourceRecordId: snapshot.product.source_record_id ?? null,
        retrievedAt: snapshot.product.retrieved_at,
        sourceUpdatedAt: snapshot.product.source_updated_at,
        snapshotHash: snapshot.snapshotHash,
        normalizerVersion: snapshot.normalizerVersion,
      },
    };
  }

  private async resolveSnapshot(idOrSku: string): Promise<ProductSnapshot> {
    const trimmed = idOrSku.trim();
    if (UUID_REGEX.test(trimmed)) {
      const byId = await this.snapshotRepo.findById(trimmed);
      if (byId) {
        return byId;
      }
    }

    if (this.snapshotRepo.findLatestBySku) {
      const bySku = await this.snapshotRepo.findLatestBySku(trimmed);
      if (bySku) {
        return bySku;
      }
    }

    throw new ProductSnapshotNotFoundError(trimmed);
  }

  private toSummaryDto(snapshot: ProductSnapshot): ProductSummaryDto {
    const p = snapshot.product.product;
    const primaryImg = p.images?.find((img) => img.role === 'primary') ?? p.images?.[0];

    return {
      id: snapshot.id,
      sku: p.sku,
      brand: p.brand,
      title: p.product_name,
      category: p.category,
      price: {
        amount: parseFloat(p.price) || 0,
        currency: p.currency,
      },
      promoPrice: p.promo_price
        ? {
            amount: parseFloat(p.promo_price) || 0,
            currency: p.currency,
          }
        : null,
      stockStatus: p.stock_status,
      lifecycleStatus: snapshot.product.lifecycle_status,
      primaryImageUrl: primaryImg?.url ?? null,
      capturedAt: snapshot.createdAt.toISOString(),
    };
  }

  private extractScentPyramid(
    fragranceNotes?: { top?: string[]; heart?: string[]; base?: string[] } | null,
  ): ScentPyramidDto | null {
    if (!fragranceNotes) {
      return null;
    }

    const top = fragranceNotes.top ?? [];
    const heart = fragranceNotes.heart ?? [];
    const base = fragranceNotes.base ?? [];

    if (top.length === 0 && heart.length === 0 && base.length === 0) {
      return null;
    }

    return {
      topNotes: top,
      heartNotes: heart,
      baseNotes: base,
    };
  }
}
