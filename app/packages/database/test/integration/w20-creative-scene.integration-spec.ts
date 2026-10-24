import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
  type CreateInitialSceneAtomicInput,
  type CreateRevisionAtomicInput,
  type RecordDependencyInvalidationInput,
  type SceneLayerDraft,
  InvalidSceneLayerError,
  SceneConcurrencyConflictError,
  computeSceneHash,
  computeDependencyHash,
} from '@parisian-shopper/application';
import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { PrismaService } from '../../src/prisma.service.js';
import { PrismaCreativeSceneRepository } from '../../src/creative/prisma-creative-scene.repository.js';

const execFileAsync = promisify(execFile);
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('W20 Layered CreativeScene Database & Immutability Integration Tests', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let prisma: PrismaService | undefined;
  let repository: PrismaCreativeSceneRepository | undefined;

  let testUserId: string;
  let testSnapshotId: string;
  let testContentVersionId: string;
  let testCreativeJobId: string;
  let testBrandRuleVersionId: string;

  beforeAll(async () => {
    let databaseUrl: string | undefined;

    // Use isolated Testcontainer if possible; fallback to running PostgreSQL instance
    try {
      container = await new PostgreSqlContainer('postgres:17.6-alpine')
        .withDatabase('parisian_scene_test')
        .withUsername('parisian_test')
        .withPassword('fictional_test_password')
        .start();

      databaseUrl = container.getConnectionUri();
      await execFileAsync(
        'pnpm',
        ['--filter', '@parisian-shopper/database', 'prisma:migrate:deploy'],
        { cwd: appRoot, env: { ...process.env, DATABASE_URL: databaseUrl } },
      );
      process.env.DATABASE_URL = databaseUrl;
    } catch {
      process.env.DATABASE_URL =
        process.env.DATABASE_URL ||
        'postgresql://parisian:local_only_change_me@127.0.0.1:5433/parisian_shopper?schema=public';
    }

    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaCreativeSceneRepository(prisma);

    // Setup prerequisite entities
    testUserId = crypto.randomUUID();
    await prisma.user.create({
      data: {
        id: testUserId,
        displayName: 'W20 Scene Test User',
      },
    });

    testSnapshotId = crypto.randomUUID();
    await prisma.productSnapshot.create({
      data: {
        id: testSnapshotId,
        sku: `SKU-W20-${Date.now()}`,
        productName: 'Chanel No 5 Eau de Parfum',
        brand: 'Chanel',
        category: 'Fragrance',
        price: 165.0,
        currency: 'USD',
        stockStatus: 'in_stock',
        lifecycleStatus: 'active',
        sourceSchemaVersion: '1.0',
        sourceSystem: 'MEKHLA_PRODUCT_API',
        sourceUpdatedAt: new Date(),
        retrievedAt: new Date(),
        snapshotHash: '1'.repeat(64),
        normalizerVersion: '1.0.0',
      },
    });

    const brandRuleVersionId = crypto.randomUUID();
    testBrandRuleVersionId = brandRuleVersionId;
    await prisma.brandRuleVersion.create({
      data: {
        id: brandRuleVersionId,
        name: `Brand Rules W20 ${Date.now()}`,
        version: 1,
        status: 'ACTIVE',
        languageRules: { allowedLanguages: ['EN', 'KM'] },
        toneRules: { default: 'luxury' },
        ctaRules: {},
        promotionRules: {},
        perfumeClaimRules: {},
        platformRules: {},
        visualGuidance: {},
      },
    });

    const contentJobId = crypto.randomUUID();
    await prisma.contentJob.create({
      data: {
        id: contentJobId,
        productSnapshotId: testSnapshotId,
        brandRuleVersionId,
        requesterUserId: testUserId,
        contentType: 'PRODUCT_SPOTLIGHT',
        language: 'EN',
        platform: 'TELEGRAM',
        status: 'APPROVED',
      },
    });

    const generationAttemptId = crypto.randomUUID();
    await prisma.generationAttempt.create({
      data: {
        id: generationAttemptId,
        contentJobId,
        attemptNumber: 1,
        provider: 'mock-ai',
        model: 'fixture-v1',
        promptVersion: '1.0',
        status: 'SUCCEEDED',
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    testContentVersionId = crypto.randomUUID();
    await prisma.contentVersion.create({
      data: {
        id: testContentVersionId,
        contentJobId,
        versionNumber: 1,
        brandRuleVersionId,
        productSnapshotId: testSnapshotId,
        generationAttemptId,
        provider: 'mock-ai',
        model: 'fixture-v1',
        promptVersion: '1.0',
        structuredOutput: {
          headline: 'Luxury Headline',
          khmer_caption: 'Khmer text',
          english_caption: 'English text',
          cta: 'Shop Now',
          hashtags: ['#chanel'],
          creative_brief: 'Brief',
        },
      },
    });

    testCreativeJobId = crypto.randomUUID();
    await prisma.creativeJob.create({
      data: {
        id: testCreativeJobId,
        contentVersionId: testContentVersionId,
        productSnapshotId: testSnapshotId,
        brandRuleVersionId,
        requestedByUserId: testUserId,
        status: 'REQUESTED',
        aspectRatio: '4:5',
        creativeProfile: 'PARISIAN_LUXURY_ATELIER',
      },
    });
  }, 120000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  const getPrisma = (): PrismaService => {
    if (!prisma) throw new Error('Prisma service not initialized');
    return prisma;
  };

  const getRepo = (): PrismaCreativeSceneRepository => {
    if (!repository) throw new Error('Repository not initialized');
    return repository;
  };

  function createTestLayers(): SceneLayerDraft[] {
    return [
      {
        layerKey: 'bg_01',
        layerGroup: 'BACKGROUND',
        layerType: 'GENERATED_BACKGROUND',
        name: 'Background Layer',
        zIndex: 0,
        visible: true,
        opacity: 1,
        blendMode: 'NORMAL',
        bounds: { x: 0, y: 0, width: 1080, height: 1350 },
        payloadSchemaVersion: 1,
        sortOrder: 0,
        payload: {
          assetType: 'GENERATED_BACKGROUND',
          casStorageKey: 'cas/bg/bg_chanel.png',
          sha256: 'a'.repeat(64),
        },
      },
      {
        layerKey: 'shadow_01',
        layerGroup: 'SURFACE_SHADOW',
        layerType: 'CONTACT_SHADOW',
        name: 'Shadow Layer',
        zIndex: 100,
        visible: true,
        opacity: 0.6,
        blendMode: 'MULTIPLY',
        bounds: { x: 200, y: 900, width: 680, height: 120 },
        payloadSchemaVersion: 1,
        sortOrder: 1,
        payload: { shadowType: 'CONTACT_ELLIPSE', blurRadius: 25, color: '#000000' },
      },
      {
        layerKey: 'hero_01',
        layerGroup: 'PRODUCT_HERO',
        layerType: 'HERO_CUTOUT',
        name: 'Product Hero Cutout',
        zIndex: 200,
        visible: true,
        opacity: 1,
        blendMode: 'NORMAL',
        bounds: { x: 240, y: 380, width: 600, height: 600 },
        payloadSchemaVersion: 1,
        sortOrder: 2,
        payload: {
          productSnapshotId: testSnapshotId,
          productAssetId: crypto.randomUUID(),
          productAssetRegistrationId: crypto.randomUUID(),
          validationAssessmentId: crypto.randomUUID(),
          validatorVersion: '1.0.0',
          rightsEventId: crypto.randomUUID(),
          approvalEventId: crypto.randomUUID(),
          assetRole: 'HERO_CUTOUT',
          mimeType: 'image/png',
          casStorageKey: 'cas/cutouts/chanel_no5.png',
          sha256: 'b'.repeat(64),
          alphaEvidence: {
            hasAlpha: true,
            transparencyRatio: 0.35,
          },
          containmentConfig: {
            containmentPassed: true,
            x: 240,
            y: 380,
            width: 600,
            height: 600,
          },
        },
      },
      {
        layerKey: 'typo_01',
        layerGroup: 'TYPOGRAPHY',
        layerType: 'TYPOGRAPHY_BLOCK',
        name: 'Headline Layer',
        zIndex: 300,
        visible: true,
        opacity: 1,
        blendMode: 'NORMAL',
        bounds: { x: 72, y: 980, width: 936, height: 200 },
        payloadSchemaVersion: 1,
        sortOrder: 3,
        payload: {
          headline: {
            text: 'Timeless Parisian Elegance',
            fontFamily: 'Playfair Display',
            fontWeight: 700,
            fontSize: 48,
            color: '#1c1a17',
          },
        },
      },
    ];
  }

  async function createTestJob(): Promise<string> {
    const p = getPrisma();
    const jobId = crypto.randomUUID();
    await p.creativeJob.create({
      data: {
        id: jobId,
        contentVersionId: testContentVersionId,
        productSnapshotId: testSnapshotId,
        brandRuleVersionId: testBrandRuleVersionId,
        requestedByUserId: testUserId,
        status: 'REQUESTED',
        aspectRatio: '4:5',
        creativeProfile: 'PARISIAN_LUXURY_ATELIER',
      },
    });
    return jobId;
  }

  describe('Atomic Initial Scene Creation & Normalized Persistence', () => {
    it('creates CreativeScene, Version 1, normalized layers, dependencies, state projection, and outbox event in single transaction', async () => {
      const p = getPrisma();
      const repo = getRepo();
      const layers = createTestLayers();
      const dependencies = [
        {
          dependencyType: 'PRODUCT_SNAPSHOT',
          dependencyIdentifier: testSnapshotId,
          immutableDigest: '1'.repeat(64),
          sortOrder: 1,
        },
        {
          dependencyType: 'CONTENT_VERSION',
          dependencyIdentifier: testContentVersionId,
          immutableDigest: '2'.repeat(64),
          sortOrder: 2,
        },
      ];
      const dependencyHash = computeDependencyHash(dependencies);

      const sceneHash = computeSceneHash({
        aspectRatio: '4:5',
        width: 1080,
        height: 1350,
        templateId: 'EDITORIAL_SPLIT',
        templateVersion: '1.0.0',
        language: 'EN',
        safeMargins: { top: 80, bottom: 120, left: 72, right: 72 },
        dependencyHash,
        layers,
      });

      const idempotencyKey = `scene-outbox-${Date.now()}`;
      const input: CreateInitialSceneAtomicInput = {
        creativeJobId: testCreativeJobId,
        title: 'Initial Parisian Campaign Scene',
        aspectRatio: '4:5',
        width: 1080,
        height: 1350,
        templateId: 'EDITORIAL_SPLIT',
        templateVersion: '1.0.0',
        language: 'EN',
        safeMargins: { top: 80, bottom: 120, left: 72, right: 72 },
        brandProfileVersionId: crypto.randomUUID(),
        sourceContentVersionId: testContentVersionId,
        productSnapshotId: testSnapshotId,
        sceneHash,
        dependencyHash,
        layers,
        dependencies,
        requestedByUserId: testUserId,
        outboxEvent: {
          topic: 'creative.scene.version_created',
          schemaVersion: 1,
          idempotencyKey,
          aggregateType: 'CREATIVE_SCENE',
          aggregateId: testCreativeJobId,
          payload: { versionNumber: 1 },
          occurredAt: new Date(),
          availableAt: new Date(),
        },
      };

      const result = await repo.createInitialScene(input);

      // Verify returned aggregates
      expect(result.scene.id).toBeDefined();
      expect(result.scene.currentVersionNumber).toBe(1);
      expect(result.version.versionNumber).toBe(1);
      expect(result.version.parentVersionId).toBeNull();
      expect(result.version.layers).toHaveLength(4);
      expect(result.version.dependencies).toHaveLength(2);
      expect(result.version.state?.status).toBe('DRAFT');
      expect(result.version.state?.isExportEligible).toBe(false);

      // Verify layer ordering
      expect(result.version.layers[0]!.sortOrder).toBe(0);
      expect(result.version.layers[1]!.sortOrder).toBe(1);
      expect(result.version.layers[2]!.sortOrder).toBe(2);
      expect(result.version.layers[3]!.sortOrder).toBe(3);

      // Verify Outbox row persisted atomically
      const outboxRow = await p.outboxEvent.findUnique({
        where: { idempotencyKey },
      });
      expect(outboxRow).not.toBeNull();
      expect(outboxRow?.topic).toBe('creative.scene.version_created');

      // Verify state projection 1:1 row persisted
      const stateRow = await p.sceneVersionState.findUnique({
        where: { sceneVersionId: result.version.id },
      });
      expect(stateRow).not.toBeNull();
      expect(stateRow?.status).toBe('DRAFT');
    });

    it('rolls back completely if a layer insertion violates a database constraint (zero orphans)', async () => {
      const p = getPrisma();
      const repo = getRepo();

      const layers = createTestLayers();
      // Cause duplicate layerKey constraint violation inside transaction
      const duplicateKeyLayers: SceneLayerDraft[] = [
        ...layers,
        {
          ...layers[0]!,
          sortOrder: 4,
          zIndex: 400,
        },
      ];

      const idempotencyKey = `scene-fail-${Date.now()}`;
      const input: CreateInitialSceneAtomicInput = {
        creativeJobId: testCreativeJobId,
        title: 'Failing Scene Creation',
        aspectRatio: '4:5',
        width: 1080,
        height: 1350,
        templateId: 'EDITORIAL_SPLIT',
        templateVersion: '1.0.0',
        language: 'EN',
        safeMargins: { top: 80, bottom: 120, left: 72, right: 72 },
        brandProfileVersionId: crypto.randomUUID(),
        sourceContentVersionId: testContentVersionId,
        productSnapshotId: testSnapshotId,
        sceneHash: 'f'.repeat(64),
        dependencyHash: 'f'.repeat(64),
        layers: duplicateKeyLayers,
        dependencies: [],
        outboxEvent: {
          topic: 'creative.scene.version_created',
          schemaVersion: 1,
          idempotencyKey,
          aggregateType: 'CREATIVE_SCENE',
          aggregateId: testCreativeJobId,
          payload: {},
          occurredAt: new Date(),
          availableAt: new Date(),
        },
      };

      await expect(repo.createInitialScene(input)).rejects.toThrow();

      // Zero orphans verification: Outbox row must not exist
      const outbox = await p.outboxEvent.findUnique({ where: { idempotencyKey } });
      expect(outbox).toBeNull();

      // Scene with title 'Failing Scene Creation' must not exist
      const scene = await p.creativeScene.findFirst({
        where: { title: 'Failing Scene Creation' },
      });
      expect(scene).toBeNull();
    });
  });

  describe('PostgreSQL Immutability Triggers (Enforced by Database)', () => {
    let createdVersionId: string;
    let createdLayerId: string;
    let createdDepId: string;

    beforeAll(async () => {
      const repo = getRepo();
      const layers = createTestLayers();
      const sceneHash = 'a'.repeat(64);
      const dependencyHash = 'b'.repeat(64);

      const created = await repo.createInitialScene({
        creativeJobId: testCreativeJobId,
        title: 'Immutability Trigger Verification Scene',
        aspectRatio: '4:5',
        width: 1080,
        height: 1350,
        templateId: 'EDITORIAL_SPLIT',
        templateVersion: '1.0.0',
        language: 'EN',
        safeMargins: { top: 80, bottom: 120, left: 72, right: 72 },
        brandProfileVersionId: crypto.randomUUID(),
        sourceContentVersionId: testContentVersionId,
        productSnapshotId: testSnapshotId,
        sceneHash,
        dependencyHash,
        layers,
        dependencies: [
          {
            dependencyType: 'PRODUCT_SNAPSHOT',
            dependencyIdentifier: testSnapshotId,
            immutableDigest: '1'.repeat(64),
            sortOrder: 1,
          },
        ],
        outboxEvent: {
          topic: 'creative.scene.version_created',
          schemaVersion: 1,
          idempotencyKey: `trigger-test-${Date.now()}`,
          aggregateType: 'CREATIVE_SCENE',
          aggregateId: testCreativeJobId,
          payload: {},
          occurredAt: new Date(),
          availableAt: new Date(),
        },
      });

      createdVersionId = created.version.id;
      createdLayerId = created.version.layers[0]!.id;
      createdDepId = created.version.dependencies[0]!.id;
    });

    it('prohibits direct SQL UPDATE on creative_scene_versions', async () => {
      const p = getPrisma();
      await expect(
        p.$executeRaw`
          UPDATE creative_scene_versions
          SET template_version = '9.9.9'
          WHERE id = ${createdVersionId}::uuid
        `,
      ).rejects.toThrow(/is immutable: updates and deletes are prohibited/);
    });

    it('prohibits direct SQL DELETE on creative_scene_versions', async () => {
      const p = getPrisma();
      await expect(
        p.$executeRaw`
          DELETE FROM creative_scene_versions
          WHERE id = ${createdVersionId}::uuid
        `,
      ).rejects.toThrow(/is immutable: updates and deletes are prohibited/);
    });

    it('prohibits direct SQL UPDATE on scene_layers', async () => {
      const p = getPrisma();
      await expect(
        p.$executeRaw`
          UPDATE scene_layers
          SET name = 'Tampered Layer Name'
          WHERE id = ${createdLayerId}::uuid
        `,
      ).rejects.toThrow(/is immutable: updates and deletes are prohibited/);
    });

    it('prohibits direct SQL DELETE on scene_layers', async () => {
      const p = getPrisma();
      await expect(
        p.$executeRaw`
          DELETE FROM scene_layers
          WHERE id = ${createdLayerId}::uuid
        `,
      ).rejects.toThrow(/is immutable: updates and deletes are prohibited/);
    });

    it('prohibits direct SQL UPDATE on layer_dependencies', async () => {
      const p = getPrisma();
      await expect(
        p.$executeRaw`
          UPDATE layer_dependencies
          SET immutable_digest = ${'f'.repeat(64)}
          WHERE id = ${createdDepId}::uuid
        `,
      ).rejects.toThrow(/is immutable: updates and deletes are prohibited/);
    });

    it('prohibits direct SQL DELETE on layer_dependencies', async () => {
      const p = getPrisma();
      await expect(
        p.$executeRaw`
          DELETE FROM layer_dependencies
          WHERE id = ${createdDepId}::uuid
        `,
      ).rejects.toThrow(/is immutable: updates and deletes are prohibited/);
    });
  });

  describe('Revision Concurrency and PostgreSQL Row-Level Locking (SELECT ... FOR UPDATE)', () => {
    it('throws SceneConcurrencyConflictError when revision provides stale expectedVersionNumber', async () => {
      const repo = getRepo();
      const initial = await repo.createInitialScene({
        creativeJobId: testCreativeJobId,
        title: 'Stale Version Concurrency Test',
        aspectRatio: '4:5',
        width: 1080,
        height: 1350,
        templateId: 'EDITORIAL_SPLIT',
        templateVersion: '1.0.0',
        language: 'EN',
        safeMargins: { top: 80, bottom: 120, left: 72, right: 72 },
        brandProfileVersionId: crypto.randomUUID(),
        sourceContentVersionId: testContentVersionId,
        productSnapshotId: testSnapshotId,
        sceneHash: 'a'.repeat(64),
        dependencyHash: 'b'.repeat(64),
        layers: createTestLayers(),
        dependencies: [],
        outboxEvent: {
          topic: 'creative.scene.version_created',
          schemaVersion: 1,
          idempotencyKey: `concurrency-init-${Date.now()}`,
          aggregateType: 'CREATIVE_SCENE',
          aggregateId: testCreativeJobId,
          payload: {},
          occurredAt: new Date(),
          availableAt: new Date(),
        },
      });

      // Attempt revision claiming expectedVersionNumber is 0 (current is 1)
      const staleRevision: CreateRevisionAtomicInput = {
        sceneId: initial.scene.id,
        expectedVersionNumber: 0,
        templateId: 'EDITORIAL_SPLIT',
        templateVersion: '1.0.0',
        language: 'EN',
        safeMargins: { top: 80, bottom: 120, left: 72, right: 72 },
        brandProfileVersionId: crypto.randomUUID(),
        sourceContentVersionId: testContentVersionId,
        productSnapshotId: testSnapshotId,
        sceneHash: 'c'.repeat(64),
        dependencyHash: 'd'.repeat(64),
        changeReason: 'Stale attempt',
        operationCode: 'EDIT_TEXT',
        layers: createTestLayers(),
        dependencies: [],
        outboxEvents: [],
      };

      await expect(repo.createRevision(staleRevision)).rejects.toThrow(
        SceneConcurrencyConflictError,
      );
    });

    it('serializes concurrent revisions: exactly one succeeds, one conflicts, current_version advances cleanly to 2', async () => {
      const p = getPrisma();
      const repo = getRepo();

      const initial = await repo.createInitialScene({
        creativeJobId: testCreativeJobId,
        title: 'Concurrent Race Scene',
        aspectRatio: '4:5',
        width: 1080,
        height: 1350,
        templateId: 'EDITORIAL_SPLIT',
        templateVersion: '1.0.0',
        language: 'EN',
        safeMargins: { top: 80, bottom: 120, left: 72, right: 72 },
        brandProfileVersionId: crypto.randomUUID(),
        sourceContentVersionId: testContentVersionId,
        productSnapshotId: testSnapshotId,
        sceneHash: '1'.repeat(64),
        dependencyHash: '2'.repeat(64),
        layers: createTestLayers(),
        dependencies: [],
        outboxEvent: {
          topic: 'creative.scene.version_created',
          schemaVersion: 1,
          idempotencyKey: `race-init-${Date.now()}`,
          aggregateType: 'CREATIVE_SCENE',
          aggregateId: testCreativeJobId,
          payload: {},
          occurredAt: new Date(),
          availableAt: new Date(),
        },
      });

      const makeRevision = (reason: string, idemp: string): CreateRevisionAtomicInput => ({
        sceneId: initial.scene.id,
        expectedVersionNumber: 1, // Both racers target parent version 1
        templateId: 'EDITORIAL_SPLIT',
        templateVersion: '1.0.0',
        language: 'EN',
        safeMargins: { top: 80, bottom: 120, left: 72, right: 72 },
        brandProfileVersionId: crypto.randomUUID(),
        sourceContentVersionId: testContentVersionId,
        productSnapshotId: testSnapshotId,
        sceneHash: crypto.randomBytes(32).toString('hex'),
        dependencyHash: '0'.repeat(64),
        changeReason: reason,
        operationCode: 'EDIT_TEXT',
        layers: createTestLayers(),
        dependencies: [],
        outboxEvents: [
          {
            topic: 'creative.scene.version_created',
            schemaVersion: 1,
            idempotencyKey: idemp,
            aggregateType: 'CREATIVE_SCENE',
            aggregateId: initial.scene.id,
            payload: { changeReason: reason },
            occurredAt: new Date(),
            availableAt: new Date(),
          },
        ],
      });

      const rev1 = repo.createRevision(makeRevision('Racer A Edit', `racer-a-${Date.now()}`));
      const rev2 = repo.createRevision(makeRevision('Racer B Edit', `racer-b-${Date.now()}`));

      const results = await Promise.allSettled([rev1, rev2]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Invariant: Exactly one must succeed, exactly one must receive concurrency conflict
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const rejectedReason: unknown = (rejected[0] as PromiseRejectedResult).reason;
      expect(rejectedReason).toBeInstanceOf(SceneConcurrencyConflictError);

      // Verify database state: scene current_version_number is exactly 2
      const updatedScene = await p.creativeScene.findUniqueOrThrow({
        where: { id: initial.scene.id },
      });
      expect(updatedScene.currentVersionNumber).toBe(2);

      // Verify versions count: exactly 2 versions (version 1 and version 2)
      const versions = await p.creativeSceneVersion.findMany({
        where: { sceneId: initial.scene.id },
      });
      expect(versions).toHaveLength(2);
      expect(versions.map((v) => v.versionNumber).sort()).toEqual([1, 2]);
    });
  });

  describe('Normalized Dependency Invalidation and State Projection Audit Log', () => {
    it('appends immutable invalidation event, updates version state to STALE_FACTS, and emits outbox event', async () => {
      const p = getPrisma();
      const repo = getRepo();

      const initial = await repo.createInitialScene({
        creativeJobId: testCreativeJobId,
        title: 'Invalidation Audit Test Scene',
        aspectRatio: '4:5',
        width: 1080,
        height: 1350,
        templateId: 'EDITORIAL_SPLIT',
        templateVersion: '1.0.0',
        language: 'EN',
        safeMargins: { top: 80, bottom: 120, left: 72, right: 72 },
        brandProfileVersionId: crypto.randomUUID(),
        sourceContentVersionId: testContentVersionId,
        productSnapshotId: testSnapshotId,
        sceneHash: 'a'.repeat(64),
        dependencyHash: 'b'.repeat(64),
        layers: createTestLayers(),
        dependencies: [
          {
            dependencyType: 'PRODUCT_SNAPSHOT',
            dependencyIdentifier: testSnapshotId,
            immutableDigest: '1'.repeat(64),
            sortOrder: 1,
          },
        ],
        outboxEvent: {
          topic: 'creative.scene.version_created',
          schemaVersion: 1,
          idempotencyKey: `inval-init-${Date.now()}`,
          aggregateType: 'CREATIVE_SCENE',
          aggregateId: testCreativeJobId,
          payload: {},
          occurredAt: new Date(),
          availableAt: new Date(),
        },
      });

      const outboxIdemp = `inval-outbox-${Date.now()}`;
      const invalInput: RecordDependencyInvalidationInput = {
        sceneVersionId: initial.version.id,
        reason: 'Price changed in authoritative catalog snapshot',
        divergedDependencyType: 'PRODUCT_SNAPSHOT',
        expectedDigest: '1'.repeat(64),
        actualDigest: '9'.repeat(64),
        recordedByUserId: testUserId,
        outboxEvent: {
          topic: 'creative.approval.rendered_ineligible',
          schemaVersion: 1,
          idempotencyKey: outboxIdemp,
          aggregateType: 'CREATIVE_SCENE_VERSION',
          aggregateId: initial.version.id,
          payload: { reason: 'Price changed in authoritative catalog snapshot' },
          occurredAt: new Date(),
          availableAt: new Date(),
        },
      };

      const auditEvent = await repo.recordDependencyInvalidation(invalInput);

      expect(auditEvent.id).toBeDefined();
      expect(auditEvent.divergedDependencyType).toBe('PRODUCT_SNAPSHOT');
      expect(auditEvent.expectedDigest).toBe('1'.repeat(64));
      expect(auditEvent.actualDigest).toBe('9'.repeat(64));

      // Verify mutable state projection updated
      const stateRow = await p.sceneVersionState.findUniqueOrThrow({
        where: { sceneVersionId: initial.version.id },
      });
      expect(stateRow.status).toBe('STALE_FACTS');
      expect(stateRow.isExportEligible).toBe(false);
      expect(stateRow.invalidationReason).toBe(invalInput.reason);
      expect(stateRow.invalidatedAt).not.toBeNull();

      // Verify outbox event emitted
      const outboxRow = await p.outboxEvent.findUnique({
        where: { idempotencyKey: outboxIdemp },
      });
      expect(outboxRow).not.toBeNull();
      expect(outboxRow?.topic).toBe('creative.approval.rendered_ineligible');

      // Verify audit event itself is protected by immutability trigger!
      await expect(
        p.$executeRaw`
          UPDATE scene_invalidation_events
          SET reason = 'Tampered Reason'
          WHERE id = ${auditEvent.id}::uuid
        `,
      ).rejects.toThrow(/is immutable: updates and deletes are prohibited/);

      // Verify audit event DELETE is also prohibited by immutability trigger!
      await expect(
        p.$executeRaw`
          DELETE FROM scene_invalidation_events
          WHERE id = ${auditEvent.id}::uuid
        `,
      ).rejects.toThrow(/is immutable: updates and deletes are prohibited/);
    });
  });

  describe('W20 Architectural Constraints and Transactional Guarantees', () => {
    it('links hero dependency to hero layer ID and leaves global dependencies with null sceneLayerId', async () => {
      const repo = getRepo();
      const layers = createTestLayers();
      const jobId = await createTestJob();

      const initial = await repo.createInitialScene({
        creativeJobId: jobId,
        title: 'Hero Layer Dependency Linkage Test',
        aspectRatio: '4:5',
        width: 1080,
        height: 1350,
        templateId: 'EDITORIAL_SPLIT',
        templateVersion: '1.0.0',
        language: 'EN',
        safeMargins: { top: 80, bottom: 120, left: 72, right: 72 },
        brandProfileVersionId: crypto.randomUUID(),
        sourceContentVersionId: testContentVersionId,
        productSnapshotId: testSnapshotId,
        sceneHash: '1'.repeat(64),
        dependencyHash: '2'.repeat(64),
        layers,
        dependencies: [
          {
            dependencyType: 'PRODUCT_SNAPSHOT',
            dependencyIdentifier: testSnapshotId,
            immutableDigest: '1'.repeat(64),
            sortOrder: 1,
          },
          {
            dependencyType: 'PRODUCT_ASSET',
            dependencyIdentifier: crypto.randomUUID(),
            evidenceIdentifier: 'cas/cutouts/product.png',
            immutableDigest: '2'.repeat(64),
            sortOrder: 2,
            sceneLayerKey: 'hero_01',
          },
        ],
        outboxEvent: {
          topic: 'creative.scene.version_created',
          schemaVersion: 1,
          idempotencyKey: `idemp-link-${Date.now()}`,
          aggregateType: 'CREATIVE_SCENE',
          aggregateId: jobId,
          payload: {},
          occurredAt: new Date(),
          availableAt: new Date(),
        },
      });

      const heroLayer = initial.version.layers.find((l) => l.layerKey === 'hero_01')!;
      expect(heroLayer).toBeDefined();

      const heroDep = initial.version.dependencies.find((d) => d.dependencyType === 'PRODUCT_ASSET')!;
      expect(heroDep.sceneLayerId).toBe(heroLayer.id);

      const snapshotDep = initial.version.dependencies.find((d) => d.dependencyType === 'PRODUCT_SNAPSHOT')!;
      expect(snapshotDep.sceneLayerId).toBeNull();
    });

    it('rejects dependency with unknown sceneLayerKey fail-closed with InvalidSceneLayerError', async () => {
      const repo = getRepo();
      const layers = createTestLayers();
      const jobId = await createTestJob();

      await expect(
        repo.createInitialScene({
          creativeJobId: jobId,
          title: 'Unknown Key Test',
          aspectRatio: '4:5',
          width: 1080,
          height: 1350,
          templateId: 'EDITORIAL_SPLIT',
          templateVersion: '1.0.0',
          language: 'EN',
          safeMargins: { top: 80, bottom: 120, left: 72, right: 72 },
          brandProfileVersionId: crypto.randomUUID(),
          sourceContentVersionId: testContentVersionId,
          productSnapshotId: testSnapshotId,
          sceneHash: '3'.repeat(64),
          dependencyHash: '4'.repeat(64),
          layers,
          dependencies: [
            {
              dependencyType: 'PRODUCT_ASSET',
              dependencyIdentifier: crypto.randomUUID(),
              immutableDigest: '5'.repeat(64),
              sortOrder: 1,
              sceneLayerKey: 'nonexistent_layer_key',
            },
          ],
          outboxEvent: {
            topic: 'creative.scene.version_created',
            schemaVersion: 1,
            idempotencyKey: `idemp-unknown-${Date.now()}`,
            aggregateType: 'CREATIVE_SCENE',
            aggregateId: jobId,
            payload: {},
            occurredAt: new Date(),
            availableAt: new Date(),
          },
        }),
      ).rejects.toThrow(InvalidSceneLayerError);
    });

    it('enforces composite foreign key: rejects cross-version layer dependency references at database level', async () => {
      const p = getPrisma();
      const repo = getRepo();
      const jobId = await createTestJob();

      // 1. Create Scene Version 1 with layers
      const initial = await repo.createInitialScene({
        creativeJobId: jobId,
        title: 'Cross-Version FK Test',
        aspectRatio: '4:5',
        width: 1080,
        height: 1350,
        templateId: 'EDITORIAL_SPLIT',
        templateVersion: '1.0.0',
        language: 'EN',
        safeMargins: { top: 80, bottom: 120, left: 72, right: 72 },
        brandProfileVersionId: crypto.randomUUID(),
        sourceContentVersionId: testContentVersionId,
        productSnapshotId: testSnapshotId,
        sceneHash: '6'.repeat(64),
        dependencyHash: '7'.repeat(64),
        layers: createTestLayers(),
        dependencies: [],
        outboxEvent: {
          topic: 'creative.scene.version_created',
          schemaVersion: 1,
          idempotencyKey: `idemp-v1-${Date.now()}`,
          aggregateType: 'CREATIVE_SCENE',
          aggregateId: jobId,
          payload: {},
          occurredAt: new Date(),
          availableAt: new Date(),
        },
      });

      const layerFromVersion1 = initial.version.layers[0]!;

      // 2. Create Scene Version 2
      const version2 = await repo.createRevision({
        sceneId: initial.scene.id,
        expectedVersionNumber: 1,
        templateId: 'EDITORIAL_SPLIT',
        templateVersion: '1.0.0',
        language: 'EN',
        safeMargins: { top: 80, bottom: 120, left: 72, right: 72 },
        brandProfileVersionId: crypto.randomUUID(),
        sourceContentVersionId: testContentVersionId,
        productSnapshotId: testSnapshotId,
        sceneHash: '8'.repeat(64),
        dependencyHash: '9'.repeat(64),
        changeReason: 'Create version 2',
        operationCode: 'EDIT_LAYOUT',
        layers: createTestLayers(),
        dependencies: [],
        outboxEvents: [
          {
            topic: 'creative.scene.version_created',
            schemaVersion: 1,
            idempotencyKey: `idemp-v2-${Date.now()}`,
            aggregateType: 'CREATIVE_SCENE',
            aggregateId: initial.scene.id,
            payload: {},
            occurredAt: new Date(),
            availableAt: new Date(),
          },
        ],
      });

      // 3. Attempt to insert a dependency in Version 2 referencing a layer belonging to Version 1!
      // This MUST be rejected by PostgreSQL composite foreign key constraint (scene_layer_id, scene_version_id).
      const illegalDependencyId = crypto.randomUUID();
      await expect(
        p.$executeRaw`
          INSERT INTO layer_dependencies (
            id, scene_version_id, scene_layer_id, dependency_type,
            dependency_identifier, immutable_digest, sort_order
          ) VALUES (
            ${illegalDependencyId}::uuid,
            ${version2.id}::uuid,
            ${layerFromVersion1.id}::uuid,
            'PRODUCT_ASSET',
            'asset-123',
            ${'a'.repeat(64)},
            1
          )
        `,
      ).rejects.toThrow();
    });

    it('rolls back completely if outbox write fails during initial scene creation (zero orphans)', async () => {
      const p = getPrisma();
      const repo = getRepo();
      const duplicateKey = `outbox-dup-${Date.now()}`;

      // Insert pre-existing outbox event with duplicateKey to force a unique constraint violation
      await p.outboxEvent.create({
        data: {
          topic: 'preexisting.event',
          schemaVersion: 1,
          idempotencyKey: duplicateKey,
          aggregateType: 'TEST',
          aggregateId: 'test-1',
          payload: {},
          occurredAt: new Date(),
          availableAt: new Date(),
        },
      });

      const failedJobId = await createTestJob();

      // Attempt initial scene creation with colliding outbox idempotencyKey
      await expect(
        repo.createInitialScene({
          creativeJobId: failedJobId,
          title: 'Scene Destined to Rollback',
          aspectRatio: '4:5',
          width: 1080,
          height: 1350,
          templateId: 'EDITORIAL_SPLIT',
          templateVersion: '1.0.0',
          language: 'EN',
          safeMargins: { top: 80, bottom: 120, left: 72, right: 72 },
          brandProfileVersionId: crypto.randomUUID(),
          sourceContentVersionId: testContentVersionId,
          productSnapshotId: testSnapshotId,
          sceneHash: 'a'.repeat(64),
          dependencyHash: 'b'.repeat(64),
          layers: createTestLayers(),
          dependencies: [
            {
              dependencyType: 'PRODUCT_SNAPSHOT',
              dependencyIdentifier: testSnapshotId,
              immutableDigest: '1'.repeat(64),
              sortOrder: 1,
            },
          ],
          outboxEvent: {
            topic: 'creative.scene.version_created',
            schemaVersion: 1,
            idempotencyKey: duplicateKey, // Conflict!
            aggregateType: 'CREATIVE_SCENE',
            aggregateId: failedJobId,
            payload: {},
            occurredAt: new Date(),
            availableAt: new Date(),
          },
        }),
      ).rejects.toThrow();

      // Zero orphans: Verify no scene, version, layers, dependencies, or state exist!
      const scene = await p.creativeScene.findFirst({
        where: { creativeJobId: failedJobId },
      });
      expect(scene).toBeNull();

      const versionCount = await p.creativeSceneVersion.count({
        where: { scene: { creativeJobId: failedJobId } },
      });
      expect(versionCount).toBe(0);
    });

    it('rolls back completely on outbox write failure during revision (version pointer preserved, zero orphans)', async () => {
      const p = getPrisma();
      const repo = getRepo();
      const jobId = await createTestJob();

      const initial = await repo.createInitialScene({
        creativeJobId: jobId,
        title: 'Initial Scene Before Failed Revision',
        aspectRatio: '4:5',
        width: 1080,
        height: 1350,
        templateId: 'EDITORIAL_SPLIT',
        templateVersion: '1.0.0',
        language: 'EN',
        safeMargins: { top: 80, bottom: 120, left: 72, right: 72 },
        brandProfileVersionId: crypto.randomUUID(),
        sourceContentVersionId: testContentVersionId,
        productSnapshotId: testSnapshotId,
        sceneHash: 'a'.repeat(64),
        dependencyHash: 'b'.repeat(64),
        layers: createTestLayers(),
        dependencies: [],
        outboxEvent: {
          topic: 'creative.scene.version_created',
          schemaVersion: 1,
          idempotencyKey: `idemp-rev-init-${Date.now()}`,
          aggregateType: 'CREATIVE_SCENE',
          aggregateId: jobId,
          payload: {},
          occurredAt: new Date(),
          availableAt: new Date(),
        },
      });

      const duplicateKey = `idemp-rev-dup-${Date.now()}`;
      await p.outboxEvent.create({
        data: {
          topic: 'preexisting.event',
          schemaVersion: 1,
          idempotencyKey: duplicateKey,
          aggregateType: 'TEST',
          aggregateId: 'test-2',
          payload: {},
          occurredAt: new Date(),
          availableAt: new Date(),
        },
      });

      // Attempt revision with colliding outbox event
      await expect(
        repo.createRevision({
          sceneId: initial.scene.id,
          expectedVersionNumber: 1,
          templateId: 'EDITORIAL_SPLIT',
          templateVersion: '1.0.0',
          language: 'EN',
          safeMargins: { top: 80, bottom: 120, left: 72, right: 72 },
          brandProfileVersionId: crypto.randomUUID(),
          sourceContentVersionId: testContentVersionId,
          productSnapshotId: testSnapshotId,
          sceneHash: 'c'.repeat(64),
          dependencyHash: 'd'.repeat(64),
          changeReason: 'Should fail and rollback',
          operationCode: 'EDIT_LAYOUT',
          layers: createTestLayers(),
          dependencies: [],
          outboxEvents: [
            {
              topic: 'creative.scene.version_created',
              schemaVersion: 1,
              idempotencyKey: duplicateKey, // Conflict!
              aggregateType: 'CREATIVE_SCENE',
              aggregateId: initial.scene.id,
              payload: {},
              occurredAt: new Date(),
              availableAt: new Date(),
            },
          ],
        }),
      ).rejects.toThrow();

      // Verify version pointer on scene is NOT incremented
      const sceneRow = await p.creativeScene.findUniqueOrThrow({
        where: { id: initial.scene.id },
      });
      expect(sceneRow.currentVersionNumber).toBe(1);

      // Verify no version 2 rows exist
      const versions = await p.creativeSceneVersion.findMany({
        where: { sceneId: initial.scene.id },
      });
      expect(versions).toHaveLength(1);
      expect(versions[0]?.versionNumber).toBe(1);
    });

    it('rejects empty outbox events collection during revision fail-closed', async () => {
      const repo = getRepo();
      const jobId = await createTestJob();

      const initial = await repo.createInitialScene({
        creativeJobId: jobId,
        title: 'Empty Outbox Test Scene',
        aspectRatio: '4:5',
        width: 1080,
        height: 1350,
        templateId: 'EDITORIAL_SPLIT',
        templateVersion: '1.0.0',
        language: 'EN',
        safeMargins: { top: 80, bottom: 120, left: 72, right: 72 },
        brandProfileVersionId: crypto.randomUUID(),
        sourceContentVersionId: testContentVersionId,
        productSnapshotId: testSnapshotId,
        sceneHash: 'e'.repeat(64),
        dependencyHash: 'f'.repeat(64),
        layers: createTestLayers(),
        dependencies: [],
        outboxEvent: {
          topic: 'creative.scene.version_created',
          schemaVersion: 1,
          idempotencyKey: `idemp-empty-init-${Date.now()}`,
          aggregateType: 'CREATIVE_SCENE',
          aggregateId: jobId,
          payload: {},
          occurredAt: new Date(),
          availableAt: new Date(),
        },
      });

      await expect(
        repo.createRevision({
          sceneId: initial.scene.id,
          expectedVersionNumber: 1,
          templateId: 'EDITORIAL_SPLIT',
          templateVersion: '1.0.0',
          language: 'EN',
          safeMargins: { top: 80, bottom: 120, left: 72, right: 72 },
          brandProfileVersionId: crypto.randomUUID(),
          sourceContentVersionId: testContentVersionId,
          productSnapshotId: testSnapshotId,
          sceneHash: 'g'.repeat(64),
          dependencyHash: 'h'.repeat(64),
          changeReason: 'Empty outbox test',
          operationCode: 'EDIT_LAYOUT',
          layers: createTestLayers(),
          dependencies: [],
          outboxEvents: [] as unknown as [OutboxEventDraft, ...OutboxEventDraft[]],
        }),
      ).rejects.toThrow(InvalidSceneLayerError);
    });
  });
});
