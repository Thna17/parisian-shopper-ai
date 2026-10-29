/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import {
  AccountLockedError,
  AccountSuspendedError,
  InvalidCredentialsError,
} from '../domain/auth-errors.js';
import { type PasswordHasher } from '../domain/password-hasher.port.js';
import { Permission, RoleCode } from '../domain/permissions.js';
import { type AuthenticatedUserAccount } from '../domain/user-account.js';
import { AuthenticateEmployeeUseCase } from './authenticate-employee.use-case.js';
import { type PasswordCredentialRepository } from './password-credential.repository.js';
import { type UserAccountRepository } from './user-account.repository.js';
import { type UserSessionRepository } from './user-session.repository.js';

describe('AuthenticateEmployeeUseCase', () => {
  let useCase: AuthenticateEmployeeUseCase;
  let mockUserAccountRepo: jest.Mocked<UserAccountRepository>;
  let mockCredentialRepo: jest.Mocked<PasswordCredentialRepository>;
  let mockSessionRepo: jest.Mocked<UserSessionRepository>;
  let mockHasher: jest.Mocked<PasswordHasher>;

  const sampleAccount: AuthenticatedUserAccount = {
    id: 'user-uuid-1',
    displayName: 'Golden Editor',
    status: 'ACTIVE',
    disabledAt: null,
    roles: [RoleCode.MARKETING_EDITOR],
    permissions: [Permission.VIEW_PRODUCTS, Permission.CREATE_CONTENT],
    passwordCredential: {
      id: 'cred-1',
      userId: 'user-uuid-1',
      passwordHash: '$argon2id$v=19$validHash',
      hashAlgorithm: 'argon2id',
      failedLogins: 0,
      lockedUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  beforeEach(() => {
    mockUserAccountRepo = {
      findByLoginIdentifier: jest.fn(),
      findById: jest.fn(),
    };
    mockCredentialRepo = {
      findByUserId: jest.fn(),
      create: jest.fn(),
      updatePasswordHash: jest.fn(),
      recordLoginFailure: jest.fn(),
      resetLoginFailures: jest.fn(),
      deleteByUserId: jest.fn(),
    };
    mockSessionRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findByTokenHash: jest.fn(),
      findActiveByTokenHash: jest.fn(),
      findActiveByUserId: jest.fn(),
      touch: jest.fn(),
      revoke: jest.fn(),
      revokeAllForUser: jest.fn(),
      deleteExpired: jest.fn(),
    };
    mockHasher = {
      hash: jest.fn(),
      verify: jest.fn(),
    };

    useCase = new AuthenticateEmployeeUseCase(
      mockUserAccountRepo,
      mockCredentialRepo,
      mockSessionRepo,
      mockHasher,
    );
  });

  it('authenticates valid employee, persists hashed token, and returns raw token and sanitized user', async () => {
    mockUserAccountRepo.findByLoginIdentifier.mockResolvedValueOnce(sampleAccount);
    mockHasher.verify.mockResolvedValueOnce(true);
    mockSessionRepo.create.mockImplementationOnce((input) =>
      Promise.resolve({
        id: 'sess-1',
        userId: input.userId,
        sessionTokenHash: input.sessionTokenHash,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        createdAt: new Date(),
        lastActiveAt: new Date(),
        expiresAt: input.expiresAt,
        revokedAt: null,
      }),
    );

    const result = await useCase.execute({
      loginIdentifier: 'Golden Editor',
      password: 'correct-password',
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0',
    });

    expect(result.rawSessionToken).toHaveLength(64);
    expect(result.session.sessionTokenHash).toHaveLength(64);
    expect(result.user.id).toBe('user-uuid-1');
    expect(result.user.displayName).toBe('Golden Editor');
    expect(result.user.roles).toContain(RoleCode.MARKETING_EDITOR);
    expect(
      (result.user as unknown as Record<string, unknown>)['passwordCredential'],
    ).toBeUndefined();
    expect(mockSessionRepo.create).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid password, increments failed logins counter, and throws generic InvalidCredentialsError', async () => {
    mockUserAccountRepo.findByLoginIdentifier.mockResolvedValueOnce(sampleAccount);
    mockHasher.verify.mockResolvedValueOnce(false);

    await expect(
      useCase.execute({
        loginIdentifier: 'Golden Editor',
        password: 'wrong-password',
      }),
    ).rejects.toThrow(InvalidCredentialsError);

    expect(mockCredentialRepo.recordLoginFailure).toHaveBeenCalledWith({
      userId: 'user-uuid-1',
      lockedUntil: null,
    });
    expect(mockSessionRepo.create).not.toHaveBeenCalled();
  });

  it('locks account and throws AccountLockedError upon reaching 5 consecutive failures', async () => {
    const nearLockoutAccount: AuthenticatedUserAccount = {
      ...sampleAccount,
      passwordCredential: {
        ...sampleAccount.passwordCredential!,
        failedLogins: 4,
      },
    };
    mockUserAccountRepo.findByLoginIdentifier.mockResolvedValueOnce(nearLockoutAccount);
    mockHasher.verify.mockResolvedValueOnce(false);

    await expect(
      useCase.execute({
        loginIdentifier: 'Golden Editor',
        password: 'wrong-password',
      }),
    ).rejects.toThrow(AccountLockedError);

    expect(mockCredentialRepo.recordLoginFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-uuid-1',
        lockedUntil: expect.any(Date),
      }),
    );
  });

  it('immediately blocks login attempt when account is currently locked', async () => {
    const lockedAccount: AuthenticatedUserAccount = {
      ...sampleAccount,
      passwordCredential: {
        ...sampleAccount.passwordCredential!,
        failedLogins: 5,
        lockedUntil: new Date(Date.now() + 600_000), // locked for 10 more minutes
      },
    };
    mockUserAccountRepo.findByLoginIdentifier.mockResolvedValueOnce(lockedAccount);

    await expect(
      useCase.execute({
        loginIdentifier: 'Golden Editor',
        password: 'any-password',
      }),
    ).rejects.toThrow(AccountLockedError);

    expect(mockHasher.verify).not.toHaveBeenCalled();
  });

  it('rejects unknown employee with generic InvalidCredentialsError without leaking account absence', async () => {
    mockUserAccountRepo.findByLoginIdentifier.mockResolvedValueOnce(null);
    mockHasher.verify.mockResolvedValueOnce(false);

    await expect(
      useCase.execute({
        loginIdentifier: 'non-existent-user',
        password: 'any-password',
      }),
    ).rejects.toThrow(InvalidCredentialsError);

    // Verify constant-time dummy verification occurred
    expect(mockHasher.verify).toHaveBeenCalledTimes(1);
    expect(mockSessionRepo.create).not.toHaveBeenCalled();
  });

  it('rejects employee with missing password credential with generic InvalidCredentialsError', async () => {
    const noPasswordAccount: AuthenticatedUserAccount = {
      ...sampleAccount,
      passwordCredential: null,
    };
    mockUserAccountRepo.findByLoginIdentifier.mockResolvedValueOnce(noPasswordAccount);
    mockHasher.verify.mockResolvedValueOnce(false);

    await expect(
      useCase.execute({
        loginIdentifier: 'Golden Editor',
        password: 'password',
      }),
    ).rejects.toThrow(InvalidCredentialsError);

    expect(mockSessionRepo.create).not.toHaveBeenCalled();
  });

  it('rejects suspended employee with AccountSuspendedError', async () => {
    const suspendedAccount: AuthenticatedUserAccount = {
      ...sampleAccount,
      status: 'DISABLED',
      disabledAt: new Date(),
    };
    mockUserAccountRepo.findByLoginIdentifier.mockResolvedValueOnce(suspendedAccount);

    await expect(
      useCase.execute({
        loginIdentifier: 'Golden Editor',
        password: 'password',
      }),
    ).rejects.toThrow(AccountSuspendedError);

    expect(mockSessionRepo.create).not.toHaveBeenCalled();
  });

  it('resets failed logins count and locks on successful login', async () => {
    const recoveredAccount: AuthenticatedUserAccount = {
      ...sampleAccount,
      passwordCredential: {
        ...sampleAccount.passwordCredential!,
        failedLogins: 3,
      },
    };
    mockUserAccountRepo.findByLoginIdentifier.mockResolvedValueOnce(recoveredAccount);
    mockHasher.verify.mockResolvedValueOnce(true);
    mockSessionRepo.create.mockResolvedValueOnce({
      id: 'sess-rec',
      userId: 'user-uuid-1',
      sessionTokenHash: 'hash',
      ipAddress: null,
      userAgent: null,
      createdAt: new Date(),
      lastActiveAt: new Date(),
      expiresAt: new Date(),
      revokedAt: null,
    });

    await useCase.execute({
      loginIdentifier: 'Golden Editor',
      password: 'correct-password',
    });

    expect(mockCredentialRepo.resetLoginFailures).toHaveBeenCalledWith('user-uuid-1');
  });
});
