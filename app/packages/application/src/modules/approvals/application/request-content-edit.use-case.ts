import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError, ValidationError } from '@parisian-shopper/common';
import { Permission, PermissionService } from '../../auth/domain/permissions.js';
import {
  CONTENT_GENERATION_ENQUEUER,
  type ContentGenerationEnqueuer,
} from '../../telegram/application/content-generation-enqueuer.port.js';
import { type RevisionRequestRecord } from '../domain/approval.js';
import { APPROVALS_REPOSITORY, type ApprovalsRepository } from './approvals.repository.js';

export interface RequestContentEditInput {
  contentJobId: string;
  contentVersionId: string;
  actorUserId: string;
  actorRoles: readonly string[];
  instruction: string;
}

const MAX_INSTRUCTION_LENGTH = 1_000;

@Injectable()
export class RequestContentEditUseCase {
  public constructor(
    @Inject(APPROVALS_REPOSITORY) private readonly repository: ApprovalsRepository,
    @Inject(CONTENT_GENERATION_ENQUEUER) private readonly generation: ContentGenerationEnqueuer,
    private readonly permissions: PermissionService,
  ) {}

  public async execute(input: RequestContentEditInput): Promise<RevisionRequestRecord> {
    if (!this.permissions.hasAnyRolePermission(input.actorRoles, Permission.EDIT_CONTENT)) {
      throw new ForbiddenError({ publicMessage: 'Permission denied: Cannot edit content.' });
    }
    const trimmedInstruction = input.instruction.trim();
    if (trimmedInstruction.length === 0) {
      throw new ValidationError({ publicMessage: 'Edit instruction cannot be empty.' });
    }
    if (trimmedInstruction.length > MAX_INSTRUCTION_LENGTH) {
      throw new ValidationError({
        publicMessage: `Edit instruction cannot exceed ${MAX_INSTRUCTION_LENGTH} characters.`,
      });
    }

    const revision = await this.repository.createRevisionRequest({
      contentJobId: input.contentJobId,
      sourceContentVersionId: input.contentVersionId,
      requestedByUserId: input.actorUserId,
      type: 'EDIT',
      instruction: trimmedInstruction,
    });

    await this.generation.enqueue(input.contentJobId);
    return revision;
  }
}
