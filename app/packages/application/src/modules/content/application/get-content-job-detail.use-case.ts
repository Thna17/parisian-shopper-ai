import { Inject, Injectable, Optional } from '@nestjs/common';
import { ForbiddenError, NotFoundError } from '@parisian-shopper/common';

import { Permission, PermissionService } from '../../auth/domain/permissions.js';
import {
  CAMPAIGN_REPOSITORY,
  type CampaignRepository,
  type CampaignSummary,
} from '../../campaigns/application/campaign.repository.js';
import {
  PRODUCT_SNAPSHOT_REPOSITORY,
  type ProductSnapshot,
  type ProductSnapshotRepository,
} from '../../products/application/product-snapshot.repository.js';
import {
  VALIDATION_REPOSITORY,
  type PersistedValidationResult,
  type ValidationRepository,
} from '../../validation/application/validation.repository.js';
import {
  CONTENT_GENERATION_REPOSITORY,
  type ContentGenerationRepository,
  type ContentJob,
  type ContentVersion,
  type GenerationAttempt,
} from './content-generation.repository.js';

export interface GetContentJobDetailInput {
  readonly contentJobId: string;
  readonly actorUserId: string;
  readonly actorRoles: readonly string[];
}

export interface ContentJobDetail {
  readonly job: ContentJob;
  readonly productSnapshot?: ProductSnapshot | null;
  readonly campaign?: CampaignSummary | null;
  readonly attempts: readonly GenerationAttempt[];
  readonly versions: readonly ContentVersion[];
  readonly currentVersion?: ContentVersion | null;
  readonly latestValidationResult?: PersistedValidationResult | null;
}

@Injectable()
export class GetContentJobDetailUseCase {
  public constructor(
    @Inject(CONTENT_GENERATION_REPOSITORY)
    private readonly repository: ContentGenerationRepository,
    @Inject(PRODUCT_SNAPSHOT_REPOSITORY)
    private readonly snapshots: ProductSnapshotRepository,
    @Inject(VALIDATION_REPOSITORY)
    private readonly validationRepository: ValidationRepository,
    private readonly permissions: PermissionService,
    @Optional()
    @Inject(CAMPAIGN_REPOSITORY)
    private readonly campaigns?: CampaignRepository,
  ) {}

  public async execute(input: GetContentJobDetailInput): Promise<ContentJobDetail> {
    const canViewAny = this.permissions.hasAnyRolePermission(input.actorRoles, [
      Permission.VIEW_ALL_CONTENT,
      Permission.VIEW_OWN_CONTENT,
      Permission.CREATE_CONTENT,
      Permission.EDIT_CONTENT,
    ]);

    if (!canViewAny) {
      throw new ForbiddenError({
        publicMessage: 'Permission denied: Cannot view content job.',
      });
    }

    const job = await this.repository.findJobById(input.contentJobId);
    if (!job) {
      throw new NotFoundError({
        code: 'CONTENT_JOB_NOT_FOUND',
        publicMessage: 'Content job was not found.',
      });
    }

    const hasViewAll = this.permissions.hasAnyRolePermission(input.actorRoles, [
      Permission.VIEW_ALL_CONTENT,
    ]);

    if (!hasViewAll && job.requesterUserId !== input.actorUserId) {
      throw new ForbiddenError({
        publicMessage: 'Permission denied: Cannot view another user’s content job.',
      });
    }

    const [versions, attempts, snapshot] = await Promise.all([
      this.repository.findVersionsByJobId(job.id),
      this.repository.findAttemptsByJobId(job.id),
      this.snapshots.findById(job.productSnapshotId),
    ]);

    let campaign: CampaignSummary | null = null;
    if (job.campaignId && this.campaigns) {
      campaign = await this.campaigns.findById(job.campaignId);
    }

    const currentVersion = versions.length > 0 ? versions[versions.length - 1] : null;

    let latestValidationResult: PersistedValidationResult | null = null;
    if (currentVersion) {
      latestValidationResult = await this.validationRepository.findLatestByContentVersion(
        currentVersion.id,
      );
    }

    return {
      job,
      productSnapshot: snapshot,
      campaign,
      attempts,
      versions,
      currentVersion,
      latestValidationResult,
    };
  }
}
