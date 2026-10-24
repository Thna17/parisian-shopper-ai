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
  ProductAssetRole,
  type ProductAssetValidationAssessment,
} from '../domain/product-asset.js';
import {
  ProductAssetOpaqueHeroError,
  ProductAssetRegistryValidationError,
  ProductAssetUnauthorizedError,
} from '../domain/product-asset-errors.js';

export interface RegisterProductAssetCommand {
  readonly actor: AuthenticatedActor;
  readonly buffer: Buffer;
  readonly sku: string;
  readonly role: ProductAssetRole;
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
  readonly replacesRegistrationId?: string;
  readonly productSnapshotId?: string;
  readonly rightsNotes?: string;
  readonly permittedScope?: string;
  readonly territory?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface RegisterProductAssetResult {
  readonly asset: ProductAsset;
  readonly registration: ProductAssetRegistration;
  readonly validationAssessment: ProductAssetValidationAssessment;
  readonly approvalEvent?: ProductAssetApprovalEvent | undefined;
  readonly rightsEvent?: ProductAssetRightsEvent | undefined;
}

@Injectable()
export class RegisterProductAssetUseCase {
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

  public async execute(command: RegisterProductAssetCommand): Promise<RegisterProductAssetResult> {
    const { actor, buffer, sku, role, sourceSystem } = command;

    if (!actor || !actor.userId) {
      throw new ProductAssetUnauthorizedError('anonymous', 'register-product-asset', 'AUTHENTICATED');
    }

    const isAuthorized =
      this.permissions.hasAnyRolePermission(actor.roles, Permission.CREATE_CONTENT) ||
      this.permissions.hasAnyRolePermission(actor.roles, Permission.EDIT_CREATIVE);

    if (!isAuthorized) {
      throw new ProductAssetUnauthorizedError(
        actor.userId,
        'register-product-asset',
        'CREATE_CONTENT or EDIT_CREATIVE',
      );
    }

    if (!buffer || buffer.length === 0) {
      throw new ProductAssetRegistryValidationError(['Image buffer is empty']);
    }

    if (!sku || sku.trim() === '') {
      throw new ProductAssetRegistryValidationError(['SKU must be specified']);
    }

    // 1. Validate image format, dimensions, transparency, and placeholder hashes
    const validationResult = await this.validator.validate({
      assetBuffer: buffer,
      expectedSku: sku,
      role,
    });

    if (
      role === ProductAssetRole.HERO_CUTOUT &&
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

    if (!validationResult.isValid && role !== ProductAssetRole.ORIGINAL_SOURCE) {
      throw new ProductAssetRegistryValidationError(validationResult.findings);
    }

    // 2. Persist raw buffer in CAS storage first
    const mimeType = validationResult.mimeType;
    const stored = await this.storage.saveAsset(buffer, mimeType);

    const now = this.clock.now();
    const format = mimeType.replace('image/', '');

    // 3. Prepare asset entity
    const assetId = crypto.randomUUID();
    const asset: ProductAsset = {
      id: assetId,
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

    // 4. Prepare registration entity
    const registrationId = crypto.randomUUID();
    const registration: ProductAssetRegistration = {
      id: registrationId,
      productAssetId: assetId,
      sku: sku.trim(),
      productSnapshotId: command.productSnapshotId ?? null,
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
      replacesRegistrationId: command.replacesRegistrationId ?? null,
      rightsState: ProductAssetRightsState.UNKNOWN,
      rightsNotes: command.rightsNotes ?? null,
      rightsExpiresAt: null,
      metadata: command.metadata ?? null,
      registeredByUserId: actor.userId,
      registeredAt: now,
    };

    // 5. Prepare validation assessment entity
    const assessmentId = crypto.randomUUID();
    const validationAssessment: ProductAssetValidationAssessment = {
      id: assessmentId,
      productAssetId: assetId,
      validatorVersion: CURRENT_VALIDATOR_VERSION,
      status: validationResult.status,
      isValid: validationResult.isValid,
      format: asset.format,
      hasAlpha: validationResult.hasAlpha,
      transparencyRatio: Number(validationResult.visibleRatio.toFixed(4)),
      width: validationResult.width,
      height: validationResult.height,
      byteSize: asset.byteSize,
      pixelCount: asset.pixelCount,
      findings: validationResult.findings,
      reasonCodes: validationResult.reasonCodes,
      assessedAt: now,
    };

    // 6. Prepare initial rights event in UNKNOWN state without verifiedByUserId
    const rightsEventId = crypto.randomUUID();
    const rightsEvent: ProductAssetRightsEvent = {
      id: rightsEventId,
      productAssetRegistrationId: registrationId,
      rightsState: ProductAssetRightsState.UNKNOWN,
      sourceReference: command.sourceUrl ?? null,
      permittedScope: command.permittedScope ?? null,
      territory: command.territory ?? null,
      effectiveAt: now,
      expiresAt: null,
      verifiedByUserId: null,
      reason: 'INITIAL_REGISTRATION',
      notes: command.rightsNotes ?? null,
      createdAt: now,
    };

    // 7. Prepare initial approval event in SUBMITTED state
    const approvalEventId = crypto.randomUUID();
    const approvalEvent: ProductAssetApprovalEvent = {
      id: approvalEventId,
      productAssetRegistrationId: registrationId,
      decision: ProductAssetApprovalDecision.SUBMITTED,
      decidedByUserId: actor.userId,
      reason: 'INITIAL_REGISTRATION',
      notes: null,
      validationAssessmentId: assessmentId,
      decidedAt: now,
    };

    // 8. Prepare atomic outbox events
    const outboxEvents: ProductAssetOutboxDraft[] = [
      {
        topic: 'product_asset.registered',
        schemaVersion: 1,
        idempotencyKey: `product-asset-registered-${registrationId}`,
        aggregateType: 'ProductAssetRegistration',
        aggregateId: registrationId,
        payload: {
          registrationId,
          assetId: asset.id,
          sku: registration.sku,
          role: registration.role,
          sha256: asset.sha256,
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
        idempotencyKey: `product-asset-validation-${assessmentId}`,
        aggregateType: 'ProductAssetValidationAssessment',
        aggregateId: assessmentId,
        payload: {
          assessmentId,
          assetId: asset.id,
          sku: registration.sku,
          validatorVersion: validationAssessment.validatorVersion,
          status: validationAssessment.status,
          isValid: validationAssessment.isValid,
          findings: validationAssessment.findings,
          reasonCodes: validationAssessment.reasonCodes,
          occurredAt: now.toISOString(),
        },
        occurredAt: now,
        availableAt: now,
      },
    ];

    // 9. Execute atomic persistence via Unit of Work
    const result = await this.unitOfWork.executeRegistration({
      asset,
      registration,
      assessment: validationAssessment,
      rightsEvent,
      initialApprovalEvent: approvalEvent,
      outboxEvents,
    });

    return {
      asset: result.asset,
      registration: result.registration,
      validationAssessment: result.assessment,
      approvalEvent: result.approvalEvent,
      rightsEvent: result.rightsEvent,
    };
  }
}
