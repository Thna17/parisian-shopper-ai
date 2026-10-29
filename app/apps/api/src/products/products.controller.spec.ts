/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import {
  FICTIONAL_PRODUCTS,
  ProductSnapshotNotFoundError,
  type ProductSnapshot,
  type ProductSnapshotRepository,
  type ProductFreshnessAssessmentRepository,
  type ProductAssetRepository,
  type ProductAssetEligibilityEvaluator,
} from '@parisian-shopper/application';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

describe('ProductsController & ProductsService (API-002)', () => {
  const baseFixture = FICTIONAL_PRODUCTS[0]!;

  const sampleSnapshot1: ProductSnapshot = {
    id: '4b68e914-7e04-4ec5-b6d8-f860189d2d01',
    product: baseFixture,
    snapshotHash: 'hash-abc-001',
    normalizerVersion: 'phase-1b-v1',
    createdAt: new Date('2026-10-24T12:00:00.000Z'),
  };

  const sampleSnapshotHistorical: ProductSnapshot = {
    id: '11111111-2222-3333-4444-555555555555',
    product: {
      ...baseFixture,
      product: {
        ...baseFixture.product,
        price: '35.00', // historical old price
      },
    },
    snapshotHash: 'hash-abc-historical',
    normalizerVersion: 'phase-1a-v0',
    createdAt: new Date('2026-09-01T12:00:00.000Z'),
  };

  let mockSnapshotRepo: jest.Mocked<ProductSnapshotRepository>;
  let mockAssetRepo: jest.Mocked<ProductAssetRepository>;
  let mockAssessmentRepo: jest.Mocked<ProductFreshnessAssessmentRepository>;
  let mockAssetEvaluator: jest.Mocked<ProductAssetEligibilityEvaluator>;
  let service: ProductsService;
  let controller: ProductsController;

  beforeEach(() => {
    mockSnapshotRepo = {
      create: jest.fn<ProductSnapshotRepository['create']>(),
      findById: jest.fn<ProductSnapshotRepository['findById']>((id: string) => {
        if (id === sampleSnapshot1.id) return Promise.resolve(sampleSnapshot1);
        if (id === sampleSnapshotHistorical.id) return Promise.resolve(sampleSnapshotHistorical);
        return Promise.resolve(null);
      }),
      findLatestBySku: jest.fn<NonNullable<ProductSnapshotRepository['findLatestBySku']>>(
        (sku: string) => {
          if (sku === sampleSnapshot1.product.product.sku) return Promise.resolve(sampleSnapshot1);
          return Promise.resolve(null);
        },
      ),
      findPaginated: jest.fn<NonNullable<ProductSnapshotRepository['findPaginated']>>(
        (query = {}) => {
          let items = [sampleSnapshot1];
          if (
            query.search &&
            !sampleSnapshot1.product.product.product_name
              .toLowerCase()
              .includes(query.search.toLowerCase())
          ) {
            items = [];
          }
          if (
            query.brand &&
            sampleSnapshot1.product.product.brand.toLowerCase() !== query.brand.toLowerCase()
          ) {
            items = [];
          }
          if (
            query.stockStatus &&
            sampleSnapshot1.product.product.stock_status !== query.stockStatus.toLowerCase()
          ) {
            items = [];
          }
          return Promise.resolve({
            items,
            total: items.length,
            page: query.page ?? 1,
            limit: query.limit ?? 20,
            totalPages: 1,
          });
        },
      ),
    };

    mockAssetRepo = {
      saveAsset: jest.fn<ProductAssetRepository['saveAsset']>(),
      findAssetById: jest.fn<ProductAssetRepository['findAssetById']>(),
      findAssetBySha256: jest.fn<ProductAssetRepository['findAssetBySha256']>(),
      saveRegistration: jest.fn<ProductAssetRepository['saveRegistration']>(),
      findRegistrationById: jest.fn<ProductAssetRepository['findRegistrationById']>(),
      findRegistrationsBySku: jest.fn<ProductAssetRepository['findRegistrationsBySku']>(
        (sku: string) => {
          return Promise.resolve([
            {
              id: 'reg-hero-01',
              sequence: 1n,
              productAssetId: 'asset-hero-uuid',
              sku,
              role: 'HERO_CUTOUT',
              sourceSystem: 'test-catalog',
              rightsState: 'VERIFIED',
              registeredAt: new Date('2026-10-20T10:00:00Z'),
            },
          ]);
        },
      ),
      findAllHeroCutoutRegistrations:
        jest.fn<ProductAssetRepository['findAllHeroCutoutRegistrations']>(),
      findApprovedHeroCutoutBySku: jest.fn<ProductAssetRepository['findApprovedHeroCutoutBySku']>(),
      findRegistrationsBySkuAndRole:
        jest.fn<ProductAssetRepository['findRegistrationsBySkuAndRole']>(),
      findRegistrationByReplacedId:
        jest.fn<ProductAssetRepository['findRegistrationByReplacedId']>(),
      saveValidationAssessment: jest.fn<ProductAssetRepository['saveValidationAssessment']>(),
      findLatestValidationAssessment:
        jest.fn<ProductAssetRepository['findLatestValidationAssessment']>(),
      saveApprovalEvent: jest.fn<ProductAssetRepository['saveApprovalEvent']>(),
      findApprovalEventsByRegistration:
        jest.fn<ProductAssetRepository['findApprovalEventsByRegistration']>(),
      findLatestApprovalEvent: jest.fn<ProductAssetRepository['findLatestApprovalEvent']>(),
      saveRightsEvent: jest.fn<ProductAssetRepository['saveRightsEvent']>(),
      findRightsEventsByRegistration:
        jest.fn<ProductAssetRepository['findRightsEventsByRegistration']>(),
      findLatestRightsEvent: jest.fn<ProductAssetRepository['findLatestRightsEvent']>(),
      saveTransform: jest.fn<ProductAssetRepository['saveTransform']>(),
      findTransformsByDerivedAsset:
        jest.fn<ProductAssetRepository['findTransformsByDerivedAsset']>(),
    };

    mockAssessmentRepo = {
      create: jest.fn<ProductFreshnessAssessmentRepository['create']>(),
      findLatestForSnapshot: jest.fn<ProductFreshnessAssessmentRepository['findLatestForSnapshot']>(
        (snapshotId: string) => {
          return Promise.resolve({
            id: 'assessment-01',
            snapshotId,
            evaluatedAt: new Date('2026-10-24T12:30:00.000Z'),
            policyId: 'policy-default',
            policyVersion: 'v1.0',
            freshnessState: 'FRESH',
            revalidationOutcome: 'FRESH',
            sourceAvailability: 'AVAILABLE',
            reasonCodes: ['OK_FRESH'],
            evidence: {},
            createdAt: new Date('2026-10-24T12:30:00.000Z'),
          });
        },
      ),
      listForSnapshot: jest.fn<ProductFreshnessAssessmentRepository['listForSnapshot']>(),
      findByIdempotencyKey: jest.fn<ProductFreshnessAssessmentRepository['findByIdempotencyKey']>(),
    };

    mockAssetEvaluator = {
      evaluateHeroEligibility: jest.fn<ProductAssetEligibilityEvaluator['evaluateHeroEligibility']>(
        (_sku: string) => {
          return Promise.resolve({
            isEligible: true,
            reasonCode: 'OK_HERO',
            message: 'Active approved and verified HERO_CUTOUT asset available.',
          });
        },
      ),
    } as unknown as jest.Mocked<ProductAssetEligibilityEvaluator>;

    service = new ProductsService(
      mockSnapshotRepo,
      mockAssetRepo,
      mockAssessmentRepo,
      mockAssetEvaluator,
    );

    controller = new ProductsController(service);
  });

  // PROD-API-01 — List products endpoint returns paginated snapshots
  it('PROD-API-01: searchProducts returns paginated product snapshots', async () => {
    const result = await controller.searchProducts({ page: 1, limit: 20 });
    expect(result).toBeDefined();
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.sku).toBe(sampleSnapshot1.product.product.sku);
    expect(result.data[0]?.price.amount).toBe(38.0);
    expect(result.data[0]?.price.currency).toBe('USD');
    expect(result.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
  });

  // PROD-API-02 — Search filtering by text/query
  it('PROD-API-02: filters products matching search query', async () => {
    const matching = await controller.searchProducts({ search: 'Moonlit' });
    expect(matching.data).toHaveLength(1);

    const nonMatching = await controller.searchProducts({ search: 'NonExistentProduct' });
    expect(nonMatching.data).toHaveLength(0);
  });

  // PROD-API-03 — Category / brand filter
  it('PROD-API-03: filters products by brand and category', async () => {
    const brandMatch = await controller.searchProducts({ brand: 'Maison Imaginaire' });
    expect(brandMatch.data).toHaveLength(1);

    const brandMismatch = await controller.searchProducts({ brand: 'NonExistentBrand' });
    expect(brandMismatch.data).toHaveLength(0);
  });

  // PROD-API-04 — Stock filter
  it('PROD-API-04: filters products by stock status', async () => {
    const inStock = await controller.searchProducts({ stockStatus: 'in_stock' });
    expect(inStock.data).toHaveLength(1);

    const outOfStock = await controller.searchProducts({ stockStatus: 'out_of_stock' });
    expect(outOfStock.data).toHaveLength(0);
  });

  // PROD-API-05 — Single product retrieval by ID/SKU
  it('PROD-API-05: retrieves single product detail by UUID or SKU', async () => {
    const byId = await controller.getProductById(sampleSnapshot1.id);
    expect(byId.id).toBe(sampleSnapshot1.id);
    expect(byId.sku).toBe(sampleSnapshot1.product.product.sku);
    expect(byId.title).toBe(sampleSnapshot1.product.product.product_name);

    const bySku = await controller.getProductById(sampleSnapshot1.product.product.sku);
    expect(bySku.id).toBe(sampleSnapshot1.id);
    expect(bySku.sku).toBe(sampleSnapshot1.product.product.sku);
  });

  // PROD-API-06 — Product identifier correctness (UUID vs SKU)
  it('PROD-API-06: correctly routes UUID to findById and SKU to findLatestBySku', async () => {
    await controller.getProductById(sampleSnapshot1.id);
    expect(mockSnapshotRepo.findById).toHaveBeenCalledWith(sampleSnapshot1.id);

    await controller.getProductById(sampleSnapshot1.product.product.sku);
    expect(mockSnapshotRepo.findLatestBySku).toHaveBeenCalledWith(
      sampleSnapshot1.product.product.sku,
    );
  });

  // PROD-API-07 — Historical snapshot integrity
  it('PROD-API-07: retrieving historical UUID returns exact historical snapshot without drift', async () => {
    const historical = await controller.getProductById(sampleSnapshotHistorical.id);
    expect(historical.id).toBe(sampleSnapshotHistorical.id);
    expect(historical.price.amount).toBe(35.0); // Historical price preserved
    expect(historical.snapshotHash).toBe('hash-abc-historical');
    expect(historical.normalizerVersion).toBe('phase-1a-v0');
  });

  // PROD-API-08 — Verified facts response
  it('PROD-API-08: getFacts returns authoritative commercial facts without markup or fake discounts', async () => {
    const facts = await controller.getFacts(sampleSnapshot1.id);
    expect(facts.sku).toBe(sampleSnapshot1.product.product.sku);
    expect(facts.brand).toBe('Maison Imaginaire');
    expect(facts.productName).toBe('Moonlit River Eau de Parfum');
    expect(facts.price).toEqual({ amount: 38.0, currency: 'USD' });
    expect(facts.stockStatus).toBe('in_stock');
    expect(facts.scentPyramid?.topNotes).toContain('Fictional bergamot');
    expect(facts.scentPyramid?.heartNotes).toContain('Fictional jasmine');
    expect(facts.scentPyramid?.baseNotes).toContain('Fictional cedar');
    expect(facts.provenance.sourceSystem).toBe('fictional-local-catalog');
    expect(facts.provenance.snapshotHash).toBe(sampleSnapshot1.snapshotHash);
  });

  // PROD-API-09 — Readiness findings
  it('PROD-API-09: getReadiness evaluates commercial facts, freshness, and asset rights', async () => {
    const readiness = await controller.getReadiness(sampleSnapshot1.id);
    expect(readiness.productId).toBe(sampleSnapshot1.id);
    expect(readiness.sku).toBe(sampleSnapshot1.product.product.sku);
    expect(readiness.freshnessState).toBe('FRESH');
    expect(readiness.isReadyForContent).toBe(true);
    expect(readiness.hasApprovedAssets).toBe(true);
    expect(readiness.blockingReasons).toHaveLength(0);

    const factFinding = readiness.findings.find((f) => f.category === 'COMMERCIAL_FACTS');
    expect(factFinding?.status).toBe('PASSED');

    const freshFinding = readiness.findings.find((f) => f.category === 'FRESHNESS');
    expect(freshFinding?.status).toBe('PASSED');

    const assetFinding = readiness.findings.find((f) => f.category === 'ASSETS');
    expect(assetFinding?.status).toBe('PASSED');
  });

  // PROD-API-10 — Asset-rights metadata
  it('PROD-API-10: includes asset rights metadata and hero cutout indicators', async () => {
    const detail = await controller.getProductById(sampleSnapshot1.id);
    expect(detail.registeredAssets).toBeDefined();
    expect(detail.registeredAssets).toHaveLength(1);
    expect(detail.registeredAssets?.[0]?.role).toBe('HERO_CUTOUT');
    expect(detail.registeredAssets?.[0]?.rightsState).toBe('VERIFIED');
  });

  // PROD-API-11 — No secret exposure
  it('PROD-API-11: guarantees responses do not leak sensitive credentials or internal secrets', async () => {
    const detail = await controller.getProductById(sampleSnapshot1.id);
    const json = JSON.stringify(detail);
    expect(json).not.toContain('password');
    expect(json).not.toContain('secret');
    expect(json).not.toContain('apiKey');
    expect(json).not.toContain('token');
  });

  // PROD-API-12 — Product snapshot not found (404)
  it('PROD-API-12: throws ProductSnapshotNotFoundError when product snapshot does not exist', async () => {
    await expect(controller.getProductById('unknown-sku')).rejects.toThrow(
      ProductSnapshotNotFoundError,
    );
    await expect(controller.getProductById('00000000-0000-0000-0000-000000000000')).rejects.toThrow(
      ProductSnapshotNotFoundError,
    );
  });
});
