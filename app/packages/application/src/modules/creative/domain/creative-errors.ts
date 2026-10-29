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

export class CanonicalProductImageMissingError extends ApplicationError {
  public constructor(sku?: string, details?: Readonly<Record<string, unknown>>) {
    super({
      code: 'NOT_FOUND',
      publicMessage:
        'Canonical product image is missing. Upload or seed a transparent PNG before generating the poster.',
      details: { ...(sku !== undefined ? { sku } : {}), ...(details ?? {}) },
    });
  }
}

export class CanonicalProductOpaqueError extends ApplicationError {
  public constructor(
    message = 'Canonical product image has an opaque background. Please supply a transparent PNG.',
    details?: Readonly<Record<string, unknown>>,
  ) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: message,
      ...(details !== undefined ? { details } : {}),
    });
  }
}

export class KnownPlaceholderRejectedError extends ApplicationError {
  public constructor(digest: string, details?: Readonly<Record<string, unknown>>) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage:
        'Known placeholder image detected. Authentic canonical product asset required.',
      details: { digest, ...(details ?? {}) },
    });
  }
}

export class ProductAssetValidationError extends ApplicationError {
  public constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Product asset validation failed: ${message}`,
      ...(details !== undefined ? { details } : {}),
    });
  }
}

export class InvalidPosterSpecError extends ApplicationError {
  public constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Invalid poster specification: ${message}`,
      ...(details !== undefined ? { details } : {}),
    });
  }
}

export class PosterLayoutOverflowError extends ApplicationError {
  public constructor(
    elementName: string,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Poster layout overflow for "${elementName}": ${message}`,
      details: { elementName, ...(details ?? {}) },
    });
  }
}

export class PosterCollisionError extends ApplicationError {
  public constructor(
    elementA: string,
    elementB: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Poster layout collision detected between "${elementA}" and "${elementB}"`,
      details: { elementA, elementB, ...(details ?? {}) },
    });
  }
}

export class PosterFontNotFoundError extends ApplicationError {
  public constructor(fontFamily: string, searchPaths: readonly string[]) {
    super({
      code: 'EXTERNAL_SERVICE_ERROR',
      publicMessage: `Required font "${fontFamily}" could not be loaded from search paths`,
      details: { fontFamily, searchPaths },
    });
  }
}

export class PosterFontGlyphMissingError extends ApplicationError {
  public readonly fontFamily: string;
  public readonly codePoint: number;
  public readonly hexCodePoint: string;
  public readonly role?: string | undefined;

  public constructor(fontFamily: string, codePoint: number, role?: string) {
    const hex = 'U+' + codePoint.toString(16).toUpperCase().padStart(4, '0');
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Font "${fontFamily}" is missing glyph for code point ${hex}${role ? ` in role "${role}"` : ''}`,
      details: { fontFamily, codePoint, hex, ...(role !== undefined ? { role } : {}) },
    });
    this.fontFamily = fontFamily;
    this.codePoint = codePoint;
    this.hexCodePoint = hex;
    this.role = role;
  }
}

export class PosterFontIntegrityError extends ApplicationError {
  public constructor(fontId: string, expectedSha256: string, actualSha256: string) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Font "${fontId}" integrity verification failed. Expected SHA-256 ${expectedSha256}, actual ${actualSha256}`,
      details: { fontId, expectedSha256, actualSha256 },
    });
  }
}

export class PosterFontWeightUnsupportedError extends ApplicationError {
  public constructor(
    fontFamily: string,
    requestedWeight: number,
    supportedWeights: readonly number[] | string,
  ) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Font "${fontFamily}" does not support requested weight ${requestedWeight}`,
      details: { fontFamily, requestedWeight, supportedWeights },
    });
  }
}

export class PosterTextShapingError extends ApplicationError {
  public constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super({
      code: 'INFRASTRUCTURE_ERROR',
      publicMessage: `Text shaping failed: ${message}`,
      ...(details !== undefined ? { details } : {}),
    });
  }
}

export class PosterUnsafeUnicodeError extends ApplicationError {
  public readonly codePoint: number;
  public readonly hexCodePoint: string;
  public readonly reason: string;
  public readonly role?: string | undefined;

  public constructor(codePoint: number, reason: string, role?: string) {
    const hex = 'U+' + codePoint.toString(16).toUpperCase().padStart(4, '0');
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Unsafe Unicode sequence detected (${hex}: ${reason})${role ? ` in role "${role}"` : ''}`,
      details: { codePoint, hex, reason, ...(role !== undefined ? { role } : {}) },
    });
    this.codePoint = codePoint;
    this.hexCodePoint = hex;
    this.reason = reason;
    this.role = role;
  }
}

export class PosterUnsupportedScriptError extends ApplicationError {
  public readonly codePoint: number;
  public readonly hexCodePoint: string;
  public readonly character: string;
  public readonly scriptCategory?: string | undefined;
  public readonly role?: string | undefined;

  public constructor(codePoint: number, character: string, scriptCategory?: string, role?: string) {
    const hex = 'U+' + codePoint.toString(16).toUpperCase().padStart(4, '0');
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Unsupported script character "${character}" (${hex}) detected${role ? ` in role "${role}"` : ''}. Parisian Shopper AI only supports Khmer, Latin, and approved neutral symbols.`,
      details: {
        codePoint,
        hexCodePoint: hex,
        character,
        ...(scriptCategory !== undefined ? { scriptCategory } : {}),
        ...(role !== undefined ? { role } : {}),
      },
    });
    this.codePoint = codePoint;
    this.hexCodePoint = hex;
    this.character = character;
    this.scriptCategory = scriptCategory;
    this.role = role;
  }
}

export class TemplateNotFoundError extends ApplicationError {
  public constructor(templateId: string, version?: string) {
    super({
      code: 'NOT_FOUND',
      publicMessage: version
        ? `Template not found: ${templateId} (version ${version})`
        : `Template not found: ${templateId}`,
      details: { templateId, ...(version ? { version } : {}) },
    });
  }
}

export class TemplateNotEligibleForProductionError extends ApplicationError {
  public constructor(templateId: string, version: string, state: string) {
    super({
      code: 'FORBIDDEN',
      publicMessage: `Template ${templateId}@${version} is in state "${state}" and is not eligible for production use. Only APPROVED templates may be used in production.`,
      details: { templateId, version, state },
    });
  }
}

export class InvalidTemplateDefinitionError extends ApplicationError {
  public constructor(reason: string, details?: Record<string, unknown>) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Invalid template definition: ${reason}`,
      ...(details ? { details } : {}),
    });
  }
}

export class DuplicateTemplateRegistrationError extends ApplicationError {
  public constructor(templateId: string, version: string) {
    super({
      code: 'CONFLICT',
      publicMessage: `Template ${templateId}@${version} is already registered. Template definitions are immutable and cannot be overwritten.`,
      details: { templateId, version },
    });
  }
}

export class UnsatisfiableLayoutConstraintError extends ApplicationError {
  public constructor(
    constraintName: string,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Unsatisfiable layout constraint "${constraintName}": ${message}`,
      details: { constraintName, ...(details ?? {}) },
    });
  }
}

export class TemplateDigestMismatchError extends ApplicationError {
  public constructor(
    templateId: string,
    version: string,
    expectedDigest: string,
    actualDigest: string,
  ) {
    super({
      code: 'CONFLICT',
      publicMessage: `Template ${templateId}@${version} digest mismatch. Expected ${expectedDigest}, got ${actualDigest}. Template approval rejected.`,
      details: { templateId, version, expectedDigest, actualDigest },
    });
  }
}

export class UnverifiedCommercialFactError extends ApplicationError {
  public constructor(reason: string, details?: Readonly<Record<string, unknown>>) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Unverified commercial fact: ${reason}`,
      details: details ?? {},
    });
  }
}

export class CompositorLayerMissingAssetError extends ApplicationError {
  public readonly failedLayerIndex: number;

  public constructor(
    layerIndex: number,
    reason: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Compositor layer at index ${layerIndex} is missing required asset: ${reason}`,
      details: { failedLayerIndex: layerIndex, layerIndex, reason, ...(details ?? {}) },
    });
    this.failedLayerIndex = layerIndex;
  }
}

export class CompositorCorruptedLayerAssetError extends ApplicationError {
  public constructor(
    layerIndex: number,
    expectedDigest: string,
    actualDigest: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super({
      code: 'CONFLICT',
      publicMessage: `Compositor layer at index ${layerIndex} asset is corrupted. Expected digest ${expectedDigest}, got ${actualDigest}.`,
      details: { layerIndex, expectedDigest, actualDigest, ...(details ?? {}) },
    });
  }
}

export class CompositorUnsupportedCanvasGeometryError extends ApplicationError {
  public constructor(
    width: number,
    height: number,
    reason?: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Unsupported compositor canvas geometry (${width}x${height}): ${reason ?? 'Dimensions must be positive integers'}`,
      details: { width, height, reason, ...(details ?? {}) },
    });
  }
}

export class CompositorColorProfileError extends ApplicationError {
  public constructor(profile: string, reason: string, details?: Readonly<Record<string, unknown>>) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Compositor color profile error for "${profile}": ${reason}`,
      details: { profile, reason, ...(details ?? {}) },
    });
  }
}

export class ProductHeroContainmentError extends ApplicationError {
  public constructor(reason: string, details?: Readonly<Record<string, unknown>>) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Product hero containment error: ${reason}`,
      details: { reason, ...(details ?? {}) },
    });
  }
}

export class RevisionPlanValidationError extends ApplicationError {
  public constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Invalid revision plan: ${message}`,
      ...(details !== undefined ? { details } : {}),
    });
  }
}

export class LayerDriftViolationError extends ApplicationError {
  public constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super({
      code: 'CONFLICT',
      publicMessage: `Layer drift invariant violation: ${message}`,
      ...(details !== undefined ? { details } : {}),
    });
  }
}

export class AmbiguousRevisionError extends ApplicationError {
  public constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super({
      code: 'CONFLICT',
      publicMessage: `Ambiguous revision requires confirmation: ${message}`,
      details: { ...(details ?? {}) },
    });
  }
}

export class CreativeExportNotFoundError extends ApplicationError {
  public constructor(exportId: string) {
    super({
      code: 'NOT_FOUND',
      publicMessage: `Creative export "${exportId}" was not found.`,
      details: { exportId },
    });
  }
}

export class CreativeExportConflictError extends ApplicationError {
  public constructor(visualAssetId: string, format: string, encoding: string) {
    super({
      code: 'CONFLICT',
      publicMessage: `Creative export already exists for asset "${visualAssetId}", format "${format}", and encoding "${encoding}".`,
      details: { visualAssetId, format, encoding },
    });
  }
}
