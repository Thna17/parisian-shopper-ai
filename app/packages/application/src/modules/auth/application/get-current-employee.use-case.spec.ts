/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { AccountSuspendedError, UnauthorizedSessionError } from '../domain/auth-errors.js';
import { Permission, RoleCode } from '../domain/permissions.js';
import { type AuthenticatedUserAccount } from '../domain/user-account.js';
import { GetCurrentEmployeeUseCase } from './get-current-employee.use-case.js';
import { type UserAccountRepository } from './user-account.repository.js';
import { type UserSessionRepository } from './user-session.repository.js';

describe('GetCurrentEmployeeUseCase', () => {
  let useCase: GetCurrentEmployeeUseCase;
  let mockUserAccountRepo: jest.Mocked<UserAccountRepository>;
  let mockSessionRepo: jest.Mocked<UserSessionRepository>;

  const sampleAccount: AuthenticatedUserAccount = {
    id: 'user-uuid-1',
    displayName: 'Golden Editor',
    status: 'ACTIVE',
    disabledAt: null,
    roles: [RoleCode.MARKETING_EDITOR],
    permissions: [Permission.VIEW_PRODUCTS, Permission.CREATE_CONTENT],
    passwordCredential: null,
  };

  const sampleSession = {
    id: 'sess-1',
    userId: 'user-uuid-1',
    sessionTokenHash: 'hash-1',
    ipAddress: '127.0.0.1',
    userAgent: 'Mozilla/5.0',
    createdAt: new Date(),
    lastActiveAt: new Date(),
    expiresAt: new Date(Date.now() + 3600_000),
    revokedAt: null,
  };

  beforeEach(() => {
    mockUserAccountRepo = {
      findByLoginIdentifier: jest.fn(),
      findById: jest.fn(),
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

    useCase = new GetCurrentEmployeeUseCase(mockUserAccountRepo, mockSessionRepo);
  });

  it('resolves active session and returns sanitized employee details', async () => {
    mockSessionRepo.findActiveByTokenHash.mockResolvedValueOnce(sampleSession);
    mockUserAccountRepo.findById.mockResolvedValueOnce(sampleAccount);

    const result = await useCase.execute({
      rawSessionToken: 'valid-raw-token-1234567890abcdef',
    });

    expect(result.id).toBe('user-uuid-1');
    expect(result.displayName).toBe('Golden Editor');
    expect(result.roles).toEqual([RoleCode.MARKETING_EDITOR]);
    expect(result.permissions).toContain(Permission.VIEW_PRODUCTS);
    expect(mockSessionRepo.touch).toHaveBeenCalledWith('sess-1', expect.any(Date));
  });

  it('throws UnauthorizedSessionError when raw token is empty', async () => {
    await expect(useCase.execute({ rawSessionToken: '' })).rejects.toThrow(
      UnauthorizedSessionError,
    );
  });

  it('throws UnauthorizedSessionError when session is not found or expired in repository', async () => {
    mockSessionRepo.findActiveByTokenHash.mockResolvedValueOnce(null);

    await expect(useCase.execute({ rawSessionToken: 'expired-or-revoked-token' })).rejects.toThrow(
      UnauthorizedSessionError,
    );
  });

  it('revokes session and throws AccountSuspendedError when user has been disabled', async () => {
    const disabledAccount: AuthenticatedUserAccount = {
      ...sampleAccount,
      status: 'DISABLED',
      disabledAt: new Date(),
    };
    mockSessionRepo.findActiveByTokenHash.mockResolvedValueOnce(sampleSession);
    mockUserAccountRepo.findById.mockResolvedValueOnce(disabledAccount);

    await expect(useCase.execute({ rawSessionToken: 'token-for-disabled-user' })).rejects.toThrow(
      AccountSuspendedError,
    );

    expect(mockSessionRepo.revoke).toHaveBeenCalledWith('sess-1', expect.any(Date));
  });
});
