import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  AccountLockedError,
  AccountSuspendedError,
  InvalidCredentialsError,
} from '../domain/auth-errors.js';
import { PASSWORD_HASHER, type PasswordHasher } from '../domain/password-hasher.port.js';
import { hashSessionToken, type UserSessionRecord } from '../domain/session.js';
import { type SanitizedEmployeeDto, sanitizeUserAccount } from '../domain/user-account.js';
import {
  PASSWORD_CREDENTIAL_REPOSITORY,
  type PasswordCredentialRepository,
} from './password-credential.repository.js';
import { USER_ACCOUNT_REPOSITORY, type UserAccountRepository } from './user-account.repository.js';
import { USER_SESSION_REPOSITORY, type UserSessionRepository } from './user-session.repository.js';

export interface AuthenticateEmployeeInput {
  readonly loginIdentifier: string;
  readonly password: string;
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
  readonly sessionTtlMs?: number;
}

export interface AuthenticateEmployeeResult {
  readonly rawSessionToken: string;
  readonly session: UserSessionRecord;
  readonly user: SanitizedEmployeeDto;
}

const DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const MAX_CONSECUTIVE_LOGIN_FAILURES = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

@Injectable()
export class AuthenticateEmployeeUseCase {
  public constructor(
    @Inject(USER_ACCOUNT_REPOSITORY)
    private readonly userAccountRepo: UserAccountRepository,
    @Inject(PASSWORD_CREDENTIAL_REPOSITORY)
    private readonly credentialRepo: PasswordCredentialRepository,
    @Inject(USER_SESSION_REPOSITORY)
    private readonly sessionRepo: UserSessionRepository,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasher,
  ) {}

  public async execute(input: AuthenticateEmployeeInput): Promise<AuthenticateEmployeeResult> {
    const identifier = input.loginIdentifier?.trim();
    if (!identifier || !input.password) {
      throw new InvalidCredentialsError();
    }

    const account = await this.userAccountRepo.findByLoginIdentifier(identifier);

    // Constant-time mitigation against user enumeration
    if (account === null || account.passwordCredential === null) {
      await this.passwordHasher.verify(
        'dummy-constant-time-password',
        '$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      );
      throw new InvalidCredentialsError();
    }

    const now = new Date();

    // Check account lockout
    if (
      account.passwordCredential.lockedUntil !== null &&
      account.passwordCredential.lockedUntil.getTime() > now.getTime()
    ) {
      throw new AccountLockedError(
        'Account is temporarily locked due to multiple failed login attempts. Please try again later.',
        { lockedUntil: account.passwordCredential.lockedUntil.toISOString() },
      );
    }

    // Check account suspension
    if (account.status === 'DISABLED' || account.disabledAt !== null) {
      throw new AccountSuspendedError();
    }

    // Verify Argon2id hash
    const isValidPassword = await this.passwordHasher.verify(
      input.password,
      account.passwordCredential.passwordHash,
    );

    if (!isValidPassword) {
      const consecutiveFailures = account.passwordCredential.failedLogins + 1;
      const lockedUntil =
        consecutiveFailures >= MAX_CONSECUTIVE_LOGIN_FAILURES
          ? new Date(now.getTime() + LOCKOUT_DURATION_MS)
          : null;

      await this.credentialRepo.recordLoginFailure({
        userId: account.id,
        lockedUntil,
      });

      if (lockedUntil !== null) {
        throw new AccountLockedError(
          'Account is temporarily locked due to multiple failed login attempts. Please try again later.',
          { lockedUntil: lockedUntil.toISOString() },
        );
      }

      throw new InvalidCredentialsError();
    }

    // Login successful: reset failure counters
    if (
      account.passwordCredential.failedLogins > 0 ||
      account.passwordCredential.lockedUntil !== null
    ) {
      await this.credentialRepo.resetLoginFailures(account.id);
    }

    // Generate high-entropy 32-byte session token
    const rawSessionToken = randomBytes(32).toString('hex');
    const sessionTokenHash = hashSessionToken(rawSessionToken);

    const ttlMs = input.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
    const expiresAt = new Date(now.getTime() + ttlMs);

    const session = await this.sessionRepo.create({
      userId: account.id,
      sessionTokenHash,
      expiresAt,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      createdAt: now,
      lastActiveAt: now,
    });

    return {
      rawSessionToken,
      session,
      user: sanitizeUserAccount(account),
    };
  }
}
