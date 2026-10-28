/**
 * Stored representation of an employee's password authentication credential.
 *
 * SENSITIVITY NOTE:
 * The `passwordHash` field is an internal secret. It MUST NOT be serialized
 * into public user DTOs, API responses, or system logs.
 */
export interface PasswordCredentialRecord {
  readonly id: string;
  readonly userId: string;
  readonly passwordHash: string;
  readonly hashAlgorithm: string;
  readonly failedLogins: number;
  readonly lockedUntil: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Public summary of credential status for user profile / security audit views.
 * Explicitly excludes passwordHash.
 */
export interface CredentialStatusView {
  readonly hasPassword: boolean;
  readonly hashAlgorithm?: string;
  readonly failedLogins: number;
  readonly isLocked: boolean;
  readonly lockedUntil: Date | null;
  readonly updatedAt?: Date;
}

/**
 * Strips sensitive password hash and internal fields, returning a safe DTO view.
 */
export function sanitizeCredentialView(
  credential: PasswordCredentialRecord | null,
): CredentialStatusView {
  if (credential === null) {
    return {
      hasPassword: false,
      failedLogins: 0,
      isLocked: false,
      lockedUntil: null,
    };
  }

  const isLocked = credential.lockedUntil !== null && credential.lockedUntil.getTime() > Date.now();

  return {
    hasPassword: true,
    hashAlgorithm: credential.hashAlgorithm,
    failedLogins: credential.failedLogins,
    isLocked,
    lockedUntil: credential.lockedUntil,
    updatedAt: credential.updatedAt,
  };
}
