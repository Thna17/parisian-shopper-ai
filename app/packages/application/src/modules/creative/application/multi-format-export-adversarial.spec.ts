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
import { HardGateCode, type HardGateOutcome } from '../domain/services/hard-visual-gates.port.js';
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
  type CompleteGenerationInput,
  type ContentGenerationRepository,
  type ContentVersion,
  type CreateContentJobInput,
  type CreateDirectVersionInput,
  type FailGenerationInput,
} from '../../content/application/content-generation.repository.js';
import { generateTransparentProductPng_TEST_ONLY } from '../infrastructure/fixtures/fake-product-fixtures.js';
import { generateDeterministicBackgroundPng } from '../infrastructure/fixtures/fake-background-fixtures.js';
import {
  type CreativeApprovalRepository,
  type CreativeApprovalEventRecord,
  type RecordCreativeApprovalInput,
} from './creative-approval.repository.js';
import { VisualAssetNotFoundError } from '../domain/creative-errors.js';
import { type CreativeJobStatus } from '../domain/creative.js';
import { ExportDownloadTokenService } from './export-download-token.service.js';

describe('W32-E Multi-Format Export Adversarial Integration Suite & Invalidation Boundary Verification', () => {
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

  const baseJob: CreativeJobRecord = {
    id: 'job-adv-w32-1',
    contentVersionId: 'ver-adv-w32-1',
    productSnapshotId: 'snap-adv-w32-1',
    brandRuleVersionId: 'rule-adv-w32-1',
    status: 'CREATIVE_APPROVED',
    targetPlatform: 'GENERIC',
    aspectRatio: '1:1',
    creativeProfile: 'PARISIAN_MORNING_ATELIER',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const baseAsset: VisualAssetRecord = {
    id: 'asset-adv-w32-1',
    creativeJobId: 'job-adv-w32-1',
    versionNumber: 1,
    assetRole: 'COMPOSITED_CREATIVE',
    mimeType: 'image/png',
    width: 1080,
    height: 1080,
    byteSize: 10000,
    sha256: 'poster-adv-w32-sha',
    storageKey: 'cas/poster-adv-w32-1.png',
    sourceProductAssetDigest: mockProductSha,
    backgroundAssetDigest: mockBgSha,
    createdAt: new Date(),
  };

  const baseSnapshot: ProductSnapshot = {
    id: 'snap-adv-w32-1',
    snapshotHash: 'snap-adv-hash',
    normalizerVersion: 'phase-1b-v1',
    createdAt: new Date(),
    product: {
      schema_version: '1.0',
      source_system: 'ERP',
      retrieved_at: new Date().toISOString(),
      source_updated_at: new Date().toISOString(),
      lifecycle_status: 'active',
      product: {
        sku: 'GPR-PARIS-ADV',
        product_name: 'L’Essence Parisienne Adversarial',
        brand: 'Geparlys',
        category: 'Fragrance',
        price: '120.0000',
        currency: 'USD',
        stock_status: 'in_stock',
        size: { value: '100', unit: 'ml', display: '100 ml' },
        images: [
          {
            url: 'https://cdn.example.com/paris-adv.png',
            role: 'primary',
            position: 1,
            sha256: mockProductSha,
          },
        ],
      },
    },
  };

  const baseContentVersion: ContentVersion = {
    id: 'ver-adv-w32-1',
    contentJobId: 'job-adv-c1',
    versionNumber: 1,
    brandRuleVersionId: 'rule-adv-w32-1',
    productSnapshotId: 'snap-adv-w32-1',
    generationAttemptId: 'att-adv-1',
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
      facts_used: ['Geparlys', '$120.00'],
      warnings: [],
      missing_information: [],
    },
    createdAt: new Date(),
  };

  interface HarnessOptions {
    readonly jobStatus?: CreativeJobStatus;
    readonly assetOverrides?: Partial<VisualAssetRecord>;
    readonly approvalEvents?: readonly CreativeApprovalEventRecord[];
    readonly existingExportRecord?: CreativeExportRecord | null;
    readonly casBufferSupplier?: (key: string) => Promise<Buffer | null>;
    readonly hardGatesEngine?: HardVisualGatesEngine;
  }

  interface AdversarialHarnessResult {
    readonly useCase: ExportPosterUseCase;
    readonly job: CreativeJobRecord;
    readonly asset: VisualAssetRecord;
    readonly jobRepo: CreativeJobRepository;
    readonly assetRepo: VisualAssetRepository;
    readonly snapshotRepo: ProductSnapshotRepository;
    readonly contentRepo: ContentGenerationRepository;
    readonly approvalRepo: CreativeApprovalRepository;
    readonly storage: AssetStoragePort;
    readonly storageSaveMock: jest.Mock<(input: SaveAssetInput) => Promise<StoredAssetMetadata>>;
    readonly storageGetBufferMock: jest.Mock<(key: string) => Promise<Buffer | null>>;
    readonly exportRepo: jest.Mocked<CreativeExportRepository>;
    readonly renderPosterMock: jest.Mock<(input: RenderPosterInput) => Promise<RenderPosterResult>>;
    readonly logger: ApplicationLogger;
  }

  function setupAdversarialHarness(options?: HarnessOptions): AdversarialHarnessResult {
    const job: CreativeJobRecord = options?.jobStatus
      ? { ...baseJob, status: options.jobStatus }
      : baseJob;
    const asset: VisualAssetRecord = options?.assetOverrides
      ? { ...baseAsset, ...options.assetOverrides }
      : baseAsset;

    const jobRepo: CreativeJobRepository = {
      createJob: jest.fn((_input: CreateCreativeJobInput) => {
        throw new Error('Not implemented');
      }),
      findById: jest.fn((id: string) => Promise.resolve(id === job.id ? job : null)),
      findByContentVersionId: jest.fn((_id: string) => Promise.resolve([job])),
      transitionStatus: jest.fn(() => {
        throw new Error('Not implemented');
      }),
    };

    const assetRepo: VisualAssetRepository = {
      createAsset: jest.fn((_input: CreateVisualAssetInput) => {
        throw new Error('Not implemented');
      }),
      findById: jest.fn((id: string) => Promise.resolve(id === asset.id ? asset : null)),
      findByJobAndVersion: jest.fn(() => Promise.resolve(null)),
      findLatestByJobId: jest.fn(() => Promise.resolve(asset)),
      listByJobId: jest.fn(() => Promise.resolve([asset])),
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
      if (options?.casBufferSupplier) {
        return options.casBufferSupplier(key);
      }
      if (key.includes(mockProductSha)) return Promise.resolve(mockProductBuffer);
      if (key.includes(mockBgSha)) return Promise.resolve(mockBgBuffer);
      return Promise.resolve(mockBgBuffer);
    });

    const storage: AssetStoragePort = {
      saveAsset: storageSaveMock,
      getMetadata: jest.fn((_key: string) => Promise.resolve(null)),
      getAssetBuffer: storageGetBufferMock,
      assetExists: jest.fn((_key: string) => Promise.resolve(true)),
    };

    const snapshotRepo: ProductSnapshotRepository = {
      create: jest.fn((_input: CreateProductSnapshotRecord) => Promise.resolve(baseSnapshot)),
      findById: jest.fn((id: string) =>
        Promise.resolve(id === baseSnapshot.id ? baseSnapshot : null),
      ),
    };

    const contentRepo: ContentGenerationRepository = {
      createJob: jest.fn((_input: CreateContentJobInput) => {
        throw new Error('Not implemented');
      }),
      findJobById: jest.fn(() => Promise.resolve(null)),
      findAttemptsByJobId: jest.fn(() => Promise.resolve([])),
      findVersionById: jest.fn((id: string) =>
        Promise.resolve(id === baseContentVersion.id ? baseContentVersion : null),
      ),
      createDirectVersion: jest.fn((_input: CreateDirectVersionInput) =>
        Promise.resolve(baseContentVersion),
      ),
      beginGeneration: jest.fn((_input: BeginGenerationInput) => {
        throw new Error('Not implemented');
      }),
      completeGeneration: jest.fn((_input: CompleteGenerationInput) => {
        throw new Error('Not implemented');
      }),
      failGeneration: jest.fn((_input: FailGenerationInput) => Promise.resolve()),
      findVersionsByJobId: jest.fn(() => Promise.resolve([baseContentVersion])),
    };

    const defaultApprovalEvent: CreativeApprovalEventRecord = {
      id: 'app-adv-evt-1',
      creativeJobId: job.id,
      visualAssetId: asset.id,
      approverUserId: 'user-approver-w32',
      decision: 'CREATIVE_APPROVED',
      createdAt: new Date(),
    };
    const effectiveApprovals = options?.approvalEvents ?? [defaultApprovalEvent];

    const approvalRepo: CreativeApprovalRepository = {
      recordApproval: jest.fn((_input: RecordCreativeApprovalInput) => {
        throw new Error('Not implemented');
      }),
      findByJobId: jest.fn((jobId: string) =>
        Promise.resolve(effectiveApprovals.filter((e) => e.creativeJobId === jobId)),
      ),
      findByAssetId: jest.fn((assetId: string) =>
        Promise.resolve(effectiveApprovals.filter((e) => e.visualAssetId === assetId)),
      ),
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
          latencyMs: 12,
          compositorVersion: 'v2',
          layoutManifest: {
            version: '1.0',
            templateId: input.posterSpec.templateId,
            dimensions: { width, height },
            safeMargins: { top: 48, bottom: 48, left: 48, right: 48 },
            elements: [
              {
                id: 'hero-product',
                type: 'PRODUCT',
                boundingBox: { x: 200, y: 300, width: 400, height: 400 },
              },
              {
                id: 'cta-button',
                type: 'BUTTON',
                boundingBox: { x: 340, y: 800, width: 400, height: 80 },
              },
              {
                id: 'headline-text',
                type: 'TEXT',
                text: 'The Parisian Secret',
                boundingBox: { x: 100, y: 150, width: 880, height: 100 },
              },
            ],
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

    let storedExport: CreativeExportRecord | null = options?.existingExportRecord ?? null;

    const exportRepo: jest.Mocked<CreativeExportRepository> = {
      createExport: jest.fn((input: CreateCreativeExportInput): Promise<CreativeExportRecord> => {
        const record: CreativeExportRecord = {
          id: `exp-auto-${Date.now()}`,
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
        };
        storedExport = record;
        return Promise.resolve(record);
      }),
      findById: jest.fn((id: string) =>
        Promise.resolve(storedExport && storedExport.id === id ? storedExport : null),
      ),
      findByAssetAndFormat: jest.fn((assetId: string, format: string, encoding: string) => {
        if (
          storedExport &&
          storedExport.visualAssetId === assetId &&
          storedExport.format === format &&
          storedExport.encoding === encoding
        ) {
          return Promise.resolve(storedExport);
        }
        return Promise.resolve(null);
      }),
      listByJobId: jest.fn((jobId: string) =>
        Promise.resolve(storedExport && storedExport.creativeJobId === jobId ? [storedExport] : []),
      ),
      listByVisualAssetId: jest.fn((assetId: string) =>
        Promise.resolve(
          storedExport && storedExport.visualAssetId === assetId ? [storedExport] : [],
        ),
      ),
    };

    const logger: ApplicationLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

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
      exportRepo,
      options?.hardGatesEngine,
    );

    return {
      useCase,
      job,
      asset,
      jobRepo,
      assetRepo,
      snapshotRepo,
      contentRepo,
      approvalRepo,
      storage,
      storageSaveMock,
      storageGetBufferMock,
      exportRepo,
      renderPosterMock,
      logger,
    };
  }

  describe('1. Adversarial Lifecycle & Approval Invalidation Boundaries', () => {
    const unapprovedStatuses: readonly CreativeJobStatus[] = [
      'REQUESTED',
      'GENERATING_BACKGROUND',
      'COMPOSITING',
      'VALIDATING',
      'READY_FOR_REVIEW',
      'REVISION_REQUESTED',
      'CREATIVE_REJECTED',
      'FAILED',
    ];

    it.each(unapprovedStatuses)(
      'fail-closed containment: blocks export when creative job status is %s',
      async (status) => {
        const { useCase, job, storageSaveMock, exportRepo } = setupAdversarialHarness({
          jobStatus: status,
        });

        await expect(
          useCase.execute({
            creativeJobId: job.id,
            format: 'SQUARE_1080',
            encoding: 'PNG',
            actorUserId: 'user-adv-attacker',
            actorRoles: [RoleCode.MARKETING_APPROVER],
          }),
        ).rejects.toThrow(ValidationError);

        expect(storageSaveMock).not.toHaveBeenCalled();
        expect(exportRepo.createExport).not.toHaveBeenCalled();
      },
    );

    it('rejects export when creative job is CREATIVE_APPROVED but visual asset has NO approval record', async () => {
      const { useCase, job, asset, storageSaveMock, exportRepo } = setupAdversarialHarness({
        approvalEvents: [],
      });

      await expect(
        useCase.execute({
          creativeJobId: job.id,
          visualAssetId: asset.id,
          format: 'PORTRAIT_1080_1350',
          encoding: 'PNG',
          actorUserId: 'user-adv-attacker',
          actorRoles: [RoleCode.MARKETING_APPROVER],
        }),
      ).rejects.toThrow(/has not been approved for export/i);

      expect(storageSaveMock).not.toHaveBeenCalled();
      expect(exportRepo.createExport).not.toHaveBeenCalled();
    });

    it('rejects export when approval record decision is CREATIVE_REJECTED instead of CREATIVE_APPROVED', async () => {
      const { useCase, job, asset } = setupAdversarialHarness({
        approvalEvents: [
          {
            id: 'app-adv-rejected',
            creativeJobId: 'job-adv-w32-1',
            visualAssetId: 'asset-adv-w32-1',
            approverUserId: 'user-approver',
            decision: 'CREATIVE_REJECTED',
            createdAt: new Date(),
          },
        ],
      });

      await expect(
        useCase.execute({
          creativeJobId: job.id,
          visualAssetId: asset.id,
          format: 'STORY_1080_1920',
          encoding: 'PNG',
          actorUserId: 'user-adv-attacker',
          actorRoles: [RoleCode.MARKETING_APPROVER],
        }),
      ).rejects.toThrow(/has not been approved for export/i);
    });

    it('rejects export when visual asset belongs to a completely different creative job (cross-job injection attempt)', async () => {
      const harness = setupAdversarialHarness();

      const alienAsset: VisualAssetRecord = {
        ...baseAsset,
        id: 'asset-alien-999',
        creativeJobId: 'job-alien-foreign-888',
      };
      jest.spyOn(harness.assetRepo, 'findById').mockResolvedValue(alienAsset);

      await expect(
        harness.useCase.execute({
          creativeJobId: harness.job.id,
          visualAssetId: alienAsset.id,
          format: 'SQUARE_1080',
          encoding: 'PNG',
          actorUserId: 'user-adv-attacker',
          actorRoles: [RoleCode.MARKETING_APPROVER],
        }),
      ).rejects.toThrow(VisualAssetNotFoundError);
    });

    it('rejects export when job product snapshot is missing or corrupted', async () => {
      const harness = setupAdversarialHarness();
      jest.spyOn(harness.snapshotRepo, 'findById').mockResolvedValueOnce(null);

      await expect(
        harness.useCase.execute({
          creativeJobId: harness.job.id,
          format: 'SQUARE_1080',
          encoding: 'PNG',
          actorUserId: 'user-adv-attacker',
          actorRoles: [RoleCode.MARKETING_APPROVER],
        }),
      ).rejects.toThrow(/Product snapshot not found/i);
    });

    it('rejects export when job content version cannot be found', async () => {
      const harness = setupAdversarialHarness();
      jest.spyOn(harness.contentRepo, 'findVersionById').mockResolvedValueOnce(null);

      await expect(
        harness.useCase.execute({
          creativeJobId: harness.job.id,
          format: 'SQUARE_1080',
          encoding: 'PNG',
          actorUserId: 'user-adv-attacker',
          actorRoles: [RoleCode.MARKETING_APPROVER],
        }),
      ).rejects.toThrow(/Content version not found/i);
    });

    it('rejects export when multiple distinct approved assets exist and no visualAssetId is provided', async () => {
      const { useCase, job } = setupAdversarialHarness({
        approvalEvents: [
          {
            id: 'app-evt-1',
            creativeJobId: 'job-adv-w32-1',
            visualAssetId: 'asset-1',
            approverUserId: 'user-approver-1',
            decision: 'CREATIVE_APPROVED',
            createdAt: new Date(),
          },
          {
            id: 'app-evt-2',
            creativeJobId: 'job-adv-w32-1',
            visualAssetId: 'asset-2',
            approverUserId: 'user-approver-2',
            decision: 'CREATIVE_APPROVED',
            createdAt: new Date(),
          },
        ],
      });

      await expect(
        useCase.execute({
          creativeJobId: job.id,
          format: 'SQUARE_1080',
          encoding: 'PNG',
          actorUserId: 'user-adv-operator',
          actorRoles: [RoleCode.MARKETING_APPROVER],
        }),
      ).rejects.toThrow(/Multiple distinct approved visual assets found/i);
    });
  });

  describe('2. Post-Adaptation Hard Visual Gate Adversarial Breaches & Containment', () => {
    it('aborts export and prevents CAS/ledger persistence when adapted 9:16 layout causes Safe Margin violation', async () => {
      const mockGatesEngine = {
        evaluate: jest.fn((): Promise<HardGateOutcome> => {
          return Promise.resolve({
            isPassed: false,
            validatorVersion: '1.0',
            evaluatedAt: new Date().toISOString(),
            failures: [
              {
                code: HardGateCode.GATE_SAFE_MARGIN_VIOLATION,
                field: 'ctaBoundingBox',
                message:
                  'CTA Button inset violation: Y coordinate 1890px exceeds safe margin boundary 1872px on 1080x1920 canvas.',
                remediationAction: 'ADJUST_PADDING',
              },
            ],
            metrics: { byteSize: 1000, actualSha256: 'sha', actualWidth: 1080, actualHeight: 1920 },
          });
        }),
      } as unknown as HardVisualGatesEngine;

      const { useCase, job, storageSaveMock, exportRepo } = setupAdversarialHarness({
        hardGatesEngine: mockGatesEngine,
      });

      await expect(
        useCase.execute({
          creativeJobId: job.id,
          format: 'STORY_1080_1920',
          encoding: 'PNG',
          actorUserId: 'user-approver-1',
          actorRoles: [RoleCode.MARKETING_APPROVER],
        }),
      ).rejects.toThrow(/GATE_SAFE_MARGIN_VIOLATION/i);

      expect(storageSaveMock).not.toHaveBeenCalled();
      expect(exportRepo.createExport).not.toHaveBeenCalled();
    });

    it('aborts export and preserves containment when adapted 4:5 layout causes CTA-Hero collision', async () => {
      const mockGatesEngine = {
        evaluate: jest.fn((): Promise<HardGateOutcome> => {
          return Promise.resolve({
            isPassed: false,
            validatorVersion: '1.0',
            evaluatedAt: new Date().toISOString(),
            failures: [
              {
                code: HardGateCode.GATE_CTA_HERO_COLLISION,
                field: 'ctaBoundingBox',
                message:
                  'CTA Button overlaps hero cutout bounding box in 1080x1350 adapted canvas.',
                remediationAction: 'SEPARATE_ELEMENTS',
              },
            ],
            metrics: { byteSize: 1000, actualSha256: 'sha', actualWidth: 1080, actualHeight: 1350 },
          });
        }),
      } as unknown as HardVisualGatesEngine;

      const { useCase, job, storageSaveMock, exportRepo } = setupAdversarialHarness({
        hardGatesEngine: mockGatesEngine,
      });

      await expect(
        useCase.execute({
          creativeJobId: job.id,
          format: 'PORTRAIT_1080_1350',
          encoding: 'PNG',
          actorUserId: 'user-approver-1',
          actorRoles: [RoleCode.MARKETING_APPROVER],
        }),
      ).rejects.toThrow(/GATE_CTA_HERO_COLLISION/i);

      expect(storageSaveMock).not.toHaveBeenCalled();
      expect(exportRepo.createExport).not.toHaveBeenCalled();
    });

    it('aborts export when adapted layout typography fails contrast requirements', async () => {
      const mockGatesEngine = {
        evaluate: jest.fn((): Promise<HardGateOutcome> => {
          return Promise.resolve({
            isPassed: false,
            validatorVersion: '1.0',
            evaluatedAt: new Date().toISOString(),
            failures: [
              {
                code: HardGateCode.GATE_TEXT_CONTRAST_LOW,
                field: 'typographyBlocks',
                message:
                  'Text contrast ratio 2.8:1 fails minimum WCAG AA threshold 4.5:1 against adaptive gradient background.',
                remediationAction: 'DARKEN_BACKGROUND',
              },
            ],
            metrics: { byteSize: 1000, actualSha256: 'sha', actualWidth: 1080, actualHeight: 1920 },
          });
        }),
      } as unknown as HardVisualGatesEngine;

      const { useCase, job, storageSaveMock, exportRepo } = setupAdversarialHarness({
        hardGatesEngine: mockGatesEngine,
      });

      await expect(
        useCase.execute({
          creativeJobId: job.id,
          format: 'STORY_1080_1920',
          encoding: 'PNG',
          actorUserId: 'user-approver-1',
          actorRoles: [RoleCode.MARKETING_APPROVER],
        }),
      ).rejects.toThrow(/GATE_TEXT_CONTRAST_LOW/i);

      expect(storageSaveMock).not.toHaveBeenCalled();
      expect(exportRepo.createExport).not.toHaveBeenCalled();
    });

    it('aborts export when adapted copy contains factual price mismatch against authoritative snapshot', async () => {
      const mockGatesEngine = {
        evaluate: jest.fn((): Promise<HardGateOutcome> => {
          return Promise.resolve({
            isPassed: false,
            validatorVersion: '1.0',
            evaluatedAt: new Date().toISOString(),
            failures: [
              {
                code: HardGateCode.GATE_FACTUAL_PRICE_MISMATCH,
                field: 'factualInput',
                message: 'Rendered price $49.00 contradicts ERP source of truth $120.00.',
                remediationAction: 'UPDATE_PRICE_COPY',
              },
            ],
            metrics: { byteSize: 1000, actualSha256: 'sha', actualWidth: 1080, actualHeight: 1080 },
          });
        }),
      } as unknown as HardVisualGatesEngine;

      const { useCase, job, storageSaveMock, exportRepo } = setupAdversarialHarness({
        hardGatesEngine: mockGatesEngine,
      });

      await expect(
        useCase.execute({
          creativeJobId: job.id,
          format: 'SQUARE_1080',
          encoding: 'PNG',
          actorUserId: 'user-approver-1',
          actorRoles: [RoleCode.MARKETING_APPROVER],
        }),
      ).rejects.toThrow(/GATE_FACTUAL_PRICE_MISMATCH/i);

      expect(storageSaveMock).not.toHaveBeenCalled();
      expect(exportRepo.createExport).not.toHaveBeenCalled();
    });

    it('aggregates multiple simultaneous hard gate failures into single rejection diagnostic payload', async () => {
      const mockGatesEngine = {
        evaluate: jest.fn((): Promise<HardGateOutcome> => {
          return Promise.resolve({
            isPassed: false,
            validatorVersion: '1.0',
            evaluatedAt: new Date().toISOString(),
            failures: [
              {
                code: HardGateCode.GATE_SAFE_MARGIN_VIOLATION,
                field: 'ctaBoundingBox',
                message: 'CTA Button inset violation',
                remediationAction: 'ADJUST_PADDING',
              },
              {
                code: HardGateCode.GATE_CTA_HERO_COLLISION,
                field: 'heroBoundingBox',
                message: 'CTA Button overlaps hero cutout',
                remediationAction: 'SEPARATE_ELEMENTS',
              },
              {
                code: HardGateCode.GATE_FACTUAL_SKU_MISMATCH,
                field: 'sceneSku',
                message: 'Rendered SKU does not match ERP record',
                remediationAction: 'UPDATE_SKU',
              },
            ],
            metrics: { byteSize: 1000, actualSha256: 'sha', actualWidth: 1080, actualHeight: 1920 },
          });
        }),
      } as unknown as HardVisualGatesEngine;

      const { useCase, job } = setupAdversarialHarness({
        hardGatesEngine: mockGatesEngine,
      });

      let capturedError: ValidationError | null = null;
      try {
        await useCase.execute({
          creativeJobId: job.id,
          format: 'STORY_1080_1920',
          encoding: 'PNG',
          actorUserId: 'user-approver-1',
          actorRoles: [RoleCode.MARKETING_APPROVER],
        });
      } catch (err) {
        if (err instanceof ValidationError) capturedError = err;
      }

      expect(capturedError).not.toBeNull();
      expect(capturedError?.message).toContain('GATE_SAFE_MARGIN_VIOLATION');
      expect(capturedError?.message).toContain('GATE_CTA_HERO_COLLISION');
      expect(capturedError?.message).toContain('GATE_FACTUAL_SKU_MISMATCH');
      const failures = (capturedError?.details as { failures: unknown[] })?.failures;
      expect(failures).toHaveLength(3);
    });
  });

  describe('3. Ledger Integrity & Idempotent Deduplication Boundaries', () => {
    it('idempotently returns existing ledger entry and CAS buffer without re-compositing or duplicating DB records', async () => {
      const cachedExportBuf = await createDummyRenderedBuffer(1080, 1920);
      const cachedSha = createHash('sha256').update(cachedExportBuf).digest('hex');

      const existingRecord: CreativeExportRecord = {
        id: 'exp-dedup-w32-001',
        creativeJobId: baseJob.id,
        visualAssetId: baseAsset.id,
        format: 'STORY_1080_1920',
        encoding: 'PNG',
        width: 1080,
        height: 1920,
        aspectRatio: '9:16',
        byteSize: cachedExportBuf.length,
        sha256: cachedSha,
        storageKey: 'cas/dedup/story-export.png',
        validationStatus: 'PASSED',
        exportedByUserId: 'user-initial-exporter',
        createdAt: new Date(),
      };

      const { useCase, job, renderPosterMock, storageSaveMock, exportRepo } =
        setupAdversarialHarness({
          existingExportRecord: existingRecord,
          casBufferSupplier: (key) => {
            if (key === existingRecord.storageKey) return Promise.resolve(cachedExportBuf);
            return Promise.resolve(mockBgBuffer);
          },
        });

      const result = await useCase.execute({
        creativeJobId: job.id,
        visualAssetId: baseAsset.id,
        format: 'STORY_1080_1920',
        encoding: 'PNG',
        actorUserId: 'user-second-exporter',
        actorRoles: [RoleCode.MARKETING_APPROVER],
      });

      expect(result.exportId).toBe(existingRecord.id);
      expect(result.sha256).toBe(cachedSha);
      expect(result.width).toBe(1080);
      expect(result.height).toBe(1920);
      expect(result.buffer).toEqual(cachedExportBuf);

      expect(renderPosterMock).not.toHaveBeenCalled();
      expect(storageSaveMock).not.toHaveBeenCalled();
      expect(exportRepo.createExport).not.toHaveBeenCalled();
    });

    it('resiliently falls back to fresh compositing and storage when ledger record exists but CAS buffer is corrupted/missing', async () => {
      const existingRecord: CreativeExportRecord = {
        id: 'exp-corrupted-cas-001',
        creativeJobId: baseJob.id,
        visualAssetId: baseAsset.id,
        format: 'PORTRAIT_1080_1350',
        encoding: 'PNG',
        width: 1080,
        height: 1350,
        aspectRatio: '4:5',
        byteSize: 9999,
        sha256: 'corrupted-sha',
        storageKey: 'cas/missing-file.png',
        validationStatus: 'PASSED',
        exportedByUserId: 'user-initial-exporter',
        createdAt: new Date(),
      };

      const { useCase, job, renderPosterMock, storageSaveMock, exportRepo } =
        setupAdversarialHarness({
          existingExportRecord: existingRecord,
          casBufferSupplier: (key) => {
            if (key === existingRecord.storageKey) return Promise.resolve(null);
            if (key.includes(mockProductSha)) return Promise.resolve(mockProductBuffer);
            return Promise.resolve(mockBgBuffer);
          },
        });

      const result = await useCase.execute({
        creativeJobId: job.id,
        visualAssetId: baseAsset.id,
        format: 'PORTRAIT_1080_1350',
        encoding: 'PNG',
        actorUserId: 'user-recovery-exporter',
        actorRoles: [RoleCode.MARKETING_APPROVER],
      });

      expect(renderPosterMock).toHaveBeenCalledTimes(1);
      expect(storageSaveMock).toHaveBeenCalledTimes(1);
      expect(exportRepo.createExport).toHaveBeenCalledTimes(1);
      expect(result.width).toBe(1080);
      expect(result.height).toBe(1350);
      expect(result.mimeType).toBe('image/png');
    });

    it('strictly satisfies exact dimensions for all three canonical production formats', async () => {
      const formats = [
        { format: 'SQUARE_1080' as const, width: 1080, height: 1080 },
        { format: 'PORTRAIT_1080_1350' as const, width: 1080, height: 1350 },
        { format: 'STORY_1080_1920' as const, width: 1080, height: 1920 },
      ];

      for (const item of formats) {
        const { useCase, job } = setupAdversarialHarness();
        const res = await useCase.execute({
          creativeJobId: job.id,
          format: item.format,
          encoding: 'PNG',
          actorUserId: 'user-approver-w32',
          actorRoles: [RoleCode.MARKETING_APPROVER],
        });

        expect(res.width).toBe(item.width);
        expect(res.height).toBe(item.height);
        const meta = await sharp(res.buffer).metadata();
        expect(meta.width).toBe(item.width);
        expect(meta.height).toBe(item.height);
      }
    });

    it('enforces JPEG encoding and quality parameter in ledger record and CAS payload', async () => {
      const { useCase, job, exportRepo } = setupAdversarialHarness();

      const res = await useCase.execute({
        creativeJobId: job.id,
        format: 'SQUARE_1080',
        encoding: 'JPEG',
        quality: 85,
        actorUserId: 'user-approver-w32',
        actorRoles: [RoleCode.MARKETING_APPROVER],
      });

      expect(res.mimeType).toBe('image/jpeg');
      expect(res.filename).toMatch(/\.jpg$/);
      expect(exportRepo.createExport).toHaveBeenCalledWith(
        expect.objectContaining({
          encoding: 'JPEG',
          quality: 85,
        }),
      );

      const meta = await sharp(res.buffer).metadata();
      expect(meta.format).toBe('jpeg');
    });

    it('emits structured CREATIVE_EXPORTED outbox telemetry event when export is successfully persisted', async () => {
      const { useCase, job } = setupAdversarialHarness();
      const appendMock = jest.fn((_event: unknown) => Promise.resolve('outbox-event-1'));
      const mockOutboxWriter = { append: appendMock };

      const res = await useCase.execute({
        creativeJobId: job.id,
        format: 'STORY_1080_1920',
        encoding: 'PNG',
        actorUserId: 'user-approver-w32',
        actorRoles: [RoleCode.MARKETING_APPROVER],
        outboxWriter: mockOutboxWriter,
      });

      expect(res.exportId).toBeDefined();
      expect(appendMock).toHaveBeenCalledTimes(1);
      expect(appendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: 'CREATIVE_EXPORTED',
          aggregateType: 'CreativeExport',
          aggregateId: res.exportId,
          payload: expect.objectContaining({
            exportId: res.exportId,
            creativeJobId: job.id,
            format: 'STORY_1080_1920',
            encoding: 'PNG',
            width: 1080,
            height: 1920,
            aspectRatio: '9:16',
            validationStatus: 'PASSED',
            exportedByUserId: 'user-approver-w32',
          }),
        }),
      );
    });
  });

  describe('4. ExportDownloadTokenService Cryptographic & Adversarial Defense Suite', () => {
    const tokenSecret = 'production-grade-secret-key-32chars!';
    const tokenService = new ExportDownloadTokenService({
      secret: tokenSecret,
      ttlSeconds: 3600,
    });

    it('generates valid token and verifies successfully within TTL', () => {
      const token = tokenService.generateToken({
        exportId: 'exp-w32-valid-1',
        userId: 'user-w32-approver',
      });

      const outcome = tokenService.verifyToken(token, 'exp-w32-valid-1');
      expect(outcome.isValid).toBe(true);
      expect(outcome.exportId).toBe('exp-w32-valid-1');
      expect(outcome.userId).toBe('user-w32-approver');
    });

    it('rejects expired token immediately when exp timestamp is in the past (EXPIRED)', () => {
      const shortTtlService = new ExportDownloadTokenService({
        secret: tokenSecret,
        ttlSeconds: -1,
      });

      const token = shortTtlService.generateToken({
        exportId: 'exp-expired-w32',
        userId: 'user-w32-approver',
      });

      const outcome = tokenService.verifyToken(token, 'exp-expired-w32');
      expect(outcome.isValid).toBe(false);
      expect(outcome.reason).toBe('EXPIRED');
    });

    it('rejects signature bit-flip tampering attempt with INVALID_SIGNATURE', () => {
      const token = tokenService.generateToken({
        exportId: 'exp-tamper-sig-1',
        userId: 'user-w32-approver',
      });

      const decoded = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as {
        e: string;
        u: string;
        exp: number;
        sig: string;
      };
      const lastChar = decoded.sig.slice(-1);
      const flipped = lastChar === 'a' ? 'b' : 'a';
      decoded.sig = decoded.sig.slice(0, -1) + flipped;

      const tamperedToken = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url');

      const outcome = tokenService.verifyToken(tamperedToken, 'exp-tamper-sig-1');
      expect(outcome.isValid).toBe(false);
      expect(outcome.reason).toBe('INVALID_SIGNATURE');
    });

    it('rejects payload tampering attempt where exportId or timestamp was altered', () => {
      const token = tokenService.generateToken({
        exportId: 'exp-original-1',
        userId: 'user-original',
      });

      const decoded = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as {
        e: string;
        u: string;
        exp: number;
        sig: string;
      };
      decoded.e = 'exp-injected-2';
      const tamperedToken = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url');

      const outcome = tokenService.verifyToken(tamperedToken, 'exp-injected-2');
      expect(outcome.isValid).toBe(false);
      expect(outcome.reason).toBe('INVALID_SIGNATURE');
    });

    it('rejects cross-resource token reuse (valid token for export-A used to fetch export-B)', () => {
      const tokenForExportA = tokenService.generateToken({
        exportId: 'exp-resource-A',
        userId: 'user-approver',
      });

      const outcome = tokenService.verifyToken(tokenForExportA, 'exp-resource-B');
      expect(outcome.isValid).toBe(false);
      expect(outcome.reason).toBe('EXPORT_MISMATCH');
    });

    it('rejects cross-tenant key confusion (token signed with Secret A verified with Secret B)', () => {
      const serviceA = new ExportDownloadTokenService({
        secret: 'tenant-a-secret-key-32-chars-long!',
      });
      const serviceB = new ExportDownloadTokenService({
        secret: 'tenant-b-secret-key-32-chars-long!',
      });

      const tokenA = serviceA.generateToken({
        exportId: 'exp-tenant-1',
        userId: 'user-tenant',
      });
      const outcome = serviceB.verifyToken(tokenA, 'exp-tenant-1');

      expect(outcome.isValid).toBe(false);
      expect(outcome.reason).toBe('INVALID_SIGNATURE');
    });

    it.each([
      ['empty string', ''],
      ['whitespace only', '   '],
      ['non-JSON payload', Buffer.from('not-json').toString('base64url')],
      ['malformed base64url', '@@@invalid@@@'],
      ['missing payload fields', Buffer.from(JSON.stringify({ e: 'exp-1' })).toString('base64url')],
    ])('rejects malformed token variant: %s with MALFORMED', (_desc, malformedToken) => {
      const outcome = tokenService.verifyToken(malformedToken);
      expect(outcome.isValid).toBe(false);
      expect(outcome.reason).toBe('MALFORMED');
    });
  });

  describe('5. RBAC & Role Authorization Boundaries', () => {
    it('rejects operator lacking EXPORT_CREATIVE permission (e.g. VIEWER) with ForbiddenError', async () => {
      const { useCase, job } = setupAdversarialHarness();

      await expect(
        useCase.execute({
          creativeJobId: job.id,
          format: 'SQUARE_1080',
          encoding: 'PNG',
          actorUserId: 'user-viewer-1',
          actorRoles: [RoleCode.VIEWER],
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('rejects operator with MARKETING_EDITOR role lacking EXPORT_CREATIVE permission', async () => {
      const { useCase, job } = setupAdversarialHarness();

      await expect(
        useCase.execute({
          creativeJobId: job.id,
          format: 'SQUARE_1080',
          encoding: 'PNG',
          actorUserId: 'user-editor-1',
          actorRoles: [RoleCode.MARKETING_EDITOR],
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('authorizes operator with MARKETING_APPROVER role having EXPORT_CREATIVE permission', async () => {
      const { useCase, job } = setupAdversarialHarness();

      const result = await useCase.execute({
        creativeJobId: job.id,
        format: 'SQUARE_1080',
        encoding: 'PNG',
        actorUserId: 'user-approver-1',
        actorRoles: [RoleCode.MARKETING_APPROVER],
      });

      expect(result.width).toBe(1080);
      expect(result.height).toBe(1080);
      expect(result.mimeType).toBe('image/png');
    });

    it('authorizes operator with ADMIN role having EXPORT_CREATIVE permission', async () => {
      const { useCase, job } = setupAdversarialHarness();

      const result = await useCase.execute({
        creativeJobId: job.id,
        format: 'SQUARE_1080',
        encoding: 'PNG',
        actorUserId: 'user-admin-1',
        actorRoles: [RoleCode.ADMIN],
      });

      expect(result.width).toBe(1080);
      expect(result.height).toBe(1080);
    });
  });
});
