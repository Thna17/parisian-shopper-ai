import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError } from '@parisian-shopper/common';
import { Permission, PermissionService } from '../../auth/domain/permissions.js';
import {
  CONTENT_GENERATION_ENQUEUER,
  type ContentGenerationEnqueuer,
} from '../../telegram/application/content-generation-enqueuer.port.js';
import { type RevisionRequestRecord } from '../domain/approval.js';
import { APPROVALS_REPOSITORY, type ApprovalsRepository } from './approvals.repository.js';

export interface RequestContentRegenerationInput {
  contentJobId: string;
  contentVersionId: string;
  actorUserId: string;
  actorRoles: readonly string[];
}

@Injectable()
export class RequestContentRegenerationUseCase {
  public constructor(
    @Inject(APPROVALS_REPOSITORY) private readonly repository: ApprovalsRepository,
    @Inject(CONTENT_GENERATION_ENQUEUER) private readonly generation: ContentGenerationEnqueuer,
    private readonly permissions: PermissionService,
  ) {}

  public async execute(input: RequestContentRegenerationInput): Promise<RevisionRequestRecord> {
    if (!this.permissions.hasAnyRolePermission(input.actorRoles, Permission.REGENERATE_CONTENT)) {
      throw new ForbiddenError({ publicMessage: 'Permission denied: Cannot regenerate content.' });
    }

    const revision = await this.repository.createRevisionRequest({
      contentJobId: input.contentJobId,
      sourceContentVersionId: input.contentVersionId,
      requestedByUserId: input.actorUserId,
      type: 'REGENERATE',
    });

    await this.generation.enqueue(input.contentJobId);
    return revision;
  }
}
