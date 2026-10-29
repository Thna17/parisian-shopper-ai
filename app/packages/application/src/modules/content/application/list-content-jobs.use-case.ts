import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError } from '@parisian-shopper/common';

import { Permission, PermissionService } from '../../auth/domain/permissions.js';
import {
  CONTENT_GENERATION_REPOSITORY,
  type ContentGenerationRepository,
  type ListContentJobsQuery,
  type PaginatedContentJobs,
} from './content-generation.repository.js';

export interface ListContentJobsInput {
  readonly actorUserId: string;
  readonly actorRoles: readonly string[];
  readonly query: ListContentJobsQuery;
}

@Injectable()
export class ListContentJobsUseCase {
  public constructor(
    @Inject(CONTENT_GENERATION_REPOSITORY)
    private readonly repository: ContentGenerationRepository,
    private readonly permissions: PermissionService,
  ) {}

  public async execute(input: ListContentJobsInput): Promise<PaginatedContentJobs> {
    const canViewAny =
      this.permissions.hasAnyRolePermission(input.actorRoles, Permission.VIEW_ALL_CONTENT) ||
      this.permissions.hasAnyRolePermission(input.actorRoles, Permission.VIEW_OWN_CONTENT) ||
      this.permissions.hasAnyRolePermission(input.actorRoles, Permission.CREATE_CONTENT) ||
      this.permissions.hasAnyRolePermission(input.actorRoles, Permission.EDIT_CONTENT);

    if (!canViewAny) {
      throw new ForbiddenError({
        publicMessage: 'Permission denied: Cannot view content jobs.',
      });
    }

    const hasViewAll = this.permissions.hasAnyRolePermission(
      input.actorRoles,
      Permission.VIEW_ALL_CONTENT,
    );

    const effectiveQuery: ListContentJobsQuery = {
      ...input.query,
      ...(hasViewAll
        ? input.query.requesterUserId !== undefined
          ? { requesterUserId: input.query.requesterUserId }
          : {}
        : { requesterUserId: input.actorUserId }),
    };

    if (this.repository.findPaginatedJobs) {
      return this.repository.findPaginatedJobs(effectiveQuery);
    }

    return {
      items: [],
      total: 0,
      page: input.query.page ?? 1,
      limit: input.query.limit ?? 20,
      totalPages: 1,
    };
  }
}
