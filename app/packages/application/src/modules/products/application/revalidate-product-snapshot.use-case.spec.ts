import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { type ApplicationLogger, FakeClock, ForbiddenError } from '@parisian-shopper/common';

import { PermissionService, RoleCode } from '../../auth/domain/permissions.js';
import {
  createDevelopmentFreshnessPolicy,
  type FreshnessPolicy,
  type FreshnessPolicyRepository,
} from '../domain/freshness-policy.js';
import {
  FreshnessReasonCode,
  FreshnessState,
  RevalidationOutcome,
  SourceAvailability,
} from '../domain/freshness-state.js';
import {
  FreshnessPolicyMissingError,
  ProductSnapshotNotFoundError,
  ProductSourceUnavailableError,
} from '../domain/product-errors.js';
import { type NormalizedProductEnvelope } from '../domain/product.schema.js';
import { FICTIONAL_PRODUCTS } from '../testing/fictional-products.js';
import {
  PRODUCT_NORMALIZER_VERSION,
  type CreateProductSnapshotRecord,
  type ProductSnapshot,
  type ProductSnapshotRepository,
} from './product-snapshot.repository.js';
import { calculateProductDependencyHashes } from './product-snapshot-hash.js';
import {
  type CreateFreshnessAssessmentInput,
  type ProductFreshnessAssessment,
  type ProductFreshnessAssessmentRepository,
} from './product-freshness-assessment.repository.js';
import {
  type ProductRevalidationUnitOfWork,
  type RevalidationOutboxDraft,
  type RevalidationUnitOfWorkInput,
} from './product-revalidation-unit-of-work.port.js';
import { type ProductSource } from './product-source.port.js';
import {
  buildRevalidationIdempotencyKey,
  RevalidateProductSnapshotUseCase,
} from './revalidate-product-snapshot.use-case.js';

describe('RevalidateProductSnapshotUseCase', () => {
  let fakeClock: FakeClock;
  let logger: ApplicationLogger;
  let permissionService: PermissionService;
  let snapshotRepo: ProductSnapshotRepository & { snapshots: ProductSnapshot[] };
  let assessmentRepo: ProductFreshnessAssessmentRepository & {
    assessments: ProductFreshnessAssessment[];
  };
  let policyRepo: FreshnessPolicyRepository;
  let getBySkuMock: jest.Mock<ProductSource['getBySku']>;
  let productSource: ProductSource;
  let unitOfWork: ProductRevalidationUnitOfWork;
  let outboxEvents: RevalidationOutboxDraft[];

  const initialDate = new Date('2026-10-18T12:00:00.000Z');
  const baseEnvelope: NormalizedProductEnvelope = FICTIONAL_PRODUCTS[0]!;

  const createInitialSnapshot = (
    overrides?: Partial<NormalizedProductEnvelope>,
  ): ProductSnapshot => {
    const envelope = {
      ...baseEnvelope,
      retrieved_at: initialDate.toISOString(),
      source_updated_at: initialDate.toISOString(),
      ...overrides,
    };
    const hashes = calculateProductDependencyHashes(envelope);
    return {
      id: 'snap-001',
      product: envelope,
      snapshotHash: hashes.full,
      dependencyHashes: hashes,
      normalizerVersion: PRODUCT_NORMALIZER_VERSION,
      createdAt: initialDate,
    };
  };

  beforeEach(() => {
    fakeClock = new FakeClock(initialDate);
    outboxEvents = [];

    logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    permissionService = new PermissionService();

    const initialSnapshot = createInitialSnapshot();
    const snapshotsList: ProductSnapshot[] = [initialSnapshot];

    snapshotRepo = {
      snapshots: snapshotsList,
      create: jest.fn((input: CreateProductSnapshotRecord) => {
        const created: ProductSnapshot = {
          id: `snap-${snapshotsList.length + 1}`,
          ...input,
          createdAt: fakeClock.now(),
        };
        snapshotsList.push(created);
        return Promise.resolve(created);
      }),
      findById: jest.fn((id: string) =>
        Promise.resolve(snapshotsList.find((s) => s.id === id) ?? null),
      ),
      findLatestBySku: jest.fn((sku: string) =>
        Promise.resolve(snapshotsList.filter((s) => s.product.product.sku === sku).pop() ?? null),
      ),
    };

    const assessmentsList: ProductFreshnessAssessment[] = [];
    assessmentRepo = {
      assessments: assessmentsList,
      create: jest.fn((input: CreateFreshnessAssessmentInput) => {
        const created: ProductFreshnessAssessment = {
          id: `asmt-${assessmentsList.length + 1}`,
          ...input,
          createdAt: fakeClock.now(),
        };
        assessmentsList.push(created);
        return Promise.resolve(created);
      }),
      findByIdempotencyKey: jest.fn((key: string) =>
        Promise.resolve(assessmentsList.find((a) => a.idempotencyKey === key) ?? null),
      ),
      findLatestForSnapshot: jest.fn((snapshotId: string) =>
        Promise.resolve(assessmentsList.filter((a) => a.snapshotId === snapshotId).pop() ?? null),
      ),
      listForSnapshot: jest.fn((snapshotId: string) =>
        Promise.resolve(assessmentsList.filter((a) => a.snapshotId === snapshotId)),
      ),
    };

    const devPolicy = createDevelopmentFreshnessPolicy('development');
    const testPolicy = createDevelopmentFreshnessPolicy('test');

    policyRepo = {
      findActivePolicy: jest.fn((env: string) => {
        if (env === 'development') return Promise.resolve(devPolicy);
        if (env === 'test') return Promise.resolve(testPolicy);
        return Promise.resolve(null); // Production has no approved policy yet (W03-DEC-002)
      }),
      findByPolicyId: jest.fn(() => Promise.resolve(devPolicy)),
      create: jest.fn((p: FreshnessPolicy) => Promise.resolve(p)),
    };

    getBySkuMock = jest.fn<ProductSource['getBySku']>();
    productSource = {
      adapterName: 'mock-source',
      getBySku: getBySkuMock,
      search: jest.fn<ProductSource['search']>().mockResolvedValue({ items: [] }),
    };

    unitOfWork = {
      execute: jest.fn(async (input: RevalidationUnitOfWorkInput) => {
        let finalSnapshot = input.currentSnapshot;
        let isNewSnapshotCreated = false;

        if (input.newSnapshotInput) {
          finalSnapshot = await snapshotRepo.create(input.newSnapshotInput);
          isNewSnapshotCreated = true;
        }

        const assessmentInput = input.assessment(finalSnapshot.id);
        const assessment = await assessmentRepo.create(assessmentInput);

        const events = input.outboxEvents({ snapshot: finalSnapshot, assessment });
        for (const ev of events) {
          outboxEvents.push(ev);
        }

        return {
          snapshot: finalSnapshot,
          isNewSnapshotCreated,
          assessment,
        };
      }),
    };
  });

  const createUseCase = (): RevalidateProductSnapshotUseCase =>
    new RevalidateProductSnapshotUseCase(
      snapshotRepo,
      assessmentRepo,
      policyRepo,
      productSource,
      unitOfWork,
      logger,
      fakeClock,
      permissionService,
    );

  describe('1. Security and Authorization', () => {
    it('throws ForbiddenError if actor lacks CREATE_CONTENT or EDIT_CREATIVE permissions', async () => {
      const useCase = createUseCase();

      await expect(
        useCase.execute({
          snapshotId: 'snap-001',
          actor: { userId: 'user-viewer', roles: [RoleCode.VIEWER] },
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('permits MARKETING_EDITOR to execute revalidation', async () => {
      const useCase = createUseCase();
      getBySkuMock.mockResolvedValue(baseEnvelope);

      const result = await useCase.execute({
        snapshotId: 'snap-001',
        environment: 'development',
        actor: { userId: 'user-editor', roles: [RoleCode.MARKETING_EDITOR] },
      });

      expect(result.freshnessState).toBe(FreshnessState.FRESH);
    });
  });

  describe('2. Snapshot and Policy Resolution', () => {
    it('throws ProductSnapshotNotFoundError if snapshot is not found by ID', async () => {
      const useCase = createUseCase();

      await expect(
        useCase.execute({
          snapshotId: 'snap-999',
          actor: { userId: 'user-editor', roles: [RoleCode.MARKETING_EDITOR] },
        }),
      ).rejects.toThrow(ProductSnapshotNotFoundError);
    });

    it('finds latest snapshot by SKU if SKU is provided instead of snapshotId', async () => {
      const useCase = createUseCase();
      getBySkuMock.mockResolvedValue(baseEnvelope);

      const result = await useCase.execute({
        sku: baseEnvelope.product.sku,
        environment: 'development',
        actor: { userId: 'user-editor', roles: [RoleCode.MARKETING_EDITOR] },
      });

      expect(result.currentSnapshot.id).toBe('snap-001');
      expect(result.freshnessState).toBe(FreshnessState.FRESH);
    });

    it('throws FreshnessPolicyMissingError in production when W03-DEC-002 is unconfirmed', async () => {
      const useCase = createUseCase();

      await expect(
        useCase.execute({
          snapshotId: 'snap-001',
          environment: 'production',
          actor: { userId: 'user-editor', roles: [RoleCode.MARKETING_EDITOR] },
        }),
      ).rejects.toThrow(FreshnessPolicyMissingError);
    });
  });

  describe('3. Idempotency Support and Compound Key Scoping', () => {
    it('returns existing assessment on replay without hitting product source', async () => {
      const useCase = createUseCase();
      const compoundKey = buildRevalidationIdempotencyKey({
        environment: 'development',
        targetId: 'snap-001',
        policyId: 'development-v1',
        policyVersion: '1.0',
        actorUserId: 'user-editor',
        callerKey: 'idem-12345',
      });

      const existingAssessment: ProductFreshnessAssessment = {
        id: 'asmt-existing',
        snapshotId: 'snap-001',
        evaluatedAt: initialDate,
        policyId: 'development-v1',
        policyVersion: '1.0',
        freshnessState: FreshnessState.FRESH,
        revalidationOutcome: RevalidationOutcome.FRESH,
        sourceAvailability: SourceAvailability.AVAILABLE,
        reasonCodes: [FreshnessReasonCode.OK_FRESH],
        idempotencyKey: compoundKey,
        evidence: { changedScopes: [], newSnapshotCreated: false },
        createdAt: initialDate,
      };
      assessmentRepo.assessments.push(existingAssessment);

      const result = await useCase.execute({
        snapshotId: 'snap-001',
        idempotencyKey: 'idem-12345',
        environment: 'development',
        actor: { userId: 'user-editor', roles: [RoleCode.MARKETING_EDITOR] },
      });

      expect(result.assessment.id).toBe('asmt-existing');
      expect(result.currentSnapshot.id).toBe('snap-001');
      expect(getBySkuMock).not.toHaveBeenCalled();
    });

    it('prevents cross-user collision for identical callerKey', async () => {
      const useCase = createUseCase();
      getBySkuMock.mockResolvedValue(baseEnvelope);

      // User 1 executes with callerKey 'user-share-key'
      const resultUser1 = await useCase.execute({
        snapshotId: 'snap-001',
        idempotencyKey: 'user-share-key',
        environment: 'development',
        actor: { userId: 'user-1', roles: [RoleCode.MARKETING_EDITOR] },
      });

      // User 2 executes with identical callerKey 'user-share-key'
      const resultUser2 = await useCase.execute({
        snapshotId: 'snap-001',
        idempotencyKey: 'user-share-key',
        environment: 'development',
        actor: { userId: 'user-2', roles: [RoleCode.MARKETING_EDITOR] },
      });

      // They get distinct assessment IDs and distinct compound keys
      expect(resultUser1.assessment.id).not.toBe(resultUser2.assessment.id);
      expect(resultUser1.assessment.idempotencyKey).not.toBe(resultUser2.assessment.idempotencyKey);
      expect(resultUser1.assessment.idempotencyKey).toMatch(/^reval:v1:[a-f0-9]{64}$/);
      expect(resultUser2.assessment.idempotencyKey).toMatch(/^reval:v1:[a-f0-9]{64}$/);
      expect(getBySkuMock).toHaveBeenCalledTimes(2);
    });

    it('prevents cross-environment collision for identical callerKey', async () => {
      const useCase = createUseCase();
      getBySkuMock.mockResolvedValue(baseEnvelope);

      const resultDev = await useCase.execute({
        snapshotId: 'snap-001',
        idempotencyKey: 'env-share-key',
        environment: 'development',
        actor: { userId: 'user-editor', roles: [RoleCode.MARKETING_EDITOR] },
      });

      const resultTest = await useCase.execute({
        snapshotId: 'snap-001',
        idempotencyKey: 'env-share-key',
        environment: 'test',
        actor: { userId: 'user-editor', roles: [RoleCode.MARKETING_EDITOR] },
      });

      expect(resultDev.assessment.id).not.toBe(resultTest.assessment.id);
      expect(resultDev.assessment.idempotencyKey).not.toBe(resultTest.assessment.idempotencyKey);
      expect(resultDev.assessment.idempotencyKey).toMatch(/^reval:v1:[a-f0-9]{64}$/);
      expect(resultTest.assessment.idempotencyKey).toMatch(/^reval:v1:[a-f0-9]{64}$/);
    });

    it('gracefully handles unique constraint collision during concurrent execution by replaying winning assessment', async () => {
      const useCase = createUseCase();
      getBySkuMock.mockResolvedValue(baseEnvelope);

      const targetCompoundKey = buildRevalidationIdempotencyKey({
        environment: 'development',
        targetId: 'snap-001',
        policyId: 'development-v1',
        policyVersion: '1.0',
        actorUserId: 'user-editor',
        callerKey: 'concurrent-key',
      });

      const winningAssessment: ProductFreshnessAssessment = {
        id: 'asmt-concurrent-winner',
        snapshotId: 'snap-001',
        evaluatedAt: initialDate,
        policyId: 'development-v1',
        policyVersion: '1.0',
        freshnessState: FreshnessState.FRESH,
        revalidationOutcome: RevalidationOutcome.FRESH,
        sourceAvailability: SourceAvailability.AVAILABLE,
        reasonCodes: [FreshnessReasonCode.OK_FRESH],
        idempotencyKey: targetCompoundKey,
        evidence: { changedScopes: [], newSnapshotCreated: false },
        createdAt: initialDate,
      };

      // Mock unit of work to throw unique constraint error (simulating concurrent winner committing first)
      jest.spyOn(unitOfWork, 'execute').mockImplementationOnce(() => {
        assessmentRepo.assessments.push(winningAssessment);
        const err = Object.assign(
          new Error('Unique constraint failed on the fields: (`idempotency_key`)'),
          { code: 'P2002', meta: { target: ['idempotency_key'] } },
        );
        return Promise.reject(err);
      });

      const result = await useCase.execute({
        snapshotId: 'snap-001',
        idempotencyKey: 'concurrent-key',
        environment: 'development',
        actor: { userId: 'user-editor', roles: [RoleCode.MARKETING_EDITOR] },
      });

      expect(result.assessment.id).toBe('asmt-concurrent-winner');
      expect(result.currentSnapshot.id).toBe('snap-001');
    });
  });

  describe('4. Upstream Availability Failure (Fail-Closed Snapshot Preservation)', () => {
    it('preserves existing snapshot, sets SOURCE_UNAVAILABLE and emits outage outbox event', async () => {
      const useCase = createUseCase();
      getBySkuMock.mockRejectedValue(
        new ProductSourceUnavailableError('Mekhla upstream service unavailable'),
      );

      const result = await useCase.execute({
        snapshotId: 'snap-001',
        environment: 'development',
        actor: { userId: 'user-editor', roles: [RoleCode.MARKETING_EDITOR] },
      });

      expect(result.currentSnapshot.id).toBe('snap-001');
      expect(result.isNewSnapshotCreated).toBe(false);
      expect(result.freshnessState).toBe(FreshnessState.SOURCE_UNAVAILABLE);
      expect(result.revalidationOutcome).toBe(RevalidationOutcome.SOURCE_UNAVAILABLE);
      expect(result.sourceAvailability).toBe(SourceAvailability.UNREACHABLE);

      // Verify outbox events
      const outageEvent = outboxEvents.find((e) => e.topic === 'product.source.outage_detected');
      const assessedEvent = outboxEvents.find((e) => e.topic === 'product.freshness.assessed');
      expect(outageEvent).toBeDefined();
      expect(assessedEvent).toBeDefined();
      expect(assessedEvent?.payload['freshnessState']).toBe(FreshnessState.SOURCE_UNAVAILABLE);
    });
  });

  describe('5. Upstream Product Deletion / Not Found', () => {
    it('marks snapshot INVALID and MATERIAL_CHANGE when upstream returns null', async () => {
      const useCase = createUseCase();
      getBySkuMock.mockResolvedValue(null);

      const result = await useCase.execute({
        snapshotId: 'snap-001',
        environment: 'development',
        actor: { userId: 'user-editor', roles: [RoleCode.MARKETING_EDITOR] },
      });

      expect(result.freshnessState).toBe(FreshnessState.INVALID);
      expect(result.revalidationOutcome).toBe(RevalidationOutcome.MATERIAL_CHANGE);
      expect(result.reasonCodes).toContain(FreshnessReasonCode.UPSTREAM_NOT_FOUND);
      expect(result.reasonCodes).toContain(FreshnessReasonCode.DISCONTINUED);
      expect(result.isNewSnapshotCreated).toBe(false);

      const assessedEvent = outboxEvents.find((e) => e.topic === 'product.freshness.assessed');
      expect(assessedEvent).toBeDefined();
      expect(assessedEvent?.payload['revalidationOutcome']).toBe(
        RevalidationOutcome.MATERIAL_CHANGE,
      );
    });
  });

  describe('6. Fresh and Non-Material Revalidations', () => {
    it('returns FRESH outcome and creates no new snapshot when facts are identical', async () => {
      const useCase = createUseCase();
      const freshEnvelope: NormalizedProductEnvelope = {
        ...baseEnvelope,
        retrieved_at: initialDate.toISOString(),
        source_updated_at: initialDate.toISOString(),
      };
      getBySkuMock.mockResolvedValue(freshEnvelope);

      const result = await useCase.execute({
        snapshotId: 'snap-001',
        environment: 'development',
        actor: { userId: 'user-editor', roles: [RoleCode.MARKETING_EDITOR] },
      });

      expect(result.freshnessState).toBe(FreshnessState.FRESH);
      expect(result.revalidationOutcome).toBe(RevalidationOutcome.FRESH);
      expect(result.isNewSnapshotCreated).toBe(false);
      expect(result.changedScopes).toHaveLength(0);

      // Only freshness assessed event is emitted, not snapshot.created
      expect(outboxEvents.some((e) => e.topic === 'product.snapshot.created')).toBe(false);
      expect(outboxEvents.some((e) => e.topic === 'product.freshness.assessed')).toBe(true);
    });

    it('returns NON_MATERIAL_CHANGE when retrieved_at is newer but business facts are identical', async () => {
      const useCase = createUseCase();
      const updatedMetaEnvelope: NormalizedProductEnvelope = {
        ...baseEnvelope,
        retrieved_at: new Date('2026-10-18T12:30:00.000Z').toISOString(),
      };
      getBySkuMock.mockResolvedValue(updatedMetaEnvelope);

      const result = await useCase.execute({
        snapshotId: 'snap-001',
        environment: 'development',
        actor: { userId: 'user-editor', roles: [RoleCode.MARKETING_EDITOR] },
      });

      expect(result.revalidationOutcome).toBe(RevalidationOutcome.NON_MATERIAL_CHANGE);
      expect(result.freshnessState).toBe(FreshnessState.FRESH);
      expect(result.isNewSnapshotCreated).toBe(false);
      expect(result.changedScopes).toHaveLength(0);
    });
  });

  describe('7. Material Fact Changes', () => {
    it('creates new snapshot and emits material change events when price changes', async () => {
      const useCase = createUseCase();
      const changedEnvelope: NormalizedProductEnvelope = {
        ...baseEnvelope,
        product: {
          ...baseEnvelope.product,
          price: '299.99',
        },
      };
      getBySkuMock.mockResolvedValue(changedEnvelope);

      const result = await useCase.execute({
        snapshotId: 'snap-001',
        environment: 'development',
        correlationId: 'corr-reval-123',
        actor: { userId: 'user-editor', roles: [RoleCode.MARKETING_EDITOR] },
      });

      expect(result.isNewSnapshotCreated).toBe(true);
      expect(result.currentSnapshot.id).toBe('snap-2');
      expect(result.previousSnapshotId).toBe('snap-001');
      expect(result.revalidationOutcome).toBe(RevalidationOutcome.MATERIAL_CHANGE);
      expect(result.changedScopes).toContain('catalogPrice');

      // Verify all outbox events for material change
      const snapshotCreated = outboxEvents.find((e) => e.topic === 'product.snapshot.created');
      const materialDrift = outboxEvents.find(
        (e) => e.topic === 'product.facts.material_change_detected',
      );
      const invalidationRequested = outboxEvents.find(
        (e) => e.topic === 'approval.invalidation_requested_by_fact_change',
      );
      const assessed = outboxEvents.find((e) => e.topic === 'product.freshness.assessed');

      expect(snapshotCreated).toBeDefined();
      expect(materialDrift).toBeDefined();
      expect(
        (materialDrift?.payload['changedScopes'] as string[] | undefined)?.includes('catalogPrice'),
      ).toBe(true);
      expect(materialDrift?.payload['preservedScopes']).toBeDefined();
      expect(
        (materialDrift?.payload['preservedScopes'] as string[] | undefined)?.includes(
          'permanentFacts',
        ),
      ).toBe(true);
      expect(invalidationRequested).toBeDefined();
      expect(invalidationRequested?.payload['assessmentId']).toBeDefined();
      expect(invalidationRequested?.payload['policyId']).toBe('development-v1');
      expect(invalidationRequested?.payload['policyVersion']).toBe('1.0');
      expect(invalidationRequested?.payload['correlationId']).toBe('corr-reval-123');
      expect(assessed).toBeDefined();
    });

    it('detects OUT_OF_STOCK condition from upstream', async () => {
      const useCase = createUseCase();
      const oosEnvelope: NormalizedProductEnvelope = {
        ...baseEnvelope,
        product: {
          ...baseEnvelope.product,
          stock_status: 'out_of_stock',
        },
      };
      getBySkuMock.mockResolvedValue(oosEnvelope);

      const result = await useCase.execute({
        snapshotId: 'snap-001',
        environment: 'development',
        actor: { userId: 'user-editor', roles: [RoleCode.MARKETING_EDITOR] },
      });

      expect(result.revalidationOutcome).toBe(RevalidationOutcome.OUT_OF_STOCK);
      expect(result.reasonCodes).toContain(FreshnessReasonCode.OUT_OF_STOCK);
      expect(result.changedScopes).toContain('stock');
    });

    it('detects PROMOTION_EXPIRED condition from upstream', async () => {
      const useCase = createUseCase();
      const expiredPromoEnvelope: NormalizedProductEnvelope = {
        ...baseEnvelope,
        product: {
          ...baseEnvelope.product,
          discount: {
            type: 'fixed_amount',
            value: '10.00',
            calculation_method: 'fixed_amount',
            starts_at: '2026-10-01T00:00:00.000Z',
            ends_at: '2026-10-18T11:59:59.000Z', // Before clock time 12:00:00
          },
        },
      };
      getBySkuMock.mockResolvedValue(expiredPromoEnvelope);

      const result = await useCase.execute({
        snapshotId: 'snap-001',
        environment: 'development',
        actor: { userId: 'user-editor', roles: [RoleCode.MARKETING_EDITOR] },
      });

      expect(result.revalidationOutcome).toBe(RevalidationOutcome.PROMOTION_EXPIRED);
      expect(result.reasonCodes).toContain(FreshnessReasonCode.PROMOTION_EXPIRED);
    });
  });

  describe('8. Time-based Progression with Clock', () => {
    it('tracks accurate duration in evidence using Clock', async () => {
      const useCase = createUseCase();
      getBySkuMock.mockImplementation(() => {
        fakeClock.advance(42); // Simulate 42ms elapsed during API fetch
        return Promise.resolve(baseEnvelope);
      });

      const result = await useCase.execute({
        snapshotId: 'snap-001',
        environment: 'development',
        actor: { userId: 'user-editor', roles: [RoleCode.MARKETING_EDITOR] },
      });

      expect(result.assessment.evidence['durationMs']).toBe(42);
    });
  });
});
