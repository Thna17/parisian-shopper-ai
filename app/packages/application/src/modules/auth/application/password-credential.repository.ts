import { type PasswordCredentialRecord } from '../domain/credential.js';

export const PASSWORD_CREDENTIAL_REPOSITORY = Symbol('PASSWORD_CREDENTIAL_REPOSITORY');

export interface CreatePasswordCredentialInput {
  readonly userId: string;
  readonly passwordHash: string;
  readonly hashAlgorithm?: string;
}

export interface UpdatePasswordHashInput {
  readonly userId: string;
  readonly passwordHash: string;
  readonly hashAlgorithm?: string;
}

export interface RecordLoginFailureInput {
  readonly userId: string;
  readonly lockedUntil?: Date | null;
}

export interface PasswordCredentialRepository {
  /**
   * Finds the password credential record by internal User ID.
   * Returns null if the user does not have a registered password credential.
   */
  findByUserId(userId: string): Promise<PasswordCredentialRecord | null>;

  /**
   * Creates an initial password credential for an existing user.
   * Fails if a credential already exists for this user (1:1 invariant).
   */
  create(input: CreatePasswordCredentialInput): Promise<PasswordCredentialRecord>;

  /**
   * Replaces the stored password hash and resets failed login counters.
   */
  updatePasswordHash(input: UpdatePasswordHashInput): Promise<PasswordCredentialRecord>;

  /**
   * Increments failed login count and optionally sets a lock timestamp.
   */
  recordLoginFailure(input: RecordLoginFailureInput): Promise<PasswordCredentialRecord>;

  /**
   * Resets failed logins count and unlocks the credential upon successful login.
   */
  resetLoginFailures(userId: string): Promise<void>;

  /**
   * Deletes the password credential for a given user (e.g. administrative credential revocation).
   * Returns true if deleted, false if none existed.
   */
  deleteByUserId(userId: string): Promise<boolean>;
}
