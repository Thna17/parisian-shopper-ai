import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '../../auth/domain/permissions.js';
import {
  CHANNEL_CAPABILITIES,
  type ConfirmPublicationInput,
  PublicationChannel,
  type PublicationRecord,
  PublicationStatus,
} from '../domain/publication.types.js';
import {
  InsufficientPublishingPermissionError,
  PublicationChannelNotEnabledError,
  PublicationNotFoundError,
  PublicationStatusTransitionError,
} from '../domain/publishing-errors.js';
import { PUBLISHING_REPOSITORY, type PublishingRepository } from './publishing.repository.js';

@Injectable()
export class ConfirmPublicationUseCase {
  public constructor(
    @Inject(PUBLISHING_REPOSITORY)
    private readonly publishingRepository: PublishingRepository,
  ) {}

  public async execute(input: ConfirmPublicationInput): Promise<PublicationRecord> {
    if (!input.permissions.includes(Permission.PUBLISH_CREATIVE)) {
      throw new InsufficientPublishingPermissionError();
    }

    const publication = await this.publishingRepository.findById(input.publicationId);
    if (!publication) {
      throw new PublicationNotFoundError(input.publicationId);
    }

    // Must be in DRAFT or READY status to confirm
    if (
      publication.status !== PublicationStatus.DRAFT &&
      publication.status !== PublicationStatus.READY
    ) {
      throw new PublicationStatusTransitionError(publication.status, PublicationStatus.PUBLISHED);
    }

    // Check channel capabilities
    const capability = CHANNEL_CAPABILITIES.find(
      (c) => c.channel === publication.destinationChannel,
    );

    if (!capability || !capability.enabled) {
      throw new PublicationChannelNotEnabledError(publication.destinationChannel);
    }

    // For MANUAL_EXPORT, mark published immediately
    if (publication.destinationChannel === PublicationChannel.MANUAL_EXPORT) {
      const now = new Date();
      const attemptCount = await this.publishingRepository.getAttemptCount(publication.id);
      const attempt = await this.publishingRepository.createAttempt({
        publicationId: publication.id,
        attemptNumber: attemptCount + 1,
        status: PublicationStatus.PROCESSING,
      });

      await this.publishingRepository.updateAttempt(attempt.id, {
        status: PublicationStatus.PUBLISHED,
        completedAt: now,
        providerResult: { channel: 'MANUAL_EXPORT', success: true },
        retryEligible: false,
      });

      return this.publishingRepository.updateStatus(publication.id, PublicationStatus.PUBLISHED, {
        publishedAt: now,
      });
    }

    // For other future live channels, transition to QUEUED
    return this.publishingRepository.updateStatus(publication.id, PublicationStatus.QUEUED);
  }
}
