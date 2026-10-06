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
