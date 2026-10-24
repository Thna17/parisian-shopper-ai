/* eslint-disable @typescript-eslint/unbound-method */
import { createHash } from 'node:crypto';
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { type ApplicationLogger } from '@parisian-shopper/common';
import { GenerateCreativeUseCase } from './generate-creative.use-case.js';
import {
  type CreativeJobRepository,
  type CreativeJobRecord,
  type CreateCreativeJobInput,
} from './creative-job.repository.js';
import { type CreativeJobStatus } from '../domain/creative.js';
import {
  type VisualAssetRepository,
  type VisualAssetRecord,
  type CreateVisualAssetInput,
} from './visual-asset.repository.js';
import {
  type AssetStoragePort,
  type SaveAssetInput,
  type StoredAssetMetadata,
} from './asset-storage.port.js';
import {
  type CreativeProvider,
  type GeneratedBackgroundAsset,
  type CreativeBrief,
} from './creative-provider.port.js';
import {
  type HeroCompositor,
  type CompositeVisualInput,
  type CompositeVisualResult,
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
import { ProductAssetEligibilityEvaluator } from '../../products/application/product-asset-eligibility-evaluator.js';
import {
  type ProductAsset,
  ProductAssetApprovalDecision,
  type ProductAssetApprovalEvent,
  type ProductAssetRegistration,
  ProductAssetRightsState,
  type ProductAssetRightsEvent,
  ProductAssetRole,
  type ProductAssetTransform,
  type ProductAssetValidationAssessment,
} from '../../products/domain/product-asset.js';
import {
  ProductAssetLegacyFallbackDisabledError,
  ProductAssetOpaqueHeroError,
  ProductAssetRightsUnverifiedError,
  ProductAssetUnapprovedError,
} from '../../products/domain/product-asset-errors.js';
import { type ProductAssetRepository } from '../../products/application/product-asset.repository.js';
import {
  type ProductAssetStoragePort,
  type StoredProductAssetInfo,
} from '../../products/application/product-asset-storage.port.js';
import { ProductAssetValidator } from '../domain/services/product-asset-validator.js';
import { generateTransparentProductPng_TEST_ONLY } from '../infrastructure/fixtures/fake-product-fixtures.js';

describe('GenerateCreativeUseCase - W12 Governed Asset Fail-Fast Invariants', () => {
  let mockJobRepo: CreativeJobRepository;
  let mockAssetRepo: VisualAssetRepository;
  let mockStorage: AssetStoragePort;
  let mockProvider: CreativeProvider;
  let mockCompositor: HeroCompositor;
  let mockContentRepo: ContentGenerationRepository;
  let mockSnapshotRepo: ProductSnapshotRepository;
  let mockValidationRepo: ValidationRepository;
  let mockLogger: ApplicationLogger;

  let mockProductAssetRepo: ProductAssetRepository;
  let mockProductAssetStorage: ProductAssetStoragePort;
  let eligibilityEvaluator: ProductAssetEligibilityEvaluator;
  let generateBackgroundSpy: jest.Mock<(brief: CreativeBrief) => Promise<GeneratedBackgroundAsset>>;
  let compositeSpy: jest.Mock<(input: CompositeVisualInput) => Promise<CompositeVisualResult>>;

  const validTransparentPng = generateTransparentProductPng_TEST_ONLY({
    width: 400,
    height: 400,
    productWidth: 200,
    productHeight: 300,
    productColor: { r: 100, g: 150, b: 200, a: 255 },
  });
  const validSha = createHash('sha256').update(validTransparentPng).digest('hex');

  const mockContentVersion: ContentVersion = {
    id: 'version-failfast-test',
    contentJobId: 'job-failfast-test',
    versionNumber: 1,
    brandRuleVersionId: 'brand-rule-1',
    productSnapshotId: 'snapshot-failfast-test',
    generationAttemptId: 'attempt-1',
    provider: 'openai',
    model: 'gpt-4o',
    promptVersion: 'v1',
    structuredOutput: {
      headline: 'Timeless Luxury',
      khmer_caption: 'ភាពប្រណិត',
      english_caption: 'Timeless luxury.',
      cta: 'Shop Now',
      hashtags: ['#ParisianShopper'],
      creative_brief: 'Studio backdrop',
      facts_used: ['Brand'],
      warnings: [],
      missing_information: [],
    },
    createdAt: new Date(),
  };

  const mockSnapshot: ProductSnapshot = {
    id: 'snapshot-failfast-test',
    product: {
      schema_version: '1.0',
      source_system: 'MEKHLA_PRODUCT_API',
      source_record_id: 'rec-1',
      retrieved_at: new Date().toISOString(),
      source_updated_at: new Date().toISOString(),
      lifecycle_status: 'active',
      product: {
        sku: 'FAILFAST-SKU-001',
        product_name: 'Luxury Fragrance',
        brand: 'Parisian Shopper',
        category: 'Fragrance',
        price: '120.00',
        currency: 'USD',
        stock_status: 'in_stock',
        images: [
          {
            url: 'https://cdn.mekhla.digital/products/failfast.png',
            role: 'primary',
            position: 1,
            sha256: validSha,
          },
        ],
      },
    },
    snapshotHash: 'mock-snapshot-hash-123456789012345678901234567890123456789012345678',
    normalizerVersion: '1.0.0',
    createdAt: new Date(),
  };

  const mockValidationResult: PersistedValidationResult = {
    id: 'val-1',
    contentVersionId: 'version-failfast-test',
    validatorVersion: '1.0.0',
    status: 'PASSED',
    findingCount: 0,
    blockingCount: 0,
    warningCount: 0,
    infoCount: 0,
    findings: [],
    createdAt: new Date(),
  };

  const mockJobRecord: CreativeJobRecord = {
    id: 'creative-job-failfast',
    contentVersionId: 'version-failfast-test',
    productSnapshotId: 'snapshot-failfast-test',
    brandRuleVersionId: 'brand-rule-1',
    targetPlatform: 'GENERIC',
    status: 'REQUESTED',
    aspectRatio: '1:1',
    creativeProfile: 'PARISIAN_MINIMALIST',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    generateBackgroundSpy = jest.fn((_brief: CreativeBrief): Promise<GeneratedBackgroundAsset> =>
      Promise.resolve({
        imageBuffer: Buffer.from('fake-bg'),
        mimeType: 'image/png',
        width: 1080,
        height: 1080,
        providerId: 'higgsfield',
        model: 'model-1',
        latencyMs: 100,
      }),
    );

    compositeSpy = jest.fn((_input: CompositeVisualInput): Promise<CompositeVisualResult> =>
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
    );

    mockJobRepo = {
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
          _expected: CreativeJobStatus,
          target: CreativeJobStatus,
        ): Promise<CreativeJobRecord> => Promise.resolve({ ...mockJobRecord, status: target }),
      ),
    };

    mockAssetRepo = {
      createAsset: jest.fn((_input: CreateVisualAssetInput): Promise<VisualAssetRecord> =>
        Promise.resolve({
          id: 'visual-1',
          creativeJobId: 'creative-job-failfast',
          versionNumber: 1,
          assetRole: 'COMPOSITED_CREATIVE',
          mimeType: 'image/png',
          width: 1080,
          height: 1080,
          byteSize: 5000,
          sha256: 'b'.repeat(64),
          storageKey: 'cas/comp.png',
          sourceProductAssetDigest: validSha,
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

    mockStorage = {
      saveAsset: jest.fn((_input: SaveAssetInput): Promise<StoredAssetMetadata> =>
        Promise.resolve({
          storageKey: 'cas/comp.png',
          sha256Digest: 'b'.repeat(64),
          mimeType: 'image/png',
          byteSize: 5000,
          width: 1080,
          height: 1080,
          assetRole: 'COMPOSITED_CREATIVE',
          createdAt: new Date(),
        }),
      ),
      getMetadata: jest.fn((_key: string): Promise<StoredAssetMetadata | null> =>
        Promise.resolve(null),
      ),
      getAssetBuffer: jest.fn((_key: string): Promise<Buffer | null> =>
        Promise.resolve(validTransparentPng),
      ),
      assetExists: jest.fn((_key: string): Promise<boolean> => Promise.resolve(true)),
    };

    mockProvider = {
      providerId: 'higgsfield',
      generateBackground: generateBackgroundSpy,
    };

    mockCompositor = {
      composite: compositeSpy,
    };

    mockContentRepo = {
      findVersionById: jest.fn((_id: string): Promise<ContentVersion | null> =>
        Promise.resolve(mockContentVersion),
      ),
      findJobById: jest.fn((_id: string): Promise<ContentJob | null> =>
        Promise.resolve({
          id: 'job-failfast-test',
          productSnapshotId: 'snapshot-failfast',
          brandRuleVersionId: 'brand-1',
          requesterUserId: 'user-1',
          contentType: 'PRODUCT_SPOTLIGHT',
          language: 'KM',
          platform: 'GENERIC',
          campaignContext: 'PARISIAN_MINIMALIST',
          status: 'DRAFT',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ),
      createJob: jest.fn((_input: CreateContentJobInput): Promise<ContentJob> => {
        throw new Error('Not implemented');
      }),
      beginGeneration: jest.fn((_input: BeginGenerationInput): Promise<BeginGenerationResult> => {
        throw new Error('Not implemented');
      }),
      completeGeneration: jest.fn((_input: CompleteGenerationInput): Promise<ContentVersion> => {
        throw new Error('Not implemented');
      }),
      failGeneration: jest.fn((_input: FailGenerationInput): Promise<void> => Promise.resolve()),
      findVersionsByJobId: jest.fn((_jobId: string): Promise<readonly ContentVersion[]> =>
        Promise.resolve([mockContentVersion]),
      ),
      findAttemptsByJobId: jest.fn((_jobId: string): Promise<readonly GenerationAttempt[]> =>
        Promise.resolve([]),
      ),
    };

    mockSnapshotRepo = {
      findById: jest.fn((_id: string): Promise<ProductSnapshot | null> =>
        Promise.resolve(mockSnapshot),
      ),
      create: jest.fn((_input: CreateProductSnapshotRecord): Promise<ProductSnapshot> => {
        throw new Error('Not implemented');
      }),
      findLatestBySku: jest.fn((_sku: string): Promise<ProductSnapshot | null> =>
        Promise.resolve(mockSnapshot),
      ),
    };

    mockValidationRepo = {
      findLatestByContentVersion: jest.fn(
        (_versionId: string): Promise<PersistedValidationResult | null> =>
          Promise.resolve(mockValidationResult),
      ),
      findByContentVersionAndValidatorVersion: jest.fn(
        (
          _versionId: string,
          _validatorVersion: string,
        ): Promise<PersistedValidationResult | null> => Promise.resolve(null),
      ),
      create: jest.fn((_input: CreateValidationResult): Promise<PersistedValidationResult> => {
        throw new Error('Not implemented');
      }),
    };

    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    mockProductAssetRepo = {
      saveAsset: jest.fn((a: ProductAsset): Promise<ProductAsset> => Promise.resolve(a)),
      findAssetById: jest.fn((_id: string): Promise<ProductAsset | null> => Promise.resolve(null)),
      findAssetBySha256: jest.fn((_sha: string): Promise<ProductAsset | null> =>
        Promise.resolve(null),
      ),
      saveRegistration: jest.fn((r: ProductAssetRegistration): Promise<ProductAssetRegistration> =>
        Promise.resolve(r),
      ),
      findRegistrationById: jest.fn((_id: string): Promise<ProductAssetRegistration | null> =>
        Promise.resolve(null),
      ),
      findRegistrationsBySku: jest.fn(
        (_sku: string): Promise<readonly ProductAssetRegistration[]> => Promise.resolve([]),
      ),
      findRegistrationsBySkuAndRole: jest.fn(
        (_sku: string, _role: ProductAssetRole): Promise<readonly ProductAssetRegistration[]> =>
          Promise.resolve([]),
      ),
      findApprovedHeroCutoutBySku: jest.fn(
        (_sku: string): Promise<ProductAssetRegistration | null> => Promise.resolve(null),
      ),
      saveValidationAssessment: jest.fn(
        (v: ProductAssetValidationAssessment): Promise<ProductAssetValidationAssessment> =>
          Promise.resolve(v),
      ),
      findLatestValidationAssessment: jest.fn(
        (_id: string): Promise<ProductAssetValidationAssessment | null> => Promise.resolve(null),
      ),
      saveApprovalEvent: jest.fn(
        (e: ProductAssetApprovalEvent): Promise<ProductAssetApprovalEvent> => Promise.resolve(e),
      ),
      findApprovalEventsByRegistration: jest.fn(
        (_regId: string): Promise<readonly ProductAssetApprovalEvent[]> => Promise.resolve([]),
      ),
      findLatestApprovalEvent: jest.fn(
        (_regId: string): Promise<ProductAssetApprovalEvent | null> => Promise.resolve(null),
      ),
      saveRightsEvent: jest.fn((e: ProductAssetRightsEvent): Promise<ProductAssetRightsEvent> =>
        Promise.resolve(e),
      ),
      findRightsEventsByRegistration: jest.fn(
        (_regId: string): Promise<readonly ProductAssetRightsEvent[]> => Promise.resolve([]),
      ),
      findLatestRightsEvent: jest.fn(
        (_regId: string): Promise<ProductAssetRightsEvent | null> => Promise.resolve(null),
      ),
      findAllHeroCutoutRegistrations: jest.fn(
        (_sku: string): Promise<readonly ProductAssetRegistration[]> => Promise.resolve([]),
      ),
      findRegistrationByReplacedId: jest.fn(
        (_id: string): Promise<ProductAssetRegistration | null> => Promise.resolve(null),
      ),
      saveTransform: jest.fn((t: ProductAssetTransform): Promise<ProductAssetTransform> =>
        Promise.resolve(t),
      ),
      findTransformsByDerivedAsset: jest.fn(
        (_id: string): Promise<readonly ProductAssetTransform[]> => Promise.resolve([]),
      ),
    };

    mockProductAssetStorage = {
      deriveStorageKey: jest.fn((sha: string, ext: string): string => `cas/mock/${sha}.${ext}`),
      saveAsset: jest.fn((buf: Buffer, mime: string): Promise<StoredProductAssetInfo> =>
        Promise.resolve({
          storageKey: 'cas/mock/key.png',
          sha256: validSha,
          mimeType: mime,
          byteSize: buf.length,
        }),
      ),
      getAssetBuffer: jest.fn((_key: string): Promise<Buffer | null> =>
        Promise.resolve(validTransparentPng),
      ),
      assetExists: jest.fn((_key: string): Promise<boolean> => Promise.resolve(true)),
    };

    eligibilityEvaluator = new ProductAssetEligibilityEvaluator(
      mockProductAssetRepo,
      mockProductAssetStorage,
      new ProductAssetValidator(),
    );
  });

  it('fails fast and makes ZERO provider calls when hero asset is UNAPPROVED', async () => {
    const reg: ProductAssetRegistration = {
      id: 'reg-unapproved',
      productAssetId: 'asset-1',
      sku: 'FAILFAST-SKU-001',
      role: ProductAssetRole.HERO_CUTOUT,
      sourceSystem: 'TEST',
      rightsState: ProductAssetRightsState.VERIFIED,
      registeredAt: new Date(),
    };

    const approvalEvent: ProductAssetApprovalEvent = {
      id: 'app-unapproved',
      productAssetRegistrationId: 'reg-unapproved',
      decision: ProductAssetApprovalDecision.SUBMITTED, // NOT approved
      decidedAt: new Date(),
    };

    jest.spyOn(mockProductAssetRepo, 'findRegistrationsBySkuAndRole').mockResolvedValue([reg]);
    jest
      .spyOn(mockProductAssetRepo, 'findApprovalEventsByRegistration')
      .mockResolvedValue([approvalEvent]);

    const useCase = new GenerateCreativeUseCase(
      mockJobRepo,
      mockAssetRepo,
      mockStorage,
      mockProvider,
      mockCompositor,
      mockContentRepo,
      mockSnapshotRepo,
      mockValidationRepo,
      mockLogger,
      new ProductAssetValidator(),
      undefined,
      undefined,
      eligibilityEvaluator,
    );

    await expect(
      useCase.execute({
        contentVersionId: 'version-failfast-test',
        requestedBy: 'user-123',
      }),
    ).rejects.toThrow(ProductAssetUnapprovedError);

    // INVARIANT VERIFIED: Zero AI provider calls made, zero job records created, $0 cost ceiling preserved!
    expect(mockJobRepo.createJob).not.toHaveBeenCalled();
    expect(generateBackgroundSpy).not.toHaveBeenCalled();
    expect(compositeSpy).not.toHaveBeenCalled();
  });

  it('fails fast and makes ZERO provider calls when asset rights are UNVERIFIED', async () => {
    const reg: ProductAssetRegistration = {
      id: 'reg-unverified-rights',
      productAssetId: 'asset-1',
      sku: 'FAILFAST-SKU-001',
      role: ProductAssetRole.HERO_CUTOUT,
      sourceSystem: 'TEST',
      rightsState: ProductAssetRightsState.UNKNOWN, // NOT verified
      registeredAt: new Date(),
    };

    const approvalEvent: ProductAssetApprovalEvent = {
      id: 'app-approved',
      productAssetRegistrationId: 'reg-unverified-rights',
      decision: ProductAssetApprovalDecision.APPROVED,
      decidedAt: new Date(),
    };

    jest.spyOn(mockProductAssetRepo, 'findRegistrationsBySkuAndRole').mockResolvedValue([reg]);
    jest
      .spyOn(mockProductAssetRepo, 'findApprovalEventsByRegistration')
      .mockResolvedValue([approvalEvent]);
    jest
      .spyOn(mockProductAssetRepo, 'findLatestApprovalEvent')
      .mockResolvedValue(approvalEvent);
    jest.spyOn(mockProductAssetRepo, 'findLatestRightsEvent').mockResolvedValue({
      id: 'rights-1',
      productAssetRegistrationId: 'reg-unverified-rights',
      rightsState: ProductAssetRightsState.UNKNOWN,
      effectiveAt: new Date(),
      createdAt: new Date(),
    });

    const useCase = new GenerateCreativeUseCase(
      mockJobRepo,
      mockAssetRepo,
      mockStorage,
      mockProvider,
      mockCompositor,
      mockContentRepo,
      mockSnapshotRepo,
      mockValidationRepo,
      mockLogger,
      new ProductAssetValidator(),
      undefined,
      undefined,
      eligibilityEvaluator,
    );

    await expect(
      useCase.execute({
        contentVersionId: 'version-failfast-test',
        requestedBy: 'user-123',
      }),
    ).rejects.toThrow(ProductAssetRightsUnverifiedError);

    expect(mockJobRepo.createJob).not.toHaveBeenCalled();
    expect(generateBackgroundSpy).not.toHaveBeenCalled();
    expect(compositeSpy).not.toHaveBeenCalled();
  });

  it('fails fast and makes ZERO provider calls when hero asset is OPAQUE under W03-DEC-004', async () => {
    const asset: ProductAsset = {
      id: 'asset-opaque',
      sha256: validSha,
      storageKey: 'cas/opaque/key.png',
      mimeType: 'image/png',
      format: 'png',
      byteSize: 5000,
      width: 500,
      height: 500,
      pixelCount: 250000,
      channels: 3,
      hasAlpha: false, // Opaque
      transparencyRatio: 0,
      createdAt: new Date(),
    };

    const reg: ProductAssetRegistration = {
      id: 'reg-opaque',
      productAssetId: 'asset-opaque',
      sku: 'FAILFAST-SKU-001',
      role: ProductAssetRole.HERO_CUTOUT,
      sourceSystem: 'TEST',
      rightsState: ProductAssetRightsState.VERIFIED,
      registeredAt: new Date(),
    };

    const appEvent: ProductAssetApprovalEvent = {
      id: 'app-1',
      productAssetRegistrationId: 'reg-opaque',
      decision: ProductAssetApprovalDecision.APPROVED,
      decidedAt: new Date(),
    };

    jest.spyOn(mockProductAssetRepo, 'findRegistrationsBySkuAndRole').mockResolvedValue([reg]);
    jest
      .spyOn(mockProductAssetRepo, 'findApprovalEventsByRegistration')
      .mockResolvedValue([appEvent]);
    jest
      .spyOn(mockProductAssetRepo, 'findLatestApprovalEvent')
      .mockResolvedValue(appEvent);
    jest.spyOn(mockProductAssetRepo, 'findLatestRightsEvent').mockResolvedValue({
      id: 'rights-1',
      productAssetRegistrationId: 'reg-opaque',
      rightsState: ProductAssetRightsState.VERIFIED,
      effectiveAt: new Date(),
      createdAt: new Date(),
    });
    jest.spyOn(mockProductAssetRepo, 'findAssetById').mockResolvedValue(asset);

    const useCase = new GenerateCreativeUseCase(
      mockJobRepo,
      mockAssetRepo,
      mockStorage,
      mockProvider,
      mockCompositor,
      mockContentRepo,
      mockSnapshotRepo,
      mockValidationRepo,
      mockLogger,
      new ProductAssetValidator(),
      undefined,
      undefined,
      eligibilityEvaluator,
    );

    await expect(
      useCase.execute({
        contentVersionId: 'version-failfast-test',
        requestedBy: 'user-123',
      }),
    ).rejects.toThrow(ProductAssetOpaqueHeroError);

    expect(mockJobRepo.createJob).not.toHaveBeenCalled();
    expect(generateBackgroundSpy).not.toHaveBeenCalled();
    expect(compositeSpy).not.toHaveBeenCalled();
  });

  it('fails fast and makes ZERO provider calls when legacy fallback is disabled and no hero cutout is registered', async () => {
    jest.spyOn(mockProductAssetRepo, 'findRegistrationsBySkuAndRole').mockResolvedValue([]);

    const useCase = new GenerateCreativeUseCase(
      mockJobRepo,
      mockAssetRepo,
      mockStorage,
      mockProvider,
      mockCompositor,
      mockContentRepo,
      mockSnapshotRepo,
      mockValidationRepo,
      mockLogger,
      new ProductAssetValidator(),
      undefined,
      undefined,
      eligibilityEvaluator,
      false, // allowLegacyProductAssetFallback = false
    );

    await expect(
      useCase.execute({
        contentVersionId: 'version-failfast-test',
        requestedBy: 'user-123',
      }),
    ).rejects.toThrow(ProductAssetLegacyFallbackDisabledError);

    expect(mockJobRepo.createJob).not.toHaveBeenCalled();
    expect(generateBackgroundSpy).not.toHaveBeenCalled();
    expect(compositeSpy).not.toHaveBeenCalled();
  });
});
