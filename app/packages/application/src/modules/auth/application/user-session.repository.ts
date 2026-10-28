import { type UserSessionRecord } from '../domain/session.js';

export const USER_SESSION_REPOSITORY = Symbol('USER_SESSION_REPOSITORY');

export interface CreateUserSessionInput {
  readonly userId: string;
  readonly sessionTokenHash: string;
  readonly expiresAt: Date;
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
  readonly createdAt?: Date;
  readonly lastActiveAt?: Date;
}

export interface UserSessionRepository {
  /**
   * Persists a new user session using only the pre-computed session token hash.
   */
  create(input: CreateUserSessionInput): Promise<UserSessionRecord>;

  /**
   * Retrieves a session by its unique session ID regardless of status.
   */
  findById(id: string): Promise<UserSessionRecord | null>;

  /**
   * Retrieves a session by its unique token hash regardless of expiration or revocation.
   * Useful for distinguishing "session expired" from "invalid token".
   */
  findByTokenHash(sessionTokenHash: string): Promise<UserSessionRecord | null>;

  /**
   * Resolves an active, unexpired, and unrevoked session by its token hash.
   * Returns null if absent, expired (`expiresAt <= now`), or revoked (`revokedAt != null`).
   */
  findActiveByTokenHash(sessionTokenHash: string, now: Date): Promise<UserSessionRecord | null>;

  /**
   * Lists all active (unrevoked and unexpired) sessions for an employee.
   */
  findActiveByUserId(userId: string, now: Date): Promise<readonly UserSessionRecord[]>;

  /**
   * Updates the last active timestamp of an active session.
   */
  touch(id: string, lastActiveAt: Date): Promise<void>;

  /**
   * Revokes a single session by session ID.
   * Idempotent: returns true if newly revoked, false if already revoked or not found.
   */
  revoke(id: string, revokedAt: Date): Promise<boolean>;

  /**
   * Revokes all active sessions for a specific user (e.g. on password reset or account compromise).
   * Returns the count of sessions revoked.
   */
  revokeAllForUser(userId: string, revokedAt: Date): Promise<number>;

  /**
   * Purges expired sessions beyond retention policy window.
   */
  deleteExpired(now: Date): Promise<number>;
}
