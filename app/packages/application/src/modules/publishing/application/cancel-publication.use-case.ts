import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '../../auth/domain/permissions.js';
import {
  type CancelPublicationInput,
  type PublicationRecord,
  PublicationStatus,
} from '../domain/publication.types.js';
import {
  InsufficientPublishingPermissionError,
  PublicationNotFoundError,
  PublicationStatusTransitionError,
} from '../domain/publishing-errors.js';
import { PUBLISHING_REPOSITORY, type PublishingRepository } from './publishing.repository.js';

@Injectable()
export class CancelPublicationUseCase {
  public constructor(
    @Inject(PUBLISHING_REPOSITORY)
    private readonly publishingRepository: PublishingRepository,
  ) {}

  public async execute(input: CancelPublicationInput): Promise<PublicationRecord> {
    if (!input.permissions.includes(Permission.PUBLISH_CREATIVE)) {
      throw new InsufficientPublishingPermissionError();
    }

    const publication = await this.publishingRepository.findById(input.publicationId);
    if (!publication) {
      throw new PublicationNotFoundError(input.publicationId);
    }

    // Cancellation is only allowed from DRAFT, READY, or QUEUED
    const cancellableStatuses: readonly PublicationStatus[] = [
      PublicationStatus.DRAFT,
      PublicationStatus.READY,
      PublicationStatus.QUEUED,
    ];

    if (!cancellableStatuses.includes(publication.status)) {
      throw new PublicationStatusTransitionError(publication.status, PublicationStatus.CANCELLED);
    }

    return this.publishingRepository.updateStatus(publication.id, PublicationStatus.CANCELLED, {
      cancellationReason: input.reason,
    });
  }
}
