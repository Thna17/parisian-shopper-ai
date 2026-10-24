import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
  calculatePolicyVersionHash,
  calculateProductDependencyHashes,
  createDevelopmentFreshnessPolicy,
  DEVELOPMENT_TTL_CONFIG,
  FICTIONAL_PRODUCTS,
  FreshnessReasonCode,
  FreshnessState,
  PolicyLifecycleState,
  PRODUCT_NORMALIZER_VERSION,
  type ProductSource,
  RevalidationOutcome,
  RevalidateProductSnapshotUseCase,
  RoleCode,
  SourceAvailability,
} from '@parisian-shopper/application';
import { FakeClock } from '@parisian-shopper/common';
import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { PrismaService } from '../../src/prisma.service.js';
import { PrismaProductSnapshotRepository } from '../../src/product-snapshot/prisma-product-snapshot.repository.js';
import { PrismaFreshnessPolicyRepository } from '../../src/product-snapshot/prisma-freshness-policy.repository.js';
import { PrismaProductFreshnessAssessmentRepository } from '../../src/product-snapshot/prisma-product-freshness-assessment.repository.js';
import { PrismaProductRevalidationUnitOfWork } from '../../src/product-snapshot/prisma-product-revalidation.unit-of-work.js';

const execFileAsync = promisify(execFile);
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

const dummyLogger = {
  log: (): void => {},
  error: (): void => {},
  warn: (): void => {},
  debug: (): void => {},
  verbose: (): void => {},
};

describe('Freshness Snapshots and Policy Immutability Integration Tests', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let prisma: PrismaService | undefined;
  let snapshotRepo: PrismaProductSnapshotRepository | undefined;
  let policyRepo: PrismaFreshnessPolicyRepository | undefined;
  let assessmentRepo: PrismaProductFreshnessAssessmentRepository | undefined;
  let unitOfWork: PrismaProductRevalidationUnitOfWork | undefined;

  const baseEnvelope = FICTIONAL_PRODUCTS[0]!;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17.6-alpine')
      .withDatabase('parisian_freshness_test')
      .withUsername('parisian_test')
      .withPassword('fictional_test_password')
      .start();

    const databaseUrl = container.getConnectionUri();
    await execFileAsync(
      'pnpm',
      ['--filter', '@parisian-shopper/database', 'prisma:migrate:deploy'],
      { cwd: appRoot, env: { ...process.env, DATABASE_URL: databaseUrl } },
    );

    process.env.DATABASE_URL = databaseUrl;
    prisma = new PrismaService();
    await prisma.$connect();

    await prisma.user.createMany({
      data: [
        { id: '11111111-1111-1111-1111-111111111111', displayName: 'Test Editor 1' },
        { id: '22222222-2222-2222-2222-222222222222', displayName: 'Test Editor 2' },
      ],
      skipDuplicates: true,
    });

    snapshotRepo = new PrismaProductSnapshotRepository(prisma);
    policyRepo = new PrismaFreshnessPolicyRepository(prisma);
    assessmentRepo = new PrismaProductFreshnessAssessmentRepository(prisma);
    unitOfWork = new PrismaProductRevalidationUnitOfWork(prisma);
  }, 60000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  const getPrisma = (): PrismaService => {
    if (!prisma) throw new Error('Prisma service not initialized');
    return prisma;
  };

  const getSnapshotRepo = (): PrismaProductSnapshotRepository => {
    if (!snapshotRepo) throw new Error('Snapshot repository not initialized');
    return snapshotRepo;
  };

  const getPolicyRepo = (): PrismaFreshnessPolicyRepository => {
    if (!policyRepo) throw new Error('Policy repository not initialized');
    return policyRepo;
  };

  const getAssessmentRepo = (): PrismaProductFreshnessAssessmentRepository => {
    if (!assessmentRepo) throw new Error('Assessment repository not initialized');
    return assessmentRepo;
  };

  const getUnitOfWork = (): PrismaProductRevalidationUnitOfWork => {
    if (!unitOfWork) throw new Error('Unit of work not initialized');
    return unitOfWork;
  };

  const runMigrationFile = async (dbName: string, filePath: string): Promise<void> => {
    if (!container) throw new Error('Container not started');
    const containerId = container.getId();
    const fileName = path.basename(path.dirname(filePath)) + '.sql';
    const containerPath = `/tmp/${fileName}`;
    await execFileAsync('docker', ['cp', filePath, `${containerId}:${containerPath}`]);
    await execFileAsync('docker', [
      'exec',
      containerId,
      'psql',
      '-U',
      'parisian_test',
      '-d',
      dbName,
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      containerPath,
    ]);
  };

  const execPsql = async (
    dbName: string,
    sql: string,
  ): Promise<{ stdout: string; stderr: string }> => {
    if (!container) throw new Error('Container not started');
    return execFileAsync('docker', [
      'exec',
      container.getId(),
      'psql',
      '-U',
      'parisian_test',
      '-d',
      dbName,
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      sql,
    ]);
  };

  describe('1. PostgreSQL Immutability Triggers', () => {
    it('enforces append-only triggers on product_snapshots', async () => {
      const db = getPrisma();
      const hashes = calculateProductDependencyHashes(baseEnvelope);
      const snapshot = await getSnapshotRepo().create({
        product: baseEnvelope,
        snapshotHash: hashes.full,
        dependencyHashes: hashes,
        normalizerVersion: PRODUCT_NORMALIZER_VERSION,
      });

      await expect(
        db.$executeRaw`UPDATE product_snapshots SET product_name = 'Mutated' WHERE id = ${snapshot.id}::uuid`,
      ).rejects.toThrow('product_snapshots are append-only');

      await expect(
        db.$executeRaw`DELETE FROM product_snapshots WHERE id = ${snapshot.id}::uuid`,
      ).rejects.toThrow('product_snapshots are append-only');
    });

    it('enforces append-only triggers on freshness_policy_versions and activations', async () => {
      const db = getPrisma();
      const devPolicy = createDevelopmentFreshnessPolicy('test');
      const createdPolicy = await getPolicyRepo().create(devPolicy);

      // Verify trigger on freshness_policy_versions
      await expect(
        db.$executeRaw`UPDATE freshness_policy_versions SET stock_ttl_seconds = 999 WHERE policy_id = ${createdPolicy.policyId}`,
      ).rejects.toThrow('freshness_policy_versions are append-only');

      await expect(
        db.$executeRaw`DELETE FROM freshness_policy_versions WHERE policy_id = ${createdPolicy.policyId}`,
      ).rejects.toThrow('freshness_policy_versions are append-only');

      // Verify trigger on freshness_policy_activations
      await expect(
        db.$executeRaw`UPDATE freshness_policy_activations SET environment = 'mutated' WHERE policy_version_id = ${createdPolicy.id}::uuid`,
      ).rejects.toThrow('freshness_policy_activations are append-only');

      await expect(
        db.$executeRaw`DELETE FROM freshness_policy_activations WHERE policy_version_id = ${createdPolicy.id}::uuid`,
      ).rejects.toThrow('freshness_policy_activations are append-only');
    });

    it('enforces append-only triggers on product_freshness_assessments', async () => {
      const db = getPrisma();
      const hashes = calculateProductDependencyHashes(baseEnvelope);
      const snapshot = await getSnapshotRepo().create({
        product: baseEnvelope,
        snapshotHash: hashes.full,
        dependencyHashes: hashes,
        normalizerVersion: PRODUCT_NORMALIZER_VERSION,
      });

      const assessmentRecord = await db.productFreshnessAssessment.create({
        data: {
          snapshotId: snapshot.id,
          evaluatedAt: new Date(),
          policyId: 'development-v1',
          policyVersion: '1.0',
          freshnessState: FreshnessState.FRESH,
          revalidationOutcome: RevalidationOutcome.FRESH,
          sourceAvailability: SourceAvailability.AVAILABLE,
          reasonCodes: ['OK_FRESH'],
          evidence: {},
        },
      });

      await expect(
        db.$executeRaw`UPDATE product_freshness_assessments SET freshness_state = 'STALE'::"FreshnessState" WHERE id = ${assessmentRecord.id}::uuid`,
      ).rejects.toThrow('product_freshness_assessments are append-only');

      await expect(
        db.$executeRaw`DELETE FROM product_freshness_assessments WHERE id = ${assessmentRecord.id}::uuid`,
      ).rejects.toThrow('product_freshness_assessments are append-only');
    });
  });

  describe('2. Unit of Work Atomic Rollback', () => {
    it('rolls back snapshot, assessment, and outbox when outbox event fails', async () => {
      const db = getPrisma();
      const initialHashes = calculateProductDependencyHashes(baseEnvelope);
      const currentSnapshot = await getSnapshotRepo().create({
        product: baseEnvelope,
        snapshotHash: initialHashes.full,
        dependencyHashes: initialHashes,
        normalizerVersion: PRODUCT_NORMALIZER_VERSION,
      });

      const changedEnvelope = {
        ...baseEnvelope,
        product: { ...baseEnvelope.product, price: '450.00' },
      };
      const changedHashes = calculateProductDependencyHashes(changedEnvelope);

      const uow = getUnitOfWork();

      await expect(
        uow.execute({
          currentSnapshot,
          newSnapshotInput: {
            product: changedEnvelope,
            snapshotHash: changedHashes.full,
            dependencyHashes: changedHashes,
            normalizerVersion: PRODUCT_NORMALIZER_VERSION,
          },
          assessment: (snapshotId) => ({
            snapshotId,
            evaluatedAt: new Date(),
            policyId: 'development-v1',
            policyVersion: '1.0',
            freshnessState: FreshnessState.FRESH,
            revalidationOutcome: RevalidationOutcome.MATERIAL_CHANGE,
            sourceAvailability: SourceAvailability.AVAILABLE,
            reasonCodes: ['FACT_DRIFT_DETECTED'],
            evidence: {},
            idempotencyKey: 'test-failing-outbox-tx',
          }),
          outboxEvents: () => [
            {
              topic: null as unknown as string,
              schemaVersion: 1,
              idempotencyKey: 'failing-outbox-key',
              aggregateType: 'ProductSnapshot',
              payload: {},
              occurredAt: new Date(),
              availableAt: new Date(),
            },
          ],
        }),
      ).rejects.toThrow();

      // Verify atomic rollback: the new snapshot with price 450 was NOT created!
      const snapshots = await db.productSnapshot.findMany({
        where: { sku: baseEnvelope.product.sku, price: 450.0 },
      });
      expect(snapshots).toHaveLength(0);

      // Assessment was NOT created!
      const assessments = await db.productFreshnessAssessment.findMany({
        where: { idempotencyKey: 'test-failing-outbox-tx' },
      });
      expect(assessments).toHaveLength(0);
    });

    it('rolls back snapshot when assessment creation fails', async () => {
      const db = getPrisma();
      const currentSnapshot = await getSnapshotRepo().create({
        product: baseEnvelope,
        snapshotHash: calculateProductDependencyHashes(baseEnvelope).full,
        dependencyHashes: calculateProductDependencyHashes(baseEnvelope),
        normalizerVersion: PRODUCT_NORMALIZER_VERSION,
      });

      const changedEnvelope = {
        ...baseEnvelope,
        product: { ...baseEnvelope.product, price: '777.00' },
      };
      const changedHashes = calculateProductDependencyHashes(changedEnvelope);

      const uow = getUnitOfWork();

      await expect(
        uow.execute({
          currentSnapshot,
          newSnapshotInput: {
            product: changedEnvelope,
            snapshotHash: changedHashes.full,
            dependencyHashes: changedHashes,
            normalizerVersion: PRODUCT_NORMALIZER_VERSION,
          },
          assessment: () => ({
            snapshotId: '00000000-0000-0000-0000-000000000001',
            evaluatedAt: new Date(),
            policyId: 'development-v1',
            policyVersion: '1.0',
            freshnessState: 'INVALID_STATE' as unknown as FreshnessState,
            revalidationOutcome: RevalidationOutcome.FRESH,
            sourceAvailability: SourceAvailability.AVAILABLE,
            reasonCodes: ['OK'],
            evidence: {},
            idempotencyKey: 'test-failing-assessment-tx',
          }),
          outboxEvents: () => [],
        }),
      ).rejects.toThrow();

      const snapshots = await db.productSnapshot.findMany({
        where: { sku: baseEnvelope.product.sku, price: 777.0 },
      });
      expect(snapshots).toHaveLength(0);
    });
  });

  describe('3. Real PostgreSQL Success Cases', () => {
    it('A. Material change success: creates exactly one new snapshot, assessment, and all expected outbox events', async () => {
      const db = getPrisma();
      const currentSnapshot = await getSnapshotRepo().create({
        product: baseEnvelope,
        snapshotHash: calculateProductDependencyHashes(baseEnvelope).full,
        dependencyHashes: calculateProductDependencyHashes(baseEnvelope),
        normalizerVersion: PRODUCT_NORMALIZER_VERSION,
      });

      const changedEnvelope = {
        ...baseEnvelope,
        product: { ...baseEnvelope.product, price: '888.00' },
      };
      const changedHashes = calculateProductDependencyHashes(changedEnvelope);

      const uow = getUnitOfWork();
      const evalTime = new Date('2026-10-19T02:00:00.000Z');

      const result = await uow.execute({
        currentSnapshot,
        newSnapshotInput: {
          product: changedEnvelope,
          snapshotHash: changedHashes.full,
          dependencyHashes: changedHashes,
          normalizerVersion: PRODUCT_NORMALIZER_VERSION,
        },
        assessment: (snapshotId) => ({
          snapshotId,
          evaluatedAt: evalTime,
          policyId: 'development-v1',
          policyVersion: '1.0',
          freshnessState: FreshnessState.FRESH,
          revalidationOutcome: RevalidationOutcome.MATERIAL_CHANGE,
          sourceAvailability: SourceAvailability.AVAILABLE,
          reasonCodes: [FreshnessReasonCode.FACT_DRIFT_DETECTED],
          evidence: {
            changedScopes: ['catalogPrice'],
            preservedScopes: ['permanentFacts', 'stock'],
          },
          comparedSnapshotId: currentSnapshot.id,
          idempotencyKey: 'test-material-success-idem',
        }),
        outboxEvents: ({ snapshot: finalSnapshot, assessment: finalAssessment }) => [
          {
            topic: 'product.snapshot.created',
            schemaVersion: 1,
            idempotencyKey: `snapshot-created-${finalSnapshot.id}`,
            aggregateType: 'ProductSnapshot',
            aggregateId: finalSnapshot.id,
            payload: { snapshotId: finalSnapshot.id, sku: baseEnvelope.product.sku },
            occurredAt: evalTime,
            availableAt: evalTime,
          },
          {
            topic: 'product.facts.material_change_detected',
            schemaVersion: 1,
            idempotencyKey: `facts-changed-${finalSnapshot.id}`,
            aggregateType: 'ProductSnapshot',
            aggregateId: finalSnapshot.id,
            payload: {
              previousSnapshotId: currentSnapshot.id,
              newSnapshotId: finalSnapshot.id,
              changedScopes: ['catalogPrice'],
            },
            occurredAt: evalTime,
            availableAt: evalTime,
          },
          {
            topic: 'approval.invalidation_requested_by_fact_change',
            schemaVersion: 1,
            idempotencyKey: `approval-inval-${finalSnapshot.id}`,
            aggregateType: 'ProductSnapshot',
            aggregateId: currentSnapshot.id,
            payload: {
              previousSnapshotId: currentSnapshot.id,
              newSnapshotId: finalSnapshot.id,
              assessmentId: finalAssessment.id,
            },
            occurredAt: evalTime,
            availableAt: evalTime,
          },
          {
            topic: 'product.freshness.assessed',
            schemaVersion: 1,
            idempotencyKey: `freshness-assessed-${finalAssessment.id}`,
            aggregateType: 'ProductFreshnessAssessment',
            aggregateId: finalAssessment.id,
            payload: { assessmentId: finalAssessment.id },
            occurredAt: evalTime,
            availableAt: evalTime,
          },
        ],
      });

      expect(result.isNewSnapshotCreated).toBe(true);
      expect(result.snapshot.id).not.toBe(currentSnapshot.id);

      // Database verification
      const dbSnapshots = await db.productSnapshot.findMany({
        where: { sku: baseEnvelope.product.sku, price: 888.0 },
      });
      expect(dbSnapshots).toHaveLength(1);
      expect(dbSnapshots[0]?.id).toBe(result.snapshot.id);

      const dbAssessment = await db.productFreshnessAssessment.findUnique({
        where: { id: result.assessment.id },
      });
      expect(dbAssessment).toBeDefined();
      expect(dbAssessment?.snapshotId).toBe(result.snapshot.id);
      expect(dbAssessment?.comparedSnapshotId).toBe(currentSnapshot.id);
      expect(dbAssessment?.revalidationOutcome).toBe('MATERIAL_CHANGE');

      // Verify outbox events persisted
      const outbox = await db.outboxEvent.findMany({
        where: {
          idempotencyKey: {
            in: [
              `snapshot-created-${result.snapshot.id}`,
              `facts-changed-${result.snapshot.id}`,
              `approval-inval-${result.snapshot.id}`,
              `freshness-assessed-${result.assessment.id}`,
            ],
          },
        },
      });
      expect(outbox).toHaveLength(4);
    });

    it('B. Unchanged refresh success: creates no new snapshot, one assessment, only freshness-assessed outbox event', async () => {
      const db = getPrisma();
      const currentSnapshot = await getSnapshotRepo().create({
        product: baseEnvelope,
        snapshotHash: calculateProductDependencyHashes(baseEnvelope).full,
        dependencyHashes: calculateProductDependencyHashes(baseEnvelope),
        normalizerVersion: PRODUCT_NORMALIZER_VERSION,
      });

      const uow = getUnitOfWork();
      const evalTime = new Date();

      const result = await uow.execute({
        currentSnapshot,
        newSnapshotInput: undefined, // No new snapshot
        assessment: (snapshotId) => ({
          snapshotId,
          evaluatedAt: evalTime,
          policyId: 'development-v1',
          policyVersion: '1.0',
          freshnessState: FreshnessState.FRESH,
          revalidationOutcome: RevalidationOutcome.FRESH,
          sourceAvailability: SourceAvailability.AVAILABLE,
          reasonCodes: [FreshnessReasonCode.OK_FRESH],
          evidence: { changedScopes: [] },
          idempotencyKey: 'test-unchanged-success-idem',
        }),
        outboxEvents: ({ assessment }) => [
          {
            topic: 'product.freshness.assessed',
            schemaVersion: 1,
            idempotencyKey: `freshness-assessed-${assessment.id}`,
            aggregateType: 'ProductFreshnessAssessment',
            aggregateId: assessment.id,
            payload: { assessmentId: assessment.id },
            occurredAt: evalTime,
            availableAt: evalTime,
          },
        ],
      });

      expect(result.isNewSnapshotCreated).toBe(false);
      expect(result.snapshot.id).toBe(currentSnapshot.id);

      const dbAssessment = await db.productFreshnessAssessment.findUnique({
        where: { id: result.assessment.id },
      });
      expect(dbAssessment).toBeDefined();
      expect(dbAssessment?.revalidationOutcome).toBe('FRESH');

      // Verify only freshness-assessed was emitted
      const outbox = await db.outboxEvent.findMany({
        where: { idempotencyKey: `freshness-assessed-${result.assessment.id}` },
      });
      expect(outbox).toHaveLength(1);
    });

    it('C. Source unavailable: preserves existing snapshot, creates SOURCE_UNAVAILABLE assessment and outage event', async () => {
      const db = getPrisma();
      const currentSnapshot = await getSnapshotRepo().create({
        product: baseEnvelope,
        snapshotHash: calculateProductDependencyHashes(baseEnvelope).full,
        dependencyHashes: calculateProductDependencyHashes(baseEnvelope),
        normalizerVersion: PRODUCT_NORMALIZER_VERSION,
      });

      const uow = getUnitOfWork();
      const evalTime = new Date();

      const result = await uow.execute({
        currentSnapshot,
        newSnapshotInput: undefined,
        assessment: (snapshotId) => ({
          snapshotId,
          evaluatedAt: evalTime,
          policyId: 'development-v1',
          policyVersion: '1.0',
          freshnessState: FreshnessState.SOURCE_UNAVAILABLE,
          revalidationOutcome: RevalidationOutcome.SOURCE_UNAVAILABLE,
          sourceAvailability: SourceAvailability.UNREACHABLE,
          reasonCodes: [FreshnessReasonCode.UPSTREAM_UNAVAILABLE],
          evidence: { errorCategory: 'TIMEOUT' },
          idempotencyKey: 'test-source-outage-idem',
        }),
        outboxEvents: ({ assessment }) => [
          {
            topic: 'product.source.outage_detected',
            schemaVersion: 1,
            idempotencyKey: `source-outage-${currentSnapshot.id}-${evalTime.getTime()}`,
            aggregateType: 'ProductSnapshot',
            aggregateId: currentSnapshot.id,
            payload: { errorCategory: 'TIMEOUT' },
            occurredAt: evalTime,
            availableAt: evalTime,
          },
          {
            topic: 'product.freshness.assessed',
            schemaVersion: 1,
            idempotencyKey: `freshness-assessed-${assessment.id}`,
            aggregateType: 'ProductFreshnessAssessment',
            aggregateId: assessment.id,
            payload: { assessmentId: assessment.id },
            occurredAt: evalTime,
            availableAt: evalTime,
          },
        ],
      });

      expect(result.isNewSnapshotCreated).toBe(false);
      expect(result.snapshot.id).toBe(currentSnapshot.id);
      expect(result.assessment.sourceAvailability).toBe('UNREACHABLE');
      expect(result.assessment.freshnessState).toBe('SOURCE_UNAVAILABLE');

      const outbox = await db.outboxEvent.findMany({
        where: {
          idempotencyKey: {
            in: [
              `source-outage-${currentSnapshot.id}-${evalTime.getTime()}`,
              `freshness-assessed-${result.assessment.id}`,
            ],
          },
        },
      });
      expect(outbox).toHaveLength(2);
    });

    it('D. Out-of-stock and promotion-expired behavior: persists correct outcomes without product deletion', async () => {
      const db = getPrisma();
      const currentSnapshot = await getSnapshotRepo().create({
        product: baseEnvelope,
        snapshotHash: calculateProductDependencyHashes(baseEnvelope).full,
        dependencyHashes: calculateProductDependencyHashes(baseEnvelope),
        normalizerVersion: PRODUCT_NORMALIZER_VERSION,
      });

      const oosEnvelope = {
        ...baseEnvelope,
        product: { ...baseEnvelope.product, stock_status: 'out_of_stock' as const },
      };
      const oosHashes = calculateProductDependencyHashes(oosEnvelope);

      const uow = getUnitOfWork();
      const evalTime = new Date();

      const result = await uow.execute({
        currentSnapshot,
        newSnapshotInput: {
          product: oosEnvelope,
          snapshotHash: oosHashes.full,
          dependencyHashes: oosHashes,
          normalizerVersion: PRODUCT_NORMALIZER_VERSION,
        },
        assessment: (snapshotId) => ({
          snapshotId,
          evaluatedAt: evalTime,
          policyId: 'development-v1',
          policyVersion: '1.0',
          freshnessState: FreshnessState.INVALID,
          revalidationOutcome: RevalidationOutcome.OUT_OF_STOCK,
          sourceAvailability: SourceAvailability.AVAILABLE,
          reasonCodes: [FreshnessReasonCode.OUT_OF_STOCK],
          evidence: {
            changedScopes: ['stock'],
            preservedScopes: ['permanentFacts', 'catalogPrice'],
          },
          comparedSnapshotId: currentSnapshot.id,
          idempotencyKey: 'test-oos-success-idem',
        }),
        outboxEvents: () => [],
      });

      expect(result.isNewSnapshotCreated).toBe(true);
      expect(result.assessment.revalidationOutcome).toBe('OUT_OF_STOCK');

      // Verify product is NOT deleted: snapshot exists in active status
      const dbSnap = await db.productSnapshot.findUnique({
        where: { id: result.snapshot.id },
      });
      expect(dbSnap).toBeDefined();
      expect(dbSnap?.lifecycleStatus).toBe('active');
      expect(dbSnap?.stockStatus).toBe('out_of_stock');
    });
  });

  describe('4. Real Concurrent Idempotency & Collision Recovery', () => {
    it('executes two concurrent identical requests: both succeed, 1 assessment created, winning result returned', async () => {
      const db = getPrisma();
      const initialSnapshot = await getSnapshotRepo().create({
        product: baseEnvelope,
        snapshotHash: calculateProductDependencyHashes(baseEnvelope).full,
        dependencyHashes: calculateProductDependencyHashes(baseEnvelope),
        normalizerVersion: PRODUCT_NORMALIZER_VERSION,
      });

      const changedEnvelope = {
        ...baseEnvelope,
        product: { ...baseEnvelope.product, price: '999.00' },
      };

      const mockProductSource: ProductSource = {
        getBySku: () => Promise.resolve(changedEnvelope),
        search: () => Promise.resolve([changedEnvelope]),
      };

      const clock = new FakeClock('2026-10-19T02:30:00.000Z');
      const useCase = new RevalidateProductSnapshotUseCase(
        getSnapshotRepo(),
        getAssessmentRepo(),
        getPolicyRepo(),
        mockProductSource,
        getUnitOfWork(),
        dummyLogger,
        clock,
      );

      // Execute two concurrent requests simultaneously with identical scoped caller key
      const [res1, res2] = await Promise.all([
        useCase.execute({
          snapshotId: initialSnapshot.id,
          idempotencyKey: 'concurrent-race-key',
          environment: 'development',
          actor: {
            userId: '11111111-1111-1111-1111-111111111111',
            roles: [RoleCode.MARKETING_EDITOR],
          },
        }),
        useCase.execute({
          snapshotId: initialSnapshot.id,
          idempotencyKey: 'concurrent-race-key',
          environment: 'development',
          actor: {
            userId: '11111111-1111-1111-1111-111111111111',
            roles: [RoleCode.MARKETING_EDITOR],
          },
        }),
      ]);

      // Both resolved successfully without unhandled error
      expect(res1).toBeDefined();
      expect(res2).toBeDefined();
      expect(res1.assessment.id).toBe(res2.assessment.id);
      expect(res1.currentSnapshot.id).toBe(res2.currentSnapshot.id);

      // Database has exactly ONE assessment record with that compound idempotency key
      const assessmentsInDb = await db.productFreshnessAssessment.findMany({
        where: { idempotencyKey: res1.assessment.idempotencyKey },
      });
      expect(assessmentsInDb).toHaveLength(1);

      // Database has exactly ONE new snapshot created for price 999.00
      const snapshotsInDb = await db.productSnapshot.findMany({
        where: { sku: baseEnvelope.product.sku, price: 999.0 },
      });
      expect(snapshotsInDb).toHaveLength(1);
    });

    it('proves callerKey remains isolated across different products, actors, and environments', async () => {
      const initialSnapshot1 = await getSnapshotRepo().create({
        product: baseEnvelope,
        snapshotHash: calculateProductDependencyHashes(baseEnvelope).full,
        dependencyHashes: calculateProductDependencyHashes(baseEnvelope),
        normalizerVersion: PRODUCT_NORMALIZER_VERSION,
      });

      const secondProductEnvelope = {
        ...baseEnvelope,
        product: { ...baseEnvelope.product, sku: 'ISO-SKU-002', product_name: 'Second Perfume' },
      };
      const initialSnapshot2 = await getSnapshotRepo().create({
        product: secondProductEnvelope,
        snapshotHash: calculateProductDependencyHashes(secondProductEnvelope).full,
        dependencyHashes: calculateProductDependencyHashes(secondProductEnvelope),
        normalizerVersion: PRODUCT_NORMALIZER_VERSION,
      });

      const mockProductSource: ProductSource = {
        getBySku: (sku: string) =>
          Promise.resolve(sku === 'ISO-SKU-002' ? secondProductEnvelope : baseEnvelope),
        search: () => Promise.resolve([]),
      };

      const clock = new FakeClock();
      const useCase = new RevalidateProductSnapshotUseCase(
        getSnapshotRepo(),
        getAssessmentRepo(),
        getPolicyRepo(),
        mockProductSource,
        getUnitOfWork(),
        dummyLogger,
        clock,
      );

      // 1. Same callerKey, different products
      const resProd1 = await useCase.execute({
        snapshotId: initialSnapshot1.id,
        idempotencyKey: 'isolated-key',
        environment: 'development',
        actor: {
          userId: '11111111-1111-1111-1111-111111111111',
          roles: [RoleCode.MARKETING_EDITOR],
        },
      });
      const resProd2 = await useCase.execute({
        snapshotId: initialSnapshot2.id,
        idempotencyKey: 'isolated-key',
        environment: 'development',
        actor: {
          userId: '11111111-1111-1111-1111-111111111111',
          roles: [RoleCode.MARKETING_EDITOR],
        },
      });
      expect(resProd1.assessment.idempotencyKey).not.toBe(resProd2.assessment.idempotencyKey);
      expect(resProd1.assessment.id).not.toBe(resProd2.assessment.id);

      // 2. Same callerKey, different actors
      const resActor2 = await useCase.execute({
        snapshotId: initialSnapshot1.id,
        idempotencyKey: 'isolated-key',
        environment: 'development',
        actor: {
          userId: '22222222-2222-2222-2222-222222222222',
          roles: [RoleCode.MARKETING_EDITOR],
        },
      });
      expect(resProd1.assessment.idempotencyKey).not.toBe(resActor2.assessment.idempotencyKey);
      expect(resProd1.assessment.id).not.toBe(resActor2.assessment.id);

      // 3. Same callerKey, different environment (development vs test)
      const resTestEnv = await useCase.execute({
        snapshotId: initialSnapshot1.id,
        idempotencyKey: 'isolated-key',
        environment: 'test',
        actor: {
          userId: '11111111-1111-1111-1111-111111111111',
          roles: [RoleCode.MARKETING_EDITOR],
        },
      });
      expect(resProd1.assessment.idempotencyKey).not.toBe(resTestEnv.assessment.idempotencyKey);
      expect(resProd1.assessment.id).not.toBe(resTestEnv.assessment.id);
    });
  });

  describe('5. Real Policy Lifecycle Transitions via Repository', () => {
    it('supports DRAFT -> APPROVED -> multi-env -> RETIRED transitions through repository without conflict', async () => {
      const repo = getPolicyRepo();

      const ttlConfig = {
        stockSeconds: 100,
        catalogPriceSeconds: 200,
        campaignPriceSeconds: 200,
        promotionSeconds: 200,
        promotionRecheckWindowSeconds: 400,
        permanentFactsSeconds: 800,
        hardExpiryBoundarySeconds: 1600,
      };

      const basePolicy = {
        policyId: 'lifecycle-governed-v1',
        version: '1.0',
        ttl: ttlConfig,
      };
      const versionHash = calculatePolicyVersionHash(basePolicy);

      const t1Draft = new Date('2026-10-18T10:00:00.000Z');
      const t2Approved = new Date('2026-10-18T12:00:00.000Z');
      const t3TestEnv = new Date('2026-10-18T13:00:00.000Z');
      const t4Retired = new Date('2026-10-18T15:00:00.000Z');

      // 1. Create as DRAFT in staging
      const createdDraft = await repo.create({
        ...basePolicy,
        environment: 'staging',
        lifecycleState: PolicyLifecycleState.DRAFT,
        effectiveAt: t1Draft,
        policyHash: versionHash,
      });
      expect(createdDraft.lifecycleState).toBe('DRAFT');

      // At t1, staging has DRAFT -> not active
      const activeAtT1 = await repo.findActivePolicy('staging', t1Draft);
      expect(activeAtT1).toBeNull();

      // 2. Activate as APPROVED for staging (same policy version!)
      const createdApproved = await repo.create({
        ...basePolicy,
        environment: 'staging',
        lifecycleState: PolicyLifecycleState.APPROVED,
        effectiveAt: t2Approved,
        policyHash: versionHash,
      });
      expect(createdApproved.lifecycleState).toBe('APPROVED');

      // At t2, staging has APPROVED -> active
      const activeAtT2 = await repo.findActivePolicy('staging', t2Approved);
      expect(activeAtT2).toBeDefined();
      expect(activeAtT2?.policyId).toBe('lifecycle-governed-v1');
      expect(activeAtT2?.lifecycleState).toBe('APPROVED');

      // 3. Activate same version for test environment
      const createdTestEnv = await repo.create({
        ...basePolicy,
        environment: 'test',
        lifecycleState: PolicyLifecycleState.APPROVED,
        effectiveAt: t3TestEnv,
        policyHash: versionHash,
      });
      expect(createdTestEnv.environment).toBe('test');

      const activeTest = await repo.findActivePolicy('test', t3TestEnv);
      expect(activeTest).toBeDefined();
      expect(activeTest?.environment).toBe('test');

      // 4. Retire in staging
      const createdRetired = await repo.create({
        ...basePolicy,
        environment: 'staging',
        lifecycleState: PolicyLifecycleState.RETIRED,
        effectiveAt: t4Retired,
        policyHash: versionHash,
      });
      expect(createdRetired.lifecycleState).toBe('RETIRED');

      // 5. Historical query in staging before retirement (at 13:00:00) -> returns APPROVED
      const activeHistorical = await repo.findActivePolicy(
        'staging',
        new Date('2026-10-18T13:00:00.000Z'),
      );
      expect(activeHistorical).toBeDefined();
      expect(activeHistorical?.lifecycleState).toBe('APPROVED');

      // 6. Query in staging after retirement (at 16:00:00) -> returns null (inactive)
      const activeAfterRetire = await repo.findActivePolicy(
        'staging',
        new Date('2026-10-18T16:00:00.000Z'),
      );
      expect(activeAfterRetire).toBeNull();

      // 7. Production still fails closed (no approved activation in production)
      const activeProd = await repo.findActivePolicy('production');
      expect(activeProd).toBeNull();
    });
  });

  describe('6. Monotonic Activation Event Ordering', () => {
    it('breaks ties deterministically using sequence DESC when activatedAt timestamps match', async () => {
      const db = getPrisma();
      const devPolicy = createDevelopmentFreshnessPolicy('test');
      const version = await getPolicyRepo().create(devPolicy);

      const tieTime = new Date('2026-10-19T01:00:00.000Z');

      // First recorded activation at tieTime: APPROVED
      const firstActivation = await db.freshnessPolicyActivation.create({
        data: {
          policyVersionId: version.id!,
          environment: 'monotonic-tie-env',
          lifecycleState: 'APPROVED',
          activatedAt: tieTime,
        },
      });

      // Second recorded activation at EXACT same tieTime: RETIRED
      const secondActivation = await db.freshnessPolicyActivation.create({
        data: {
          policyVersionId: version.id!,
          environment: 'monotonic-tie-env',
          lifecycleState: 'RETIRED',
          activatedAt: tieTime,
        },
      });

      // Sequence must be strictly monotonic
      expect(BigInt(secondActivation.sequence)).toBeGreaterThan(BigInt(firstActivation.sequence));

      // findActivePolicy must pick secondActivation (RETIRED) via sequence DESC and return null
      const active = await getPolicyRepo().findActivePolicy('monotonic-tie-env', tieTime);
      expect(active).toBeNull();
    });
  });

  describe('7. Development and Test Fallback Resolution', () => {
    it('unrelated staging policy does not disable development fallback', async () => {
      const repo = getPolicyRepo();

      // Explicitly register a staging policy in database
      const stagingPolicy = {
        policyId: 'staging-special-v1',
        version: '1.0',
        environment: 'staging',
        lifecycleState: PolicyLifecycleState.APPROVED,
        ttl: DEVELOPMENT_TTL_CONFIG,
        effectiveAt: new Date(),
      };
      await repo.create({
        ...stagingPolicy,
        policyHash: calculatePolicyVersionHash(stagingPolicy),
      });

      // Development environment has no activation records in DB
      // It MUST still resolve the approved benchmark fallback!
      const devPolicy = await repo.findActivePolicy('development');
      expect(devPolicy).toBeDefined();
      expect(devPolicy?.policyId).toBe('development-v1');
      expect(devPolicy?.environment).toBe('development');
    });

    it('explicit DRAFT or RETIRED activation in development does NOT get bypassed by fallback', async () => {
      const repo = getPolicyRepo();

      const devPolicy = createDevelopmentFreshnessPolicy('development');
      // Create explicit DRAFT activation in development
      await repo.create({
        ...devPolicy,
        lifecycleState: PolicyLifecycleState.DRAFT,
        effectiveAt: new Date(),
      });

      // Must return null, not silently fall back to approved benchmark!
      const active = await repo.findActivePolicy('development');
      expect(active).toBeNull();
    });

    it('production and staging never receive an implicit fallback', async () => {
      const repo = getPolicyRepo();

      // Empty brand new environment name in production tier
      const activeProd = await repo.findActivePolicy('production');
      expect(activeProd).toBeNull();

      const activeStaging = await repo.findActivePolicy('unconfigured-staging');
      expect(activeStaging).toBeNull();
    });
  });

  describe('8. Policy Creation Atomicity and Conflict Detection', () => {
    it('rejects policy creation when policyHash does not match TTL configuration', async () => {
      const repo = getPolicyRepo();
      const invalidPolicy = {
        policyId: 'hash-check-policy',
        version: '1.0',
        environment: 'test',
        lifecycleState: PolicyLifecycleState.APPROVED,
        ttl: DEVELOPMENT_TTL_CONFIG,
        effectiveAt: new Date(),
        policyHash: '0'.repeat(64), // Deliberately invalid hash
      };

      await expect(repo.create(invalidPolicy)).rejects.toThrow(
        /Invalid policy hash for TTL configuration/,
      );
    });

    it('throws conflict error if policy version exists with differing TTL configuration', async () => {
      const repo = getPolicyRepo();
      const basePolicy = {
        policyId: 'conflict-policy-v1',
        version: '1.0',
        environment: 'test',
        lifecycleState: PolicyLifecycleState.APPROVED,
        ttl: DEVELOPMENT_TTL_CONFIG,
        effectiveAt: new Date(),
      };
      await repo.create({
        ...basePolicy,
        policyHash: calculatePolicyVersionHash(basePolicy),
      });

      // Attempt to register same policyId and version with different stock TTL
      const conflictingPolicy = {
        policyId: 'conflict-policy-v1',
        version: '1.0',
        environment: 'test',
        lifecycleState: PolicyLifecycleState.APPROVED,
        ttl: { ...DEVELOPMENT_TTL_CONFIG, stockSeconds: 9999 },
        effectiveAt: new Date(),
      };

      await expect(
        repo.create({
          ...conflictingPolicy,
          policyHash: calculatePolicyVersionHash(conflictingPolicy),
        }),
      ).rejects.toThrow(/already exists with differing hash/);
    });

    it('activation failure rolls back a newly created policy version', async () => {
      const db = getPrisma();
      const repo = getPolicyRepo();

      const newPolicy = {
        policyId: 'rollback-version-v1',
        version: '1.0',
        environment: 'test',
        lifecycleState: 'NON_EXISTENT_STATE' as unknown as PolicyLifecycleState,
        ttl: DEVELOPMENT_TTL_CONFIG,
        effectiveAt: new Date(),
      };

      const p = {
        ...newPolicy,
        policyHash: calculatePolicyVersionHash(newPolicy),
      };

      await expect(repo.create(p)).rejects.toThrow();

      // Verify the policy version was rolled back!
      const foundVersion = await db.freshnessPolicyVersion.findUnique({
        where: {
          policyId_version: {
            policyId: newPolicy.policyId,
            version: newPolicy.version,
          },
        },
      });
      expect(foundVersion).toBeNull();
    });

    it('exact activation time is inclusive (activatedAt <= evalTime)', async () => {
      const repo = getPolicyRepo();
      const exactTime = new Date('2026-10-19T03:00:00.000Z');

      const inclusivePolicy = {
        policyId: 'inclusive-time-v1',
        version: '1.0',
        environment: 'inclusive-staging',
        lifecycleState: PolicyLifecycleState.APPROVED,
        ttl: DEVELOPMENT_TTL_CONFIG,
        effectiveAt: exactTime,
      };
      await repo.create({
        ...inclusivePolicy,
        policyHash: calculatePolicyVersionHash(inclusivePolicy),
      });

      // Exact time match must resolve as active
      const activeAtExact = await repo.findActivePolicy('inclusive-staging', exactTime);
      expect(activeAtExact).toBeDefined();
      expect(activeAtExact?.policyId).toBe('inclusive-time-v1');

      // 1 millisecond before must return null
      const activeBefore = await repo.findActivePolicy(
        'inclusive-staging',
        new Date(exactTime.getTime() - 1),
      );
      expect(activeBefore).toBeNull();
    });
  });

  describe('9. Pre-W11 Database Upgrade Test', () => {
    it('applies pre-W11 migrations, inserts pre-W11 snapshots, applies W11 migration, and verifies full compatibility', async () => {
      const upgradeDbName = 'parisian_upgrade_test';

      // 1. Create separate isolated database on the running PostgreSQL container
      await execPsql('parisian_freshness_test', `CREATE DATABASE ${upgradeDbName};`);

      // 2. Apply all 7 pre-W11 migrations in sequence
      const preW11Migrations = [
        '20261004140000_foundation',
        '20261004170000_product_snapshots',
        '20261005090000_ai_content_generation',
        '20261005160000_factual_validation',
        '20261006100000_secure_telegram_workflow',
        '20261006160000_human_review_workflow',
        '20261006180000_creative_workflow_foundation',
      ];

      for (const mig of preW11Migrations) {
        const filePath = path.join(
          appRoot,
          'packages/database/prisma/migrations',
          mig,
          'migration.sql',
        );
        await runMigrationFile(upgradeDbName, filePath);
      }

      // 3. Insert representative pre-W11 snapshot row (no scoped hash columns exist in pre-W11 schema!)
      const legacyId = '11111111-1111-1111-1111-111111111111';
      const legacyHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      const insertLegacySql = `
        INSERT INTO product_snapshots (
          id, sku, product_name, brand, category, price, currency,
          stock_status, source_schema_version, source_system,
          source_updated_at, retrieved_at, lifecycle_status,
          snapshot_hash, normalizer_version, created_at
        ) VALUES (
          '${legacyId}'::uuid, 'PRE-W11-SKU', 'Vintage Scent', 'Guerlain', 'Fragrance',
          125.0000, 'USD', 'in_stock'::"ProductStockStatus", '1.0', 'mekhla',
          NOW(), NOW(), 'active'::"ProductLifecycleStatus",
          '${legacyHash}', 'normalizer-v1', NOW()
        );
      `;
      await execPsql(upgradeDbName, insertLegacySql);

      // 4. Apply W11 migration SQL
      const w11FilePath = path.join(
        appRoot,
        'packages/database/prisma/migrations/20261019010000_freshness_snapshots_w11/migration.sql',
      );
      await runMigrationFile(upgradeDbName, w11FilePath);

      // 5. Connect dedicated PrismaService to the upgraded database
      const baseUri = container!.getConnectionUri();
      const upgradeUri = baseUri.replace(/\/[^/]+$/, `/${upgradeDbName}`);
      process.env.DATABASE_URL = upgradeUri;
      const upgradePrisma = new PrismaService();
      await upgradePrisma.$connect();

      try {
        const upgradeSnapshotRepo = new PrismaProductSnapshotRepository(upgradePrisma);

        // Verify: legacy record exists, unchanged and readable
        const loadedLegacy = await upgradeSnapshotRepo.findById(legacyId);
        expect(loadedLegacy).toBeDefined();
        expect(loadedLegacy?.id).toBe(legacyId);
        expect(loadedLegacy?.product.product.sku).toBe('PRE-W11-SKU');
        expect(loadedLegacy?.dependencyHashes.full).toBe(legacyHash);
        // Scoped hashes safely computed on the fly
        expect(loadedLegacy?.dependencyHashes.catalogPrice).toMatch(/^[a-f0-9]{64}$/);
        expect(loadedLegacy?.dependencyHashes.permanentFacts).toMatch(/^[a-f0-9]{64}$/);

        // Verify: raw DB row has NULL scoped hashes (as designed for upgraded records)
        const rawRow = await upgradePrisma.productSnapshot.findUnique({ where: { id: legacyId } });
        expect(rawRow?.catalogPriceHash).toBeNull();
        expect(rawRow?.stockHash).toBeNull();
        expect(rawRow?.permanentFactsHash).toBeNull();

        // Verify: new W11 tables exist and function
        const versionCount = await upgradePrisma.freshnessPolicyVersion.count();
        expect(versionCount).toBe(0);

        const upgradePolicyRepo = new PrismaFreshnessPolicyRepository(upgradePrisma);
        const devPolicy = createDevelopmentFreshnessPolicy('test');
        const createdPolicy = await upgradePolicyRepo.create(devPolicy);
        expect(createdPolicy.policyId).toBe('development-v1');

        // Verify: new snapshots store all scoped hashes
        const newSnapshot = await upgradeSnapshotRepo.create({
          product: baseEnvelope,
          snapshotHash: calculateProductDependencyHashes(baseEnvelope).full,
          dependencyHashes: calculateProductDependencyHashes(baseEnvelope),
          normalizerVersion: PRODUCT_NORMALIZER_VERSION,
        });
        const loadedNew = await upgradePrisma.productSnapshot.findUnique({
          where: { id: newSnapshot.id },
        });
        expect(loadedNew?.catalogPriceHash).toMatch(/^[a-f0-9]{64}$/);
        expect(loadedNew?.permanentFactsHash).toMatch(/^[a-f0-9]{64}$/);

        // Verify: immutability trigger protects upgraded database
        await expect(
          upgradePrisma.$executeRaw`UPDATE product_snapshots SET product_name = 'Mutated' WHERE id = ${legacyId}::uuid`,
        ).rejects.toThrow('product_snapshots are append-only');
      } finally {
        await upgradePrisma.$disconnect();
        // Restore main test db url
        process.env.DATABASE_URL = container!.getConnectionUri();
      }
    });
  });
});
