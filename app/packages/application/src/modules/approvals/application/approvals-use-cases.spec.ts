import { jest } from '@jest/globals';
import { ForbiddenError, ValidationError } from '@parisian-shopper/common';
import { PermissionService, RoleCode } from '../../auth/domain/permissions.js';
import { type ContentGenerationEnqueuer } from '../../telegram/application/content-generation-enqueuer.port.js';
import {
  type ApprovalEventRecord,
  type ApprovalStatusView,
  type ContentReviewState,
  type PendingReviewInteractionRecord,
  type RevisionRequestRecord,
} from '../domain/approval.js';
import { SelfApprovalProhibitedError } from '../domain/approval-errors.js';
import { type ApprovalsRepository } from './approvals.repository.js';
import { ApproveContentVersionUseCase } from './approve-content-version.use-case.js';
import { RejectContentVersionUseCase } from './reject-content-version.use-case.js';
import { RequestContentEditUseCase } from './request-content-edit.use-case.js';
import { RequestContentRegenerationUseCase } from './request-content-regeneration.use-case.js';

describe('Approvals Use Cases', () => {
  const permissions = new PermissionService();

  const enqueue = jest.fn((_jobId: string): Promise<void> => Promise.resolve());
  const mockEnqueuer: ContentGenerationEnqueuer = { enqueue };

  const createRevisionRequest = jest.fn(
    (
      input: Parameters<ApprovalsRepository['createRevisionRequest']>[0],
    ): Promise<RevisionRequestRecord> =>
      Promise.resolve({
        id: 'rev-1',
        contentJobId: input.contentJobId,
        sourceContentVersionId: input.sourceContentVersionId,
        requestedByUserId: input.requestedByUserId,
        type: input.type,
        ...(input.instruction !== undefined ? { instruction: input.instruction } : {}),
        status: 'PENDING',
        createdAt: new Date(),
      }),
  );
  const findActiveRevisionRequest = jest.fn(
    (_jobId: string): Promise<RevisionRequestRecord | null> => Promise.resolve(null),
  );
  const findRevisionRequestsByJobId = jest.fn(
    (_jobId: string): Promise<readonly RevisionRequestRecord[]> => Promise.resolve([]),
  );
  const createApproval = jest.fn(
    (input: Parameters<ApprovalsRepository['createApproval']>[0]): Promise<ApprovalEventRecord> =>
      Promise.resolve({
        id: 'app-1',
        contentJobId: input.contentJobId,
        contentVersionId: input.contentVersionId,
        approverUserId: input.approverUserId,
        decision: input.decision,
        ...(input.comment !== undefined ? { comment: input.comment } : {}),
        createdAt: new Date(),
      }),
  );
  const findApprovalEventByJobId = jest.fn((_jobId: string): Promise<ApprovalEventRecord | null> =>
    Promise.resolve(null),
  );

  const mockReviewState: ContentReviewState = {
    jobId: 'job-1',
    jobStatus: 'UNDER_REVIEW',
    productSnapshotId: 'snap-1',
    sku: 'SKU-1',
    productName: 'Sample Product',
    requesterUserId: 'requester-1',
    currentVersionNumber: 2,
    versions: [
      {
        id: 'ver-1',
        versionNumber: 1,
        authorUserId: 'requester-1',
        createdAt: new Date(),
        approvalEligible: true,
        headline: 'V1 Headline',
      },
      {
        id: 'ver-2',
        versionNumber: 2,
        authorUserId: 'editor-2',
        createdAt: new Date(),
        approvalEligible: true,
        headline: 'V2 Headline',
      },
    ],
  };

  const getReviewState = jest.fn((_jobId: string): Promise<ContentReviewState | null> =>
    Promise.resolve(mockReviewState),
  );
  const getApprovalStatus = jest.fn((_jobId: string): Promise<ApprovalStatusView | null> =>
    Promise.resolve(null),
  );
  const createPendingInteraction = jest.fn(
    (
      input: Parameters<ApprovalsRepository['createPendingInteraction']>[0],
    ): Promise<PendingReviewInteractionRecord> =>
      Promise.resolve({
        id: 'pi-1',
        telegramIdentityId: input.telegramIdentityId,
        contentJobId: input.contentJobId,
        contentVersionId: input.contentVersionId,
        action: input.action,
        expiresAt: input.expiresAt,
        createdAt: new Date(),
      }),
  );
  const findActivePendingInteraction = jest.fn(
    (_telegramIdentityId: string, _now: Date): Promise<PendingReviewInteractionRecord | null> =>
      Promise.resolve(null),
  );
  const completePendingInteraction = jest.fn((_id: string, _now: Date): Promise<void> =>
    Promise.resolve(),
  );
  const cancelPendingInteraction = jest.fn((_id: string, _now: Date): Promise<void> =>
    Promise.resolve(),
  );

  const mockRepository: ApprovalsRepository = {
    createRevisionRequest,
    findActiveRevisionRequest,
    findRevisionRequestsByJobId,
    createApproval,
    findApprovalEventByJobId,
    getReviewState,
    getApprovalStatus,
    createPendingInteraction,
    findActivePendingInteraction,
    completePendingInteraction,
    cancelPendingInteraction,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('RequestContentEditUseCase', () => {
    const useCase = new RequestContentEditUseCase(mockRepository, mockEnqueuer, permissions);

    it('creates revision request and enqueues generation for MARKETING_EDITOR', async () => {
      const result = await useCase.execute({
        contentJobId: 'job-1',
        contentVersionId: 'ver-1',
        actorUserId: 'user-1',
        actorRoles: [RoleCode.MARKETING_EDITOR],
        instruction: 'Shorten the caption and highlight vanilla notes',
      });

      expect(result.id).toBe('rev-1');
      expect(result.type).toBe('EDIT');
      expect(createRevisionRequest).toHaveBeenCalledWith({
        contentJobId: 'job-1',
        sourceContentVersionId: 'ver-1',
        requestedByUserId: 'user-1',
        type: 'EDIT',
        instruction: 'Shorten the caption and highlight vanilla notes',
      });
      expect(enqueue).toHaveBeenCalledWith('job-1');
    });

    it('rejects if actor lacks EDIT_CONTENT permission (e.g. VIEWER)', async () => {
      await expect(
        useCase.execute({
          contentJobId: 'job-1',
          contentVersionId: 'ver-1',
          actorUserId: 'user-1',
          actorRoles: [RoleCode.VIEWER],
          instruction: 'Some edits',
        }),
      ).rejects.toThrow(ForbiddenError);
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('rejects empty instructions', async () => {
      await expect(
        useCase.execute({
          contentJobId: 'job-1',
          contentVersionId: 'ver-1',
          actorUserId: 'user-1',
          actorRoles: [RoleCode.MARKETING_EDITOR],
          instruction: '   ',
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects instructions exceeding 1000 characters', async () => {
      await expect(
        useCase.execute({
          contentJobId: 'job-1',
          contentVersionId: 'ver-1',
          actorUserId: 'user-1',
          actorRoles: [RoleCode.MARKETING_EDITOR],
          instruction: 'a'.repeat(1001),
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('RequestContentRegenerationUseCase', () => {
    const useCase = new RequestContentRegenerationUseCase(
      mockRepository,
      mockEnqueuer,
      permissions,
    );

    it('creates regeneration request and enqueues generation for MARKETING_EDITOR', async () => {
      const result = await useCase.execute({
        contentJobId: 'job-1',
        contentVersionId: 'ver-1',
        actorUserId: 'user-1',
        actorRoles: [RoleCode.MARKETING_EDITOR],
      });

      expect(result.id).toBe('rev-1');
      expect(result.type).toBe('REGENERATE');
      expect(createRevisionRequest).toHaveBeenCalledWith({
        contentJobId: 'job-1',
        sourceContentVersionId: 'ver-1',
        requestedByUserId: 'user-1',
        type: 'REGENERATE',
      });
      expect(enqueue).toHaveBeenCalledWith('job-1');
    });

    it('rejects if actor lacks REGENERATE_CONTENT permission', async () => {
      await expect(
        useCase.execute({
          contentJobId: 'job-1',
          contentVersionId: 'ver-1',
          actorUserId: 'user-1',
          actorRoles: [RoleCode.VIEWER],
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('ApproveContentVersionUseCase', () => {
    const useCase = new ApproveContentVersionUseCase(mockRepository, permissions);

    it('SEC-APP-01: independent approval succeeds when approver differs from requester and author', async () => {
      const result = await useCase.execute({
        contentJobId: 'job-1',
        contentVersionId: 'ver-1',
        approverUserId: 'approver-1',
        approverRoles: [RoleCode.MARKETING_APPROVER],
      });

      expect(result.decision).toBe('APPROVED');
      expect(createApproval).toHaveBeenCalledWith({
        contentJobId: 'job-1',
        contentVersionId: 'ver-1',
        approverUserId: 'approver-1',
        decision: 'APPROVED',
      });
    });

    it('SEC-APP-02: requester self-approval fails even if requester possesses MARKETING_APPROVER role', async () => {
      await expect(
        useCase.execute({
          contentJobId: 'job-1',
          contentVersionId: 'ver-1',
          approverUserId: 'requester-1',
          approverRoles: [RoleCode.MARKETING_APPROVER],
        }),
      ).rejects.toThrow(SelfApprovalProhibitedError);

      expect(createApproval).not.toHaveBeenCalled();
    });

    it('SEC-APP-02: requester self-approval fails even if requester possesses ADMIN role', async () => {
      await expect(
        useCase.execute({
          contentJobId: 'job-1',
          contentVersionId: 'ver-1',
          approverUserId: 'requester-1',
          approverRoles: [RoleCode.ADMIN],
        }),
      ).rejects.toThrow(SelfApprovalProhibitedError);

      expect(createApproval).not.toHaveBeenCalled();
    });

    it('SEC-APP-03: version author self-approval fails when approver authored that revision', async () => {
      // editor-2 authored ver-2, and possesses MARKETING_APPROVER
      await expect(
        useCase.execute({
          contentJobId: 'job-1',
          contentVersionId: 'ver-2',
          approverUserId: 'editor-2',
          approverRoles: [RoleCode.MARKETING_APPROVER],
        }),
      ).rejects.toThrow(SelfApprovalProhibitedError);

      expect(createApproval).not.toHaveBeenCalled();
    });

    it('SEC-APP-04: rejects approval if actor lacks APPROVE_CONTENT permission (e.g. MARKETING_EDITOR)', async () => {
      await expect(
        useCase.execute({
          contentJobId: 'job-1',
          contentVersionId: 'ver-1',
          approverUserId: 'independent-editor-1',
          approverRoles: [RoleCode.MARKETING_EDITOR],
        }),
      ).rejects.toThrow(ForbiddenError);

      expect(createApproval).not.toHaveBeenCalled();
    });

    it('SEC-APP-08: no side effects after denial: createApproval is never invoked on self-approval failure', async () => {
      try {
        await useCase.execute({
          contentJobId: 'job-1',
          contentVersionId: 'ver-1',
          approverUserId: 'requester-1',
          approverRoles: [RoleCode.MARKETING_APPROVER],
        });
      } catch (err) {
        expect(err).toBeInstanceOf(SelfApprovalProhibitedError);
      }

      expect(createApproval).not.toHaveBeenCalled();
    });
  });

  describe('RejectContentVersionUseCase', () => {
    const useCase = new RejectContentVersionUseCase(mockRepository, permissions);

    it('rejects content version with comment when actor is ADMIN', async () => {
      const result = await useCase.execute({
        contentJobId: 'job-1',
        contentVersionId: 'ver-1',
        approverUserId: 'admin-1',
        approverRoles: [RoleCode.ADMIN],
        comment: 'Too wordy for Instagram',
      });

      expect(result.decision).toBe('REJECTED');
      expect(createApproval).toHaveBeenCalledWith({
        contentJobId: 'job-1',
        contentVersionId: 'ver-1',
        approverUserId: 'admin-1',
        decision: 'REJECTED',
        comment: 'Too wordy for Instagram',
      });
    });

    it('rejects if actor is only MARKETING_EDITOR', async () => {
      await expect(
        useCase.execute({
          contentJobId: 'job-1',
          contentVersionId: 'ver-1',
          approverUserId: 'user-1',
          approverRoles: [RoleCode.MARKETING_EDITOR],
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('SEC-APP-10: rejection behavior is preserved: requester can reject content with rejection reason', async () => {
      const result = await useCase.execute({
        contentJobId: 'job-1',
        contentVersionId: 'ver-1',
        approverUserId: 'requester-1',
        approverRoles: [RoleCode.ADMIN],
        comment: 'Requester rejecting own draft for major rework',
      });

      expect(result.decision).toBe('REJECTED');
      expect(createApproval).toHaveBeenCalledWith({
        contentJobId: 'job-1',
        contentVersionId: 'ver-1',
        approverUserId: 'requester-1',
        decision: 'REJECTED',
        comment: 'Requester rejecting own draft for major rework',
      });
    });
  });
});
