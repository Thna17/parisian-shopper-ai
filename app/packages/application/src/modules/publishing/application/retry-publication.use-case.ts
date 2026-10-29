import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '../../auth/domain/permissions.js';
import {
  type PublicationRecord,
  PublicationStatus,
  type RetryPublicationInput,
} from '../domain/publication.types.js';
import {
  InsufficientPublishingPermissionError,
  PublicationNotFoundError,
  PublicationNotRetryableError,
} from '../domain/publishing-errors.js';
import { PUBLISHING_REPOSITORY, type PublishingRepository } from './publishing.repository.js';

@Injectable()
export class RetryPublicationUseCase {
  public constructor(
    @Inject(PUBLISHING_REPOSITORY)
    private readonly publishingRepository: PublishingRepository,
  ) {}

  public async execute(input: RetryPublicationInput): Promise<PublicationRecord> {
    if (!input.permissions.includes(Permission.PUBLISH_CREATIVE)) {
      throw new InsufficientPublishingPermissionError();
    }

    const publication = await this.publishingRepository.findById(input.publicationId);
    if (!publication) {
      throw new PublicationNotFoundError(input.publicationId);
    }

    if (publication.status !== PublicationStatus.FAILED) {
      throw new PublicationNotRetryableError(input.publicationId);
    }

    return this.publishingRepository.updateStatus(publication.id, PublicationStatus.QUEUED);
  }
}
