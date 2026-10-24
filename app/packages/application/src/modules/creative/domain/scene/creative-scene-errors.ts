import { ApplicationError } from '@parisian-shopper/common';

export class CreativeSceneNotFoundError extends ApplicationError {
  public constructor(sceneId: string) {
    super({
      code: 'NOT_FOUND',
      publicMessage: `Creative scene not found: ${sceneId}`,
      details: { sceneId },
    });
  }
}

export class CreativeSceneVersionNotFoundError extends ApplicationError {
  public constructor(identifier: { sceneId?: string; versionNumber?: number; versionId?: string }) {
    super({
      code: 'NOT_FOUND',
      publicMessage: `Creative scene version not found: ${JSON.stringify(identifier)}`,
      details: identifier,
    });
  }
}

export class InvalidSceneLayerError extends ApplicationError {
  public constructor(layerId: string, reason: string, details?: Readonly<Record<string, unknown>>) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Invalid scene layer "${layerId}": ${reason}`,
      details: { layerId, reason, ...(details ?? {}) },
    });
  }
}

export class InvalidSceneZIndexError extends ApplicationError {
  public constructor(layerId: string, group: string, zIndex: number, expectedRange: string) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Layer "${layerId}" of group "${group}" has invalid zIndex ${zIndex}. Expected range: ${expectedRange}`,
      details: { layerId, group, zIndex, expectedRange },
    });
  }
}

export class NegativeCoordinateSpaceError extends ApplicationError {
  public constructor(layerId: string, field: string, value: number) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Layer "${layerId}" has invalid coordinate ${field}=${value}. Negative coordinate spaces are strictly prohibited.`,
      details: { layerId, field, value },
    });
  }
}

export class SceneContainmentError extends ApplicationError {
  public constructor(layerId: string, reason: string, details?: Readonly<Record<string, unknown>>) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Scene containment violation for layer "${layerId}": ${reason}`,
      details: { layerId, reason, ...(details ?? {}) },
    });
  }
}

export class InvalidTypographyFontError extends ApplicationError {
  public constructor(fontFamily: string, allowedFonts: readonly string[]) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Unapproved typography font "${fontFamily}". Approved pilot fonts per W03-DEC-007: ${allowedFonts.join(', ')}`,
      details: { fontFamily, allowedFonts },
    });
  }
}

export class InvalidTypographyWeightError extends ApplicationError {
  public constructor(fontFamily: string, weight: number, reason: string) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Invalid font weight ${weight} for font "${fontFamily}": ${reason}`,
      details: { fontFamily, weight, reason },
    });
  }
}

export class UnsupportedAspectRatioError extends ApplicationError {
  public constructor(aspectRatio: string, allowedAspectRatios: readonly string[]) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Unsupported aspect ratio "${aspectRatio}". Supported aspect ratios: ${allowedAspectRatios.join(', ')}`,
      details: { aspectRatio, allowedAspectRatios },
    });
  }
}

export class SceneVersionImmutableError extends ApplicationError {
  public constructor(sceneId: string, versionNumber: number) {
    super({
      code: 'CONFLICT',
      publicMessage: `CreativeSceneVersion ${versionNumber} of scene ${sceneId} is immutable and cannot be updated. Revisions must create a new version.`,
      details: { sceneId, versionNumber },
    });
  }
}

export class SceneConcurrencyConflictError extends ApplicationError {
  public constructor(sceneId: string, targetVersionNumber: number, customMessage?: string) {
    super({
      code: 'CONFLICT',
      publicMessage:
        customMessage ??
        `Version ${targetVersionNumber} already exists for creative scene ${sceneId}. Concurrent revision detected.`,
      details: { sceneId, targetVersionNumber },
    });
  }
}

export class ProductHeroEvidenceMismatchError extends ApplicationError {
  public constructor(reason: string, details?: Readonly<Record<string, unknown>>) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Product hero evidence validation failed: ${reason}`,
      details: { reason, ...(details ?? {}) },
    });
  }
}

export class SceneHardGateFailedError extends ApplicationError {
  public constructor(sceneId: string, failures: readonly string[]) {
    super({
      code: 'VALIDATION_ERROR',
      publicMessage: `Creative scene hard validation gates failed (${failures.length} failure(s)): ${failures.join('; ')}`,
      details: { sceneId, failures },
    });
  }
}
