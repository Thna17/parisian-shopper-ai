import { describe, expect, it, vi } from 'vitest';
import { ApplicationError, ForbiddenError, NotFoundError, ValidationError } from '@parisian-shopper/common';

import { PermissionService } from '../../auth/domain/permissions.js';
import { type ContentJob, type ContentVersion, type ContentGenerationRepository } from './content-generation.repository.js';
import { SubmitContentForReviewUseCase } from './submit-content-for-review.use-case.js';
import { ListContentJobsUseCase } from './list-content-jobs.use-case.js';
import { GetContentJobDetailUseCase } from './get-content-job-detail.use-case.js';
import { type ValidationRepository, type PersistedValidationResult } from '../../validation/application/validation.repository.js';
import { type ValidateContentVersionUseCase } from '../../validation/application/validate-content-version.use-case.js';
import { type ProductSnapshotRepository } from '../../products/application/product-snapshot.repository.js';
import { type CampaignRepository } from '../../campaigns/application/campaign.repository.js';

describe('Content Studio Application Use Cases', () => {
  const permissions = new PermissionService();

  const mockJob: ContentJob = {
    id: 'job-111',
    productSnapshotId: 'snap-111',
    brandRuleVersionId: 'brand-111',
    requesterUserId: 'user-editor',
    contentType: 'PRODUCT_SPOTLIGHT',
    language: 'EN',
    platform: 'INSTAGRAM',
    status: 'DRAFT',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockVersion: ContentVersion = {
    id: 'ver-111',
    contentJobId: 'job-111',
    versionNumber: 1,
    brandRuleVersionId: 'brand-111',
    productSnapshotId: 'snap-111',
    generationAttemptId: 'att-111',
    provider: 'fake',
    model: 'fake-model',
    promptVersion: '1.0',
    structuredOutput: {
      headline: 'Luxury Perfume',
      english_caption: 'Captivating notes of vanilla and jasmine.',
      khmer_caption: null,
      cta: 'Shop Now',
      hashtags: ['#perfume', '#luxury'],
      facts_used: [],
    },
    createdAt: new Date(),
  };

  const mockValidationResult: PersistedValidationResult = {
    id: 'val-111',
    contentVersionId: 'ver-111',
    validatorVersion: '1.0',
    status: 'PASSED',
    findingCount: 0,
    blockingCount: 0,
    warningCount: 0,
    infoCount: 0,
    createdAt: new Date(),
    findings: [],
  };

  describe('SubmitContentForReviewUseCase', () => {
    it('throws ForbiddenError if actor lacks CREATE_CONTENT or EDIT_CONTENT permission', async () => {
      const repository = {
        findJobById: vi.fn(),
        findVersionById: vi.fn(),
        updateJobStatus: vi.fn(),
      } as unknown as ContentGenerationRepository;
      const validationRepo = { findLatestByContentVersion: vi.fn() } as unknown as ValidationRepository;
      const validateUseCase = { execute: vi.fn() } as unknown as ValidateContentVersionUseCase;

      const useCase = new SubmitContentForReviewUseCase(
        repository,
        validationRepo,
        validateUseCase,
        permissions,
      );

      await expect(
        useCase.execute({
          contentJobId: 'job-111',
          contentVersionId: 'ver-111',
          actorUserId: 'user-viewer',
          actorRoles: ['VIEWER'],
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('throws NotFoundError if content job does not exist', async () => {
      const repository = {
        findJobById: vi.fn().mockResolvedValue(null),
      } as unknown as ContentGenerationRepository;
      const validationRepo = { findLatestByContentVersion: vi.fn() } as unknown as ValidationRepository;
      const validateUseCase = { execute: vi.fn() } as unknown as ValidateContentVersionUseCase;

      const useCase = new SubmitContentForReviewUseCase(
        repository,
        validationRepo,
        validateUseCase,
        permissions,
      );

      await expect(
        useCase.execute({
          contentJobId: 'non-existent',
          contentVersionId: 'ver-111',
          actorUserId: 'user-editor',
          actorRoles: ['MARKETING_EDITOR'],
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('throws ApplicationError if job is already APPROVED or UNDER_REVIEW', async () => {
      const repository = {
        findJobById: vi.fn().mockResolvedValue({ ...mockJob, status: 'APPROVED' }),
      } as unknown as ContentGenerationRepository;
      const validationRepo = { findLatestByContentVersion: vi.fn() } as unknown as ValidationRepository;
      const validateUseCase = { execute: vi.fn() } as unknown as ValidateContentVersionUseCase;

      const useCase = new SubmitContentForReviewUseCase(
        repository,
        validationRepo,
        validateUseCase,
        permissions,
      );

      await expect(
        useCase.execute({
          contentJobId: 'job-111',
          contentVersionId: 'ver-111',
          actorUserId: 'user-editor',
          actorRoles: ['MARKETING_EDITOR'],
        }),
      ).rejects.toThrow(ApplicationError);
    });

    it('throws ValidationError if target version does not belong to the job', async () => {
      const repository = {
        findJobById: vi.fn().mockResolvedValue(mockJob),
        findVersionById: vi.fn().mockResolvedValue({ ...mockVersion, contentJobId: 'other-job' }),
      } as unknown as ContentGenerationRepository;
      const validationRepo = { findLatestByContentVersion: vi.fn() } as unknown as ValidationRepository;
      const validateUseCase = { execute: vi.fn() } as unknown as ValidateContentVersionUseCase;

      const useCase = new SubmitContentForReviewUseCase(
        repository,
        validationRepo,
        validateUseCase,
        permissions,
      );

      await expect(
        useCase.execute({
          contentJobId: 'job-111',
          contentVersionId: 'ver-111',
          actorUserId: 'user-editor',
          actorRoles: ['MARKETING_EDITOR'],
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError if target version has blocking factual findings', async () => {
      const repository = {
        findJobById: vi.fn().mockResolvedValue(mockJob),
        findVersionById: vi.fn().mockResolvedValue(mockVersion),
      } as unknown as ContentGenerationRepository;
      const blockingValidation: PersistedValidationResult = {
        ...mockValidationResult,
        status: 'FAILED',
        blockingCount: 1,
        findings: [
          {
            id: 'f-1',
            validationResultId: 'val-111',
            field: 'price',
            severity: 'BLOCKED',
            code: 'FACTUAL_INCONSISTENCY',
            message: 'Price mismatch with snapshot MSRP',
            createdAt: new Date(),
          },
        ],
      };
      const validationRepo = {
        findLatestByContentVersion: vi.fn().mockResolvedValue(blockingValidation),
      } as unknown as ValidationRepository;
      const validateUseCase = { execute: vi.fn() } as unknown as ValidateContentVersionUseCase;

      const useCase = new SubmitContentForReviewUseCase(
        repository,
        validationRepo,
        validateUseCase,
        permissions,
      );

      await expect(
        useCase.execute({
          contentJobId: 'job-111',
          contentVersionId: 'ver-111',
          actorUserId: 'user-editor',
          actorRoles: ['MARKETING_EDITOR'],
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('successfully submits valid version and transitions job to UNDER_REVIEW', async () => {
      const repository = {
        findJobById: vi.fn().mockResolvedValue(mockJob),
        findVersionById: vi.fn().mockResolvedValue(mockVersion),
        updateJobStatus: vi.fn().mockResolvedValue({ ...mockJob, status: 'UNDER_REVIEW' }),
      } as unknown as ContentGenerationRepository;
      const validationRepo = {
        findLatestByContentVersion: vi.fn().mockResolvedValue(mockValidationResult),
      } as unknown as ValidationRepository;
      const validateUseCase = { execute: vi.fn() } as unknown as ValidateContentVersionUseCase;

      const useCase = new SubmitContentForReviewUseCase(
        repository,
        validationRepo,
        validateUseCase,
        permissions,
      );

      const result = await useCase.execute({
        contentJobId: 'job-111',
        contentVersionId: 'ver-111',
        actorUserId: 'user-editor',
        actorRoles: ['MARKETING_EDITOR'],
      });

      expect(result.job.status).toBe('UNDER_REVIEW');
      expect(result.version.id).toBe('ver-111');
      expect(repository.updateJobStatus).toHaveBeenCalledWith('job-111', 'UNDER_REVIEW');
    });
  });

  describe('ListContentJobsUseCase', () => {
    it('restricts queries to user own id if user has VIEW_OWN_CONTENT but not VIEW_ALL_CONTENT', async () => {
      const findPaginatedJobs = vi.fn().mockResolvedValue({
        items: [mockJob],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
      const repository = { findPaginatedJobs } as unknown as ContentGenerationRepository;

      const useCase = new ListContentJobsUseCase(repository, permissions);

      await useCase.execute({
        actorUserId: 'user-editor-123',
        actorRoles: ['MARKETING_EDITOR'],
        query: { page: 1, limit: 10 },
      });

      expect(findPaginatedJobs).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        requesterUserId: 'user-editor-123',
      });
    });

    it('allows query without user restriction when actor has ADMIN role (VIEW_ALL_CONTENT)', async () => {
      const findPaginatedJobs = vi.fn().mockResolvedValue({
        items: [mockJob],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
      const repository = { findPaginatedJobs } as unknown as ContentGenerationRepository;

      const useCase = new ListContentJobsUseCase(repository, permissions);

      await useCase.execute({
        actorUserId: 'admin-user',
        actorRoles: ['ADMIN'],
        query: { page: 1, limit: 10 },
      });

      expect(findPaginatedJobs).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        requesterUserId: undefined,
      });
    });
  });

  describe('GetContentJobDetailUseCase', () => {
    it('throws ForbiddenError if employee with only VIEW_OWN_CONTENT tries to view another user content job', async () => {
      const repository = {
        findJobById: vi.fn().mockResolvedValue({ ...mockJob, requesterUserId: 'another-user' }),
        findVersionsByJobId: vi.fn().mockResolvedValue([mockVersion]),
        findAttemptsByJobId: vi.fn().mockResolvedValue([]),
      } as unknown as ContentGenerationRepository;
      const snapshots = { findById: vi.fn().mockResolvedValue(null) } as unknown as ProductSnapshotRepository;
      const validationRepo = { findLatestByContentVersion: vi.fn() } as unknown as ValidationRepository;

      const useCase = new GetContentJobDetailUseCase(
        repository,
        snapshots,
        validationRepo,
        permissions,
      );

      await expect(
        useCase.execute({
          contentJobId: 'job-111',
          actorUserId: 'my-user-id',
          actorRoles: ['MARKETING_EDITOR'],
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('returns full detail when accessible by owner', async () => {
      const repository = {
        findJobById: vi.fn().mockResolvedValue(mockJob),
        findVersionsByJobId: vi.fn().mockResolvedValue([mockVersion]),
        findAttemptsByJobId: vi.fn().mockResolvedValue([]),
      } as unknown as ContentGenerationRepository;
      const snapshots = { findById: vi.fn().mockResolvedValue({ id: 'snap-111' }) } as unknown as ProductSnapshotRepository;
      const validationRepo = { findLatestByContentVersion: vi.fn().mockResolvedValue(mockValidationResult) } as unknown as ValidationRepository;
      const campaigns = { findById: vi.fn() } as unknown as CampaignRepository;

      const useCase = new GetContentJobDetailUseCase(
        repository,
        snapshots,
        validationRepo,
        permissions,
        campaigns,
      );

      const result = await useCase.execute({
        contentJobId: 'job-111',
        actorUserId: 'user-editor',
        actorRoles: ['MARKETING_EDITOR'],
      });

      expect(result.job.id).toBe('job-111');
      expect(result.currentVersion?.id).toBe('ver-111');
      expect(result.latestValidationResult?.status).toBe('PASSED');
    });
  });
});
