/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, jest } from '@jest/globals';
import { Permission } from '../../auth/domain/permissions.js';
import type { ApprovalsRepository } from '../../approvals/application/approvals.repository.js';
import type { ContentGenerationRepository } from '../../content/application/content-generation.repository.js';
import {
  PublicationChannel,
  type PublicationDetail,
  type PublicationRecord,
  PublicationStatus,
} from '../domain/publication.types.js';
import {
  ContentVersionNotApprovedError,
  InsufficientPublishingPermissionError,
  PublicationChannelNotEnabledError,
  PublicationNotFoundError,
  PublicationNotRetryableError,
  PublicationStatusTransitionError,
} from '../domain/publishing-errors.js';
import { CancelPublicationUseCase } from './cancel-publication.use-case.js';
import { ConfirmPublicationUseCase } from './confirm-publication.use-case.js';
import { CreatePublicationUseCase } from './create-publication.use-case.js';
import { GetPublicationDetailUseCase } from './get-publication-detail.use-case.js';
import { ListDestinationsUseCase } from './list-destinations.use-case.js';
import { ListEligibleAssetsUseCase } from './list-eligible-assets.use-case.js';
import { ListPublicationsUseCase } from './list-publications.use-case.js';
import type { PublishingRepository } from './publishing.repository.js';
import { RetryPublicationUseCase } from './retry-publication.use-case.js';

describe('Publishing Application Use Cases', () => {
  const dummyPublication: PublicationRecord = {
    id: 'pub-001',
    contentVersionId: 'ver-001',
    creativeExportId: 'exp-001',
    destinationChannel: PublicationChannel.MANUAL_EXPORT,
    destinationAccountId: null,
    requestedByUserId: 'usr-001',
    status: PublicationStatus.READY,
    idempotencyKey: 'idemp-123',
    campaignId: 'camp-001',
    scheduledAt: null,
    publishedAt: null,
    externalPublicationId: null,
    cancellationReason: null,
    createdAt: new Date('2026-10-29T10:00:00Z'),
    updatedAt: new Date('2026-10-29T10:00:00Z'),
  };

  const dummyPublicationDetail: PublicationDetail = {
    ...dummyPublication,
    attempts: [],
    contentVersion: {
      id: 'ver-001',
      versionNumber: 1,
      contentJobId: 'job-001',
      structuredOutput: { textKhmer: 'សួស្តី' },
    },
    creativeExport: {
      id: 'exp-001',
      format: 'INSTAGRAM_FEED',
      encoding: 'PNG',
      width: 1080,
      height: 1080,
      storageKey: 'exports/exp-001.png',
    },
    requestedByUser: {
      id: 'usr-001',
      displayName: 'Alice Shopper',
    },
    campaign: {
      id: 'camp-001',
      code: 'CAMP-2026-01',
      name: 'Autumn Launch',
    },
  };

  const createMockPublishingRepo = (): jest.Mocked<PublishingRepository> => ({
    create: jest.fn<PublishingRepository['create']>().mockResolvedValue(dummyPublication),
    findById: jest.fn<PublishingRepository['findById']>().mockResolvedValue(dummyPublicationDetail),
    findByIdempotencyKey: jest
      .fn<PublishingRepository['findByIdempotencyKey']>()
      .mockResolvedValue(null),
    list: jest.fn<PublishingRepository['list']>().mockResolvedValue({
      items: [dummyPublication],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    }),
    updateStatus: jest.fn<PublishingRepository['updateStatus']>().mockResolvedValue({
      ...dummyPublication,
      status: PublicationStatus.PUBLISHED,
    }),
    createAttempt: jest.fn<PublishingRepository['createAttempt']>().mockResolvedValue({
      id: 'att-001',
      publicationId: 'pub-001',
      attemptNumber: 1,
      status: PublicationStatus.PROCESSING,
      startedAt: new Date(),
      completedAt: null,
      providerResult: null,
      externalPublicationId: null,
      errorCode: null,
      errorMessage: null,
      retryEligible: false,
      createdAt: new Date(),
    }),
    updateAttempt: jest.fn<PublishingRepository['updateAttempt']>().mockResolvedValue({
      id: 'att-001',
      publicationId: 'pub-001',
      attemptNumber: 1,
      status: PublicationStatus.PUBLISHED,
      startedAt: new Date(),
      completedAt: new Date(),
      providerResult: { channel: 'MANUAL_EXPORT', success: true },
      externalPublicationId: null,
      errorCode: null,
      errorMessage: null,
      retryEligible: false,
      createdAt: new Date(),
    }),
    getAttemptCount: jest.fn<PublishingRepository['getAttemptCount']>().mockResolvedValue(0),
    findEligibleContentVersions: jest
      .fn<PublishingRepository['findEligibleContentVersions']>()
      .mockResolvedValue({
        items: [
          {
            contentVersionId: 'ver-001',
            versionNumber: 1,
            contentJobId: 'job-001',
            productName: 'Chanel No 5',
            approvedAt: '2026-10-29T09:00:00Z',
            hasCreativeExports: true,
          },
        ],
        total: 1,
      }),
  });

  const createMockContentRepo = (): jest.Mocked<ContentGenerationRepository> => ({
    createJob: jest.fn(),
    findJobById: jest.fn(),
    findVersionById: jest.fn<ContentGenerationRepository['findVersionById']>().mockResolvedValue({
      id: 'ver-001',
      contentJobId: 'job-001',
      versionNumber: 1,
      brandRuleVersionId: 'br-001',
      productSnapshotId: 'snap-001',
      generationAttemptId: 'att-001',
      provider: 'mock',
      model: 'mock',
      promptVersion: '1.0.0',
      structuredOutput: {
        headline: 'Luxury Perfume',
        khmer_caption: 'សួស្តី',
        english_caption: 'Hello',
        cta: 'Buy now',
        hashtags: ['#luxury'],
        creative_brief: 'Brief',
        facts_used: [],
        warnings: [],
        missing_information: [],
      },
      createdAt: new Date(),
    }),
    beginGeneration: jest.fn(),
    completeGeneration: jest.fn(),
    failGeneration: jest.fn(),
    findVersionsByJobId: jest.fn(),
    findAttemptsByJobId: jest.fn(),
  });

  const createMockApprovalsRepo = (): jest.Mocked<ApprovalsRepository> => ({
    createRevisionRequest: jest.fn(),
    findActiveRevisionRequest: jest.fn(),
    findRevisionRequestsByJobId: jest.fn(),
    createApproval: jest.fn(),
    findApprovalEventByJobId: jest.fn(),
    findApprovalEventsByJobId: jest
      .fn<ApprovalsRepository['findApprovalEventsByJobId']>()
      .mockResolvedValue([
        {
          id: 'appr-001',
          contentJobId: 'job-001',
          contentVersionId: 'ver-001',
          approverUserId: 'approver-001',
          decision: 'APPROVED',
          comment: 'Looks great',
          createdAt: new Date('2026-10-29T09:00:00Z'),
        },
      ]),
    findReviewQueue: jest.fn(),
    getReviewState: jest.fn(),
    getApprovalStatus: jest.fn(),
    createPendingInteraction: jest.fn(),
    findActivePendingInteraction: jest.fn(),
    completePendingInteraction: jest.fn(),
    cancelPendingInteraction: jest.fn(),
  });

  describe('CreatePublicationUseCase', () => {
    it('throws InsufficientPublishingPermissionError if PUBLISH_CREATIVE permission is missing', async () => {
      const pubRepo = createMockPublishingRepo();
      const contentRepo = createMockContentRepo();
      const approvalsRepo = createMockApprovalsRepo();
      const useCase = new CreatePublicationUseCase(pubRepo, contentRepo, approvalsRepo);

      await expect(
        useCase.execute({
          contentVersionId: 'ver-001',
          destinationChannel: PublicationChannel.MANUAL_EXPORT,
          idempotencyKey: 'idemp-1',
          actingUserId: 'usr-001',
          permissions: [Permission.VIEW_OWN_CONTENT],
        }),
      ).rejects.toThrow(InsufficientPublishingPermissionError);
    });

    it('returns existing publication idempotently if idempotency key exists', async () => {
      const pubRepo = createMockPublishingRepo();
      pubRepo.findByIdempotencyKey.mockResolvedValueOnce(dummyPublication);
      const contentRepo = createMockContentRepo();
      const approvalsRepo = createMockApprovalsRepo();
      const useCase = new CreatePublicationUseCase(pubRepo, contentRepo, approvalsRepo);

      const result = await useCase.execute({
        contentVersionId: 'ver-001',
        destinationChannel: PublicationChannel.MANUAL_EXPORT,
        idempotencyKey: 'idemp-123',
        actingUserId: 'usr-001',
        permissions: [Permission.PUBLISH_CREATIVE],
      });

      expect(result).toEqual(dummyPublication);
      expect(pubRepo.create).not.toHaveBeenCalled();
    });

    it('throws ContentVersionNotApprovedError if content version is not found', async () => {
      const pubRepo = createMockPublishingRepo();
      const contentRepo = createMockContentRepo();
      contentRepo.findVersionById.mockResolvedValueOnce(null);
      const approvalsRepo = createMockApprovalsRepo();
      const useCase = new CreatePublicationUseCase(pubRepo, contentRepo, approvalsRepo);

      await expect(
        useCase.execute({
          contentVersionId: 'ver-missing',
          destinationChannel: PublicationChannel.MANUAL_EXPORT,
          idempotencyKey: 'idemp-1',
          actingUserId: 'usr-001',
          permissions: [Permission.PUBLISH_CREATIVE],
        }),
      ).rejects.toThrow(ContentVersionNotApprovedError);
    });

    it('throws ContentVersionNotApprovedError if version does not have APPROVED event', async () => {
      const pubRepo = createMockPublishingRepo();
      const contentRepo = createMockContentRepo();
      const approvalsRepo = createMockApprovalsRepo();
      approvalsRepo.findApprovalEventsByJobId.mockResolvedValueOnce([]);
      const useCase = new CreatePublicationUseCase(pubRepo, contentRepo, approvalsRepo);

      await expect(
        useCase.execute({
          contentVersionId: 'ver-001',
          destinationChannel: PublicationChannel.MANUAL_EXPORT,
          idempotencyKey: 'idemp-1',
          actingUserId: 'usr-001',
          permissions: [Permission.PUBLISH_CREATIVE],
        }),
      ).rejects.toThrow(ContentVersionNotApprovedError);
    });

    it('creates publication with READY status for MANUAL_EXPORT channel', async () => {
      const pubRepo = createMockPublishingRepo();
      const contentRepo = createMockContentRepo();
      const approvalsRepo = createMockApprovalsRepo();
      const useCase = new CreatePublicationUseCase(pubRepo, contentRepo, approvalsRepo);

      await useCase.execute({
        contentVersionId: 'ver-001',
        destinationChannel: PublicationChannel.MANUAL_EXPORT,
        idempotencyKey: 'idemp-new',
        actingUserId: 'usr-001',
        permissions: [Permission.PUBLISH_CREATIVE],
      });

      expect(pubRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: PublicationStatus.READY,
          destinationChannel: PublicationChannel.MANUAL_EXPORT,
        }),
      );
    });

    it('creates publication with DRAFT status for non-export channels', async () => {
      const pubRepo = createMockPublishingRepo();
      const contentRepo = createMockContentRepo();
      const approvalsRepo = createMockApprovalsRepo();
      const useCase = new CreatePublicationUseCase(pubRepo, contentRepo, approvalsRepo);

      await useCase.execute({
        contentVersionId: 'ver-001',
        destinationChannel: PublicationChannel.TELEGRAM_CHANNEL,
        idempotencyKey: 'idemp-telegram',
        actingUserId: 'usr-001',
        permissions: [Permission.PUBLISH_CREATIVE],
      });

      expect(pubRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: PublicationStatus.DRAFT,
          destinationChannel: PublicationChannel.TELEGRAM_CHANNEL,
        }),
      );
    });
  });

  describe('ConfirmPublicationUseCase', () => {
    it('throws InsufficientPublishingPermissionError if PUBLISH_CREATIVE is missing', async () => {
      const pubRepo = createMockPublishingRepo();
      const useCase = new ConfirmPublicationUseCase(pubRepo);

      await expect(
        useCase.execute({
          publicationId: 'pub-001',
          actingUserId: 'usr-001',
          permissions: [Permission.VIEW_OWN_CONTENT],
        }),
      ).rejects.toThrow(InsufficientPublishingPermissionError);
    });

    it('throws PublicationNotFoundError if publication does not exist', async () => {
      const pubRepo = createMockPublishingRepo();
      pubRepo.findById.mockResolvedValueOnce(null);
      const useCase = new ConfirmPublicationUseCase(pubRepo);

      await expect(
        useCase.execute({
          publicationId: 'pub-missing',
          actingUserId: 'usr-001',
          permissions: [Permission.PUBLISH_CREATIVE],
        }),
      ).rejects.toThrow(PublicationNotFoundError);
    });

    it('throws PublicationStatusTransitionError if status is already PUBLISHED', async () => {
      const pubRepo = createMockPublishingRepo();
      pubRepo.findById.mockResolvedValueOnce({
        ...dummyPublicationDetail,
        status: PublicationStatus.PUBLISHED,
      });
      const useCase = new ConfirmPublicationUseCase(pubRepo);

      await expect(
        useCase.execute({
          publicationId: 'pub-001',
          actingUserId: 'usr-001',
          permissions: [Permission.PUBLISH_CREATIVE],
        }),
      ).rejects.toThrow(PublicationStatusTransitionError);
    });

    it('throws PublicationChannelNotEnabledError for disabled channels like TELEGRAM_CHANNEL', async () => {
      const pubRepo = createMockPublishingRepo();
      pubRepo.findById.mockResolvedValueOnce({
        ...dummyPublicationDetail,
        destinationChannel: PublicationChannel.TELEGRAM_CHANNEL,
        status: PublicationStatus.DRAFT,
      });
      const useCase = new ConfirmPublicationUseCase(pubRepo);

      await expect(
        useCase.execute({
          publicationId: 'pub-001',
          actingUserId: 'usr-001',
          permissions: [Permission.PUBLISH_CREATIVE],
        }),
      ).rejects.toThrow(PublicationChannelNotEnabledError);
    });

    it('successfully publishes MANUAL_EXPORT and records attempt', async () => {
      const pubRepo = createMockPublishingRepo();
      const useCase = new ConfirmPublicationUseCase(pubRepo);

      const result = await useCase.execute({
        publicationId: 'pub-001',
        actingUserId: 'usr-001',
        permissions: [Permission.PUBLISH_CREATIVE],
      });

      expect(pubRepo.createAttempt).toHaveBeenCalled();
      expect(pubRepo.updateAttempt).toHaveBeenCalledWith(
        'att-001',
        expect.objectContaining({ status: PublicationStatus.PUBLISHED }),
      );
      expect(pubRepo.updateStatus).toHaveBeenCalledWith(
        'pub-001',
        PublicationStatus.PUBLISHED,
        expect.objectContaining({ publishedAt: expect.any(Date) }),
      );
      expect(result.status).toBe(PublicationStatus.PUBLISHED);
    });
  });

  describe('RetryPublicationUseCase', () => {
    it('throws InsufficientPublishingPermissionError if permission missing', async () => {
      const pubRepo = createMockPublishingRepo();
      const useCase = new RetryPublicationUseCase(pubRepo);

      await expect(
        useCase.execute({
          publicationId: 'pub-001',
          actingUserId: 'usr-001',
          permissions: [],
        }),
      ).rejects.toThrow(InsufficientPublishingPermissionError);
    });

    it('throws PublicationNotRetryableError if status is not FAILED', async () => {
      const pubRepo = createMockPublishingRepo();
      pubRepo.findById.mockResolvedValueOnce({
        ...dummyPublicationDetail,
        status: PublicationStatus.READY,
      });
      const useCase = new RetryPublicationUseCase(pubRepo);

      await expect(
        useCase.execute({
          publicationId: 'pub-001',
          actingUserId: 'usr-001',
          permissions: [Permission.PUBLISH_CREATIVE],
        }),
      ).rejects.toThrow(PublicationNotRetryableError);
    });

    it('successfully queues a failed publication for retry', async () => {
      const pubRepo = createMockPublishingRepo();
      pubRepo.findById.mockResolvedValueOnce({
        ...dummyPublicationDetail,
        status: PublicationStatus.FAILED,
      });
      const useCase = new RetryPublicationUseCase(pubRepo);

      await useCase.execute({
        publicationId: 'pub-001',
        actingUserId: 'usr-001',
        permissions: [Permission.PUBLISH_CREATIVE],
      });

      expect(pubRepo.updateStatus).toHaveBeenCalledWith('pub-001', PublicationStatus.QUEUED);
    });
  });

  describe('CancelPublicationUseCase', () => {
    it('throws PublicationStatusTransitionError if publication is already PUBLISHED', async () => {
      const pubRepo = createMockPublishingRepo();
      pubRepo.findById.mockResolvedValueOnce({
        ...dummyPublicationDetail,
        status: PublicationStatus.PUBLISHED,
      });
      const useCase = new CancelPublicationUseCase(pubRepo);

      await expect(
        useCase.execute({
          publicationId: 'pub-001',
          reason: 'Duplicate request',
          actingUserId: 'usr-001',
          permissions: [Permission.PUBLISH_CREATIVE],
        }),
      ).rejects.toThrow(PublicationStatusTransitionError);
    });

    it('successfully cancels a publication in READY status', async () => {
      const pubRepo = createMockPublishingRepo();
      const useCase = new CancelPublicationUseCase(pubRepo);

      await useCase.execute({
        publicationId: 'pub-001',
        reason: 'Client cancelled',
        actingUserId: 'usr-001',
        permissions: [Permission.PUBLISH_CREATIVE],
      });

      expect(pubRepo.updateStatus).toHaveBeenCalledWith(
        'pub-001',
        PublicationStatus.CANCELLED,
        expect.objectContaining({ cancellationReason: 'Client cancelled' }),
      );
    });
  });

  describe('ListPublicationsUseCase', () => {
    it('throws InsufficientPublishingPermissionError if user lacks any view permission', async () => {
      const pubRepo = createMockPublishingRepo();
      const useCase = new ListPublicationsUseCase(pubRepo);

      await expect(
        useCase.execute({
          actingUserId: 'usr-001',
          permissions: [],
        }),
      ).rejects.toThrow(InsufficientPublishingPermissionError);
    });

    it('lists publications with pagination when user has VIEW_OWN_CONTENT', async () => {
      const pubRepo = createMockPublishingRepo();
      const useCase = new ListPublicationsUseCase(pubRepo);

      const result = await useCase.execute({
        actingUserId: 'usr-001',
        permissions: [Permission.VIEW_OWN_CONTENT],
        page: 1,
        limit: 10,
      });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('GetPublicationDetailUseCase', () => {
    it('throws PublicationNotFoundError when non-admin views another user publication with VIEW_OWN_CONTENT only', async () => {
      const pubRepo = createMockPublishingRepo();
      const useCase = new GetPublicationDetailUseCase(pubRepo);

      await expect(
        useCase.execute({
          publicationId: 'pub-001',
          actingUserId: 'other-user-999',
          permissions: [Permission.VIEW_OWN_CONTENT],
        }),
      ).rejects.toThrow(PublicationNotFoundError);
    });

    it('returns detail when user is requester', async () => {
      const pubRepo = createMockPublishingRepo();
      const useCase = new GetPublicationDetailUseCase(pubRepo);

      const result = await useCase.execute({
        publicationId: 'pub-001',
        actingUserId: 'usr-001',
        permissions: [Permission.VIEW_OWN_CONTENT],
      });

      expect(result.id).toBe('pub-001');
    });

    it('returns detail when user has PUBLISH_CREATIVE regardless of requester', async () => {
      const pubRepo = createMockPublishingRepo();
      const useCase = new GetPublicationDetailUseCase(pubRepo);

      const result = await useCase.execute({
        publicationId: 'pub-001',
        actingUserId: 'admin-001',
        permissions: [Permission.PUBLISH_CREATIVE],
      });

      expect(result.id).toBe('pub-001');
    });
  });

  describe('ListEligibleAssetsUseCase', () => {
    it('returns eligible assets for authorized user', async () => {
      const pubRepo = createMockPublishingRepo();
      const useCase = new ListEligibleAssetsUseCase(pubRepo);

      const result = await useCase.execute({
        actingUserId: 'usr-001',
        permissions: [Permission.VIEW_OWN_CONTENT],
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.productName).toBe('Chanel No 5');
    });
  });

  describe('ListDestinationsUseCase', () => {
    it('returns channel capabilities with live publishing disabled for external channels', () => {
      const useCase = new ListDestinationsUseCase();
      const result = useCase.execute({
        permissions: [Permission.VIEW_OWN_CONTENT],
      });

      expect(result).toHaveLength(4);
      const telegram = result.find((d) => d.channel === PublicationChannel.TELEGRAM_CHANNEL);
      expect(telegram?.enabled).toBe(false);
      expect(telegram?.connected).toBe(true);

      const manualExport = result.find((d) => d.channel === PublicationChannel.MANUAL_EXPORT);
      expect(manualExport?.enabled).toBe(true);
      expect(manualExport?.connected).toBe(true);
    });
  });
});
