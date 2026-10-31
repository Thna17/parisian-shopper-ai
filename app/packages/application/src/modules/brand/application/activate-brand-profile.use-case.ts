import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '../../auth/domain/permissions.js';
import {
  BrandProfileNotFoundError,
  InsufficientBrandPermissionError,
  InvalidBrandProfileStateTransitionError,
} from '../domain/brand-errors.js';
import type { BrandProfileVersionRecord } from '../domain/brand-profile.types.js';
import {
  BRAND_PROFILE_REPOSITORY,
  type BrandProfileRepository,
} from './brand-profile.repository.js';

export interface ActivateBrandProfileCommand {
  readonly profileId: string;
  readonly authorizedUserId: string;
  readonly permissions: readonly string[];
}

@Injectable()
export class ActivateBrandProfileUseCase {
  public constructor(
    @Inject(BRAND_PROFILE_REPOSITORY)
    private readonly brandProfileRepo: BrandProfileRepository,
  ) {}

  public async execute(command: ActivateBrandProfileCommand): Promise<BrandProfileVersionRecord> {
    if (!command.permissions.includes(Permission.ADMIN)) {
      throw new InsufficientBrandPermissionError(Permission.ADMIN);
    }

    const profile = await this.brandProfileRepo.findById(command.profileId);
    if (!profile) {
      throw new BrandProfileNotFoundError(command.profileId);
    }

    if (profile.status === 'ACTIVE') {
      return profile;
    }

    if (profile.status === 'RETIRED' || profile.status === 'REVOKED') {
      throw new InvalidBrandProfileStateTransitionError(profile.status, 'ACTIVE');
    }

    return this.brandProfileRepo.activateVersion(command.profileId, command.authorizedUserId);
  }
}
