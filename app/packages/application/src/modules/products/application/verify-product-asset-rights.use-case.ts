import { Inject, Injectable, Optional } from '@nestjs/common';
import { CLOCK, type Clock, SystemClock } from '@parisian-shopper/common';
import { Permission, PermissionService } from '../../auth/domain/permissions.js';
import {
  PRODUCT_ASSET_REPOSITORY,
  type ProductAssetRepository,
} from './product-asset.repository.js';
import {
  PRODUCT_ASSET_REGISTRATION_UNIT_OF_WORK,
  type ProductAssetOutboxDraft,
  type ProductAssetRegistrationUnitOfWork,
} from './product-asset-registration-unit-of-work.port.js';
import {
  type AuthenticatedActor,
  type ProductAssetRightsEvent,
  ProductAssetRightsState,
} from '../domain/product-asset.js';
import {
  ProductAssetNotFoundError,
  ProductAssetRegistryValidationError,
  ProductAssetUnauthorizedError,
} from '../domain/product-asset-errors.js';

export interface VerifyProductAssetRightsCommand {
  readonly actor: AuthenticatedActor;
  readonly registrationId: string;
  readonly rightsState: ProductAssetRightsState;
  readonly sourceReference?: string;
  readonly permittedScope?: string;
  readonly territory?: string;
  readonly effectiveAt?: Date;
  readonly expiresAt?: Date;
  readonly reason: string;
  readonly notes?: string;
  readonly correlationId?: string;
}

@Injectable()
export class VerifyProductAssetRightsUseCase {
  private readonly clock: Clock;
  private readonly permissions: PermissionService;

  public constructor(
    @Inject(PRODUCT_ASSET_REPOSITORY)
    private readonly assetRepo: ProductAssetRepository,
    @Inject(PRODUCT_ASSET_REGISTRATION_UNIT_OF_WORK)
    private readonly unitOfWork: ProductAssetRegistrationUnitOfWork,
    @Optional()
    permissions?: PermissionService,
    @Optional()
    @Inject(CLOCK)
    clock?: Clock,
  ) {
    this.permissions = permissions ?? new PermissionService();
    this.clock = clock ?? new SystemClock();
  }

  public async execute(command: VerifyProductAssetRightsCommand): Promise<ProductAssetRightsEvent> {
    const { actor, registrationId, rightsState } = command;

    if (!actor || !actor.userId) {
      throw new ProductAssetUnauthorizedError(
        'anonymous',
        'verify-product-asset-rights',
        'AUTHENTICATED',
      );
    }

    if (
      !this.permissions.hasAnyRolePermission(actor.roles, Permission.VERIFY_PRODUCT_ASSET_RIGHTS)
    ) {
      throw new ProductAssetUnauthorizedError(
        actor.userId,
        'verify-product-asset-rights',
        Permission.VERIFY_PRODUCT_ASSET_RIGHTS,
      );
    }

    if (!command.reason || command.reason.trim() === '') {
      throw new ProductAssetRegistryValidationError([
        'Reason is required for rights state mutation',
      ]);
    }

    if (rightsState === ProductAssetRightsState.VERIFIED) {
      const errors: string[] = [];
      if (!command.sourceReference || command.sourceReference.trim() === '') {
        errors.push('Source reference is required when declaring rights as VERIFIED');
      }
      if (!command.permittedScope || command.permittedScope.trim() === '') {
        errors.push('Permitted usage scope is required when declaring rights as VERIFIED');
      }
      if (errors.length > 0) {
        throw new ProductAssetRegistryValidationError(errors);
      }
    }

    const registration = await this.assetRepo.findRegistrationById(registrationId);
    if (!registration) {
      throw new ProductAssetNotFoundError(registrationId, {
        operation: 'VerifyProductAssetRightsUseCase',
      });
    }

    const now = this.clock.now();
    const effectiveAt = command.effectiveAt ?? now;

    if (command.expiresAt && command.expiresAt <= effectiveAt) {
      throw new ProductAssetRegistryValidationError([
        `Rights expiry (${command.expiresAt.toISOString()}) must be after effective date (${effectiveAt.toISOString()})`,
      ]);
    }

    const rightsEventId = crypto.randomUUID();
    const rightsEvent: ProductAssetRightsEvent = {
      id: rightsEventId,
      productAssetRegistrationId: registrationId,
      rightsState,
      sourceReference: command.sourceReference ?? null,
      permittedScope: command.permittedScope ?? null,
      territory: command.territory ?? null,
      effectiveAt,
      expiresAt: command.expiresAt ?? null,
      verifiedByUserId: actor.userId,
      reason: command.reason.trim(),
      notes: command.notes ?? null,
      createdAt: now,
    };

    const outboxEvents: ProductAssetOutboxDraft[] = [
      {
        topic: 'product_asset.rights_updated',
        schemaVersion: 1,
        idempotencyKey: `product-asset-rights-${rightsEventId}`,
        aggregateType: 'ProductAssetRegistration',
        aggregateId: registrationId,
        payload: {
          eventId: rightsEventId,
          registrationId,
          sku: registration.sku,
          rightsState,
          sourceReference: rightsEvent.sourceReference,
          permittedScope: rightsEvent.permittedScope,
          territory: rightsEvent.territory,
          effectiveAt: rightsEvent.effectiveAt.toISOString(),
          expiresAt: rightsEvent.expiresAt?.toISOString() ?? null,
          verifiedByUserId: actor.userId,
          reason: rightsEvent.reason,
          correlationId: command.correlationId ?? actor.correlationId ?? null,
          occurredAt: now.toISOString(),
        },
        occurredAt: now,
        availableAt: now,
      },
    ];

    return this.unitOfWork.executeRights({
      rightsEvent,
      outboxEvents,
    });
  }
}
