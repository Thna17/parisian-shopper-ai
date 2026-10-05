import { ApplicationError } from '@parisian-shopper/common';

export class StaleContentVersionError extends ApplicationError {
  public constructor(
    message = 'A newer version is available. Review the latest draft before approving.',
  ) {
    super({
      code: 'STALE_CONTENT_VERSION',
      publicMessage: message,
    });
  }
}

export class ContentNotApprovalEligibleError extends ApplicationError {
  public constructor(message = 'Content version is not eligible for approval.') {
    super({
      code: 'CONTENT_NOT_APPROVAL_ELIGIBLE',
      publicMessage: message,
    });
  }
}

export class ContentAlreadyApprovedError extends ApplicationError {
  public constructor(message = 'Content has already been approved.') {
    super({
      code: 'CONTENT_ALREADY_APPROVED',
      publicMessage: message,
    });
  }
}

export class ContentAlreadyRejectedError extends ApplicationError {
  public constructor(message = 'Content has already been rejected.') {
    super({
      code: 'CONTENT_ALREADY_REJECTED',
      publicMessage: message,
    });
  }
}

export class ActiveRevisionConflictError extends ApplicationError {
  public constructor(message = 'A new version is already being generated.') {
    super({
      code: 'ACTIVE_REVISION_EXISTS',
      publicMessage: message,
    });
  }
}

export class InvalidReviewStateError extends ApplicationError {
  public constructor(message = 'Content job is not in a reviewable state.') {
    super({
      code: 'INVALID_REVIEW_STATE',
      publicMessage: message,
    });
  }
}
