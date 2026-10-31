import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '../../auth/domain/permissions.js';
import {
  DuplicateBrandProfileError,
  InsufficientBrandPermissionError,
} from '../domain/brand-errors.js';
import type {
  BrandProfileVersionDraft,
  BrandProfileVersionRecord,
} from '../domain/brand-profile.types.js';
import {
  BRAND_PROFILE_REPOSITORY,
  type BrandProfileRepository,
} from './brand-profile.repository.js';

export interface CreateBrandProfileDraftCommand extends BrandProfileVersionDraft {
  readonly permissions: readonly string[];
}

@Injectable()
export class CreateBrandProfileDraftUseCase {
  public constructor(
    @Inject(BRAND_PROFILE_REPOSITORY)
    private readonly brandProfileRepo: BrandProfileRepository,
  ) {}

  public async execute(
    command: CreateBrandProfileDraftCommand,
  ): Promise<BrandProfileVersionRecord> {
    if (!command.permissions.includes(Permission.ADMIN)) {
      throw new InsufficientBrandPermissionError(Permission.ADMIN);
    }

    const existingProfiles = await this.brandProfileRepo.listProfiles();
    const sameNameVersions = existingProfiles
      .filter((p) => p.name.toLowerCase() === command.name.toLowerCase())
      .map((p) => p.versionNumber);

    const nextVersionNumber = sameNameVersions.length > 0 ? Math.max(...sameNameVersions) + 1 : 1;

    const existingExact = await this.brandProfileRepo.findByNameAndVersion(
      command.name,
      nextVersionNumber,
    );
    if (existingExact) {
      throw new DuplicateBrandProfileError(command.name, nextVersionNumber);
    }

    const { permissions: _, ...draft } = command;
    return this.brandProfileRepo.createDraft(draft);
  }
}
