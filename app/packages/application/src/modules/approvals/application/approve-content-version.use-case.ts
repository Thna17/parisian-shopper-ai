import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError } from '@parisian-shopper/common';
import { Permission, PermissionService } from '../../auth/domain/permissions.js';
import { type ApprovalEventRecord } from '../domain/approval.js';
import { SelfApprovalProhibitedError } from '../domain/approval-errors.js';
import { APPROVALS_REPOSITORY, type ApprovalsRepository } from './approvals.repository.js';

export interface ApproveContentVersionInput {
  contentJobId: string;
  contentVersionId: string;
  approverUserId: string;
  approverRoles: readonly string[];
  comment?: string;
}

@Injectable()
export class ApproveContentVersionUseCase {
  public constructor(
    @Inject(APPROVALS_REPOSITORY) private readonly repository: ApprovalsRepository,
    private readonly permissions: PermissionService,
  ) {}

  public async execute(input: ApproveContentVersionInput): Promise<ApprovalEventRecord> {
    if (!this.permissions.hasAnyRolePermission(input.approverRoles, Permission.APPROVE_CONTENT)) {
      throw new ForbiddenError({ publicMessage: 'Permission denied: Cannot approve content.' });
    }

    const reviewState = await this.repository.getReviewState(input.contentJobId);
    if (reviewState !== null) {
      if (reviewState.requesterUserId === input.approverUserId) {
        throw new SelfApprovalProhibitedError(
          'Four-eyes policy violation: Content job requester cannot approve their own content.',
        );
      }

      const targetVersion = reviewState.versions.find((v) => v.id === input.contentVersionId);
      if (targetVersion?.authorUserId === input.approverUserId) {
        throw new SelfApprovalProhibitedError(
          'Four-eyes policy violation: Version author cannot approve their own content revision.',
        );
      }
    }

    return this.repository.createApproval({
      contentJobId: input.contentJobId,
      contentVersionId: input.contentVersionId,
      approverUserId: input.approverUserId,
      decision: 'APPROVED',
      ...(input.comment === undefined ? {} : { comment: input.comment }),
    });
  }
}
