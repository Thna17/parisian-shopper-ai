import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '../../auth/domain/permissions.js';
import { type PublicationDetail } from '../domain/publication.types.js';
import {
  InsufficientPublishingPermissionError,
  PublicationNotFoundError,
} from '../domain/publishing-errors.js';
import { PUBLISHING_REPOSITORY, type PublishingRepository } from './publishing.repository.js';

export interface GetPublicationDetailInput {
  readonly publicationId: string;
  readonly actingUserId: string;
  readonly permissions: readonly string[];
}

@Injectable()
export class GetPublicationDetailUseCase {
  public constructor(
    @Inject(PUBLISHING_REPOSITORY)
    private readonly publishingRepository: PublishingRepository,
  ) {}

  public async execute(input: GetPublicationDetailInput): Promise<PublicationDetail> {
    const hasViewPerm =
      input.permissions.includes(Permission.VIEW_OWN_CONTENT) ||
      input.permissions.includes(Permission.VIEW_ALL_CONTENT) ||
      input.permissions.includes(Permission.PUBLISH_CREATIVE);

    if (!hasViewPerm) {
      throw new InsufficientPublishingPermissionError();
    }

    const detail = await this.publishingRepository.findById(input.publicationId);
    if (!detail) {
      throw new PublicationNotFoundError(input.publicationId);
    }

    // If user only has VIEW_OWN_CONTENT and not VIEW_ALL_CONTENT or PUBLISH_CREATIVE, restrict to own
    const canViewAll =
      input.permissions.includes(Permission.VIEW_ALL_CONTENT) ||
      input.permissions.includes(Permission.PUBLISH_CREATIVE);

    if (!canViewAll && detail.requestedByUserId !== input.actingUserId) {
      throw new PublicationNotFoundError(input.publicationId);
    }

    return detail;
  }
}
