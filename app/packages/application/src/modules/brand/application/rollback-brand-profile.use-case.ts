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

export interface RollbackBrandProfileCommand {
  readonly targetVersionId: string;
  readonly reason: string;
  readonly authorizedUserId: string;
  readonly permissions: readonly string[];
}

export interface RollbackBrandProfileResult {
  readonly revokedProfile: BrandProfileVersionRecord | null;
  readonly restoredProfile: BrandProfileVersionRecord;
  readonly rollbackReason: string;
  readonly executedAt: string;
}

@Injectable()
export class RollbackBrandProfileUseCase {
  public constructor(
    @Inject(BRAND_PROFILE_REPOSITORY)
    private readonly brandProfileRepo: BrandProfileRepository,
  ) {}

  public async execute(command: RollbackBrandProfileCommand): Promise<RollbackBrandProfileResult> {
    if (!command.permissions.includes(Permission.ADMIN)) {
      throw new InsufficientBrandPermissionError(Permission.ADMIN);
    }

    const targetProfile = await this.brandProfileRepo.findById(command.targetVersionId);
    if (!targetProfile) {
      throw new BrandProfileNotFoundError(command.targetVersionId);
    }

    // Rollback can only restore a previously verified/active profile (RETIRED or already ACTIVE)
    if (targetProfile.status !== 'RETIRED' && targetProfile.status !== 'ACTIVE') {
      throw new InvalidBrandProfileStateTransitionError(
        targetProfile.status,
        'ACTIVE (via rollback)',
      );
    }

    const { revokedProfile, restoredProfile } = await this.brandProfileRepo.rollbackToVersion(
      command.targetVersionId,
      command.authorizedUserId,
    );

    return {
      revokedProfile,
      restoredProfile,
      rollbackReason: command.reason,
      executedAt: new Date().toISOString(),
    };
  }
}
