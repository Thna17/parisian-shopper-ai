import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '../../auth/domain/permissions.js';
import { InsufficientPublishingPermissionError } from '../domain/publishing-errors.js';
import { PUBLISHING_REPOSITORY, type PublishingRepository } from './publishing.repository.js';

export interface ListEligibleAssetsInput {
  readonly page?: number;
  readonly limit?: number;
  readonly actingUserId: string;
  readonly permissions: readonly string[];
}

@Injectable()
export class ListEligibleAssetsUseCase {
  public constructor(
    @Inject(PUBLISHING_REPOSITORY)
    private readonly publishingRepository: PublishingRepository,
  ) {}

  public async execute(input: ListEligibleAssetsInput): Promise<{
    items: Array<{
      contentVersionId: string;
      versionNumber: number;
      contentJobId: string;
      productName: string;
      approvedAt: string;
      hasCreativeExports: boolean;
    }>;
    total: number;
  }> {
    const hasPerm =
      input.permissions.includes(Permission.VIEW_OWN_CONTENT) ||
      input.permissions.includes(Permission.VIEW_ALL_CONTENT) ||
      input.permissions.includes(Permission.PUBLISH_CREATIVE);

    if (!hasPerm) {
      throw new InsufficientPublishingPermissionError();
    }

    const page = Math.max(1, input.page ?? 1);
    const limit = Math.min(100, Math.max(1, input.limit ?? 20));

    return this.publishingRepository.findEligibleContentVersions({ page, limit });
  }
}
