import { ApplicationError, type ApplicationErrorCode } from '@parisian-shopper/common';

export abstract class ProductAssetError extends ApplicationError {
  public constructor(
    code: ApplicationErrorCode,
    publicMessage: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super({
      code,
      publicMessage,
      ...(details !== undefined ? { details } : {}),
    });
  }
}

export class ProductAssetNotFoundError extends ProductAssetError {
  public constructor(identifier: string, context?: Readonly<Record<string, unknown>>) {
    super('NOT_FOUND', `Product asset not found: ${identifier}`, {
      identifier,
      ...context,
    });
  }
}

export class ProductAssetIneligibleError extends ProductAssetError {
  public constructor(sku: string, reason: string, context?: Readonly<Record<string, unknown>>) {
    super(
      'VALIDATION_ERROR',
      `Product asset for SKU "${sku}" is ineligible for creative composition: ${reason}`,
      { sku, reason, ...context },
    );
  }
}

export class ProductAssetOpaqueHeroError extends ProductAssetError {
  public constructor(sku: string, context?: Readonly<Record<string, unknown>>) {
    super(
      'VALIDATION_ERROR',
      `Product asset for SKU "${sku}" has an opaque background. Hero cutouts must have alpha transparency.`,
      { sku, ...context },
    );
  }
}

export class ProductAssetCorruptError extends ProductAssetError {
  public constructor(message: string, context?: Readonly<Record<string, unknown>>) {
    super('INVALID_PRODUCT_DATA', `Corrupt or undecodable product asset: ${message}`, context);
  }
}

export class ProductAssetDigestMismatchError extends ProductAssetError {
  public constructor(expected: string, actual: string) {
    super(
      'VALIDATION_ERROR',
      `Product asset digest mismatch: expected ${expected}, calculated ${actual}`,
      { expected, actual },
    );
  }
}

export class ProductAssetPlaceholderRejectedError extends ProductAssetError {
  public constructor(digest: string) {
    super(
      'VALIDATION_ERROR',
      `Known placeholder image rejected: ${digest}. Authentic product photography required.`,
      { digest },
    );
  }
}

export class ProductAssetRightsUnverifiedError extends ProductAssetError {
  public constructor(
    sku: string,
    rightsState: string,
    context?: Readonly<Record<string, unknown>>,
  ) {
    super(
      'FORBIDDEN',
      `Product asset for SKU "${sku}" has unverified rights state: ${rightsState}`,
      { sku, rightsState, ...context },
    );
  }
}

export class ProductAssetUnapprovedError extends ProductAssetError {
  public constructor(sku: string, decision: string, context?: Readonly<Record<string, unknown>>) {
    super(
      'FORBIDDEN',
      `Product asset for SKU "${sku}" is not approved for creative generation (status: ${decision})`,
      { sku, decision, ...context },
    );
  }
}

export class ProductAssetSSRFViolationError extends ProductAssetError {
  public constructor(url: string, reason: string) {
    super(
      'FORBIDDEN',
      `Remote asset acquisition rejected for security (SSRF protection): ${reason}`,
      { url, reason },
    );
  }
}

export class ProductAssetOversizedError extends ProductAssetError {
  public constructor(byteSize: number, maxBytes: number) {
    super(
      'VALIDATION_ERROR',
      `Product asset size (${byteSize} bytes) exceeds limit (${maxBytes} bytes)`,
      { byteSize, maxBytes },
    );
  }
}

export class ProductAssetMissingStorageBytesError extends ProductAssetError {
  public constructor(sku: string, storageKey: string, context?: Readonly<Record<string, unknown>>) {
    super(
      'NOT_FOUND',
      `Governed product asset bytes are missing or unreadable for SKU "${sku}" at storage key "${storageKey}"`,
      { sku, storageKey, ...context },
    );
  }
}

export class ProductAssetRegistryValidationError extends ProductAssetError {
  public constructor(reasons: readonly string[]) {
    super('VALIDATION_ERROR', `Product asset validation failed: ${reasons.join('; ')}`, {
      reasons,
    });
  }
}

export class ProductAssetUnauthorizedError extends ProductAssetError {
  public constructor(userId: string, action: string, requiredPermission: string) {
    super(
      'FORBIDDEN',
      `User "${userId}" is not authorized to perform "${action}". Required permission: ${requiredPermission}.`,
      { userId, action, requiredPermission },
    );
  }
}

export class ProductAssetInvalidLifecycleTransitionError extends ProductAssetError {
  public constructor(from: string, to: string, reason?: string) {
    super(
      'VALIDATION_ERROR',
      `Invalid product asset lifecycle transition from ${from} to ${to}${reason !== undefined ? `: ${reason}` : ''}`,
      { from, to, ...(reason !== undefined ? { reason } : {}) },
    );
  }
}

export class ProductAssetMetadataConflictError extends ProductAssetError {
  public constructor(
    sha256: string,
    field: string,
    existingValue: unknown,
    incomingValue: unknown,
  ) {
    super(
      'CONFLICT',
      `Immutable ProductAsset "${sha256}" conflict on field "${field}": existing is "${String(existingValue)}", incoming is "${String(incomingValue)}"`,
      { sha256, field, existingValue, incomingValue },
    );
  }
}

export class ProductAssetMaskDimensionMismatchError extends ProductAssetError {
  public constructor(
    parentWidth: number,
    parentHeight: number,
    maskWidth: number,
    maskHeight: number,
  ) {
    super(
      'VALIDATION_ERROR',
      `Mask dimensions (${maskWidth}x${maskHeight}) must exactly match parent asset dimensions (${parentWidth}x${parentHeight})`,
      { parentWidth, parentHeight, maskWidth, maskHeight },
    );
  }
}

export class ProductAssetInvalidValidatorVersionError extends ProductAssetError {
  public constructor(expectedVersion: string, actualVersion: string) {
    super(
      'VALIDATION_ERROR',
      `Product asset validation assessment validator version mismatch: active is "${expectedVersion}", assessment used "${actualVersion}"`,
      { expectedVersion, actualVersion },
    );
  }
}

export class ProductAssetLegacyFallbackDisabledError extends ProductAssetError {
  public constructor(sku: string) {
    super(
      'FORBIDDEN',
      `Legacy product asset fallback is strictly disabled in production. Governed asset registry required for SKU "${sku}".`,
      { sku },
    );
  }
}

export class ProductAssetStaleAssessmentError extends ProductAssetError {
  public constructor(
    expectedAssessmentId: string,
    latestAssessmentId: string,
    context?: Readonly<Record<string, unknown>>,
  ) {
    super(
      'CONFLICT',
      `Product asset approval stale assessment: expected assessment "${expectedAssessmentId}", but latest assessment is "${latestAssessmentId}"`,
      { expectedAssessmentId, latestAssessmentId, ...context },
    );
  }
}

export class ProductAssetAssessmentMismatchError extends ProductAssetError {
  public constructor(assessmentId: string, assessmentAssetId: string, registrationAssetId: string) {
    super(
      'VALIDATION_ERROR',
      `Assessment "${assessmentId}" belongs to asset "${assessmentAssetId}", but registration is for asset "${registrationAssetId}"`,
      { assessmentId, assessmentAssetId, registrationAssetId },
    );
  }
}

export class ProductAssetPredecessorRetiredError extends ProductAssetError {
  public constructor(predecessorRegistrationId: string, reason: string) {
    super(
      'CONFLICT',
      `Predecessor registration "${predecessorRegistrationId}" cannot be replaced: ${reason}`,
      { predecessorRegistrationId, reason },
    );
  }
}

export class ProductAssetStaleEvidenceError extends ProductAssetError {
  public constructor(
    evidenceType: string,
    message: string,
    context?: Readonly<Record<string, unknown>>,
  ) {
    super('CONFLICT', `Product asset approval stale evidence (${evidenceType}): ${message}`, {
      evidenceType,
      message,
      ...context,
    });
  }
}
