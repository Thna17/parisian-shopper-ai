import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import {
  type CreateInitialSceneAtomicInput,
  type CreateRevisionAtomicInput,
  type RecordDependencyInvalidationInput,
  CreativeSceneNotFoundError,
  SceneConcurrencyConflictError,
} from '@parisian-shopper/application';
import { Prisma } from '@prisma/client';
import { PrismaCreativeSceneRepository } from './prisma-creative-scene.repository.js';
import { type PrismaService } from '../prisma.service.js';

type AsyncMock<T = unknown> = jest.MockedFunction<(...args: unknown[]) => Promise<T>>;

interface MockModel {
  create: AsyncMock;
  findUnique: AsyncMock;
  findFirst: AsyncMock;
  findMany: AsyncMock;
  findUniqueOrThrow: AsyncMock;
  update: AsyncMock;
}

interface MockPrismaClient {
  creativeScene: MockModel;
  creativeSceneVersion: MockModel;
  sceneLayer: MockModel;
  layerDependency: MockModel;
  sceneVersionState: MockModel;
  sceneInvalidationEvent: MockModel;
  outboxEvent: MockModel;
  $queryRaw: AsyncMock;
  $transaction: jest.MockedFunction<(callback: (tx: MockPrismaClient) => Promise<unknown>) => Promise<unknown>>;
}

describe('PrismaCreativeSceneRepository', () => {
  let repository: PrismaCreativeSceneRepository;
  let mockPrisma: MockPrismaClient;

  beforeEach(() => {
    mockPrisma = {
      creativeScene: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      creativeSceneVersion: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      sceneLayer: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      layerDependency: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      sceneVersionState: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      sceneInvalidationEvent: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      outboxEvent: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      $queryRaw: jest.fn(),
      $transaction: jest.fn(async (callback: (tx: MockPrismaClient) => Promise<unknown>) => await callback(mockPrisma)),
    };
    repository = new PrismaCreativeSceneRepository(mockPrisma as unknown as PrismaService);
  });

  describe('createInitialScene', () => {
    const sampleInput: CreateInitialSceneAtomicInput = {
      creativeJobId: 'job-1',
      campaignId: 'camp-1',
      title: 'Initial Title',
      aspectRatio: '4:5',
      width: 1080,
      height: 1350,
      templateId: 'EDITORIAL_SPLIT',
      templateVersion: '1.0.0',
      language: 'EN',
      safeMargins: { top: 80, bottom: 120, left: 72, right: 72 },
      brandProfileVersionId: 'bp-1',
      sourceContentVersionId: 'cv-1',
      productSnapshotId: 'ps-1',
      sceneHash: 'a'.repeat(64),
      dependencyHash: 'b'.repeat(64),
      layers: [
        {
          layerKey: 'bg_01',
          layerGroup: 'BACKGROUND',
          layerType: 'GENERATED_BACKGROUND',
          name: 'Background',
          zIndex: 0,
          visible: true,
          opacity: 1,
          blendMode: 'NORMAL',
          bounds: { x: 0, y: 0, width: 1080, height: 1350 },
          payloadSchemaVersion: 1,
          sortOrder: 0,
          payload: { assetType: 'GENERATED_BACKGROUND', casStorageKey: 'cas/bg.png', sha256: 'a'.repeat(64), provider: 'mock-ai', model: 'fixture-v1', promptVersion: '1.0' },
        },
      ],
      dependencies: [
        {
          dependencyType: 'PRODUCT_SNAPSHOT',
          dependencyIdentifier: 'ps-1',
          immutableDigest: '0'.repeat(64),
          sortOrder: 1,
        },
      ],
      outboxEvent: {
        topic: 'creative.scene.version_created',
        schemaVersion: 1,
        idempotencyKey: 'idemp-1',
        aggregateType: 'CREATIVE_SCENE',
        aggregateId: 'job-1',
        payload: { title: 'Initial Title' },
        occurredAt: new Date(),
        availableAt: new Date(),
      },
    };

    it('creates scene, version 1, layers, dependencies, state, and outbox event in single transaction', async () => {
      const now = new Date();
      mockPrisma.creativeScene.create.mockResolvedValue({
        id: 'scene-1',
        creativeJobId: 'job-1',
        campaignId: 'camp-1',
        title: 'Initial Title',
        currentVersionNumber: 1,
        createdAt: now,
        updatedAt: now,
      });

      mockPrisma.creativeSceneVersion.create.mockResolvedValue({
        id: 'ver-1',
        sceneId: 'scene-1',
        versionNumber: 1,
      });

      mockPrisma.sceneLayer.create.mockResolvedValue({
        id: 'layer-1',
        sceneVersionId: 'ver-1',
      });

      mockPrisma.layerDependency.create.mockResolvedValue({
        id: 'dep-1',
        sceneVersionId: 'ver-1',
      });

      mockPrisma.sceneVersionState.create.mockResolvedValue({
        id: 'state-1',
        sceneVersionId: 'ver-1',
        status: 'DRAFT',
        isExportEligible: false,
      });

      mockPrisma.outboxEvent.create.mockResolvedValue({ id: 'outbox-1' });

      mockPrisma.creativeSceneVersion.findUniqueOrThrow.mockResolvedValue({
        id: 'ver-1',
        sceneId: 'scene-1',
        versionNumber: 1,
        parentVersionId: null,
        aspectRatio: '4:5',
        width: 1080,
        height: 1350,
        templateId: 'EDITORIAL_SPLIT',
        templateVersion: '1.0.0',
        stylePresetId: null,
        language: 'EN',
        safeMargins: { top: 80, bottom: 120, left: 72, right: 72 },
        brandProfileVersionId: 'bp-1',
        sourceContentVersionId: 'cv-1',
        productSnapshotId: 'ps-1',
        sceneHash: 'a'.repeat(64),
        dependencyHash: 'b'.repeat(64),
        changeReason: 'Initial scene composition',
        operationCode: 'INITIAL_DRAFT',
        requestedByUserId: null,
        metadata: null,
        createdAt: now,
        layers: [
          {
            id: 'layer-1',
            sceneVersionId: 'ver-1',
            layerKey: 'bg_01',
            layerGroup: 'BACKGROUND',
            layerType: 'GENERATED_BACKGROUND',
            name: 'Background',
            zIndex: 0,
            visible: true,
            opacity: 1,
            blendMode: 'NORMAL',
            bounds: { x: 0, y: 0, width: 1080, height: 1350 },
            payload: { assetType: 'GENERATED_BACKGROUND', casStorageKey: 'cas/bg.png', sha256: 'a'.repeat(64), provider: 'mock-ai', model: 'fixture-v1', promptVersion: '1.0' },
            payloadSchemaVersion: 1,
            layerHash: 'c'.repeat(64),
            sortOrder: 0,
            createdAt: now,
          },
        ],
        dependencies: [
          {
            id: 'dep-1',
            sceneVersionId: 'ver-1',
            sceneLayerId: null,
            dependencyType: 'PRODUCT_SNAPSHOT',
            dependencyIdentifier: 'ps-1',
            evidenceIdentifier: null,
            immutableDigest: '0'.repeat(64),
            sortOrder: 1,
            createdAt: now,
          },
        ],
        state: {
          id: 'state-1',
          sceneVersionId: 'ver-1',
          status: 'DRAFT',
          isExportEligible: false,
          invalidationReason: null,
          invalidatedAt: null,
          updatedAt: now,
        },
      });

      const result = await repository.createInitialScene(sampleInput);

      expect(result.scene.id).toBe('scene-1');
      expect(result.version.id).toBe('ver-1');
      expect(result.version.layers).toHaveLength(1);
      expect(result.version.dependencies).toHaveLength(1);
      expect(result.version.state?.status).toBe('DRAFT');
      expect(mockPrisma.outboxEvent.create).toHaveBeenCalled();
    });
  });

  describe('createRevision', () => {
    const sampleRevisionInput: CreateRevisionAtomicInput = {
      sceneId: 'scene-1',
      expectedVersionNumber: 1,
      templateId: 'EDITORIAL_SPLIT',
      templateVersion: '1.0.0',
      language: 'EN',
      safeMargins: { top: 80, bottom: 120, left: 72, right: 72 },
      brandProfileVersionId: 'bp-1',
      sourceContentVersionId: 'cv-1',
      productSnapshotId: 'ps-1',
      sceneHash: 'd'.repeat(64),
      dependencyHash: 'e'.repeat(64),
      changeReason: 'Updated promotion text',
      operationCode: 'EDIT_TEXT',
      layers: [],
      dependencies: [],
      outboxEvents: [
        {
          topic: 'creative.scene.version_created',
          schemaVersion: 1,
          idempotencyKey: 'idemp-2',
          aggregateType: 'CREATIVE_SCENE',
          aggregateId: 'scene-1',
          payload: {},
          occurredAt: new Date(),
          availableAt: new Date(),
        },
      ],
    };

    it('throws CreativeSceneNotFoundError if scene is not found during row locking', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      await expect(repository.createRevision(sampleRevisionInput)).rejects.toThrow(
        CreativeSceneNotFoundError,
      );
    });

    it('throws SceneConcurrencyConflictError if expectedVersionNumber does not match locked scene', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ id: 'scene-1', current_version_number: 2 }]);
      await expect(repository.createRevision(sampleRevisionInput)).rejects.toThrow(
        SceneConcurrencyConflictError,
      );
    });

    it('catches Prisma P2002 unique constraint error and maps to SceneConcurrencyConflictError', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ id: 'scene-1', current_version_number: 1 }]);
      mockPrisma.creativeSceneVersion.findUnique.mockResolvedValue({
        id: 'ver-1',
        sceneId: 'scene-1',
        versionNumber: 1,
        aspectRatio: '4:5',
        width: 1080,
        height: 1350,
      });

      const prismaError = new Prisma.PrismaClientKnownRequestError('Unique constraint violation', {
        code: 'P2002',
        clientVersion: '6.19.3',
      });
      mockPrisma.creativeSceneVersion.create.mockRejectedValue(prismaError);

      await expect(repository.createRevision(sampleRevisionInput)).rejects.toThrow(
        SceneConcurrencyConflictError,
      );
    });
  });

  describe('recordDependencyInvalidation', () => {
    const sampleInvalidationInput: RecordDependencyInvalidationInput = {
      sceneVersionId: 'ver-1',
      reason: 'Price changed in catalog snapshot',
      divergedDependencyType: 'PRODUCT_SNAPSHOT',
      expectedDigest: '0'.repeat(64),
      actualDigest: 'f'.repeat(64),
      recordedByUserId: 'user-system',
    };

    it('records invalidation event and updates version state projection in single transaction', async () => {
      const now = new Date();
      mockPrisma.creativeSceneVersion.findUnique.mockResolvedValue({
        id: 'ver-1',
        sceneId: 'scene-1',
        versionNumber: 1,
      });

      mockPrisma.sceneInvalidationEvent.create.mockResolvedValue({
        id: 'inval-1',
        sceneVersionId: 'ver-1',
        reason: sampleInvalidationInput.reason,
        divergedDependencyType: 'PRODUCT_SNAPSHOT',
        expectedDigest: '0'.repeat(64),
        actualDigest: 'f'.repeat(64),
        recordedByUserId: 'user-system',
        metadata: null,
        recordedAt: now,
      });

      mockPrisma.sceneVersionState.update.mockResolvedValue({});

      const result = await repository.recordDependencyInvalidation(sampleInvalidationInput);

      expect(result.id).toBe('inval-1');
      expect(result.reason).toBe(sampleInvalidationInput.reason);
      expect(mockPrisma.sceneVersionState.update).toHaveBeenCalledWith({
        where: { sceneVersionId: 'ver-1' },
        data: expect.objectContaining({
          status: 'STALE_FACTS',
          isExportEligible: false,
          invalidationReason: sampleInvalidationInput.reason,
        }),
      });
    });
  });

  describe('findById and queries', () => {
    it('returns null when scene not found', async () => {
      mockPrisma.creativeScene.findUnique.mockResolvedValue(null);
      const res = await repository.findById('nonexistent');
      expect(res).toBeNull();
    });

    it('returns mapped record when scene found', async () => {
      const now = new Date();
      mockPrisma.creativeScene.findUnique.mockResolvedValue({
        id: 'scene-1',
        creativeJobId: 'job-1',
        campaignId: null,
        title: 'Title',
        currentVersionNumber: 2,
        createdAt: now,
        updatedAt: now,
      });

      const res = await repository.findById('scene-1');
      expect(res?.id).toBe('scene-1');
      expect(res?.currentVersionNumber).toBe(2);
    });

    it('lists versions ordered by versionNumber', async () => {
      const now = new Date();
      mockPrisma.creativeSceneVersion.findMany.mockResolvedValue([
        {
          id: 'ver-1',
          sceneId: 'scene-1',
          versionNumber: 1,
          parentVersionId: null,
          aspectRatio: '4:5',
          width: 1080,
          height: 1350,
          templateId: 'EDITORIAL_SPLIT',
          templateVersion: '1.0.0',
          stylePresetId: null,
          language: 'EN',
          safeMargins: { top: 80, bottom: 120, left: 72, right: 72 },
          brandProfileVersionId: 'bp-1',
          sourceContentVersionId: 'cv-1',
          productSnapshotId: 'ps-1',
          sceneHash: 'a'.repeat(64),
          dependencyHash: 'b'.repeat(64),
          changeReason: 'Initial',
          operationCode: 'INITIAL_DRAFT',
          requestedByUserId: null,
          metadata: null,
          createdAt: now,
          layers: [],
          dependencies: [],
          state: {
            id: 'state-1',
            sceneVersionId: 'ver-1',
            status: 'DRAFT',
            isExportEligible: false,
            invalidationReason: null,
            invalidatedAt: null,
            updatedAt: now,
          },
        },
      ]);

      const list = await repository.listVersions('scene-1');
      expect(list).toHaveLength(1);
      expect(list[0]?.versionNumber).toBe(1);
    });
  });
});
