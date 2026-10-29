import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError } from '@parisian-shopper/common';

import { Permission, PermissionService } from '../../auth/domain/permissions.js';
import {
  type ListReviewQueueQuery,
  type PaginatedReviewQueue,
  type ReviewQueueItem,
} from '../domain/approval.js';
import { APPROVALS_REPOSITORY, type ApprovalsRepository } from './approvals.repository.js';

export interface ListReviewQueueInput {
  readonly actorUserId: string;
  readonly actorRoles: readonly string[];
  readonly query: ListReviewQueueQuery;
}

@Injectable()
export class ListReviewQueueUseCase {
  public constructor(
    @Inject(APPROVALS_REPOSITORY) private readonly repository: ApprovalsRepository,
    private readonly permissions: PermissionService,
  ) {}

  public async execute(input: ListReviewQueueInput): Promise<PaginatedReviewQueue> {
    const hasApprovePerm = this.permissions.hasAnyRolePermission(
      input.actorRoles,
      Permission.APPROVE_CONTENT,
    );
    const hasRejectPerm = this.permissions.hasAnyRolePermission(
      input.actorRoles,
      Permission.REJECT_CONTENT,
    );
    const hasViewAll = this.permissions.hasAnyRolePermission(
      input.actorRoles,
      Permission.VIEW_ALL_CONTENT,
    );
    const hasViewOwn = this.permissions.hasAnyRolePermission(
      input.actorRoles,
      Permission.VIEW_OWN_CONTENT,
    );

    if (!hasApprovePerm && !hasRejectPerm && !hasViewAll && !hasViewOwn) {
      throw new ForbiddenError({
        publicMessage: 'Permission denied: Cannot view approval review queue.',
      });
    }

    const scopeToOwn = !hasApprovePerm && !hasViewAll && hasViewOwn;
    const repoQuery = {
      ...input.query,
      ...(scopeToOwn ? { requesterUserId: input.actorUserId } : {}),
    };

    const paginated = await this.repository.findReviewQueue(repoQuery);

    const items: readonly ReviewQueueItem[] = paginated.items.map((item) => {
      const ineligibilityReasons: string[] = [];

      if (!hasApprovePerm) {
        ineligibilityReasons.push('NO_PERMISSION');
      }

      if (item.jobStatus !== 'UNDER_REVIEW') {
        ineligibilityReasons.push('NOT_UNDER_REVIEW');
      }

      if (item.requesterUserId === input.actorUserId) {
        ineligibilityReasons.push('SELF_REQUESTED');
      }

      if (item.targetVersionAuthorUserId === input.actorUserId) {
        ineligibilityReasons.push('SELF_AUTHORED');
      }

      const isValidationPassed =
        (item.validationStatus === 'PASSED' || item.validationStatus === 'PASSED_WITH_WARNINGS') &&
        item.blockingCount === 0;

      if (!isValidationPassed) {
        ineligibilityReasons.push('BLOCKING_FINDINGS');
      }

      const isEligibleToApprove = ineligibilityReasons.length === 0;
      const isEligibleToReject = hasRejectPerm && item.jobStatus === 'UNDER_REVIEW';

      return {
        ...item,
        isEligibleToApprove,
        isEligibleToReject,
        ineligibilityReasons,
      };
    });

    return {
      items,
      total: paginated.total,
      page: paginated.page,
      limit: paginated.limit,
      totalPages: paginated.totalPages,
    };
  }
}
