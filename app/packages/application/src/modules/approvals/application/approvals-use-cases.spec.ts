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
  const getReviewState = jest.fn((_jobId: string): Promise<ContentReviewState | null> =>
    Promise.resolve(null),
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

    it('approves content version when actor is MARKETING_APPROVER', async () => {
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

    it('rejects approval if actor is only MARKETING_EDITOR', async () => {
      await expect(
        useCase.execute({
          contentJobId: 'job-1',
          contentVersionId: 'ver-1',
          approverUserId: 'user-1',
          approverRoles: [RoleCode.MARKETING_EDITOR],
        }),
      ).rejects.toThrow(ForbiddenError);
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
  });
});
