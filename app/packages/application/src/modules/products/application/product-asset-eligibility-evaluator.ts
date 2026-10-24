import { createHash } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { CLOCK, type Clock, SystemClock } from '@parisian-shopper/common';
import {
  PRODUCT_ASSET_REPOSITORY,
  type ProductAssetRepository,
} from './product-asset.repository.js';
import {
  PRODUCT_ASSET_STORAGE,
  type ProductAssetStoragePort,
} from './product-asset-storage.port.js';
import {
  CURRENT_VALIDATOR_VERSION,
  KNOWN_PLACEHOLDER_HASHES,
  PRODUCT_ASSET_VALIDATOR,
  ProductAssetValidator,
} from '../../creative/domain/services/product-asset-validator.js';
import {
  ProductAssetApprovalDecision,
  ProductAssetRightsState,
  ProductAssetRole,
  ProductAssetValidationStatus,
  type ProductAsset,
  type ProductAssetApprovalEvent,
  type ProductAssetRegistration,
  type ProductAssetRightsEvent,
  type ProductAssetValidationAssessment,
} from '../domain/product-asset.js';
import { selectActiveHeroCutoutCandidate } from '../domain/product-asset-selection.js';
import {
  ProductAssetDigestMismatchError,
  ProductAssetIneligibleError,
  ProductAssetInvalidValidatorVersionError,
  ProductAssetMissingStorageBytesError,
  ProductAssetOpaqueHeroError,
  ProductAssetPlaceholderRejectedError,
  ProductAssetRightsUnverifiedError,
  ProductAssetUnapprovedError,
} from '../domain/product-asset-errors.js';

export const PRODUCT_ASSET_ELIGIBILITY_EVALUATOR = Symbol('PRODUCT_ASSET_ELIGIBILITY_EVALUATOR');

export interface ProductAssetEligibilityResult {
  readonly isEligible: boolean;
  readonly reasonCode?: string | undefined;
  readonly message?: string | undefined;
  readonly asset?: ProductAsset | undefined;
  readonly registration?: ProductAssetRegistration | undefined;
  readonly assessment?: ProductAssetValidationAssessment | undefined;
  readonly rightsEvent?: ProductAssetRightsEvent | undefined;
  readonly approvalEvent?: ProductAssetApprovalEvent | undefined;
  readonly buffer?: Buffer | undefined;
}

export interface EligibleHeroCutout {
  readonly asset: ProductAsset;
  readonly registration: ProductAssetRegistration;
  readonly assessment?: ProductAssetValidationAssessment | undefined;
  readonly rightsEvent?: ProductAssetRightsEvent | undefined;
  readonly approvalEvent?: ProductAssetApprovalEvent | undefined;
  readonly buffer: Buffer;
}

export interface AuthoritativeHeroEvidence {
  readonly asset: ProductAsset;
  readonly registration: ProductAssetRegistration;
  readonly assessment: ProductAssetValidationAssessment;
  readonly rightsEvent: ProductAssetRightsEvent;
  readonly approvalEvent: ProductAssetApprovalEvent;
  readonly buffer: Buffer;
}

@Injectable()
export class ProductAssetEligibilityEvaluator {
  private readonly clock: Clock;
  private readonly validator: ProductAssetValidator;

  public constructor(
    @Inject(PRODUCT_ASSET_REPOSITORY)
    private readonly assetRepo: ProductAssetRepository,
    @Inject(PRODUCT_ASSET_STORAGE)
    private readonly storage: ProductAssetStoragePort,
    @Optional()
    @Inject(PRODUCT_ASSET_VALIDATOR)
    validator?: ProductAssetValidator,
    @Optional()
    @Inject(CLOCK)
    clock?: Clock,
  ) {
    this.validator = validator ?? new ProductAssetValidator();
    this.clock = clock ?? new SystemClock();
  }

  /**
   * Evaluates whether a SKU has an active, approved, verified, valid HERO_CUTOUT asset in the governed registry.
   * Performs deterministic candidate selection: ignores superseded and retired registrations so replaced assets never reactivate.
   */
  public async evaluateHeroEligibility(sku: string): Promise<ProductAssetEligibilityResult> {
    if (!sku || sku.trim() === '') {
      return {
        isEligible: false,
        reasonCode: 'SKU_EMPTY',
        message: 'SKU must be non-empty',
      };
    }

    // 1. Look up all HERO_CUTOUT registrations for this SKU, ordered sequence DESC
    const registrations = await this.assetRepo.findRegistrationsBySkuAndRole(
      sku,
      ProductAssetRole.HERO_CUTOUT,
    );

    if (!registrations || registrations.length === 0) {
      return {
        isEligible: false,
        reasonCode: 'NO_HERO_ASSET_REGISTERED',
        message: `No HERO_CUTOUT product asset registered for SKU "${sku}"`,
      };
    }

    // 2. Fetch latest approval events to resolve decisions
    const items = await Promise.all(
      registrations.map(async (registration) => {
        const events = await this.assetRepo.findApprovalEventsByRegistration(registration.id);
        const latestApprovalEvent = events[0];
        const latestDecision = latestApprovalEvent?.decision ?? ProductAssetApprovalDecision.SUBMITTED;
        return {
          registration,
          latestDecision,
          latestApprovalEvent,
        };
      }),
    );

    // 3. Canonically select the single active candidate
    const candidateItem = selectActiveHeroCutoutCandidate(items);
    if (!candidateItem) {
      return {
        isEligible: false,
        reasonCode: 'NO_ELIGIBLE_ASSET',
        message: `All HERO_CUTOUT registrations for SKU "${sku}" have been retired`,
      };
    }

    const { registration, latestDecision } = candidateItem;

    if (latestDecision !== ProductAssetApprovalDecision.APPROVED) {
      return {
        isEligible: false,
        reasonCode: 'NOT_APPROVED',
        message: `Registration ${registration.id} has not been approved (latest decision: ${latestDecision})`,
        registration,
      };
    }

    const now = this.clock.now();

    // Check rights verification
    const latestRights = await this.assetRepo.findLatestRightsEvent(registration.id);
    const rightsState = latestRights?.rightsState ?? registration.rightsState;

    if (rightsState !== ProductAssetRightsState.VERIFIED) {
      return {
        isEligible: false,
        reasonCode: 'RIGHTS_NOT_VERIFIED',
        message: `Asset rights state is "${rightsState}". Must be VERIFIED.`,
        registration,
      };
    }

    if (latestRights?.effectiveAt && latestRights.effectiveAt > now) {
      return {
        isEligible: false,
        reasonCode: 'RIGHTS_NOT_YET_EFFECTIVE',
        message: `Asset rights become effective on ${latestRights.effectiveAt.toISOString()}`,
        registration,
      };
    }

    if (
      (latestRights?.expiresAt && latestRights.expiresAt <= now) ||
      (registration.rightsExpiresAt && registration.rightsExpiresAt <= now)
    ) {
      const expiredDate = latestRights?.expiresAt ?? registration.rightsExpiresAt;
      return {
        isEligible: false,
        reasonCode: 'RIGHTS_EXPIRED',
        message: `Asset rights expired on ${expiredDate?.toISOString()}`,
        registration,
      };
    }

    // Find underlying ProductAsset record
    const asset = await this.assetRepo.findAssetById(registration.productAssetId);
    if (!asset) {
      return {
        isEligible: false,
        reasonCode: 'ASSET_RECORD_MISSING',
        message: `Underlying ProductAsset ${registration.productAssetId} missing from registry`,
        registration,
      };
    }

    // Reject known placeholders
    if (KNOWN_PLACEHOLDER_HASHES.has(asset.sha256.toLowerCase())) {
      return {
        isEligible: false,
        reasonCode: 'PLACEHOLDER_REJECTED',
        message: `Asset hash ${asset.sha256} matches known placeholder image`,
        asset,
        registration,
      };
    }

    // Check alpha transparency requirement
    if (!asset.hasAlpha || asset.transparencyRatio <= 0) {
      return {
        isEligible: false,
        reasonCode: 'OPAQUE_HERO_REJECTED',
        message: 'Hero cutouts must have alpha transparency',
        asset,
        registration,
      };
    }

    // Check stored latest validation assessment (validator version must be current)
    const assessment = await this.assetRepo.findLatestValidationAssessment(asset.id);
    if (
      !assessment ||
      !assessment.isValid ||
      assessment.status === ProductAssetValidationStatus.FAIL
    ) {
      return {
        isEligible: false,
        reasonCode: 'VALIDATION_FAILED',
        message: `Stored validation assessment failed for asset ${asset.id}`,
        asset,
        registration,
      };
    }

    if (assessment.validatorVersion !== CURRENT_VALIDATOR_VERSION) {
      return {
        isEligible: false,
        reasonCode: 'VALIDATOR_VERSION_STALE',
        message: `Stored validation assessment used validator version "${assessment.validatorVersion}", active is "${CURRENT_VALIDATOR_VERSION}"`,
        asset,
        registration,
      };
    }

    // Verify CAS storage existence
    const exists = await this.storage.assetExists(asset.storageKey);
    if (!exists) {
      return {
        isEligible: false,
        reasonCode: 'CAS_FILE_MISSING',
        message: `Asset file missing from CAS storage at "${asset.storageKey}"`,
        asset,
        registration,
      };
    }

    // Load raw buffer and verify integrity
    const buffer = await this.storage.getAssetBuffer(asset.storageKey);
    if (!buffer) {
      return {
        isEligible: false,
        reasonCode: 'CAS_FILE_UNREADABLE',
        message: `Unable to read asset buffer from CAS storage at "${asset.storageKey}"`,
        asset,
        registration,
      };
    }

    if (buffer.length !== asset.byteSize) {
      return {
        isEligible: false,
        reasonCode: 'DIGEST_MISMATCH',
        message: `Asset byte size mismatch: expected ${asset.byteSize}, got ${buffer.length}`,
        asset,
        registration,
      };
    }

    const computedSha = createHash('sha256').update(buffer).digest('hex').toLowerCase();
    if (computedSha !== asset.sha256.toLowerCase()) {
      return {
        isEligible: false,
        reasonCode: 'DIGEST_MISMATCH',
        message: `Asset digest mismatch: expected ${asset.sha256}, got ${computedSha}`,
        asset,
        registration,
      };
    }

    // Validate buffer with ProductAssetValidator for final assurance
    const validation = await this.validator.validate({
      assetBuffer: buffer,
      expectedSku: sku,
      expectedSha256: asset.sha256,
      role: ProductAssetRole.HERO_CUTOUT,
    });

    if (!validation.isValid) {
      return {
        isEligible: false,
        reasonCode: 'VALIDATION_FAILED',
        message: `Product asset validation failed: ${validation.findings.join('; ')}`,
        asset,
        registration,
      };
    }

    // Active candidate is 100% eligible!
    return {
      isEligible: true,
      asset,
      registration,
      assessment,
      rightsEvent: latestRights ?? undefined,
      approvalEvent: candidateItem.latestApprovalEvent ?? undefined,
      buffer,
    };
  }

  /**
   * Asserts that a SKU has an eligible HERO_CUTOUT asset, throwing targeted domain errors if not.
   */
  public async assertHeroEligible(sku: string): Promise<EligibleHeroCutout> {
    const result = await this.evaluateHeroEligibility(sku);

    if (result.isEligible && result.asset && result.registration && result.buffer) {
      return {
        asset: result.asset,
        registration: result.registration,
        assessment: result.assessment,
        rightsEvent: result.rightsEvent,
        approvalEvent: result.approvalEvent,
        buffer: result.buffer,
      };
    }

    switch (result.reasonCode) {
      case 'NO_HERO_ASSET_REGISTERED':
      case 'ASSET_RECORD_MISSING':
      case 'CAS_FILE_MISSING':
      case 'CAS_FILE_UNREADABLE':
        throw new ProductAssetMissingStorageBytesError(sku, result.asset?.storageKey ?? 'unknown', {
          reasonCode: result.reasonCode,
          details: result.message,
        });

      case 'RIGHTS_NOT_VERIFIED':
      case 'RIGHTS_NOT_YET_EFFECTIVE':
      case 'RIGHTS_EXPIRED':
        throw new ProductAssetRightsUnverifiedError(
          sku,
          result.registration?.rightsState ?? 'UNKNOWN',
          { reasonCode: result.reasonCode, message: result.message },
        );

      case 'NOT_APPROVED':
        throw new ProductAssetUnapprovedError(sku, 'UNAPPROVED', {
          reasonCode: result.reasonCode,
          message: result.message,
        });

      case 'PLACEHOLDER_REJECTED':
        throw new ProductAssetPlaceholderRejectedError(result.asset?.sha256 ?? 'unknown');

      case 'OPAQUE_HERO_REJECTED':
        throw new ProductAssetOpaqueHeroError(sku, {
          reasonCode: result.reasonCode,
          message: result.message,
        });

      case 'VALIDATOR_VERSION_STALE':
        throw new ProductAssetInvalidValidatorVersionError(
          CURRENT_VALIDATOR_VERSION,
          result.message ?? 'stale',
        );

      case 'DIGEST_MISMATCH':
        throw new ProductAssetDigestMismatchError(
          result.asset?.sha256 ?? 'expected',
          'computed_mismatch',
        );

      default:
        throw new ProductAssetIneligibleError(
          sku,
          result.message ?? result.reasonCode ?? 'Unknown eligibility failure',
          { reasonCode: result.reasonCode },
        );
    }
  }

  /**
   * Resolves authoritative W12 evidence for a hero cutout, returning all 5 records
   * (ProductAsset, ProductAssetRegistration, ProductAssetValidationAssessment,
   * ProductAssetRightsEvent, ProductAssetApprovalEvent) and verified CAS buffer.
   * Fails closed if any required record is missing or mismatched.
   */
  public async resolveAuthoritativeHeroEvidence(
    sku: string,
    options?: {
      productAssetRegistrationId?: string;
      productAssetId?: string;
    },
  ): Promise<AuthoritativeHeroEvidence> {
    const hero = await this.assertHeroEligible(sku);

    if (
      options?.productAssetRegistrationId &&
      hero.registration.id !== options.productAssetRegistrationId
    ) {
      throw new ProductAssetIneligibleError(
        sku,
        `Active hero registration "${hero.registration.id}" does not match requested "${options.productAssetRegistrationId}"`,
      );
    }

    if (options?.productAssetId && hero.asset.id !== options.productAssetId) {
      throw new ProductAssetIneligibleError(
        sku,
        `Active hero product asset "${hero.asset.id}" does not match requested "${options.productAssetId}"`,
      );
    }

    let assessment = hero.assessment;
    if (!assessment) {
      assessment = (await this.assetRepo.findLatestValidationAssessment(hero.asset.id)) ?? undefined;
    }
    if (!assessment) {
      throw new ProductAssetIneligibleError(
        sku,
        `Missing validation assessment for product asset "${hero.asset.id}"`,
      );
    }
    if (assessment.productAssetId !== hero.asset.id) {
      throw new ProductAssetIneligibleError(
        sku,
        `Validation assessment product asset "${assessment.productAssetId}" does not match active asset "${hero.asset.id}"`,
      );
    }
    if (!assessment.isValid) {
      throw new ProductAssetIneligibleError(
        sku,
        `Validation assessment for asset "${hero.asset.id}" is marked invalid`,
      );
    }
    if (assessment.status === ProductAssetValidationStatus.FAIL) {
      throw new ProductAssetIneligibleError(
        sku,
        `Validation assessment for asset "${hero.asset.id}" has FAIL status`,
      );
    }
    if (assessment.validatorVersion !== CURRENT_VALIDATOR_VERSION) {
      throw new ProductAssetInvalidValidatorVersionError(
        CURRENT_VALIDATOR_VERSION,
        assessment.validatorVersion,
      );
    }

    let rightsEvent = hero.rightsEvent;
    if (!rightsEvent) {
      rightsEvent = (await this.assetRepo.findLatestRightsEvent(hero.registration.id)) ?? undefined;
    }
    if (!rightsEvent) {
      throw new ProductAssetRightsUnverifiedError(
        sku,
        hero.registration.rightsState,
        { message: 'Missing authoritative rights event record' },
      );
    }
    if (rightsEvent.productAssetRegistrationId !== hero.registration.id) {
      throw new ProductAssetRightsUnverifiedError(
        sku,
        rightsEvent.rightsState,
        { message: `Authoritative rights event registration "${rightsEvent.productAssetRegistrationId}" does not match active registration "${hero.registration.id}"` },
      );
    }
    if (rightsEvent.rightsState !== ProductAssetRightsState.VERIFIED) {
      throw new ProductAssetRightsUnverifiedError(
        sku,
        rightsEvent.rightsState,
        { message: 'Authoritative rights event is not VERIFIED' },
      );
    }
    const now = this.clock.now();
    if (rightsEvent.effectiveAt > now) {
      throw new ProductAssetRightsUnverifiedError(
        sku,
        rightsEvent.rightsState,
        { message: `Authoritative rights event is not yet effective (effectiveAt: ${rightsEvent.effectiveAt.toISOString()})` },
      );
    }
    if (rightsEvent.expiresAt && rightsEvent.expiresAt <= now) {
      throw new ProductAssetRightsUnverifiedError(
        sku,
        rightsEvent.rightsState,
        { message: `Authoritative rights event has expired (expiresAt: ${rightsEvent.expiresAt.toISOString()})` },
      );
    }

    let approvalEvent = hero.approvalEvent;
    if (!approvalEvent) {
      const events = await this.assetRepo.findApprovalEventsByRegistration(hero.registration.id);
      approvalEvent = events[0] ?? undefined;
    }
    if (!approvalEvent) {
      throw new ProductAssetUnapprovedError(sku, 'NO_APPROVAL_EVENT', {
        message: `Missing authoritative approval event for registration "${hero.registration.id}"`,
      });
    }
    if (approvalEvent.productAssetRegistrationId !== hero.registration.id) {
      throw new ProductAssetUnapprovedError(sku, 'REGISTRATION_MISMATCH', {
        message: `Authoritative approval event registration "${approvalEvent.productAssetRegistrationId}" does not match active registration "${hero.registration.id}"`,
      });
    }
    if (approvalEvent.decision !== ProductAssetApprovalDecision.APPROVED) {
      throw new ProductAssetUnapprovedError(sku, approvalEvent.decision, {
        message: `Authoritative approval event is not APPROVED (decision: ${approvalEvent.decision})`,
      });
    }
    if (approvalEvent.validationAssessmentId && approvalEvent.validationAssessmentId !== assessment.id) {
      throw new ProductAssetIneligibleError(
        sku,
        `Authoritative approval event references validation assessment "${approvalEvent.validationAssessmentId}", expected current assessment "${assessment.id}"`,
      );
    }

    return {
      asset: hero.asset,
      registration: hero.registration,
      assessment,
      rightsEvent,
      approvalEvent,
      buffer: hero.buffer,
    };
  }
}
