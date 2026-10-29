import { describe, expect, it, jest } from '@jest/globals';
import { createHash } from 'node:crypto';
import {
  type ApplicationLogger,
  ForbiddenError,
  type OutboxEventDraft,
  type OutboxWriter,
} from '@parisian-shopper/common';
import { PermissionService, RoleCode } from '../../auth/domain/permissions.js';
import { RevisePosterUseCase } from './revise-poster.use-case.js';
import {
  type CreateCreativeJobInput,
  type CreativeJobRecord,
  type CreativeJobRepository,
} from './creative-job.repository.js';
import {
  type CreateVisualAssetInput,
  type VisualAssetRecord,
  type VisualAssetRepository,
} from './visual-asset.repository.js';
import {
  type CreateCreativeRevisionInput,
  type CreativeRevisionRepository,
  type CreativeRevisionRequestRecord,
} from './creative-revision.repository.js';
import {
  type AssetStoragePort,
  type SaveAssetInput,
  type StoredAssetMetadata,
} from './asset-storage.port.js';
import {
  type PosterCompositor,
  type RenderPosterInput,
  type RenderPosterResult,
} from './poster-compositor.port.js';
import { type ValidateCreativeUseCase } from './validate-creative.use-case.js';
import {
  type CreateProductSnapshotRecord,
  type ProductSnapshot,
  type ProductSnapshotRepository,
} from '../../products/application/product-snapshot.repository.js';
import {
  type BeginGenerationInput,
  type BeginGenerationResult,
  type CompleteGenerationInput,
  type ContentGenerationRepository,
  type ContentJob,
  type ContentVersion,
  type CreateContentJobInput,
  type CreateDirectVersionInput,
  type FailGenerationInput,
  type GenerationAttempt,
} from '../../content/application/content-generation.repository.js';
import {
  type CreativeBrief,
  type CreativeProvider,
  type GeneratedBackgroundAsset,
} from './creative-provider.port.js';
import { generateTransparentProductPng_TEST_ONLY } from '../infrastructure/fixtures/fake-product-fixtures.js';
import { generateDeterministicBackgroundPng } from '../infrastructure/fixtures/fake-background-fixtures.js';
import {
  AmbiguousRevisionError,
  CreativeStaleVersionError,
  LayerDriftViolationError,
  ProductAssetValidationError,
} from '../domain/creative-errors.js';
import {
  ApprovalDomain,
  type RevisionPlan,
  RevisionTargetType,
} from '../domain/revision/revision-plan.types.js';
import { type CreativeJobStatus } from '../domain/creative.js';

describe('RevisePosterUseCase', () => {
  const permissions = new PermissionService();

  const mockProductBuffer = generateTransparentProductPng_TEST_ONLY({
    width: 400,
    height: 400,
    productWidth: 200,
    productHeight: 300,
  });
  const mockProductSha = createHash('sha256').update(mockProductBuffer).digest('hex');

  const mockBgBuffer = generateDeterministicBackgroundPng({ width: 1080, height: 1080 });
  const mockBgSha = createHash('sha256').update(mockBgBuffer).digest('hex');

  const mockRenderedBuffer = Buffer.from('rendered-poster-png');

  const mockJob: CreativeJobRecord = {
    id: 'job-p1',
    contentVersionId: 'ver-c1',
    productSnapshotId: 'snap-p1',
    brandRuleVersionId: 'rule-b1',
    status: 'READY_FOR_REVIEW',
    targetPlatform: 'GENERIC',
    aspectRatio: '1:1',
    creativeProfile: 'PARISIAN_MORNING_ATELIER',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAsset: VisualAssetRecord = {
    id: 'asset-v1',
    creativeJobId: 'job-p1',
    versionNumber: 1,
    assetRole: 'COMPOSITED_CREATIVE',
    mimeType: 'image/png',
    width: 1080,
    height: 1080,
    byteSize: 5000,
    sha256: 'poster-sha-1',
    storageKey: 'cas/poster-1.png',
    sourceProductAssetDigest: mockProductSha,
    backgroundAssetDigest: mockBgSha,
    createdAt: new Date(),
  };

  const mockSnapshot: ProductSnapshot = {
    id: 'snap-p1',
    snapshotHash: 'snap-hash-1',
    normalizerVersion: 'phase-1b-v1',
    createdAt: new Date(),
    product: {
      schema_version: '1.0',
      source_system: 'ERP',
      retrieved_at: new Date().toISOString(),
      source_updated_at: new Date().toISOString(),
      lifecycle_status: 'active',
      product: {
        sku: 'SKU-REV-1',
        product_name: 'L’Essence Parisienne',
        brand: 'Geparlys',
        category: 'Fragrance',
        price: '85.0000',
        currency: 'USD',
        stock_status: 'in_stock',
        size: { value: '100', unit: 'ml', display: '100 ml' },
        fragrance_notes: {
          top: ['Bergamot', 'Mandarin'],
          heart: ['Rose', 'Jasmine'],
          base: ['Amber', 'Cedarwood'],
        },
        images: [
          {
            url: 'https://cdn.example.com/rev.png',
            role: 'primary',
            position: 1,
            sha256: mockProductSha,
          },
        ],
      },
    },
  };

  const mockContentVersion: ContentVersion = {
    id: 'ver-c1',
    contentJobId: 'job-c1',
    versionNumber: 1,
    brandRuleVersionId: 'rule-b1',
    productSnapshotId: 'snap-p1',
    generationAttemptId: 'att-1',
    provider: 'MOCK_PROVIDER',
    model: 'mock-model-v1',
    promptVersion: '1.0',
    structuredOutput: {
      headline: 'Parisian Elegance',
      english_caption: 'A timeless scent from the heart of Paris.',
      khmer_caption: 'ក្លិនក្រអូបមិនចេះរីងស្ងួត',
      cta: 'Discover More',
      hashtags: ['#perfume'],
      creative_brief: 'Parisian brief',
      facts_used: ['Geparlys'],
      warnings: [],
      missing_information: [],
    },
    createdAt: new Date(),
  };

  interface SetupMocksResult {
    readonly useCase: RevisePosterUseCase;
    readonly generateBackgroundMock: jest.Mock<
      (brief: CreativeBrief) => Promise<GeneratedBackgroundAsset>
    >;
    readonly renderPosterMock: jest.Mock<(input: RenderPosterInput) => Promise<RenderPosterResult>>;
    readonly createRequestMock: jest.Mock<
      (input: CreateCreativeRevisionInput) => Promise<CreativeRevisionRequestRecord>
    >;
    readonly completeRequestMock: jest.Mock<
      (id: string, resultingAssetId: string) => Promise<CreativeRevisionRequestRecord>
    >;
    readonly createAssetMock: jest.Mock<
      (input: CreateVisualAssetInput) => Promise<VisualAssetRecord>
    >;
    readonly saveAssetMock: jest.Mock<(input: SaveAssetInput) => Promise<StoredAssetMetadata>>;
    readonly validateExecuteMock: jest.Mock<
      (input: { creativeJobId: string; visualAssetId: string }) => Promise<{ isPassed: boolean }>
    >;
  }

  function setupMocks(): SetupMocksResult {
    const jobRepo: CreativeJobRepository = {
      createJob: jest.fn((_input: CreateCreativeJobInput): Promise<CreativeJobRecord> => {
        throw new Error('Not implemented');
      }),
      findById: jest.fn((id: string): Promise<CreativeJobRecord | null> =>
        Promise.resolve(id === mockJob.id ? mockJob : null),
      ),
      findByContentVersionId: jest.fn((_id: string): Promise<readonly CreativeJobRecord[]> =>
        Promise.resolve([mockJob]),
      ),
      transitionStatus: jest.fn(
        (
          _id: string,
          _from: CreativeJobStatus,
          to: CreativeJobStatus,
        ): Promise<CreativeJobRecord> => Promise.resolve({ ...mockJob, status: to }),
      ),
    };

    let latestAssetNumber = 1;
    const createAssetMock = jest.fn((input: CreateVisualAssetInput): Promise<VisualAssetRecord> => {
      latestAssetNumber++;
      const newAsset: VisualAssetRecord = {
        id: `asset-v${latestAssetNumber}`,
        creativeJobId: input.creativeJobId,
        versionNumber: latestAssetNumber,
        assetRole: input.assetRole,
        mimeType: input.mimeType,
        width: input.width,
        height: input.height,
        byteSize: input.byteSize,
        sha256: input.sha256,
        storageKey: input.storageKey,
        sourceProductAssetDigest: input.sourceProductAssetDigest,
        ...(input.backgroundAssetDigest !== undefined
          ? { backgroundAssetDigest: input.backgroundAssetDigest }
          : {}),
        createdAt: new Date(),
      };
      return Promise.resolve(newAsset);
    });

    const assetRepo: VisualAssetRepository = {
      createAsset: createAssetMock,
      findById: jest.fn((id: string): Promise<VisualAssetRecord | null> =>
        Promise.resolve(id === mockAsset.id ? mockAsset : null),
      ),
      findByJobAndVersion: jest.fn(
        (_jobId: string, _version: number): Promise<VisualAssetRecord | null> =>
          Promise.resolve(null),
      ),
      findLatestByJobId: jest.fn((_jobId: string): Promise<VisualAssetRecord | null> =>
        Promise.resolve(mockAsset),
      ),
      listByJobId: jest.fn((_jobId: string): Promise<readonly VisualAssetRecord[]> =>
        Promise.resolve([mockAsset]),
      ),
    };

    const createRequestMock = jest.fn(
      (input: CreateCreativeRevisionInput): Promise<CreativeRevisionRequestRecord> =>
        Promise.resolve({
          id: 'rev-req-1',
          creativeJobId: input.creativeJobId,
          sourceVisualAssetId: input.sourceVisualAssetId,
          requestedByUserId: input.requestedByUserId,
          type: input.type,
          status: 'PENDING',
          ...(input.instruction !== undefined ? { instruction: input.instruction } : {}),
          createdAt: new Date(),
        }),
    );
    const completeRequestMock = jest.fn(
      (id: string, resultingAssetId: string): Promise<CreativeRevisionRequestRecord> =>
        Promise.resolve({
          id,
          creativeJobId: mockJob.id,
          sourceVisualAssetId: mockAsset.id,
          requestedByUserId: 'user-editor',
          type: 'EDIT_BACKGROUND',
          status: 'COMPLETED',
          resultingVisualAssetId: resultingAssetId,
          createdAt: new Date(),
        }),
    );

    const revisionRepo: CreativeRevisionRepository = {
      createRequest: createRequestMock,
      findById: jest.fn((_id: string): Promise<CreativeRevisionRequestRecord | null> =>
        Promise.resolve(null),
      ),
      findActiveByJobId: jest.fn((_jobId: string): Promise<CreativeRevisionRequestRecord | null> =>
        Promise.resolve(null),
      ),
      completeRequest: completeRequestMock,
      cancelRequest: jest.fn((id: string): Promise<CreativeRevisionRequestRecord> =>
        Promise.resolve({
          id,
          creativeJobId: mockJob.id,
          sourceVisualAssetId: mockAsset.id,
          requestedByUserId: 'user-editor',
          type: 'EDIT_BACKGROUND',
          status: 'CANCELLED',
          createdAt: new Date(),
        }),
      ),
    };

    const saveAssetMock = jest.fn((input: SaveAssetInput): Promise<StoredAssetMetadata> =>
      Promise.resolve({
        storageKey: `cas/${createHash('sha256').update(input.buffer).digest('hex')}.png`,
        sha256Digest: createHash('sha256').update(input.buffer).digest('hex'),
        byteSize: input.buffer.length,
        mimeType: input.mimeType,
        assetRole: input.assetRole,
        createdAt: new Date(),
      }),
    );

    const storage: AssetStoragePort = {
      saveAsset: saveAssetMock,
      getMetadata: jest.fn((_key: string): Promise<StoredAssetMetadata | null> =>
        Promise.resolve(null),
      ),
      getAssetBuffer: jest.fn((key: string): Promise<Buffer | null> => {
        if (key.includes(mockProductSha)) return Promise.resolve(mockProductBuffer);
        if (key.includes(mockBgSha)) return Promise.resolve(mockBgBuffer);
        return Promise.resolve(mockBgBuffer);
      }),
      assetExists: jest.fn((_key: string): Promise<boolean> => Promise.resolve(true)),
    };

    const snapshotRepo: ProductSnapshotRepository = {
      create: jest.fn((_input: CreateProductSnapshotRecord): Promise<ProductSnapshot> =>
        Promise.resolve(mockSnapshot),
      ),
      findById: jest.fn((id: string): Promise<ProductSnapshot | null> =>
        Promise.resolve(id === mockSnapshot.id ? mockSnapshot : null),
      ),
    };

    const contentRepo: ContentGenerationRepository = {
      createJob: jest.fn((_input: CreateContentJobInput): Promise<ContentJob> => {
        throw new Error('Not implemented');
      }),
      findJobById: jest.fn((_id: string): Promise<ContentJob | null> => Promise.resolve(null)),
      findAttemptsByJobId: jest.fn((_id: string): Promise<readonly GenerationAttempt[]> =>
        Promise.resolve([]),
      ),
      findVersionById: jest.fn((id: string): Promise<ContentVersion | null> =>
        Promise.resolve(id === mockContentVersion.id ? mockContentVersion : null),
      ),
      createDirectVersion: jest.fn((_input: CreateDirectVersionInput): Promise<ContentVersion> =>
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
        Promise.resolve([mockContentVersion]),
      ),
    };

    const validateExecuteMock = jest.fn(
      (_input: { creativeJobId: string; visualAssetId: string }): Promise<{ isPassed: boolean }> =>
        Promise.resolve({ isPassed: true }),
    );

    const validateCreative = {
      execute: validateExecuteMock,
    } as unknown as ValidateCreativeUseCase;

    const logger: ApplicationLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const renderPosterMock = jest.fn((input: RenderPosterInput): Promise<RenderPosterResult> =>
      Promise.resolve({
        posterBuffer: mockRenderedBuffer,
        mimeType: 'image/png',
        sha256: 'rendered-sha',
        width: 1080,
        height: 1080,
        byteSize: mockRenderedBuffer.length,
        latencyMs: 20,
        compositorVersion: 'v2',
        layoutManifest: {
          version: '1.0',
          templateId: input.posterSpec.templateId,
          dimensions: { width: 1080, height: 1080 },
          safeMargins: { top: 40, bottom: 40, left: 40, right: 40 },
          elements: [],
        },
        productDigest: mockProductSha,
        backgroundDigest: mockBgSha,
        outputDigest: 'rendered-sha',
      }),
    );

    const posterCompositor: PosterCompositor = {
      renderPoster: renderPosterMock,
    };

    const generateBackgroundMock = jest.fn(
      (_brief: CreativeBrief): Promise<GeneratedBackgroundAsset> =>
        Promise.resolve({
          imageBuffer: mockBgBuffer,
          mimeType: 'image/png',
          width: 1080,
          height: 1080,
          providerId: 'MOCK_AI_PROVIDER',
          model: 'mock-ai-model',
          latencyMs: 100,
        }),
    );

    const creativeProvider: CreativeProvider = {
      providerId: 'MOCK_AI_PROVIDER',
      generateBackground: generateBackgroundMock,
    };

    const useCase = new RevisePosterUseCase(
      jobRepo,
      assetRepo,
      revisionRepo,
      storage,
      snapshotRepo,
      contentRepo,
      validateCreative,
      permissions,
      logger,
      posterCompositor,
      creativeProvider,
    );

    return {
      useCase,
      generateBackgroundMock,
      renderPosterMock,
      createRequestMock,
      completeRequestMock,
      createAssetMock,
      saveAssetMock,
      validateExecuteMock,
    };
  }

  describe('editText (Zero AI Calls)', () => {
    it('updates poster typography, creates new visual asset version, and executes 0 AI calls', async () => {
      const {
        useCase,
        createRequestMock,
        completeRequestMock,
        validateExecuteMock,
        renderPosterMock,
        generateBackgroundMock,
      } = setupMocks();

      const result = await useCase.editText({
        creativeJobId: 'job-p1',
        textEdits: {
          headline: 'Exclusive Paris Night',
          cta: 'Shop Collection',
        },
        actorUserId: 'user-editor',
        actorRoles: [RoleCode.MARKETING_EDITOR],
      });

      expect(result.isPassed).toBe(true);
      expect(result.visualAsset.versionNumber).toBe(2);
      expect(result.posterBuffer).toEqual(mockRenderedBuffer);

      // Verify ZERO AI calls were made
      expect(generateBackgroundMock).not.toHaveBeenCalled();

      // Verify compositor called with updated text spec
      expect(renderPosterMock).toHaveBeenCalledWith(
        expect.objectContaining({
          creativeJobId: 'job-p1',
          posterSpec: expect.objectContaining({
            headline: 'Exclusive Paris Night',
            cta: 'Shop Collection',
          }),
        }),
      );

      // Verify revision request created and marked completed
      expect(createRequestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          creativeJobId: 'job-p1',
          type: 'EDIT_BACKGROUND',
        }),
      );
      expect(completeRequestMock).toHaveBeenCalled();

      // Verify visual validation was run on new asset
      expect(validateExecuteMock).toHaveBeenCalledWith({
        creativeJobId: 'job-p1',
        visualAssetId: result.visualAsset.id,
      });
    });
  });

  describe('editLayout (Zero AI Calls)', () => {
    it('switches template layout, updates badge, and executes 0 AI calls', async () => {
      const { useCase, renderPosterMock, generateBackgroundMock, createRequestMock } = setupMocks();

      const result = await useCase.editLayout({
        creativeJobId: 'job-p1',
        templateId: 'CENTERED_HERO',
        productPlacement: 'CENTER',
        textAlignment: 'CENTER',
        showPriceBadge: true,
        actorUserId: 'user-editor',
        actorRoles: [RoleCode.MARKETING_EDITOR],
      });

      expect(result.isPassed).toBe(true);
      expect(result.visualAsset.versionNumber).toBe(2);

      // Zero AI calls
      expect(generateBackgroundMock).not.toHaveBeenCalled();

      // Re-rendered with CENTERED_HERO template
      expect(renderPosterMock).toHaveBeenCalledWith(
        expect.objectContaining({
          posterSpec: expect.objectContaining({
            templateId: 'CENTERED_HERO',
            productPlacement: 'CENTER',
            textPlacement: 'CENTER',
          }),
        }),
      );

      expect(createRequestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          instruction: expect.stringContaining('CENTERED_HERO'),
        }),
      );
    });
  });

  describe('changeStyle (Generates 1 fresh AI background)', () => {
    it('generates exactly 1 new AI background with specified preset, stores in CAS, and composes poster', async () => {
      const { useCase, generateBackgroundMock, saveAssetMock, renderPosterMock } = setupMocks();

      const result = await useCase.changeStyle({
        creativeJobId: 'job-p1',
        stylePreset: 'NOCTURNE_OBSIDIAN',
        actorUserId: 'user-editor',
        actorRoles: [RoleCode.MARKETING_EDITOR],
      });

      expect(result.isPassed).toBe(true);

      // Exactly 1 AI generation
      expect(generateBackgroundMock).toHaveBeenCalledTimes(1);
      expect(generateBackgroundMock).toHaveBeenCalledWith(
        expect.objectContaining({
          creativeJobId: 'job-p1',
          stylePrompt: 'NOCTURNE_OBSIDIAN',
        }),
      );

      // CAS storage saved the generated background
      expect(saveAssetMock).toHaveBeenCalledWith(
        expect.objectContaining({
          assetRole: 'GENERATED_BACKGROUND',
        }),
      );

      // Poster composited with new background
      expect(renderPosterMock).toHaveBeenCalled();
    });
  });

  describe('newBackground (Generates 1 fresh concept)', () => {
    it('generates 1 fresh AI background preserving approved copy and canonical product', async () => {
      const { useCase, generateBackgroundMock, createRequestMock } = setupMocks();

      const result = await useCase.newBackground({
        creativeJobId: 'job-p1',
        actorUserId: 'user-editor',
        actorRoles: [RoleCode.MARKETING_EDITOR],
      });

      expect(result.isPassed).toBe(true);
      expect(generateBackgroundMock).toHaveBeenCalledTimes(1);
      expect(createRequestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'REGENERATE_BACKGROUND',
        }),
      );
    });
  });

  describe('replaceProductAsset (Upload & Validation)', () => {
    it('rejects unauthorized actor without CREATE_CONTENT permission', async () => {
      const { useCase } = setupMocks();

      await expect(
        useCase.replaceProductAsset({
          creativeJobId: 'job-p1',
          sku: 'SKU-REV-1',
          assetBuffer: mockProductBuffer,
          mimeType: 'image/png',
          actorUserId: 'user-viewer',
          actorRoles: ['VIEWER'],
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('rejects opaque product asset without transparency', async () => {
      const { useCase } = setupMocks();

      // Solid opaque 200x200 PNG
      const opaqueBuffer = generateDeterministicBackgroundPng({ width: 200, height: 200 });

      await expect(
        useCase.replaceProductAsset({
          creativeJobId: 'job-p1',
          sku: 'SKU-REV-1',
          assetBuffer: opaqueBuffer,
          mimeType: 'image/png',
          actorUserId: 'user-editor',
          actorRoles: ['MARKETING_EDITOR'],
        }),
      ).rejects.toThrow(ProductAssetValidationError);
    });

    it('validates authentic transparent PNG, saves to CAS, and re-renders poster', async () => {
      const { useCase, saveAssetMock, renderPosterMock, createAssetMock } = setupMocks();

      const result = await useCase.replaceProductAsset({
        creativeJobId: 'job-p1',
        sku: 'SKU-REV-1',
        assetBuffer: mockProductBuffer,
        mimeType: 'image/png',
        actorUserId: 'user-editor',
        actorRoles: ['MARKETING_EDITOR'],
      });

      expect(result.isPassed).toBe(true);

      // Validated product saved to CAS
      expect(saveAssetMock).toHaveBeenCalledWith(
        expect.objectContaining({
          assetRole: 'CANONICAL_PRODUCT',
          mimeType: 'image/png',
        }),
      );

      // Composited with the verified product buffer
      expect(renderPosterMock).toHaveBeenCalled();
      expect(createAssetMock).toHaveBeenCalledWith(
        expect.objectContaining({
          creativeJobId: 'job-p1',
          assetRole: 'COMPOSITED_CREATIVE',
        }),
      );
    });
  });

  describe('Revision Authorization Guardrails', () => {
    it('enforces EDIT_CREATIVE on editText', async () => {
      const { useCase } = setupMocks();

      // Empty roles array denied
      await expect(
        useCase.editText({
          creativeJobId: 'job-p1',
          textEdits: { headline: 'Deny Me' },
          actorUserId: 'user-viewer',
          actorRoles: [],
        }),
      ).rejects.toThrow(ForbiddenError);

      // VIEWER denied
      await expect(
        useCase.editText({
          creativeJobId: 'job-p1',
          textEdits: { headline: 'Deny Me' },
          actorUserId: 'user-viewer',
          actorRoles: [RoleCode.VIEWER],
        }),
      ).rejects.toThrow(ForbiddenError);

      // Legacy STAFF denied
      await expect(
        useCase.editText({
          creativeJobId: 'job-p1',
          textEdits: { headline: 'Deny Me' },
          actorUserId: 'user-staff',
          actorRoles: ['STAFF'],
        }),
      ).rejects.toThrow(ForbiddenError);

      // MARKETING_EDITOR allowed
      const result = await useCase.editText({
        creativeJobId: 'job-p1',
        textEdits: { headline: 'Allowed Headline' },
        actorUserId: 'user-editor',
        actorRoles: [RoleCode.MARKETING_EDITOR],
      });
      expect(result.isPassed).toBe(true);
    });

    it('enforces EDIT_CREATIVE on editLayout', async () => {
      const { useCase } = setupMocks();

      // Empty roles array denied
      await expect(
        useCase.editLayout({
          creativeJobId: 'job-p1',
          templateId: 'CENTERED_HERO',
          actorUserId: 'user-viewer',
          actorRoles: [],
        }),
      ).rejects.toThrow(ForbiddenError);

      // VIEWER denied
      await expect(
        useCase.editLayout({
          creativeJobId: 'job-p1',
          templateId: 'CENTERED_HERO',
          actorUserId: 'user-viewer',
          actorRoles: [RoleCode.VIEWER],
        }),
      ).rejects.toThrow(ForbiddenError);

      // MARKETING_APPROVER allowed
      const result = await useCase.editLayout({
        creativeJobId: 'job-p1',
        templateId: 'CENTERED_HERO',
        actorUserId: 'user-approver',
        actorRoles: [RoleCode.MARKETING_APPROVER],
      });
      expect(result.isPassed).toBe(true);
    });

    it('enforces REGENERATE_CREATIVE on changeStyle', async () => {
      const { useCase } = setupMocks();

      // Empty roles array denied
      await expect(
        useCase.changeStyle({
          creativeJobId: 'job-p1',
          stylePreset: 'MONOCHROME_HAUSSMANN',
          actorUserId: 'user-viewer',
          actorRoles: [],
        }),
      ).rejects.toThrow(ForbiddenError);

      // VIEWER denied
      await expect(
        useCase.changeStyle({
          creativeJobId: 'job-p1',
          stylePreset: 'MONOCHROME_HAUSSMANN',
          actorUserId: 'user-viewer',
          actorRoles: [RoleCode.VIEWER],
        }),
      ).rejects.toThrow(ForbiddenError);

      // MARKETING_EDITOR allowed
      const result = await useCase.changeStyle({
        creativeJobId: 'job-p1',
        stylePreset: 'MONOCHROME_HAUSSMANN',
        actorUserId: 'user-editor',
        actorRoles: [RoleCode.MARKETING_EDITOR],
      });
      expect(result.isPassed).toBe(true);
    });

    it('enforces REGENERATE_CREATIVE on newBackground', async () => {
      const { useCase } = setupMocks();

      // Empty roles array denied
      await expect(
        useCase.newBackground({
          creativeJobId: 'job-p1',
          actorUserId: 'user-viewer',
          actorRoles: [],
        }),
      ).rejects.toThrow(ForbiddenError);

      // VIEWER denied
      await expect(
        useCase.newBackground({
          creativeJobId: 'job-p1',
          actorUserId: 'user-viewer',
          actorRoles: [RoleCode.VIEWER],
        }),
      ).rejects.toThrow(ForbiddenError);

      // ADMIN allowed
      const result = await useCase.newBackground({
        creativeJobId: 'job-p1',
        actorUserId: 'user-admin',
        actorRoles: [RoleCode.ADMIN],
      });
      expect(result.isPassed).toBe(true);
    });
  });

  describe('executePlan (W31-D: Targeted Layer Compositing & Hash Preservation)', () => {
    it('executes targeted typography revision, preserves product cutout and background hashes with zero drift', async () => {
      const { useCase, generateBackgroundMock, renderPosterMock } = setupMocks();

      const plan: RevisionPlan = {
        id: 'plan-typo-1',
        creativeJobId: 'job-p1',
        baseVersionNumber: 1,
        requestedByUserId: 'user-editor',
        rawInstruction: 'Headline: Parisian Midnight; Price: 185 EUR',
        executionStrategy: 'ZERO_AI_COMPOSITE',
        confidence: 'CONFIDENT',
        confidenceScore: 1.0,
        mutations: [
          {
            target: RevisionTargetType.HEADLINE,
            fieldName: 'headline',
            requestedValue: 'Parisian Midnight',
          },
          {
            target: RevisionTargetType.PRICE,
            fieldName: 'price',
            requestedValue: '185 EUR',
          },
        ],
        affectedLayerGroups: ['TYPOGRAPHY'],
        preservedLayerDigests: {
          PRODUCT_HERO: mockProductSha,
          BACKGROUND: mockBgSha,
        },
        requiresConfirmation: false,
        estimatedExecutionMs: 80,
        createdAt: new Date(),
      };

      const result = await useCase.executePlan({
        creativeJobId: 'job-p1',
        plan,
        actorUserId: 'user-editor',
        actorRoles: [RoleCode.MARKETING_EDITOR],
      });

      expect(result.isPassed).toBe(true);
      expect(result.visualAsset.versionNumber).toBe(2);
      expect(result.posterBuffer).toEqual(mockRenderedBuffer);

      // Verify ZERO AI calls were made
      expect(generateBackgroundMock).not.toHaveBeenCalled();

      // Verify compositor called with updated spec
      expect(renderPosterMock).toHaveBeenCalledWith(
        expect.objectContaining({
          posterSpec: expect.objectContaining({
            headline: 'Parisian Midnight',
            price: '185 EUR',
          }),
          canonicalProductSha256: mockProductSha,
          backgroundSha256: mockBgSha,
        }),
      );

      // Cryptographic hash continuity assertions
      expect(result.visualAsset.sourceProductAssetDigest).toBe(mockProductSha);
      expect(result.visualAsset.backgroundAssetDigest).toBe(mockBgSha);

      // Invalidation assessment checks
      expect(result.invalidationAssessment).toBeDefined();
      expect(result.invalidationAssessment?.invalidatedApprovalDomains).toContain(
        ApprovalDomain.CONTENT_APPROVED,
      );
      expect(result.invalidationAssessment?.invalidatedApprovalDomains).toContain(
        ApprovalDomain.VISUAL_APPROVED,
      );
      expect(result.invalidationAssessment?.preservedApprovalDomains).toContain(
        ApprovalDomain.PRODUCT_GOVERNANCE_APPROVED,
      );
    });

    it('executes targeted layout revision (placement & scale) with zero drift on preserved layers', async () => {
      const { useCase, generateBackgroundMock, renderPosterMock } = setupMocks();

      const plan: RevisionPlan = {
        id: 'plan-layout-1',
        creativeJobId: 'job-p1',
        baseVersionNumber: 1,
        requestedByUserId: 'user-editor',
        rawInstruction: 'Align: left; Scale: 1.25',
        executionStrategy: 'ZERO_AI_COMPOSITE',
        confidence: 'CONFIDENT',
        confidenceScore: 0.95,
        mutations: [
          {
            target: RevisionTargetType.PRODUCT_PLACEMENT,
            fieldName: 'productPlacement',
            requestedValue: 'LEFT',
          },
          {
            target: RevisionTargetType.PRODUCT_SCALE,
            fieldName: 'productScale',
            requestedValue: 1.25,
          },
        ],
        affectedLayerGroups: ['PRODUCT_HERO', 'SURFACE_SHADOW'],
        preservedLayerDigests: {
          BACKGROUND: mockBgSha,
        },
        requiresConfirmation: false,
        estimatedExecutionMs: 90,
        createdAt: new Date(),
      };

      const result = await useCase.executePlan({
        creativeJobId: 'job-p1',
        plan,
        actorUserId: 'user-editor',
        actorRoles: [RoleCode.MARKETING_EDITOR],
      });

      expect(result.isPassed).toBe(true);
      expect(generateBackgroundMock).not.toHaveBeenCalled();

      expect(renderPosterMock).toHaveBeenCalledWith(
        expect.objectContaining({
          posterSpec: expect.objectContaining({
            productPlacement: 'LEFT',
            layoutIntent: expect.objectContaining({ productScale: 1.25 }),
          }),
          backgroundSha256: mockBgSha,
        }),
      );

      expect(result.visualAsset.backgroundAssetDigest).toBe(mockBgSha);
      expect(result.visualAsset.sourceProductAssetDigest).toBe(mockProductSha);
    });

    it('executes AI background regeneration with confirmed plan, updates background digest and preserves product hero', async () => {
      const { useCase, generateBackgroundMock } = setupMocks();

      const plan: RevisionPlan = {
        id: 'plan-style-1',
        creativeJobId: 'job-p1',
        baseVersionNumber: 1,
        requestedByUserId: 'user-admin',
        rawInstruction: 'Style: Nocturne Royale',
        executionStrategy: 'AI_BACKGROUND_REGEN',
        confidence: 'CONFIDENT',
        confidenceScore: 1.0,
        mutations: [
          {
            target: RevisionTargetType.STYLE_PRESET,
            fieldName: 'stylePreset',
            requestedValue: 'NOCTURNE_ROYALE',
          },
        ],
        affectedLayerGroups: ['BACKGROUND', 'SURFACE_SHADOW'],
        preservedLayerDigests: {
          PRODUCT_HERO: mockProductSha,
        },
        requiresConfirmation: true,
        estimatedExecutionMs: 3500,
        createdAt: new Date(),
      };

      const result = await useCase.executePlan({
        creativeJobId: 'job-p1',
        plan,
        confirmed: true,
        actorUserId: 'user-admin',
        actorRoles: [RoleCode.ADMIN],
      });

      expect(result.isPassed).toBe(true);
      expect(generateBackgroundMock).toHaveBeenCalledTimes(1);

      // Authentic product cutout MUST be preserved bit-for-bit
      expect(result.visualAsset.sourceProductAssetDigest).toBe(mockProductSha);

      // Invalidation assessment: visual approval invalidated, but content approval preserved!
      expect(result.invalidationAssessment?.invalidatedApprovalDomains).toContain(
        ApprovalDomain.VISUAL_APPROVED,
      );
      expect(result.invalidationAssessment?.preservedApprovalDomains).toContain(
        ApprovalDomain.CONTENT_APPROVED,
      );
    });

    it('rejects unconfirmed plan when requiresConfirmation is true', async () => {
      const { useCase, generateBackgroundMock, renderPosterMock } = setupMocks();

      const plan: RevisionPlan = {
        id: 'plan-ambig-1',
        creativeJobId: 'job-p1',
        baseVersionNumber: 1,
        requestedByUserId: 'user-editor',
        rawInstruction: 'make it feel darker and moodier',
        executionStrategy: 'AI_BACKGROUND_REGEN',
        confidence: 'AMBIGUOUS',
        confidenceScore: 0.72,
        mutations: [
          {
            target: RevisionTargetType.STYLE_PRESET,
            fieldName: 'stylePreset',
            requestedValue: 'NOCTURNE_ROYALE',
          },
        ],
        affectedLayerGroups: ['BACKGROUND'],
        preservedLayerDigests: {
          PRODUCT_HERO: mockProductSha,
        },
        requiresConfirmation: true,
        confirmationReason: 'Ambiguous instruction mapped to Nocturne Royale',
        estimatedExecutionMs: 4000,
        createdAt: new Date(),
      };

      await expect(
        useCase.executePlan({
          creativeJobId: 'job-p1',
          plan,
          confirmed: false,
          actorUserId: 'user-admin',
          actorRoles: [RoleCode.ADMIN],
        }),
      ).rejects.toThrow(AmbiguousRevisionError);

      expect(generateBackgroundMock).not.toHaveBeenCalled();
      expect(renderPosterMock).not.toHaveBeenCalled();
    });

    it('rejects revision when base version does not match source asset version (optimistic concurrency)', async () => {
      const { useCase } = setupMocks();

      const plan: RevisionPlan = {
        id: 'plan-stale-1',
        creativeJobId: 'job-p1',
        baseVersionNumber: 5, // Source asset is version 1!
        requestedByUserId: 'user-editor',
        rawInstruction: 'Headline: Outdated Edit',
        executionStrategy: 'ZERO_AI_COMPOSITE',
        confidence: 'CONFIDENT',
        confidenceScore: 1.0,
        mutations: [
          {
            target: RevisionTargetType.HEADLINE,
            fieldName: 'headline',
            requestedValue: 'Outdated Edit',
          },
        ],
        affectedLayerGroups: ['TYPOGRAPHY'],
        preservedLayerDigests: {
          PRODUCT_HERO: mockProductSha,
          BACKGROUND: mockBgSha,
        },
        requiresConfirmation: false,
        estimatedExecutionMs: 80,
        createdAt: new Date(),
      };

      await expect(
        useCase.executePlan({
          creativeJobId: 'job-p1',
          plan,
          actorUserId: 'user-editor',
          actorRoles: [RoleCode.MARKETING_EDITOR],
        }),
      ).rejects.toThrow(CreativeStaleVersionError);
    });

    it('detects and rejects layer drift when non-targeted layer hash does not match source digest', async () => {
      const { useCase } = setupMocks();

      const plan: RevisionPlan = {
        id: 'plan-drift-1',
        creativeJobId: 'job-p1',
        baseVersionNumber: 1,
        requestedByUserId: 'user-editor',
        rawInstruction: 'Headline: Drift Test',
        executionStrategy: 'ZERO_AI_COMPOSITE',
        confidence: 'CONFIDENT',
        confidenceScore: 1.0,
        mutations: [
          {
            target: RevisionTargetType.HEADLINE,
            fieldName: 'headline',
            requestedValue: 'Drift Test',
          },
        ],
        affectedLayerGroups: ['TYPOGRAPHY'],
        preservedLayerDigests: {
          PRODUCT_HERO: 'unexpected-tampered-product-hash',
          BACKGROUND: mockBgSha,
        },
        requiresConfirmation: false,
        estimatedExecutionMs: 80,
        createdAt: new Date(),
      };

      await expect(
        useCase.executePlan({
          creativeJobId: 'job-p1',
          plan,
          actorUserId: 'user-editor',
          actorRoles: [RoleCode.MARKETING_EDITOR],
        }),
      ).rejects.toThrow(LayerDriftViolationError);
    });

    it('enforces permission matrix on executePlan', async () => {
      const { useCase } = setupMocks();

      const aiPlan: RevisionPlan = {
        id: 'plan-perm-ai',
        creativeJobId: 'job-p1',
        baseVersionNumber: 1,
        requestedByUserId: 'user-editor',
        rawInstruction: 'New Background',
        executionStrategy: 'AI_BACKGROUND_REGEN',
        confidence: 'CONFIDENT',
        confidenceScore: 1.0,
        mutations: [
          {
            target: RevisionTargetType.NEW_BACKGROUND,
            fieldName: 'newBackground',
            requestedValue: true,
          },
        ],
        affectedLayerGroups: ['BACKGROUND'],
        preservedLayerDigests: {
          PRODUCT_HERO: mockProductSha,
        },
        requiresConfirmation: true,
        estimatedExecutionMs: 3000,
        createdAt: new Date(),
      };

      // VIEWER lacks REGENERATE_CREATIVE
      await expect(
        useCase.executePlan({
          creativeJobId: 'job-p1',
          plan: aiPlan,
          confirmed: true,
          actorUserId: 'user-viewer',
          actorRoles: [RoleCode.VIEWER],
        }),
      ).rejects.toThrow(ForbiddenError);

      const zeroAiPlan: RevisionPlan = {
        id: 'plan-perm-zero',
        creativeJobId: 'job-p1',
        baseVersionNumber: 1,
        requestedByUserId: 'user-viewer',
        rawInstruction: 'Headline: Read Only Attempt',
        executionStrategy: 'ZERO_AI_COMPOSITE',
        confidence: 'CONFIDENT',
        confidenceScore: 1.0,
        mutations: [
          {
            target: RevisionTargetType.HEADLINE,
            fieldName: 'headline',
            requestedValue: 'Read Only Attempt',
          },
        ],
        affectedLayerGroups: ['TYPOGRAPHY'],
        preservedLayerDigests: {
          PRODUCT_HERO: mockProductSha,
          BACKGROUND: mockBgSha,
        },
        requiresConfirmation: false,
        estimatedExecutionMs: 80,
        createdAt: new Date(),
      };

      // VIEWER lacks EDIT_CREATIVE
      await expect(
        useCase.executePlan({
          creativeJobId: 'job-p1',
          plan: zeroAiPlan,
          actorUserId: 'user-viewer',
          actorRoles: [RoleCode.VIEWER],
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('emits enriched CREATIVE_REVISED outbox event when outboxWriter is provided', async () => {
      const { useCase } = setupMocks();

      const appendMock = jest.fn((_event: OutboxEventDraft): Promise<string> =>
        Promise.resolve('outbox-rev-1'),
      );
      const outboxWriter: OutboxWriter = { append: appendMock };

      const plan: RevisionPlan = {
        id: 'plan-enriched-outbox',
        creativeJobId: 'job-p1',
        baseVersionNumber: 1,
        requestedByUserId: 'user-editor',
        rawInstruction: 'Headline: Luxury Reimagined',
        executionStrategy: 'ZERO_AI_COMPOSITE',
        confidence: 'CONFIDENT',
        confidenceScore: 1.0,
        mutations: [
          {
            target: RevisionTargetType.HEADLINE,
            fieldName: 'headline',
            requestedValue: 'Luxury Reimagined',
          },
        ],
        affectedLayerGroups: ['TYPOGRAPHY'],
        preservedLayerDigests: {
          PRODUCT_HERO: mockProductSha,
          BACKGROUND: mockBgSha,
        },
        requiresConfirmation: false,
        estimatedExecutionMs: 80,
        createdAt: new Date(),
      };

      const result = await useCase.executePlan({
        creativeJobId: 'job-p1',
        plan,
        actorUserId: 'user-editor',
        actorRoles: [RoleCode.MARKETING_EDITOR],
        outboxWriter,
      });

      expect(result.isPassed).toBe(true);
      expect(appendMock).toHaveBeenCalledTimes(1);

      const appendedEvent = appendMock.mock.calls[0]![0];
      expect(appendedEvent.topic).toBe('CREATIVE_REVISED');
      expect(appendedEvent.aggregateType).toBe('CreativeJob');
      expect(appendedEvent.aggregateId).toBe('job-p1');
      expect(appendedEvent.idempotencyKey).toBe(
        `creative-job:job-p1:revised:${result.visualAsset.id}`,
      );

      const payload = appendedEvent.payload as Record<string, unknown>;
      expect(payload.creativeJobId).toBe('job-p1');
      expect(payload.visualAssetId).toBe(result.visualAsset.id);
      expect(payload.previousVisualAssetId).toBe('asset-v1');
      expect(payload.versionNumber).toBe(2);
      expect(payload.baseVersionNumber).toBe(1);
      expect(payload.planId).toBe('plan-enriched-outbox');
      expect(payload.rawInstruction).toBe('Headline: Luxury Reimagined');
      expect(payload.executionStrategy).toBe('ZERO_AI_COMPOSITE');
      expect(payload.mutations).toBeDefined();

      const assessment = payload.invalidationAssessment as Record<string, unknown>;
      expect(assessment).toBeDefined();
      expect(assessment.invalidatedGateCodes).toBeDefined();
      expect(assessment.preservedGateCodes).toBeDefined();
      expect(assessment.invalidatedApprovalDomains).toBeDefined();
      expect(assessment.preservedApprovalDomains).toBeDefined();
      expect(assessment.affectedLayerGroups).toContain('TYPOGRAPHY');
      expect(assessment.preservedLayerDigests).toBeDefined();
    });
  });
});
