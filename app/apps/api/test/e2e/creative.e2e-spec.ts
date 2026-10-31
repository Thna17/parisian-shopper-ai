/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
import { createHash } from 'node:crypto';
import { type Server } from 'node:http';
import { jest } from '@jest/globals';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  Argon2PasswordHasher,
  type AuthenticatedUserAccount,
  CAMPAIGN_REPOSITORY,
  CONTENT_GENERATION_REPOSITORY,
  type ContentGenerationRepository,
  type ContentVersion,
  CREATIVE_JOB_REPOSITORY,
  type CreativeJobRepository,
  CREATIVE_SCENE_REPOSITORY,
  type CreativeSceneRepository,
  FICTIONAL_PRODUCTS,
  PASSWORD_CREDENTIAL_REPOSITORY,
  PASSWORD_HASHER,
  PRODUCT_SNAPSHOT_REPOSITORY,
  type ProductSnapshot,
  type ProductSnapshotRepository,
  PRODUCT_ASSET_REPOSITORY,
  PRODUCT_ASSET_ELIGIBILITY_EVALUATOR,
  type ProductAssetEligibilityEvaluator,
  BRAND_RULE_REPOSITORY,
  type BrandRuleRepository,
  resolvePermissionsForRoles,
  USER_ACCOUNT_REPOSITORY,
  type UserAccountRepository,
  USER_SESSION_REPOSITORY,
  type UserSessionRecord,
  type UserSessionRepository,
  VISUAL_ASSET_REPOSITORY,
  type VisualAssetRepository,
  VISUAL_VALIDATION_REPOSITORY,
  type VisualValidationRepository,
  ASSET_STORAGE,
  type AssetStoragePort,
} from '@parisian-shopper/application';
import { DatabaseHealthIndicator, PrismaService } from '@parisian-shopper/database';
import {
  ContentGenerationQueue,
  CreativeGenerationQueue,
  ValkeyConnectionService,
} from '@parisian-shopper/jobs';
import request from 'supertest';

import { AppModule } from '../../src/app.module.js';
import { configureApi } from '../../src/bootstrap.js';

describe('Production Creative Studio & Composition API Integration (e2e)', () => {
  let application: INestApplication;
  let server: Server;

  // Actors
  const editorUserId = '00000000-0000-4000-8000-000000000001';
  const approverUserId = '00000000-0000-4000-8000-000000000002';
  const viewerUserId = '00000000-0000-4000-8000-000000000003';

  // Sessions
  const editorSessionToken = 'test-ps-session-editor';
  const editorTokenHash = createHash('sha256').update(editorSessionToken).digest('hex');

  const approverSessionToken = 'test-ps-session-approver';
  const approverTokenHash = createHash('sha256').update(approverSessionToken).digest('hex');

  const viewerSessionToken = 'test-ps-session-viewer';
  const viewerTokenHash = createHash('sha256').update(viewerSessionToken).digest('hex');

  const csrfToken = 'test-csrf-token-12345';
  const sampleSnapshot: ProductSnapshot = {
    id: '4b68e914-7e04-4ec5-b6d8-f860189d2d01',
    product: {
      ...FICTIONAL_PRODUCTS[0]!,
      product: {
        ...FICTIONAL_PRODUCTS[0]!.product,
        price: '38.00',
        priceUsd: 38.0,
      },
    },
    snapshotHash: 'hash-abc-001',
    normalizerVersion: 'phase-1b-v1',
    createdAt: new Date('2026-10-24T12:00:00.000Z'),
  };

  const testJobId = '00000000-0000-4000-8000-000000000010';
  const testVersionId = '00000000-0000-4000-8000-000000000011';
  const testSceneId = '00000000-0000-4000-8000-000000000020';
  const testCampaignId = '00000000-0000-4000-8000-000000000099';

  const heroBuffer = Buffer.from('mock-hero-cutout-png-data');
  const heroSha256 = createHash('sha256').update(heroBuffer).digest('hex');

  const sampleVersion: ContentVersion = {
    id: testVersionId,
    contentJobId: testJobId,
    versionNumber: 1,
    brandRuleVersionId: 'rule-001',
    productSnapshotId: sampleSnapshot.id,
    generationAttemptId: '00000000-0000-4000-8000-000000000012',
    provider: 'fake',
    model: 'deterministic-test',
    promptVersion: '1.0',
    structuredOutput: {
      headline: 'Moonlit River Luxury EDP',
      english_caption: 'A sensory voyage to Grasse with notes of Damask rose.',
      khmer_caption: null,
      cta: 'Discover the Essence',
      hashtags: ['#MoonlitRiver', '#ParisianShopper'],
      creative_brief: 'Luxury fragrance spotlight',
      facts_used: ['Moonlit River', '38.00'],
      warnings: [],
      missing_information: [],
    },
    createdAt: new Date('2026-10-29T10:00:03.000Z'),
  };

  const sampleScene = {
    id: testSceneId,
    creativeJobId: testJobId,
    campaignId: testCampaignId,
    title: 'Moonlit River Launch Poster',
    currentVersionNumber: 1,
    createdAt: new Date('2026-10-29T10:00:00.000Z'),
    updatedAt: new Date('2026-10-29T10:00:00.000Z'),
  };

  const sampleSceneVersion = {
    id: 'ver-scene-001',
    sceneId: testSceneId,
    versionNumber: 1,
    parentVersionId: null,
    aspectRatio: '1:1' as const,
    width: 1080,
    height: 1080,
    templateId: 'EDITORIAL_SPLIT' as const,
    templateVersion: '1.0.0',
    stylePresetId: null,
    language: 'EN' as const,
    safeMargins: { top: 80, bottom: 80, left: 80, right: 80 },
    brandProfileVersionId: 'rule-001',
    sourceContentVersionId: testVersionId,
    productSnapshotId: sampleSnapshot.id,
    sceneHash: 'a'.repeat(64),
    dependencyHash: 'b'.repeat(64),
    changeReason: 'Initial scene composition',
    operationCode: 'INITIAL_DRAFT' as const,
    requestedByUserId: editorUserId,
    metadata: null,
    createdAt: new Date('2026-10-29T10:00:00.000Z'),
    layers: [
      {
        id: 'layer-1',
        sceneVersionId: 'ver-scene-001',
        layerKey: 'bg_01',
        layerGroup: 'BACKGROUND' as const,
        layerType: 'GENERATED_BACKGROUND' as const,
        name: 'Background Ambiance',
        zIndex: 0,
        visible: true,
        opacity: 1,
        blendMode: 'NORMAL' as const,
        bounds: { x: 0, y: 0, width: 1080, height: 1080 },
        payloadSchemaVersion: 1,
        sortOrder: 0,
        layerHash: '1'.repeat(64),
        createdAt: new Date(),
        payload: {
          assetType: 'GENERATED_BACKGROUND',
          casStorageKey: 'cas/bg.png',
          sha256: 'a'.repeat(64),
        },
      },
      {
        id: 'layer-2',
        sceneVersionId: 'ver-scene-001',
        layerKey: 'hero_01',
        layerGroup: 'PRODUCT_HERO' as const,
        layerType: 'HERO_CUTOUT' as const,
        name: 'Product Hero',
        zIndex: 200,
        visible: true,
        opacity: 1,
        blendMode: 'NORMAL' as const,
        bounds: { x: 240, y: 300, width: 600, height: 600 },
        payloadSchemaVersion: 1,
        sortOrder: 1,
        layerHash: '2'.repeat(64),
        createdAt: new Date(),
        payload: {
          productSnapshotId: sampleSnapshot.id,
          productAssetId: '00000000-0000-4000-8000-000000000081',
          productAssetRegistrationId: '00000000-0000-4000-8000-000000000082',
          validationAssessmentId: '00000000-0000-4000-8000-000000000083',
          validatorVersion: '1.0.0',
          rightsEventId: '00000000-0000-4000-8000-000000000084',
          approvalEventId: '00000000-0000-4000-8000-000000000085',
          assetRole: 'HERO_CUTOUT',
          casStorageKey: 'cas/hero.png',
          sha256: heroSha256,
          mimeType: 'image/png',
          format: 'png',
          byteSize: heroBuffer.length,
          width: 600,
          height: 600,
          pixelCount: 360000,
          channels: 4,
          hasAlpha: true,
          transparencyRatio: 0.35,
          rightsState: 'VERIFIED',
          approvalDecision: 'APPROVED',
          alphaEvidence: { hasAlpha: true, transparencyRatio: 0.35 },
          containmentConfig: { containmentPassed: true, x: 240, y: 300, width: 600, height: 600 },
        },
      },
      {
        id: 'layer-3',
        sceneVersionId: 'ver-scene-001',
        layerKey: 'typo_01',
        layerGroup: 'TYPOGRAPHY' as const,
        layerType: 'TYPOGRAPHY_BLOCK' as const,
        name: 'Typography Block',
        zIndex: 300,
        visible: true,
        opacity: 1,
        blendMode: 'NORMAL' as const,
        bounds: { x: 80, y: 900, width: 920, height: 80 },
        payloadSchemaVersion: 1,
        sortOrder: 2,
        layerHash: '3'.repeat(64),
        createdAt: new Date(),
        payload: {
          headline: {
            text: 'Moonlit River Luxury EDP',
            fontFamily: 'Playfair Display',
            fontWeight: 700,
            fontSize: 42,
            color: '#1C1A17',
          },
          priceBadge: { regularPrice: '$38.00 USD', currency: 'USD' },
        },
      },
    ],
    dependencies: [],
  };

  const sampleDraftLayers = [
    {
      layerKey: 'bg_01',
      layerGroup: 'BACKGROUND' as const,
      layerType: 'GENERATED_BACKGROUND' as const,
      name: 'Background Ambiance',
      zIndex: 0,
      visible: true,
      opacity: 1,
      blendMode: 'NORMAL' as const,
      bounds: { x: 0, y: 0, width: 1080, height: 1080 },
      payloadSchemaVersion: 1,
      sortOrder: 0,
      payload: {
        assetType: 'GENERATED_BACKGROUND',
        casStorageKey: 'cas/bg.png',
        sha256: 'a'.repeat(64),
        provider: 'mock-provider',
        model: 'mock-model',
        promptVersion: '1.0',
      },
    },
    {
      layerKey: 'hero_01',
      layerGroup: 'PRODUCT_HERO' as const,
      layerType: 'HERO_CUTOUT' as const,
      name: 'Product Hero',
      zIndex: 200,
      visible: true,
      opacity: 1,
      blendMode: 'NORMAL' as const,
      bounds: { x: 240, y: 300, width: 600, height: 600 },
      payloadSchemaVersion: 1,
      sortOrder: 1,
      payload: {
        productSnapshotId: sampleSnapshot.id,
        productAssetId: '00000000-0000-4000-8000-000000000081',
        productAssetRegistrationId: '00000000-0000-4000-8000-000000000082',
        validationAssessmentId: '00000000-0000-4000-8000-000000000083',
        validatorVersion: '1.0.0',
        rightsEventId: '00000000-0000-4000-8000-000000000084',
        approvalEventId: '00000000-0000-4000-8000-000000000085',
        assetRole: 'HERO_CUTOUT',
        casStorageKey: 'cas/hero.png',
        sha256: heroSha256,
        mimeType: 'image/png',
        format: 'png',
        byteSize: heroBuffer.length,
        width: 600,
        height: 600,
        pixelCount: 360000,
        channels: 4,
        hasAlpha: true,
        transparencyRatio: 0.35,
        rightsState: 'VERIFIED',
        approvalDecision: 'APPROVED',
        alphaEvidence: { hasAlpha: true, transparencyRatio: 0.35 },
        containmentConfig: { containmentPassed: true, x: 240, y: 300, width: 600, height: 600 },
      },
    },
    {
      layerKey: 'typo_01',
      layerGroup: 'TYPOGRAPHY' as const,
      layerType: 'TYPOGRAPHY_BLOCK' as const,
      name: 'Typography Block',
      zIndex: 300,
      visible: true,
      opacity: 1,
      blendMode: 'NORMAL' as const,
      bounds: { x: 80, y: 900, width: 920, height: 80 },
      payloadSchemaVersion: 1,
      sortOrder: 2,
      payload: {
        headline: {
          text: 'Moonlit River Luxury EDP',
          fontFamily: 'Playfair Display',
          fontWeight: 700,
          fontSize: 42,
          color: '#1C1A17',
        },
        priceBadge: { regularPrice: '$38.00 USD', currency: 'USD' },
      },
    },
  ];

  // Mocks
  let mockUserAccountRepo: jest.Mocked<UserAccountRepository>;
  let mockUserSessionRepo: jest.Mocked<UserSessionRepository>;
  let mockSnapshotRepo: jest.Mocked<ProductSnapshotRepository>;
  let mockContentRepo: jest.Mocked<ContentGenerationRepository>;
  let mockSceneRepo: jest.Mocked<CreativeSceneRepository>;
  let mockJobRepo: jest.Mocked<CreativeJobRepository>;
  let mockVisualAssetRepo: jest.Mocked<VisualAssetRepository>;
  let mockVisualValidationRepo: jest.Mocked<VisualValidationRepository>;
  let mockStorage: jest.Mocked<AssetStoragePort>;
  let mockAssetEvaluator: jest.Mocked<ProductAssetEligibilityEvaluator>;
  let mockBrandRepo: jest.Mocked<BrandRuleRepository>;

  beforeAll(async () => {
    mockUserAccountRepo = {
      findById: jest.fn(async (id: string): Promise<AuthenticatedUserAccount | null> => {
        if (id === editorUserId) {
          return {
            id: editorUserId,
            loginIdentifier: 'editor@parisian.internal',
            displayName: 'Creative Editor',
            roles: ['MARKETING_EDITOR'],
            permissions: resolvePermissionsForRoles(['MARKETING_EDITOR']),
            disabledAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }
        if (id === approverUserId) {
          return {
            id: approverUserId,
            loginIdentifier: 'approver@parisian.internal',
            displayName: 'Marketing Approver',
            roles: ['MARKETING_APPROVER'],
            permissions: resolvePermissionsForRoles(['MARKETING_APPROVER']),
            disabledAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }
        if (id === viewerUserId) {
          return {
            id: viewerUserId,
            loginIdentifier: 'viewer@parisian.internal',
            displayName: 'Guest Viewer',
            roles: ['VIEWER'],
            permissions: resolvePermissionsForRoles(['VIEWER']),
            disabledAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }
        return null;
      }),
      findByLoginIdentifier: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<UserAccountRepository>;

    mockUserSessionRepo = {
      findActiveByTokenHash: jest.fn(
        async (tokenHash: string): Promise<UserSessionRecord | null> => {
          const expiresAt = new Date(Date.now() + 3_600_000);
          const idleExpiresAt = new Date(Date.now() + 3_600_000);
          if (tokenHash === editorTokenHash) {
            return {
              id: 'sess-editor',
              userId: editorUserId,
              tokenHash: editorTokenHash,
              createdAt: new Date(),
              expiresAt,
              lastSeenAt: new Date(),
              idleExpiresAt,
            };
          }
          if (tokenHash === approverTokenHash) {
            return {
              id: 'sess-approver',
              userId: approverUserId,
              tokenHash: approverTokenHash,
              createdAt: new Date(),
              expiresAt,
              lastSeenAt: new Date(),
              idleExpiresAt,
            };
          }
          if (tokenHash === viewerTokenHash) {
            return {
              id: 'sess-viewer',
              userId: viewerUserId,
              tokenHash: viewerTokenHash,
              createdAt: new Date(),
              expiresAt,
              lastSeenAt: new Date(),
              idleExpiresAt,
            };
          }
          return null;
        },
      ),
      create: jest.fn(),
      touch: jest.fn(),
      touchLastSeen: jest.fn(),
      revoke: jest.fn(),
      revokeAllForUser: jest.fn(),
    } as unknown as jest.Mocked<UserSessionRepository>;

    mockSnapshotRepo = {
      findById: jest.fn(async (id: string) => (id === sampleSnapshot.id ? sampleSnapshot : null)),
      findBySku: jest.fn(),
      findActiveBySku: jest.fn(),
      save: jest.fn(),
      search: jest.fn(),
      findMany: jest.fn(),
    } as unknown as jest.Mocked<ProductSnapshotRepository>;

    mockContentRepo = {
      findJobById: jest.fn(),
      findJobs: jest.fn(),
      createJob: jest.fn(),
      createVersion: jest.fn(),
      findVersionById: jest.fn(async (id: string) => (id === testVersionId ? sampleVersion : null)),
      findVersionsByJobId: jest.fn(),
      findLatestVersionByJobId: jest.fn(),
      createRevisionRequest: jest.fn(),
      findRevisionRequestById: jest.fn(),
      updateJobStatus: jest.fn(),
    } as unknown as jest.Mocked<ContentGenerationRepository>;

    mockSceneRepo = {
      createInitialScene: jest.fn(async (_input: any) => ({
        scene: sampleScene,
        version: sampleSceneVersion,
      })),
      createRevision: jest.fn(async (_input: any) => ({
        ...sampleSceneVersion,
        versionNumber: 2,
        parentVersionId: sampleSceneVersion.id,
      })),
      recordDependencyInvalidation: jest.fn(),
      findById: jest.fn(async (id: string) => (id === testSceneId ? sampleScene : null)),
      findByJobId: jest.fn(async (jobId: string) => (jobId === testJobId ? sampleScene : null)),
      findVersionById: jest.fn(async (id: string) =>
        id === sampleSceneVersion.id ? sampleSceneVersion : null,
      ),
      findVersionByNumber: jest.fn(async (sceneId: string, ver: number) =>
        sceneId === testSceneId && ver === 1 ? sampleSceneVersion : null,
      ),
      findLatestVersionByJobId: jest.fn(async () => sampleSceneVersion),
      findLatestVersionBySceneId: jest.fn(async (id: string) =>
        id === testSceneId ? sampleSceneVersion : null,
      ),
      listVersions: jest.fn(async (id: string) => (id === testSceneId ? [sampleSceneVersion] : [])),
      findScenes: jest.fn(async () => ({
        items: [
          {
            scene: sampleScene,
            latestVersion: sampleSceneVersion,
            productSnapshot: {
              id: sampleSnapshot.id,
              sku: sampleSnapshot.product.product.sku,
              productName: sampleSnapshot.product.product.product_name,
              brand: sampleSnapshot.product.product.brand,
              price: Number(sampleSnapshot.product.product.price),
            },
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      })),
    } as unknown as jest.Mocked<CreativeSceneRepository>;

    mockJobRepo = {
      createJob: jest.fn(async () => ({
        id: testJobId,
        contentVersionId: testVersionId,
        productSnapshotId: sampleSnapshot.id,
        brandRuleVersionId: 'rule-001',
        requestedByUserId: editorUserId,
        status: 'REQUESTED' as const,
        targetPlatform: 'GENERIC' as const,
        aspectRatio: '1:1',
        creativeProfile: 'PARISIAN_LUXURY_ATELIER',
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      findById: jest.fn(async (id: string) =>
        id === testJobId
          ? {
              id: testJobId,
              contentVersionId: testVersionId,
              productSnapshotId: sampleSnapshot.id,
              brandRuleVersionId: 'rule-001',
              requestedByUserId: editorUserId,
              status: 'REQUESTED' as const,
              targetPlatform: 'GENERIC' as const,
              aspectRatio: '1:1',
              creativeProfile: 'PARISIAN_LUXURY_ATELIER',
              createdAt: new Date(),
              updatedAt: new Date(),
            }
          : null,
      ),
      findByContentVersionId: jest.fn(),
      transitionStatus: jest.fn(),
    } as unknown as jest.Mocked<CreativeJobRepository>;

    mockVisualAssetRepo = {
      createAsset: jest.fn(async (input: any) => ({
        id: 'asset-preview-001',
        ...input,
        versionNumber: 1,
        createdAt: new Date(),
      })),
      findById: jest.fn(async (id: string) =>
        id === 'asset-preview-001'
          ? {
              id: 'asset-preview-001',
              creativeJobId: testJobId,
              versionNumber: 1,
              assetRole: 'COMPOSITED_CREATIVE' as const,
              mimeType: 'image/png',
              width: 1080,
              height: 1080,
              byteSize: 50000,
              sha256: '9'.repeat(64),
              storageKey: 'cas/previews/scene-1/v1.png',
              sourceProductAssetDigest: 'h'.repeat(64),
              createdAt: new Date(),
            }
          : null,
      ),
      findByJobAndVersion: jest.fn(),
      findLatestByJobId: jest.fn(),
    } as unknown as jest.Mocked<VisualAssetRepository>;

    mockVisualValidationRepo = {
      persistResult: jest.fn(),
      findByAssetId: jest.fn(),
      findLatestByAssetId: jest.fn(),
    } as unknown as jest.Mocked<VisualValidationRepository>;

    mockStorage = {
      saveAsset: jest.fn(async () => ({
        storageKey: 'cas/previews/scene-1/v1.png',
        sha256Digest: '9'.repeat(64),
        mimeType: 'image/png',
        byteSize: 50000,
        assetRole: 'COMPOSITED_CREATIVE' as const,
        createdAt: new Date(),
      })),
      getAssetBuffer: jest.fn(async () => Buffer.from('png-preview-bytes')),
      getMetadata: jest.fn(),
      assetExists: jest.fn(async () => true),
    } as unknown as jest.Mocked<AssetStoragePort>;

    mockAssetEvaluator = {
      resolveAuthoritativeHeroEvidence: jest.fn(async () => ({
        buffer: heroBuffer,
        asset: {
          id: '00000000-0000-4000-8000-000000000081',
          storageKey: 'cas/hero.png',
          sha256: heroSha256,
          mimeType: 'image/png',
          format: 'png',
          byteSize: heroBuffer.length,
          width: 600,
          height: 600,
          pixelCount: 360000,
          channels: 4,
          hasAlpha: true,
          transparencyRatio: 0.35,
        },
        registration: {
          id: '00000000-0000-4000-8000-000000000082',
          sku: sampleSnapshot.product.product.sku,
          productSnapshotId: sampleSnapshot.id,
          role: 'HERO_CUTOUT',
          productAssetId: '00000000-0000-4000-8000-000000000081',
        },
        assessment: {
          id: '00000000-0000-4000-8000-000000000083',
          productAssetId: '00000000-0000-4000-8000-000000000081',
          isValid: true,
          status: 'PASS',
          validatorVersion: '1.0.0',
        },
        rightsEvent: {
          id: '00000000-0000-4000-8000-000000000084',
          productAssetRegistrationId: '00000000-0000-4000-8000-000000000082',
          rightsState: 'VERIFIED',
        },
        approvalEvent: {
          id: '00000000-0000-4000-8000-000000000085',
          productAssetRegistrationId: '00000000-0000-4000-8000-000000000082',
          decision: 'APPROVED',
        },
      })),
      evaluateHeroCutoutEligibility: jest.fn(),
      evaluateAssetForComposition: jest.fn(),
    } as unknown as jest.Mocked<ProductAssetEligibilityEvaluator>;

    mockBrandRepo = {
      findById: jest.fn(async () => ({
        id: 'rule-001',
        version: '1.0',
        rules: {},
        active: true,
        createdAt: new Date(),
      })),
      findActive: jest.fn(),
    } as unknown as jest.Mocked<BrandRuleRepository>;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(USER_ACCOUNT_REPOSITORY)
      .useValue(mockUserAccountRepo)
      .overrideProvider(USER_SESSION_REPOSITORY)
      .useValue(mockUserSessionRepo)
      .overrideProvider(PASSWORD_HASHER)
      .useClass(Argon2PasswordHasher)
      .overrideProvider(PASSWORD_CREDENTIAL_REPOSITORY)
      .useValue({ findByUserId: jest.fn() })
      .overrideProvider(PRODUCT_SNAPSHOT_REPOSITORY)
      .useValue(mockSnapshotRepo)
      .overrideProvider(CONTENT_GENERATION_REPOSITORY)
      .useValue(mockContentRepo)
      .overrideProvider(CREATIVE_SCENE_REPOSITORY)
      .useValue(mockSceneRepo)
      .overrideProvider(CREATIVE_JOB_REPOSITORY)
      .useValue(mockJobRepo)
      .overrideProvider(VISUAL_ASSET_REPOSITORY)
      .useValue(mockVisualAssetRepo)
      .overrideProvider(VISUAL_VALIDATION_REPOSITORY)
      .useValue(mockVisualValidationRepo)
      .overrideProvider(ASSET_STORAGE)
      .useValue(mockStorage)
      .overrideProvider(PRODUCT_ASSET_ELIGIBILITY_EVALUATOR)
      .useValue(mockAssetEvaluator)
      .overrideProvider(BRAND_RULE_REPOSITORY)
      .useValue(mockBrandRepo)
      .overrideProvider(CAMPAIGN_REPOSITORY)
      .useValue({
        findById: jest.fn(async (id: string) => ({ id, code: 'CAMP-001', name: 'Summer Launch' })),
      })
      .overrideProvider(PRODUCT_ASSET_REPOSITORY)
      .useValue({ findAllHeroCutoutRegistrations: jest.fn(async () => []) })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(),
        $disconnect: jest.fn(),
        $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      })
      .overrideProvider(DatabaseHealthIndicator)
      .useValue({ pingCheck: jest.fn().mockResolvedValue({ postgres: { status: 'up' } }) })
      .overrideProvider(ValkeyConnectionService)
      .useValue({
        client: { ping: jest.fn().mockResolvedValue('PONG'), status: 'ready' },
        onModuleInit: jest.fn(),
        onModuleDestroy: jest.fn(),
      })
      .overrideProvider(ContentGenerationQueue)
      .useValue({ enqueue: jest.fn(), onModuleInit: jest.fn(), onModuleDestroy: jest.fn() })
      .overrideProvider(CreativeGenerationQueue)
      .useValue({ enqueue: jest.fn(), onModuleInit: jest.fn(), onModuleDestroy: jest.fn() })
      .compile();

    application = moduleRef.createNestApplication();
    configureApi(application);
    await application.init();
    server = application.getHttpServer();
  });

  afterAll(async () => {
    if (server) {
      (server as any).closeAllConnections?.();
      if ((server as any).listening) {
        await new Promise<void>((resolve) => (server as any).close(() => resolve()));
      }
    }
    await application.close();
  });

  describe('CREATIVE-E2E-01 — Template listing is publicly available', () => {
    it('returns 200 OK with registered canonical templates without session', async () => {
      const response = await request(server).get('/v1/creative/templates');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(4);
      expect(response.body.some((t: any) => t.id === 'EDITORIAL_SPLIT')).toBe(true);
    });
  });

  describe('CREATIVE-E2E-02 — Anonymous request to projects is rejected', () => {
    it('returns 401 Unauthorized when accessing /v1/creative/projects without session cookie', async () => {
      const response = await request(server).get('/v1/creative/projects');
      expect(response.status).toBe(401);
    });
  });

  describe('CREATIVE-E2E-03 — Authenticated editor lists creative projects', () => {
    it('returns 200 OK with paginated list of projects', async () => {
      const response = await request(server)
        .get('/v1/creative/projects')
        .set('Cookie', [`ps_session=${editorSessionToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(1);
      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].scene.id).toBe(testSceneId);
      expect(response.body.items[0].productSnapshot.sku).toBe(sampleSnapshot.product.product.sku);
    });
  });

  describe('CREATIVE-E2E-04 — Editor creates a new creative project', () => {
    it('returns 201 Created with initialized scene graph', async () => {
      const response = await request(server)
        .post('/v1/creative/projects')
        .set('Cookie', [`ps_session=${editorSessionToken}`, `ps_csrf=${csrfToken}`])
        .set('x-csrf-token', csrfToken)
        .send({
          title: 'Moonlit River Launch Poster',
          productSnapshotId: sampleSnapshot.id,
          sourceContentVersionId: testVersionId,
          templateId: 'EDITORIAL_SPLIT',
          aspectRatio: '1:1',
          language: 'EN',
          campaignId: testCampaignId,
        });

      expect(response.status).toBe(201);
      expect(response.body.scene.id).toBe(testSceneId);
      expect(response.body.version.versionNumber).toBe(1);
    });
  });

  describe('CREATIVE-E2E-05 — Editor retrieves creative project detail', () => {
    it('returns 200 OK with scene graph, snapshot, and permissions', async () => {
      const response = await request(server)
        .get(`/v1/creative/projects/${testSceneId}`)
        .set('Cookie', [`ps_session=${editorSessionToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.project.id).toBe(testSceneId);
      expect(response.body.currentVersion.versionNumber).toBe(1);
      expect(response.body.currentVersion.layers).toHaveLength(3);
      expect(response.body.canEdit).toBe(true);
    });
  });

  describe('CREATIVE-E2E-06 — Editor saves canvas revisions', () => {
    it('returns 200 OK with new version number', async () => {
      const response = await request(server)
        .patch(`/v1/creative/projects/${testSceneId}`)
        .set('Cookie', [`ps_session=${editorSessionToken}`, `ps_csrf=${csrfToken}`])
        .set('x-csrf-token', csrfToken)
        .send({
          expectedVersionNumber: 1,
          changeReason: 'Adjusted typography coordinates',
          operationCode: 'EDIT_LAYOUT',
          layers: sampleDraftLayers,
        });

      expect(response.status).toBe(200);
      expect(response.body.versionNumber).toBe(2);
      expect(response.body.parentVersionId).toBe(sampleSceneVersion.id);
    });
  });

  describe('CREATIVE-E2E-07 — Editor validates project against visual hard gates', () => {
    it('returns 200 OK with validation status and aesthetic score', async () => {
      const response = await request(server)
        .post(`/v1/creative/projects/${testSceneId}/validate`)
        .set('Cookie', [`ps_session=${editorSessionToken}`, `ps_csrf=${csrfToken}`])
        .set('x-csrf-token', csrfToken)
        .send({
          versionNumber: 1,
        });

      expect(response.status).toBe(200);
      expect(response.body.isPassed).toBe(true);
      expect(response.body.blockingCount).toBe(0);
      expect(response.body.aestheticScore).toBeGreaterThanOrEqual(8.0);
    });
  });

  describe('CREATIVE-E2E-08 — Server preview render', () => {
    it('returns 200 OK with render preview URL and metadata', async () => {
      const response = await request(server)
        .post(`/v1/creative/projects/${testSceneId}/render`)
        .set('Cookie', [`ps_session=${editorSessionToken}`, `ps_csrf=${csrfToken}`])
        .set('x-csrf-token', csrfToken)
        .send({
          versionNumber: 1,
        });

      if (response.status !== 200) {
        console.log('E2E-06 ERROR:', response.status, response.body);
      }
      expect(response.status).toBe(200);
      expect(response.body.visualAssetId).toBeDefined();
      expect(response.body.width).toBe(1080);
      expect(response.body.height).toBe(1080);
      expect(response.body.previewUrl).toContain('/v1/creative/renders/');
    });
  });

  describe('CREATIVE-E2E-09 — Render metadata and raster stream privacy & authentication', () => {
    it('rejects unauthenticated request to stream private preview render with 401', async () => {
      const response = await request(server).get('/v1/creative/renders/asset-preview-001/file');
      expect(response.status).toBe(401);
    });

    it('returns 200 OK with image/png and private no-store Cache-Control for authenticated editor', async () => {
      const response = await request(server)
        .get('/v1/creative/renders/asset-preview-001/file')
        .set('Cookie', `ps_session=${editorSessionToken}`);
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('image/png');
      expect(response.headers['cache-control']).toBe(
        'private, no-cache, no-store, must-revalidate',
      );
      expect(response.headers['pragma']).toBe('no-cache');
    });
  });

  describe('CREATIVE-E2E-10 — Unapproved export is blocked', () => {
    it('returns 400 Bad Request when attempting to export an unapproved creative', async () => {
      const response = await request(server)
        .post(`/v1/creative/projects/${testSceneId}/export`)
        .set('Cookie', [`ps_session=${approverSessionToken}`, `ps_csrf=${csrfToken}`])
        .set('x-csrf-token', csrfToken)
        .send({
          format: 'SQUARE_1080',
          encoding: 'PNG',
        });

      expect(response.status).toBe(400);
    });
  });

  describe('CREATIVE-E2E-11 — Viewer role is denied editing permissions', () => {
    it('returns 403 Forbidden when VIEWER attempts to create or revise project', async () => {
      const response = await request(server)
        .post('/v1/creative/projects')
        .set('Cookie', [`ps_session=${viewerSessionToken}`, `ps_csrf=${csrfToken}`])
        .set('x-csrf-token', csrfToken)
        .send({
          title: 'Unauthorized Poster',
          productSnapshotId: sampleSnapshot.id,
          sourceContentVersionId: testVersionId,
          templateId: 'EDITORIAL_SPLIT',
          aspectRatio: '1:1',
          language: 'EN',
        });

      expect(response.status).toBe(403);
    });
  });
});
