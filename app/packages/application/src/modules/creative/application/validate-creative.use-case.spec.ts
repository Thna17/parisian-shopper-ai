import { describe, expect, it, jest } from '@jest/globals';
import {
  type ApplicationLogger,
  type OutboxEventDraft,
  ForbiddenError,
} from '@parisian-shopper/common';
import { RoleCode } from '../../auth/domain/permissions.js';
import { ValidateCreativeUseCase } from './validate-creative.use-case.js';
import { ApproveCreativeUseCase } from './approve-creative.use-case.js';
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
  type VisualValidationRepository,
  type VisualValidationResultRecord,
  type PersistVisualValidationInput,
} from './visual-validation.repository.js';
import {
  type CreativeApprovalRepository,
  type CreativeApprovalEventRecord,
  type RecordCreativeApprovalInput,
} from './creative-approval.repository.js';
import {
  type AssetStoragePort,
  type SaveAssetInput,
  type StoredAssetMetadata,
} from './asset-storage.port.js';
import {
  DeterministicVisualValidator,
  type ValidateVisualAssetInput,
} from '../domain/services/deterministic-visual-validator.js';
import {
  VisualSafetyScanner,
  type ScanVisualSafetyInput,
} from '../domain/services/visual-safety-scanner.js';
import {
  CreativeValidationFailedError,
  CreativeJobNotReadyForApprovalError,
} from '../domain/creative-errors.js';
import { type CreativeJobStatus } from '../domain/creative.js';
import { type VisualValidationOutcome } from '../domain/visual-validation.js';

describe('ValidateCreativeUseCase and ApproveCreativeUseCase', () => {
  const mockJob: CreativeJobRecord = {
    id: 'job-val-1',
    contentVersionId: 'version-1',
    productSnapshotId: 'snapshot-1',
    brandRuleVersionId: 'rule-1',
    status: 'VALIDATING',
    targetPlatform: 'GENERIC',
    aspectRatio: '1:1',
    creativeProfile: 'PARISIAN_LUXURY_ATELIER',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAsset: VisualAssetRecord = {
    id: 'asset-val-1',
    creativeJobId: 'job-val-1',
    versionNumber: 1,
    assetRole: 'COMPOSITED_CREATIVE',
    mimeType: 'image/png',
    width: 1080,
    height: 1080,
    byteSize: 1000,
    sha256: 'a'.repeat(64),
    storageKey: 'cas/asset-val-1.png',
    sourceProductAssetDigest: 'p'.repeat(64),
    createdAt: new Date(),
  };

  describe('ValidateCreativeUseCase', () => {
    it('executes deterministic visual and safety checks and transitions job to READY_FOR_REVIEW upon passing', async () => {
      const transitionStatusMock = jest.fn(
        (
          _id: string,
          _from: CreativeJobStatus,
          to: CreativeJobStatus,
        ): Promise<CreativeJobRecord> => Promise.resolve({ ...mockJob, status: to }),
      );

      const jobRepo: CreativeJobRepository = {
        createJob: jest.fn((_input: CreateCreativeJobInput): Promise<CreativeJobRecord> => {
          throw new Error('Not implemented');
        }),
        findById: jest.fn((_id: string): Promise<CreativeJobRecord | null> =>
          Promise.resolve(mockJob),
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
        findById: jest.fn((_id: string): Promise<VisualAssetRecord | null> =>
          Promise.resolve(mockAsset),
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

      const mockResultRecord: VisualValidationResultRecord = {
        id: 'val-res-1',
        visualAssetId: 'asset-val-1',
        validatorVersion: 'ps-visual-v1',
        status: 'PASSED',
        findingCount: 0,
        blockingCount: 0,
        warningCount: 0,
        infoCount: 0,
        findings: [],
        createdAt: new Date(),
      };

      const validationRepo: VisualValidationRepository = {
        persistResult: jest.fn(
          (_input: PersistVisualValidationInput): Promise<VisualValidationResultRecord> =>
            Promise.resolve(mockResultRecord),
        ),
        findByAssetId: jest.fn(
          (_assetId: string): Promise<readonly VisualValidationResultRecord[]> =>
            Promise.resolve([]),
        ),
        findLatestByAssetId: jest.fn(
          (_assetId: string): Promise<VisualValidationResultRecord | null> => Promise.resolve(null),
        ),
      };

      const storage: AssetStoragePort = {
        getAssetBuffer: jest.fn((_key: string): Promise<Buffer | null> =>
          Promise.resolve(Buffer.from('fake-asset-bytes')),
        ),
        getMetadata: jest.fn((_key: string): Promise<StoredAssetMetadata | null> =>
          Promise.resolve(null),
        ),
        saveAsset: jest.fn((_input: SaveAssetInput): Promise<StoredAssetMetadata> => {
          throw new Error('Not implemented');
        }),
        assetExists: jest.fn((_key: string): Promise<boolean> => Promise.resolve(true)),
      };

      const mockDeterministicValidator = {
        validate: jest.fn((_input: ValidateVisualAssetInput): Promise<VisualValidationOutcome> =>
          Promise.resolve({
            validatorVersion: 'ps-visual-v1',
            status: 'PASSED',
            findings: [],
            findingCount: 0,
            blockingCount: 0,
            warningCount: 0,
            infoCount: 0,
          }),
        ),
      } as unknown as DeterministicVisualValidator;

      const mockSafetyScanner = {
        scan: jest.fn((_input: ScanVisualSafetyInput): VisualValidationOutcome => ({
          validatorVersion: 'ps-visual-v1',
          status: 'PASSED',
          findings: [],
          findingCount: 0,
          blockingCount: 0,
          warningCount: 0,
          infoCount: 0,
        })),
      } as unknown as VisualSafetyScanner;

      const logger: ApplicationLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
      const appendMock = jest.fn((_event: OutboxEventDraft): Promise<string> =>
        Promise.resolve('outbox-val'),
      );
      const outboxWriter = { append: appendMock };

      const useCase = new ValidateCreativeUseCase(
        jobRepo,
        assetRepo,
        validationRepo,
        storage,
        mockDeterministicValidator,
        mockSafetyScanner,
        logger,
      );

      const result = await useCase.execute({
        creativeJobId: 'job-val-1',
        visualAssetId: 'asset-val-1',
        outboxWriter,
      });

      expect(result.isPassed).toBe(true);
      expect(result.validationResult.status).toBe('PASSED');
      expect(transitionStatusMock).toHaveBeenCalledWith(
        'job-val-1',
        'VALIDATING',
        'READY_FOR_REVIEW',
      );
      expect(appendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: 'CREATIVE_VALIDATED',
          aggregateId: 'job-val-1',
        }),
      );
    });

    it('transitions job to FAILED and emits CREATIVE_VALIDATION_FAILED if blocking findings exist', async () => {
      const transitionStatusMock = jest.fn(
        (
          _id: string,
          _from: CreativeJobStatus,
          to: CreativeJobStatus,
        ): Promise<CreativeJobRecord> => Promise.resolve({ ...mockJob, status: to }),
      );

      const jobRepo: CreativeJobRepository = {
        createJob: jest.fn((_input: CreateCreativeJobInput): Promise<CreativeJobRecord> => {
          throw new Error('Not implemented');
        }),
        findById: jest.fn((_id: string): Promise<CreativeJobRecord | null> =>
          Promise.resolve(mockJob),
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
        findById: jest.fn((_id: string): Promise<VisualAssetRecord | null> =>
          Promise.resolve(mockAsset),
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

      const mockFailedRecord: VisualValidationResultRecord = {
        id: 'val-res-failed',
        visualAssetId: 'asset-val-1',
        validatorVersion: 'ps-visual-v1',
        status: 'FAILED',
        findingCount: 1,
        blockingCount: 1,
        warningCount: 0,
        infoCount: 0,
        findings: [],
        createdAt: new Date(),
      };

      const validationRepo: VisualValidationRepository = {
        persistResult: jest.fn(
          (_input: PersistVisualValidationInput): Promise<VisualValidationResultRecord> =>
            Promise.resolve(mockFailedRecord),
        ),
        findByAssetId: jest.fn(
          (_assetId: string): Promise<readonly VisualValidationResultRecord[]> =>
            Promise.resolve([]),
        ),
        findLatestByAssetId: jest.fn(
          (_assetId: string): Promise<VisualValidationResultRecord | null> => Promise.resolve(null),
        ),
      };

      const storage: AssetStoragePort = {
        getAssetBuffer: jest.fn((_key: string): Promise<Buffer | null> =>
          Promise.resolve(Buffer.from('corrupted-bytes')),
        ),
        getMetadata: jest.fn((_key: string): Promise<StoredAssetMetadata | null> =>
          Promise.resolve(null),
        ),
        saveAsset: jest.fn((_input: SaveAssetInput): Promise<StoredAssetMetadata> => {
          throw new Error('Not implemented');
        }),
        assetExists: jest.fn((_key: string): Promise<boolean> => Promise.resolve(true)),
      };

      const mockDeterministicValidator = {
        validate: jest.fn((_input: ValidateVisualAssetInput): Promise<VisualValidationOutcome> =>
          Promise.resolve({
            validatorVersion: 'ps-visual-v1',
            status: 'FAILED',
            findings: [
              {
                field: 'sha256',
                severity: 'BLOCKING',
                code: 'CAS_HASH_MISMATCH',
                message: 'Hash mismatch',
              },
            ],
            findingCount: 1,
            blockingCount: 1,
            warningCount: 0,
            infoCount: 0,
          }),
        ),
      } as unknown as DeterministicVisualValidator;

      const mockSafetyScanner = {
        scan: jest.fn((_input: ScanVisualSafetyInput): VisualValidationOutcome => ({
          validatorVersion: 'ps-visual-v1',
          status: 'PASSED',
          findings: [],
          findingCount: 0,
          blockingCount: 0,
          warningCount: 0,
          infoCount: 0,
        })),
      } as unknown as VisualSafetyScanner;

      const logger: ApplicationLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
      const appendMock = jest.fn((_event: OutboxEventDraft): Promise<string> =>
        Promise.resolve('outbox-failed'),
      );
      const outboxWriter = { append: appendMock };

      const useCase = new ValidateCreativeUseCase(
        jobRepo,
        assetRepo,
        validationRepo,
        storage,
        mockDeterministicValidator,
        mockSafetyScanner,
        logger,
      );

      const result = await useCase.execute({
        creativeJobId: 'job-val-1',
        visualAssetId: 'asset-val-1',
        outboxWriter,
      });

      expect(result.isPassed).toBe(false);
      expect(transitionStatusMock).toHaveBeenCalledWith('job-val-1', 'VALIDATING', 'FAILED');
      expect(appendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: 'CREATIVE_VALIDATION_FAILED',
        }),
      );
    });
  });

  describe('ApproveCreativeUseCase', () => {
    it('approves a creative job and records approval event when status is READY_FOR_REVIEW and validation is PASSED', async () => {
      const reviewableJob: CreativeJobRecord = {
        ...mockJob,
        status: 'READY_FOR_REVIEW',
      };

      const transitionStatusMock = jest.fn(
        (
          _id: string,
          _from: CreativeJobStatus,
          to: CreativeJobStatus,
        ): Promise<CreativeJobRecord> => Promise.resolve({ ...reviewableJob, status: to }),
      );

      const jobRepo: CreativeJobRepository = {
        createJob: jest.fn((_input: CreateCreativeJobInput): Promise<CreativeJobRecord> => {
          throw new Error('Not implemented');
        }),
        findById: jest.fn((_id: string): Promise<CreativeJobRecord | null> =>
          Promise.resolve(reviewableJob),
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
        findById: jest.fn((_id: string): Promise<VisualAssetRecord | null> =>
          Promise.resolve(mockAsset),
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

      const approvalRepo: CreativeApprovalRepository = {
        recordApproval: jest.fn(
          (_input: RecordCreativeApprovalInput): Promise<CreativeApprovalEventRecord> =>
            Promise.resolve({
              id: 'approval-event-1',
              creativeJobId: 'job-val-1',
              visualAssetId: 'asset-val-1',
              approverUserId: 'user-reviewer',
              decision: 'CREATIVE_APPROVED',
              visualValidationResultId: 'val-res-passed',
              createdAt: new Date(),
            }),
        ),
        findByJobId: jest.fn((_id: string): Promise<readonly CreativeApprovalEventRecord[]> =>
          Promise.resolve([]),
        ),
        findByAssetId: jest.fn((_id: string): Promise<readonly CreativeApprovalEventRecord[]> =>
          Promise.resolve([]),
        ),
      };

      const validationRepo: VisualValidationRepository = {
        persistResult: jest.fn(
          (_input: PersistVisualValidationInput): Promise<VisualValidationResultRecord> => {
            throw new Error('Not implemented');
          },
        ),
        findByAssetId: jest.fn((_id: string): Promise<readonly VisualValidationResultRecord[]> =>
          Promise.resolve([]),
        ),
        findLatestByAssetId: jest.fn((_id: string): Promise<VisualValidationResultRecord | null> =>
          Promise.resolve({
            id: 'val-res-passed',
            visualAssetId: 'asset-val-1',
            validatorVersion: 'ps-visual-v1',
            status: 'PASSED',
            findingCount: 0,
            blockingCount: 0,
            warningCount: 0,
            infoCount: 0,
            findings: [],
            createdAt: new Date(),
          }),
        ),
      };

      const logger: ApplicationLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
      const appendMock = jest.fn((_event: OutboxEventDraft): Promise<string> =>
        Promise.resolve('outbox-app'),
      );
      const outboxWriter = { append: appendMock };

      const useCase = new ApproveCreativeUseCase(
        jobRepo,
        assetRepo,
        approvalRepo,
        validationRepo,
        logger,
      );

      const result = await useCase.execute({
        creativeJobId: 'job-val-1',
        visualAssetId: 'asset-val-1',
        approvedBy: 'user-reviewer',
        approverRoles: [RoleCode.MARKETING_APPROVER],
        comment: 'Looks exquisite',
        outboxWriter,
      });

      expect(result.approvalEvent.id).toBe('approval-event-1');
      expect(transitionStatusMock).toHaveBeenCalledWith(
        'job-val-1',
        'READY_FOR_REVIEW',
        'CREATIVE_APPROVED',
      );
      expect(appendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: 'CREATIVE_APPROVED',
          aggregateId: 'job-val-1',
        }),
      );
    });

    it('rejects approval if job is not in reviewable state (READY_FOR_REVIEW)', async () => {
      const jobRepo: CreativeJobRepository = {
        createJob: jest.fn((_input: CreateCreativeJobInput): Promise<CreativeJobRecord> => {
          throw new Error('Not implemented');
        }),
        findById: jest.fn((_id: string): Promise<CreativeJobRecord | null> =>
          Promise.resolve({ ...mockJob, status: 'VALIDATING' }),
        ),
        findByContentVersionId: jest.fn((_id: string): Promise<readonly CreativeJobRecord[]> =>
          Promise.resolve([]),
        ),
        transitionStatus: jest.fn(
          (
            _id: string,
            _from: CreativeJobStatus,
            target: CreativeJobStatus,
          ): Promise<CreativeJobRecord> => Promise.resolve({ ...mockJob, status: target }),
        ),
      };
      const assetRepo: VisualAssetRepository = {
        createAsset: jest.fn((_input: CreateVisualAssetInput): Promise<VisualAssetRecord> => {
          throw new Error('Not implemented');
        }),
        findById: jest.fn((_id: string): Promise<VisualAssetRecord | null> =>
          Promise.resolve(mockAsset),
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
      const approvalRepo: CreativeApprovalRepository = {
        recordApproval: jest.fn(
          (_input: RecordCreativeApprovalInput): Promise<CreativeApprovalEventRecord> => {
            throw new Error('Not implemented');
          },
        ),
        findByJobId: jest.fn((_id: string): Promise<readonly CreativeApprovalEventRecord[]> =>
          Promise.resolve([]),
        ),
        findByAssetId: jest.fn((_id: string): Promise<readonly CreativeApprovalEventRecord[]> =>
          Promise.resolve([]),
        ),
      };
      const validationRepo: VisualValidationRepository = {
        persistResult: jest.fn(
          (_input: PersistVisualValidationInput): Promise<VisualValidationResultRecord> => {
            throw new Error('Not implemented');
          },
        ),
        findByAssetId: jest.fn((_id: string): Promise<readonly VisualValidationResultRecord[]> =>
          Promise.resolve([]),
        ),
        findLatestByAssetId: jest.fn((_id: string): Promise<VisualValidationResultRecord | null> =>
          Promise.resolve(null),
        ),
      };
      const logger: ApplicationLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

      const useCase = new ApproveCreativeUseCase(
        jobRepo,
        assetRepo,
        approvalRepo,
        validationRepo,
        logger,
      );

      await expect(
        useCase.execute({
          creativeJobId: 'job-val-1',
          visualAssetId: 'asset-val-1',
          approvedBy: 'user-reviewer',
          approverRoles: [RoleCode.MARKETING_APPROVER],
        }),
      ).rejects.toThrow(CreativeJobNotReadyForApprovalError);
    });

    it('rejects approval if validation result status is not PASSED', async () => {
      const jobRepo: CreativeJobRepository = {
        createJob: jest.fn((_input: CreateCreativeJobInput): Promise<CreativeJobRecord> => {
          throw new Error('Not implemented');
        }),
        findById: jest.fn((_id: string): Promise<CreativeJobRecord | null> =>
          Promise.resolve({ ...mockJob, status: 'READY_FOR_REVIEW' }),
        ),
        findByContentVersionId: jest.fn((_id: string): Promise<readonly CreativeJobRecord[]> =>
          Promise.resolve([]),
        ),
        transitionStatus: jest.fn(
          (
            _id: string,
            _from: CreativeJobStatus,
            target: CreativeJobStatus,
          ): Promise<CreativeJobRecord> => Promise.resolve({ ...mockJob, status: target }),
        ),
      };
      const assetRepo: VisualAssetRepository = {
        createAsset: jest.fn((_input: CreateVisualAssetInput): Promise<VisualAssetRecord> => {
          throw new Error('Not implemented');
        }),
        findById: jest.fn((_id: string): Promise<VisualAssetRecord | null> =>
          Promise.resolve(mockAsset),
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
      const approvalRepo: CreativeApprovalRepository = {
        recordApproval: jest.fn(
          (_input: RecordCreativeApprovalInput): Promise<CreativeApprovalEventRecord> => {
            throw new Error('Not implemented');
          },
        ),
        findByJobId: jest.fn((_id: string): Promise<readonly CreativeApprovalEventRecord[]> =>
          Promise.resolve([]),
        ),
        findByAssetId: jest.fn((_id: string): Promise<readonly CreativeApprovalEventRecord[]> =>
          Promise.resolve([]),
        ),
      };
      const validationRepo: VisualValidationRepository = {
        persistResult: jest.fn(
          (_input: PersistVisualValidationInput): Promise<VisualValidationResultRecord> => {
            throw new Error('Not implemented');
          },
        ),
        findByAssetId: jest.fn((_id: string): Promise<readonly VisualValidationResultRecord[]> =>
          Promise.resolve([]),
        ),
        findLatestByAssetId: jest.fn((_id: string): Promise<VisualValidationResultRecord | null> =>
          Promise.resolve({
            id: 'val-res-failed',
            visualAssetId: 'asset-val-1',
            validatorVersion: 'ps-visual-v1',
            status: 'FAILED',
            findingCount: 1,
            blockingCount: 1,
            warningCount: 0,
            infoCount: 0,
            findings: [],
            createdAt: new Date(),
          }),
        ),
      };
      const logger: ApplicationLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

      const useCase = new ApproveCreativeUseCase(
        jobRepo,
        assetRepo,
        approvalRepo,
        validationRepo,
        logger,
      );

      await expect(
        useCase.execute({
          creativeJobId: 'job-val-1',
          visualAssetId: 'asset-val-1',
          approvedBy: 'user-reviewer',
          approverRoles: [RoleCode.MARKETING_APPROVER],
        }),
      ).rejects.toThrow(CreativeValidationFailedError);
    });

    it('throws ForbiddenError when approver has no APPROVE_CREATIVE permission', async () => {
      const jobRepo = {} as CreativeJobRepository;
      const assetRepo = {} as VisualAssetRepository;
      const approvalRepo = {} as CreativeApprovalRepository;
      const validationRepo = {} as VisualValidationRepository;
      const logger: ApplicationLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

      const useCase = new ApproveCreativeUseCase(
        jobRepo,
        assetRepo,
        approvalRepo,
        validationRepo,
        logger,
      );

      // Empty roles array
      await expect(
        useCase.execute({
          creativeJobId: 'job-val-1',
          visualAssetId: 'asset-val-1',
          approvedBy: 'user-reviewer',
          approverRoles: [],
        }),
      ).rejects.toThrow(ForbiddenError);

      // VIEWER role
      await expect(
        useCase.execute({
          creativeJobId: 'job-val-1',
          visualAssetId: 'asset-val-1',
          approvedBy: 'user-reviewer',
          approverRoles: [RoleCode.VIEWER],
        }),
      ).rejects.toThrow(ForbiddenError);

      // MARKETING_EDITOR role
      await expect(
        useCase.execute({
          creativeJobId: 'job-val-1',
          visualAssetId: 'asset-val-1',
          approvedBy: 'user-reviewer',
          approverRoles: [RoleCode.MARKETING_EDITOR],
        }),
      ).rejects.toThrow(ForbiddenError);

      // Legacy STAFF string
      await expect(
        useCase.execute({
          creativeJobId: 'job-val-1',
          visualAssetId: 'asset-val-1',
          approvedBy: 'user-reviewer',
          approverRoles: ['STAFF'],
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });
});
