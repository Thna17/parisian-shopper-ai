import { ApplicationError } from '@parisian-shopper/common';
import { type CreativeJobStatus } from './creative.js';

export class CreativeJobNotFoundError extends ApplicationError {
  public constructor(jobId: string) {
    super({
      code: 'NOT_FOUND',
      publicMessage: `Creative job not found: ${jobId}`,
      details: { jobId },
    });
  }
}

export class VisualAssetNotFoundError extends ApplicationError {
  public constructor(assetId: string) {
    super({
      code: 'NOT_FOUND',
      publicMessage: `Visual asset not found: ${assetId}`,
      details: { assetId },
    });
  }
}

export class CreativeInvalidTransitionError extends ApplicationError {
  public constructor(from: CreativeJobStatus, to: CreativeJobStatus) {
    super({
      code: 'CONFLICT',
      publicMessage: `Invalid creative job state transition: ${from} -> ${to}`,
      details: { from, to },
    });
  }
}

export class CreativeStaleVersionError extends ApplicationError {
  public constructor(message = 'The target visual asset version is no longer the latest revision') {
    super({
      code: 'CONFLICT',
      publicMessage: message,
    });
  }
}

export class CreativeActiveRevisionExistsError extends ApplicationError {
  public constructor(jobId: string) {
    super({
      code: 'CONFLICT',
      publicMessage: `A pending revision already exists for creative job: ${jobId}`,
      details: { jobId },
    });
  }
}

export class CreativeTerminalStateError extends ApplicationError {
  public constructor(status: CreativeJobStatus) {
    super({
      code: 'CONFLICT',
      publicMessage: `Cannot transition from terminal creative status: ${status}`,
      details: { status },
    });
  }
}

export class CreativeRevisionValidationError extends ApplicationError {
  public constructor(message: string) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Creative revision validation failed: ${message}`,
      details: { message },
    });
  }
}

export class CreativeApprovalMismatchedAssetError extends ApplicationError {
  public constructor(visualAssetId: string, visualValidationResultId: string) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Visual validation result ${visualValidationResultId} does not belong to visual asset ${visualAssetId}`,
      details: { visualAssetId, visualValidationResultId },
    });
  }
}

export class CreativeAssetConflictError extends ApplicationError {
  public constructor(creativeJobId: string, versionNumber: number) {
    super({
      code: 'CONFLICT',
      publicMessage: `Visual asset version ${versionNumber} already exists for creative job ${creativeJobId}`,
      details: { creativeJobId, versionNumber },
    });
  }
}

export class CreativeBriefValidationError extends ApplicationError {
  public constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Creative brief validation failed: ${message}`,
      ...(details !== undefined ? { details } : {}),
    });
  }
}

export class CreativeProviderProductionGuardError extends ApplicationError {
  public constructor(
    message = 'Fake creative provider is prohibited in production without explicit permission',
  ) {
    super({
      code: 'FORBIDDEN',
      publicMessage: message,
    });
  }
}

export class FakeCreativeProviderError extends ApplicationError {
  public constructor(
    message = 'Fake creative provider simulated failure',
    details?: Readonly<Record<string, unknown>>,
  ) {
    super({
      code: 'EXTERNAL_SERVICE_ERROR',
      publicMessage: message,
      ...(details !== undefined ? { details } : {}),
    });
  }
}

export class FakeCreativeProviderTimeoutError extends ApplicationError {
  public constructor(timeoutMs: number) {
    super({
      code: 'EXTERNAL_SERVICE_ERROR',
      publicMessage: `Fake creative provider timed out after ${timeoutMs}ms`,
      details: { timeoutMs },
    });
  }
}

export class AssetDigestMismatchError extends ApplicationError {
  public constructor(expected: string, actual: string) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Asset SHA-256 digest mismatch. Expected: ${expected}, Actual: ${actual}`,
      details: { expected, actual },
    });
  }
}

export class AssetOversizedError extends ApplicationError {
  public constructor(byteSize: number, maxBytes: number) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Asset size (${byteSize} bytes) exceeds maximum permitted limit of ${maxBytes} bytes`,
      details: { byteSize, maxBytes },
    });
  }
}

export class InvalidStorageKeyError extends ApplicationError {
  public constructor(storageKey: string, reason?: string) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Invalid asset storage key format: ${storageKey}${reason !== undefined ? ` (${reason})` : ''}`,
      details: { storageKey, ...(reason !== undefined ? { reason } : {}) },
    });
  }
}

export class AssetPathTraversalError extends ApplicationError {
  public constructor(pathAttempt: string) {
    super({
      code: 'FORBIDDEN',
      publicMessage: `Potential path traversal or directory escape detected: ${pathAttempt}`,
      details: { pathAttempt },
    });
  }
}

export class AssetNotFoundError extends ApplicationError {
  public constructor(storageKey: string) {
    super({
      code: 'NOT_FOUND',
      publicMessage: `Asset not found in storage: ${storageKey}`,
      details: { storageKey },
    });
  }
}

export class CreativeImageDecodeFailedError extends ApplicationError {
  public constructor(
    message = 'Failed to decode input image binary',
    details?: Readonly<Record<string, unknown>>,
  ) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Creative image decode failed: ${message}`,
      ...(details !== undefined ? { details } : {}),
    });
  }
}

export class CreativeUnsupportedImageFormatError extends ApplicationError {
  public constructor(format: string, expectedFormats: readonly string[]) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Unsupported image format "${format}". Expected one of: ${expectedFormats.join(', ')}`,
      details: { format, expectedFormats },
    });
  }
}

export class CreativeInputTooLargeError extends ApplicationError {
  public constructor(byteSize: number, maxBytes: number) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Image input size (${byteSize} bytes) exceeds maximum permitted limit of ${maxBytes} bytes`,
      details: { byteSize, maxBytes },
    });
  }
}

export class CreativePixelLimitExceededError extends ApplicationError {
  public constructor(pixels: number, maxPixels: number) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Image pixel count (${pixels} pixels) exceeds maximum permitted limit of ${maxPixels} pixels`,
      details: { pixels, maxPixels },
    });
  }
}

export class CreativeAlphaRequiredError extends ApplicationError {
  public constructor(
    message = 'Canonical product image must contain usable alpha transparency for compositing',
    details?: Readonly<Record<string, unknown>>,
  ) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: message,
      ...(details !== undefined ? { details } : {}),
    });
  }
}

export class CreativeInvalidLayoutError extends ApplicationError {
  public constructor(reason: string, details?: Readonly<Record<string, unknown>>) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Creative invalid layout: ${reason}`,
      ...(details !== undefined ? { details } : {}),
    });
  }
}

export class CreativeCompositionFailedError extends ApplicationError {
  public constructor(reason: string, details?: Readonly<Record<string, unknown>>) {
    super({
      code: 'EXTERNAL_SERVICE_ERROR',
      publicMessage: `Creative composition failed: ${reason}`,
      ...(details !== undefined ? { details } : {}),
    });
  }
}

export class CreativeOutputTooLargeError extends ApplicationError {
  public constructor(byteSize: number, maxBytes: number) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Composited output size (${byteSize} bytes) exceeds maximum limit of ${maxBytes} bytes`,
      details: { byteSize, maxBytes },
    });
  }
}

export class ContentVersionNotEligibleForCreativeError extends ApplicationError {
  public constructor(contentVersionId: string, reason: string) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Content version ${contentVersionId} is not eligible for creative generation: ${reason}`,
      details: { contentVersionId, reason },
    });
  }
}

export class CreativeValidationFailedError extends ApplicationError {
  public constructor(visualAssetId: string, blockingCount: number) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Visual asset ${visualAssetId} failed validation with ${blockingCount} blocking finding(s)`,
      details: { visualAssetId, blockingCount },
    });
  }
}

export class CreativeJobNotReadyForApprovalError extends ApplicationError {
  public constructor(jobId: string, currentStatus: CreativeJobStatus) {
    super({
      code: 'CONFLICT',
      publicMessage: `Creative job ${jobId} is not in a reviewable state (current status: ${currentStatus})`,
      details: { jobId, currentStatus },
    });
  }
}

