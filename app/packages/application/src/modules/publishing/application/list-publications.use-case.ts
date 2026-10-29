import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '../../auth/domain/permissions.js';
import {
  type ListPublicationsQuery,
  type PaginatedPublications,
} from '../domain/publication.types.js';
import { InsufficientPublishingPermissionError } from '../domain/publishing-errors.js';
import { PUBLISHING_REPOSITORY, type PublishingRepository } from './publishing.repository.js';

@Injectable()
export class ListPublicationsUseCase {
  public constructor(
    @Inject(PUBLISHING_REPOSITORY)
    private readonly publishingRepository: PublishingRepository,
  ) {}

  public async execute(query: ListPublicationsQuery): Promise<PaginatedPublications> {
    const hasViewPerm =
      query.permissions.includes(Permission.VIEW_OWN_CONTENT) ||
      query.permissions.includes(Permission.VIEW_ALL_CONTENT) ||
      query.permissions.includes(Permission.PUBLISH_CREATIVE);

    if (!hasViewPerm) {
      throw new InsufficientPublishingPermissionError();
    }

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));

    return this.publishingRepository.list({
      page,
      limit,
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.channel !== undefined ? { channel: query.channel } : {}),
    });
  }
}
