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

export interface RollbackBrandProfileCommand {
  readonly targetVersionId: string;
  readonly reason: string;
  readonly authorizedUserId: string;
  readonly permissions: readonly string[];
  readonly outboxWriter?: OutboxWriter;
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
    @Optional()
    @Inject('OUTBOX_WRITER')
    private readonly defaultOutboxWriter?: OutboxWriter,
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

    const executedAt = new Date().toISOString();

    const outbox = command.outboxWriter ?? this.defaultOutboxWriter;
    if (outbox) {
      await outbox.append({
        topic: 'brand.profile.rollback_executed',
        schemaVersion: 1,
        idempotencyKey: `brand-profile-rollback-${restoredProfile.id}-${Date.now()}`,
        aggregateType: 'BrandProfileVersion',
        aggregateId: restoredProfile.id,
        payload: {
          previousProfileId: revokedProfile?.id ?? null,
          restoredProfileId: restoredProfile.id,
          reason: command.reason,
          actorUserId: command.authorizedUserId,
          executedAt,
        },
        occurredAt: new Date(),
        availableAt: new Date(),
      });
    }

    return {
      revokedProfile,
      restoredProfile,
      rollbackReason: command.reason,
      executedAt,
    };
  }
}
