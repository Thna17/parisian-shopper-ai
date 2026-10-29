/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { hashSessionToken } from '../domain/session.js';
import { LogoutUseCase } from './logout.use-case.js';
import { type UserSessionRepository } from './user-session.repository.js';

describe('LogoutUseCase', () => {
  let useCase: LogoutUseCase;
  let mockSessionRepo: jest.Mocked<UserSessionRepository>;

  beforeEach(() => {
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

    useCase = new LogoutUseCase(mockSessionRepo);
  });

  it('revokes session associated with valid raw session token', async () => {
    const rawToken = 'logout-session-token-1234567890abcdef';
    const tokenHash = hashSessionToken(rawToken);

    mockSessionRepo.findByTokenHash.mockResolvedValueOnce({
      id: 'sess-to-revoke',
      userId: 'user-1',
      sessionTokenHash: tokenHash,
      ipAddress: null,
      userAgent: null,
      createdAt: new Date(),
      lastActiveAt: new Date(),
      expiresAt: new Date(),
      revokedAt: null,
    });

    await useCase.execute({ rawSessionToken: rawToken });

    expect(mockSessionRepo.findByTokenHash).toHaveBeenCalledWith(tokenHash);
    expect(mockSessionRepo.revoke).toHaveBeenCalledWith('sess-to-revoke', expect.any(Date));
  });

  it('is idempotent when session does not exist or was already revoked', async () => {
    mockSessionRepo.findByTokenHash.mockResolvedValueOnce(null);

    await expect(
      useCase.execute({ rawSessionToken: 'unknown-token-1234567890abcdef' }),
    ).resolves.not.toThrow();

    expect(mockSessionRepo.revoke).not.toHaveBeenCalled();
  });
});
