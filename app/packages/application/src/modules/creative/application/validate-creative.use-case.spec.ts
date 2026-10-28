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
import {
  type ISoftAestheticScorer,
  type AestheticEvaluationInput,
  type AestheticEvaluationOutcome,
  type AestheticDimension,
  type AestheticDimensionBreakdown,
} from '../domain/services/soft-aesthetic-scorer.port.js';

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

    it('enriches CREATIVE_VALIDATED outbox event with aestheticScore and aestheticGrade when Track 2 scorer is provided', async () => {
      const jobRepo: CreativeJobRepository = {
        createJob: jest.fn(),
        findById: jest.fn((_id: string) => Promise.resolve(mockJob)),
        findByContentVersionId: jest.fn(() => Promise.resolve([])),
        transitionStatus: jest.fn((_id: string, _from: CreativeJobStatus, to: CreativeJobStatus) =>
          Promise.resolve({ ...mockJob, status: to }),
        ),
      } as unknown as CreativeJobRepository;

      const assetRepo: VisualAssetRepository = {
        createAsset: jest.fn(),
        findById: jest.fn(() => Promise.resolve(mockAsset)),
        findByJobAndVersion: jest.fn(() => Promise.resolve(mockAsset)),
        listByJobId: jest.fn(() => Promise.resolve([])),
        findLatestByJobId: jest.fn(() => Promise.resolve(mockAsset)),
      } as unknown as VisualAssetRepository;

      const validationRepo: VisualValidationRepository = {
        persistResult: jest.fn((_input: PersistVisualValidationInput) =>
          Promise.resolve({
            id: 'val-res-enriched',
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
        findByAssetId: jest.fn(() => Promise.resolve([])),
        findLatestByAssetId: jest.fn(() => Promise.resolve(null)),
      } as unknown as VisualValidationRepository;

      const storage: AssetStoragePort = {
        getAssetBuffer: jest.fn(() => Promise.resolve(Buffer.from('sample-asset-bytes'))),
        getMetadata: jest.fn(() => Promise.resolve(null)),
        saveAsset: jest.fn(),
        assetExists: jest.fn(() => Promise.resolve(true)),
      } as unknown as AssetStoragePort;

      const mockDeterministicValidator = {
        validate: jest.fn(() =>
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
        scan: jest.fn(() => ({
          validatorVersion: 'ps-visual-v1',
          status: 'PASSED',
          findings: [],
          findingCount: 0,
          blockingCount: 0,
          warningCount: 0,
          infoCount: 0,
        })),
      } as unknown as VisualSafetyScanner;

      const scoreCompositionMock = jest.fn(
        (_input: AestheticEvaluationInput): Promise<AestheticEvaluationOutcome> =>
          Promise.resolve({
            overallScore: 0.92,
            grade: 'EXEMPLARY' as const,
            scorerVersion: 'ps-aesthetic-v1',
            evaluatedAt: new Date().toISOString(),
            dimensions: {} as Record<AestheticDimension, AestheticDimensionBreakdown>,
            recommendations: [],
          }),
      );

      const mockAestheticScorer: ISoftAestheticScorer = {
        scoreComposition: scoreCompositionMock,
      };

      const logger: ApplicationLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
      const appendMock = jest.fn((_event: OutboxEventDraft) => Promise.resolve('outbox-enriched'));
      const outboxWriter = { append: appendMock };

      const useCase = new ValidateCreativeUseCase(
        jobRepo,
        assetRepo,
        validationRepo,
        storage,
        mockDeterministicValidator,
        mockSafetyScanner,
        logger,
        mockAestheticScorer,
      );

      const result = await useCase.execute({
        creativeJobId: 'job-val-1',
        visualAssetId: 'asset-val-1',
        outboxWriter,
      });

      expect(result.isPassed).toBe(true);
      expect(result.aestheticScore).toBe(0.92);
      expect(result.aestheticGrade).toBe('EXEMPLARY');
      expect(scoreCompositionMock).toHaveBeenCalled();
      expect(appendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: 'CREATIVE_VALIDATED',
          payload: expect.objectContaining({
            aestheticScore: 0.92,
            aestheticGrade: 'EXEMPLARY',
          }),
        }),
      );
    });

    it('enriches CREATIVE_VALIDATION_FAILED outbox event with operator remediationActions from blocking findings metadata', async () => {
      const jobRepo: CreativeJobRepository = {
        createJob: jest.fn(),
        findById: jest.fn((_id: string) => Promise.resolve(mockJob)),
        findByContentVersionId: jest.fn(() => Promise.resolve([])),
        transitionStatus: jest.fn((_id: string, _from: CreativeJobStatus, to: CreativeJobStatus) =>
          Promise.resolve({ ...mockJob, status: to }),
        ),
      } as unknown as CreativeJobRepository;

      const assetRepo: VisualAssetRepository = {
        createAsset: jest.fn(),
        findById: jest.fn(() => Promise.resolve(mockAsset)),
        findByJobAndVersion: jest.fn(() => Promise.resolve(mockAsset)),
        listByJobId: jest.fn(() => Promise.resolve([])),
        findLatestByJobId: jest.fn(() => Promise.resolve(mockAsset)),
      } as unknown as VisualAssetRepository;

      const validationRepo: VisualValidationRepository = {
        persistResult: jest.fn((_input: PersistVisualValidationInput) =>
          Promise.resolve({
            id: 'val-res-failed-remediation',
            visualAssetId: 'asset-val-1',
            validatorVersion: 'ps-visual-v1',
            status: 'FAILED',
            findingCount: 2,
            blockingCount: 2,
            warningCount: 0,
            infoCount: 0,
            findings: [],
            createdAt: new Date(),
          }),
        ),
        findByAssetId: jest.fn(() => Promise.resolve([])),
        findLatestByAssetId: jest.fn(() => Promise.resolve(null)),
      } as unknown as VisualValidationRepository;

      const storage: AssetStoragePort = {
        getAssetBuffer: jest.fn(() => Promise.resolve(Buffer.from('sample-asset-bytes'))),
        getMetadata: jest.fn(() => Promise.resolve(null)),
        saveAsset: jest.fn(),
        assetExists: jest.fn(() => Promise.resolve(true)),
      } as unknown as AssetStoragePort;

      const mockDeterministicValidator = {
        validate: jest.fn(() =>
          Promise.resolve({
            validatorVersion: 'ps-visual-v1',
            status: 'FAILED',
            findings: [
              {
                field: 'heroBoundingBox',
                severity: 'BLOCKING',
                code: 'BOUNDING_BOX_OUT_OF_BOUNDS',
                message: 'Product nozzle clipped',
                metadata: {
                  remediationAction:
                    'Reposition product flacon to ensure all packaging pixels remain strictly within canvas bounds.',
                },
              },
              {
                field: 'typographyBlocks[headline]',
                severity: 'BLOCKING',
                code: 'TEXT_CONTRAST_INSUFFICIENT',
                message: 'Contrast ratio 1.15 is below 3.0',
                metadata: {
                  remediationAction:
                    'Darken underlying background contrast panel or invert text color for legible luxury presentation.',
                },
              },
            ],
            findingCount: 2,
            blockingCount: 2,
            warningCount: 0,
            infoCount: 0,
          }),
        ),
      } as unknown as DeterministicVisualValidator;

      const mockSafetyScanner = {
        scan: jest.fn(() => ({
          validatorVersion: 'ps-visual-v1',
          status: 'PASSED',
          findings: [],
          findingCount: 0,
          blockingCount: 0,
          warningCount: 0,
          infoCount: 0,
        })),
      } as unknown as VisualSafetyScanner;

      const scoreCompositionMock = jest.fn(
        (_input: AestheticEvaluationInput): Promise<AestheticEvaluationOutcome> =>
          Promise.reject(new Error('Should not be called')),
      );

      const mockAestheticScorer: ISoftAestheticScorer = {
        scoreComposition: scoreCompositionMock,
      };

      const logger: ApplicationLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
      const appendMock = jest.fn((_event: OutboxEventDraft) => Promise.resolve('outbox-failed'));
      const outboxWriter = { append: appendMock };

      const useCase = new ValidateCreativeUseCase(
        jobRepo,
        assetRepo,
        validationRepo,
        storage,
        mockDeterministicValidator,
        mockSafetyScanner,
        logger,
        mockAestheticScorer,
      );

      const result = await useCase.execute({
        creativeJobId: 'job-val-1',
        visualAssetId: 'asset-val-1',
        outboxWriter,
      });

      expect(result.isPassed).toBe(false);
      // Verify Track 2 aesthetic scorer was NOT called on Track 1 failure
      expect(scoreCompositionMock).not.toHaveBeenCalled();
      expect(appendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: 'CREATIVE_VALIDATION_FAILED',
          payload: expect.objectContaining({
            remediationActions: [
              'Reposition product flacon to ensure all packaging pixels remain strictly within canvas bounds.',
              'Darken underlying background contrast panel or invert text color for legible luxury presentation.',
            ],
          }),
        }),
      );
    });

    it('handles Track 2 aesthetic scoring failure gracefully without blocking validation passage', async () => {
      const jobRepo: CreativeJobRepository = {
        createJob: jest.fn(),
        findById: jest.fn((_id: string) => Promise.resolve(mockJob)),
        findByContentVersionId: jest.fn(() => Promise.resolve([])),
        transitionStatus: jest.fn((_id: string, _from: CreativeJobStatus, to: CreativeJobStatus) =>
          Promise.resolve({ ...mockJob, status: to }),
        ),
      } as unknown as CreativeJobRepository;

      const assetRepo: VisualAssetRepository = {
        createAsset: jest.fn(),
        findById: jest.fn(() => Promise.resolve(mockAsset)),
        findByJobAndVersion: jest.fn(() => Promise.resolve(mockAsset)),
        listByJobId: jest.fn(() => Promise.resolve([])),
        findLatestByJobId: jest.fn(() => Promise.resolve(mockAsset)),
      } as unknown as VisualAssetRepository;

      const validationRepo: VisualValidationRepository = {
        persistResult: jest.fn((_input: PersistVisualValidationInput) =>
          Promise.resolve({
            id: 'val-res-graceful',
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
        findByAssetId: jest.fn(() => Promise.resolve([])),
        findLatestByAssetId: jest.fn(() => Promise.resolve(null)),
      } as unknown as VisualValidationRepository;

      const storage: AssetStoragePort = {
        getAssetBuffer: jest.fn(() => Promise.resolve(Buffer.from('sample-asset-bytes'))),
        getMetadata: jest.fn(() => Promise.resolve(null)),
        saveAsset: jest.fn(),
        assetExists: jest.fn(() => Promise.resolve(true)),
      } as unknown as AssetStoragePort;

      const mockDeterministicValidator = {
        validate: jest.fn(() =>
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
        scan: jest.fn(() => ({
          validatorVersion: 'ps-visual-v1',
          status: 'PASSED',
          findings: [],
          findingCount: 0,
          blockingCount: 0,
          warningCount: 0,
          infoCount: 0,
        })),
      } as unknown as VisualSafetyScanner;

      // Scorer throws unexpectedly
      const scoreCompositionMock = jest.fn(
        (_input: AestheticEvaluationInput): Promise<AestheticEvaluationOutcome> =>
          Promise.reject(new Error('Sharp processing internal error')),
      );

      const mockAestheticScorer: ISoftAestheticScorer = {
        scoreComposition: scoreCompositionMock,
      };

      const warnMock = jest.fn();
      const logger: ApplicationLogger = { log: jest.fn(), warn: warnMock, error: jest.fn() };
      const appendMock = jest.fn((_event: OutboxEventDraft) => Promise.resolve('outbox-graceful'));
      const outboxWriter = { append: appendMock };

      const useCase = new ValidateCreativeUseCase(
        jobRepo,
        assetRepo,
        validationRepo,
        storage,
        mockDeterministicValidator,
        mockSafetyScanner,
        logger,
        mockAestheticScorer,
      );

      const result = await useCase.execute({
        creativeJobId: 'job-val-1',
        visualAssetId: 'asset-val-1',
        outboxWriter,
      });

      // Crucial: Track 1 Hard Gate passage MUST NOT be blocked by Track 2 advisory exception
      expect(result.isPassed).toBe(true);
      expect(result.validationResult.status).toBe('PASSED');
      expect(warnMock).toHaveBeenCalledWith(
        expect.stringContaining('Track 2 advisory aesthetic scoring skipped'),
      );
      expect(appendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: 'CREATIVE_VALIDATED',
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
