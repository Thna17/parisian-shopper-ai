import { Inject, Injectable } from '@nestjs/common';
import {
  ApplicationError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@parisian-shopper/common';

import { Permission, PermissionService } from '../../auth/domain/permissions.js';
import { ValidateContentVersionUseCase } from '../../validation/application/validate-content-version.use-case.js';
import {
  VALIDATION_REPOSITORY,
  type PersistedValidationResult,
  type ValidationRepository,
} from '../../validation/application/validation.repository.js';
import { FindingSeverity } from '../../validation/domain/validation.js';
import { assertContentJobTransition } from '../domain/content.js';
import {
  CONTENT_GENERATION_REPOSITORY,
  type ContentGenerationRepository,
  type ContentJob,
  type ContentVersion,
} from './content-generation.repository.js';

export interface SubmitContentForReviewInput {
  readonly contentJobId: string;
  readonly contentVersionId: string;
  readonly actorUserId: string;
  readonly actorRoles: readonly string[];
}

export interface SubmitContentForReviewResult {
  readonly job: ContentJob;
  readonly version: ContentVersion;
  readonly validationResult: PersistedValidationResult;
}

@Injectable()
export class SubmitContentForReviewUseCase {
  public constructor(
    @Inject(CONTENT_GENERATION_REPOSITORY)
    private readonly repository: ContentGenerationRepository,
    @Inject(VALIDATION_REPOSITORY)
    private readonly validationRepository: ValidationRepository,
    private readonly validateContentVersion: ValidateContentVersionUseCase,
    private readonly permissions: PermissionService,
  ) {}

  public async execute(input: SubmitContentForReviewInput): Promise<SubmitContentForReviewResult> {
    const canSubmit =
      this.permissions.hasAnyRolePermission(input.actorRoles, Permission.CREATE_CONTENT) ||
      this.permissions.hasAnyRolePermission(input.actorRoles, Permission.EDIT_CONTENT);

    if (!canSubmit) {
      throw new ForbiddenError({
        publicMessage: 'Permission denied: Cannot submit content for review.',
      });
    }

    const job = await this.repository.findJobById(input.contentJobId);
    if (!job) {
      throw new NotFoundError({
        publicMessage: 'Content job was not found.',
      });
    }

    if (job.status !== 'DRAFT' && job.status !== 'REVISION_REQUESTED') {
      throw new ApplicationError({
        code: 'INVALID_CONTENT_JOB_STATE',
        publicMessage: `Cannot submit content for review when status is ${job.status}. Job must be in DRAFT or REVISION_REQUESTED.`,
      });
    }

    const version = await this.repository.findVersionById(input.contentVersionId);
    if (!version || version.contentJobId !== job.id) {
      throw new ValidationError({
        publicMessage: 'Content version was not found for this content job.',
      });
    }

    let validationResult = await this.validationRepository.findLatestByContentVersion(
      input.contentVersionId,
    );
    if (!validationResult) {
      validationResult = await this.validateContentVersion.execute(input.contentVersionId);
    }

    const hasBlockingFindings =
      validationResult.blockingCount > 0 ||
      validationResult.findings.some((f) => f.severity === FindingSeverity.BLOCKING);

    if (hasBlockingFindings) {
      throw new ValidationError({
        publicMessage:
          'Cannot submit content version for review: version has blocking factual validation errors.',
        details: {
          blockingCount: validationResult.blockingCount,
          findings: validationResult.findings.filter(
            (f) => f.severity === FindingSeverity.BLOCKING,
          ),
        },
      });
    }

    assertContentJobTransition(job.status, 'UNDER_REVIEW');

    const updatedJob = this.repository.updateJobStatus
      ? await this.repository.updateJobStatus(job.id, 'UNDER_REVIEW')
      : { ...job, status: 'UNDER_REVIEW' as const, updatedAt: new Date() };

    return {
      job: updatedJob,
      version,
      validationResult,
    };
  }
}
