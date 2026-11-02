import { Inject, Injectable, Optional } from '@nestjs/common';
import type { OutboxWriter } from '@parisian-shopper/common';
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
  readonly outboxWriter?: OutboxWriter;
}

@Injectable()
export class ActivateBrandProfileUseCase {
  public constructor(
    @Inject(BRAND_PROFILE_REPOSITORY)
    private readonly brandProfileRepo: BrandProfileRepository,
    @Optional()
    @Inject('OUTBOX_WRITER')
    private readonly defaultOutboxWriter?: OutboxWriter,
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

    const activated = await this.brandProfileRepo.activateVersion(
      command.profileId,
      command.authorizedUserId,
    );

    const outbox = command.outboxWriter ?? this.defaultOutboxWriter;
    if (outbox) {
      await outbox.append({
        topic: 'brand.profile.activated',
        schemaVersion: 1,
        idempotencyKey: `brand-profile-activated-${activated.id}-${Date.now()}`,
        aggregateType: 'BrandProfileVersion',
        aggregateId: activated.id,
        payload: {
          profileId: activated.id,
          versionNumber: activated.versionNumber,
          activatedByUserId: command.authorizedUserId,
          activatedAt: activated.activatedAt?.toISOString() ?? new Date().toISOString(),
        },
        occurredAt: new Date(),
        availableAt: new Date(),
      });
    }

    return activated;
  }
}
