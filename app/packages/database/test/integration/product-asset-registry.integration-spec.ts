import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
  type ApprovalEvidenceExpectations,
  type ProductAsset,
  ProductAssetApprovalDecision,
  type ProductAssetApprovalEvent,
  type ProductAssetRegistration,
  ProductAssetRightsState,
  ProductAssetRole,
  type ProductAssetTransform,
  ProductAssetTransformType,
  type ProductAssetValidationAssessment,
  ProductAssetMetadataConflictError,
  ProductAssetInvalidLifecycleTransitionError,
  ProductAssetInvalidValidatorVersionError,
  ProductAssetPredecessorRetiredError,
  ProductAssetRightsUnverifiedError,
  ProductAssetStaleAssessmentError,
  ProductAssetStaleEvidenceError,
} from '@parisian-shopper/application';
import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { PrismaService } from '../../src/prisma.service.js';
import { PrismaProductAssetRepository } from '../../src/product-asset/prisma-product-asset.repository.js';
import { PrismaProductAssetRegistrationUnitOfWork } from '../../src/product-asset/prisma-product-asset-registration.unit-of-work.js';

const execFileAsync = promisify(execFile);
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('Product Asset Registry & Immutability Integration Tests (W12)', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let prisma: PrismaService | undefined;
  let assetRepo: PrismaProductAssetRepository | undefined;
  let unitOfWork: PrismaProductAssetRegistrationUnitOfWork | undefined;

  const testUserId = '11111111-1111-1111-1111-111111111111';
  const approverUserId = '22222222-2222-2222-2222-222222222222';

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17.6-alpine')
      .withDatabase('parisian_asset_test')
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
        { id: testUserId, displayName: 'Asset Manager' },
        { id: approverUserId, displayName: 'Art Director' },
      ],
      skipDuplicates: true,
    });

    assetRepo = new PrismaProductAssetRepository(prisma);
    unitOfWork = new PrismaProductAssetRegistrationUnitOfWork(prisma);
  }, 60000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  const getPrisma = (): PrismaService => {
    if (!prisma) throw new Error('Prisma service not initialized');
    return prisma;
  };

  const getAssetRepo = (): PrismaProductAssetRepository => {
    if (!assetRepo) throw new Error('Asset repository not initialized');
    return assetRepo;
  };

  const getUnitOfWork = (): PrismaProductAssetRegistrationUnitOfWork => {
    if (!unitOfWork) throw new Error('Unit of work not initialized');
    return unitOfWork;
  };

  const getExpectedApprovalEvidence = async (
    registrationId: string,
  ): Promise<ApprovalEvidenceExpectations> => {
    const repo = getAssetRepo();
    const registration = await repo.findRegistrationById(registrationId);
    if (!registration) throw new Error(`Registration ${registrationId} not found`);

    const asset = await repo.findAssetById(registration.productAssetId);
    const assessment = await repo.findLatestValidationAssessment(registration.productAssetId);
    const rights = await repo.findLatestRightsEvent(registrationId);
    if (!asset || !assessment) {
      throw new Error(`Approval evidence for registration ${registrationId} is incomplete`);
    }

    return {
      productAssetId: asset.id,
      assetSha256: asset.sha256,
      validationAssessmentId: assessment.id,
      validatorVersion: assessment.validatorVersion,
      rightsEventId: rights?.id ?? null,
    };
  };

  it('saves and retrieves immutable ProductAsset records by ID and SHA-256', async () => {
    const repo = getAssetRepo();
    const sha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    const assetId = crypto.randomUUID();

    const asset: ProductAsset = {
      id: assetId,
      sha256,
      storageKey: `cas/e3/b0/${sha256}.png`,
      mimeType: 'image/png',
      format: 'png',
      byteSize: 125000,
      width: 1080,
      height: 1080,
      pixelCount: 1166400,
      channels: 4,
      hasAlpha: true,
      transparencyRatio: 0.42,
      createdAt: new Date(),
    };

    const saved = await repo.saveAsset(asset);
    expect(saved.id).toBe(assetId);
    expect(saved.sha256).toBe(sha256);

    const byId = await repo.findAssetById(assetId);
    expect(byId).not.toBeNull();
    expect(byId?.sha256).toBe(sha256);
    expect(byId?.transparencyRatio).toBe(0.42);

    const bySha = await repo.findAssetBySha256(sha256);
    expect(bySha).not.toBeNull();
    expect(bySha?.id).toBe(assetId);
  });

  it('saves and retrieves registrations, assessments, and approval events', async () => {
    const repo = getAssetRepo();
    const sha256 = 'a1a2a3a4a5a6a7a8a9b1b2b3b4b5b6b7b8b9c1c2c3c4c5c6c7c8c9d1d2d3d4d5';
    const assetId = crypto.randomUUID();
    const regId = crypto.randomUUID();

    await repo.saveAsset({
      id: assetId,
      sha256,
      storageKey: `cas/a1/a2/${sha256}.png`,
      mimeType: 'image/png',
      format: 'png',
      byteSize: 50000,
      width: 800,
      height: 800,
      pixelCount: 640000,
      channels: 4,
      hasAlpha: true,
      transparencyRatio: 0.3,
      createdAt: new Date(),
    });

    const assessment: ProductAssetValidationAssessment = {
      id: crypto.randomUUID(),
      productAssetId: assetId,
      validatorVersion: 'W12-v1.0.0',
      isValid: true,
      format: 'png',
      hasAlpha: true,
      transparencyRatio: 0.3,
      width: 800,
      height: 800,
      byteSize: 50000,
      pixelCount: 640000,
      findings: ['Alpha verified', 'Trim valid'],
      assessedAt: new Date(),
    };
    await repo.saveValidationAssessment(assessment);

    const registration: ProductAssetRegistration = {
      id: regId,
      productAssetId: assetId,
      sku: 'PARIS-TEST-SKU-99',
      role: ProductAssetRole.HERO_CUTOUT,
      sourceSystem: 'STUDIO',
      sourceUrl: 'https://cdn.mekhla.digital/products/sample.png',
      rightsState: ProductAssetRightsState.VERIFIED,
      registeredByUserId: testUserId,
      registeredAt: new Date(),
    };
    await repo.saveRegistration(registration);

    const approvalEvent: ProductAssetApprovalEvent = {
      id: crypto.randomUUID(),
      productAssetRegistrationId: regId,
      decision: ProductAssetApprovalDecision.APPROVED,
      decidedByUserId: approverUserId,
      reason: 'BRAND_QA_PASSED',
      validationAssessmentId: assessment.id,
      decidedAt: new Date(),
    };
    await repo.saveApprovalEvent(approvalEvent);

    // Queries
    const foundReg = await repo.findRegistrationById(regId);
    expect(foundReg?.sku).toBe('PARIS-TEST-SKU-99');
    expect(foundReg?.role).toBe(ProductAssetRole.HERO_CUTOUT);

    const events = await repo.findApprovalEventsByRegistration(regId);
    expect(events).toHaveLength(1);
    expect(events[0]?.decision).toBe(ProductAssetApprovalDecision.APPROVED);

    const heroCutout = await repo.findApprovedHeroCutoutBySku('PARIS-TEST-SKU-99');
    expect(heroCutout).not.toBeNull();
    expect(heroCutout?.id).toBe(regId);
  });

  it('records parent-child provenance via ProductAssetTransform', async () => {
    const repo = getAssetRepo();
    const sourceSha = '1111111111111111111111111111111111111111111111111111111111111111';
    const derivedSha = '2222222222222222222222222222222222222222222222222222222222222222';
    const sourceId = crypto.randomUUID();
    const derivedId = crypto.randomUUID();

    await repo.saveAsset({
      id: sourceId,
      sha256: sourceSha,
      storageKey: `cas/11/11/${sourceSha}.jpg`,
      mimeType: 'image/jpeg',
      format: 'jpeg',
      byteSize: 300000,
      width: 2000,
      height: 2000,
      pixelCount: 4000000,
      channels: 3,
      hasAlpha: false,
      transparencyRatio: 0,
      createdAt: new Date(),
    });

    await repo.saveAsset({
      id: derivedId,
      sha256: derivedSha,
      storageKey: `cas/22/22/${derivedSha}.png`,
      mimeType: 'image/png',
      format: 'png',
      byteSize: 150000,
      width: 1500,
      height: 1500,
      pixelCount: 2250000,
      channels: 4,
      hasAlpha: true,
      transparencyRatio: 0.35,
      createdAt: new Date(),
    });

    const transform: ProductAssetTransform = {
      id: crypto.randomUUID(),
      sourceAssetId: sourceId,
      derivedAssetId: derivedId,
      transformType: ProductAssetTransformType.BACKGROUND_REMOVAL,
      parameters: { model: 'governed-alpha-extractor-v1', tolerance: 0.05 },
      appliedByUserId: testUserId,
      appliedAt: new Date(),
    };
    await repo.saveTransform(transform);

    const transforms = await repo.findTransformsByDerivedAsset(derivedId);
    expect(transforms).toHaveLength(1);
    expect(transforms[0]?.sourceAssetId).toBe(sourceId);
    expect(transforms[0]?.transformType).toBe(ProductAssetTransformType.BACKGROUND_REMOVAL);
  });

  describe('PostgreSQL Immutability Triggers', () => {
    it('rejects UPDATE on product_assets via trigger', async () => {
      const p = getPrisma();
      const assetId = crypto.randomUUID();
      const sha256 = '3333333333333333333333333333333333333333333333333333333333333333';

      await p.productAsset.create({
        data: {
          id: assetId,
          sha256,
          storageKey: `cas/33/33/${sha256}.png`,
          mimeType: 'image/png',
          format: 'png',
          byteSize: 5000,
          width: 500,
          height: 500,
          pixelCount: 250000,
          channels: 4,
          hasAlpha: true,
          transparencyRatio: 0.5,
        },
      });

      await expect(
        p.$executeRawUnsafe(
          `UPDATE product_assets SET byte_size = 9999 WHERE id = '${assetId}'::uuid`,
        ),
      ).rejects.toThrow(/product_assets are immutable content-addressed records/);
    });

    it('rejects DELETE on product_assets via trigger', async () => {
      const p = getPrisma();
      const assetId = crypto.randomUUID();
      const sha256 = '4444444444444444444444444444444444444444444444444444444444444444';

      await p.productAsset.create({
        data: {
          id: assetId,
          sha256,
          storageKey: `cas/44/44/${sha256}.png`,
          mimeType: 'image/png',
          format: 'png',
          byteSize: 5000,
          width: 500,
          height: 500,
          pixelCount: 250000,
          channels: 4,
          hasAlpha: true,
          transparencyRatio: 0.5,
        },
      });

      await expect(
        p.$executeRawUnsafe(`DELETE FROM product_assets WHERE id = '${assetId}'::uuid`),
      ).rejects.toThrow(/product_assets are immutable content-addressed records/);
    });

    it('rejects UPDATE on product_asset_registrations via trigger', async () => {
      const p = getPrisma();
      const assetId = crypto.randomUUID();
      const regId = crypto.randomUUID();
      const sha256 = '5555555555555555555555555555555555555555555555555555555555555555';

      await p.productAsset.create({
        data: {
          id: assetId,
          sha256,
          storageKey: `cas/55/55/${sha256}.png`,
          mimeType: 'image/png',
          format: 'png',
          byteSize: 5000,
          width: 500,
          height: 500,
          pixelCount: 250000,
          channels: 4,
          hasAlpha: true,
          transparencyRatio: 0.5,
        },
      });

      await p.productAssetRegistration.create({
        data: {
          id: regId,
          productAssetId: assetId,
          sku: 'IMMUTABLE-REG',
          role: 'HERO_CUTOUT',
          sourceSystem: 'TEST',
          rightsState: 'VERIFIED',
        },
      });

      await expect(
        p.$executeRawUnsafe(
          `UPDATE product_asset_registrations SET sku = 'MUTATED' WHERE id = '${regId}'::uuid`,
        ),
      ).rejects.toThrow(/product_asset_registrations are append-only/);
    });

    it('rejects UPDATE on product_asset_approval_events via trigger', async () => {
      const p = getPrisma();
      const assetId = crypto.randomUUID();
      const regId = crypto.randomUUID();
      const eventId = crypto.randomUUID();
      const sha256 = '6666666666666666666666666666666666666666666666666666666666666666';

      await p.productAsset.create({
        data: {
          id: assetId,
          sha256,
          storageKey: `cas/66/66/${sha256}.png`,
          mimeType: 'image/png',
          format: 'png',
          byteSize: 5000,
          width: 500,
          height: 500,
          pixelCount: 250000,
          channels: 4,
          hasAlpha: true,
          transparencyRatio: 0.5,
        },
      });

      await p.productAssetRegistration.create({
        data: {
          id: regId,
          productAssetId: assetId,
          sku: 'IMMUTABLE-APP',
          role: 'HERO_CUTOUT',
          sourceSystem: 'TEST',
          rightsState: 'VERIFIED',
        },
      });

      await p.productAssetApprovalEvent.create({
        data: {
          id: eventId,
          productAssetRegistrationId: regId,
          decision: 'APPROVED',
        },
      });

      await expect(
        p.$executeRawUnsafe(
          `UPDATE product_asset_approval_events SET decision = 'REJECTED' WHERE id = '${eventId}'::uuid`,
        ),
      ).rejects.toThrow(/product_asset_approval_events are append-only/);
    });
  });

  describe('PostgreSQL Check Constraints', () => {
    it('rejects non-SHA-256 strings in sha256 column via CHECK constraint', async () => {
      const p = getPrisma();
      await expect(
        p.$executeRawUnsafe(`
          INSERT INTO product_assets ("id", "sha256", "storage_key", "mime_type", "format", "byte_size", "width", "height", "pixel_count", "channels", "has_alpha", "transparency_ratio")
          VALUES (gen_random_uuid(), 'not-a-sha256', 'cas/test.png', 'image/png', 'png', 100, 10, 10, 100, 4, true, 0.5);
        `),
      ).rejects.toThrow(/product_assets_sha256_check/);
    });

    it('rejects transparency_ratio outside 0..1 via CHECK constraint', async () => {
      const p = getPrisma();
      const validSha = '7777777777777777777777777777777777777777777777777777777777777777';
      await expect(
        p.$executeRawUnsafe(`
          INSERT INTO product_assets ("id", "sha256", "storage_key", "mime_type", "format", "byte_size", "width", "height", "pixel_count", "channels", "has_alpha", "transparency_ratio")
          VALUES (gen_random_uuid(), '${validSha}', 'cas/77/77/${validSha}.png', 'image/png', 'png', 100, 10, 10, 100, 4, true, 1.5);
        `),
      ).rejects.toThrow(/product_assets_transparency_ratio_check/);
    });
  });

  describe('Concurrency-Safe Deduplication & Metadata Conflict Detection', () => {
    it('returns existing ProductAsset when identical sha256 and metadata are re-saved', async () => {
      const repo = getAssetRepo();
      const sha256 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const assetId1 = crypto.randomUUID();
      const assetId2 = crypto.randomUUID();

      const asset1: ProductAsset = {
        id: assetId1,
        sha256,
        storageKey: `cas/aa/aa/${sha256}.png`,
        mimeType: 'image/png',
        format: 'png',
        byteSize: 10000,
        width: 600,
        height: 600,
        pixelCount: 360000,
        channels: 4,
        hasAlpha: true,
        transparencyRatio: 0.25,
        createdAt: new Date(),
      };

      const saved1 = await repo.saveAsset(asset1);
      expect(saved1.id).toBe(assetId1);

      // Re-saving with identical sha256 & metadata under a different id returns the first saved record
      const asset2: ProductAsset = {
        ...asset1,
        id: assetId2,
      };

      const saved2 = await repo.saveAsset(asset2);
      expect(saved2.id).toBe(assetId1);
      expect(saved2.sha256).toBe(sha256);
    });

    it('throws ProductAssetMetadataConflictError when same sha256 has conflicting byteSize', async () => {
      const repo = getAssetRepo();
      const sha256 = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
      const assetId = crypto.randomUUID();

      await repo.saveAsset({
        id: assetId,
        sha256,
        storageKey: `cas/bb/bb/${sha256}.png`,
        mimeType: 'image/png',
        format: 'png',
        byteSize: 20000,
        width: 800,
        height: 800,
        pixelCount: 640000,
        channels: 4,
        hasAlpha: true,
        transparencyRatio: 0.1,
        createdAt: new Date(),
      });

      const conflictingAsset: ProductAsset = {
        id: crypto.randomUUID(),
        sha256,
        storageKey: `cas/bb/bb/${sha256}.png`,
        mimeType: 'image/png',
        format: 'png',
        byteSize: 99999, // Conflicting byte size!
        width: 800,
        height: 800,
        pixelCount: 640000,
        channels: 4,
        hasAlpha: true,
        transparencyRatio: 0.1,
        createdAt: new Date(),
      };

      await expect(repo.saveAsset(conflictingAsset)).rejects.toThrow(
        ProductAssetMetadataConflictError,
      );
    });

    it('throws ProductAssetMetadataConflictError when same sha256 has conflicting mimeType', async () => {
      const repo = getAssetRepo();
      const sha256 = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
      const assetId = crypto.randomUUID();

      await repo.saveAsset({
        id: assetId,
        sha256,
        storageKey: `cas/cc/cc/${sha256}.png`,
        mimeType: 'image/png',
        format: 'png',
        byteSize: 30000,
        width: 800,
        height: 800,
        pixelCount: 640000,
        channels: 4,
        hasAlpha: true,
        transparencyRatio: 0.1,
        createdAt: new Date(),
      });

      const conflictingAsset: ProductAsset = {
        id: crypto.randomUUID(),
        sha256,
        storageKey: `cas/cc/cc/${sha256}.webp`,
        mimeType: 'image/webp', // Conflicting mime type!
        format: 'png',
        byteSize: 30000,
        width: 800,
        height: 800,
        pixelCount: 640000,
        channels: 4,
        hasAlpha: true,
        transparencyRatio: 0.1,
        createdAt: new Date(),
      };

      await expect(repo.saveAsset(conflictingAsset)).rejects.toThrow(
        ProductAssetMetadataConflictError,
      );
    });
  });

  describe('Unit of Work Atomic Execution and Rollback', () => {
    it('atomically creates asset, registration, assessment, rights, and outbox event', async () => {
      const uow = getUnitOfWork();
      const p = getPrisma();
      const sha256 = 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';
      const assetId = crypto.randomUUID();
      const regId = crypto.randomUUID();
      const assessId = crypto.randomUUID();
      const rightsId = crypto.randomUUID();

      const result = await uow.executeRegistration({
        asset: {
          id: assetId,
          sha256,
          storageKey: `cas/dd/dd/${sha256}.png`,
          mimeType: 'image/png',
          format: 'png',
          byteSize: 15000,
          width: 500,
          height: 500,
          pixelCount: 250000,
          channels: 4,
          hasAlpha: true,
          transparencyRatio: 0.4,
          createdAt: new Date(),
        },
        registration: {
          id: regId,
          productAssetId: assetId,
          sku: 'SKU-ATOMIC-UOW-1',
          role: ProductAssetRole.HERO_CUTOUT,
          sourceSystem: 'TEST',
          rightsState: ProductAssetRightsState.VERIFIED,
          registeredByUserId: testUserId,
          registeredAt: new Date(),
        },
        assessment: {
          id: assessId,
          productAssetId: assetId,
          validatorVersion: '1.0.0',
          isValid: true,
          status: 'PASS',
          format: 'png',
          hasAlpha: true,
          transparencyRatio: 0.4,
          width: 500,
          height: 500,
          byteSize: 15000,
          pixelCount: 250000,
          findings: ['Passed alpha check'],
          reasonCodes: [],
          assessedAt: new Date(),
        },
        rightsEvent: {
          id: rightsId,
          productAssetRegistrationId: regId,
          rightsState: ProductAssetRightsState.VERIFIED,
          effectiveAt: new Date(),
          verifiedByUserId: approverUserId,
          createdAt: new Date(),
        },
        outboxEvents: [
          {
            topic: 'product_asset.registered',
            schemaVersion: '1.0.0',
            idempotencyKey: `idemp-reg-${regId}`,
            aggregateType: 'ProductAssetRegistration',
            aggregateId: regId,
            payload: { sku: 'SKU-ATOMIC-UOW-1', role: 'HERO_CUTOUT' },
            occurredAt: new Date(),
            availableAt: new Date(),
          },
        ],
      });

      expect(result.asset.id).toBe(assetId);
      expect(result.registration.id).toBe(regId);
      expect(result.assessment.id).toBe(assessId);
      expect(result.rightsEvent?.id).toBe(rightsId);

      const dbOutbox = await p.outboxEvent.findUnique({
        where: { idempotencyKey: `idemp-reg-${regId}` },
      });
      expect(dbOutbox).not.toBeNull();
      expect(dbOutbox?.topic).toBe('product_asset.registered');
    });

    it('rolls back all database writes if an error occurs within the transaction', async () => {
      const uow = getUnitOfWork();
      const p = getPrisma();
      const sha256 = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
      const assetId = crypto.randomUUID();
      const regId = crypto.randomUUID();
      const assessId = crypto.randomUUID();

      await expect(
        uow.executeRegistration({
          asset: {
            id: assetId,
            sha256,
            storageKey: `cas/ee/ee/${sha256}.png`,
            mimeType: 'image/png',
            format: 'png',
            byteSize: 15000,
            width: 500,
            height: 500,
            pixelCount: 250000,
            channels: 4,
            hasAlpha: true,
            transparencyRatio: 0.4,
            createdAt: new Date(),
          },
          registration: {
            id: regId,
            productAssetId: assetId,
            sku: 'SKU-ROLLBACK-TEST',
            role: ProductAssetRole.HERO_CUTOUT,
            sourceSystem: 'TEST',
            rightsState: ProductAssetRightsState.VERIFIED,
            registeredByUserId: testUserId,
            registeredAt: new Date(),
          },
          assessment: {
            id: assessId,
            productAssetId: assetId,
            validatorVersion: '1.0.0',
            isValid: true,
            status: 'PASS',
            format: 'png',
            hasAlpha: true,
            transparencyRatio: 0.4,
            width: 500,
            height: 500,
            byteSize: 15000,
            pixelCount: 250000,
            findings: [],
            reasonCodes: [],
            assessedAt: new Date(),
          },
          outboxEvents: [
            {
              // Topic exceeds VarChar(200) constraint in PostgreSQL schema, forcing transactional rollback
              topic: 'X'.repeat(300),
              schemaVersion: '1.0.0',
              idempotencyKey: `idemp-fail-${regId}`,
              aggregateType: 'ProductAssetRegistration',
              payload: {},
              occurredAt: new Date(),
              availableAt: new Date(),
            },
          ],
        }),
      ).rejects.toThrow();

      // INVARIANT VERIFIED: Rollback is total
      const dbAsset = await p.productAsset.findUnique({ where: { sha256 } });
      expect(dbAsset).toBeNull();

      const dbReg = await p.productAssetRegistration.findUnique({ where: { id: regId } });
      expect(dbReg).toBeNull();

      const dbAssess = await p.productAssetValidationAssessment.findUnique({
        where: { id: assessId },
      });
      expect(dbAssess).toBeNull();
    });
  });

  describe('Approval Lifecycle State Machine Transitions', () => {
    it('manages SUBMITTED -> APPROVED -> RETIRED transitions and respects query eligibility', async () => {
      const uow = getUnitOfWork();
      const repo = getAssetRepo();
      const sha256 = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
      const assetId = crypto.randomUUID();
      const regId = crypto.randomUUID();
      const sku = 'SKU-LIFECYCLE-TEST';

      await uow.executeRegistration({
        asset: {
          id: assetId,
          sha256,
          storageKey: `cas/ff/ff/${sha256}.png`,
          mimeType: 'image/png',
          format: 'png',
          byteSize: 18000,
          width: 600,
          height: 600,
          pixelCount: 360000,
          channels: 4,
          hasAlpha: true,
          transparencyRatio: 0.5,
          createdAt: new Date(),
        },
        registration: {
          id: regId,
          productAssetId: assetId,
          sku,
          role: ProductAssetRole.HERO_CUTOUT,
          sourceSystem: 'TEST',
          rightsState: ProductAssetRightsState.VERIFIED,
          registeredByUserId: testUserId,
          registeredAt: new Date(),
        },
        assessment: {
          id: crypto.randomUUID(),
          productAssetId: assetId,
          validatorVersion: '1.0.0',
          isValid: true,
          status: 'PASS',
          format: 'png',
          hasAlpha: true,
          transparencyRatio: 0.5,
          width: 600,
          height: 600,
          byteSize: 18000,
          pixelCount: 360000,
          findings: [],
          reasonCodes: [],
          assessedAt: new Date(),
        },
        initialApprovalEvent: {
          id: crypto.randomUUID(),
          productAssetRegistrationId: regId,
          decision: ProductAssetApprovalDecision.SUBMITTED,
          decidedAt: new Date(),
        },
      });

      // 1. In SUBMITTED state, not approved
      let hero = await repo.findApprovedHeroCutoutBySku(sku);
      expect(hero).toBeNull();

      // 2. Transition SUBMITTED -> APPROVED
      await uow.executeApproval({
        approvalEvent: {
          id: crypto.randomUUID(),
          productAssetRegistrationId: regId,
          decision: ProductAssetApprovalDecision.APPROVED,
          decidedByUserId: approverUserId,
          reason: 'Brand QA passed',
          decidedAt: new Date(),
        },
        expectedEvidence: await getExpectedApprovalEvidence(regId),
      });

      hero = await repo.findApprovedHeroCutoutBySku(sku);
      expect(hero).not.toBeNull();
      expect(hero?.id).toBe(regId);

      // 3. Transition APPROVED -> RETIRED
      await uow.executeApproval({
        approvalEvent: {
          id: crypto.randomUUID(),
          productAssetRegistrationId: regId,
          decision: ProductAssetApprovalDecision.RETIRED,
          decidedByUserId: approverUserId,
          reason: 'Seasonal retirement',
          decidedAt: new Date(),
        },
      });

      hero = await repo.findApprovedHeroCutoutBySku(sku);
      expect(hero).toBeNull();
    });
  });

  describe('Monotonic Sequence Ordering', () => {
    it('assigns monotonically increasing BigInt sequence to subsequent events and orders queries by sequence DESC', async () => {
      const repo = getAssetRepo();
      const sha256 = '1010101010101010101010101010101010101010101010101010101010101010';
      const assetId = crypto.randomUUID();
      const regId = crypto.randomUUID();

      await repo.saveAsset({
        id: assetId,
        sha256,
        storageKey: `cas/10/10/${sha256}.png`,
        mimeType: 'image/png',
        format: 'png',
        byteSize: 12000,
        width: 400,
        height: 400,
        pixelCount: 160000,
        channels: 4,
        hasAlpha: true,
        transparencyRatio: 0.3,
        createdAt: new Date(),
      });

      await repo.saveRegistration({
        id: regId,
        productAssetId: assetId,
        sku: 'SKU-SEQ-ORDER',
        role: ProductAssetRole.HERO_CUTOUT,
        sourceSystem: 'TEST',
        rightsState: ProductAssetRightsState.UNKNOWN,
        registeredAt: new Date(),
      });

      const e1 = await repo.saveRightsEvent({
        id: crypto.randomUUID(),
        productAssetRegistrationId: regId,
        rightsState: ProductAssetRightsState.UNKNOWN,
        effectiveAt: new Date(),
        createdAt: new Date(),
      });

      const e2 = await repo.saveRightsEvent({
        id: crypto.randomUUID(),
        productAssetRegistrationId: regId,
        rightsState: ProductAssetRightsState.VERIFIED,
        effectiveAt: new Date(),
        createdAt: new Date(),
      });

      const e3 = await repo.saveRightsEvent({
        id: crypto.randomUUID(),
        productAssetRegistrationId: regId,
        rightsState: ProductAssetRightsState.EXPIRED,
        effectiveAt: new Date(),
        createdAt: new Date(),
      });

      expect(e1.sequence).toBeDefined();
      expect(e2.sequence).toBeDefined();
      expect(e3.sequence).toBeDefined();
      expect(e1.sequence! < e2.sequence!).toBe(true);
      expect(e2.sequence! < e3.sequence!).toBe(true);

      const latestRights = await repo.findLatestRightsEvent(regId);
      expect(latestRights?.id).toBe(e3.id);
      expect(latestRights?.rightsState).toBe(ProductAssetRightsState.EXPIRED);

      const allRights = await repo.findRightsEventsByRegistration(regId);
      expect(allRights).toHaveLength(3);
      expect(allRights[0]?.id).toBe(e3.id);
      expect(allRights[1]?.id).toBe(e2.id);
      expect(allRights[2]?.id).toBe(e1.id);
    });
  });

  describe('Asset Replacement Submission', () => {
    it('links replacesRegistrationId while keeping the approved predecessor active', async () => {
      const uow = getUnitOfWork();
      const repo = getAssetRepo();
      const p = getPrisma();

      const sha1 = '2020202020202020202020202020202020202020202020202020202020202020';
      const sha2 = '3030303030303030303030303030303030303030303030303030303030303030';
      const sku = 'SKU-REPLACE-PIPELINE';
      const regId1 = crypto.randomUUID();
      const regId2 = crypto.randomUUID();

      // Setup initial approved registration
      await uow.executeRegistration({
        asset: {
          id: crypto.randomUUID(),
          sha256: sha1,
          storageKey: `cas/20/20/${sha1}.png`,
          mimeType: 'image/png',
          format: 'png',
          byteSize: 10000,
          width: 500,
          height: 500,
          pixelCount: 250000,
          channels: 4,
          hasAlpha: true,
          transparencyRatio: 0.3,
          createdAt: new Date(),
        },
        registration: {
          id: regId1,
          productAssetId: crypto.randomUUID(),
          sku,
          role: ProductAssetRole.HERO_CUTOUT,
          sourceSystem: 'TEST',
          rightsState: ProductAssetRightsState.VERIFIED,
          registeredAt: new Date(),
        },
        assessment: {
          id: crypto.randomUUID(),
          productAssetId: crypto.randomUUID(),
          validatorVersion: '1.0.0',
          isValid: true,
          status: 'PASS',
          format: 'png',
          hasAlpha: true,
          transparencyRatio: 0.3,
          width: 500,
          height: 500,
          byteSize: 10000,
          pixelCount: 250000,
          findings: [],
          reasonCodes: [],
          assessedAt: new Date(),
        },
        initialApprovalEvent: {
          id: crypto.randomUUID(),
          productAssetRegistrationId: regId1,
          decision: ProductAssetApprovalDecision.SUBMITTED,
          decidedAt: new Date(),
        },
      });

      await uow.executeApproval({
        approvalEvent: {
          id: crypto.randomUUID(),
          productAssetRegistrationId: regId1,
          decision: ProductAssetApprovalDecision.APPROVED,
          decidedByUserId: approverUserId,
          decidedAt: new Date(),
        },
        expectedEvidence: await getExpectedApprovalEvidence(regId1),
      });

      // Confirm R1 is the current approved hero cutout
      const initialHero = await repo.findApprovedHeroCutoutBySku(sku);
      expect(initialHero?.id).toBe(regId1);

      // Perform Governed Replacement
      const newAssetId = crypto.randomUUID();
      const replaceResult = await uow.executeReplacement({
        newAsset: {
          id: newAssetId,
          sha256: sha2,
          storageKey: `cas/30/30/${sha2}.png`,
          mimeType: 'image/png',
          format: 'png',
          byteSize: 12000,
          width: 500,
          height: 500,
          pixelCount: 250000,
          channels: 4,
          hasAlpha: true,
          transparencyRatio: 0.35,
          createdAt: new Date(),
        },
        newRegistration: {
          id: regId2,
          productAssetId: newAssetId,
          sku,
          role: ProductAssetRole.HERO_CUTOUT,
          sourceSystem: 'TEST',
          replacesRegistrationId: regId1,
          rightsState: ProductAssetRightsState.UNKNOWN,
          registeredAt: new Date(),
        },
        newAssessment: {
          id: crypto.randomUUID(),
          productAssetId: newAssetId,
          validatorVersion: '1.0.0',
          isValid: true,
          status: 'PASS',
          format: 'png',
          hasAlpha: true,
          transparencyRatio: 0.35,
          width: 500,
          height: 500,
          byteSize: 12000,
          pixelCount: 250000,
          findings: [],
          reasonCodes: [],
          assessedAt: new Date(),
        },
        newApprovalEvent: {
          id: crypto.randomUUID(),
          productAssetRegistrationId: regId2,
          decision: ProductAssetApprovalDecision.SUBMITTED,
          decidedAt: new Date(),
        },
      });

      expect(replaceResult.newRegistration.id).toBe(regId2);
      expect(replaceResult.newRegistration.replacesRegistrationId).toBe(regId1);
      expect(replaceResult.previousRegistrationRetiredEvent).toBeUndefined();

      // The predecessor remains active while the replacement is pending review.
      const activeHero = await repo.findApprovedHeroCutoutBySku(sku);
      expect(activeHero?.id).toBe(regId1);
      const replacementEvents = await repo.findApprovalEventsByRegistration(regId2);
      expect(replacementEvents[0]?.decision).toBe(ProductAssetApprovalDecision.SUBMITTED);
      expect(await p.outboxEvent.count({ where: { aggregateId: regId2 } })).toBe(0);
    });
  });

  describe('W11 & W12 Schema Upgrade & Coexistence', () => {
    it('links ProductAssetRegistration with existing ProductSnapshot and verifies referential integrity', async () => {
      const p = getPrisma();
      const uow = getUnitOfWork();
      const snapshotId = crypto.randomUUID();
      const sku = 'SKU-W11-W12-COEXIST';
      const snapshotHash = '4040404040404040404040404040404040404040404040404040404040404040';

      // 1. Create a W11 ProductSnapshot
      await p.productSnapshot.create({
        data: {
          id: snapshotId,
          sku,
          productName: 'Coexistence Perfume',
          brand: 'Parisian Shopper',
          category: 'Fragrance',
          price: 150.0,
          currency: 'USD',
          stockStatus: 'in_stock',
          lifecycleStatus: 'active',
          sourceSchemaVersion: '1.0',
          sourceSystem: 'MEKHLA_PRODUCT_API',
          sourceUpdatedAt: new Date(),
          retrievedAt: new Date(),
          snapshotHash,
          normalizerVersion: '1.0.0',
        },
      });

      // 2. Create a W12 ProductAssetRegistration linking to that snapshot
      const assetSha = '5050505050505050505050505050505050505050505050505050505050505050';
      const regId = crypto.randomUUID();
      await uow.executeRegistration({
        asset: {
          id: crypto.randomUUID(),
          sha256: assetSha,
          storageKey: `cas/50/50/${assetSha}.png`,
          mimeType: 'image/png',
          format: 'png',
          byteSize: 22000,
          width: 700,
          height: 700,
          pixelCount: 490000,
          channels: 4,
          hasAlpha: true,
          transparencyRatio: 0.45,
          createdAt: new Date(),
        },
        registration: {
          id: regId,
          productAssetId: crypto.randomUUID(),
          sku,
          productSnapshotId: snapshotId, // Foreign key link to W11 ProductSnapshot
          role: ProductAssetRole.HERO_CUTOUT,
          sourceSystem: 'MEKHLA_PRODUCT_API',
          rightsState: ProductAssetRightsState.VERIFIED,
          registeredAt: new Date(),
        },
        assessment: {
          id: crypto.randomUUID(),
          productAssetId: crypto.randomUUID(),
          validatorVersion: '1.0.0',
          isValid: true,
          status: 'PASS',
          format: 'png',
          hasAlpha: true,
          transparencyRatio: 0.45,
          width: 700,
          height: 700,
          byteSize: 22000,
          pixelCount: 490000,
          findings: ['Coexistence verified'],
          reasonCodes: [],
          assessedAt: new Date(),
        },
      });

      // 3. Verify bidirectional traversal
      const snapshotWithRegistrations = await p.productSnapshot.findUnique({
        where: { id: snapshotId },
        include: { productAssetRegistrations: true },
      });
      expect(snapshotWithRegistrations?.productAssetRegistrations).toHaveLength(1);
      expect(snapshotWithRegistrations?.productAssetRegistrations[0]?.id).toBe(regId);

      const regWithSnapshot = await p.productAssetRegistration.findUnique({
        where: { id: regId },
        include: { productSnapshot: true },
      });
      expect(regWithSnapshot?.productSnapshot?.id).toBe(snapshotId);
      expect(regWithSnapshot?.productSnapshot?.snapshotHash).toBe(snapshotHash);
    });
  });

  describe('Rights Governance & Append-Only Audit Trail', () => {
    it('persists initial registration with UNKNOWN rights and null verifiedByUserId', async () => {
      const uow = getUnitOfWork();
      const p = getPrisma();
      const regId = crypto.randomUUID();
      const assetId = crypto.randomUUID();
      const sha256 = '6060606060606060606060606060606060606060606060606060606060606060';

      await uow.executeRegistration({
        asset: {
          id: assetId,
          sha256,
          storageKey: `cas/60/60/${sha256}.png`,
          mimeType: 'image/png',
          format: 'png',
          byteSize: 15000,
          width: 500,
          height: 500,
          pixelCount: 250000,
          channels: 4,
          hasAlpha: true,
          transparencyRatio: 0.4,
          createdAt: new Date(),
        },
        registration: {
          id: regId,
          productAssetId: assetId,
          sku: 'SKU-RIGHTS-AUDIT',
          role: ProductAssetRole.HERO_CUTOUT,
          sourceSystem: 'STUDIO',
          rightsState: ProductAssetRightsState.UNKNOWN,
          registeredAt: new Date(),
        },
        assessment: {
          id: crypto.randomUUID(),
          productAssetId: assetId,
          validatorVersion: '1.0.0',
          isValid: true,
          status: 'PASS',
          format: 'png',
          hasAlpha: true,
          transparencyRatio: 0.4,
          width: 500,
          height: 500,
          byteSize: 15000,
          pixelCount: 250000,
          findings: [],
          reasonCodes: [],
          assessedAt: new Date(),
        },
        rightsEvent: {
          id: crypto.randomUUID(),
          productAssetRegistrationId: regId,
          rightsState: ProductAssetRightsState.UNKNOWN,
          effectiveAt: new Date(),
          verifiedByUserId: null,
          reason: 'INITIAL_REGISTRATION',
          createdAt: new Date(),
        },
      });

      const savedReg = await p.productAssetRegistration.findUnique({ where: { id: regId } });
      expect(savedReg?.rightsState).toBe(ProductAssetRightsState.UNKNOWN);

      const savedEvents = await p.productAssetRightsEvent.findMany({
        where: { productAssetRegistrationId: regId },
      });
      expect(savedEvents).toHaveLength(1);
      expect(savedEvents[0]?.rightsState).toBe(ProductAssetRightsState.UNKNOWN);
      expect(savedEvents[0]?.verifiedByUserId).toBeNull();
    });

    it('appends VERIFIED rights event with audit fields and emits product_asset.rights_updated', async () => {
      const uow = getUnitOfWork();
      const repo = getAssetRepo();
      const p = getPrisma();
      const regId = crypto.randomUUID();
      const assetId = crypto.randomUUID();
      const sha256 = '6161616161616161616161616161616161616161616161616161616161616161';

      await uow.executeRegistration({
        asset: {
          id: assetId,
          sha256,
          storageKey: `cas/61/61/${sha256}.png`,
          mimeType: 'image/png',
          format: 'png',
          byteSize: 15000,
          width: 500,
          height: 500,
          pixelCount: 250000,
          channels: 4,
          hasAlpha: true,
          transparencyRatio: 0.4,
          createdAt: new Date(),
        },
        registration: {
          id: regId,
          productAssetId: assetId,
          sku: 'SKU-RIGHTS-APPEND',
          role: ProductAssetRole.HERO_CUTOUT,
          sourceSystem: 'STUDIO',
          rightsState: ProductAssetRightsState.UNKNOWN,
          registeredAt: new Date(),
        },
        assessment: {
          id: crypto.randomUUID(),
          productAssetId: assetId,
          validatorVersion: '1.0.0',
          isValid: true,
          status: 'PASS',
          format: 'png',
          hasAlpha: true,
          transparencyRatio: 0.4,
          width: 500,
          height: 500,
          byteSize: 15000,
          pixelCount: 250000,
          findings: [],
          reasonCodes: [],
          assessedAt: new Date(),
        },
      });

      const rightsEventId = crypto.randomUUID();
      const effectiveAt = new Date();
      const expiresAt = new Date(Date.now() + 86400000);

      await uow.executeRights({
        rightsEvent: {
          id: rightsEventId,
          productAssetRegistrationId: regId,
          rightsState: ProductAssetRightsState.VERIFIED,
          sourceReference: 'https://license.brand.internal/contract/2026-PS',
          permittedScope: 'GLOBAL_COMMERCIAL_MARKETING',
          territory: 'GLOBAL',
          effectiveAt,
          expiresAt,
          verifiedByUserId: approverUserId,
          reason: 'Legal review approved for commercial campaign',
          notes: 'Standard license agreement',
          createdAt: effectiveAt,
        },
        outboxEvents: [
          {
            topic: 'product_asset.rights_updated',
            schemaVersion: 1,
            idempotencyKey: `rights-updated-${rightsEventId}`,
            aggregateType: 'ProductAssetRegistration',
            aggregateId: regId,
            payload: {
              registrationId: regId,
              rightsState: ProductAssetRightsState.VERIFIED,
              verifiedByUserId: approverUserId,
              sourceReference: 'https://license.brand.internal/contract/2026-PS',
            },
            occurredAt: effectiveAt,
            availableAt: effectiveAt,
          },
        ],
      });

      const latestRights = await repo.findLatestRightsEvent(regId);
      expect(latestRights?.rightsState).toBe(ProductAssetRightsState.VERIFIED);
      expect(latestRights?.verifiedByUserId).toBe(approverUserId);
      expect(latestRights?.permittedScope).toBe('GLOBAL_COMMERCIAL_MARKETING');
      expect(latestRights?.sourceReference).toBe('https://license.brand.internal/contract/2026-PS');
      expect(latestRights?.expiresAt).toEqual(expiresAt);

      const outbox = await p.outboxEvent.findUnique({
        where: { idempotencyKey: `rights-updated-${rightsEventId}` },
      });
      expect(outbox).not.toBeNull();
      expect(outbox?.topic).toBe('product_asset.rights_updated');
    });
  });

  describe('Approval Concurrency Under PostgreSQL Row Lock', () => {
    it('is idempotent on concurrent duplicate approvals for the same registration', async () => {
      const uow = getUnitOfWork();
      const repo = getAssetRepo();
      const regId = crypto.randomUUID();
      const assetId = crypto.randomUUID();
      const sha256 = '7070707070707070707070707070707070707070707070707070707070707070';

      await uow.executeRegistration({
        asset: {
          id: assetId,
          sha256,
          storageKey: `cas/70/70/${sha256}.png`,
          mimeType: 'image/png',
          format: 'png',
          byteSize: 15000,
          width: 500,
          height: 500,
          pixelCount: 250000,
          channels: 4,
          hasAlpha: true,
          transparencyRatio: 0.4,
          createdAt: new Date(),
        },
        registration: {
          id: regId,
          productAssetId: assetId,
          sku: 'SKU-CONCURRENT-IDEMPOTENT',
          role: ProductAssetRole.HERO_CUTOUT,
          sourceSystem: 'STUDIO',
          rightsState: ProductAssetRightsState.VERIFIED,
          registeredAt: new Date(),
        },
        assessment: {
          id: crypto.randomUUID(),
          productAssetId: assetId,
          validatorVersion: '1.0.0',
          isValid: true,
          status: 'PASS',
          format: 'png',
          hasAlpha: true,
          transparencyRatio: 0.4,
          width: 500,
          height: 500,
          byteSize: 15000,
          pixelCount: 250000,
          findings: [],
          reasonCodes: [],
          assessedAt: new Date(),
        },
        initialApprovalEvent: {
          id: crypto.randomUUID(),
          productAssetRegistrationId: regId,
          decision: ProductAssetApprovalDecision.SUBMITTED,
          decidedAt: new Date(),
        },
      });

      // Concurrent identical APPROVE calls
      const expectedEvidence = await getExpectedApprovalEvidence(regId);
      const [res1, res2] = await Promise.all([
        uow.executeApproval({
          approvalEvent: {
            id: crypto.randomUUID(),
            productAssetRegistrationId: regId,
            decision: ProductAssetApprovalDecision.APPROVED,
            decidedByUserId: approverUserId,
            decidedAt: new Date(),
          },
          expectedEvidence,
        }),
        uow.executeApproval({
          approvalEvent: {
            id: crypto.randomUUID(),
            productAssetRegistrationId: regId,
            decision: ProductAssetApprovalDecision.APPROVED,
            decidedByUserId: approverUserId,
            decidedAt: new Date(),
          },
          expectedEvidence,
        }),
      ]);

      expect(res1.decision).toBe(ProductAssetApprovalDecision.APPROVED);
      expect(res2.decision).toBe(ProductAssetApprovalDecision.APPROVED);

      // Exactly one APPROVED event exists in the repository
      const events = await repo.findApprovalEventsByRegistration(regId);
      const approvedEvents = events.filter(
        (e) => e.decision === ProductAssetApprovalDecision.APPROVED,
      );
      expect(approvedEvents).toHaveLength(1);
    });

    it('rejects contradictory terminal transitions (APPROVED vs REJECTED) concurrently', async () => {
      const uow = getUnitOfWork();
      const regId = crypto.randomUUID();
      const assetId = crypto.randomUUID();
      const sha256 = '7171717171717171717171717171717171717171717171717171717171717171';

      await uow.executeRegistration({
        asset: {
          id: assetId,
          sha256,
          storageKey: `cas/71/71/${sha256}.png`,
          mimeType: 'image/png',
          format: 'png',
          byteSize: 15000,
          width: 500,
          height: 500,
          pixelCount: 250000,
          channels: 4,
          hasAlpha: true,
          transparencyRatio: 0.4,
          createdAt: new Date(),
        },
        registration: {
          id: regId,
          productAssetId: assetId,
          sku: 'SKU-CONCURRENT-CONFLICT',
          role: ProductAssetRole.HERO_CUTOUT,
          sourceSystem: 'STUDIO',
          rightsState: ProductAssetRightsState.VERIFIED,
          registeredAt: new Date(),
        },
        assessment: {
          id: crypto.randomUUID(),
          productAssetId: assetId,
          validatorVersion: '1.0.0',
          isValid: true,
          status: 'PASS',
          format: 'png',
          hasAlpha: true,
          transparencyRatio: 0.4,
          width: 500,
          height: 500,
          byteSize: 15000,
          pixelCount: 250000,
          findings: [],
          reasonCodes: [],
          assessedAt: new Date(),
        },
        initialApprovalEvent: {
          id: crypto.randomUUID(),
          productAssetRegistrationId: regId,
          decision: ProductAssetApprovalDecision.SUBMITTED,
          decidedAt: new Date(),
        },
      });

      // Launch contradictory APPROVE and REJECT concurrently
      const expectedEvidence = await getExpectedApprovalEvidence(regId);
      const results = await Promise.allSettled([
        uow.executeApproval({
          approvalEvent: {
            id: crypto.randomUUID(),
            productAssetRegistrationId: regId,
            decision: ProductAssetApprovalDecision.APPROVED,
            decidedByUserId: approverUserId,
            decidedAt: new Date(),
          },
          expectedEvidence,
        }),
        uow.executeApproval({
          approvalEvent: {
            id: crypto.randomUUID(),
            productAssetRegistrationId: regId,
            decision: ProductAssetApprovalDecision.REJECTED,
            decidedByUserId: approverUserId,
            decidedAt: new Date(),
          },
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      const rejectedError: unknown = (rejected[0] as PromiseRejectedResult).reason;
      expect(rejectedError).toBeInstanceOf(ProductAssetInvalidLifecycleTransitionError);
    });

    it('prevents dual active successors when two replacements compete for the same predecessor', async () => {
      const uow = getUnitOfWork();
      const p = getPrisma();
      const predecessorId = crypto.randomUUID();
      const predAssetId = crypto.randomUUID();
      const predSha = '7272727272727272727272727272727272727272727272727272727272727272';
      const sku = 'SKU-COMPETING-REPLACEMENTS';

      // 1. Create approved predecessor
      await uow.executeRegistration({
        asset: {
          id: predAssetId,
          sha256: predSha,
          storageKey: `cas/72/72/${predSha}.png`,
          mimeType: 'image/png',
          format: 'png',
          byteSize: 15000,
          width: 500,
          height: 500,
          pixelCount: 250000,
          channels: 4,
          hasAlpha: true,
          transparencyRatio: 0.4,
          createdAt: new Date(),
        },
        registration: {
          id: predecessorId,
          productAssetId: predAssetId,
          sku,
          role: ProductAssetRole.HERO_CUTOUT,
          sourceSystem: 'STUDIO',
          rightsState: ProductAssetRightsState.VERIFIED,
          registeredAt: new Date(),
        },
        assessment: {
          id: crypto.randomUUID(),
          productAssetId: predAssetId,
          validatorVersion: '1.0.0',
          isValid: true,
          status: 'PASS',
          format: 'png',
          hasAlpha: true,
          transparencyRatio: 0.4,
          width: 500,
          height: 500,
          byteSize: 15000,
          pixelCount: 250000,
          findings: [],
          reasonCodes: [],
          assessedAt: new Date(),
        },
        initialApprovalEvent: {
          id: crypto.randomUUID(),
          productAssetRegistrationId: predecessorId,
          decision: ProductAssetApprovalDecision.SUBMITTED,
          decidedAt: new Date(),
        },
      });

      await uow.executeApproval({
        approvalEvent: {
          id: crypto.randomUUID(),
          productAssetRegistrationId: predecessorId,
          decision: ProductAssetApprovalDecision.APPROVED,
          decidedByUserId: approverUserId,
          decidedAt: new Date(),
        },
        expectedEvidence: await getExpectedApprovalEvidence(predecessorId),
      });

      // 2. Create replacement A and replacement B
      const repAId = crypto.randomUUID();
      const repBId = crypto.randomUUID();
      const assetAId = crypto.randomUUID();
      const assetBId = crypto.randomUUID();
      const shaA = '7373737373737373737373737373737373737373737373737373737373737373';
      const shaB = '7474747474747474747474747474747474747474747474747474747474747474';

      await uow.executeReplacement({
        newAsset: {
          id: assetAId,
          sha256: shaA,
          storageKey: `cas/73/73/${shaA}.png`,
          mimeType: 'image/png',
          format: 'png',
          byteSize: 15000,
          width: 500,
          height: 500,
          pixelCount: 250000,
          channels: 4,
          hasAlpha: true,
          transparencyRatio: 0.4,
          createdAt: new Date(),
        },
        newRegistration: {
          id: repAId,
          productAssetId: assetAId,
          sku,
          role: ProductAssetRole.HERO_CUTOUT,
          sourceSystem: 'STUDIO',
          replacesRegistrationId: predecessorId,
          rightsState: ProductAssetRightsState.VERIFIED,
          registeredAt: new Date(),
        },
        newAssessment: {
          id: crypto.randomUUID(),
          productAssetId: assetAId,
          validatorVersion: '1.0.0',
          isValid: true,
          status: 'PASS',
          format: 'png',
          hasAlpha: true,
          transparencyRatio: 0.4,
          width: 500,
          height: 500,
          byteSize: 15000,
          pixelCount: 250000,
          findings: [],
          reasonCodes: [],
          assessedAt: new Date(),
        },
        newApprovalEvent: {
          id: crypto.randomUUID(),
          productAssetRegistrationId: repAId,
          decision: ProductAssetApprovalDecision.SUBMITTED,
          decidedAt: new Date(),
        },
      });

      await uow.executeReplacement({
        newAsset: {
          id: assetBId,
          sha256: shaB,
          storageKey: `cas/74/74/${shaB}.png`,
          mimeType: 'image/png',
          format: 'png',
          byteSize: 15000,
          width: 500,
          height: 500,
          pixelCount: 250000,
          channels: 4,
          hasAlpha: true,
          transparencyRatio: 0.4,
          createdAt: new Date(),
        },
        newRegistration: {
          id: repBId,
          productAssetId: assetBId,
          sku,
          role: ProductAssetRole.HERO_CUTOUT,
          sourceSystem: 'STUDIO',
          replacesRegistrationId: predecessorId,
          rightsState: ProductAssetRightsState.VERIFIED,
          registeredAt: new Date(),
        },
        newAssessment: {
          id: crypto.randomUUID(),
          productAssetId: assetBId,
          validatorVersion: '1.0.0',
          isValid: true,
          status: 'PASS',
          format: 'png',
          hasAlpha: true,
          transparencyRatio: 0.4,
          width: 500,
          height: 500,
          byteSize: 15000,
          pixelCount: 250000,
          findings: [],
          reasonCodes: [],
          assessedAt: new Date(),
        },
        newApprovalEvent: {
          id: crypto.randomUUID(),
          productAssetRegistrationId: repBId,
          decision: ProductAssetApprovalDecision.SUBMITTED,
          decidedAt: new Date(),
        },
      });

      // 3. Compete to approve A and B concurrently with predecessor retirement
      const expectedEvidenceA = await getExpectedApprovalEvidence(repAId);
      const expectedEvidenceB = await getExpectedApprovalEvidence(repBId);
      const results = await Promise.allSettled([
        uow.executeApproval({
          approvalEvent: {
            id: crypto.randomUUID(),
            productAssetRegistrationId: repAId,
            decision: ProductAssetApprovalDecision.APPROVED,
            decidedByUserId: approverUserId,
            decidedAt: new Date(),
          },
          expectedEvidence: expectedEvidenceA,
          predecessorRetiredEvent: {
            id: crypto.randomUUID(),
            productAssetRegistrationId: predecessorId,
            decision: ProductAssetApprovalDecision.RETIRED,
            reason: `REPLACED_BY_${repAId}`,
            decidedAt: new Date(),
          },
        }),
        uow.executeApproval({
          approvalEvent: {
            id: crypto.randomUUID(),
            productAssetRegistrationId: repBId,
            decision: ProductAssetApprovalDecision.APPROVED,
            decidedByUserId: approverUserId,
            decidedAt: new Date(),
          },
          expectedEvidence: expectedEvidenceB,
          predecessorRetiredEvent: {
            id: crypto.randomUUID(),
            productAssetRegistrationId: predecessorId,
            decision: ProductAssetApprovalDecision.RETIRED,
            reason: `REPLACED_BY_${repBId}`,
            decidedAt: new Date(),
          },
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      const rejectedError: unknown = (rejected[0] as PromiseRejectedResult).reason;
      expect(rejectedError).toBeInstanceOf(ProductAssetPredecessorRetiredError);

      // Verify only ONE successor is approved
      const approvedRegistrations = await p.productAssetRegistration.findMany({
        where: {
          replacesRegistrationId: predecessorId,
          approvalEvents: {
            some: { decision: ProductAssetApprovalDecision.APPROVED },
          },
        },
      });
      expect(approvedRegistrations).toHaveLength(1);
    });
  });

  describe('Independent Replacement Approval & Visual Invalidation Outbox Binding', () => {
    it('binds exact assessmentId, validatorVersion, rightsEventId, sha256 and visual invalidation outbox', async () => {
      const uow = getUnitOfWork();
      const p = getPrisma();
      const repo = getAssetRepo();
      const predId = crypto.randomUUID();
      const predAssetId = crypto.randomUUID();
      const predSha = '8080808080808080808080808080808080808080808080808080808080808080';
      const sku = 'SKU-INDEPENDENT-APPROVAL';

      // 1. Initial approved registration
      await uow.executeRegistration({
        asset: {
          id: predAssetId,
          sha256: predSha,
          storageKey: `cas/80/80/${predSha}.png`,
          mimeType: 'image/png',
          format: 'png',
          byteSize: 10000,
          width: 400,
          height: 400,
          pixelCount: 160000,
          channels: 4,
          hasAlpha: true,
          transparencyRatio: 0.3,
          createdAt: new Date(),
        },
        registration: {
          id: predId,
          productAssetId: predAssetId,
          sku,
          role: ProductAssetRole.HERO_CUTOUT,
          sourceSystem: 'STUDIO',
          rightsState: ProductAssetRightsState.VERIFIED,
          registeredAt: new Date(),
        },
        assessment: {
          id: crypto.randomUUID(),
          productAssetId: predAssetId,
          validatorVersion: '1.0.0',
          isValid: true,
          status: 'PASS',
          format: 'png',
          hasAlpha: true,
          transparencyRatio: 0.3,
          width: 400,
          height: 400,
          byteSize: 10000,
          pixelCount: 160000,
          findings: [],
          reasonCodes: [],
          assessedAt: new Date(),
        },
        initialApprovalEvent: {
          id: crypto.randomUUID(),
          productAssetRegistrationId: predId,
          decision: ProductAssetApprovalDecision.SUBMITTED,
          decidedAt: new Date(),
        },
      });

      await uow.executeApproval({
        approvalEvent: {
          id: crypto.randomUUID(),
          productAssetRegistrationId: predId,
          decision: ProductAssetApprovalDecision.APPROVED,
          decidedByUserId: approverUserId,
          decidedAt: new Date(),
        },
        expectedEvidence: await getExpectedApprovalEvidence(predId),
      });

      // Confirm predecessor is eligible
      let hero = await repo.findApprovedHeroCutoutBySku(sku);
      expect(hero?.id).toBe(predId);

      // 2. Submit replacement without retiring predecessor
      const repId = crypto.randomUUID();
      const repAssetId = crypto.randomUUID();
      const repAssessmentId = crypto.randomUUID();
      const repSha = '8181818181818181818181818181818181818181818181818181818181818181';

      await uow.executeReplacement({
        newAsset: {
          id: repAssetId,
          sha256: repSha,
          storageKey: `cas/81/81/${repSha}.png`,
          mimeType: 'image/png',
          format: 'png',
          byteSize: 12000,
          width: 500,
          height: 500,
          pixelCount: 250000,
          channels: 4,
          hasAlpha: true,
          transparencyRatio: 0.4,
          createdAt: new Date(),
        },
        newRegistration: {
          id: repId,
          productAssetId: repAssetId,
          sku,
          role: ProductAssetRole.HERO_CUTOUT,
          sourceSystem: 'STUDIO',
          replacesRegistrationId: predId,
          rightsState: ProductAssetRightsState.UNKNOWN,
          registeredAt: new Date(),
        },
        newAssessment: {
          id: repAssessmentId,
          productAssetId: repAssetId,
          validatorVersion: '1.0.0',
          isValid: true,
          status: 'PASS',
          format: 'png',
          hasAlpha: true,
          transparencyRatio: 0.4,
          width: 500,
          height: 500,
          byteSize: 12000,
          pixelCount: 250000,
          findings: [],
          reasonCodes: [],
          assessedAt: new Date(),
        },
        newApprovalEvent: {
          id: crypto.randomUUID(),
          productAssetRegistrationId: repId,
          decision: ProductAssetApprovalDecision.SUBMITTED,
          decidedAt: new Date(),
        },
      });

      // Crucial: Predecessor remains active and eligible while replacement is pending
      hero = await repo.findApprovedHeroCutoutBySku(sku);
      expect(hero?.id).toBe(predId);

      // 3. Legal verifies rights on replacement
      const rightsEventId = crypto.randomUUID();
      await uow.executeRights({
        rightsEvent: {
          id: rightsEventId,
          productAssetRegistrationId: repId,
          rightsState: ProductAssetRightsState.VERIFIED,
          sourceReference: 'https://license.internal/2026',
          permittedScope: 'GLOBAL',
          effectiveAt: new Date(),
          verifiedByUserId: approverUserId,
          reason: 'Legal approved replacement',
          createdAt: new Date(),
        },
      });

      // 4. Art Director approves replacement
      const approvalEventId = crypto.randomUUID();
      const predRetiredEventId = crypto.randomUUID();
      const outboxKey = `inval-visual-${repId}`;

      await uow.executeApproval({
        approvalEvent: {
          id: approvalEventId,
          productAssetRegistrationId: repId,
          decision: ProductAssetApprovalDecision.APPROVED,
          validationAssessmentId: repAssessmentId,
          decidedByUserId: approverUserId,
          decidedAt: new Date(),
        },
        predecessorRetiredEvent: {
          id: predRetiredEventId,
          productAssetRegistrationId: predId,
          decision: ProductAssetApprovalDecision.RETIRED,
          reason: `REPLACED_BY_${repId}`,
          decidedAt: new Date(),
        },
        expectedEvidence: await getExpectedApprovalEvidence(repId),
        outboxEvents: [
          {
            topic: 'product_asset.approved',
            schemaVersion: 1,
            idempotencyKey: `approved-${approvalEventId}`,
            aggregateType: 'ProductAssetRegistration',
            aggregateId: repId,
            payload: {
              eventId: approvalEventId,
              registrationId: repId,
              sku,
              decision: ProductAssetApprovalDecision.APPROVED,
              validationAssessmentId: repAssessmentId,
              validatorVersion: '1.0.0',
              rightsEventId,
              sha256: repSha,
            },
            occurredAt: new Date(),
            availableAt: new Date(),
          },
          {
            topic: 'approval.invalidation_requested_by_asset_change',
            schemaVersion: 1,
            idempotencyKey: outboxKey,
            aggregateType: 'ProductAssetRegistration',
            aggregateId: predId,
            payload: {
              sku,
              previousRegistrationId: predId,
              newRegistrationId: repId,
              previousAssetSha256: predSha,
              newAssetSha256: repSha,
              changedScopes: ['visualAssets'],
              preservedScopes: ['pricing', 'stock', 'promotion', 'facts'],
            },
            occurredAt: new Date(),
            availableAt: new Date(),
          },
        ],
      });

      // Replacement is now active and query-eligible
      hero = await repo.findApprovedHeroCutoutBySku(sku);
      expect(hero?.id).toBe(repId);

      // Predecessor is RETIRED
      const predEvents = await repo.findApprovalEventsByRegistration(predId);
      expect(predEvents[0]?.decision).toBe(ProductAssetApprovalDecision.RETIRED);

      // Verify approval outbox payload
      const appOutbox = await p.outboxEvent.findUnique({
        where: { idempotencyKey: `approved-${approvalEventId}` },
      });
      expect(appOutbox?.topic).toBe('product_asset.approved');
      const appPayload = appOutbox?.payload as Record<string, unknown>;
      expect(appPayload.validationAssessmentId).toBe(repAssessmentId);
      expect(appPayload.validatorVersion).toBe('1.0.0');
      expect(appPayload.rightsEventId).toBe(rightsEventId);
      expect(appPayload.sha256).toBe(repSha);

      // Verify visual invalidation outbox payload
      const invalOutbox = await p.outboxEvent.findUnique({
        where: { idempotencyKey: outboxKey },
      });
      expect(invalOutbox?.topic).toBe('approval.invalidation_requested_by_asset_change');
      const invalPayload = invalOutbox?.payload as Record<string, unknown>;
      expect(invalPayload.changedScopes).toEqual(['visualAssets']);
      expect(invalPayload.preservedScopes).toEqual(['pricing', 'stock', 'promotion', 'facts']);
      expect(invalPayload.previousRegistrationId).toBe(predId);
      expect(invalPayload.newRegistrationId).toBe(repId);
    });
  });

  describe('Transactional evidence recheck & concurrency row locking (Objective 2)', () => {
    it('approves successfully when locked row matches exact expectedEvidence', async () => {
      const uow = getUnitOfWork();

      const sha = 'aa11bb22cc33dd44ee55ff6600112233445566778899aabbccddeeff00112233';
      const assetId = crypto.randomUUID();
      const regId = crypto.randomUUID();
      const assessId = crypto.randomUUID();
      const rightsId = crypto.randomUUID();
      const sku = 'PARIS-EVID-OK';

      // 1. Setup registration
      await uow.executeRegistration({
        asset: {
          id: assetId,
          sha256: sha,
          storageKey: `cas/${sha}.png`,
          mimeType: 'image/png',
          format: 'png',
          byteSize: 1000,
          width: 500,
          height: 500,
          pixelCount: 250000,
          channels: 4,
          hasAlpha: true,
          transparencyRatio: 0.5,
          createdAt: new Date(),
        },
        registration: {
          id: regId,
          productAssetId: assetId,
          sku,
          role: ProductAssetRole.HERO_CUTOUT,
          sourceSystem: 'TEST',
          rightsState: ProductAssetRightsState.UNKNOWN,
          registeredAt: new Date(),
        },
        assessment: {
          id: assessId,
          productAssetId: assetId,
          validatorVersion: '1.0.0',
          status: 'PASS',
          isValid: true,
          format: 'png',
          hasAlpha: true,
          transparencyRatio: 0.5,
          width: 500,
          height: 500,
          byteSize: 1000,
          pixelCount: 250000,
          findings: [],
          reasonCodes: [],
          assessedAt: new Date(),
        },
      });

      // 2. Set rights to VERIFIED
      await uow.executeRights({
        rightsEvent: {
          id: rightsId,
          productAssetRegistrationId: regId,
          rightsState: ProductAssetRightsState.VERIFIED,
          effectiveAt: new Date(),
          verifiedByUserId: approverUserId,
          createdAt: new Date(),
        },
      });

      // 3. The low-level transaction must not allow APPROVED without exact evidence.
      await expect(
        uow.executeApproval({
          approvalEvent: {
            id: crypto.randomUUID(),
            productAssetRegistrationId: regId,
            decision: ProductAssetApprovalDecision.APPROVED,
            decidedByUserId: approverUserId,
            validationAssessmentId: assessId,
            decidedAt: new Date(),
          },
        }),
      ).rejects.toThrow(ProductAssetStaleEvidenceError);

      // 4. Execute approval with matching expectedEvidence
      const appEventId = crypto.randomUUID();
      const approved = await uow.executeApproval({
        approvalEvent: {
          id: appEventId,
          productAssetRegistrationId: regId,
          decision: ProductAssetApprovalDecision.APPROVED,
          decidedByUserId: approverUserId,
          validationAssessmentId: assessId,
          decidedAt: new Date(),
        },
        expectedEvidence: {
          productAssetId: assetId,
          assetSha256: sha,
          validationAssessmentId: assessId,
          validatorVersion: '1.0.0',
          rightsEventId: rightsId,
        },
      });

      expect(approved.decision).toBe(ProductAssetApprovalDecision.APPROVED);
    });

    it('fails closed with ProductAssetStaleAssessmentError and rolls back if newer assessment exists under lock', async () => {
      const uow = getUnitOfWork();
      const repo = getAssetRepo();

      const sha = 'bb22cc33dd44ee55ff6600112233445566778899aabbccddeeff001122334455';
      const assetId = crypto.randomUUID();
      const regId = crypto.randomUUID();
      const assess1Id = crypto.randomUUID();
      const assess2Id = crypto.randomUUID();
      const rightsId = crypto.randomUUID();
      const sku = 'PARIS-EVID-STALE-ASSESS';

      await uow.executeRegistration({
        asset: {
          id: assetId,
          sha256: sha,
          storageKey: `cas/${sha}.png`,
          mimeType: 'image/png',
          format: 'png',
          byteSize: 1000,
          width: 500,
          height: 500,
          pixelCount: 250000,
          channels: 4,
          hasAlpha: true,
          transparencyRatio: 0.5,
          createdAt: new Date(),
        },
        registration: {
          id: regId,
          productAssetId: assetId,
          sku,
          role: ProductAssetRole.HERO_CUTOUT,
          sourceSystem: 'TEST',
          rightsState: ProductAssetRightsState.UNKNOWN,
          registeredAt: new Date(),
        },
        assessment: {
          id: assess1Id,
          productAssetId: assetId,
          validatorVersion: '1.0.0',
          status: 'PASS',
          isValid: true,
          format: 'png',
          hasAlpha: true,
          transparencyRatio: 0.5,
          width: 500,
          height: 500,
          byteSize: 1000,
          pixelCount: 250000,
          findings: [],
          reasonCodes: [],
          assessedAt: new Date(Date.now() - 5000),
        },
        initialApprovalEvent: {
          id: crypto.randomUUID(),
          productAssetRegistrationId: regId,
          decision: ProductAssetApprovalDecision.SUBMITTED,
          decidedByUserId: approverUserId,
          reason: 'INITIAL_REGISTRATION',
          validationAssessmentId: assess1Id,
          decidedAt: new Date(Date.now() - 5000),
        },
      });

      await uow.executeRights({
        rightsEvent: {
          id: rightsId,
          productAssetRegistrationId: regId,
          rightsState: ProductAssetRightsState.VERIFIED,
          effectiveAt: new Date(),
          verifiedByUserId: approverUserId,
          createdAt: new Date(),
        },
      });

      // Concurrently a newer failing assessment was saved
      await repo.saveValidationAssessment({
        id: assess2Id,
        productAssetId: assetId,
        validatorVersion: '1.0.0',
        status: 'FAIL',
        isValid: false,
        format: 'png',
        hasAlpha: false,
        transparencyRatio: 0.0,
        width: 500,
        height: 500,
        byteSize: 1000,
        pixelCount: 250000,
        findings: ['Alpha transparency missing'],
        reasonCodes: ['OPAQUE_HERO'],
        assessedAt: new Date(),
      });

      // Attempt approval expecting assess1Id
      await expect(
        uow.executeApproval({
          approvalEvent: {
            id: crypto.randomUUID(),
            productAssetRegistrationId: regId,
            decision: ProductAssetApprovalDecision.APPROVED,
            decidedByUserId: approverUserId,
            validationAssessmentId: assess1Id,
            decidedAt: new Date(),
          },
          expectedEvidence: {
            productAssetId: assetId,
            assetSha256: sha,
            validationAssessmentId: assess1Id,
            validatorVersion: '1.0.0',
            rightsEventId: rightsId,
          },
        }),
      ).rejects.toThrow(ProductAssetStaleAssessmentError);

      // Verify transaction rolled back: registration remains in SUBMITTED state
      const events = await repo.findApprovalEventsByRegistration(regId);
      expect(events[0]?.decision).toBe(ProductAssetApprovalDecision.SUBMITTED);
    });

    it('fails closed with ProductAssetStaleEvidenceError and rolls back if rights revoked under lock', async () => {
      const uow = getUnitOfWork();
      const repo = getAssetRepo();

      const sha = 'cc33dd44ee55ff6600112233445566778899aabbccddeeff0011223344556677';
      const assetId = crypto.randomUUID();
      const regId = crypto.randomUUID();
      const assessId = crypto.randomUUID();
      const rights1Id = crypto.randomUUID();
      const rights2Id = crypto.randomUUID();
      const sku = 'PARIS-EVID-REVOKED-RIGHTS';

      await uow.executeRegistration({
        asset: {
          id: assetId,
          sha256: sha,
          storageKey: `cas/${sha}.png`,
          mimeType: 'image/png',
          format: 'png',
          byteSize: 1000,
          width: 500,
          height: 500,
          pixelCount: 250000,
          channels: 4,
          hasAlpha: true,
          transparencyRatio: 0.5,
          createdAt: new Date(),
        },
        registration: {
          id: regId,
          productAssetId: assetId,
          sku,
          role: ProductAssetRole.HERO_CUTOUT,
          sourceSystem: 'TEST',
          rightsState: ProductAssetRightsState.UNKNOWN,
          registeredAt: new Date(),
        },
        assessment: {
          id: assessId,
          productAssetId: assetId,
          validatorVersion: '1.0.0',
          status: 'PASS',
          isValid: true,
          format: 'png',
          hasAlpha: true,
          transparencyRatio: 0.5,
          width: 500,
          height: 500,
          byteSize: 1000,
          pixelCount: 250000,
          findings: [],
          reasonCodes: [],
          assessedAt: new Date(),
        },
        initialApprovalEvent: {
          id: crypto.randomUUID(),
          productAssetRegistrationId: regId,
          decision: ProductAssetApprovalDecision.SUBMITTED,
          decidedByUserId: approverUserId,
          reason: 'INITIAL_REGISTRATION',
          validationAssessmentId: assessId,
          decidedAt: new Date(),
        },
      });

      // Rights originally verified
      await uow.executeRights({
        rightsEvent: {
          id: rights1Id,
          productAssetRegistrationId: regId,
          rightsState: ProductAssetRightsState.VERIFIED,
          effectiveAt: new Date(),
          verifiedByUserId: approverUserId,
          createdAt: new Date(),
        },
      });

      // Concurrently legal revokes rights
      await uow.executeRights({
        rightsEvent: {
          id: rights2Id,
          productAssetRegistrationId: regId,
          rightsState: ProductAssetRightsState.RESTRICTED,
          reason: 'Legal cease and desist',
          effectiveAt: new Date(),
          verifiedByUserId: approverUserId,
          createdAt: new Date(),
        },
      });

      // Approval expecting rights1Id fails closed
      await expect(
        uow.executeApproval({
          approvalEvent: {
            id: crypto.randomUUID(),
            productAssetRegistrationId: regId,
            decision: ProductAssetApprovalDecision.APPROVED,
            decidedByUserId: approverUserId,
            validationAssessmentId: assessId,
            decidedAt: new Date(),
          },
          expectedEvidence: {
            productAssetId: assetId,
            assetSha256: sha,
            validationAssessmentId: assessId,
            validatorVersion: '1.0.0',
            rightsEventId: rights1Id,
          },
        }),
      ).rejects.toThrow(ProductAssetStaleEvidenceError);

      // Verify transaction rolled back: registration remains SUBMITTED
      const events = await repo.findApprovalEventsByRegistration(regId);
      expect(events[0]?.decision).toBe(ProductAssetApprovalDecision.SUBMITTED);
    });

    it('rolls back replacement transaction cleanly leaving predecessor A active if B has stale evidence', async () => {
      const uow = getUnitOfWork();
      const repo = getAssetRepo();

      const shaA = 'dd44ee55ff6600112233445566778899aabbccddeeff00112233445566778899';
      const shaB = 'ee55ff6600112233445566778899aabbccddeeff00112233445566778899aa00';
      const assetAId = crypto.randomUUID();
      const assetBId = crypto.randomUUID();
      const regAId = crypto.randomUUID();
      const regBId = crypto.randomUUID();
      const assessAId = crypto.randomUUID();
      const assessBId = crypto.randomUUID();
      const rightsAId = crypto.randomUUID();
      const sku = 'PARIS-REPLACE-ROLLBACK';

      // 1. Predecessor A is approved and verified
      await uow.executeRegistration({
        asset: {
          id: assetAId,
          sha256: shaA,
          storageKey: `cas/${shaA}.png`,
          mimeType: 'image/png',
          format: 'png',
          byteSize: 1000,
          width: 500,
          height: 500,
          pixelCount: 250000,
          channels: 4,
          hasAlpha: true,
          transparencyRatio: 0.5,
          createdAt: new Date(),
        },
        registration: {
          id: regAId,
          productAssetId: assetAId,
          sku,
          role: ProductAssetRole.HERO_CUTOUT,
          sourceSystem: 'TEST',
          rightsState: ProductAssetRightsState.UNKNOWN,
          registeredAt: new Date('2026-10-18T10:00:00Z'),
        },
        assessment: {
          id: assessAId,
          productAssetId: assetAId,
          validatorVersion: '1.0.0',
          status: 'PASS',
          isValid: true,
          format: 'png',
          hasAlpha: true,
          transparencyRatio: 0.5,
          width: 500,
          height: 500,
          byteSize: 1000,
          pixelCount: 250000,
          findings: [],
          reasonCodes: [],
          assessedAt: new Date('2026-10-18T10:00:00Z'),
        },
      });

      await uow.executeRights({
        rightsEvent: {
          id: rightsAId,
          productAssetRegistrationId: regAId,
          rightsState: ProductAssetRightsState.VERIFIED,
          effectiveAt: new Date('2026-10-18T10:00:00Z'),
          verifiedByUserId: approverUserId,
          createdAt: new Date('2026-10-18T10:00:00Z'),
        },
      });

      await uow.executeApproval({
        approvalEvent: {
          id: crypto.randomUUID(),
          productAssetRegistrationId: regAId,
          decision: ProductAssetApprovalDecision.APPROVED,
          decidedByUserId: approverUserId,
          validationAssessmentId: assessAId,
          decidedAt: new Date('2026-10-18T10:05:00Z'),
        },
        expectedEvidence: await getExpectedApprovalEvidence(regAId),
      });

      // Confirm A is active
      let active = await repo.findApprovedHeroCutoutBySku(sku);
      expect(active?.id).toBe(regAId);

      // 2. Replacement B registered (replaces regAId, SUBMITTED)
      await uow.executeReplacement({
        newAsset: {
          id: assetBId,
          sha256: shaB,
          storageKey: `cas/${shaB}.png`,
          mimeType: 'image/png',
          format: 'png',
          byteSize: 1000,
          width: 500,
          height: 500,
          pixelCount: 250000,
          channels: 4,
          hasAlpha: true,
          transparencyRatio: 0.5,
          createdAt: new Date('2026-10-19T10:00:00Z'),
        },
        newRegistration: {
          id: regBId,
          productAssetId: assetBId,
          sku,
          role: ProductAssetRole.HERO_CUTOUT,
          sourceSystem: 'TEST',
          replacesRegistrationId: regAId,
          rightsState: ProductAssetRightsState.UNKNOWN,
          registeredAt: new Date('2026-10-19T10:00:00Z'),
        },
        newAssessment: {
          id: assessBId,
          productAssetId: assetBId,
          validatorVersion: '1.0.0',
          status: 'PASS',
          isValid: true,
          format: 'png',
          hasAlpha: true,
          transparencyRatio: 0.5,
          width: 500,
          height: 500,
          byteSize: 1000,
          pixelCount: 250000,
          findings: [],
          reasonCodes: [],
          assessedAt: new Date('2026-10-19T10:00:00Z'),
        },
        newApprovalEvent: {
          id: crypto.randomUUID(),
          productAssetRegistrationId: regBId,
          decision: ProductAssetApprovalDecision.SUBMITTED,
          decidedByUserId: approverUserId,
          reason: 'REPLACEMENT_SUBMITTED',
          validationAssessmentId: assessBId,
          decidedAt: new Date('2026-10-19T10:00:00Z'),
        },
      });

      // While B is pending, A remains active
      active = await repo.findApprovedHeroCutoutBySku(sku);
      expect(active?.id).toBe(regAId);

      // 3. Attempt to approve B with invalid/stale rights (B rights are UNKNOWN)
      await expect(
        uow.executeApproval({
          approvalEvent: {
            id: crypto.randomUUID(),
            productAssetRegistrationId: regBId,
            decision: ProductAssetApprovalDecision.APPROVED,
            decidedByUserId: approverUserId,
            validationAssessmentId: assessBId,
            decidedAt: new Date(),
          },
          predecessorRetiredEvent: {
            id: crypto.randomUUID(),
            productAssetRegistrationId: regAId,
            decision: ProductAssetApprovalDecision.RETIRED,
            reason: `REPLACED_BY_${regBId}`,
            decidedAt: new Date(),
          },
          expectedEvidence: {
            productAssetId: assetBId,
            assetSha256: shaB,
            validationAssessmentId: assessBId,
            validatorVersion: '1.0.0',
          },
        }),
      ).rejects.toThrow(ProductAssetRightsUnverifiedError);

      // 4. Verification of atomic rollback:
      // Predecessor A is NOT retired! A remains APPROVED and returned by repository!
      const predEvents = await repo.findApprovalEventsByRegistration(regAId);
      expect(predEvents[0]?.decision).toBe(ProductAssetApprovalDecision.APPROVED);

      active = await repo.findApprovedHeroCutoutBySku(sku);
      expect(active?.id).toBe(regAId);

      // Replacement B remains SUBMITTED
      const repEvents = await repo.findApprovalEventsByRegistration(regBId);
      expect(repEvents[0]?.decision).toBe(ProductAssetApprovalDecision.SUBMITTED);
    });

    it('fails closed with ProductAssetInvalidValidatorVersionError when validatorVersion does not match under lock', async () => {
      const uow = getUnitOfWork();

      const sha = 'ff6600112233445566778899aabbccddeeff00112233445566778899aabbccdd';
      const assetId = crypto.randomUUID();
      const regId = crypto.randomUUID();
      const assessId = crypto.randomUUID();
      const rightsId = crypto.randomUUID();
      const sku = 'PARIS-EVID-VERSION-MISMATCH';

      await uow.executeRegistration({
        asset: {
          id: assetId,
          sha256: sha,
          storageKey: `cas/${sha}.png`,
          mimeType: 'image/png',
          format: 'png',
          byteSize: 1000,
          width: 500,
          height: 500,
          pixelCount: 250000,
          channels: 4,
          hasAlpha: true,
          transparencyRatio: 0.5,
          createdAt: new Date(),
        },
        registration: {
          id: regId,
          productAssetId: assetId,
          sku,
          role: ProductAssetRole.HERO_CUTOUT,
          sourceSystem: 'TEST',
          rightsState: ProductAssetRightsState.UNKNOWN,
          registeredAt: new Date(),
        },
        assessment: {
          id: assessId,
          productAssetId: assetId,
          validatorVersion: '1.0.0',
          status: 'PASS',
          isValid: true,
          format: 'png',
          hasAlpha: true,
          transparencyRatio: 0.5,
          width: 500,
          height: 500,
          byteSize: 1000,
          pixelCount: 250000,
          findings: [],
          reasonCodes: [],
          assessedAt: new Date(),
        },
      });

      await uow.executeRights({
        rightsEvent: {
          id: rightsId,
          productAssetRegistrationId: regId,
          rightsState: ProductAssetRightsState.VERIFIED,
          effectiveAt: new Date(),
          verifiedByUserId: approverUserId,
          createdAt: new Date(),
        },
      });

      // Expecting validatorVersion '2.0.0', but stored is '1.0.0'
      await expect(
        uow.executeApproval({
          approvalEvent: {
            id: crypto.randomUUID(),
            productAssetRegistrationId: regId,
            decision: ProductAssetApprovalDecision.APPROVED,
            decidedByUserId: approverUserId,
            validationAssessmentId: assessId,
            decidedAt: new Date(),
          },
          expectedEvidence: {
            productAssetId: assetId,
            assetSha256: sha,
            validationAssessmentId: assessId,
            validatorVersion: '2.0.0',
            rightsEventId: rightsId,
          },
        }),
      ).rejects.toThrow(ProductAssetInvalidValidatorVersionError);
    });
  });
});
