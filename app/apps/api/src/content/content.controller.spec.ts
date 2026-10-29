/* eslint-disable @typescript-eslint/unbound-method */
import { jest } from '@jest/globals';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  type BrandRuleRepository,
  type ContentGenerationEnqueuer,
  type ContentGenerationRepository,
  type ContentJob,
  type ContentVersion,
  type CreateContentJobUseCase,
  DEVELOPMENT_BRAND_RULES,
  FICTIONAL_PRODUCTS,
  type GenerationAttempt,
  type GetContentJobDetailUseCase,
  type ListContentJobsUseCase,
  Permission,
  type PersistedValidationResult,
  type ReviseContentUseCase,
  type SanitizedEmployeeDto,
  type SubmitContentForReviewUseCase,
  type ValidationRepository,
} from '@parisian-shopper/application';

import { ContentController } from './content.controller.js';
import { type CreateContentJobDto } from './dto/create-content-job.dto.js';
import { type ListContentJobsQueryDto } from './dto/list-content-jobs-query.dto.js';
import { type ManualReviseContentDto } from './dto/manual-revise-content.dto.js';
import { type SubmitForReviewDto } from './dto/submit-review.dto.js';

describe('ContentController (CONTENT-API-01 to CONTENT-API-09)', () => {
  let controller: ContentController;
  let mockCreateContentJob: jest.Mocked<CreateContentJobUseCase>;
  let mockListContentJobs: jest.Mocked<ListContentJobsUseCase>;
  let mockGetContentJobDetail: jest.Mocked<GetContentJobDetailUseCase>;
  let mockReviseContent: jest.Mocked<ReviseContentUseCase>;
  let mockSubmitContentForReview: jest.Mocked<SubmitContentForReviewUseCase>;
  let mockRepository: jest.Mocked<ContentGenerationRepository>;
  let mockValidationRepository: jest.Mocked<ValidationRepository>;
  let mockBrandRules: jest.Mocked<BrandRuleRepository>;
  let mockEnqueuer: jest.Mocked<ContentGenerationEnqueuer>;

  const mockEmployee: SanitizedEmployeeDto = {
    id: 'emp-uuid-001',
    displayName: 'Golden Editor',
    status: 'ACTIVE',
    roles: ['MARKETING_EDITOR'],
    permissions: [
      Permission.VIEW_OWN_CONTENT,
      Permission.VIEW_ALL_CONTENT,
      Permission.CREATE_CONTENT,
      Permission.EDIT_CONTENT,
      Permission.VIEW_PRODUCTS,
    ],
  };

  const sampleJob: ContentJob = {
    id: 'job-uuid-111',
    productSnapshotId: 'snap-uuid-111',
    brandRuleVersionId: 'brand-uuid-111',
    requesterUserId: 'emp-uuid-001',
    campaignId: 'camp-uuid-001',
    contentType: 'PRODUCT_SPOTLIGHT',
    language: 'EN',
    platform: 'INSTAGRAM',
    campaignContext: 'Spring launch',
    status: 'REQUESTED',
    createdAt: new Date('2026-10-29T10:00:00.000Z'),
    updatedAt: new Date('2026-10-29T10:00:00.000Z'),
  };

  const sampleAttempt: GenerationAttempt = {
    id: 'att-uuid-111',
    contentJobId: 'job-uuid-111',
    attemptNumber: 1,
    provider: 'fake',
    model: 'fake-model',
    promptVersion: '1.0',
    status: 'SUCCEEDED',
    startedAt: new Date('2026-10-29T10:00:05.000Z'),
    completedAt: new Date('2026-10-29T10:00:07.000Z'),
  };

  const sampleVersion: ContentVersion = {
    id: 'ver-uuid-111',
    contentJobId: 'job-uuid-111',
    versionNumber: 1,
    brandRuleVersionId: 'brand-uuid-111',
    productSnapshotId: 'snap-uuid-111',
    generationAttemptId: 'att-uuid-111',
    provider: 'fake',
    model: 'fake-model',
    promptVersion: '1.0',
    structuredOutput: {
      headline: 'Rose Impériale Eau de Parfum',
      english_caption: 'Captivating notes of damask rose and vanilla.',
      khmer_caption: null,
      cta: 'Explore the Scent',
      hashtags: ['#RoseImperiale', '#ParisianShopper'],
      creative_brief: 'Luxury fragrance spotlight',
      facts_used: ['Damask Rose', '100ml'],
      warnings: [],
      missing_information: [],
    },
    createdAt: new Date('2026-10-29T10:00:07.000Z'),
  };

  const sampleValidation: PersistedValidationResult = {
    id: 'val-uuid-111',
    contentVersionId: 'ver-uuid-111',
    validatorVersion: '1.0',
    status: 'PASSED',
    findingCount: 0,
    blockingCount: 0,
    warningCount: 0,
    infoCount: 0,
    createdAt: new Date('2026-10-29T10:00:08.000Z'),
    findings: [],
  };

  beforeEach(() => {
    mockCreateContentJob = {
      execute: jest.fn<CreateContentJobUseCase['execute']>().mockResolvedValue(sampleJob),
    } as unknown as jest.Mocked<CreateContentJobUseCase>;

    mockListContentJobs = {
      execute: jest.fn<ListContentJobsUseCase['execute']>().mockResolvedValue({
        items: [sampleJob],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      }),
    } as unknown as jest.Mocked<ListContentJobsUseCase>;

    mockGetContentJobDetail = {
      execute: jest.fn<GetContentJobDetailUseCase['execute']>().mockResolvedValue({
        job: sampleJob,
        productSnapshot: {
          id: 'snap-uuid-111',
          snapshotHash: 'hash-111',
          normalizerVersion: 'phase-1b-v1',
          createdAt: new Date(),
          product: FICTIONAL_PRODUCTS[0]!,
        },
        campaign: {
          id: 'camp-uuid-001',
          code: 'CAMP-ROSE-2026',
          name: 'Spring Rose',
          status: 'ACTIVE',
          objective: 'Brand Awareness',
          createdById: 'user-001',
          productCount: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        attempts: [sampleAttempt],
        versions: [sampleVersion],
        currentVersion: sampleVersion,
        latestValidationResult: sampleValidation,
      }),
    } as unknown as jest.Mocked<GetContentJobDetailUseCase>;

    mockReviseContent = {
      editField: jest.fn<ReviseContentUseCase['editField']>().mockResolvedValue({
        version: {
          ...sampleVersion,
          id: 'ver-uuid-222',
          versionNumber: 2,
          structuredOutput: {
            ...sampleVersion.structuredOutput,
            headline: 'Updated Rose Impériale Luxury',
          },
        },
        validationResult: sampleValidation,
      }),
      changeLanguage: jest.fn(),
      restoreVersion: jest.fn(),
    } as unknown as jest.Mocked<ReviseContentUseCase>;

    mockSubmitContentForReview = {
      execute: jest.fn<SubmitContentForReviewUseCase['execute']>().mockResolvedValue({
        job: { ...sampleJob, status: 'UNDER_REVIEW' },
        version: sampleVersion,
        validationResult: sampleValidation,
      }),
    } as unknown as jest.Mocked<SubmitContentForReviewUseCase>;

    mockRepository = {
      createJob: jest.fn(),
      findJobById: jest.fn(),
      findVersionById: jest
        .fn<ContentGenerationRepository['findVersionById']>()
        .mockResolvedValue(sampleVersion),
      findVersionsByJobId: jest
        .fn<ContentGenerationRepository['findVersionsByJobId']>()
        .mockResolvedValue([sampleVersion]),
      findAttemptsByJobId: jest
        .fn<ContentGenerationRepository['findAttemptsByJobId']>()
        .mockResolvedValue([sampleAttempt]),
      beginGeneration: jest.fn(),
      completeGeneration: jest.fn(),
      failGeneration: jest.fn(),
    } as unknown as jest.Mocked<ContentGenerationRepository>;

    mockValidationRepository = {
      create: jest.fn(),
      findByContentVersionAndValidatorVersion: jest.fn(),
      findLatestByContentVersion: jest
        .fn<ValidationRepository['findLatestByContentVersion']>()
        .mockResolvedValue(sampleValidation),
    } as unknown as jest.Mocked<ValidationRepository>;

    mockBrandRules = {
      create: jest.fn(),
      findById: jest.fn(),
      findActive: jest.fn<BrandRuleRepository['findActive']>().mockResolvedValue({
        id: 'brand-uuid-111',
        name: 'Default Brand Rules',
        version: 1,
        status: 'ACTIVE',
        rules: DEVELOPMENT_BRAND_RULES,
        createdAt: new Date(),
      }),
    } as unknown as jest.Mocked<BrandRuleRepository>;

    mockEnqueuer = {
      enqueue: jest.fn<ContentGenerationEnqueuer['enqueue']>().mockResolvedValue(undefined),
    };

    controller = new ContentController(
      mockCreateContentJob,
      mockListContentJobs,
      mockGetContentJobDetail,
      mockReviseContent,
      mockSubmitContentForReview,
      mockRepository,
      mockValidationRepository,
      mockBrandRules,
      mockEnqueuer,
    );
  });

  describe('createJob (CONTENT-API-01 to CONTENT-API-03)', () => {
    it('creates content job using active brand rules and enqueues to BullMQ worker', async () => {
      const dto: CreateContentJobDto = {
        productSnapshotId: 'snap-uuid-111',
        campaignId: 'camp-uuid-001',
        contentType: 'PRODUCT_SPOTLIGHT',
        language: 'EN',
        platform: 'INSTAGRAM',
        campaignContext: 'Spring launch',
      };

      const result = await controller.createJob(dto, mockEmployee);

      expect(mockBrandRules.findActive).toHaveBeenCalledTimes(1);
      expect(mockCreateContentJob.execute).toHaveBeenCalledWith({
        productSnapshotId: 'snap-uuid-111',
        brandRuleVersionId: 'brand-uuid-111',
        requesterUserId: mockEmployee.id,
        contentType: 'PRODUCT_SPOTLIGHT',
        language: 'EN',
        platform: 'INSTAGRAM',
        campaignId: 'camp-uuid-001',
        campaignContext: 'Spring launch',
      });
      expect(mockEnqueuer.enqueue).toHaveBeenCalledWith('job-uuid-111');
      expect(result.id).toBe('job-uuid-111');
      expect(result.status).toBe('REQUESTED');
    });

    it('throws BadRequestException if no active brand rules exist', async () => {
      mockBrandRules.findActive.mockResolvedValueOnce(null);

      const dto: CreateContentJobDto = {
        productSnapshotId: 'snap-uuid-111',
        contentType: 'PRODUCT_SPOTLIGHT',
        language: 'EN',
        platform: 'INSTAGRAM',
      };

      await expect(controller.createJob(dto, mockEmployee)).rejects.toThrow(BadRequestException);
      expect(mockCreateContentJob.execute).not.toHaveBeenCalled();
    });
  });

  describe('listJobs (CONTENT-API-04)', () => {
    it('lists content jobs with query filters and pagination', async () => {
      const query: ListContentJobsQueryDto = {
        page: 1,
        limit: 10,
        status: 'REQUESTED',
        productSnapshotId: 'snap-uuid-111',
      };

      const result = await controller.listJobs(query, mockEmployee);

      expect(mockListContentJobs.execute).toHaveBeenCalledWith({
        actorUserId: mockEmployee.id,
        actorRoles: mockEmployee.roles,
        query: {
          page: 1,
          limit: 10,
          status: 'REQUESTED',
          productSnapshotId: 'snap-uuid-111',
          campaignId: undefined,
        },
      });
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.items[0]!.id).toBe('job-uuid-111');
    });
  });

  describe('getJobDetail (CONTENT-API-05)', () => {
    it('returns full job detail with product, attempts, versions, and validation', async () => {
      const result = await controller.getJobDetail('job-uuid-111', mockEmployee);

      expect(mockGetContentJobDetail.execute).toHaveBeenCalledWith({
        contentJobId: 'job-uuid-111',
        actorUserId: mockEmployee.id,
        actorRoles: mockEmployee.roles,
      });
      expect(result.job.id).toBe('job-uuid-111');
      expect(result.product?.title).toBe(FICTIONAL_PRODUCTS[0]!.product.product_name);
      expect(result.product?.priceUsd).toBe(Number(FICTIONAL_PRODUCTS[0]!.product.price));
      expect(result.campaign?.code).toBe('CAMP-ROSE-2026');
      expect(result.attempts).toHaveLength(1);
      expect(result.versions).toHaveLength(1);
      expect(result.currentVersion?.id).toBe('ver-uuid-111');
      expect(result.latestValidationResult?.status).toBe('PASSED');
    });
  });

  describe('getJobVersions (CONTENT-API-06)', () => {
    it('returns list of versions for a job', async () => {
      const result = await controller.getJobVersions('job-uuid-111', mockEmployee);

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('ver-uuid-111');
      expect(result[0]!.versionNumber).toBe(1);
    });
  });

  describe('getVersion (CONTENT-API-07)', () => {
    it('returns single version with latest validation result', async () => {
      const result = await controller.getVersion('ver-uuid-111');

      expect(mockRepository.findVersionById).toHaveBeenCalledWith('ver-uuid-111');
      expect(mockValidationRepository.findLatestByContentVersion).toHaveBeenCalledWith(
        'ver-uuid-111',
      );
      expect(result.version.id).toBe('ver-uuid-111');
      expect(result.validationResult?.status).toBe('PASSED');
    });

    it('throws NotFoundException if version does not exist', async () => {
      mockRepository.findVersionById.mockResolvedValueOnce(null);

      await expect(controller.getVersion('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('reviseManual (CONTENT-API-08)', () => {
    it('creates immutable new version for copy edit and returns validation result', async () => {
      const dto: ManualReviseContentDto = {
        currentVersionId: 'ver-uuid-111',
        field: 'headline',
        newValue: 'Updated Rose Impériale Luxury',
      };

      const result = await controller.reviseManual('job-uuid-111', dto, mockEmployee);

      expect(mockReviseContent.editField).toHaveBeenCalledWith({
        contentJobId: 'job-uuid-111',
        contentVersionId: 'ver-uuid-111',
        field: 'headline',
        newValue: 'Updated Rose Impériale Luxury',
        actorUserId: mockEmployee.id,
        actorRoles: mockEmployee.roles,
      });
      expect(result.version.id).toBe('ver-uuid-222');
      expect(result.version.versionNumber).toBe(2);
      expect(result.version.structuredOutput.headline).toBe('Updated Rose Impériale Luxury');
      expect(result.validationResult.status).toBe('PASSED');
    });
  });

  describe('submitForReview (CONTENT-API-09)', () => {
    it('submits eligible version for review and transitions job to UNDER_REVIEW', async () => {
      const dto: SubmitForReviewDto = {
        contentVersionId: 'ver-uuid-111',
      };

      const result = await controller.submitForReview('job-uuid-111', dto, mockEmployee);

      expect(mockSubmitContentForReview.execute).toHaveBeenCalledWith({
        contentJobId: 'job-uuid-111',
        contentVersionId: 'ver-uuid-111',
        actorUserId: mockEmployee.id,
        actorRoles: mockEmployee.roles,
      });
      expect(result.id).toBe('job-uuid-111');
      expect(result.status).toBe('UNDER_REVIEW');
    });
  });
});
