import { Inject, Injectable, Optional } from '@nestjs/common';
import { CLOCK, type Clock, SystemClock } from '@parisian-shopper/common';
import { Permission, PermissionService } from '../../auth/domain/permissions.js';
import {
  PRODUCT_ASSET_REPOSITORY,
  type ProductAssetRepository,
} from './product-asset.repository.js';
import {
  PRODUCT_ASSET_STORAGE,
  type ProductAssetStoragePort,
} from './product-asset-storage.port.js';
import {
  PRODUCT_ASSET_REGISTRATION_UNIT_OF_WORK,
  type ProductAssetOutboxDraft,
  type ProductAssetRegistrationUnitOfWork,
} from './product-asset-registration-unit-of-work.port.js';
import {
  CURRENT_VALIDATOR_VERSION,
  PRODUCT_ASSET_VALIDATOR,
  ProductAssetValidator,
} from '../../creative/domain/services/product-asset-validator.js';
import {
  type AuthenticatedActor,
  type ProductAsset,
  type ProductAssetApprovalEvent,
  ProductAssetApprovalDecision,
  type ProductAssetRegistration,
  type ProductAssetRightsEvent,
  ProductAssetRightsState,
  type ProductAssetRole,
  ProductAssetRole as AssetRole,
  type ProductAssetValidationAssessment,
} from '../domain/product-asset.js';
import {
  ProductAssetIneligibleError,
  ProductAssetNotFoundError,
  ProductAssetOpaqueHeroError,
  ProductAssetRegistryValidationError,
  ProductAssetUnauthorizedError,
} from '../domain/product-asset-errors.js';

export interface ReplaceProductAssetCommand {
  readonly actor: AuthenticatedActor;
  readonly previousRegistrationId: string;
  readonly sku: string;
  readonly role: ProductAssetRole;
  readonly buffer: Buffer;
  readonly mimeType?: string;
  readonly sourceSystem: string;
  readonly sourceUrl?: string;
  readonly sourceRecordId?: string;
  readonly sourceImageId?: string;
  readonly sourceRetrievedAt?: Date;
  readonly sourceUrlHash?: string;
  readonly sourceEtag?: string;
  readonly sourceChecksum?: string;
  readonly originSystem?: string;
  readonly correlationId?: string;
  readonly rightsNotes?: string;
  readonly permittedScope?: string;
  readonly territory?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly reason?: string;
  readonly notes?: string;
}

export interface ReplaceProductAssetResult {
  readonly newAsset: ProductAsset;
  readonly newRegistration: ProductAssetRegistration;
  readonly newValidationAssessment: ProductAssetValidationAssessment;
  readonly newRightsEvent: ProductAssetRightsEvent;
  readonly newApprovalEvent: ProductAssetApprovalEvent;
  readonly previousRegistrationRetiredEvent?: ProductAssetApprovalEvent | undefined;
}

@Injectable()
export class ReplaceProductAssetUseCase {
  private readonly validator: ProductAssetValidator;
  private readonly clock: Clock;
  private readonly permissions: PermissionService;

  public constructor(
    @Inject(PRODUCT_ASSET_REPOSITORY)
    private readonly assetRepo: ProductAssetRepository,
    @Inject(PRODUCT_ASSET_STORAGE)
    private readonly storage: ProductAssetStoragePort,
    @Inject(PRODUCT_ASSET_REGISTRATION_UNIT_OF_WORK)
    private readonly unitOfWork: ProductAssetRegistrationUnitOfWork,
    @Optional()
    @Inject(PRODUCT_ASSET_VALIDATOR)
    validator?: ProductAssetValidator,
    permissions?: PermissionService,
    @Optional()
    @Inject(CLOCK)
    clock?: Clock,
  ) {
    this.validator = validator ?? new ProductAssetValidator();
    this.permissions = permissions ?? new PermissionService();
    this.clock = clock ?? new SystemClock();
  }

  public async execute(command: ReplaceProductAssetCommand): Promise<ReplaceProductAssetResult> {
    const { actor, previousRegistrationId, sku, role, buffer, sourceSystem } = command;

    if (!actor || !actor.userId) {
      throw new ProductAssetUnauthorizedError('anonymous', 'replace-product-asset', 'AUTHENTICATED');
    }

    const isAuthorized =
      this.permissions.hasAnyRolePermission(actor.roles, Permission.CREATE_CONTENT) ||
      this.permissions.hasAnyRolePermission(actor.roles, Permission.EDIT_CREATIVE);

    if (!isAuthorized) {
      throw new ProductAssetUnauthorizedError(
        actor.userId,
        'replace-product-asset',
        'CREATE_CONTENT or EDIT_CREATIVE',
      );
    }

    // 1. Verify previous registration exists and SKU matches
    const previous = await this.assetRepo.findRegistrationById(previousRegistrationId);
    if (!previous) {
      throw new ProductAssetNotFoundError(previousRegistrationId, {
        operation: 'ReplaceProductAssetUseCase.findPrevious',
      });
    }

    if (previous.sku.trim() !== sku.trim()) {
      throw new ProductAssetIneligibleError(
        sku,
        `Previous registration ${previousRegistrationId} belongs to SKU "${previous.sku}", not "${sku}"`,
      );
    }

    if (!buffer || buffer.length === 0) {
      throw new ProductAssetRegistryValidationError(['Replacement image buffer is empty']);
    }

    // 2. Validate replacement buffer
    const validationResult = await this.validator.validate({
      assetBuffer: buffer,
      expectedSku: sku,
      role,
      mimeType: command.mimeType,
    });

    if (
      role === AssetRole.HERO_CUTOUT &&
      (!validationResult.hasAlpha || !validationResult.isValid)
    ) {
      const opaqueFinding = validationResult.findings.find((f) =>
        f.toLowerCase().includes('opaque background'),
      );
      if (opaqueFinding || !validationResult.hasAlpha) {
        throw new ProductAssetOpaqueHeroError(sku, { findings: validationResult.findings });
      }
      throw new ProductAssetRegistryValidationError(validationResult.findings);
    }

    if (!validationResult.isValid && role !== AssetRole.ORIGINAL_SOURCE) {
      throw new ProductAssetRegistryValidationError(validationResult.findings);
    }

    // 3. Persist new buffer in CAS storage
    const mimeType = validationResult.mimeType;
    const stored = await this.storage.saveAsset(buffer, mimeType);

    const now = this.clock.now();
    const format = mimeType.replace('image/', '');

    // 4. Prepare new ProductAsset
    const newAssetId = crypto.randomUUID();
    const newAsset: ProductAsset = {
      id: newAssetId,
      sha256: stored.sha256,
      storageKey: stored.storageKey,
      mimeType,
      format,
      byteSize: stored.byteSize,
      width: validationResult.width,
      height: validationResult.height,
      pixelCount: validationResult.totalPixelCount,
      channels: validationResult.hasAlpha ? 4 : 3,
      hasAlpha: validationResult.hasAlpha,
      transparencyRatio: Number(validationResult.visibleRatio.toFixed(4)),
      createdAt: now,
    };

    // 5. Prepare new ProductAssetRegistration with replacesRegistrationId and UNKNOWN rights
    const newRegistrationId = crypto.randomUUID();
    const newRegistration: ProductAssetRegistration = {
      id: newRegistrationId,
      productAssetId: newAssetId,
      sku: sku.trim(),
      productSnapshotId: previous.productSnapshotId ?? null,
      role,
      sourceUrl: command.sourceUrl ?? null,
      sourceSystem,
      sourceRecordId: command.sourceRecordId ?? null,
      sourceImageId: command.sourceImageId ?? null,
      sourceRetrievedAt: command.sourceRetrievedAt ?? null,
      sourceUrlHash: command.sourceUrlHash ?? null,
      sourceEtag: command.sourceEtag ?? null,
      sourceChecksum: command.sourceChecksum ?? null,
      originSystem: command.originSystem ?? null,
      correlationId: command.correlationId ?? actor.correlationId ?? null,
      replacesRegistrationId: previous.id,
      rightsState: ProductAssetRightsState.UNKNOWN,
      rightsNotes: command.rightsNotes ?? null,
      rightsExpiresAt: null,
      metadata: command.metadata ?? null,
      registeredByUserId: actor.userId,
      registeredAt: now,
    };

    // 6. Prepare new ValidationAssessment
    const newAssessmentId = crypto.randomUUID();
    const newAssessment: ProductAssetValidationAssessment = {
      id: newAssessmentId,
      productAssetId: newAssetId,
      validatorVersion: CURRENT_VALIDATOR_VERSION,
      status: validationResult.status,
      isValid: validationResult.isValid,
      format: newAsset.format,
      hasAlpha: validationResult.hasAlpha,
      transparencyRatio: Number(validationResult.visibleRatio.toFixed(4)),
      width: validationResult.width,
      height: validationResult.height,
      byteSize: newAsset.byteSize,
      pixelCount: newAsset.pixelCount,
      findings: validationResult.findings,
      reasonCodes: validationResult.reasonCodes,
      assessedAt: now,
    };

    // 7. Prepare initial UNKNOWN RightsEvent without verifiedByUserId
    const newRightsEventId = crypto.randomUUID();
    const newRightsEvent: ProductAssetRightsEvent = {
      id: newRightsEventId,
      productAssetRegistrationId: newRegistrationId,
      rightsState: ProductAssetRightsState.UNKNOWN,
      sourceReference: command.sourceUrl ?? null,
      permittedScope: command.permittedScope ?? null,
      territory: command.territory ?? null,
      effectiveAt: now,
      expiresAt: null,
      verifiedByUserId: null,
      reason: command.reason ?? 'INITIAL_REPLACEMENT_SUBMISSION',
      notes: command.rightsNotes ?? null,
      createdAt: now,
    };

    // 8. Prepare initial SUBMITTED approval event
    // The previous registration remains APPROVED and active while replacement is pending.
    const newApprovalEventId = crypto.randomUUID();
    const newApprovalEvent: ProductAssetApprovalEvent = {
      id: newApprovalEventId,
      productAssetRegistrationId: newRegistrationId,
      decision: ProductAssetApprovalDecision.SUBMITTED,
      decidedByUserId: actor.userId,
      reason: command.reason ?? 'REPLACEMENT_SUBMITTED',
      notes: command.notes ?? null,
      validationAssessmentId: newAssessmentId,
      decidedAt: now,
    };

    // 9. Atomic outbox events
    const outboxEvents: ProductAssetOutboxDraft[] = [
      {
        topic: 'product_asset.registered',
        schemaVersion: 1,
        idempotencyKey: `product-asset-registered-${newRegistrationId}`,
        aggregateType: 'ProductAssetRegistration',
        aggregateId: newRegistrationId,
        payload: {
          registrationId: newRegistrationId,
          assetId: newAsset.id,
          sku: newRegistration.sku,
          role: newRegistration.role,
          sha256: newAsset.sha256,
          replacesRegistrationId: previous.id,
          registeredByUserId: actor.userId,
          correlationId: actor.correlationId ?? null,
          occurredAt: now.toISOString(),
        },
        occurredAt: now,
        availableAt: now,
      },
      {
        topic: 'product_asset.validation_completed',
        schemaVersion: 1,
        idempotencyKey: `product-asset-validation-${newAssessmentId}`,
        aggregateType: 'ProductAssetValidationAssessment',
        aggregateId: newAssessmentId,
        payload: {
          assessmentId: newAssessmentId,
          assetId: newAsset.id,
          sku: newRegistration.sku,
          validatorVersion: newAssessment.validatorVersion,
          status: newAssessment.status,
          isValid: newAssessment.isValid,
          findings: newAssessment.findings,
          reasonCodes: newAssessment.reasonCodes,
          occurredAt: now.toISOString(),
        },
        occurredAt: now,
        availableAt: now,
      },
      {
        topic: 'product_asset.dependency_changed',
        schemaVersion: 1,
        idempotencyKey: `product-asset-dependency-changed-${previous.id}-${newRegistrationId}`,
        aggregateType: 'ProductAssetRegistration',
        aggregateId: newRegistrationId,
        payload: {
          sku: command.sku,
          previousRegistrationId: previous.id,
          newRegistrationId: newRegistrationId,
          role: newRegistration.role,
          sha256: newAsset.sha256,
          correlationId: actor.correlationId ?? null,
          occurredAt: now.toISOString(),
        },
        occurredAt: now,
        availableAt: now,
      },
    ];

    // 10. Atomic execution via Unit of Work
    // Notice: previousRegistrationRetiredEvent is undefined here. Predecessor is NOT retired yet!
    const result = await this.unitOfWork.executeReplacement({
      newAsset,
      newRegistration,
      newAssessment,
      newRightsEvent,
      newApprovalEvent,
      previousRegistrationRetiredEvent: undefined,
      outboxEvents,
    });

    return {
      newAsset: result.newAsset,
      newRegistration: result.newRegistration,
      newValidationAssessment: result.newAssessment,
      newRightsEvent: result.newRightsEvent ?? newRightsEvent,
      newApprovalEvent: result.newApprovalEvent ?? newApprovalEvent,
      previousRegistrationRetiredEvent: undefined,
    };
  }
}
