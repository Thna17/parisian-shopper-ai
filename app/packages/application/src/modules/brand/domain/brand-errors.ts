export class BrandIntelligenceError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UnlicensedAssetIngestionError extends BrandIntelligenceError {
  public constructor(
    message = 'Historical brand asset ingestion rejected: verified copyright and license declaration is required (W03-DEC-008).',
  ) {
    super(message);
  }
}

export class RegurgitationViolationError extends BrandIntelligenceError {
  public constructor(
    public readonly similarityScore: number,
    public readonly threshold: number,
    public readonly matchedSourceId: string,
    message = `Anti-regurgitation guardrail triggered: Candidate text exceeds originality threshold (${(similarityScore * 100).toFixed(1)}% vs ${(threshold * 100).toFixed(1)}% max allowable). Candidate rejected to prevent copyright and plagiarism regurgitation.`,
  ) {
    super(message);
  }
}

export class BrandProfileNotFoundError extends BrandIntelligenceError {
  public constructor(identifier: string) {
    super(`Brand profile version not found: ${identifier}`);
  }
}

export class InvalidBrandProfileStateTransitionError extends BrandIntelligenceError {
  public constructor(fromStatus: string, toStatus: string) {
    super(
      `Invalid brand profile state transition from ${fromStatus} to ${toStatus}. Active profiles can only be retired or revoked.`,
    );
  }
}

export class DuplicateBrandProfileError extends BrandIntelligenceError {
  public constructor(name: string, versionNumber: number) {
    super(`Brand profile version already exists with name '${name}' and version ${versionNumber}.`);
  }
}

export class InsufficientBrandPermissionError extends BrandIntelligenceError {
  public constructor(requiredPermission: string) {
    super(`User lacks required permission for brand intelligence operation: ${requiredPermission}`);
  }
}
