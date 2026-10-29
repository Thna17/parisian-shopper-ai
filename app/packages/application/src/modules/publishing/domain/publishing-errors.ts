export class PublicationNotFoundError extends Error {
  public readonly code = 'PUBLICATION_NOT_FOUND';
  constructor(id: string) {
    super(`Publication ${id} not found`);
  }
}

export class PublicationStatusTransitionError extends Error {
  public readonly code = 'INVALID_STATUS_TRANSITION';
  constructor(from: string, to: string) {
    super(`Cannot transition publication from ${from} to ${to}`);
  }
}

export class PublicationChannelNotEnabledError extends Error {
  public readonly code = 'CHANNEL_NOT_ENABLED';
  constructor(channel: string) {
    super(`Publishing channel ${channel} is not enabled for live dispatch`);
  }
}

export class PublicationIdempotencyConflictError extends Error {
  public readonly code = 'IDEMPOTENCY_CONFLICT';
  constructor(key: string) {
    super(`Publication with idempotency key ${key} already exists`);
  }
}

export class ContentVersionNotApprovedError extends Error {
  public readonly code = 'CONTENT_NOT_APPROVED';
  constructor(id: string) {
    super(`Content version ${id} has not been approved for publishing`);
  }
}

export class PublicationNotRetryableError extends Error {
  public readonly code = 'NOT_RETRYABLE';
  constructor(id: string) {
    super(`Publication ${id} is not eligible for retry`);
  }
}

export class InsufficientPublishingPermissionError extends Error {
  public readonly code = 'INSUFFICIENT_PERMISSION';
  constructor() {
    super('Requires PUBLISH_CREATIVE permission');
  }
}
