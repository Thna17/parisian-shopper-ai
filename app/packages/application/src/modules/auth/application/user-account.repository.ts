import { type AuthenticatedUserAccount } from '../domain/user-account.js';

export const USER_ACCOUNT_REPOSITORY = Symbol('USER_ACCOUNT_REPOSITORY');

export interface UserAccountRepository {
  /**
   * Resolves an employee account by login identifier (UUID, displayName, or Telegram username).
   */
  findByLoginIdentifier(identifier: string): Promise<AuthenticatedUserAccount | null>;

  /**
   * Resolves an employee account by internal User ID.
   */
  findById(userId: string): Promise<AuthenticatedUserAccount | null>;
}
