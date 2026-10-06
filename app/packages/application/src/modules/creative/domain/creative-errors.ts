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
