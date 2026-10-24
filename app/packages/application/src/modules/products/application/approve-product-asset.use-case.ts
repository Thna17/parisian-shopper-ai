import { createHash } from 'node:crypto';
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
  KNOWN_PLACEHOLDER_HASHES,
} from '../../creative/domain/services/product-asset-validator.js';
import {
  type AuthenticatedActor,
  type ProductAssetApprovalEvent,
  ProductAssetApprovalDecision,
  ProductAssetRightsState,
  ProductAssetRole,
  ProductAssetValidationStatus,
} from '../domain/product-asset.js';
import {
  ProductAssetAssessmentMismatchError,
  ProductAssetCorruptError,
  ProductAssetDigestMismatchError,
  ProductAssetIneligibleError,
  ProductAssetInvalidLifecycleTransitionError,
  ProductAssetInvalidValidatorVersionError,
  ProductAssetNotFoundError,
  ProductAssetOpaqueHeroError,
  ProductAssetPlaceholderRejectedError,
  ProductAssetRightsUnverifiedError,
  ProductAssetStaleAssessmentError,
  ProductAssetUnauthorizedError,
} from '../domain/product-asset-errors.js';

export interface ApproveProductAssetCommand {
  readonly registrationId: string;
  readonly decision: ProductAssetApprovalDecision;
  readonly actor: AuthenticatedActor;
  readonly expectedValidationAssessmentId?: string;
  readonly reason?: string;
  readonly notes?: string;
}

@Injectable()
export class ApproveProductAssetUseCase {
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
    permissions?: PermissionService,
    @Optional()
    @Inject(CLOCK)
    clock?: Clock,
  ) {
    this.permissions = permissions ?? new PermissionService();
    this.clock = clock ?? new SystemClock();
  }

  public async execute(command: ApproveProductAssetCommand): Promise<ProductAssetApprovalEvent> {
    const { registrationId, decision, actor, expectedValidationAssessmentId } = command;

    if (!actor || !actor.userId) {
      throw new ProductAssetUnauthorizedError('anonymous', `decision:${decision}`, 'AUTHENTICATED');
    }

    // 1. Authorization check
    let requiredPermission: Permission;
    if (
      decision === ProductAssetApprovalDecision.APPROVED ||
      decision === ProductAssetApprovalDecision.RETIRED
    ) {
      requiredPermission = Permission.APPROVE_CREATIVE;
    } else if (decision === ProductAssetApprovalDecision.REJECTED) {
      requiredPermission = Permission.REJECT_CREATIVE;
    } else {
      throw new ProductAssetInvalidLifecycleTransitionError(
        'ANY',
        decision,
        'Cannot transition to SUBMITTED state via approval use case',
      );
    }

    if (!this.permissions.hasAnyRolePermission(actor.roles, requiredPermission)) {
      throw new ProductAssetUnauthorizedError(
        actor.userId,
        `decision:${decision}`,
        requiredPermission,
      );
    }

    // 2. Fetch registration
    const registration = await this.assetRepo.findRegistrationById(registrationId);
    if (!registration) {
      throw new ProductAssetNotFoundError(registrationId, {
        operation: 'ApproveProductAssetUseCase',
      });
    }

    const currentApproval = await this.assetRepo.findLatestApprovalEvent(registrationId);
    const currentDecision = currentApproval?.decision ?? ProductAssetApprovalDecision.SUBMITTED;
    if (currentDecision === decision && currentApproval) {
      return currentApproval;
    }

    const isValidTransition =
      (currentDecision === ProductAssetApprovalDecision.SUBMITTED &&
        (decision === ProductAssetApprovalDecision.APPROVED ||
          decision === ProductAssetApprovalDecision.REJECTED)) ||
      (currentDecision === ProductAssetApprovalDecision.APPROVED &&
        decision === ProductAssetApprovalDecision.RETIRED);

    if (!isValidTransition) {
      throw new ProductAssetInvalidLifecycleTransitionError(currentDecision, decision);
    }

    const now = this.clock.now();
    let validatedAssessmentId: string | null = null;
    let validatedValidatorVersion: string = CURRENT_VALIDATOR_VERSION;
    let validatedRightsEventId: string | null = null;
    let assetSha256 = '';

    let predecessorRetiredEvent: ProductAssetApprovalEvent | undefined;
    const outboxEvents: ProductAssetOutboxDraft[] = [];

    // 3. Pre-transaction validation for APPROVED decision
    if (decision === ProductAssetApprovalDecision.APPROVED) {
      const asset = await this.assetRepo.findAssetById(registration.productAssetId);
      if (!asset) {
        throw new ProductAssetNotFoundError(registration.productAssetId, {
          operation: 'ApproveProductAssetUseCase.findAssetById',
        });
      }
      assetSha256 = asset.sha256;

      // Verify CAS existence and readability
      const exists = await this.storage.assetExists(asset.storageKey);
      if (!exists) {
        throw new ProductAssetCorruptError(
          `CAS file missing for asset ${asset.id} at key "${asset.storageKey}"`,
        );
      }

      const buffer = await this.storage.getAssetBuffer(asset.storageKey);
      if (!buffer) {
        throw new ProductAssetCorruptError(
          `Unable to read buffer for asset ${asset.id} from key "${asset.storageKey}"`,
        );
      }

      if (buffer.length !== asset.byteSize) {
        throw new ProductAssetCorruptError(
          `Byte size mismatch: recorded ${asset.byteSize}, actual ${buffer.length}`,
        );
      }

      const computedSha = createHash('sha256').update(buffer).digest('hex').toLowerCase();
      if (computedSha !== asset.sha256.toLowerCase()) {
        throw new ProductAssetDigestMismatchError(asset.sha256, computedSha);
      }

      // Known placeholder check
      if (KNOWN_PLACEHOLDER_HASHES.has(asset.sha256.toLowerCase())) {
        throw new ProductAssetPlaceholderRejectedError(asset.sha256);
      }

      // Latest validation assessment check
      const assessment = await this.assetRepo.findLatestValidationAssessment(asset.id);
      if (
        !assessment ||
        !assessment.isValid ||
        assessment.status === ProductAssetValidationStatus.FAIL
      ) {
        throw new ProductAssetIneligibleError(
          registration.sku,
          `Validation assessment failed or missing for asset ${asset.id}`,
        );
      }

      if (assessment.productAssetId !== registration.productAssetId) {
        throw new ProductAssetAssessmentMismatchError(
          assessment.id,
          assessment.productAssetId,
          registration.productAssetId,
        );
      }

      if (expectedValidationAssessmentId && expectedValidationAssessmentId !== assessment.id) {
        throw new ProductAssetStaleAssessmentError(expectedValidationAssessmentId, assessment.id);
      }

      if (assessment.validatorVersion !== CURRENT_VALIDATOR_VERSION) {
        throw new ProductAssetInvalidValidatorVersionError(
          CURRENT_VALIDATOR_VERSION,
          assessment.validatorVersion,
        );
      }

      validatedAssessmentId = assessment.id;
      validatedValidatorVersion = assessment.validatorVersion;

      // Rights check
      const latestRights = await this.assetRepo.findLatestRightsEvent(registration.id);
      const rightsState = latestRights?.rightsState ?? registration.rightsState;
      if (rightsState !== ProductAssetRightsState.VERIFIED) {
        throw new ProductAssetRightsUnverifiedError(registration.sku, rightsState);
      }

      if (latestRights?.effectiveAt && latestRights.effectiveAt > now) {
        throw new ProductAssetRightsUnverifiedError(registration.sku, 'NOT_YET_EFFECTIVE');
      }

      if (latestRights?.expiresAt && latestRights.expiresAt <= now) {
        throw new ProductAssetRightsUnverifiedError(registration.sku, 'EXPIRED');
      }

      if (registration.rightsExpiresAt && registration.rightsExpiresAt <= now) {
        throw new ProductAssetRightsUnverifiedError(registration.sku, 'EXPIRED');
      }

      validatedRightsEventId = latestRights?.id ?? null;

      // Role check: HERO_CUTOUT must have alpha transparency
      if (registration.role === ProductAssetRole.HERO_CUTOUT) {
        if (!asset.hasAlpha || asset.transparencyRatio <= 0) {
          throw new ProductAssetOpaqueHeroError(registration.sku);
        }
      }

      // 4. Safe Replacement Chain Activation
      if (registration.replacesRegistrationId) {
        const predecessor = await this.assetRepo.findRegistrationById(
          registration.replacesRegistrationId,
        );
        if (predecessor) {
          const predEvents = await this.assetRepo.findApprovalEventsByRegistration(predecessor.id);
          const predLatest = predEvents[0];
          if (predLatest && predLatest.decision === ProductAssetApprovalDecision.APPROVED) {
            const predAsset = await this.assetRepo.findAssetById(predecessor.productAssetId);

            predecessorRetiredEvent = {
              id: crypto.randomUUID(),
              productAssetRegistrationId: predecessor.id,
              decision: ProductAssetApprovalDecision.RETIRED,
              decidedByUserId: actor.userId,
              reason: `REPLACED_BY_${registration.id}`,
              notes: `Replaced by approved registration ${registration.id}`,
              validationAssessmentId: predLatest.validationAssessmentId ?? null,
              decidedAt: now,
            };

            // Outbox: predecessor retired
            outboxEvents.push({
              topic: 'product_asset.retired',
              schemaVersion: 1,
              idempotencyKey: `product-asset-retired-${predecessorRetiredEvent.id}`,
              aggregateType: 'ProductAssetRegistration',
              aggregateId: predecessor.id,
              payload: {
                eventId: predecessorRetiredEvent.id,
                registrationId: predecessor.id,
                sku: predecessor.sku,
                decision: ProductAssetApprovalDecision.RETIRED,
                decidedByUserId: actor.userId,
                replacedByRegistrationId: registration.id,
                correlationId: actor.correlationId ?? null,
                occurredAt: now.toISOString(),
              },
              occurredAt: now,
              availableAt: now,
            });

            // Outbox: semantically correct visual invalidation event
            outboxEvents.push({
              topic: 'approval.invalidation_requested_by_asset_change',
              schemaVersion: 1,
              idempotencyKey: `approval-invalidation-asset-${predecessor.id}-${registration.id}`,
              aggregateType: 'ProductAssetRegistration',
              aggregateId: predecessor.id,
              payload: {
                sku: registration.sku,
                previousRegistrationId: predecessor.id,
                newRegistrationId: registration.id,
                previousAssetSha256: predAsset?.sha256 ?? 'unknown',
                newAssetSha256: assetSha256,
                changedScopes: ['visualAssets'],
                preservedScopes: ['pricing', 'stock', 'promotion', 'facts'],
                reason: command.reason ?? 'Visual asset replaced and approved',
                actor: actor.userId,
                correlationId: actor.correlationId ?? null,
                occurredAt: now.toISOString(),
              },
              occurredAt: now,
              availableAt: now,
            });
          }
        }
      }
    }

    // 5. Prepare approval event with EXACT assessment ID
    const eventId = crypto.randomUUID();
    const event: ProductAssetApprovalEvent = {
      id: eventId,
      productAssetRegistrationId: registrationId,
      decision,
      decidedByUserId: actor.userId,
      reason: command.reason ?? null,
      notes: command.notes ?? null,
      validationAssessmentId: validatedAssessmentId,
      decidedAt: now,
    };

    // 6. Primary outbox event mapping
    const topicMap: Record<ProductAssetApprovalDecision, string> = {
      [ProductAssetApprovalDecision.APPROVED]: 'product_asset.approved',
      [ProductAssetApprovalDecision.REJECTED]: 'product_asset.rejected',
      [ProductAssetApprovalDecision.RETIRED]: 'product_asset.retired',
      [ProductAssetApprovalDecision.SUBMITTED]: 'product_asset.submitted',
    };

    const primaryPayload: Record<string, unknown> = {
      eventId,
      registrationId,
      sku: registration.sku,
      decision,
      decidedByUserId: actor.userId,
      reason: command.reason ?? null,
      correlationId: actor.correlationId ?? null,
      occurredAt: now.toISOString(),
    };

    if (decision === ProductAssetApprovalDecision.APPROVED) {
      primaryPayload.validationAssessmentId = validatedAssessmentId;
      primaryPayload.validatorVersion = validatedValidatorVersion;
      primaryPayload.rightsEventId = validatedRightsEventId;
      primaryPayload.sha256 = assetSha256;
    }

    outboxEvents.push({
      topic: topicMap[decision],
      schemaVersion: 1,
      idempotencyKey: `product-asset-decision-${eventId}`,
      aggregateType: 'ProductAssetRegistration',
      aggregateId: registrationId,
      payload: primaryPayload,
      occurredAt: now,
      availableAt: now,
    });

    // 7. Atomic persistence via Unit of Work with row locking
    return this.unitOfWork.executeApproval({
      approvalEvent: event,
      predecessorRetiredEvent,
      outboxEvents,
      ...(decision === ProductAssetApprovalDecision.APPROVED
        ? {
            expectedEvidence: {
              productAssetId: registration.productAssetId,
              assetSha256,
              validationAssessmentId: validatedAssessmentId!,
              validatorVersion: validatedValidatorVersion,
              rightsEventId: validatedRightsEventId,
            },
          }
        : {}),
    });
  }
}
