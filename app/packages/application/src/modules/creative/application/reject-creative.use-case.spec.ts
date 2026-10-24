import { describe, expect, it, jest } from '@jest/globals';
import {
  type ApplicationLogger,
  type OutboxEventDraft,
  ForbiddenError,
} from '@parisian-shopper/common';
import { RejectCreativeUseCase } from './reject-creative.use-case.js';
import { RoleCode } from '../../auth/domain/permissions.js';
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
  type CreativeApprovalRepository,
  type CreativeApprovalEventRecord,
  type RecordCreativeApprovalInput,
} from './creative-approval.repository.js';
import {
  CreativeJobNotFoundError,
  VisualAssetNotFoundError,
  CreativeJobNotReadyForApprovalError,
} from '../domain/creative-errors.js';
import { type CreativeJobStatus } from '../domain/creative.js';

describe('RejectCreativeUseCase', () => {
  const mockJob: CreativeJobRecord = {
    id: 'job-rej-1',
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
    id: 'asset-rej-1',
    creativeJobId: 'job-rej-1',
    versionNumber: 1,
    assetRole: 'COMPOSITED_CREATIVE',
    mimeType: 'image/png',
    width: 1080,
    height: 1080,
    byteSize: 5000,
    sha256: 'asset-sha-1',
    storageKey: 'cas/asset-1.png',
    sourceProductAssetDigest: 'prod-sha-1',
    createdAt: new Date(),
  };

  interface SetupMocksResult {
    readonly useCase: RejectCreativeUseCase;
    readonly transitionStatusMock: jest.Mock<
      (_id: string, _from: CreativeJobStatus, to: CreativeJobStatus) => Promise<CreativeJobRecord>
    >;
    readonly recordApprovalMock: jest.Mock<
      (input: RecordCreativeApprovalInput) => Promise<CreativeApprovalEventRecord>
    >;
    readonly appendMock: jest.Mock<(_event: OutboxEventDraft) => Promise<string>>;
    readonly outboxWriter: {
      readonly append: jest.Mock<(_event: OutboxEventDraft) => Promise<string>>;
    };
  }

  function setupMocks(jobOverrides?: Partial<CreativeJobRecord>): SetupMocksResult {
    const job: CreativeJobRecord = { ...mockJob, ...jobOverrides };
    const transitionStatusMock = jest.fn(
      (_id: string, _from: CreativeJobStatus, to: CreativeJobStatus): Promise<CreativeJobRecord> =>
        Promise.resolve({ ...job, status: to }),
    );

    const jobRepo: CreativeJobRepository = {
      createJob: jest.fn((_input: CreateCreativeJobInput): Promise<CreativeJobRecord> => {
        throw new Error('Not implemented');
      }),
      findById: jest.fn((id: string): Promise<CreativeJobRecord | null> =>
        Promise.resolve(id === job.id ? job : null),
      ),
      findByContentVersionId: jest.fn((_id: string): Promise<readonly CreativeJobRecord[]> =>
        Promise.resolve([]),
      ),
      transitionStatus: transitionStatusMock,
    };

    const assetRepo: VisualAssetRepository = {
      createAsset: jest.fn((_input: CreateVisualAssetInput): Promise<VisualAssetRecord> => {
        throw new Error('Not implemented');
      }),
      findById: jest.fn((id: string): Promise<VisualAssetRecord | null> =>
        Promise.resolve(id === mockAsset.id ? mockAsset : null),
      ),
      findByJobAndVersion: jest.fn((_id: string, _v: number): Promise<VisualAssetRecord | null> =>
        Promise.resolve(mockAsset),
      ),
      listByJobId: jest.fn((_id: string): Promise<readonly VisualAssetRecord[]> =>
        Promise.resolve([]),
      ),
      findLatestByJobId: jest.fn((_id: string): Promise<VisualAssetRecord | null> =>
        Promise.resolve(mockAsset),
      ),
    };

    const recordApprovalMock = jest.fn(
      (input: RecordCreativeApprovalInput): Promise<CreativeApprovalEventRecord> =>
        Promise.resolve({
          id: 'approval-event-rej-1',
          creativeJobId: input.creativeJobId,
          visualAssetId: input.visualAssetId,
          approverUserId: input.approverUserId,
          decision: input.decision,
          ...(input.comment !== undefined ? { comment: input.comment } : {}),
          createdAt: new Date(),
        }),
    );

    const approvalRepo: CreativeApprovalRepository = {
      recordApproval: recordApprovalMock,
      findByJobId: jest.fn((_id: string): Promise<readonly CreativeApprovalEventRecord[]> =>
        Promise.resolve([]),
      ),
      findByAssetId: jest.fn((_id: string): Promise<readonly CreativeApprovalEventRecord[]> =>
        Promise.resolve([]),
      ),
    };

    const logger: ApplicationLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const appendMock = jest.fn((_event: OutboxEventDraft): Promise<string> =>
      Promise.resolve('outbox-event-rej'),
    );
    const outboxWriter = { append: appendMock };

    const useCase = new RejectCreativeUseCase(jobRepo, assetRepo, approvalRepo, logger);

    return {
      useCase,
      transitionStatusMock,
      recordApprovalMock,
      appendMock,
      outboxWriter,
    };
  }

  it('rejects creative job, transitions status to CREATIVE_REJECTED, and emits outbox event', async () => {
    const { useCase, transitionStatusMock, recordApprovalMock, appendMock, outboxWriter } =
      setupMocks();

    const result = await useCase.execute({
      creativeJobId: 'job-rej-1',
      visualAssetId: 'asset-rej-1',
      rejectedBy: 'user-approver',
      rejecterRoles: [RoleCode.MARKETING_APPROVER],
      comment: 'Background does not match brand guidelines',
      outboxWriter,
    });

    expect(result.approvalEvent.id).toBe('approval-event-rej-1');
    expect(result.approvalEvent.decision).toBe('CREATIVE_REJECTED');
    expect(recordApprovalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        creativeJobId: 'job-rej-1',
        visualAssetId: 'asset-rej-1',
        decision: 'CREATIVE_REJECTED',
        approverUserId: 'user-approver',
      }),
    );
    expect(transitionStatusMock).toHaveBeenCalledWith(
      'job-rej-1',
      'READY_FOR_REVIEW',
      'CREATIVE_REJECTED',
    );
    expect(appendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'CREATIVE_REJECTED',
        aggregateId: 'job-rej-1',
      }),
    );
  });

  it('throws ForbiddenError when rejecter does not have REJECT_CREATIVE permission', async () => {
    const { useCase } = setupMocks();

    // Empty roles
    await expect(
      useCase.execute({
        creativeJobId: 'job-rej-1',
        visualAssetId: 'asset-rej-1',
        rejectedBy: 'user-anon',
        rejecterRoles: [],
      }),
    ).rejects.toThrow(ForbiddenError);

    // VIEWER
    await expect(
      useCase.execute({
        creativeJobId: 'job-rej-1',
        visualAssetId: 'asset-rej-1',
        rejectedBy: 'user-viewer',
        rejecterRoles: [RoleCode.VIEWER],
      }),
    ).rejects.toThrow(ForbiddenError);

    // MARKETING_EDITOR
    await expect(
      useCase.execute({
        creativeJobId: 'job-rej-1',
        visualAssetId: 'asset-rej-1',
        rejectedBy: 'user-editor',
        rejecterRoles: [RoleCode.MARKETING_EDITOR],
      }),
    ).rejects.toThrow(ForbiddenError);

    // Legacy STAFF role
    await expect(
      useCase.execute({
        creativeJobId: 'job-rej-1',
        visualAssetId: 'asset-rej-1',
        rejectedBy: 'user-staff',
        rejecterRoles: ['STAFF'],
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('throws CreativeJobNotFoundError when job is not found', async () => {
    const { useCase } = setupMocks();

    await expect(
      useCase.execute({
        creativeJobId: 'non-existent-job',
        visualAssetId: 'asset-rej-1',
        rejectedBy: 'user-approver',
        rejecterRoles: [RoleCode.MARKETING_APPROVER],
      }),
    ).rejects.toThrow(CreativeJobNotFoundError);
  });

  it('throws CreativeJobNotReadyForApprovalError when job is not in READY_FOR_REVIEW status', async () => {
    const { useCase } = setupMocks({ status: 'CREATIVE_APPROVED' });

    await expect(
      useCase.execute({
        creativeJobId: 'job-rej-1',
        visualAssetId: 'asset-rej-1',
        rejectedBy: 'user-approver',
        rejecterRoles: [RoleCode.MARKETING_APPROVER],
      }),
    ).rejects.toThrow(CreativeJobNotReadyForApprovalError);
  });

  it('throws VisualAssetNotFoundError when visual asset does not belong to job', async () => {
    const { useCase } = setupMocks();

    await expect(
      useCase.execute({
        creativeJobId: 'job-rej-1',
        visualAssetId: 'non-existent-asset',
        rejectedBy: 'user-approver',
        rejecterRoles: [RoleCode.MARKETING_APPROVER],
      }),
    ).rejects.toThrow(VisualAssetNotFoundError);
  });
});
