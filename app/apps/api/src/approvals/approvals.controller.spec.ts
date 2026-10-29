/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment */
import { jest } from '@jest/globals';
import {
  type ApproveContentVersionUseCase,
  ContentAlreadyApprovedError,
  ContentNotApprovalEligibleError,
  type GetReviewDeskDetailUseCase,
  type ListReviewQueueUseCase,
  Permission,
  type RejectContentVersionUseCase,
  type SanitizedEmployeeDto,
  SelfApprovalProhibitedError,
} from '@parisian-shopper/application';

import { ApprovalsController } from './approvals.controller.js';

describe('ApprovalsController (REVIEW-API-01 to REVIEW-API-10)', () => {
  let controller: ApprovalsController;
  let mockListReviewQueue: jest.Mocked<ListReviewQueueUseCase>;
  let mockGetReviewDeskDetail: jest.Mocked<GetReviewDeskDetailUseCase>;
  let mockApproveContentVersion: jest.Mocked<ApproveContentVersionUseCase>;
  let mockRejectContentVersion: jest.Mocked<RejectContentVersionUseCase>;

  const mockEmployee: SanitizedEmployeeDto = {
    id: 'emp-approver-001',
    displayName: 'Golden Approver',
    status: 'ACTIVE',
    roles: ['MARKETING_APPROVER'],
    permissions: [
      Permission.VIEW_OWN_CONTENT,
      Permission.VIEW_ALL_CONTENT,
      Permission.APPROVE_CONTENT,
      Permission.REJECT_CONTENT,
      Permission.VIEW_PRODUCTS,
    ],
  };

  const sampleDate = new Date('2026-10-29T10:00:00.000Z');

  beforeEach(() => {
    mockListReviewQueue = {
      execute: jest.fn<ListReviewQueueUseCase['execute']>().mockResolvedValue({
        items: [
          {
            jobId: 'job-111',
            jobStatus: 'UNDER_REVIEW',
            productSnapshotId: 'snap-111',
            sku: 'FIC-PERF-001',
            productName: 'Moonlit River Eau de Parfum',
            brand: 'Maison Imaginaire',
            priceUsd: 38,
            requesterUserId: 'emp-author-002',
            requesterDisplayName: 'Author Employee',
            currentVersionNumber: 1,
            targetVersionId: 'ver-111',
            targetVersionNumber: 1,
            targetVersionAuthorUserId: 'emp-author-002',
            headline: 'Moonlit River Fragrance',
            validationStatus: 'PASSED',
            blockingCount: 0,
            warningCount: 0,
            submittedAt: sampleDate,
            isEligibleToApprove: true,
            isEligibleToReject: true,
            ineligibilityReasons: [],
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      }),
    } as unknown as jest.Mocked<ListReviewQueueUseCase>;

    mockGetReviewDeskDetail = {
      execute: jest.fn<GetReviewDeskDetailUseCase['execute']>().mockResolvedValue({
        job: {
          id: 'job-111',
          contentType: 'PRODUCT_SPOTLIGHT',
          language: 'EN',
          platform: 'INSTAGRAM',
          status: 'UNDER_REVIEW',
          requesterUserId: 'emp-author-002',
          createdAt: sampleDate,
          updatedAt: sampleDate,
        },
        productSnapshot: {
          id: 'snap-111',
          sku: 'FIC-PERF-001',
          productName: 'Moonlit River Eau de Parfum',
          brand: 'Maison Imaginaire',
          priceUsd: 38,
        },
        versions: [
          {
            id: 'ver-111',
            versionNumber: 1,
            authorUserId: 'emp-author-002',
            headline: 'Moonlit River Fragrance',
            createdAt: sampleDate,
          },
        ],
        targetVersion: {
          id: 'ver-111',
          versionNumber: 1,
          authorUserId: 'emp-author-002',
          headline: 'Moonlit River Fragrance',
          createdAt: sampleDate,
          structuredOutput: {
            headline: 'Moonlit River Fragrance',
          },
        },
        approvalEvents: [],
        eligibility: {
          canApprove: true,
          canReject: true,
          ineligibilityReasons: [],
          selfRequested: false,
          selfAuthored: false,
          missingPermission: false,
          hasBlockingFindings: false,
          notUnderReview: false,
          isStaleVersion: false,
        },
      }),
    } as unknown as jest.Mocked<GetReviewDeskDetailUseCase>;

    mockApproveContentVersion = {
      execute: jest.fn<ApproveContentVersionUseCase['execute']>().mockResolvedValue({
        id: 'appr-event-111',
        contentJobId: 'job-111',
        contentVersionId: 'ver-111',
        approverUserId: mockEmployee.id,
        approverDisplayName: mockEmployee.displayName,
        decision: 'APPROVED',
        comment: 'Verified against catalog MSRP',
        createdAt: sampleDate,
      }),
    } as unknown as jest.Mocked<ApproveContentVersionUseCase>;

    mockRejectContentVersion = {
      execute: jest.fn<RejectContentVersionUseCase['execute']>().mockResolvedValue({
        id: 'rej-event-111',
        contentJobId: 'job-111',
        contentVersionId: 'ver-111',
        approverUserId: mockEmployee.id,
        approverDisplayName: mockEmployee.displayName,
        decision: 'REJECTED',
        comment: 'Headline violates tone guidelines',
        createdAt: sampleDate,
      }),
    } as unknown as jest.Mocked<RejectContentVersionUseCase>;

    controller = new ApprovalsController(
      mockListReviewQueue,
      mockGetReviewDeskDetail,
      mockApproveContentVersion,
      mockRejectContentVersion,
    );
  });

  describe('getQueue & shortcuts (REVIEW-API-01 to REVIEW-API-03)', () => {
    it('REVIEW-API-01: getQueue returns paginated review items with ISO dates and eligibility', async () => {
      const result = await controller.getQueue(
        { page: 1, limit: 10, status: 'UNDER_REVIEW' },
        mockEmployee,
      );

      expect(mockListReviewQueue.execute).toHaveBeenCalledWith({
        actorUserId: mockEmployee.id,
        actorRoles: mockEmployee.roles,
        query: {
          page: 1,
          limit: 10,
          status: 'UNDER_REVIEW',
          productSnapshotId: undefined,
          campaignId: undefined,
          search: undefined,
        },
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.jobId).toBe('job-111');
      expect(result.items[0]?.isEligibleToApprove).toBe(true);
      expect(result.items[0]?.submittedAt).toBe('2026-10-29T10:00:00.000Z');
    });

    it('REVIEW-API-02: getPending sets status to UNDER_REVIEW', async () => {
      await controller.getPending({ page: 1, limit: 20 }, mockEmployee);

      expect(mockListReviewQueue.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({ status: 'UNDER_REVIEW' }),
        }),
      );
    });

    it('REVIEW-API-03: getHistory sets status to HISTORY', async () => {
      await controller.getHistory({ page: 1, limit: 20 }, mockEmployee);

      expect(mockListReviewQueue.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({ status: 'HISTORY' }),
        }),
      );
    });
  });

  describe('getDetail (REVIEW-API-04)', () => {
    it('REVIEW-API-04: getDetail returns full review desk detail with product MSRP and eligibility', async () => {
      const result = await controller.getDetail('job-111', mockEmployee, 'ver-111');

      expect(mockGetReviewDeskDetail.execute).toHaveBeenCalledWith({
        contentJobId: 'job-111',
        versionId: 'ver-111',
        actorUserId: mockEmployee.id,
        actorRoles: mockEmployee.roles,
      });

      expect(result.job.id).toBe('job-111');
      expect(result.productSnapshot.sku).toBe('FIC-PERF-001');
      expect(result.productSnapshot.priceUsd).toBe(38);
      expect(result.eligibility.canApprove).toBe(true);
    });
  });

  describe('approve (REVIEW-API-05, REVIEW-API-07 to REVIEW-API-10)', () => {
    it('REVIEW-API-05 & REVIEW-API-07: approves exact content version with optional comment', async () => {
      const result = await controller.approve(
        'job-111',
        { versionId: 'ver-111', comment: 'Verified against catalog MSRP' },
        mockEmployee,
      );

      expect(mockApproveContentVersion.execute).toHaveBeenCalledWith({
        contentJobId: 'job-111',
        contentVersionId: 'ver-111',
        approverUserId: mockEmployee.id,
        approverRoles: mockEmployee.roles,
        comment: 'Verified against catalog MSRP',
      });

      expect(result.decision).toBe('APPROVED');
      expect(result.approverUserId).toBe(mockEmployee.id);
    });

    it('REVIEW-API-08: Four-Eyes policy: propagates SelfApprovalProhibitedError on self-approval attempt', async () => {
      mockApproveContentVersion.execute.mockRejectedValueOnce(
        new SelfApprovalProhibitedError(
          'Four-eyes policy violation: Content job requester cannot approve their own content.',
        ),
      );

      await expect(
        controller.approve('job-111', { versionId: 'ver-111' }, mockEmployee),
      ).rejects.toThrow(SelfApprovalProhibitedError);
    });

    it('REVIEW-API-09: Double approval conflict: propagates ContentAlreadyApprovedError', async () => {
      mockApproveContentVersion.execute.mockRejectedValueOnce(
        new ContentAlreadyApprovedError('Content has already been approved.'),
      );

      await expect(
        controller.approve('job-111', { versionId: 'ver-111' }, mockEmployee),
      ).rejects.toThrow(ContentAlreadyApprovedError);
    });

    it('REVIEW-API-10: Ineligible approval: propagates ContentNotApprovalEligibleError on blocking errors', async () => {
      mockApproveContentVersion.execute.mockRejectedValueOnce(
        new ContentNotApprovalEligibleError(
          'Content version is blocked by factual validation and cannot be approved.',
        ),
      );

      await expect(
        controller.approve('job-111', { versionId: 'ver-111' }, mockEmployee),
      ).rejects.toThrow(ContentNotApprovalEligibleError);
    });
  });

  describe('reject (REVIEW-API-06)', () => {
    it('REVIEW-API-06: rejects exact content version with mandatory reason', async () => {
      const result = await controller.reject(
        'job-111',
        { versionId: 'ver-111', reason: 'Headline violates tone guidelines' },
        mockEmployee,
      );

      expect(mockRejectContentVersion.execute).toHaveBeenCalledWith({
        contentJobId: 'job-111',
        contentVersionId: 'ver-111',
        approverUserId: mockEmployee.id,
        approverRoles: mockEmployee.roles,
        comment: 'Headline violates tone guidelines',
      });

      expect(result.decision).toBe('REJECTED');
      expect(result.comment).toBe('Headline violates tone guidelines');
    });
  });
});
