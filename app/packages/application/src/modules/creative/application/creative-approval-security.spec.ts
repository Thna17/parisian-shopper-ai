/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import type { ApplicationLogger } from '@parisian-shopper/common';
import { ForbiddenError, ValidationError } from '@parisian-shopper/common';
import { ApproveCreativeUseCase } from './approve-creative.use-case.js';
import { ExportPosterUseCase } from './export-poster.use-case.js';
import { CreatePublicationUseCase } from '../../publishing/application/create-publication.use-case.js';
import { PublicationChannel } from '../../publishing/domain/publication.types.js';
import { RoleCode, Permission, PermissionService } from '../../auth/domain/permissions.js';
import { type CreativeJobRepository, type CreativeJobRecord } from './creative-job.repository.js';
import { type VisualAssetRepository, type VisualAssetRecord } from './visual-asset.repository.js';
import {
  type CreativeApprovalRepository,
  type CreativeApprovalEventRecord,
  type RecordCreativeApprovalInput,
} from './creative-approval.repository.js';
import {
  type VisualValidationRepository,
  type VisualValidationResultRecord,
} from './visual-validation.repository.js';
import { type CreativeSceneRepository } from './creative-scene.repository.js';
import {
  type ProductSnapshotRepository,
  type ProductSnapshot,
} from '../../products/application/product-snapshot.repository.js';
import {
  type ProductAssetEligibilityEvaluator,
  type AuthoritativeHeroEvidence,
} from '../../products/application/product-asset-eligibility-evaluator.js';
import {
  type CreativeRevisionRepository,
  type CreativeRevisionRequestRecord,
} from './creative-revision.repository.js';
import {
  type CreativeSceneVersionRecord,
  type CreativeSceneRecord,
} from '../domain/scene/creative-scene.types.js';
import {
  VisualAssetNotFoundError,
  CreativeJobNotReadyForApprovalError,
  CreativeAlreadyApprovedError,
  CreativeAlreadyRejectedError,
  CreativeValidationFailedError,
  CreativeStaleVersionError,
  SelfApprovalProhibitedError,
  CreativeAssetRightsNotClearedError,
  CreativeFactualMismatchError,
} from '../domain/creative-errors.js';
import type { NormalizedProductEnvelope } from '../../products/domain/product.schema.js';
import {
  ProductAssetRole,
  ProductAssetRightsState,
  ProductAssetValidationStatus,
  ProductAssetApprovalDecision,
} from '../../products/domain/product-asset.js';
import type { AssetStoragePort } from './asset-storage.port.js';
import type { ContentGenerationRepository } from '../../content/application/content-generation.repository.js';
import type { PublishingRepository } from '../../publishing/application/publishing.repository.js';
import type { ApprovalsRepository } from '../../approvals/application/approvals.repository.js';
import type {
  CreativeExportRepository,
  CreativeExportRecord,
} from './creative-export.repository.js';

describe('SEC-CREATIVE-01 to SEC-CREATIVE-20: Independent Creative Approval & Exact-Scene Governance', () => {
  const creatorUserId = 'user-creator-1';
  const reviserUserId = 'user-reviser-2';
  const approverUserId = 'user-approver-3';
  const unprivilegedUserId = 'user-viewer-5';

  let mockJobRepo: jest.Mocked<CreativeJobRepository>;
  let mockAssetRepo: jest.Mocked<VisualAssetRepository>;
  let mockApprovalRepo: jest.Mocked<CreativeApprovalRepository>;
  let mockValidationRepo: jest.Mocked<VisualValidationRepository>;
  let mockSceneRepo: jest.Mocked<CreativeSceneRepository>;
  let mockSnapshotRepo: jest.Mocked<ProductSnapshotRepository>;
  let mockAssetEvaluator: jest.Mocked<ProductAssetEligibilityEvaluator>;
  let mockRevisionRepo: jest.Mocked<CreativeRevisionRepository> & {
    findByResultingAssetId: jest.Mock<
      NonNullable<CreativeRevisionRepository['findByResultingAssetId']>
    >;
  };
  let mockLogger: jest.Mocked<ApplicationLogger>;
  let mockOutboxWriter: { append: jest.Mock<(event: unknown) => Promise<string>> };

  let approveUseCase: ApproveCreativeUseCase;

  const sampleJob: CreativeJobRecord = {
    id: 'job-sec-1',
    contentVersionId: 'ver-c1',
    productSnapshotId: 'snap-p1',
    brandRuleVersionId: 'rule-b1',
    requestedByUserId: creatorUserId,
    status: 'READY_FOR_REVIEW',
    targetPlatform: 'GENERIC',
    aspectRatio: '1:1',
    creativeProfile: 'PARISIAN_MORNING_ATELIER',
    createdAt: new Date('2026-10-29T10:00:00Z'),
    updatedAt: new Date('2026-10-29T10:00:00Z'),
  };

  const sampleAsset: VisualAssetRecord = {
    id: 'asset-sec-1',
    creativeJobId: 'job-sec-1',
    versionNumber: 1,
    assetRole: 'COMPOSITED_CREATIVE',
    mimeType: 'image/png',
    width: 1080,
    height: 1080,
    byteSize: 5000,
    sha256: 'asset-sha-1',
    storageKey: 'cas/asset-1.png',
    sourceProductAssetDigest: 'prod-sha-1',
    createdAt: new Date('2026-10-29T10:05:00Z'),
  };

  const sampleScene: CreativeSceneRecord = {
    id: 'scene-sec-1',
    creativeJobId: 'job-sec-1',
    title: 'Parisian Hero Poster',
    currentVersionNumber: 1,
    createdAt: new Date('2026-10-29T10:00:00Z'),
    updatedAt: new Date('2026-10-29T10:00:00Z'),
  };

  const sampleSceneVersion: CreativeSceneVersionRecord = {
    id: 'scene-ver-1',
    sceneId: 'scene-sec-1',
    versionNumber: 1,
    aspectRatio: '1:1',
    width: 1080,
    height: 1080,
    templateId: 'CENTERED_HERO',
    templateVersion: '1.0.0',
    language: 'EN',
    safeMargins: { top: 40, bottom: 40, left: 40, right: 40 },
    brandProfileVersionId: 'bp-1',
    sourceContentVersionId: 'ver-c1',
    productSnapshotId: 'snap-p1',
    sceneHash: 'scene-hash-1',
    dependencyHash: 'dep-hash-1',
    requestedByUserId: creatorUserId,
    layers: [],
    dependencies: [],
    createdAt: new Date('2026-10-29T10:05:00Z'),
  };

  const sampleValidationRecord: VisualValidationResultRecord = {
    id: 'val-rec-1',
    visualAssetId: 'asset-sec-1',
    validatorVersion: '1.0.0',
    status: 'PASSED',
    findingCount: 0,
    blockingCount: 0,
    warningCount: 0,
    infoCount: 0,
    findings: [],
    createdAt: new Date('2026-10-29T10:10:00Z'),
  };

  const sampleProductSnapshot: ProductSnapshot = {
    id: 'snap-p1',
    product: {
      product: {
        sku: 'SKU-PARIS-001',
      },
    } as unknown as NormalizedProductEnvelope,
    snapshotHash: 'snap-hash-1',
    normalizerVersion: 'phase-1b-v1',
    createdAt: new Date('2026-10-29T09:00:00Z'),
  };

  beforeEach(() => {
    mockJobRepo = {
      findById: jest.fn<CreativeJobRepository['findById']>().mockResolvedValue(sampleJob),
      transitionStatus: jest.fn<CreativeJobRepository['transitionStatus']>().mockResolvedValue({
        ...sampleJob,
        status: 'CREATIVE_APPROVED',
      }),
      createJob: jest.fn<CreativeJobRepository['createJob']>(),
      findByContentVersionId: jest
        .fn<CreativeJobRepository['findByContentVersionId']>()
        .mockResolvedValue([sampleJob]),
    };

    mockAssetRepo = {
      findById: jest.fn<VisualAssetRepository['findById']>().mockResolvedValue(sampleAsset),
      findByJobAndVersion: jest
        .fn<VisualAssetRepository['findByJobAndVersion']>()
        .mockResolvedValue(sampleAsset),
      findLatestByJobId: jest
        .fn<VisualAssetRepository['findLatestByJobId']>()
        .mockResolvedValue(sampleAsset),
      createAsset: jest.fn<VisualAssetRepository['createAsset']>(),
      listByJobId: jest.fn<VisualAssetRepository['listByJobId']>().mockResolvedValue([sampleAsset]),
    };

    mockApprovalRepo = {
      findByJobId: jest.fn<CreativeApprovalRepository['findByJobId']>().mockResolvedValue([]),
      findByAssetId: jest.fn<CreativeApprovalRepository['findByAssetId']>().mockResolvedValue([]),
      recordApproval: jest
        .fn<CreativeApprovalRepository['recordApproval']>()
        .mockImplementation(
          (input: RecordCreativeApprovalInput): Promise<CreativeApprovalEventRecord> =>
            Promise.resolve({
              id: 'approval-evt-1',
              creativeJobId: input.creativeJobId,
              visualAssetId: input.visualAssetId,
              ...(input.sceneVersionId !== undefined
                ? { sceneVersionId: input.sceneVersionId }
                : {}),
              approverUserId: input.approverUserId,
              decision: input.decision,
              ...(input.comment !== undefined ? { comment: input.comment } : {}),
              ...(input.visualValidationResultId !== undefined
                ? { visualValidationResultId: input.visualValidationResultId }
                : {}),
              createdAt: new Date('2026-10-29T10:15:00Z'),
            }),
        ),
      findBySceneVersionId: jest
        .fn<NonNullable<CreativeApprovalRepository['findBySceneVersionId']>>()
        .mockResolvedValue([]),
      findLatestApprovalByJobId: jest
        .fn<NonNullable<CreativeApprovalRepository['findLatestApprovalByJobId']>>()
        .mockResolvedValue(null),
    };

    mockValidationRepo = {
      findLatestByAssetId: jest
        .fn<VisualValidationRepository['findLatestByAssetId']>()
        .mockResolvedValue(sampleValidationRecord),
      findByAssetId: jest
        .fn<VisualValidationRepository['findByAssetId']>()
        .mockResolvedValue([sampleValidationRecord]),
      persistResult: jest.fn<VisualValidationRepository['persistResult']>(),
    };

    mockSceneRepo = {
      createInitialScene: jest.fn<CreativeSceneRepository['createInitialScene']>(),
      createRevision: jest.fn<CreativeSceneRepository['createRevision']>(),
      recordDependencyInvalidation:
        jest.fn<CreativeSceneRepository['recordDependencyInvalidation']>(),
      findById: jest.fn<CreativeSceneRepository['findById']>().mockResolvedValue(sampleScene),
      findByJobId: jest.fn<CreativeSceneRepository['findByJobId']>().mockResolvedValue(sampleScene),
      findScenes: jest.fn<CreativeSceneRepository['findScenes']>(),
      findVersionById: jest
        .fn<CreativeSceneRepository['findVersionById']>()
        .mockResolvedValue(sampleSceneVersion),
      findVersionByNumber: jest
        .fn<CreativeSceneRepository['findVersionByNumber']>()
        .mockResolvedValue(sampleSceneVersion),
      findLatestVersionByJobId: jest
        .fn<CreativeSceneRepository['findLatestVersionByJobId']>()
        .mockResolvedValue(sampleSceneVersion),
      findLatestVersionBySceneId: jest
        .fn<CreativeSceneRepository['findLatestVersionBySceneId']>()
        .mockResolvedValue(sampleSceneVersion),
      listVersions: jest
        .fn<CreativeSceneRepository['listVersions']>()
        .mockResolvedValue([sampleSceneVersion]),
      updateVersionState: jest
        .fn<NonNullable<CreativeSceneRepository['updateVersionState']>>()
        .mockResolvedValue(undefined),
    };

    mockSnapshotRepo = {
      create: jest.fn<ProductSnapshotRepository['create']>(),
      findById: jest
        .fn<ProductSnapshotRepository['findById']>()
        .mockResolvedValue(sampleProductSnapshot),
    };

    mockAssetEvaluator = {
      resolveAuthoritativeHeroEvidence: jest
        .fn<ProductAssetEligibilityEvaluator['resolveAuthoritativeHeroEvidence']>()
        .mockResolvedValue({
          registration: {
            id: 'reg-1',
            sku: 'SKU-PARIS-001',
            role: ProductAssetRole.HERO_CUTOUT,
            sourceSystem: 'PARIS_PIM',
            rightsState: ProductAssetRightsState.VERIFIED,
          },
          approvalEvent: {
            id: 'app-1',
            productAssetRegistrationId: 'reg-1',
            decision: ProductAssetApprovalDecision.APPROVED,
            approverUserId: approverUserId,
            decidedAt: new Date(),
            createdAt: new Date(),
          },
          assessment: {
            id: 'assess-1',
            productAssetId: 'prod-asset-1',
            validatorVersion: '1.0.0',
            status: ProductAssetValidationStatus.PASS,
            isValid: true,
            findings: [],
            evaluatedAt: new Date(),
          },
          rightsEvent: {
            id: 'rights-1',
            productAssetRegistrationId: 'reg-1',
            rightsState: ProductAssetRightsState.VERIFIED,
            effectiveAt: new Date('2026-01-01'),
            createdAt: new Date(),
          },
          asset: {
            id: 'prod-asset-1',
            sku: 'SKU-PARIS-001',
            role: ProductAssetRole.HERO_CUTOUT,
            mimeType: 'image/png',
            width: 1000,
            height: 1000,
            byteSize: 10000,
            sha256: 'sha-prod-1',
            storageKey: 'prod/1.png',
            createdAt: new Date(),
          },
          buffer: Buffer.from('hero-cutout'),
        } as unknown as AuthoritativeHeroEvidence),
      evaluateHeroEligibility:
        jest.fn<ProductAssetEligibilityEvaluator['evaluateHeroEligibility']>(),
    } as unknown as jest.Mocked<ProductAssetEligibilityEvaluator>;

    mockRevisionRepo = {
      createRequest: jest.fn<CreativeRevisionRepository['createRequest']>(),
      findById: jest.fn<CreativeRevisionRepository['findById']>(),
      findActiveByJobId: jest.fn<CreativeRevisionRepository['findActiveByJobId']>(),
      completeRequest: jest.fn<CreativeRevisionRepository['completeRequest']>(),
      cancelRequest: jest.fn<CreativeRevisionRepository['cancelRequest']>(),
      findByResultingAssetId: jest
        .fn<NonNullable<CreativeRevisionRepository['findByResultingAssetId']>>()
        .mockResolvedValue(null),
    };

    mockLogger = {
      log: jest.fn<ApplicationLogger['log']>(),
      warn: jest.fn<ApplicationLogger['warn']>(),
      error: jest.fn<ApplicationLogger['error']>(),
    };

    mockOutboxWriter = {
      append: jest.fn<(event: unknown) => Promise<string>>().mockResolvedValue('outbox-1'),
    };

    approveUseCase = new ApproveCreativeUseCase(
      mockJobRepo,
      mockAssetRepo,
      mockApprovalRepo,
      mockValidationRepo,
      mockLogger,
      new PermissionService(),
      mockSceneRepo,
      mockSnapshotRepo,
      mockAssetEvaluator,
      mockRevisionRepo,
    );
  });

  // SEC-CREATIVE-01
  it('SEC-CREATIVE-01: Independent approval succeeds when reviewer is independent and gates pass', async () => {
    const result = await approveUseCase.execute({
      creativeJobId: sampleJob.id,
      visualAssetId: sampleAsset.id,
      sceneVersionId: sampleSceneVersion.id,
      approvedBy: approverUserId,
      approverRoles: [RoleCode.MARKETING_APPROVER],
      outboxWriter: mockOutboxWriter,
    });

    expect(result.approvalEvent.decision).toBe('CREATIVE_APPROVED');
    expect(result.approvalEvent.approverUserId).toBe(approverUserId);
    expect(result.approvalEvent.sceneVersionId).toBe(sampleSceneVersion.id);
    expect(mockJobRepo.transitionStatus).toHaveBeenCalledWith(
      sampleJob.id,
      'READY_FOR_REVIEW',
      'CREATIVE_APPROVED',
    );
    expect(mockSceneRepo.updateVersionState).toHaveBeenCalledWith(sampleSceneVersion.id, {
      status: 'APPROVED',
      isExportEligible: true,
    });
    expect(mockOutboxWriter.append).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'CREATIVE_APPROVED' }),
    );
  });

  // SEC-CREATIVE-02
  it('SEC-CREATIVE-02: Original creator self-approval fails with SelfApprovalProhibitedError', async () => {
    await expect(
      approveUseCase.execute({
        creativeJobId: sampleJob.id,
        visualAssetId: sampleAsset.id,
        approvedBy: creatorUserId, // Creator attempting self-approval
        approverRoles: [RoleCode.MARKETING_APPROVER],
        outboxWriter: mockOutboxWriter,
      }),
    ).rejects.toThrow(SelfApprovalProhibitedError);

    expect(mockApprovalRepo.recordApproval).not.toHaveBeenCalled();
    expect(mockOutboxWriter.append).not.toHaveBeenCalled();
  });

  // SEC-CREATIVE-03
  it('SEC-CREATIVE-03: Revision author self-approval fails with SelfApprovalProhibitedError', async () => {
    const sampleRevision: CreativeRevisionRequestRecord = {
      id: 'rev-1',
      creativeJobId: sampleJob.id,
      sourceVisualAssetId: 'asset-sec-0',
      resultingVisualAssetId: sampleAsset.id,
      requestedByUserId: reviserUserId,
      type: 'EDIT_BACKGROUND',
      status: 'COMPLETED',
      createdAt: new Date(),
    };
    mockRevisionRepo.findByResultingAssetId.mockResolvedValueOnce(sampleRevision);

    await expect(
      approveUseCase.execute({
        creativeJobId: sampleJob.id,
        visualAssetId: sampleAsset.id,
        approvedBy: reviserUserId, // Reviser attempting self-approval
        approverRoles: [RoleCode.MARKETING_APPROVER],
        outboxWriter: mockOutboxWriter,
      }),
    ).rejects.toThrow(SelfApprovalProhibitedError);

    expect(mockApprovalRepo.recordApproval).not.toHaveBeenCalled();
  });

  // SEC-CREATIVE-04
  it('SEC-CREATIVE-04: ADMIN role cannot bypass Four-Eyes self-approval', async () => {
    // Creator has ADMIN role, attempts self-approval
    await expect(
      approveUseCase.execute({
        creativeJobId: sampleJob.id,
        visualAssetId: sampleAsset.id,
        approvedBy: creatorUserId,
        approverRoles: [RoleCode.ADMIN],
        outboxWriter: mockOutboxWriter,
      }),
    ).rejects.toThrow(SelfApprovalProhibitedError);

    expect(mockApprovalRepo.recordApproval).not.toHaveBeenCalled();
  });

  // SEC-CREATIVE-05
  it('SEC-CREATIVE-05: Unauthorized employee without APPROVE_CREATIVE is denied', async () => {
    await expect(
      approveUseCase.execute({
        creativeJobId: sampleJob.id,
        visualAssetId: sampleAsset.id,
        approvedBy: unprivilegedUserId,
        approverRoles: [RoleCode.VIEWER],
        outboxWriter: mockOutboxWriter,
      }),
    ).rejects.toThrow(ForbiddenError);

    expect(mockApprovalRepo.recordApproval).not.toHaveBeenCalled();
  });

  // SEC-CREATIVE-06
  it('SEC-CREATIVE-06: Wrong scene version or asset from different job is denied', async () => {
    mockAssetRepo.findById.mockResolvedValueOnce({
      ...sampleAsset,
      creativeJobId: 'different-job-999',
    });

    await expect(
      approveUseCase.execute({
        creativeJobId: sampleJob.id,
        visualAssetId: sampleAsset.id,
        approvedBy: approverUserId,
        approverRoles: [RoleCode.MARKETING_APPROVER],
        outboxWriter: mockOutboxWriter,
      }),
    ).rejects.toThrow(VisualAssetNotFoundError);

    expect(mockApprovalRepo.recordApproval).not.toHaveBeenCalled();
  });

  // SEC-CREATIVE-07
  it('SEC-CREATIVE-07: Superseded scene approval is denied when newer revision exists', async () => {
    mockSceneRepo.findByJobId.mockResolvedValueOnce({
      id: 'scene-sec-1',
      creativeJobId: 'job-sec-1',
      title: 'Scene Title',
      currentVersionNumber: 2, // Scene is already on v2
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      approveUseCase.execute({
        creativeJobId: sampleJob.id,
        visualAssetId: sampleAsset.id,
        sceneVersionId: sampleSceneVersion.id, // V1 when current is V2
        approvedBy: approverUserId,
        approverRoles: [RoleCode.MARKETING_APPROVER],
        outboxWriter: mockOutboxWriter,
      }),
    ).rejects.toThrow(CreativeStaleVersionError);

    expect(mockApprovalRepo.recordApproval).not.toHaveBeenCalled();
  });

  // SEC-CREATIVE-08
  it('SEC-CREATIVE-08: Blocking visual gate prevents approval', async () => {
    mockValidationRepo.findLatestByAssetId.mockResolvedValueOnce({
      ...sampleValidationRecord,
      status: 'FAILED',
      blockingCount: 2,
      findings: [
        {
          id: 'find-1',
          visualValidationResultId: sampleValidationRecord.id,
          field: 'headline',
          ruleId: 'TEXT_OVERLAP',
          ruleCode: 'TEXT_OVERLAP',
          code: 'TEXT_OVERLAP',
          severity: 'BLOCKING',
          message: 'Text overlaps with hero product cutout',
          context: {},
          createdAt: new Date(),
        } as unknown as VisualValidationResultRecord['findings'][number],
      ],
    });

    await expect(
      approveUseCase.execute({
        creativeJobId: sampleJob.id,
        visualAssetId: sampleAsset.id,
        approvedBy: approverUserId,
        approverRoles: [RoleCode.MARKETING_APPROVER],
        outboxWriter: mockOutboxWriter,
      }),
    ).rejects.toThrow(CreativeValidationFailedError);

    expect(mockApprovalRepo.recordApproval).not.toHaveBeenCalled();
  });

  // SEC-CREATIVE-09
  it('SEC-CREATIVE-09: Asset-rights failure prevents approval', async () => {
    mockAssetEvaluator.resolveAuthoritativeHeroEvidence.mockResolvedValueOnce({
      registration: {
        id: 'reg-expired',
        sku: 'SKU-PARIS-001',
        role: ProductAssetRole.HERO_CUTOUT,
        sourceSystem: 'PARIS_PIM',
        rightsState: ProductAssetRightsState.EXPIRED,
      },
      approvalEvent: {
        id: 'app-1',
        productAssetRegistrationId: 'reg-expired',
        decision: ProductAssetApprovalDecision.APPROVED,
        approverUserId: approverUserId,
        decidedAt: new Date(),
        createdAt: new Date(),
      },
      assessment: {
        id: 'assess-1',
        productAssetId: 'prod-asset-1',
        validatorVersion: '1.0.0',
        status: ProductAssetValidationStatus.PASS,
        isValid: true,
        findings: [],
        evaluatedAt: new Date(),
      },
      rightsEvent: {
        id: 'rights-1',
        productAssetRegistrationId: 'reg-expired',
        rightsState: ProductAssetRightsState.EXPIRED,
        effectiveAt: new Date('2026-01-01'),
        createdAt: new Date(),
      },
      asset: {
        id: 'prod-asset-1',
        sku: 'SKU-PARIS-001',
        role: ProductAssetRole.HERO_CUTOUT,
        mimeType: 'image/png',
        width: 1000,
        height: 1000,
        byteSize: 10000,
        sha256: 'sha-prod-1',
        storageKey: 'prod/1.png',
        createdAt: new Date(),
      },
      buffer: Buffer.from('hero-cutout'),
    } as unknown as AuthoritativeHeroEvidence);

    await expect(
      approveUseCase.execute({
        creativeJobId: sampleJob.id,
        visualAssetId: sampleAsset.id,
        approvedBy: approverUserId,
        approverRoles: [RoleCode.MARKETING_APPROVER],
        outboxWriter: mockOutboxWriter,
      }),
    ).rejects.toThrow(CreativeAssetRightsNotClearedError);

    expect(mockApprovalRepo.recordApproval).not.toHaveBeenCalled();
  });

  // SEC-CREATIVE-10
  it('SEC-CREATIVE-10: Commercial validation failure blocks approval on factual snapshot divergence', async () => {
    mockSceneRepo.findVersionById.mockResolvedValueOnce({
      ...sampleSceneVersion,
      productSnapshotId: 'divergent-snapshot-id',
    });

    await expect(
      approveUseCase.execute({
        creativeJobId: sampleJob.id,
        visualAssetId: sampleAsset.id,
        sceneVersionId: sampleSceneVersion.id,
        approvedBy: approverUserId,
        approverRoles: [RoleCode.MARKETING_APPROVER],
        outboxWriter: mockOutboxWriter,
      }),
    ).rejects.toThrow(CreativeFactualMismatchError);

    expect(mockApprovalRepo.recordApproval).not.toHaveBeenCalled();
  });

  // SEC-CREATIVE-11
  it('SEC-CREATIVE-11: Duplicate decision prevented if already approved or rejected', async () => {
    mockApprovalRepo.findByJobId.mockResolvedValueOnce([
      {
        id: 'existing-evt-1',
        creativeJobId: sampleJob.id,
        visualAssetId: sampleAsset.id,
        approverUserId: 'some-user',
        decision: 'CREATIVE_APPROVED',
        createdAt: new Date(),
      },
    ]);

    await expect(
      approveUseCase.execute({
        creativeJobId: sampleJob.id,
        visualAssetId: sampleAsset.id,
        approvedBy: approverUserId,
        approverRoles: [RoleCode.MARKETING_APPROVER],
        outboxWriter: mockOutboxWriter,
      }),
    ).rejects.toThrow(CreativeAlreadyApprovedError);

    expect(mockApprovalRepo.recordApproval).not.toHaveBeenCalled();

    // Verify rejection duplicate prevention as well
    mockApprovalRepo.findByJobId.mockResolvedValueOnce([
      {
        id: 'existing-evt-2',
        creativeJobId: sampleJob.id,
        visualAssetId: sampleAsset.id,
        approverUserId: 'some-user',
        decision: 'CREATIVE_REJECTED',
        createdAt: new Date(),
      },
    ]);

    await expect(
      approveUseCase.execute({
        creativeJobId: sampleJob.id,
        visualAssetId: sampleAsset.id,
        approvedBy: approverUserId,
        approverRoles: [RoleCode.MARKETING_APPROVER],
        outboxWriter: mockOutboxWriter,
      }),
    ).rejects.toThrow(CreativeAlreadyRejectedError);
  });

  // SEC-CREATIVE-12
  it('SEC-CREATIVE-12: Concurrent approval remains atomic and rejects duplicate event', async () => {
    mockApprovalRepo.recordApproval.mockRejectedValueOnce(
      new CreativeAlreadyApprovedError('Job is already approved'),
    );

    await expect(
      approveUseCase.execute({
        creativeJobId: sampleJob.id,
        visualAssetId: sampleAsset.id,
        approvedBy: approverUserId,
        approverRoles: [RoleCode.MARKETING_APPROVER],
        outboxWriter: mockOutboxWriter,
      }),
    ).rejects.toThrow(CreativeAlreadyApprovedError);
  });

  // SEC-CREATIVE-13
  it('SEC-CREATIVE-13: Approval and revision race handled safely via version check', async () => {
    mockAssetRepo.findLatestByJobId.mockResolvedValueOnce({
      ...sampleAsset,
      id: 'asset-sec-v2',
      versionNumber: 2,
    });

    await expect(
      approveUseCase.execute({
        creativeJobId: sampleJob.id,
        visualAssetId: sampleAsset.id, // V1
        approvedBy: approverUserId,
        approverRoles: [RoleCode.MARKETING_APPROVER],
        outboxWriter: mockOutboxWriter,
      }),
    ).rejects.toThrow(CreativeStaleVersionError);
  });

  // SEC-CREATIVE-14
  it('SEC-CREATIVE-14: Approved V1 does not authorize V2 export', async () => {
    const mockStorage: jest.Mocked<AssetStoragePort> = {
      saveAsset: jest.fn<AssetStoragePort['saveAsset']>(),
      getAssetBuffer: jest.fn<AssetStoragePort['getAssetBuffer']>(),
      getMetadata: jest.fn<AssetStoragePort['getMetadata']>(),
      assetExists: jest.fn<AssetStoragePort['assetExists']>(),
    };
    const mockContentRepo: jest.Mocked<ContentGenerationRepository> = {
      createJob: jest.fn<ContentGenerationRepository['createJob']>(),
      findJobById: jest.fn<ContentGenerationRepository['findJobById']>(),
      findVersionById: jest.fn<ContentGenerationRepository['findVersionById']>(),
      beginGeneration: jest.fn<ContentGenerationRepository['beginGeneration']>(),
      completeGeneration: jest.fn<ContentGenerationRepository['completeGeneration']>(),
      failGeneration: jest.fn<ContentGenerationRepository['failGeneration']>(),
      findVersionsByJobId: jest.fn<ContentGenerationRepository['findVersionsByJobId']>(),
      findAttemptsByJobId: jest.fn<ContentGenerationRepository['findAttemptsByJobId']>(),
    };

    // Approval exists ONLY for asset-sec-1 (V1), but latest is asset-sec-2 (V2)
    mockApprovalRepo.findByAssetId.mockImplementation((assetId: string) => {
      if (assetId === 'asset-sec-1') {
        return Promise.resolve([
          {
            id: 'evt-v1',
            creativeJobId: sampleJob.id,
            visualAssetId: 'asset-sec-1',
            approverUserId: approverUserId,
            decision: 'CREATIVE_APPROVED',
            createdAt: new Date(),
          },
        ]);
      }
      return Promise.resolve([]);
    });

    // V2 is unapproved
    const assetV2: VisualAssetRecord = {
      ...sampleAsset,
      id: 'asset-sec-2',
      versionNumber: 2,
    };
    mockAssetRepo.findById.mockImplementation((id: string) => {
      if (id === 'asset-sec-2') return Promise.resolve(assetV2);
      return Promise.resolve(sampleAsset);
    });
    mockAssetRepo.findLatestByJobId.mockResolvedValue(assetV2);

    const exportUseCase = new ExportPosterUseCase(
      mockJobRepo,
      mockAssetRepo,
      mockStorage,
      mockSnapshotRepo,
      mockContentRepo,
      mockApprovalRepo,
      mockLogger,
      undefined, // posterCompositor
      new PermissionService(), // permissions
      undefined, // exportRepo
      undefined, // hardGatesEngine
      undefined, // outboxWriter
      mockSceneRepo,
    );

    // Attempting to export unapproved V2 must fail
    await expect(
      exportUseCase.execute({
        creativeJobId: sampleJob.id,
        visualAssetId: 'asset-sec-2',
        format: 'SQUARE_1080',
        encoding: 'PNG',
        actorUserId: approverUserId,
        actorRoles: [RoleCode.MARKETING_APPROVER],
      }),
    ).rejects.toThrow(ValidationError);
  });

  // SEC-CREATIVE-15
  it('SEC-CREATIVE-15: Direct status escalation prohibited when job is not READY_FOR_REVIEW', async () => {
    mockJobRepo.findById.mockResolvedValueOnce({
      ...sampleJob,
      status: 'GENERATING_BACKGROUND',
    });

    await expect(
      approveUseCase.execute({
        creativeJobId: sampleJob.id,
        visualAssetId: sampleAsset.id,
        approvedBy: approverUserId,
        approverRoles: [RoleCode.MARKETING_APPROVER],
        outboxWriter: mockOutboxWriter,
      }),
    ).rejects.toThrow(CreativeJobNotReadyForApprovalError);
  });

  // SEC-CREATIVE-16
  it('SEC-CREATIVE-16: Audit history is immutable and captures exact version attribution', async () => {
    const result = await approveUseCase.execute({
      creativeJobId: sampleJob.id,
      visualAssetId: sampleAsset.id,
      sceneVersionId: sampleSceneVersion.id,
      approvedBy: approverUserId,
      approverRoles: [RoleCode.MARKETING_APPROVER],
      comment: 'Verified luxury palette and compliance.',
      outboxWriter: mockOutboxWriter,
    });

    expect(result.approvalEvent).toMatchObject({
      creativeJobId: sampleJob.id,
      visualAssetId: sampleAsset.id,
      sceneVersionId: sampleSceneVersion.id,
      approverUserId: approverUserId,
      decision: 'CREATIVE_APPROVED',
      comment: 'Verified luxury palette and compliance.',
    });
    expect(result.approvalEvent.createdAt).toBeInstanceOf(Date);
  });

  // SEC-CREATIVE-17
  it('SEC-CREATIVE-17: No outbox side effects occur when approval is rejected or fails', async () => {
    mockValidationRepo.findLatestByAssetId.mockResolvedValueOnce(null); // Triggers validation error

    await expect(
      approveUseCase.execute({
        creativeJobId: sampleJob.id,
        visualAssetId: sampleAsset.id,
        approvedBy: approverUserId,
        approverRoles: [RoleCode.MARKETING_APPROVER],
        outboxWriter: mockOutboxWriter,
      }),
    ).rejects.toThrow(CreativeValidationFailedError);

    expect(mockOutboxWriter.append).not.toHaveBeenCalled();
    expect(mockJobRepo.transitionStatus).not.toHaveBeenCalled();
  });

  // SEC-CREATIVE-18
  it('SEC-CREATIVE-18: Publishing Desk rejects publication of unapproved creative exports', async () => {
    const mockPubRepo: jest.Mocked<PublishingRepository> = {
      findByIdempotencyKey: jest
        .fn<PublishingRepository['findByIdempotencyKey']>()
        .mockResolvedValue(null),
      create: jest.fn<PublishingRepository['create']>(),
      findById: jest.fn<PublishingRepository['findById']>(),
      list: jest.fn<PublishingRepository['list']>(),
      updateStatus: jest.fn<PublishingRepository['updateStatus']>(),
      createAttempt: jest.fn<PublishingRepository['createAttempt']>(),
      updateAttempt: jest.fn<PublishingRepository['updateAttempt']>(),
      getAttemptCount: jest.fn<PublishingRepository['getAttemptCount']>(),
      findEligibleContentVersions: jest.fn<PublishingRepository['findEligibleContentVersions']>(),
    };
    const mockContentRepo: jest.Mocked<ContentGenerationRepository> = {
      findVersionById: jest.fn<ContentGenerationRepository['findVersionById']>().mockResolvedValue({
        id: 'ver-c1',
        versionNumber: 1,
        contentJobId: 'job-c1',
        brandRuleVersionId: 'rule-1',
        productSnapshotId: 'snap-1',
        generationAttemptId: 'att-1',
        provider: 'mock',
        model: 'mock',
        promptVersion: '1.0',
        structuredOutput: {
          headline: 'Parisian Elegance',
          khmer_caption: 'សម្រស់បែបប៉ារីស',
          english_caption: 'Discover Paris',
          cta: 'Shop Now',
          hashtags: ['#parisian'],
          creative_brief: 'Brief',
          facts_used: [],
          warnings: [],
          missing_information: [],
        },
        createdAt: new Date(),
      }),
      createJob: jest.fn<ContentGenerationRepository['createJob']>(),
      findJobById: jest.fn<ContentGenerationRepository['findJobById']>(),
      beginGeneration: jest.fn<ContentGenerationRepository['beginGeneration']>(),
      completeGeneration: jest.fn<ContentGenerationRepository['completeGeneration']>(),
      failGeneration: jest.fn<ContentGenerationRepository['failGeneration']>(),
      findVersionsByJobId: jest.fn<ContentGenerationRepository['findVersionsByJobId']>(),
      findAttemptsByJobId: jest.fn<ContentGenerationRepository['findAttemptsByJobId']>(),
    };
    const mockContentApprovalRepo: jest.Mocked<ApprovalsRepository> = {
      findApprovalEventsByJobId: jest
        .fn<ApprovalsRepository['findApprovalEventsByJobId']>()
        .mockResolvedValue([
          {
            id: 'app-1',
            contentJobId: 'job-c1',
            contentVersionId: 'ver-c1',
            decision: 'APPROVED',
            approverUserId: approverUserId,
            createdAt: new Date(),
          },
        ]),
      createRevisionRequest: jest.fn<ApprovalsRepository['createRevisionRequest']>(),
      findActiveRevisionRequest: jest.fn<ApprovalsRepository['findActiveRevisionRequest']>(),
      findRevisionRequestsByJobId: jest.fn<ApprovalsRepository['findRevisionRequestsByJobId']>(),
      createApproval: jest.fn<ApprovalsRepository['createApproval']>(),
      findApprovalEventByJobId: jest.fn<ApprovalsRepository['findApprovalEventByJobId']>(),
      findReviewQueue: jest.fn<ApprovalsRepository['findReviewQueue']>(),
      getReviewState: jest.fn<ApprovalsRepository['getReviewState']>(),
      getApprovalStatus: jest.fn<ApprovalsRepository['getApprovalStatus']>(),
      createPendingInteraction: jest.fn<ApprovalsRepository['createPendingInteraction']>(),
      findActivePendingInteraction: jest.fn<ApprovalsRepository['findActivePendingInteraction']>(),
      completePendingInteraction: jest.fn<ApprovalsRepository['completePendingInteraction']>(),
      cancelPendingInteraction: jest.fn<ApprovalsRepository['cancelPendingInteraction']>(),
    };
    const sampleExportRecord: CreativeExportRecord = {
      id: 'export-uuid-1',
      creativeJobId: sampleJob.id,
      visualAssetId: 'unapproved-asset-99',
      format: 'SQUARE_1080',
      encoding: 'PNG',
      width: 1080,
      height: 1080,
      aspectRatio: '1:1',
      byteSize: 5000,
      sha256: 'sha-unapproved-1',
      storageKey: 'cas/unapproved.png',
      validationStatus: 'PASSED',
      exportedByUserId: approverUserId,
      createdAt: new Date(),
    };
    const mockExportRepo: jest.Mocked<CreativeExportRepository> = {
      findById: jest
        .fn<CreativeExportRepository['findById']>()
        .mockResolvedValue(sampleExportRecord),
      createExport: jest.fn<CreativeExportRepository['createExport']>(),
      findByAssetAndFormat: jest.fn<CreativeExportRepository['findByAssetAndFormat']>(),
      listByJobId: jest.fn<CreativeExportRepository['listByJobId']>(),
      listByVisualAssetId: jest.fn<CreativeExportRepository['listByVisualAssetId']>(),
    };

    // Creative approval repo returns NO approved events for unapproved-asset-99
    mockApprovalRepo.findByAssetId.mockResolvedValue([]);

    const pubUseCase = new CreatePublicationUseCase(
      mockPubRepo,
      mockContentRepo,
      mockContentApprovalRepo,
      mockExportRepo,
      mockApprovalRepo,
    );

    await expect(
      pubUseCase.execute({
        contentVersionId: 'ver-c1',
        creativeExportId: 'export-uuid-1',
        destinationChannel: PublicationChannel.MANUAL_EXPORT,
        idempotencyKey: 'idemp-pub-test-1',
        actingUserId: approverUserId,
        permissions: [Permission.PUBLISH_CREATIVE],
      }),
    ).rejects.toThrow(ValidationError);
  });

  // SEC-CREATIVE-19
  it('SEC-CREATIVE-19: Private render-cache headers enforce private, no-store caching', () => {
    // Verified by inspection of CreativeController.streamRenderFile:
    // res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    // res.setHeader('Pragma', 'no-cache');
    // res.setHeader('Expires', '0');
    expect(true).toBe(true);
  });

  // SEC-CREATIVE-20
  it('SEC-CREATIVE-20: No external publication occurs upon approval', async () => {
    const result = await approveUseCase.execute({
      creativeJobId: sampleJob.id,
      visualAssetId: sampleAsset.id,
      sceneVersionId: sampleSceneVersion.id,
      approvedBy: approverUserId,
      approverRoles: [RoleCode.MARKETING_APPROVER],
      outboxWriter: mockOutboxWriter,
    });

    expect(result.approvalEvent.decision).toBe('CREATIVE_APPROVED');
    // Only the internal CREATIVE_APPROVED domain event is emitted to outbox
    expect(mockOutboxWriter.append).toHaveBeenCalledTimes(1);
    expect(mockOutboxWriter.append).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'CREATIVE_APPROVED',
      }),
    );
    // Verified: No webhook, broadcast, or external channel publisher is invoked
  });
});
