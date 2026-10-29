/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, jest } from '@jest/globals';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { type ApplicationLogger, ForbiddenError, ValidationError } from '@parisian-shopper/common';
import { RoleCode } from '../../auth/domain/permissions.js';
import { ExportPosterUseCase } from './export-poster.use-case.js';
import {
  type CreativeExportRepository,
  type CreateCreativeExportInput,
  type CreativeExportRecord,
} from './creative-export.repository.js';
import { HardVisualGatesEngine } from '../domain/services/hard-visual-gates.engine.js';
import { HardGateCode } from '../domain/services/hard-visual-gates.port.js';
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
  type AssetStoragePort,
  type SaveAssetInput,
  type StoredAssetMetadata,
} from './asset-storage.port.js';
import {
  type PosterCompositor,
  type RenderPosterInput,
  type RenderPosterResult,
} from './poster-compositor.port.js';
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
import { generateTransparentProductPng_TEST_ONLY } from '../infrastructure/fixtures/fake-product-fixtures.js';
import { generateDeterministicBackgroundPng } from '../infrastructure/fixtures/fake-background-fixtures.js';
import {
  type CreativeApprovalRepository,
  type CreativeApprovalEventRecord,
  type RecordCreativeApprovalInput,
} from './creative-approval.repository.js';
import { CreativeJobNotFoundError, VisualAssetNotFoundError } from '../domain/creative-errors.js';
import { type CreativeJobStatus } from '../domain/creative.js';

describe('ExportPosterUseCase', () => {
  const mockProductBuffer = generateTransparentProductPng_TEST_ONLY({
    width: 400,
    height: 400,
    productWidth: 200,
    productHeight: 300,
  });
  const mockProductSha = createHash('sha256').update(mockProductBuffer).digest('hex');

  const mockBgBuffer = generateDeterministicBackgroundPng({ width: 1080, height: 1080 });
  const mockBgSha = createHash('sha256').update(mockBgBuffer).digest('hex');

  async function createDummyRenderedBuffer(width: number, height: number): Promise<Buffer> {
    return sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 245, g: 240, b: 235, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
  }

  const mockJob: CreativeJobRecord = {
    id: 'job-exp-1',
    contentVersionId: 'ver-exp-1',
    productSnapshotId: 'snap-exp-1',
    brandRuleVersionId: 'rule-exp-1',
    status: 'CREATIVE_APPROVED',
    targetPlatform: 'GENERIC',
    aspectRatio: '1:1',
    creativeProfile: 'PARISIAN_MORNING_ATELIER',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAsset: VisualAssetRecord = {
    id: 'asset-exp-1',
    creativeJobId: 'job-exp-1',
    versionNumber: 1,
    assetRole: 'COMPOSITED_CREATIVE',
    mimeType: 'image/png',
    width: 1080,
    height: 1080,
    byteSize: 10000,
    sha256: 'poster-exp-sha',
    storageKey: 'cas/poster-exp-1.png',
    sourceProductAssetDigest: mockProductSha,
    backgroundAssetDigest: mockBgSha,
    createdAt: new Date(),
  };

  const mockSnapshot: ProductSnapshot = {
    id: 'snap-exp-1',
    snapshotHash: 'snap-exp-hash',
    normalizerVersion: 'phase-1b-v1',
    createdAt: new Date(),
    product: {
      schema_version: '1.0',
      source_system: 'ERP',
      retrieved_at: new Date().toISOString(),
      source_updated_at: new Date().toISOString(),
      lifecycle_status: 'active',
      product: {
        sku: 'GPR-PARIS-100',
        product_name: 'L’Essence Parisienne',
        brand: 'Geparlys',
        category: 'Fragrance',
        price: '95.0000',
        currency: 'USD',
        stock_status: 'in_stock',
        size: { value: '100', unit: 'ml', display: '100 ml' },
        images: [
          {
            url: 'https://cdn.example.com/paris.png',
            role: 'primary',
            position: 1,
            sha256: mockProductSha,
          },
        ],
      },
    },
  };

  const mockContentVersion: ContentVersion = {
    id: 'ver-exp-1',
    contentJobId: 'job-exp-c1',
    versionNumber: 1,
    brandRuleVersionId: 'rule-exp-1',
    productSnapshotId: 'snap-exp-1',
    generationAttemptId: 'att-exp-1',
    provider: 'MOCK_PROVIDER',
    model: 'mock-model-v1',
    promptVersion: '1.0',
    structuredOutput: {
      headline: 'The Parisian Secret',
      english_caption: 'Pure French craftsmanship.',
      khmer_caption: 'សិល្បៈបារាំងពិតប្រាកដ',
      cta: 'Order Now',
      hashtags: ['#geparlys'],
      creative_brief: 'Parisian export brief',
      facts_used: ['Geparlys'],
      warnings: [],
      missing_information: [],
    },
    createdAt: new Date(),
  };

  interface SetupMocksOptions {
    readonly jobStatus?: CreativeJobStatus;
    readonly assetOverrides?: Partial<VisualAssetRecord>;
    readonly approvalEvents?: readonly CreativeApprovalEventRecord[];
    readonly exportRepo?: CreativeExportRepository;
    readonly hardGatesEngine?: HardVisualGatesEngine;
  }

  interface SetupMocksResult {
    readonly useCase: ExportPosterUseCase;
    readonly renderPosterMock: jest.Mock<(input: RenderPosterInput) => Promise<RenderPosterResult>>;
    readonly assetFindByIdMock: jest.Mock<(id: string) => Promise<VisualAssetRecord | null>>;
    readonly assetFindLatestMock: jest.Mock<
      (creativeJobId: string) => Promise<VisualAssetRecord | null>
    >;
    readonly approvalRepo: CreativeApprovalRepository;
    readonly storageSaveMock: jest.Mock<(input: SaveAssetInput) => Promise<StoredAssetMetadata>>;
    readonly storageGetBufferMock: jest.Mock<(key: string) => Promise<Buffer | null>>;
    readonly exportRepoMock: jest.Mocked<CreativeExportRepository>;
  }

  function setupMocks(options?: SetupMocksOptions): SetupMocksResult {
    const effectiveJob: CreativeJobRecord = options?.jobStatus
      ? { ...mockJob, status: options.jobStatus }
      : mockJob;
    const effectiveAsset: VisualAssetRecord = options?.assetOverrides
      ? { ...mockAsset, ...options.assetOverrides }
      : mockAsset;

    const jobRepo: CreativeJobRepository = {
      createJob: jest.fn((_input: CreateCreativeJobInput): Promise<CreativeJobRecord> => {
        throw new Error('Not implemented');
      }),
      findById: jest.fn((id: string): Promise<CreativeJobRecord | null> =>
        Promise.resolve(id === effectiveJob.id ? effectiveJob : null),
      ),
      findByContentVersionId: jest.fn((_id: string): Promise<readonly CreativeJobRecord[]> =>
        Promise.resolve([effectiveJob]),
      ),
      transitionStatus: jest.fn(
        (
          _id: string,
          _from: CreativeJobStatus,
          _to: CreativeJobStatus,
        ): Promise<CreativeJobRecord> => {
          throw new Error('Not implemented');
        },
      ),
    };

    const assetFindByIdMock = jest.fn((id: string): Promise<VisualAssetRecord | null> =>
      Promise.resolve(id === effectiveAsset.id ? effectiveAsset : null),
    );
    const assetFindLatestMock = jest.fn((_jobId: string): Promise<VisualAssetRecord | null> =>
      Promise.resolve(effectiveAsset),
    );

    const assetRepo: VisualAssetRepository = {
      createAsset: jest.fn((_input: CreateVisualAssetInput): Promise<VisualAssetRecord> => {
        throw new Error('Not implemented');
      }),
      findById: assetFindByIdMock,
      findByJobAndVersion: jest.fn(
        (_jobId: string, _version: number): Promise<VisualAssetRecord | null> =>
          Promise.resolve(null),
      ),
      findLatestByJobId: assetFindLatestMock,
      listByJobId: jest.fn((_jobId: string): Promise<readonly VisualAssetRecord[]> =>
        Promise.resolve([mockAsset]),
      ),
    };

    const storageSaveMock = jest.fn((input: SaveAssetInput): Promise<StoredAssetMetadata> => {
      const sha = createHash('sha256').update(input.buffer).digest('hex');
      const ext = input.mimeType === 'image/jpeg' ? 'jpg' : 'png';
      return Promise.resolve({
        storageKey: `cas/${sha.slice(0, 2)}/${sha.slice(2, 4)}/${sha}.${ext}`,
        sha256Digest: sha,
        mimeType: input.mimeType,
        byteSize: input.buffer.length,
        assetRole: input.assetRole,
        createdAt: new Date(),
      });
    });
    const storageGetBufferMock = jest.fn((key: string): Promise<Buffer | null> => {
      if (key.includes(mockProductSha)) return Promise.resolve(mockProductBuffer);
      if (key.includes(mockBgSha)) return Promise.resolve(mockBgBuffer);
      return Promise.resolve(mockBgBuffer);
    });

    const storage: AssetStoragePort = {
      saveAsset: storageSaveMock,
      getMetadata: jest.fn((_key: string): Promise<StoredAssetMetadata | null> =>
        Promise.resolve(null),
      ),
      getAssetBuffer: storageGetBufferMock,
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

    const logger: ApplicationLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const renderPosterMock = jest.fn(
      async (input: RenderPosterInput): Promise<RenderPosterResult> => {
        const width = input.posterSpec.outputFormat.width;
        const height = input.posterSpec.outputFormat.height;
        const buf = await createDummyRenderedBuffer(width, height);
        const digest = createHash('sha256').update(buf).digest('hex');
        return {
          posterBuffer: buf,
          mimeType: 'image/png',
          sha256: digest,
          width,
          height,
          byteSize: buf.length,
          latencyMs: 15,
          compositorVersion: 'v2',
          layoutManifest: {
            version: '1.0',
            templateId: input.posterSpec.templateId,
            dimensions: { width, height },
            safeMargins: { top: 40, bottom: 40, left: 40, right: 40 },
            elements: [],
          },
          productDigest: mockProductSha,
          backgroundDigest: mockBgSha,
          outputDigest: digest,
        };
      },
    );

    const posterCompositor: PosterCompositor = {
      renderPoster: renderPosterMock,
    };

    const defaultApprovalEvent: CreativeApprovalEventRecord = {
      id: 'app-evt-1',
      creativeJobId: effectiveJob.id,
      visualAssetId: effectiveAsset.id,
      approverUserId: 'user-approver-1',
      decision: 'CREATIVE_APPROVED',
      createdAt: new Date(),
    };
    const effectiveApprovals = options?.approvalEvents ?? [defaultApprovalEvent];

    const approvalRepo: CreativeApprovalRepository = {
      recordApproval: jest.fn(
        (_input: RecordCreativeApprovalInput): Promise<CreativeApprovalEventRecord> => {
          throw new Error('Not implemented');
        },
      ),
      findByJobId: jest.fn((jobId: string): Promise<readonly CreativeApprovalEventRecord[]> =>
        Promise.resolve(effectiveApprovals.filter((e) => e.creativeJobId === jobId)),
      ),
      findByAssetId: jest.fn((assetId: string): Promise<readonly CreativeApprovalEventRecord[]> =>
        Promise.resolve(effectiveApprovals.filter((e) => e.visualAssetId === assetId)),
      ),
    };

    const exportRepoMock: jest.Mocked<CreativeExportRepository> = {
      createExport: jest.fn((input: CreateCreativeExportInput): Promise<CreativeExportRecord> =>
        Promise.resolve({
          id: 'export-exp-1',
          creativeJobId: input.creativeJobId,
          visualAssetId: input.visualAssetId,
          format: input.format,
          encoding: input.encoding,
          width: input.width,
          height: input.height,
          aspectRatio: input.aspectRatio,
          byteSize: input.byteSize,
          sha256: input.sha256,
          storageKey: input.storageKey,
          quality: input.quality,
          validationStatus: input.validationStatus ?? 'PASSED',
          exportedByUserId: input.exportedByUserId,
          createdAt: new Date(),
        }),
      ),
      findById: jest.fn(() => Promise.resolve(null)),
      findByAssetAndFormat: jest.fn(() => Promise.resolve(null)),
      listByJobId: jest.fn(() => Promise.resolve([])),
      listByVisualAssetId: jest.fn(() => Promise.resolve([])),
    };

    const effectiveExportRepo = options?.exportRepo ?? exportRepoMock;

    const useCase = new ExportPosterUseCase(
      jobRepo,
      assetRepo,
      storage,
      snapshotRepo,
      contentRepo,
      approvalRepo,
      logger,
      posterCompositor,
      undefined,
      effectiveExportRepo,
      options?.hardGatesEngine,
    );

    return {
      useCase,
      renderPosterMock,
      assetFindByIdMock,
      assetFindLatestMock,
      approvalRepo,
      storageSaveMock,
      storageGetBufferMock,
      exportRepoMock,
    };
  }

  it('rejects unsupported export format', async () => {
    const { useCase } = setupMocks();

    await expect(
      useCase.execute({
        creativeJobId: 'job-exp-1',
        format: 'UNSUPPORTED_FORMAT' as unknown as 'SQUARE_1080',
        encoding: 'PNG',
        actorUserId: 'user-approver-1',
        actorRoles: [RoleCode.MARKETING_APPROVER],
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects when creative job is not found', async () => {
    const { useCase } = setupMocks();

    await expect(
      useCase.execute({
        creativeJobId: 'job-missing',
        format: 'SQUARE_1080',
        encoding: 'PNG',
        actorUserId: 'user-approver-1',
        actorRoles: [RoleCode.MARKETING_APPROVER],
      }),
    ).rejects.toThrow(CreativeJobNotFoundError);
  });

  it('rejects when visual asset is not found', async () => {
    const { useCase, assetFindByIdMock, assetFindLatestMock } = setupMocks();
    assetFindByIdMock.mockReturnValue(Promise.resolve(null));
    assetFindLatestMock.mockReturnValue(Promise.resolve(null));

    await expect(
      useCase.execute({
        creativeJobId: 'job-exp-1',
        visualAssetId: 'asset-missing',
        format: 'SQUARE_1080',
        encoding: 'PNG',
        actorUserId: 'user-approver-1',
        actorRoles: [RoleCode.MARKETING_APPROVER],
      }),
    ).rejects.toThrow(VisualAssetNotFoundError);
  });

  it('exports SQUARE_1080 (1080x1080) in PNG without bitmap stretching', async () => {
    const { useCase, renderPosterMock } = setupMocks();

    const result = await useCase.execute({
      creativeJobId: 'job-exp-1',
      format: 'SQUARE_1080',
      encoding: 'PNG',
      actorUserId: 'user-approver-1',
      actorRoles: [RoleCode.MARKETING_APPROVER],
    });

    expect(result.mimeType).toBe('image/png');
    expect(result.width).toBe(1080);
    expect(result.height).toBe(1080);
    expect(result.filename).toBe('poster-GPR-PARIS-100-1080x1080.png');
    expect(result.byteSize).toBeGreaterThan(0);
    expect(result.sha256).toBe(createHash('sha256').update(result.buffer).digest('hex'));

    // Check Sharp metadata of resulting buffer
    const meta = await sharp(result.buffer).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1080);

    // Verify compositor was instructed with 1:1 aspect ratio
    expect(renderPosterMock).toHaveBeenCalledWith(
      expect.objectContaining({
        posterSpec: expect.objectContaining({
          outputFormat: expect.objectContaining({
            aspectRatio: '1:1',
            width: 1080,
            height: 1080,
          }),
        }),
      }),
    );
  });

  it('exports PORTRAIT_1080_1350 (1080x1350) in JPEG with 4:5 aspect ratio', async () => {
    const { useCase, renderPosterMock } = setupMocks();

    const result = await useCase.execute({
      creativeJobId: 'job-exp-1',
      format: 'PORTRAIT_1080_1350',
      encoding: 'JPEG',
      quality: 95,
      actorUserId: 'user-approver-1',
      actorRoles: [RoleCode.MARKETING_APPROVER],
    });

    expect(result.mimeType).toBe('image/jpeg');
    expect(result.width).toBe(1080);
    expect(result.height).toBe(1350);
    expect(result.filename).toBe('poster-GPR-PARIS-100-1080x1350.jpg');

    const meta = await sharp(result.buffer).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1350);

    // Verify compositor received 4:5 ratio
    expect(renderPosterMock).toHaveBeenCalledWith(
      expect.objectContaining({
        posterSpec: expect.objectContaining({
          outputFormat: expect.objectContaining({
            aspectRatio: '4:5',
            width: 1080,
            height: 1350,
          }),
        }),
      }),
    );
  });

  it('exports STORY_1080_1920 (1080x1920) in PNG with CENTERED_HERO template', async () => {
    const { useCase, renderPosterMock } = setupMocks();

    const result = await useCase.execute({
      creativeJobId: 'job-exp-1',
      format: 'STORY_1080_1920',
      encoding: 'PNG',
      actorUserId: 'user-approver-1',
      actorRoles: [RoleCode.MARKETING_APPROVER],
    });

    expect(result.mimeType).toBe('image/png');
    expect(result.width).toBe(1080);
    expect(result.height).toBe(1920);
    expect(result.filename).toBe('poster-GPR-PARIS-100-1080x1920.png');

    const meta = await sharp(result.buffer).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1920);

    // Stories use CENTERED_HERO template
    expect(renderPosterMock).toHaveBeenCalledWith(
      expect.objectContaining({
        posterSpec: expect.objectContaining({
          templateId: 'CENTERED_HERO',
          outputFormat: expect.objectContaining({
            aspectRatio: '9:16',
            width: 1080,
            height: 1920,
          }),
        }),
      }),
    );
  });

  describe('Authorization and Validation Guardrails', () => {
    it('throws ForbiddenError when actorRoles does not include EXPORT_CREATIVE', async () => {
      const { useCase } = setupMocks();

      // Empty roles array
      await expect(
        useCase.execute({
          creativeJobId: 'job-exp-1',
          format: 'SQUARE_1080',
          encoding: 'PNG',
          actorUserId: 'user-viewer',
          actorRoles: [],
        }),
      ).rejects.toThrow(ForbiddenError);

      // VIEWER role
      await expect(
        useCase.execute({
          creativeJobId: 'job-exp-1',
          format: 'SQUARE_1080',
          encoding: 'PNG',
          actorUserId: 'user-viewer',
          actorRoles: [RoleCode.VIEWER],
        }),
      ).rejects.toThrow(ForbiddenError);

      // MARKETING_EDITOR role
      await expect(
        useCase.execute({
          creativeJobId: 'job-exp-1',
          format: 'SQUARE_1080',
          encoding: 'PNG',
          actorUserId: 'user-editor',
          actorRoles: [RoleCode.MARKETING_EDITOR],
        }),
      ).rejects.toThrow(ForbiddenError);

      // Legacy STAFF string
      await expect(
        useCase.execute({
          creativeJobId: 'job-exp-1',
          format: 'SQUARE_1080',
          encoding: 'PNG',
          actorUserId: 'user-staff',
          actorRoles: ['STAFF'],
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('allows export when actorRoles includes EXPORT_CREATIVE (MARKETING_APPROVER and ADMIN)', async () => {
      const { useCase } = setupMocks();

      const approverResult = await useCase.execute({
        creativeJobId: 'job-exp-1',
        format: 'SQUARE_1080',
        encoding: 'PNG',
        actorUserId: 'user-approver',
        actorRoles: [RoleCode.MARKETING_APPROVER],
      });
      expect(approverResult.mimeType).toBe('image/png');

      const adminResult = await useCase.execute({
        creativeJobId: 'job-exp-1',
        format: 'SQUARE_1080',
        encoding: 'JPEG',
        actorUserId: 'user-admin',
        actorRoles: [RoleCode.ADMIN],
      });
      expect(adminResult.mimeType).toBe('image/jpeg');
    });

    it('throws ValidationError when job is not in CREATIVE_APPROVED status', async () => {
      const { useCase } = setupMocks({ jobStatus: 'READY_FOR_REVIEW' });

      await expect(
        useCase.execute({
          creativeJobId: 'job-exp-1',
          format: 'SQUARE_1080',
          encoding: 'PNG',
          actorUserId: 'user-approver-1',
          actorRoles: [RoleCode.MARKETING_APPROVER],
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('throws VisualAssetNotFoundError when visualAsset does not belong to the job', async () => {
      const { useCase } = setupMocks({
        assetOverrides: { creativeJobId: 'different-job-id' },
      });

      await expect(
        useCase.execute({
          creativeJobId: 'job-exp-1',
          format: 'SQUARE_1080',
          encoding: 'PNG',
          actorUserId: 'user-approver-1',
          actorRoles: [RoleCode.MARKETING_APPROVER],
        }),
      ).rejects.toThrow(VisualAssetNotFoundError);
    });

    it('rejects export when visual asset has no approval event in approval repository', async () => {
      const { useCase, renderPosterMock, storageSaveMock, storageGetBufferMock } = setupMocks({
        approvalEvents: [],
      });

      await expect(
        useCase.execute({
          creativeJobId: 'job-exp-1',
          visualAssetId: 'asset-exp-1',
          format: 'SQUARE_1080',
          encoding: 'PNG',
          actorUserId: 'user-approver-1',
          actorRoles: [RoleCode.MARKETING_APPROVER],
        }),
      ).rejects.toThrow(ValidationError);

      expect(renderPosterMock).not.toHaveBeenCalled();
      expect(storageSaveMock).not.toHaveBeenCalled();
      expect(storageGetBufferMock).not.toHaveBeenCalled();
    });

    it('rejects export when visual asset approval event has decision CREATIVE_REJECTED', async () => {
      const { useCase, renderPosterMock, storageSaveMock, storageGetBufferMock } = setupMocks({
        approvalEvents: [
          {
            id: 'app-evt-rej',
            creativeJobId: 'job-exp-1',
            visualAssetId: 'asset-exp-1',
            approverUserId: 'user-approver-1',
            decision: 'CREATIVE_REJECTED',
            createdAt: new Date(),
          },
        ],
      });

      await expect(
        useCase.execute({
          creativeJobId: 'job-exp-1',
          visualAssetId: 'asset-exp-1',
          format: 'SQUARE_1080',
          encoding: 'PNG',
          actorUserId: 'user-approver-1',
          actorRoles: [RoleCode.MARKETING_APPROVER],
        }),
      ).rejects.toThrow(ValidationError);

      expect(renderPosterMock).not.toHaveBeenCalled();
      expect(storageSaveMock).not.toHaveBeenCalled();
      expect(storageGetBufferMock).not.toHaveBeenCalled();
    });

    it('rejects export of a revised unapproved asset even if earlier asset was approved', async () => {
      const unapprovedAsset: VisualAssetRecord = {
        ...mockAsset,
        id: 'asset-exp-revised-2',
        versionNumber: 2,
      };

      const {
        useCase,
        assetFindByIdMock,
        renderPosterMock,
        storageSaveMock,
        storageGetBufferMock,
      } = setupMocks({
        approvalEvents: [
          {
            id: 'app-evt-approved-1',
            creativeJobId: 'job-exp-1',
            visualAssetId: 'asset-exp-1',
            approverUserId: 'user-approver-1',
            decision: 'CREATIVE_APPROVED',
            createdAt: new Date(),
          },
        ],
      });

      assetFindByIdMock.mockImplementation((id: string) => {
        if (id === 'asset-exp-revised-2') return Promise.resolve(unapprovedAsset);
        if (id === 'asset-exp-1') return Promise.resolve(mockAsset);
        return Promise.resolve(null);
      });

      // Exporting unapproved asset-exp-revised-2 must fail
      await expect(
        useCase.execute({
          creativeJobId: 'job-exp-1',
          visualAssetId: 'asset-exp-revised-2',
          format: 'SQUARE_1080',
          encoding: 'PNG',
          actorUserId: 'user-approver-1',
          actorRoles: [RoleCode.MARKETING_APPROVER],
        }),
      ).rejects.toThrow(ValidationError);

      expect(renderPosterMock).not.toHaveBeenCalled();
      expect(storageSaveMock).not.toHaveBeenCalled();
      expect(storageGetBufferMock).not.toHaveBeenCalled();

      // Exporting approved asset-exp-1 must succeed
      const result = await useCase.execute({
        creativeJobId: 'job-exp-1',
        visualAssetId: 'asset-exp-1',
        format: 'SQUARE_1080',
        encoding: 'PNG',
        actorUserId: 'user-approver-1',
        actorRoles: [RoleCode.MARKETING_APPROVER],
      });
      expect(result.mimeType).toBe('image/png');
      expect(renderPosterMock).toHaveBeenCalledTimes(1);
    });

    it('rejects export when approval event belongs to a different creative job', async () => {
      const { useCase, renderPosterMock, storageSaveMock, storageGetBufferMock } = setupMocks({
        approvalEvents: [
          {
            id: 'app-evt-diff-job',
            creativeJobId: 'job-different',
            visualAssetId: 'asset-exp-1',
            approverUserId: 'user-approver-1',
            decision: 'CREATIVE_APPROVED',
            createdAt: new Date(),
          },
        ],
      });

      await expect(
        useCase.execute({
          creativeJobId: 'job-exp-1',
          visualAssetId: 'asset-exp-1',
          format: 'SQUARE_1080',
          encoding: 'PNG',
          actorUserId: 'user-approver-1',
          actorRoles: [RoleCode.MARKETING_APPROVER],
        }),
      ).rejects.toThrow(ValidationError);

      expect(renderPosterMock).not.toHaveBeenCalled();
      expect(storageSaveMock).not.toHaveBeenCalled();
      expect(storageGetBufferMock).not.toHaveBeenCalled();
    });

    it('successfully exports approved asset when visualAssetId is omitted', async () => {
      const { useCase, renderPosterMock } = setupMocks({
        approvalEvents: [
          {
            id: 'app-evt-1',
            creativeJobId: 'job-exp-1',
            visualAssetId: 'asset-exp-1',
            approverUserId: 'user-approver-1',
            decision: 'CREATIVE_APPROVED',
            createdAt: new Date(),
          },
        ],
      });

      const result = await useCase.execute({
        creativeJobId: 'job-exp-1',
        format: 'SQUARE_1080',
        encoding: 'PNG',
        actorUserId: 'user-approver-1',
        actorRoles: [RoleCode.MARKETING_APPROVER],
      });

      expect(result.mimeType).toBe('image/png');
      expect(result.width).toBe(1080);
      expect(renderPosterMock).toHaveBeenCalledTimes(1);
    });

    it('rejects export when visualAssetId is omitted and no approved asset exists for the job', async () => {
      const { useCase, renderPosterMock, storageSaveMock, storageGetBufferMock } = setupMocks({
        approvalEvents: [],
      });

      await expect(
        useCase.execute({
          creativeJobId: 'job-exp-1',
          format: 'SQUARE_1080',
          encoding: 'PNG',
          actorUserId: 'user-approver-1',
          actorRoles: [RoleCode.MARKETING_APPROVER],
        }),
      ).rejects.toThrow(ValidationError);

      expect(renderPosterMock).not.toHaveBeenCalled();
      expect(storageSaveMock).not.toHaveBeenCalled();
      expect(storageGetBufferMock).not.toHaveBeenCalled();
    });

    it('successfully exports when duplicate approval events exist for the same asset', async () => {
      const { useCase, renderPosterMock } = setupMocks({
        approvalEvents: [
          {
            id: 'app-evt-1',
            creativeJobId: 'job-exp-1',
            visualAssetId: 'asset-exp-1',
            approverUserId: 'user-approver-1',
            decision: 'CREATIVE_APPROVED',
            createdAt: new Date('2026-01-01'),
          },
          {
            id: 'app-evt-2',
            creativeJobId: 'job-exp-1',
            visualAssetId: 'asset-exp-1',
            approverUserId: 'user-approver-2',
            decision: 'CREATIVE_APPROVED',
            createdAt: new Date('2026-01-02'),
          },
        ],
      });

      const result = await useCase.execute({
        creativeJobId: 'job-exp-1',
        format: 'SQUARE_1080',
        encoding: 'PNG',
        actorUserId: 'user-approver-1',
        actorRoles: [RoleCode.MARKETING_APPROVER],
      });

      expect(result.mimeType).toBe('image/png');
      expect(result.width).toBe(1080);
      expect(renderPosterMock).toHaveBeenCalledTimes(1);
    });

    it('rejects export as ambiguous when visualAssetId is omitted and two distinct approved assets exist', async () => {
      const { useCase, renderPosterMock, storageSaveMock, storageGetBufferMock } = setupMocks({
        approvalEvents: [
          {
            id: 'app-evt-1',
            creativeJobId: 'job-exp-1',
            visualAssetId: 'asset-exp-1',
            approverUserId: 'user-approver-1',
            decision: 'CREATIVE_APPROVED',
            createdAt: new Date('2026-01-01'),
          },
          {
            id: 'app-evt-2',
            creativeJobId: 'job-exp-1',
            visualAssetId: 'asset-exp-2',
            approverUserId: 'user-approver-2',
            decision: 'CREATIVE_APPROVED',
            createdAt: new Date('2026-01-02'),
          },
        ],
      });

      await expect(
        useCase.execute({
          creativeJobId: 'job-exp-1',
          format: 'SQUARE_1080',
          encoding: 'PNG',
          actorUserId: 'user-approver-1',
          actorRoles: [RoleCode.MARKETING_APPROVER],
        }),
      ).rejects.toThrow(ValidationError);

      expect(renderPosterMock).not.toHaveBeenCalled();
      expect(storageSaveMock).not.toHaveBeenCalled();
      expect(storageGetBufferMock).not.toHaveBeenCalled();
    });

    it('never selects a newer unapproved asset when visualAssetId is omitted', async () => {
      const unapprovedNewerAsset: VisualAssetRecord = {
        ...mockAsset,
        id: 'asset-exp-newer-unapproved',
        versionNumber: 99,
      };

      const { useCase, assetFindLatestMock, assetFindByIdMock, renderPosterMock } = setupMocks({
        approvalEvents: [
          {
            id: 'app-evt-1',
            creativeJobId: 'job-exp-1',
            visualAssetId: 'asset-exp-1',
            approverUserId: 'user-approver-1',
            decision: 'CREATIVE_APPROVED',
            createdAt: new Date(),
          },
        ],
      });

      assetFindLatestMock.mockResolvedValue(unapprovedNewerAsset);

      const result = await useCase.execute({
        creativeJobId: 'job-exp-1',
        format: 'SQUARE_1080',
        encoding: 'PNG',
        actorUserId: 'user-approver-1',
        actorRoles: [RoleCode.MARKETING_APPROVER],
      });

      expect(result.mimeType).toBe('image/png');
      expect(assetFindLatestMock).not.toHaveBeenCalled();
      expect(assetFindByIdMock).toHaveBeenCalledWith('asset-exp-1');
      expect(assetFindByIdMock).not.toHaveBeenCalledWith('asset-exp-newer-unapproved');
      expect(renderPosterMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('Multi-Format Export Ledger & Hard Gate Verification (W32-C)', () => {
    it('persists export ledger record with dimensions, sha256, and storage key', async () => {
      const { useCase, exportRepoMock, storageSaveMock } = setupMocks();

      const result = await useCase.execute({
        creativeJobId: 'job-exp-1',
        visualAssetId: 'asset-exp-1',
        format: 'PORTRAIT_1080_1350',
        encoding: 'JPEG',
        quality: 95,
        actorUserId: 'user-approver-1',
        actorRoles: [RoleCode.MARKETING_APPROVER],
      });

      expect(result.exportId).toBe('export-exp-1');
      expect(result.storageKey).toMatch(/^cas\//);
      expect(result.validationStatus).toBe('PASSED');
      expect(result.width).toBe(1080);
      expect(result.height).toBe(1350);
      expect(result.mimeType).toBe('image/jpeg');

      expect(exportRepoMock.createExport).toHaveBeenCalledWith({
        creativeJobId: 'job-exp-1',
        visualAssetId: 'asset-exp-1',
        format: 'PORTRAIT_1080_1350',
        encoding: 'JPEG',
        width: 1080,
        height: 1350,
        aspectRatio: '4:5',
        byteSize: result.byteSize,
        sha256: result.sha256,
        storageKey: result.storageKey!,
        quality: 95,
        validationStatus: 'PASSED',
        exportedByUserId: 'user-approver-1',
      });

      expect(storageSaveMock).toHaveBeenCalledWith(
        expect.objectContaining({
          assetRole: 'COMPOSITED_CREATIVE',
          mimeType: 'image/jpeg',
          width: 1080,
          height: 1350,
        }),
      );
    });

    it('idempotently reuses existing export from ledger and CAS without re-compositing', async () => {
      const { useCase, exportRepoMock, storageGetBufferMock, renderPosterMock } = setupMocks();

      const cachedBuffer = Buffer.from('cached-poster-binary-bytes');
      const cachedSha = createHash('sha256').update(cachedBuffer).digest('hex');

      const existingRecord: CreativeExportRecord = {
        id: 'export-cached-1',
        creativeJobId: 'job-exp-1',
        visualAssetId: 'asset-exp-1',
        format: 'SQUARE_1080',
        encoding: 'PNG',
        width: 1080,
        height: 1080,
        aspectRatio: '1:1',
        byteSize: cachedBuffer.length,
        sha256: cachedSha,
        storageKey: 'cas/ca/ch/cached-key.png',
        quality: undefined,
        validationStatus: 'PASSED',
        exportedByUserId: 'user-prev',
        createdAt: new Date('2026-10-29T00:00:00.000Z'),
      };

      exportRepoMock.findByAssetAndFormat.mockResolvedValue(existingRecord);
      storageGetBufferMock.mockImplementation((key) =>
        key === 'cas/ca/ch/cached-key.png'
          ? Promise.resolve(cachedBuffer)
          : Promise.resolve(mockBgBuffer),
      );

      const result = await useCase.execute({
        creativeJobId: 'job-exp-1',
        visualAssetId: 'asset-exp-1',
        format: 'SQUARE_1080',
        encoding: 'PNG',
        actorUserId: 'user-approver-1',
        actorRoles: [RoleCode.MARKETING_APPROVER],
      });

      expect(renderPosterMock).not.toHaveBeenCalled();
      expect(result.exportId).toBe('export-cached-1');
      expect(result.storageKey).toBe('cas/ca/ch/cached-key.png');
      expect(result.buffer.toString()).toBe('cached-poster-binary-bytes');
      expect(result.sha256).toBe(cachedSha);
      expect(result.validationStatus).toBe('PASSED');
    });

    it('rejects export with ValidationError when post-adaptation hard visual gates fail (CTA-Hero collision)', async () => {
      const gatesEngine = new HardVisualGatesEngine();
      const { useCase, renderPosterMock, exportRepoMock } = setupMocks({
        hardGatesEngine: gatesEngine,
      });

      renderPosterMock.mockImplementation(
        async (input: RenderPosterInput): Promise<RenderPosterResult> => {
          const width = input.posterSpec.outputFormat.width;
          const height = input.posterSpec.outputFormat.height;
          const buf = await createDummyRenderedBuffer(width, height);
          const digest = createHash('sha256').update(buf).digest('hex');
          return {
            posterBuffer: buf,
            mimeType: 'image/png',
            sha256: digest,
            width,
            height,
            byteSize: buf.length,
            latencyMs: 15,
            compositorVersion: 'v2',
            layoutManifest: {
              version: '1.0',
              templateId: input.posterSpec.templateId,
              dimensions: { width, height },
              safeMargins: { top: 40, bottom: 40, left: 40, right: 40 },
              elements: [
                {
                  id: 'hero',
                  type: 'PRODUCT',
                  boundingBox: { x: 300, y: 300, width: 400, height: 400 },
                },
                {
                  id: 'cta_button',
                  type: 'BUTTON',
                  boundingBox: { x: 350, y: 350, width: 200, height: 80 },
                },
              ],
            },
            productDigest: mockProductSha,
            backgroundDigest: mockBgSha,
            outputDigest: digest,
          };
        },
      );

      await expect(
        useCase.execute({
          creativeJobId: 'job-exp-1',
          visualAssetId: 'asset-exp-1',
          format: 'SQUARE_1080',
          encoding: 'PNG',
          actorUserId: 'user-approver-1',
          actorRoles: [RoleCode.MARKETING_APPROVER],
        }),
      ).rejects.toThrow(HardGateCode.GATE_CTA_HERO_COLLISION);

      expect(exportRepoMock.createExport).not.toHaveBeenCalled();
    });

    it('rejects export with ValidationError when typography penetrates safe margins', async () => {
      const gatesEngine = new HardVisualGatesEngine();
      const { useCase, renderPosterMock, exportRepoMock } = setupMocks({
        hardGatesEngine: gatesEngine,
      });

      renderPosterMock.mockImplementation(
        async (input: RenderPosterInput): Promise<RenderPosterResult> => {
          const width = input.posterSpec.outputFormat.width;
          const height = input.posterSpec.outputFormat.height;
          const buf = await createDummyRenderedBuffer(width, height);
          const digest = createHash('sha256').update(buf).digest('hex');
          return {
            posterBuffer: buf,
            mimeType: 'image/png',
            sha256: digest,
            width,
            height,
            byteSize: buf.length,
            latencyMs: 15,
            compositorVersion: 'v2',
            layoutManifest: {
              version: '1.0',
              templateId: input.posterSpec.templateId,
              dimensions: { width, height },
              safeMargins: { top: 40, bottom: 40, left: 40, right: 40 },
              elements: [
                {
                  id: 'headline',
                  type: 'TEXT',
                  text: 'Offscreen Penetrating Headline',
                  boundingBox: { x: 5, y: 5, width: 600, height: 60 },
                },
              ],
            },
            productDigest: mockProductSha,
            backgroundDigest: mockBgSha,
            outputDigest: digest,
          };
        },
      );

      await expect(
        useCase.execute({
          creativeJobId: 'job-exp-1',
          visualAssetId: 'asset-exp-1',
          format: 'SQUARE_1080',
          encoding: 'PNG',
          actorUserId: 'user-approver-1',
          actorRoles: [RoleCode.MARKETING_APPROVER],
        }),
      ).rejects.toThrow(HardGateCode.GATE_SAFE_MARGIN_VIOLATION);

      expect(exportRepoMock.createExport).not.toHaveBeenCalled();
    });

    it('exports cleanly when layout satisfies all constraints with hard visual gates active', async () => {
      const gatesEngine = new HardVisualGatesEngine();
      const { useCase, renderPosterMock, exportRepoMock } = setupMocks({
        hardGatesEngine: gatesEngine,
      });

      renderPosterMock.mockImplementation(
        async (input: RenderPosterInput): Promise<RenderPosterResult> => {
          const width = input.posterSpec.outputFormat.width;
          const height = input.posterSpec.outputFormat.height;
          const buf = await createDummyRenderedBuffer(width, height);
          const digest = createHash('sha256').update(buf).digest('hex');
          return {
            posterBuffer: buf,
            mimeType: 'image/png',
            sha256: digest,
            width,
            height,
            byteSize: buf.length,
            latencyMs: 15,
            compositorVersion: 'v2',
            layoutManifest: {
              version: '1.0',
              templateId: input.posterSpec.templateId,
              dimensions: { width, height },
              safeMargins: { top: 40, bottom: 40, left: 40, right: 40 },
              elements: [
                {
                  id: 'headline',
                  type: 'TEXT',
                  text: 'The Parisian Secret',
                  boundingBox: { x: 100, y: 100, width: 880, height: 60 },
                },
                {
                  id: 'hero',
                  type: 'PRODUCT',
                  boundingBox: { x: 240, y: 180, width: 600, height: 650 },
                },
                {
                  id: 'cta',
                  type: 'BUTTON',
                  boundingBox: { x: 390, y: 880, width: 300, height: 60 },
                },
              ],
            },
            productDigest: mockProductSha,
            backgroundDigest: mockBgSha,
            outputDigest: digest,
          };
        },
      );

      const result = await useCase.execute({
        creativeJobId: 'job-exp-1',
        visualAssetId: 'asset-exp-1',
        format: 'SQUARE_1080',
        encoding: 'PNG',
        actorUserId: 'user-approver-1',
        actorRoles: [RoleCode.MARKETING_APPROVER],
      });

      expect(result.validationStatus).toBe('PASSED');
      expect(result.exportId).toBe('export-exp-1');
      expect(exportRepoMock.createExport).toHaveBeenCalledTimes(1);
    });

    it('emits CREATIVE_EXPORTED event to outboxWriter upon successful export persistence', async () => {
      const { useCase, exportRepoMock } = setupMocks();
      const appendMock = jest.fn((_event: unknown) => Promise.resolve('outbox-event-1'));
      const mockOutboxWriter = { append: appendMock };

      const result = await useCase.execute({
        creativeJobId: 'job-exp-1',
        visualAssetId: 'asset-exp-1',
        format: 'PORTRAIT_1080_1350',
        encoding: 'JPEG',
        quality: 90,
        actorUserId: 'user-approver-1',
        actorRoles: [RoleCode.MARKETING_APPROVER],
        outboxWriter: mockOutboxWriter,
      });

      expect(result.exportId).toBe('export-exp-1');
      expect(exportRepoMock.createExport).toHaveBeenCalledTimes(1);
      expect(appendMock).toHaveBeenCalledTimes(1);
      expect(appendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: 'CREATIVE_EXPORTED',
          aggregateType: 'CreativeExport',
          aggregateId: 'export-exp-1',
          payload: expect.objectContaining({
            exportId: 'export-exp-1',
            creativeJobId: 'job-exp-1',
            visualAssetId: 'asset-exp-1',
            format: 'PORTRAIT_1080_1350',
            encoding: 'JPEG',
            width: 1080,
            height: 1350,
            aspectRatio: '4:5',
            validationStatus: 'PASSED',
            exportedByUserId: 'user-approver-1',
          }),
        }),
      );
    });
  });
});
