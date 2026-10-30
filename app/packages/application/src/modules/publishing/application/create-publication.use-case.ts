import { Inject, Injectable, Optional } from '@nestjs/common';
import { Permission } from '../../auth/domain/permissions.js';
import { ValidationError } from '@parisian-shopper/common';
import {
  APPROVALS_REPOSITORY,
  type ApprovalsRepository,
} from '../../approvals/application/approvals.repository.js';
import {
  CONTENT_GENERATION_REPOSITORY,
  type ContentGenerationRepository,
} from '../../content/application/content-generation.repository.js';
import {
  CREATIVE_EXPORT_REPOSITORY,
  type CreativeExportRepository,
} from '../../creative/application/creative-export.repository.js';
import {
  CREATIVE_APPROVAL_REPOSITORY,
  type CreativeApprovalRepository,
} from '../../creative/application/creative-approval.repository.js';
import {
  type CreatePublicationInput,
  PublicationChannel,
  type PublicationRecord,
  PublicationStatus,
} from '../domain/publication.types.js';
import {
  ContentVersionNotApprovedError,
  InsufficientPublishingPermissionError,
} from '../domain/publishing-errors.js';
import { PUBLISHING_REPOSITORY, type PublishingRepository } from './publishing.repository.js';

@Injectable()
export class CreatePublicationUseCase {
  public constructor(
    @Inject(PUBLISHING_REPOSITORY)
    private readonly publishingRepository: PublishingRepository,
    @Inject(CONTENT_GENERATION_REPOSITORY)
    private readonly contentGenerationRepository: ContentGenerationRepository,
    @Inject(APPROVALS_REPOSITORY)
    private readonly approvalsRepository: ApprovalsRepository,
    @Optional()
    @Inject(CREATIVE_EXPORT_REPOSITORY)
    private readonly creativeExportRepository?: CreativeExportRepository,
    @Optional()
    @Inject(CREATIVE_APPROVAL_REPOSITORY)
    private readonly creativeApprovalRepository?: CreativeApprovalRepository,
  ) {}

  public async execute(input: CreatePublicationInput): Promise<PublicationRecord> {
    if (!input.permissions.includes(Permission.PUBLISH_CREATIVE)) {
      throw new InsufficientPublishingPermissionError();
    }

    // Idempotency check: if a record exists with this key, return it idempotently
    const existing = await this.publishingRepository.findByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      return existing;
    }

    // Validate that the content version exists
    const version = await this.contentGenerationRepository.findVersionById(input.contentVersionId);
    if (!version) {
      throw new ContentVersionNotApprovedError(input.contentVersionId);
    }

    // Validate that the content version has an APPROVED decision
    const approvalEvents = await this.approvalsRepository.findApprovalEventsByJobId(
      version.contentJobId,
    );
    const isApproved = approvalEvents.some(
      (event) => event.contentVersionId === input.contentVersionId && event.decision === 'APPROVED',
    );

    if (!isApproved) {
      throw new ContentVersionNotApprovedError(input.contentVersionId);
    }

    // SEC-CREATIVE-18: If a creative export ID is provided, verify it is verified and approved
    if (input.creativeExportId && this.creativeExportRepository) {
      const exportRecord = await this.creativeExportRepository.findById(input.creativeExportId);
      if (!exportRecord) {
        throw new ValidationError({
          publicMessage: `Creative export ${input.creativeExportId} not found.`,
        });
      }
      if (exportRecord.validationStatus !== 'PASSED') {
        throw new ValidationError({
          publicMessage: `Creative export ${input.creativeExportId} validation status is not PASSED (current: ${exportRecord.validationStatus}).`,
        });
      }
      if (this.creativeApprovalRepository) {
        const approvals = await this.creativeApprovalRepository.findByAssetId(
          exportRecord.visualAssetId,
        );
        const hasApprovedCreative = approvals.some(
          (a) =>
            a.decision === 'CREATIVE_APPROVED' && a.creativeJobId === exportRecord.creativeJobId,
        );
        if (!hasApprovedCreative) {
          throw new ValidationError({
            publicMessage: `Creative export ${input.creativeExportId} references visual asset ${exportRecord.visualAssetId} which is not approved for publication.`,
          });
        }
      }
    }

    // Manual export can immediately be set to READY; other destinations start in DRAFT
    const status =
      input.destinationChannel === PublicationChannel.MANUAL_EXPORT
        ? PublicationStatus.READY
        : PublicationStatus.DRAFT;

    return this.publishingRepository.create({
      contentVersionId: input.contentVersionId,
      creativeExportId: input.creativeExportId ?? null,
      destinationChannel: input.destinationChannel,
      destinationAccountId: input.destinationAccountId ?? null,
      requestedByUserId: input.actingUserId,
      idempotencyKey: input.idempotencyKey,
      campaignId: input.campaignId ?? null,
      status,
    });
  }
}
