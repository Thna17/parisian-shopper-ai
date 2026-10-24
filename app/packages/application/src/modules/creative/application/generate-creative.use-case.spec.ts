import { createHash } from 'node:crypto';
import { describe, expect, it, jest } from '@jest/globals';
import { type ApplicationLogger, type OutboxEventDraft } from '@parisian-shopper/common';
import { GenerateCreativeUseCase } from './generate-creative.use-case.js';
import {
  type CreativeJobRepository,
  type CreativeJobRecord,
  type CreateCreativeJobInput,
} from './creative-job.repository.js';
import {
  type VisualAssetRepository,
  type VisualAssetRecord,
  type CreateVisualAssetInput,
} from './visual-asset.repository.js';
import {
  type AssetStoragePort,
  type StoredAssetMetadata,
  type SaveAssetInput,
} from './asset-storage.port.js';
import {
  type CreativeProvider,
  type GeneratedBackgroundAsset,
  type CreativeBrief,
} from './creative-provider.port.js';
import {
  type HeroCompositor,
  type CompositeVisualResult,
  type CompositeVisualInput,
} from './hero-compositor.port.js';
import {
  type ContentGenerationRepository,
  type ContentVersion,
  type CreateContentJobInput,
  type ContentJob,
  type BeginGenerationInput,
  type BeginGenerationResult,
  type CompleteGenerationInput,
  type FailGenerationInput,
  type GenerationAttempt,
} from '../../content/application/content-generation.repository.js';
import {
  type ProductSnapshotRepository,
  type ProductSnapshot,
  type CreateProductSnapshotRecord,
} from '../../products/application/product-snapshot.repository.js';
import {
  type ValidationRepository,
  type PersistedValidationResult,
  type CreateValidationResult,
} from '../../validation/application/validation.repository.js';
import {
  ContentVersionNotEligibleForCreativeError,
  CanonicalProductImageMissingError,
} from '../domain/creative-errors.js';
import { type CreativeJobStatus } from '../domain/creative.js';
import { generateTransparentProductPng_TEST_ONLY } from '../infrastructure/fixtures/fake-product-fixtures.js';

describe('GenerateCreativeUseCase', () => {
  const mockContentVersion: ContentVersion = {
    id: 'version-123',
    contentJobId: 'job-123',
    versionNumber: 1,
    brandRuleVersionId: 'brand-rule-1',
    productSnapshotId: 'snapshot-1',
    generationAttemptId: 'attempt-1',
    provider: 'openai',
    model: 'gpt-4o',
    promptVersion: 'v1',
    structuredOutput: {
      headline: 'Timeless Elegance',
      khmer_caption: 'ភាពថ្លៃថ្នូរ',
      english_caption: 'Timeless luxury hand-crafted in Paris.',
      cta: 'Discover More',
      hashtags: ['#ParisianShopper'],
      creative_brief: 'Haussmann interior background with marble mantlepiece',
      facts_used: [],
      warnings: [],
      missing_information: [],
    },
    createdAt: new Date(),
  };

  const mockCanonicalProductBuffer = generateTransparentProductPng_TEST_ONLY({
    width: 400,
    height: 400,
    productWidth: 200,
    productHeight: 200,
    productColor: { r: 120, g: 60, b: 30, a: 255 },
  });
  const mockCanonicalProductSha256 = createHash('sha256')
    .update(mockCanonicalProductBuffer)
    .digest('hex');

  const mockProductSnapshot: ProductSnapshot = {
    id: 'snapshot-1',
    snapshotHash: 'hash-1',
    normalizerVersion: 'v1',
    createdAt: new Date(),
    product: {
      schema_version: '1.0',
      source_system: 'ERP',
      retrieved_at: new Date().toISOString(),
      source_updated_at: new Date().toISOString(),
      lifecycle_status: 'active',
      product: {
        sku: 'HERMES-BIRKIN-25',
        product_name: 'Birkin 25 Togo Gold',
        brand: 'Hermès',
        category: 'Handbags',
        price: '25000.0000',
        currency: 'EUR',
        stock_status: 'in_stock',
        images: [
          {
            url: 'https://cdn.example.com/birkin.png',
            role: 'primary',
            position: 1,
            sha256: mockCanonicalProductSha256,
          },
        ],
      },
    },
  };

  const mockTextValidationResult: PersistedValidationResult = {
    id: 'val-res-1',
    contentVersionId: 'version-123',
    validatorVersion: 'v1',
    status: 'PASSED',
    findingCount: 0,
    blockingCount: 0,
    warningCount: 0,
    infoCount: 0,
    createdAt: new Date(),
    findings: [],
  };

  const mockJobRecord: CreativeJobRecord = {
    id: 'creative-job-999',
    contentVersionId: 'version-123',
    productSnapshotId: 'snapshot-1',
    brandRuleVersionId: 'brand-rule-1',
    status: 'REQUESTED',
    targetPlatform: 'GENERIC',
    aspectRatio: '1:1',
    creativeProfile: 'PARISIAN_LUXURY_ATELIER',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockVisualAssetRecord: VisualAssetRecord = {
    id: 'visual-asset-1',
    creativeJobId: 'creative-job-999',
    versionNumber: 1,
    assetRole: 'COMPOSITED_CREATIVE',
    mimeType: 'image/png',
    width: 1080,
    height: 1080,
    byteSize: 5000,
    sha256: 'b'.repeat(64),
    storageKey: 'cas/composite.png',
    sourceProductAssetDigest: mockCanonicalProductSha256,
    createdAt: new Date(),
  };

  const mockStoredMeta: StoredAssetMetadata = {
    storageKey: 'cas/composite.png',
    sha256Digest: 'b'.repeat(64),
    mimeType: 'image/png',
    byteSize: 5000,
    width: 1080,
    height: 1080,
    assetRole: 'COMPOSITED_CREATIVE',
    createdAt: new Date(),
  };

  it('orchestrates creative job generation, compositing, storage, and status transitions', async () => {
    const transitionStatusMock = jest.fn(
      (
        _id: string,
        _expectedCurrent: CreativeJobStatus,
        target: CreativeJobStatus,
      ): Promise<CreativeJobRecord> => Promise.resolve({ ...mockJobRecord, status: target }),
    );

    const jobRepo: CreativeJobRepository = {
      createJob: jest.fn((_input: CreateCreativeJobInput): Promise<CreativeJobRecord> =>
        Promise.resolve(mockJobRecord),
      ),
      findById: jest.fn((_id: string): Promise<CreativeJobRecord | null> =>
        Promise.resolve(mockJobRecord),
      ),
      findByContentVersionId: jest.fn((_id: string): Promise<readonly CreativeJobRecord[]> =>
        Promise.resolve([mockJobRecord]),
      ),
      transitionStatus: transitionStatusMock,
    };

    const assetRepo: VisualAssetRepository = {
      createAsset: jest.fn((_input: CreateVisualAssetInput): Promise<VisualAssetRecord> =>
        Promise.resolve(mockVisualAssetRecord),
      ),
      findById: jest.fn((_id: string): Promise<VisualAssetRecord | null> =>
        Promise.resolve(mockVisualAssetRecord),
      ),
      findByJobAndVersion: jest.fn(
        (_jobId: string, _version: number): Promise<VisualAssetRecord | null> =>
          Promise.resolve(mockVisualAssetRecord),
      ),
      listByJobId: jest.fn((_jobId: string): Promise<readonly VisualAssetRecord[]> =>
        Promise.resolve([mockVisualAssetRecord]),
      ),
      findLatestByJobId: jest.fn((_jobId: string): Promise<VisualAssetRecord | null> =>
        Promise.resolve(mockVisualAssetRecord),
      ),
    };

    const storage: AssetStoragePort = {
      getAssetBuffer: jest.fn((_key: string): Promise<Buffer | null> =>
        Promise.resolve(mockCanonicalProductBuffer),
      ),
      getMetadata: jest.fn((_key: string): Promise<StoredAssetMetadata | null> =>
        Promise.resolve({
          storageKey: 'products/' + mockCanonicalProductSha256 + '.png',
          sha256Digest: mockCanonicalProductSha256,
          mimeType: 'image/png',
          byteSize: mockCanonicalProductBuffer.length,
          assetRole: 'CANONICAL_PRODUCT',
          createdAt: new Date(),
        }),
      ),

      saveAsset: jest.fn((_input: SaveAssetInput): Promise<StoredAssetMetadata> =>
        Promise.resolve(mockStoredMeta),
      ),
      assetExists: jest.fn((_key: string): Promise<boolean> => Promise.resolve(true)),
    };

    const provider: CreativeProvider = {
      providerId: 'fake-creative-provider',
      generateBackground: jest.fn((_brief: CreativeBrief): Promise<GeneratedBackgroundAsset> =>
        Promise.resolve({
          imageBuffer: Buffer.from('fake-bg-bytes'),
          mimeType: 'image/png',
          width: 1080,
          height: 1080,
          providerId: 'fake-creative-provider',
          model: 'model-1',
          latencyMs: 100,
        }),
      ),
    };

    const compositor: HeroCompositor = {
      composite: jest.fn((_input: CompositeVisualInput): Promise<CompositeVisualResult> =>
        Promise.resolve({
          compositedBuffer: Buffer.from('fake-composite-bytes'),
          mimeType: 'image/png',
          width: 1080,
          height: 1080,
          byteSize: 5000,
          sha256: 'b'.repeat(64),
          latencyMs: 50,
          compositorVersion: 'ps-compositor-v1',
          heroScale: 0.55,
          heroPlacement: 'CENTER',
          heroBoundingBox: { x: 243, y: 243, width: 594, height: 594 },
          productDigest: 'a'.repeat(64),
          backgroundDigest: 'c'.repeat(64),
          outputDigest: 'b'.repeat(64),
        }),
      ),
    };

    const contentRepo: ContentGenerationRepository = {
      createJob: jest.fn((_input: CreateContentJobInput): Promise<ContentJob> => {
        throw new Error('Not implemented');
      }),
      findJobById: jest.fn((_id: string): Promise<ContentJob | null> => Promise.resolve(null)),
      findVersionById: jest.fn((_id: string): Promise<ContentVersion | null> =>
        Promise.resolve(mockContentVersion),
      ),
      beginGeneration: jest.fn((_input: BeginGenerationInput): Promise<BeginGenerationResult> => {
        throw new Error('Not implemented');
      }),
      completeGeneration: jest.fn((_input: CompleteGenerationInput): Promise<ContentVersion> => {
        throw new Error('Not implemented');
      }),
      failGeneration: jest.fn((_input: FailGenerationInput): Promise<void> => Promise.resolve()),
      findVersionsByJobId: jest.fn((_jobId: string): Promise<readonly ContentVersion[]> =>
        Promise.resolve([]),
      ),
      findAttemptsByJobId: jest.fn((_jobId: string): Promise<readonly GenerationAttempt[]> =>
        Promise.resolve([]),
      ),
    };

    const snapshotRepo: ProductSnapshotRepository = {
      create: jest.fn((_input: CreateProductSnapshotRecord): Promise<ProductSnapshot> => {
        throw new Error('Not implemented');
      }),
      findById: jest.fn((_id: string): Promise<ProductSnapshot | null> =>
        Promise.resolve(mockProductSnapshot),
      ),
    };

    const textValidationRepo: ValidationRepository = {
      create: jest.fn((_input: CreateValidationResult): Promise<PersistedValidationResult> => {
        throw new Error('Not implemented');
      }),
      findByContentVersionAndValidatorVersion: jest.fn(
        (
          _versionId: string,
          _validatorVersion: string,
        ): Promise<PersistedValidationResult | null> => Promise.resolve(null),
      ),
      findLatestByContentVersion: jest.fn(
        (_versionId: string): Promise<PersistedValidationResult | null> =>
          Promise.resolve(mockTextValidationResult),
      ),
    };

    const logger: ApplicationLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const appendMock = jest.fn((_event: OutboxEventDraft): Promise<string> =>
      Promise.resolve('outbox-1'),
    );
    const outboxWriter = { append: appendMock };

    const useCase = new GenerateCreativeUseCase(
      jobRepo,
      assetRepo,
      storage,
      provider,
      compositor,
      contentRepo,
      snapshotRepo,
      textValidationRepo,
      logger,
      undefined,
      undefined,
      undefined,
      undefined,
      true, // allowLegacyProductAssetFallback
    );

    const result = await useCase.execute({
      contentVersionId: 'version-123',
      requestedBy: 'user-operator',
      format: 'FEED_SQUARE',
      outboxWriter,
    });

    expect(result.creativeJob.status).toBe('VALIDATING');
    expect(result.visualAsset.id).toBe('visual-asset-1');
    expect(transitionStatusMock).toHaveBeenCalledWith(
      'creative-job-999',
      'REQUESTED',
      'GENERATING_BACKGROUND',
    );
    expect(transitionStatusMock).toHaveBeenCalledWith(
      'creative-job-999',
      'GENERATING_BACKGROUND',
      'COMPOSITING',
    );
    expect(transitionStatusMock).toHaveBeenCalledWith(
      'creative-job-999',
      'COMPOSITING',
      'VALIDATING',
    );
    expect(appendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'CREATIVE_GENERATED',
        aggregateType: 'CreativeJob',
        aggregateId: 'creative-job-999',
      }),
    );
  });

  it('rejects execution if parent ContentVersion validation status is not PASSED', async () => {
    const jobRepo: CreativeJobRepository = {
      createJob: jest.fn((_input: CreateCreativeJobInput): Promise<CreativeJobRecord> =>
        Promise.resolve(mockJobRecord),
      ),
      findById: jest.fn((_id: string): Promise<CreativeJobRecord | null> =>
        Promise.resolve(mockJobRecord),
      ),
      findByContentVersionId: jest.fn((_id: string): Promise<readonly CreativeJobRecord[]> =>
        Promise.resolve([mockJobRecord]),
      ),
      transitionStatus: jest.fn(
        (
          _id: string,
          _expectedCurrent: CreativeJobStatus,
          target: CreativeJobStatus,
        ): Promise<CreativeJobRecord> => Promise.resolve({ ...mockJobRecord, status: target }),
      ),
    };
    const assetRepo: VisualAssetRepository = {
      createAsset: jest.fn((_input: CreateVisualAssetInput): Promise<VisualAssetRecord> =>
        Promise.resolve(mockVisualAssetRecord),
      ),
      findById: jest.fn((_id: string): Promise<VisualAssetRecord | null> =>
        Promise.resolve(mockVisualAssetRecord),
      ),
      findByJobAndVersion: jest.fn(
        (_jobId: string, _version: number): Promise<VisualAssetRecord | null> =>
          Promise.resolve(mockVisualAssetRecord),
      ),
      listByJobId: jest.fn((_jobId: string): Promise<readonly VisualAssetRecord[]> =>
        Promise.resolve([mockVisualAssetRecord]),
      ),
      findLatestByJobId: jest.fn((_jobId: string): Promise<VisualAssetRecord | null> =>
        Promise.resolve(mockVisualAssetRecord),
      ),
    };
    const storage: AssetStoragePort = {
      getAssetBuffer: jest.fn((_key: string): Promise<Buffer | null> =>
        Promise.resolve(mockCanonicalProductBuffer),
      ),
      getMetadata: jest.fn((_key: string): Promise<StoredAssetMetadata | null> =>
        Promise.resolve({
          storageKey: 'products/' + mockCanonicalProductSha256 + '.png',
          sha256Digest: mockCanonicalProductSha256,
          mimeType: 'image/png',
          byteSize: mockCanonicalProductBuffer.length,
          assetRole: 'CANONICAL_PRODUCT',
          createdAt: new Date(),
        }),
      ),

      saveAsset: jest.fn((_input: SaveAssetInput): Promise<StoredAssetMetadata> =>
        Promise.resolve(mockStoredMeta),
      ),
      assetExists: jest.fn((_key: string): Promise<boolean> => Promise.resolve(true)),
    };
    const provider: CreativeProvider = {
      providerId: 'fake-creative-provider',
      generateBackground: jest.fn((_brief: CreativeBrief): Promise<GeneratedBackgroundAsset> => {
        throw new Error('Not implemented');
      }),
    };
    const compositor: HeroCompositor = {
      composite: jest.fn((_input: CompositeVisualInput): Promise<CompositeVisualResult> => {
        throw new Error('Not implemented');
      }),
    };
    const contentRepo: ContentGenerationRepository = {
      createJob: jest.fn((_input: CreateContentJobInput): Promise<ContentJob> => {
        throw new Error('Not implemented');
      }),
      findJobById: jest.fn((_id: string): Promise<ContentJob | null> => Promise.resolve(null)),
      findVersionById: jest.fn((_id: string): Promise<ContentVersion | null> =>
        Promise.resolve(mockContentVersion),
      ),
      beginGeneration: jest.fn((_input: BeginGenerationInput): Promise<BeginGenerationResult> => {
        throw new Error('Not implemented');
      }),
      completeGeneration: jest.fn((_input: CompleteGenerationInput): Promise<ContentVersion> => {
        throw new Error('Not implemented');
      }),
      failGeneration: jest.fn((_input: FailGenerationInput): Promise<void> => Promise.resolve()),
      findVersionsByJobId: jest.fn((_jobId: string): Promise<readonly ContentVersion[]> =>
        Promise.resolve([]),
      ),
      findAttemptsByJobId: jest.fn((_jobId: string): Promise<readonly GenerationAttempt[]> =>
        Promise.resolve([]),
      ),
    };
    const snapshotRepo: ProductSnapshotRepository = {
      create: jest.fn((_input: CreateProductSnapshotRecord): Promise<ProductSnapshot> => {
        throw new Error('Not implemented');
      }),
      findById: jest.fn((_id: string): Promise<ProductSnapshot | null> =>
        Promise.resolve(mockProductSnapshot),
      ),
    };
    const textValidationRepo: ValidationRepository = {
      create: jest.fn((_input: CreateValidationResult): Promise<PersistedValidationResult> => {
        throw new Error('Not implemented');
      }),
      findByContentVersionAndValidatorVersion: jest.fn(
        (
          _versionId: string,
          _validatorVersion: string,
        ): Promise<PersistedValidationResult | null> => Promise.resolve(null),
      ),
      findLatestByContentVersion: jest.fn(
        (_versionId: string): Promise<PersistedValidationResult | null> =>
          Promise.resolve({
            id: 'val-res-failed',
            contentVersionId: 'version-123',
            validatorVersion: 'v1',
            status: 'FAILED',
            findingCount: 1,
            blockingCount: 1,
            warningCount: 0,
            infoCount: 0,
            createdAt: new Date(),
            findings: [],
          }),
      ),
    };
    const logger: ApplicationLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

    const useCase = new GenerateCreativeUseCase(
      jobRepo,
      assetRepo,
      storage,
      provider,
      compositor,
      contentRepo,
      snapshotRepo,
      textValidationRepo,
      logger,
      undefined,
      undefined,
      undefined,
      undefined,
      true, // allowLegacyProductAssetFallback
    );

    await expect(
      useCase.execute({
        contentVersionId: 'version-123',
        requestedBy: 'user-operator',
      }),
    ).rejects.toThrow(ContentVersionNotEligibleForCreativeError);
  });

  it('correctly resolves and applies luxury fragrance style presets from parent job campaignContext', async () => {
    const createJobMock = jest.fn((input: CreateCreativeJobInput): Promise<CreativeJobRecord> =>
      Promise.resolve({
        id: 'creative-job-preset',
        contentVersionId: input.contentVersionId,
        productSnapshotId: input.productSnapshotId,
        brandRuleVersionId: input.brandRuleVersionId,
        requestedByUserId: input.requestedByUserId ?? 'user-operator',
        status: 'REQUESTED',
        targetPlatform: 'GENERIC',
        aspectRatio: input.aspectRatio ?? '1:1',
        creativeProfile: input.creativeProfile ?? 'ATELIER_HAUSSMANN',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    const transitionStatusMock = jest.fn((id: string, from: string, to: string) =>
      Promise.resolve({
        id,
        contentVersionId: 'version-123',
        productSnapshotId: 'snapshot-1',
        brandRuleVersionId: 'brand-rule-1',
        requestedByUserId: 'user-operator',
        status: to as CreativeJobStatus,
        targetPlatform: 'GENERIC' as const,
        aspectRatio: '1:1',
        creativeProfile: 'ATELIER_HAUSSMANN',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    const jobRepo: CreativeJobRepository = {
      createJob: createJobMock,
      findById: jest.fn((_id: string): Promise<CreativeJobRecord | null> => Promise.resolve(null)),
      findByContentVersionId: jest.fn((_cv: string): Promise<readonly CreativeJobRecord[]> =>
        Promise.resolve([]),
      ),
      transitionStatus: transitionStatusMock,
    };
    const assetRepo: VisualAssetRepository = {
      createAsset: jest.fn((input: CreateVisualAssetInput): Promise<VisualAssetRecord> =>
        Promise.resolve({
          id: 'visual-asset-preset',
          creativeJobId: input.creativeJobId,
          versionNumber: 1,
          assetRole: input.assetRole,
          mimeType: input.mimeType,
          width: input.width,
          height: input.height,
          byteSize: input.byteSize,
          sha256: input.sha256,
          storageKey: input.storageKey,
          ...(input.provider ? { provider: input.provider } : {}),
          ...(input.model ? { model: input.model } : {}),
          ...(input.promptVersion ? { promptVersion: input.promptVersion } : {}),
          ...(input.creativeBriefVersion
            ? { creativeBriefVersion: input.creativeBriefVersion }
            : {}),
          sourceProductAssetDigest: input.sourceProductAssetDigest,
          ...(input.backgroundAssetDigest
            ? { backgroundAssetDigest: input.backgroundAssetDigest }
            : {}),
          createdAt: new Date(),
        }),
      ),
      findById: jest.fn((_id: string): Promise<VisualAssetRecord | null> => Promise.resolve(null)),
      findByJobAndVersion: jest.fn(
        (_jobId: string, _version: number): Promise<VisualAssetRecord | null> =>
          Promise.resolve(null),
      ),
      listByJobId: jest.fn((_jobId: string): Promise<readonly VisualAssetRecord[]> =>
        Promise.resolve([]),
      ),
      findLatestByJobId: jest.fn((_jobId: string): Promise<VisualAssetRecord | null> =>
        Promise.resolve(null),
      ),
    };
    const storage: AssetStoragePort = {
      getAssetBuffer: jest.fn((_key: string): Promise<Buffer | null> =>
        Promise.resolve(mockCanonicalProductBuffer),
      ),
      getMetadata: jest.fn((_key: string): Promise<StoredAssetMetadata | null> =>
        Promise.resolve({
          storageKey: 'products/' + mockCanonicalProductSha256 + '.png',
          sha256Digest: mockCanonicalProductSha256,
          mimeType: 'image/png',
          byteSize: mockCanonicalProductBuffer.length,
          assetRole: 'CANONICAL_PRODUCT',
          createdAt: new Date(),
        }),
      ),

      saveAsset: jest.fn((_input: SaveAssetInput): Promise<StoredAssetMetadata> =>
        Promise.resolve(mockStoredMeta),
      ),
      assetExists: jest.fn((_key: string): Promise<boolean> => Promise.resolve(true)),
    };
    const generateBackgroundMock = jest.fn(
      (_brief: CreativeBrief): Promise<GeneratedBackgroundAsset> =>
        Promise.resolve({
          imageBuffer: Buffer.from('mock-bg'),
          mimeType: 'image/png' as const,
          width: 1080,
          height: 1080,
          providerId: 'codex-cli',
          model: 'gpt-image-1',
          promptTokens: 0,
          latencyMs: 100,
        }),
    );
    const provider: CreativeProvider = {
      providerId: 'codex-cli',
      generateBackground: generateBackgroundMock,
    };
    const compositor: HeroCompositor = {
      composite: jest.fn((_input: CompositeVisualInput): Promise<CompositeVisualResult> =>
        Promise.resolve({
          compositedBuffer: Buffer.from('mock-comp'),
          mimeType: 'image/png',
          width: 1080,
          height: 1080,
          byteSize: 6000,
          sha256: 'd'.repeat(64),
          latencyMs: 50,
          compositorVersion: 'ps-compositor-v1',
          heroScale: 0.55,
          heroPlacement: 'CENTER',
          heroBoundingBox: { x: 200, y: 200, width: 680, height: 680 },
          productDigest: 'a'.repeat(64),
          backgroundDigest: 'c'.repeat(64),
          outputDigest: 'd'.repeat(64),
        }),
      ),
    };
    const contentRepo: ContentGenerationRepository = {
      createJob: jest.fn((_input: CreateContentJobInput): Promise<ContentJob> => {
        throw new Error('Not implemented');
      }),
      findJobById: jest.fn((_id: string): Promise<ContentJob | null> =>
        Promise.resolve({
          id: 'job-123',
          productSnapshotId: 'snapshot-1',
          brandRuleVersionId: 'brand-rule-1',
          requesterUserId: 'user-operator',
          contentType: 'SCENT_PYRAMID',
          language: 'EN',
          platform: 'FACEBOOK',
          campaignContext: 'ATELIER_HAUSSMANN',
          status: 'REQUESTED',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ),
      findVersionById: jest.fn((_id: string): Promise<ContentVersion | null> =>
        Promise.resolve(mockContentVersion),
      ),
      beginGeneration: jest.fn((_input: BeginGenerationInput): Promise<BeginGenerationResult> => {
        throw new Error('Not implemented');
      }),
      completeGeneration: jest.fn((_input: CompleteGenerationInput): Promise<ContentVersion> => {
        throw new Error('Not implemented');
      }),
      failGeneration: jest.fn((_input: FailGenerationInput): Promise<void> => Promise.resolve()),
      findVersionsByJobId: jest.fn((_jobId: string): Promise<readonly ContentVersion[]> =>
        Promise.resolve([]),
      ),
      findAttemptsByJobId: jest.fn((_jobId: string): Promise<readonly GenerationAttempt[]> =>
        Promise.resolve([]),
      ),
    };
    const snapshotRepo: ProductSnapshotRepository = {
      create: jest.fn((_input: CreateProductSnapshotRecord): Promise<ProductSnapshot> => {
        throw new Error('Not implemented');
      }),
      findById: jest.fn((_id: string): Promise<ProductSnapshot | null> =>
        Promise.resolve({
          ...mockProductSnapshot,
          product: {
            ...mockProductSnapshot.product,
            product: {
              ...mockProductSnapshot.product.product,
              category: 'fragrance',
              product_name: 'Yes I Am The King',
            },
          },
        }),
      ),
    };
    const textValidationRepo: ValidationRepository = {
      create: jest.fn((_input: CreateValidationResult): Promise<PersistedValidationResult> => {
        throw new Error('Not implemented');
      }),
      findByContentVersionAndValidatorVersion: jest.fn(
        (_v: string, _val: string): Promise<PersistedValidationResult | null> =>
          Promise.resolve(null),
      ),
      findLatestByContentVersion: jest.fn((_v: string): Promise<PersistedValidationResult | null> =>
        Promise.resolve(mockTextValidationResult),
      ),
    };
    const logger: ApplicationLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

    const useCase = new GenerateCreativeUseCase(
      jobRepo,
      assetRepo,
      storage,
      provider,
      compositor,
      contentRepo,
      snapshotRepo,
      textValidationRepo,
      logger,
      undefined,
      undefined,
      undefined,
      undefined,
      true, // allowLegacyProductAssetFallback
    );

    const result = await useCase.execute({
      contentVersionId: 'version-123',
      requestedBy: 'user-operator',
    });

    expect(createJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        creativeProfile: 'ATELIER_HAUSSMANN',
      }),
    );
    expect(generateBackgroundMock).toHaveBeenCalledWith(
      expect.objectContaining({
        stylePrompt: 'ATELIER_HAUSSMANN',
        creativeProfile: 'ATELIER_HAUSSMANN',
        briefText: expect.stringContaining('French travertine limestone'),
      }),
    );
    expect(result.creativeJob.creativeProfile).toBe('ATELIER_HAUSSMANN');
  });

  describe('POSTER-1: Authentic Product Asset Resolution and Missing Guards', () => {
    it('throws CanonicalProductImageMissingError when product image is missing (never silently falls back)', async () => {
      const jobRepo: CreativeJobRepository = {
        createJob: jest.fn((_input: CreateCreativeJobInput): Promise<CreativeJobRecord> =>
          Promise.resolve(mockJobRecord),
        ),
        findById: jest.fn((_id: string): Promise<CreativeJobRecord | null> =>
          Promise.resolve(mockJobRecord),
        ),
        findByContentVersionId: jest.fn((_id: string): Promise<readonly CreativeJobRecord[]> =>
          Promise.resolve([mockJobRecord]),
        ),
        transitionStatus: jest.fn((id: string, _from: string, to: string) =>
          Promise.resolve({ ...mockJobRecord, status: to as CreativeJobStatus }),
        ),
      };

      const emptyStorage: AssetStoragePort = {
        getAssetBuffer: jest.fn((_key: string): Promise<Buffer | null> => Promise.resolve(null)),
        getMetadata: jest.fn((_key: string): Promise<StoredAssetMetadata | null> =>
          Promise.resolve(null),
        ),
        saveAsset: jest.fn((_input: SaveAssetInput): Promise<StoredAssetMetadata> =>
          Promise.resolve(mockStoredMeta),
        ),
        assetExists: jest.fn((_key: string): Promise<boolean> => Promise.resolve(false)),
      };

      const missingSnapshotRepo: ProductSnapshotRepository = {
        create: jest.fn((_input: CreateProductSnapshotRecord): Promise<ProductSnapshot> => {
          throw new Error('Not implemented');
        }),
        findById: jest.fn((_id: string): Promise<ProductSnapshot | null> =>
          Promise.resolve({
            ...mockProductSnapshot,
            product: {
              ...mockProductSnapshot.product,
              product: {
                ...mockProductSnapshot.product.product,
                sku: 'NON-EXISTENT-SKU-999',
                images: [],
              },
            },
          }),
        ),
      };

      const useCase = new GenerateCreativeUseCase(
        jobRepo,
        {
          createAsset: jest.fn(),
          findById: jest.fn(),
          findByJobAndVersion: jest.fn(),
          listByJobId: jest.fn(),
          findLatestByJobId: jest.fn(),
        } as unknown as VisualAssetRepository,
        emptyStorage,
        { providerId: 'p', generateBackground: jest.fn() } as unknown as CreativeProvider,
        { composite: jest.fn() } as unknown as HeroCompositor,
        {
          findVersionById: jest.fn(() => Promise.resolve(mockContentVersion)),
          findJobById: jest.fn(() => Promise.resolve(null)),
        } as unknown as ContentGenerationRepository,
        missingSnapshotRepo,
        {
          findLatestByContentVersion: jest.fn(() => Promise.resolve(mockTextValidationResult)),
        } as unknown as ValidationRepository,
        { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
        undefined,
        undefined,
        undefined,
        undefined,
        true, // allowLegacyProductAssetFallback
      );

      // Verify that even in development mode, it strictly throws CanonicalProductImageMissingError
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      try {
        await expect(
          useCase.execute({
            contentVersionId: 'version-123',
            requestedBy: 'user-operator',
          }),
        ).rejects.toThrow(CanonicalProductImageMissingError);

        await expect(
          useCase.execute({
            contentVersionId: 'version-123',
            requestedBy: 'user-operator',
          }),
        ).rejects.toThrow(
          'Canonical product image is missing. Upload or seed a transparent PNG before generating the poster.',
        );
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });

    it('resolves canonical asset via CAS storage lookup by verified hash', async () => {
      const getAssetBufferMock = jest.fn((key: string): Promise<Buffer | null> => {
        if (key.includes(mockCanonicalProductSha256)) {
          return Promise.resolve(mockCanonicalProductBuffer);
        }
        return Promise.resolve(null);
      });

      const storage: AssetStoragePort = {
        getAssetBuffer: getAssetBufferMock,
        getMetadata: jest.fn(() =>
          Promise.resolve({
            storageKey: `cas/composite.png`,
            sha256Digest: mockCanonicalProductSha256,
            mimeType: 'image/png',
            byteSize: mockCanonicalProductBuffer.length,
            assetRole: 'CANONICAL_PRODUCT' as const,
            createdAt: new Date(),
          }),
        ),
        saveAsset: jest.fn(() => Promise.resolve(mockStoredMeta)),
        assetExists: jest.fn(() => Promise.resolve(true)),
      };

      const compositeMock = jest.fn(
        (_input: CompositeVisualInput): Promise<CompositeVisualResult> =>
          Promise.resolve({
            compositedBuffer: Buffer.from('composite'),
            mimeType: 'image/png',
            width: 1080,
            height: 1080,
            byteSize: 1000,
            sha256: 'comp-sha',
            latencyMs: 50,
            compositorVersion: 'ps-compositor-v1',
            heroScale: 0.55,
            heroPlacement: 'CENTER',
            heroBoundingBox: { x: 270, y: 150, width: 540, height: 540 },
            productDigest: mockCanonicalProductSha256,
            backgroundDigest: 'bg-sha',
            outputDigest: 'out-sha',
          }),
      );

      const useCase = new GenerateCreativeUseCase(
        {
          createJob: jest.fn(() => Promise.resolve(mockJobRecord)),
          findById: jest.fn(() => Promise.resolve(mockJobRecord)),
          findByContentVersionId: jest.fn(() => Promise.resolve([mockJobRecord])),
          transitionStatus: jest.fn((_id, _from, to) =>
            Promise.resolve({ ...mockJobRecord, status: to as CreativeJobStatus }),
          ),
        },
        {
          createAsset: jest.fn(() => Promise.resolve(mockVisualAssetRecord)),
          findById: jest.fn(() => Promise.resolve(mockVisualAssetRecord)),
          findByJobAndVersion: jest.fn(() => Promise.resolve(mockVisualAssetRecord)),
          listByJobId: jest.fn(() => Promise.resolve([mockVisualAssetRecord])),
          findLatestByJobId: jest.fn(() => Promise.resolve(mockVisualAssetRecord)),
        },
        storage,
        {
          providerId: 'p',
          generateBackground: jest.fn(() =>
            Promise.resolve({
              imageBuffer: Buffer.from('bg'),
              mimeType: 'image/png',
              width: 1080,
              height: 1080,
              providerId: 'p',
              model: 'm',
              latencyMs: 10,
            }),
          ),
        } as unknown as CreativeProvider,
        { composite: compositeMock },
        {
          findVersionById: jest.fn(() => Promise.resolve(mockContentVersion)),
          findJobById: jest.fn(() => Promise.resolve(null)),
        } as unknown as ContentGenerationRepository,
        {
          create: jest.fn(),
          findById: jest.fn(() => Promise.resolve(mockProductSnapshot)),
        } as unknown as ProductSnapshotRepository,
        {
          create: jest.fn(),
          findByContentVersionAndValidatorVersion: jest.fn(),
          findLatestByContentVersion: jest.fn(() => Promise.resolve(mockTextValidationResult)),
        } as unknown as ValidationRepository,
        { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
        undefined,
        undefined,
        undefined,
        undefined,
        true, // allowLegacyProductAssetFallback
      );

      const result = await useCase.execute({
        contentVersionId: 'version-123',
        requestedBy: 'user-operator',
      });

      expect(getAssetBufferMock).toHaveBeenCalledWith(
        expect.stringContaining(
          `cas/${mockCanonicalProductSha256.slice(0, 2)}/${mockCanonicalProductSha256.slice(2, 4)}/${mockCanonicalProductSha256}.png`,
        ),
      );
      expect(compositeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          canonicalProductSha256: mockCanonicalProductSha256,
        }),
      );
      expect(result.visualAsset).toBeDefined();
    });
  });
});
