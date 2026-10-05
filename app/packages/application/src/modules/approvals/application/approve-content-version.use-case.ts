import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError } from '@parisian-shopper/common';
import { Permission, PermissionService } from '../../auth/domain/permissions.js';
import { type ApprovalEventRecord } from '../domain/approval.js';
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

    return this.repository.createApproval({
      contentJobId: input.contentJobId,
      contentVersionId: input.contentVersionId,
      approverUserId: input.approverUserId,
      decision: 'APPROVED',
      ...(input.comment === undefined ? {} : { comment: input.comment }),
    });
  }
}
