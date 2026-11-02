import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '../../auth/domain/permissions.js';
import {
  DuplicateBrandDatasetVersionError,
  InsufficientBrandPermissionError,
} from '../domain/brand-errors.js';
import type {
  BrandDatasetStatus,
  BrandDatasetVersionRecord,
} from '../domain/brand-profile.types.js';
import {
  BRAND_DATASET_REPOSITORY,
  type BrandDatasetRepository,
} from './brand-dataset.repository.js';

export interface CurateBrandDatasetInput {
  readonly name: string;
  readonly versionString: string;
  readonly status?: BrandDatasetStatus | undefined;
  readonly gitCommitHash?: string | undefined;
  readonly approvedByUserId?: string | undefined;
  readonly initialFeedbackIds?: readonly string[] | undefined;
  readonly permissions: readonly string[];
}

@Injectable()
export class CurateBrandDatasetUseCase {
  public constructor(
    @Inject(BRAND_DATASET_REPOSITORY)
    private readonly brandDatasetRepo: BrandDatasetRepository,
  ) {}

  public async execute(input: CurateBrandDatasetInput): Promise<BrandDatasetVersionRecord> {
    if (!input.permissions.includes(Permission.ADMIN)) {
      throw new InsufficientBrandPermissionError(Permission.ADMIN);
    }

    const existing = await this.brandDatasetRepo.findByVersionString(input.versionString);
    if (existing) {
      throw new DuplicateBrandDatasetVersionError(input.versionString);
    }

    return this.brandDatasetRepo.createDatasetVersion({
      name: input.name,
      versionString: input.versionString,
      status: input.status ?? 'CURATING',
      gitCommitHash: input.gitCommitHash ?? null,
      approvedByUserId: input.approvedByUserId ?? null,
      initialFeedbackIds: input.initialFeedbackIds ?? [],
    });
  }
}
