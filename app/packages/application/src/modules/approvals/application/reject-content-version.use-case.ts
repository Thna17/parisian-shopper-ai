import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError, ValidationError } from '@parisian-shopper/common';
import { Permission, PermissionService } from '../../auth/domain/permissions.js';
import { type ApprovalEventRecord } from '../domain/approval.js';
import { APPROVALS_REPOSITORY, type ApprovalsRepository } from './approvals.repository.js';

export interface RejectContentVersionInput {
  contentJobId: string;
  contentVersionId: string;
  approverUserId: string;
  approverRoles: readonly string[];
  comment?: string;
}

const MAX_COMMENT_LENGTH = 1_000;

@Injectable()
export class RejectContentVersionUseCase {
  public constructor(
    @Inject(APPROVALS_REPOSITORY) private readonly repository: ApprovalsRepository,
    private readonly permissions: PermissionService,
  ) {}

  public async execute(input: RejectContentVersionInput): Promise<ApprovalEventRecord> {
    if (!this.permissions.hasAnyRolePermission(input.approverRoles, Permission.REJECT_CONTENT)) {
      throw new ForbiddenError({ publicMessage: 'Permission denied: Cannot reject content.' });
    }

    const trimmedComment = input.comment?.trim();
    if (trimmedComment !== undefined && trimmedComment.length > MAX_COMMENT_LENGTH) {
      throw new ValidationError({
        publicMessage: `Rejection comment cannot exceed ${MAX_COMMENT_LENGTH} characters.`,
      });
    }

    return this.repository.createApproval({
      contentJobId: input.contentJobId,
      contentVersionId: input.contentVersionId,
      approverUserId: input.approverUserId,
      decision: 'REJECTED',
      ...(trimmedComment === undefined ? {} : { comment: trimmedComment }),
    });
  }
}
