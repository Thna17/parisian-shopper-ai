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
import { ContentVersionNotEligibleForCreativeError } from '../domain/creative-errors.js';
import { type CreativeJobStatus } from '../domain/creative.js';

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
            sha256: 'a'.repeat(64),
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
    sourceProductAssetDigest: 'a'.repeat(64),
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
      (_id: string, _expectedCurrent: CreativeJobStatus, target: CreativeJobStatus): Promise<CreativeJobRecord> =>
        Promise.resolve({ ...mockJobRecord, status: target }),
    );

    const jobRepo: CreativeJobRepository = {
      createJob: jest.fn((_input: CreateCreativeJobInput): Promise<CreativeJobRecord> => Promise.resolve(mockJobRecord)),
      findById: jest.fn((_id: string): Promise<CreativeJobRecord | null> => Promise.resolve(mockJobRecord)),
      findByContentVersionId: jest.fn((_id: string): Promise<readonly CreativeJobRecord[]> => Promise.resolve([mockJobRecord])),
      transitionStatus: transitionStatusMock,
    };

    const assetRepo: VisualAssetRepository = {
      createAsset: jest.fn((_input: CreateVisualAssetInput): Promise<VisualAssetRecord> => Promise.resolve(mockVisualAssetRecord)),
      findById: jest.fn((_id: string): Promise<VisualAssetRecord | null> => Promise.resolve(mockVisualAssetRecord)),
      findByJobAndVersion: jest.fn((_jobId: string, _version: number): Promise<VisualAssetRecord | null> => Promise.resolve(mockVisualAssetRecord)),
      listByJobId: jest.fn((_jobId: string): Promise<readonly VisualAssetRecord[]> => Promise.resolve([mockVisualAssetRecord])),
      findLatestByJobId: jest.fn((_jobId: string): Promise<VisualAssetRecord | null> => Promise.resolve(mockVisualAssetRecord)),
    };

    const storage: AssetStoragePort = {
      getAssetBuffer: jest.fn((_key: string): Promise<Buffer | null> => Promise.resolve(Buffer.from('fake-product-bytes'))),
      getMetadata: jest.fn((_key: string): Promise<StoredAssetMetadata | null> =>
        Promise.resolve({
          storageKey: 'products/' + 'a'.repeat(64) + '.png',
          sha256Digest: 'a'.repeat(64),
          mimeType: 'image/png',
          byteSize: 100,
          assetRole: 'CANONICAL_PRODUCT',
          createdAt: new Date(),
        }),
      ),
      saveAsset: jest.fn((_input: SaveAssetInput): Promise<StoredAssetMetadata> => Promise.resolve(mockStoredMeta)),
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
      findVersionById: jest.fn((_id: string): Promise<ContentVersion | null> => Promise.resolve(mockContentVersion)),
      beginGeneration: jest.fn((_input: BeginGenerationInput): Promise<BeginGenerationResult> => {
        throw new Error('Not implemented');
      }),
      completeGeneration: jest.fn((_input: CompleteGenerationInput): Promise<ContentVersion> => {
        throw new Error('Not implemented');
      }),
      failGeneration: jest.fn((_input: FailGenerationInput): Promise<void> => Promise.resolve()),
      findVersionsByJobId: jest.fn((_jobId: string): Promise<readonly ContentVersion[]> => Promise.resolve([])),
      findAttemptsByJobId: jest.fn((_jobId: string): Promise<readonly GenerationAttempt[]> => Promise.resolve([])),
    };

    const snapshotRepo: ProductSnapshotRepository = {
      create: jest.fn((_input: CreateProductSnapshotRecord): Promise<ProductSnapshot> => {
        throw new Error('Not implemented');
      }),
      findById: jest.fn((_id: string): Promise<ProductSnapshot | null> => Promise.resolve(mockProductSnapshot)),
    };

    const textValidationRepo: ValidationRepository = {
      create: jest.fn((_input: CreateValidationResult): Promise<PersistedValidationResult> => {
        throw new Error('Not implemented');
      }),
      findByContentVersionAndValidatorVersion: jest.fn(
        (_versionId: string, _validatorVersion: string): Promise<PersistedValidationResult | null> => Promise.resolve(null),
      ),
      findLatestByContentVersion: jest.fn(
        (_versionId: string): Promise<PersistedValidationResult | null> => Promise.resolve(mockTextValidationResult),
      ),
    };

    const logger: ApplicationLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const appendMock = jest.fn((_event: OutboxEventDraft): Promise<string> => Promise.resolve('outbox-1'));
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
    );

    const result = await useCase.execute({
      contentVersionId: 'version-123',
      requestedBy: 'user-operator',
      format: 'FEED_SQUARE',
      outboxWriter,
    });

    expect(result.creativeJob.status).toBe('VALIDATING');
    expect(result.visualAsset.id).toBe('visual-asset-1');
    expect(transitionStatusMock).toHaveBeenCalledWith('creative-job-999', 'REQUESTED', 'GENERATING_BACKGROUND');
    expect(transitionStatusMock).toHaveBeenCalledWith('creative-job-999', 'GENERATING_BACKGROUND', 'COMPOSITING');
    expect(transitionStatusMock).toHaveBeenCalledWith('creative-job-999', 'COMPOSITING', 'VALIDATING');
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
      createJob: jest.fn((_input: CreateCreativeJobInput): Promise<CreativeJobRecord> => Promise.resolve(mockJobRecord)),
      findById: jest.fn((_id: string): Promise<CreativeJobRecord | null> => Promise.resolve(mockJobRecord)),
      findByContentVersionId: jest.fn((_id: string): Promise<readonly CreativeJobRecord[]> => Promise.resolve([mockJobRecord])),
      transitionStatus: jest.fn(
        (_id: string, _expectedCurrent: CreativeJobStatus, target: CreativeJobStatus): Promise<CreativeJobRecord> =>
          Promise.resolve({ ...mockJobRecord, status: target }),
      ),
    };
    const assetRepo: VisualAssetRepository = {
      createAsset: jest.fn((_input: CreateVisualAssetInput): Promise<VisualAssetRecord> => Promise.resolve(mockVisualAssetRecord)),
      findById: jest.fn((_id: string): Promise<VisualAssetRecord | null> => Promise.resolve(mockVisualAssetRecord)),
      findByJobAndVersion: jest.fn((_jobId: string, _version: number): Promise<VisualAssetRecord | null> => Promise.resolve(mockVisualAssetRecord)),
      listByJobId: jest.fn((_jobId: string): Promise<readonly VisualAssetRecord[]> => Promise.resolve([mockVisualAssetRecord])),
      findLatestByJobId: jest.fn((_jobId: string): Promise<VisualAssetRecord | null> => Promise.resolve(mockVisualAssetRecord)),
    };
    const storage: AssetStoragePort = {
      getAssetBuffer: jest.fn((_key: string): Promise<Buffer | null> => Promise.resolve(Buffer.from('fake-product-bytes'))),
      getMetadata: jest.fn((_key: string): Promise<StoredAssetMetadata | null> => Promise.resolve(null)),
      saveAsset: jest.fn((_input: SaveAssetInput): Promise<StoredAssetMetadata> => Promise.resolve(mockStoredMeta)),
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
      findVersionById: jest.fn((_id: string): Promise<ContentVersion | null> => Promise.resolve(mockContentVersion)),
      beginGeneration: jest.fn((_input: BeginGenerationInput): Promise<BeginGenerationResult> => {
        throw new Error('Not implemented');
      }),
      completeGeneration: jest.fn((_input: CompleteGenerationInput): Promise<ContentVersion> => {
        throw new Error('Not implemented');
      }),
      failGeneration: jest.fn((_input: FailGenerationInput): Promise<void> => Promise.resolve()),
      findVersionsByJobId: jest.fn((_jobId: string): Promise<readonly ContentVersion[]> => Promise.resolve([])),
      findAttemptsByJobId: jest.fn((_jobId: string): Promise<readonly GenerationAttempt[]> => Promise.resolve([])),
    };
    const snapshotRepo: ProductSnapshotRepository = {
      create: jest.fn((_input: CreateProductSnapshotRecord): Promise<ProductSnapshot> => {
        throw new Error('Not implemented');
      }),
      findById: jest.fn((_id: string): Promise<ProductSnapshot | null> => Promise.resolve(mockProductSnapshot)),
    };
    const textValidationRepo: ValidationRepository = {
      create: jest.fn((_input: CreateValidationResult): Promise<PersistedValidationResult> => {
        throw new Error('Not implemented');
      }),
      findByContentVersionAndValidatorVersion: jest.fn(
        (_versionId: string, _validatorVersion: string): Promise<PersistedValidationResult | null> => Promise.resolve(null),
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
    );

    await expect(
      useCase.execute({
        contentVersionId: 'version-123',
        requestedBy: 'user-operator',
      }),
    ).rejects.toThrow(ContentVersionNotEligibleForCreativeError);
  });
});
