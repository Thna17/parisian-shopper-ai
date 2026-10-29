import { describe, expect, it, jest } from '@jest/globals';
import { createHash } from 'node:crypto';
import { type ApplicationLogger } from '@parisian-shopper/common';
import { PermissionService, RoleCode } from '../../auth/domain/permissions.js';
import { RevisePosterUseCase } from './revise-poster.use-case.js';
import { ApproveCreativeUseCase } from './approve-creative.use-case.js';
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
  type CreativeApprovalEventRecord,
  type CreativeApprovalRepository,
  type RecordCreativeApprovalInput,
} from './creative-approval.repository.js';
import {
  type VisualValidationRepository,
  type VisualValidationResultRecord,
} from './visual-validation.repository.js';
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
  type FailGenerationInput,
} from '../../content/application/content-generation.repository.js';
import {
  type CreativeBrief,
  type CreativeProvider,
  type GeneratedBackgroundAsset,
} from './creative-provider.port.js';
import {
  CreativeJobNotReadyForApprovalError,
  CreativeStaleVersionError,
  CreativeTerminalStateError,
  LayerDriftViolationError,
} from '../domain/creative-errors.js';
import {
  ApprovalDomain,
  type RevisionPlan,
  RevisionExecutionStrategy,
  RevisionInterpretationConfidence,
  RevisionTargetType,
} from '../domain/revision/revision-plan.types.js';
import { HardGateCode } from '../domain/services/hard-visual-gates.port.js';
import { SelectiveInvalidationEngine } from '../domain/revision/selective-invalidation.engine.js';
import { type CreativeJobStatus } from '../domain/creative.js';

describe('W31-E Structured Revision Adversarial Integration Suite', () => {
  const permissions = new PermissionService();

  const mockProductBuffer = Buffer.from('adversarial-canonical-product-buffer-bytes');
  const mockProductSha = createHash('sha256').update(mockProductBuffer).digest('hex');

  const mockBgBuffer = Buffer.from('adversarial-deterministic-background-buffer-bytes');
  const mockBgSha = createHash('sha256').update(mockBgBuffer).digest('hex');

  const mockRenderedBuffer = Buffer.from('adversarial-rendered-poster-buffer-bytes');

  const baseJob: CreativeJobRecord = {
    id: 'job-adv-w31',
    contentVersionId: 'ver-c1',
    productSnapshotId: 'snap-p1',
    brandRuleVersionId: 'rule-b1',
    status: 'READY_FOR_REVIEW',
    targetPlatform: 'TELEGRAM',
    aspectRatio: '1:1',
    creativeProfile: 'PARISIAN_MORNING_ATELIER',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const initialAsset: VisualAssetRecord = {
    id: 'asset-v1',
    creativeJobId: baseJob.id,
    versionNumber: 1,
    assetRole: 'COMPOSITED_CREATIVE',
    mimeType: 'image/png',
    width: 1080,
    height: 1080,
    byteSize: 5000,
    sha256: 'poster-sha-v1',
    storageKey: 'cas/poster-v1.png',
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
        sku: 'SKU-ADV-1',
        product_name: 'L’Essence Parisienne',
        brand: 'Geparlys',
        category: 'Fragrance',
        price: '120.0000',
        currency: 'EUR',
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

  interface AdversarialHarness {
    readonly revisePoster: RevisePosterUseCase;
    readonly approveCreative: ApproveCreativeUseCase;
    readonly jobRepo: CreativeJobRepository;
    readonly assetRepo: VisualAssetRepository;
    readonly approvalRepo: CreativeApprovalRepository;
    readonly validationRepo: VisualValidationRepository;
    readonly currentJob: CreativeJobRecord;
    readonly assets: VisualAssetRecord[];
    readonly renderedBuffers: Map<string, Buffer>;
  }

  function createAdversarialHarness(): AdversarialHarness {
    const jobState: { current: CreativeJobRecord } = {
      current: { ...baseJob },
    };

    const assetsState: VisualAssetRecord[] = [{ ...initialAsset }];
    const renderedBuffers = new Map<string, Buffer>();
    renderedBuffers.set(initialAsset.id, mockRenderedBuffer);

    const jobRepo: CreativeJobRepository = {
      createJob: jest.fn((_input: CreateCreativeJobInput): Promise<CreativeJobRecord> => {
        throw new Error('Not implemented');
      }),
      findById: jest.fn((id: string): Promise<CreativeJobRecord | null> =>
        Promise.resolve(id === jobState.current.id ? jobState.current : null),
      ),
      findByContentVersionId: jest.fn((_id: string): Promise<readonly CreativeJobRecord[]> =>
        Promise.resolve([jobState.current]),
      ),
      transitionStatus: jest.fn(
        (
          _id: string,
          _from: CreativeJobStatus,
          to: CreativeJobStatus,
        ): Promise<CreativeJobRecord> => {
          jobState.current = { ...jobState.current, status: to };
          return Promise.resolve(jobState.current);
        },
      ),
    };

    const createAssetMock = jest.fn((input: CreateVisualAssetInput): Promise<VisualAssetRecord> => {
      const nextVersion = assetsState.length + 1;
      const newAsset: VisualAssetRecord = {
        id: `asset-v${nextVersion}`,
        creativeJobId: input.creativeJobId,
        versionNumber: nextVersion,
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
      assetsState.push(newAsset);
      return Promise.resolve(newAsset);
    });

    const assetRepo: VisualAssetRepository = {
      createAsset: createAssetMock,
      findById: jest.fn((id: string): Promise<VisualAssetRecord | null> =>
        Promise.resolve(assetsState.find((a) => a.id === id) ?? null),
      ),
      findByJobAndVersion: jest.fn(
        (_jobId: string, version: number): Promise<VisualAssetRecord | null> =>
          Promise.resolve(assetsState.find((a) => a.versionNumber === version) ?? null),
      ),
      findLatestByJobId: jest.fn((_jobId: string): Promise<VisualAssetRecord | null> => {
        const latest = assetsState[assetsState.length - 1];
        return Promise.resolve(latest ?? null);
      }),
      listByJobId: jest.fn((_jobId: string): Promise<readonly VisualAssetRecord[]> =>
        Promise.resolve([...assetsState]),
      ),
    };

    const revisions: CreativeRevisionRequestRecord[] = [];
    const revisionRepo: CreativeRevisionRepository = {
      createRequest: jest.fn(
        (input: CreateCreativeRevisionInput): Promise<CreativeRevisionRequestRecord> => {
          const req: CreativeRevisionRequestRecord = {
            id: `rev-req-${revisions.length + 1}`,
            creativeJobId: input.creativeJobId,
            sourceVisualAssetId: input.sourceVisualAssetId,
            requestedByUserId: input.requestedByUserId,
            type: input.type,
            status: 'PENDING',
            ...(input.instruction !== undefined ? { instruction: input.instruction } : {}),
            createdAt: new Date(),
          };
          revisions.push(req);
          return Promise.resolve(req);
        },
      ),
      findById: jest.fn((id: string): Promise<CreativeRevisionRequestRecord | null> =>
        Promise.resolve(revisions.find((r) => r.id === id) ?? null),
      ),
      findActiveByJobId: jest.fn((_jobId: string): Promise<CreativeRevisionRequestRecord | null> =>
        Promise.resolve(revisions.find((r) => r.status === 'PENDING') ?? null),
      ),
      completeRequest: jest.fn(
        (id: string, resultingAssetId: string): Promise<CreativeRevisionRequestRecord> => {
          const found = revisions.find((r) => r.id === id);
          if (!found) throw new Error('Revision not found');
          const completed: CreativeRevisionRequestRecord = {
            ...found,
            status: 'COMPLETED',
            resultingVisualAssetId: resultingAssetId,
          };
          return Promise.resolve(completed);
        },
      ),
      cancelRequest: jest.fn((id: string): Promise<CreativeRevisionRequestRecord> => {
        const found = revisions.find((r) => r.id === id);
        if (!found) throw new Error('Revision not found');
        return Promise.resolve({ ...found, status: 'CANCELLED' });
      }),
    };

    const approvals: CreativeApprovalEventRecord[] = [];
    const approvalRepo: CreativeApprovalRepository = {
      recordApproval: jest.fn(
        (input: RecordCreativeApprovalInput): Promise<CreativeApprovalEventRecord> => {
          const event: CreativeApprovalEventRecord = {
            id: `appr-${approvals.length + 1}`,
            creativeJobId: input.creativeJobId,
            visualAssetId: input.visualAssetId,
            ...(input.visualValidationResultId !== undefined
              ? { visualValidationResultId: input.visualValidationResultId }
              : {}),
            approverUserId: input.approverUserId,
            decision: input.decision,
            ...(input.comment !== undefined ? { comment: input.comment } : {}),
            createdAt: new Date(),
          };
          approvals.push(event);
          return Promise.resolve(event);
        },
      ),
      findByJobId: jest.fn((_jobId: string): Promise<readonly CreativeApprovalEventRecord[]> =>
        Promise.resolve([...approvals]),
      ),
      findByAssetId: jest.fn((_assetId: string): Promise<readonly CreativeApprovalEventRecord[]> =>
        Promise.resolve([...approvals]),
      ),
    };

    const validations = new Map<string, VisualValidationResultRecord>();
    validations.set(initialAsset.id, {
      id: 'val-res-v1',
      visualAssetId: initialAsset.id,
      status: 'PASSED',
      validatorVersion: '1.0',
      findingCount: 0,
      warningCount: 0,
      blockingCount: 0,
      infoCount: 0,
      findings: [],
      createdAt: new Date(),
    });

    const validationRepo: VisualValidationRepository = {
      recordResult: jest.fn(),
      findLatestByAssetId: jest.fn(
        (assetId: string): Promise<VisualValidationResultRecord | null> =>
          Promise.resolve(validations.get(assetId) ?? null),
      ),
      findLatestByJobId: jest.fn((): Promise<VisualValidationResultRecord | null> => {
        const latestAsset = assetsState[assetsState.length - 1];
        return Promise.resolve(latestAsset ? (validations.get(latestAsset.id) ?? null) : null);
      }),
      listByJobId: jest.fn((): Promise<readonly VisualValidationResultRecord[]> =>
        Promise.resolve(Array.from(validations.values())),
      ),
    } as unknown as VisualValidationRepository;

    const storage: AssetStoragePort = {
      saveAsset: jest.fn((input: SaveAssetInput): Promise<StoredAssetMetadata> => {
        const hash = createHash('sha256').update(input.buffer).digest('hex');
        return Promise.resolve({
          storageKey: `cas/${hash}.png`,
          sha256Digest: hash,
          byteSize: input.buffer.length,
          mimeType: input.mimeType,
          assetRole: input.assetRole,
          createdAt: new Date(),
        });
      }),
      getMetadata: jest.fn(() => Promise.resolve(null)),
      getAssetBuffer: jest.fn((key: string): Promise<Buffer | null> => {
        if (key.includes(mockProductSha)) return Promise.resolve(mockProductBuffer);
        if (key.includes(mockBgSha)) return Promise.resolve(mockBgBuffer);
        return Promise.resolve(mockBgBuffer);
      }),
      assetExists: jest.fn(() => Promise.resolve(true)),
    };

    const snapshotRepo: ProductSnapshotRepository = {
      create: jest.fn(() => Promise.resolve(mockSnapshot)),
      findById: jest.fn((id: string) =>
        Promise.resolve(id === mockSnapshot.id ? mockSnapshot : null),
      ),
    };

    const contentRepo: ContentGenerationRepository = {
      createJob: jest.fn((_input: CreateContentJobInput): Promise<ContentJob> => {
        throw new Error('Not implemented');
      }),
      findJobById: jest.fn(() => Promise.resolve(null)),
      findAttemptsByJobId: jest.fn(() => Promise.resolve([])),
      findVersionById: jest.fn((id: string) =>
        Promise.resolve(id === mockContentVersion.id ? mockContentVersion : null),
      ),
      createDirectVersion: jest.fn(() => Promise.resolve(mockContentVersion)),
      beginGeneration: jest.fn((_input: BeginGenerationInput): Promise<BeginGenerationResult> => {
        throw new Error('Not implemented');
      }),
      completeGeneration: jest.fn((_input: CompleteGenerationInput): Promise<ContentVersion> => {
        throw new Error('Not implemented');
      }),
      failGeneration: jest.fn((_input: FailGenerationInput): Promise<void> => Promise.resolve()),
      findVersionsByJobId: jest.fn(() => Promise.resolve([mockContentVersion])),
    };

    const validateCreative = {
      execute: jest.fn((input: { creativeJobId: string; visualAssetId: string }) => {
        const resultRecord: VisualValidationResultRecord = {
          id: `val-res-${input.visualAssetId}`,
          visualAssetId: input.visualAssetId,
          status: 'PASSED',
          validatorVersion: '1.0',
          findingCount: 0,
          warningCount: 0,
          blockingCount: 0,
          infoCount: 0,
          findings: [],
          createdAt: new Date(),
        };
        validations.set(input.visualAssetId, resultRecord);
        return Promise.resolve({ isPassed: true, result: resultRecord });
      }),
    } as unknown as ValidateCreativeUseCase;

    const posterCompositor: PosterCompositor = {
      renderPoster: jest.fn((input: RenderPosterInput): Promise<RenderPosterResult> => {
        const rendered = Buffer.concat([
          mockRenderedBuffer,
          Buffer.from(input.posterSpec.headline ?? 'default'),
        ]);
        const renderedSha = createHash('sha256').update(rendered).digest('hex');
        return Promise.resolve({
          posterBuffer: rendered,
          mimeType: 'image/png',
          sha256: renderedSha,
          width: 1080,
          height: 1080,
          byteSize: rendered.length,
          latencyMs: 15,
          compositorVersion: 'v2',
          layoutManifest: {
            version: '1.0',
            templateId: input.posterSpec.templateId,
            dimensions: { width: 1080, height: 1080 },
            safeMargins: { top: 40, bottom: 40, left: 40, right: 40 },
            elements: [],
          },
          productDigest: input.canonicalProductSha256,
          backgroundDigest: input.backgroundSha256,
          outputDigest: renderedSha,
        });
      }),
    };

    const creativeProvider: CreativeProvider = {
      providerId: 'MOCK_ADVERSARIAL_AI',
      generateBackground: jest.fn((_brief: CreativeBrief): Promise<GeneratedBackgroundAsset> => {
        const freshBg = Buffer.from(`fresh-bg-${Date.now()}`);
        return Promise.resolve({
          imageBuffer: freshBg,
          mimeType: 'image/png',
          width: 1080,
          height: 1080,
          providerId: 'MOCK_ADVERSARIAL_AI',
          model: 'adversarial-v1',
          latencyMs: 80,
        });
      }),
    };

    const logger: ApplicationLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const revisePoster = new RevisePosterUseCase(
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

    const approveCreative = new ApproveCreativeUseCase(
      jobRepo,
      assetRepo,
      approvalRepo,
      validationRepo,
      logger,
      permissions,
    );

    return {
      revisePoster,
      approveCreative,
      jobRepo,
      assetRepo,
      approvalRepo,
      validationRepo,
      get currentJob(): CreativeJobRecord {
        return jobState.current;
      },
      assets: assetsState,
      renderedBuffers,
    };
  }

  function createPlan(overrides?: Partial<RevisionPlan>): RevisionPlan {
    return {
      id: `plan-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      creativeJobId: baseJob.id,
      baseVersionNumber: 1,
      requestedByUserId: 'user-editor',
      rawInstruction: 'Headline: Royale Rose',
      confidence: RevisionInterpretationConfidence.CONFIDENT,
      confidenceScore: 1.0,
      executionStrategy: RevisionExecutionStrategy.ZERO_AI_COMPOSITE,
      mutations: [
        {
          target: RevisionTargetType.HEADLINE,
          fieldName: 'headline',
          previousValue: 'Parisian Elegance',
          requestedValue: 'Royale Rose',
        },
      ],
      affectedLayerGroups: ['TYPOGRAPHY'],
      preservedLayerDigests: {
        PRODUCT_HERO: mockProductSha,
        BACKGROUND: mockBgSha,
      },
      requiresConfirmation: false,
      estimatedExecutionMs: 40,
      createdAt: new Date(),
      ...overrides,
    };
  }

  // =========================================================================
  // VECTOR 1: CONCURRENT EDIT VS APPROVAL RACE CONDITIONS
  // =========================================================================
  describe('Vector 1: Concurrent Edit vs Approval Race Conditions', () => {
    it('Scenario 1.1: If approval completes first, job enters CREATIVE_APPROVED and subsequent revision fails-fast with CreativeTerminalStateError', async () => {
      const harness = createAdversarialHarness();

      // Approver wins the race on V1
      const approvalResult = await harness.approveCreative.execute({
        creativeJobId: harness.currentJob.id,
        visualAssetId: harness.assets[0]!.id,
        approvedBy: 'user-approver',
        approverRoles: [RoleCode.MARKETING_APPROVER],
        comment: 'Approved before operator revision landed',
      });

      expect(approvalResult.approvalEvent.decision).toBe('CREATIVE_APPROVED');
      expect(harness.currentJob.status).toBe('CREATIVE_APPROVED');

      // Operator revision subsequently attempts to execute against the now-approved job
      const plan = createPlan({ baseVersionNumber: 1 });

      await expect(
        harness.revisePoster.executePlan({
          creativeJobId: harness.currentJob.id,
          plan,
          actorUserId: 'user-editor',
          actorRoles: [RoleCode.MARKETING_APPROVER],
        }),
      ).rejects.toThrow(CreativeTerminalStateError);
    });

    it('Scenario 1.2: If revision begins first and transitions status to REVISION_REQUESTED, concurrent approval attempt fails with CreativeJobNotReadyForApprovalError', async () => {
      const harness = createAdversarialHarness();

      // Operator requests revision, locking the job out of READY_FOR_REVIEW
      await harness.jobRepo.transitionStatus(
        harness.currentJob.id,
        'READY_FOR_REVIEW',
        'REVISION_REQUESTED',
      );
      expect(harness.currentJob.status).toBe('REVISION_REQUESTED');

      // Concurrent approver tries to approve V1
      await expect(
        harness.approveCreative.execute({
          creativeJobId: harness.currentJob.id,
          visualAssetId: harness.assets[0]!.id,
          approvedBy: 'user-approver',
          approverRoles: [RoleCode.MARKETING_APPROVER],
        }),
      ).rejects.toThrow(CreativeJobNotReadyForApprovalError);
    });

    it('Scenario 1.3: If revision advances asset to V2, stale approval attempt targeting V1 is rejected with CreativeStaleVersionError', async () => {
      const harness = createAdversarialHarness();

      // Operator executes revision V1 -> V2
      const plan = createPlan({ baseVersionNumber: 1 });
      const revResult = await harness.revisePoster.executePlan({
        creativeJobId: harness.currentJob.id,
        plan,
        actorUserId: 'user-editor',
        actorRoles: [RoleCode.MARKETING_APPROVER],
      });

      expect(revResult.visualAsset.versionNumber).toBe(2);
      expect(harness.assets.length).toBe(2);

      // Approver with stale UI clicks approve for V1 (asset-v1) while latest is now asset-v2
      await expect(
        harness.approveCreative.execute({
          creativeJobId: harness.currentJob.id,
          visualAssetId: harness.assets[0]!.id, // asset-v1
          approvedBy: 'user-approver',
          approverRoles: [RoleCode.MARKETING_APPROVER],
        }),
      ).rejects.toThrow(CreativeStaleVersionError);

      // But approving the latest asset V2 succeeds cleanly
      const validApproval = await harness.approveCreative.execute({
        creativeJobId: harness.currentJob.id,
        visualAssetId: revResult.visualAsset.id, // asset-v2
        approvedBy: 'user-approver',
        approverRoles: [RoleCode.MARKETING_APPROVER],
      });
      expect(validApproval.approvalEvent.decision).toBe('CREATIVE_APPROVED');
    });

    it('Scenario 1.4: Concurrent conflicting revisions on same base version (V1): first succeeds to V2, second fails-fast with CreativeStaleVersionError', async () => {
      const harness = createAdversarialHarness();

      const planA = createPlan({
        baseVersionNumber: 1,
        rawInstruction: 'Headline: Summer Breeze',
        mutations: [
          {
            target: RevisionTargetType.HEADLINE,
            fieldName: 'headline',
            previousValue: 'Parisian Elegance',
            requestedValue: 'Summer Breeze',
          },
        ],
      });

      const planB = createPlan({
        baseVersionNumber: 1,
        rawInstruction: 'Price: 150 EUR',
        mutations: [
          {
            target: RevisionTargetType.PRICE,
            fieldName: 'price',
            previousValue: '120 EUR',
            requestedValue: '150 EUR',
          },
        ],
      });

      // Operator A completes revision V1 -> V2
      const resultA = await harness.revisePoster.executePlan({
        creativeJobId: harness.currentJob.id,
        plan: planA,
        actorUserId: 'user-editor-A',
        actorRoles: [RoleCode.MARKETING_APPROVER],
      });
      expect(resultA.visualAsset.versionNumber).toBe(2);

      // Operator B concurrently submits revision based on V1
      await expect(
        harness.revisePoster.executePlan({
          creativeJobId: harness.currentJob.id,
          plan: planB,
          actorUserId: 'user-editor-B',
          actorRoles: [RoleCode.MARKETING_APPROVER],
        }),
      ).rejects.toThrow(CreativeStaleVersionError);

      // Asset count remains 2 (no corrupt or interleaved V3 created)
      expect(harness.assets.length).toBe(2);
    });
  });

  // =========================================================================
  // VECTOR 2: MULTI-HOP STALE VERSION PROGRESSION REJECTION (V1 -> V2 -> V3)
  // =========================================================================
  describe('Vector 2: Multi-Hop Stale Version Progression Rejection (V1 -> V2 -> V3)', () => {
    it('strictly enforces linear version continuity and rejects any stale hop in the chain', async () => {
      const harness = createAdversarialHarness();

      // Step 1: V1 -> V2 (Headline edit)
      const plan1 = createPlan({
        baseVersionNumber: 1,
        rawInstruction: 'Headline: Midnight Rose',
        mutations: [
          {
            target: RevisionTargetType.HEADLINE,
            fieldName: 'headline',
            previousValue: 'Parisian Elegance',
            requestedValue: 'Midnight Rose',
          },
        ],
      });
      const v2 = await harness.revisePoster.executePlan({
        creativeJobId: harness.currentJob.id,
        plan: plan1,
        actorUserId: 'user-editor',
        actorRoles: [RoleCode.MARKETING_APPROVER],
      });
      expect(v2.visualAsset.versionNumber).toBe(2);

      // Step 2: V2 -> V3 (Style preset AI generation)
      const plan2 = createPlan({
        baseVersionNumber: 2,
        executionStrategy: RevisionExecutionStrategy.AI_BACKGROUND_REGEN,
        rawInstruction: 'Style: NOCTURNE_OBSIDIAN',
        mutations: [
          {
            target: RevisionTargetType.STYLE_PRESET,
            fieldName: 'stylePreset',
            previousValue: 'PARISIAN_MORNING_ATELIER',
            requestedValue: 'NOCTURNE_OBSIDIAN',
          },
        ],
        affectedLayerGroups: ['BACKGROUND', 'SURFACE_SHADOW'],
        preservedLayerDigests: {
          PRODUCT_HERO: mockProductSha,
        },
        requiresConfirmation: true,
      });
      const v3 = await harness.revisePoster.executePlan({
        creativeJobId: harness.currentJob.id,
        plan: plan2,
        actorUserId: 'user-editor',
        actorRoles: [RoleCode.MARKETING_APPROVER],
        confirmed: true,
      });
      expect(v3.visualAsset.versionNumber).toBe(3);

      // Attempt revision with baseVersion: 1 (stale by 2 hops)
      const staleV1Plan = createPlan({
        baseVersionNumber: 1,
        rawInstruction: 'Headline: Stale Edit V1',
      });
      await expect(
        harness.revisePoster.executePlan({
          creativeJobId: harness.currentJob.id,
          plan: staleV1Plan,
          actorUserId: 'user-editor',
          actorRoles: [RoleCode.MARKETING_APPROVER],
        }),
      ).rejects.toThrow(CreativeStaleVersionError);

      // Attempt revision with baseVersion: 2 (stale by 1 hop)
      const staleV2Plan = createPlan({
        baseVersionNumber: 2,
        rawInstruction: 'Price: 199 EUR',
      });
      await expect(
        harness.revisePoster.executePlan({
          creativeJobId: harness.currentJob.id,
          plan: staleV2Plan,
          actorUserId: 'user-editor',
          actorRoles: [RoleCode.MARKETING_APPROVER],
        }),
      ).rejects.toThrow(CreativeStaleVersionError);

      // Revision based on current V3 succeeds cleanly and advances to V4
      const validV3Plan = createPlan({
        baseVersionNumber: 3,
        rawInstruction: 'CTA: Shop Nocturne',
        mutations: [
          {
            target: RevisionTargetType.CTA,
            fieldName: 'cta',
            previousValue: 'Discover More',
            requestedValue: 'Shop Nocturne',
          },
        ],
        preservedLayerDigests: {
          PRODUCT_HERO: mockProductSha,
          BACKGROUND: v3.visualAsset.backgroundAssetDigest ?? mockBgSha,
        },
      });
      const v4 = await harness.revisePoster.executePlan({
        creativeJobId: harness.currentJob.id,
        plan: validV3Plan,
        actorUserId: 'user-editor',
        actorRoles: [RoleCode.MARKETING_APPROVER],
      });
      expect(v4.visualAsset.versionNumber).toBe(4);
      expect(harness.assets.length).toBe(4);
    });
  });

  // =========================================================================
  // VECTOR 3: EXHAUSTIVE INVALIDATION BOUNDARY MATRIX VERIFICATION
  // =========================================================================
  describe('Vector 3: Exhaustive Invalidation Boundary Matrix Verification (Section 3.2)', () => {
    const engine = new SelectiveInvalidationEngine();
    const digests: Readonly<Record<string, string>> = {
      PRODUCT_HERO: mockProductSha,
      BACKGROUND: mockBgSha,
      TYPOGRAPHY: 'typo-sha-initial',
    };

    it('3.1 HEADLINE / SUBHEAD / CTA: invalidates typography/margin/collision gates and content/visual approvals; strictly preserves Product Governance & background', () => {
      const assessment = engine.assessInvalidation({
        mutations: [
          {
            target: RevisionTargetType.HEADLINE,
            fieldName: 'headline',
            requestedValue: 'New Headline',
          },
        ],
        currentDigests: digests,
      });

      // Invalidated gates
      expect(assessment.invalidatedGateCodes).toEqual(
        expect.arrayContaining([
          HardGateCode.GATE_TEXT_CONTRAST_LOW,
          HardGateCode.GATE_UNSAFE_UNICODE,
          HardGateCode.GATE_MISSING_GLYPHS,
          HardGateCode.GATE_SAFE_MARGIN_VIOLATION,
          HardGateCode.GATE_CTA_HERO_COLLISION,
        ]),
      );

      // Preserved product truth gates
      expect(assessment.preservedGateCodes).toEqual(
        expect.arrayContaining([
          HardGateCode.GATE_PLACEHOLDER_REJECTED,
          HardGateCode.GATE_PRODUCT_ALPHA_CLIPPED,
          HardGateCode.GATE_PRODUCT_VISIBILITY_LOW,
          HardGateCode.GATE_FACTUAL_PRICE_MISMATCH,
          HardGateCode.GATE_FACTUAL_SKU_MISMATCH,
          HardGateCode.GATE_CONTAINER_INVALID,
        ]),
      );

      // Approvals
      expect(assessment.invalidatedApprovalDomains).toEqual([
        ApprovalDomain.CONTENT_APPROVED,
        ApprovalDomain.VISUAL_APPROVED,
        ApprovalDomain.EXPORT_APPROVED,
      ]);
      expect(assessment.preservedApprovalDomains).toEqual([
        ApprovalDomain.PRODUCT_GOVERNANCE_APPROVED,
      ]);

      // Preserved digests
      expect(assessment.affectedLayerGroups).toEqual(['TYPOGRAPHY']);
      expect(assessment.preservedLayerDigests['BACKGROUND']).toBe(mockBgSha);
      expect(assessment.preservedLayerDigests['PRODUCT_HERO']).toBe(mockProductSha);
      expect(assessment.preservedLayerDigests['TYPOGRAPHY']).toBeUndefined();
    });

    it('3.2 PRICE / PROMOTIONAL_PRICE: invalidates factual pricing and contrast/margin; strictly preserves product authenticity', () => {
      const assessment = engine.assessInvalidation({
        mutations: [
          {
            target: RevisionTargetType.PRICE,
            fieldName: 'price',
            requestedValue: '199 EUR',
          },
          {
            target: RevisionTargetType.PROMOTIONAL_PRICE,
            fieldName: 'promotionalPrice',
            requestedValue: '149 EUR',
          },
        ],
        currentDigests: digests,
      });

      expect(assessment.invalidatedGateCodes).toEqual(
        expect.arrayContaining([
          HardGateCode.GATE_FACTUAL_PRICE_MISMATCH,
          HardGateCode.GATE_FACTUAL_PROMO_MISMATCH,
          HardGateCode.GATE_TEXT_CONTRAST_LOW,
          HardGateCode.GATE_SAFE_MARGIN_VIOLATION,
        ]),
      );

      expect(assessment.preservedGateCodes).toEqual(
        expect.arrayContaining([
          HardGateCode.GATE_PLACEHOLDER_REJECTED,
          HardGateCode.GATE_PRODUCT_ALPHA_CLIPPED,
          HardGateCode.GATE_PRODUCT_VISIBILITY_LOW,
          HardGateCode.GATE_CONTAINER_INVALID,
        ]),
      );

      expect(assessment.invalidatedApprovalDomains).toEqual([
        ApprovalDomain.CONTENT_APPROVED,
        ApprovalDomain.VISUAL_APPROVED,
        ApprovalDomain.EXPORT_APPROVED,
      ]);
      expect(assessment.preservedApprovalDomains).toContain(
        ApprovalDomain.PRODUCT_GOVERNANCE_APPROVED,
      );
    });

    it('3.3 BACKGROUND (AI Regen / Style): invalidates visual approval; strictly preserves CONTENT_APPROVED and product hero digest', () => {
      const assessment = engine.assessInvalidation({
        mutations: [
          {
            target: RevisionTargetType.STYLE_PRESET,
            fieldName: 'stylePreset',
            requestedValue: 'NOCTURNE_OBSIDIAN',
          },
        ],
        currentDigests: digests,
      });

      expect(assessment.invalidatedGateCodes).toEqual(
        expect.arrayContaining([
          HardGateCode.GATE_TEXT_CONTRAST_LOW,
          HardGateCode.GATE_CONTAINER_INVALID,
          HardGateCode.GATE_FILE_SIZE_EXCEEDED,
        ]),
      );

      // Preserved typography & factual pricing
      expect(assessment.preservedGateCodes).toEqual(
        expect.arrayContaining([
          HardGateCode.GATE_UNSAFE_UNICODE,
          HardGateCode.GATE_MISSING_GLYPHS,
          HardGateCode.GATE_FACTUAL_PRICE_MISMATCH,
          HardGateCode.GATE_PLACEHOLDER_REJECTED,
        ]),
      );

      // Core guarantee: Content Approval is PRESERVED
      expect(assessment.invalidatedApprovalDomains).toEqual([
        ApprovalDomain.VISUAL_APPROVED,
        ApprovalDomain.EXPORT_APPROVED,
      ]);
      expect(assessment.preservedApprovalDomains).toContain(ApprovalDomain.CONTENT_APPROVED);
      expect(assessment.preservedApprovalDomains).toContain(
        ApprovalDomain.PRODUCT_GOVERNANCE_APPROVED,
      );

      // Layer hash preservation
      expect(assessment.affectedLayerGroups).toEqual(
        expect.arrayContaining(['BACKGROUND', 'SURFACE_SHADOW']),
      );
      expect(assessment.preservedLayerDigests['PRODUCT_HERO']).toBe(mockProductSha);
      expect(assessment.preservedLayerDigests['BACKGROUND']).toBeUndefined();
    });

    it('3.4 PRODUCT_PLACEMENT / SCALE: invalidates layout geometry; strictly preserves CONTENT_APPROVED copy and background digest', () => {
      const assessment = engine.assessInvalidation({
        mutations: [
          {
            target: RevisionTargetType.PRODUCT_PLACEMENT,
            fieldName: 'placement',
            requestedValue: 'CENTER',
          },
          {
            target: RevisionTargetType.PRODUCT_SCALE,
            fieldName: 'productScale',
            requestedValue: 0.85,
          },
        ],
        currentDigests: digests,
      });

      expect(assessment.invalidatedGateCodes).toEqual(
        expect.arrayContaining([
          HardGateCode.GATE_SAFE_MARGIN_VIOLATION,
          HardGateCode.GATE_CTA_HERO_COLLISION,
          HardGateCode.GATE_PRODUCT_ALPHA_CLIPPED,
          HardGateCode.GATE_PRODUCT_VISIBILITY_LOW,
        ]),
      );

      expect(assessment.preservedGateCodes).toEqual(
        expect.arrayContaining([
          HardGateCode.GATE_UNSAFE_UNICODE,
          HardGateCode.GATE_MISSING_GLYPHS,
          HardGateCode.GATE_FACTUAL_PRICE_MISMATCH,
        ]),
      );

      expect(assessment.invalidatedApprovalDomains).toEqual([
        ApprovalDomain.VISUAL_APPROVED,
        ApprovalDomain.EXPORT_APPROVED,
      ]);
      expect(assessment.preservedApprovalDomains).toContain(ApprovalDomain.CONTENT_APPROVED);

      expect(assessment.preservedLayerDigests['BACKGROUND']).toBe(mockBgSha);
    });

    it('3.5 PRODUCT_ASSET: invalidates product truth gates; strictly preserves background digest and content copy', () => {
      const assessment = engine.assessInvalidation({
        mutations: [
          {
            target: RevisionTargetType.PRODUCT_ASSET,
            fieldName: 'productAssetDigest',
            requestedValue: 'new-product-cutout-sha',
          },
        ],
        currentDigests: digests,
      });

      expect(assessment.invalidatedGateCodes).toEqual(
        expect.arrayContaining([
          HardGateCode.GATE_PLACEHOLDER_REJECTED,
          HardGateCode.GATE_PRODUCT_ALPHA_CLIPPED,
          HardGateCode.GATE_PRODUCT_VISIBILITY_LOW,
        ]),
      );

      expect(assessment.preservedApprovalDomains).toContain(ApprovalDomain.CONTENT_APPROVED);
      expect(assessment.preservedLayerDigests['BACKGROUND']).toBe(mockBgSha);
    });

    it('3.6 TEMPLATE LAYOUT SWAP: invalidates contrast and layout geometry; preserves background and re-layouts product hero', () => {
      const assessment = engine.assessInvalidation({
        mutations: [
          {
            target: RevisionTargetType.TEMPLATE,
            fieldName: 'templateId',
            requestedValue: 'EDITORIAL_SPLIT',
          },
        ],
        currentDigests: digests,
      });

      expect(assessment.invalidatedGateCodes).toEqual(
        expect.arrayContaining([
          HardGateCode.GATE_TEXT_CONTRAST_LOW,
          HardGateCode.GATE_SAFE_MARGIN_VIOLATION,
          HardGateCode.GATE_CTA_HERO_COLLISION,
        ]),
      );

      expect(assessment.preservedApprovalDomains).toContain(ApprovalDomain.CONTENT_APPROVED);
      expect(assessment.affectedLayerGroups).toContain('PRODUCT_HERO');
      expect(assessment.preservedLayerDigests['BACKGROUND']).toBe(mockBgSha);
    });

    it('3.7 Multi-Target Compound Mutation (HEADLINE + STYLE_PRESET): unions invalidation sets and computes precise intersection', () => {
      const assessment = engine.assessInvalidation({
        mutations: [
          {
            target: RevisionTargetType.HEADLINE,
            fieldName: 'headline',
            requestedValue: 'Compound Headline',
          },
          {
            target: RevisionTargetType.STYLE_PRESET,
            fieldName: 'stylePreset',
            requestedValue: 'NOCTURNE_OBSIDIAN',
          },
        ],
        currentDigests: digests,
      });

      // Both typography and background gates are invalidated
      expect(assessment.invalidatedGateCodes).toEqual(
        expect.arrayContaining([
          HardGateCode.GATE_TEXT_CONTRAST_LOW,
          HardGateCode.GATE_UNSAFE_UNICODE,
          HardGateCode.GATE_MISSING_GLYPHS,
          HardGateCode.GATE_CONTAINER_INVALID,
        ]),
      );

      // Product authenticity remains preserved
      expect(assessment.preservedGateCodes).toEqual(
        expect.arrayContaining([
          HardGateCode.GATE_PLACEHOLDER_REJECTED,
          HardGateCode.GATE_PRODUCT_ALPHA_CLIPPED,
          HardGateCode.GATE_PRODUCT_VISIBILITY_LOW,
        ]),
      );

      // Content approval is invalidated because headline changed
      expect(assessment.invalidatedApprovalDomains).toEqual([
        ApprovalDomain.CONTENT_APPROVED,
        ApprovalDomain.VISUAL_APPROVED,
        ApprovalDomain.EXPORT_APPROVED,
      ]);

      // Both TYPOGRAPHY and BACKGROUND affected, PRODUCT_HERO preserved
      expect(assessment.affectedLayerGroups).toEqual(
        expect.arrayContaining(['TYPOGRAPHY', 'BACKGROUND']),
      );
      expect(assessment.preservedLayerDigests['PRODUCT_HERO']).toBe(mockProductSha);
      expect(assessment.preservedLayerDigests['BACKGROUND']).toBeUndefined();
    });
  });

  // =========================================================================
  // VECTOR 4: CRYPTOGRAPHIC ZERO-DRIFT LAYER TAMPER DETECTION
  // =========================================================================
  describe('Vector 4: Cryptographic Zero-Drift Layer Tamper Detection', () => {
    it('throws LayerDriftViolationError when non-targeted layer hash diverges, maintaining transactional atomicity', async () => {
      const harness = createAdversarialHarness();

      // Create a corrupted plan claiming background is intact, but providing a tampered digest
      const tamperedPlan = createPlan({
        baseVersionNumber: 1,
        rawInstruction: 'Headline: Royale Rose',
        executionStrategy: RevisionExecutionStrategy.ZERO_AI_COMPOSITE,
        mutations: [
          {
            target: RevisionTargetType.HEADLINE,
            fieldName: 'headline',
            previousValue: 'Parisian Elegance',
            requestedValue: 'Royale Rose',
          },
        ],
        preservedLayerDigests: {
          PRODUCT_HERO: mockProductSha,
          BACKGROUND: 'tampered-sha256-non-matching-digest-12345',
        },
      });

      await expect(
        harness.revisePoster.executePlan({
          creativeJobId: harness.currentJob.id,
          plan: tamperedPlan,
          actorUserId: 'user-editor',
          actorRoles: [RoleCode.MARKETING_APPROVER],
        }),
      ).rejects.toThrow(LayerDriftViolationError);

      // Invariant: Atomicity preserved - no corrupted VisualAsset committed
      expect(harness.assets.length).toBe(1);
      expect(harness.assets[0]!.versionNumber).toBe(1);
    });

    it('throws LayerDriftViolationError when hero product cutout hash drifts during layout revision', async () => {
      const harness = createAdversarialHarness();

      const tamperedHeroPlan = createPlan({
        baseVersionNumber: 1,
        rawInstruction: 'Align product: left',
        executionStrategy: RevisionExecutionStrategy.ZERO_AI_COMPOSITE,
        mutations: [
          {
            target: RevisionTargetType.PRODUCT_PLACEMENT,
            fieldName: 'placement',
            previousValue: 'CENTER',
            requestedValue: 'LEFT',
          },
        ],
        preservedLayerDigests: {
          PRODUCT_HERO: 'tampered-hero-cutout-sha256-corrupted',
          BACKGROUND: mockBgSha,
        },
      });

      await expect(
        harness.revisePoster.executePlan({
          creativeJobId: harness.currentJob.id,
          plan: tamperedHeroPlan,
          actorUserId: 'user-editor',
          actorRoles: [RoleCode.MARKETING_APPROVER],
        }),
      ).rejects.toThrow(LayerDriftViolationError);

      expect(harness.assets.length).toBe(1);
    });
  });
});
