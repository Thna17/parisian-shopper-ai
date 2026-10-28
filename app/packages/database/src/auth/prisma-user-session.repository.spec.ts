import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { Prisma } from '@prisma/client';
import { PrismaUserSessionRepository } from './prisma-user-session.repository.js';
import { type PrismaService } from '../prisma.service.js';

type AsyncMock<T = unknown> = jest.MockedFunction<(...args: unknown[]) => Promise<T>>;

interface MockUserSessionModel {
  create: AsyncMock;
  findUnique: AsyncMock;
  findFirst: AsyncMock;
  findMany: AsyncMock;
  updateMany: AsyncMock;
  deleteMany: AsyncMock;
}

interface MockPrismaService {
  userSession: MockUserSessionModel;
}

describe('PrismaUserSessionRepository', () => {
  let repository: PrismaUserSessionRepository;
  let mockPrisma: MockPrismaService;

  beforeEach(() => {
    mockPrisma = {
      userSession: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    repository = new PrismaUserSessionRepository(mockPrisma as unknown as PrismaService);
  });

  const validTokenHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  const sampleSessionRecord = {
    id: 'sess-uuid-1',
    userId: 'user-uuid-1',
    sessionTokenHash: validTokenHash,
    ipAddress: '192.168.1.100',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    createdAt: new Date('2026-10-28T10:00:00Z'),
    lastActiveAt: new Date('2026-10-28T10:00:00Z'),
    expiresAt: new Date('2026-10-28T18:00:00Z'),
    revokedAt: null,
  };

  describe('create', () => {
    it('DB-AUTH-04: creates a session using only a hashed token digest', async () => {
      mockPrisma.userSession.create.mockResolvedValueOnce(sampleSessionRecord);

      const expiresAt = new Date('2026-10-28T18:00:00Z');
      const result = await repository.create({
        userId: 'user-uuid-1',
        sessionTokenHash: validTokenHash,
        expiresAt,
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      });

      expect(mockPrisma.userSession.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-uuid-1',
          sessionTokenHash: validTokenHash,
          expiresAt,
          ipAddress: '192.168.1.100',
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        },
      });

      expect(result.id).toBe('sess-uuid-1');
      expect(result.sessionTokenHash).toBe(validTokenHash);
      expect(result.expiresAt).toEqual(expiresAt);
    });

    it('DB-AUTH-10: enforces referential integrity to existing User (propagates P2003 on invalid user)', async () => {
      const foreignKeyError = new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint failed on the field: user_id',
        {
          code: 'P2003',
          clientVersion: '6.19.3',
          meta: { field_name: 'user_id' },
        },
      );
      mockPrisma.userSession.create.mockRejectedValueOnce(foreignKeyError);

      await expect(
        repository.create({
          userId: 'non-existent-user-id',
          sessionTokenHash: validTokenHash,
          expiresAt: new Date(Date.now() + 3600_000),
        }),
      ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
    });

    it('DB-AUTH-12: enforces uniqueness of sessionTokenHash (propagates P2002 on collision)', async () => {
      const uniqueError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on user_sessions_session_token_hash_key',
        {
          code: 'P2002',
          clientVersion: '6.19.3',
          meta: { target: ['session_token_hash'] },
        },
      );
      mockPrisma.userSession.create.mockRejectedValueOnce(uniqueError);

      await expect(
        repository.create({
          userId: 'user-uuid-1',
          sessionTokenHash: validTokenHash,
          expiresAt: new Date(Date.now() + 3600_000),
        }),
      ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
    });
  });

  describe('findActiveByTokenHash', () => {
    it('DB-AUTH-05: resolves an active unexpired, unrevoked session by token hash', async () => {
      mockPrisma.userSession.findFirst.mockResolvedValueOnce(sampleSessionRecord);

      const now = new Date('2026-10-28T12:00:00Z');
      const session = await repository.findActiveByTokenHash(validTokenHash, now);

      expect(mockPrisma.userSession.findFirst).toHaveBeenCalledWith({
        where: {
          sessionTokenHash: validTokenHash,
          revokedAt: null,
          expiresAt: { gt: now },
        },
      });

      expect(session).not.toBeNull();
      expect(session?.id).toBe('sess-uuid-1');
      expect(session?.revokedAt).toBeNull();
    });

    it('DB-AUTH-06: returns null when session is expired', async () => {
      // Prisma filter `expiresAt: { gt: now }` returns null from DB query
      mockPrisma.userSession.findFirst.mockResolvedValueOnce(null);

      const nowAfterExpiration = new Date('2026-10-28T19:00:00Z');
      const session = await repository.findActiveByTokenHash(validTokenHash, nowAfterExpiration);

      expect(session).toBeNull();
    });

    it('DB-AUTH-07: returns null when session is revoked', async () => {
      // Prisma filter `revokedAt: null` returns null from DB query
      mockPrisma.userSession.findFirst.mockResolvedValueOnce(null);

      const now = new Date('2026-10-28T12:00:00Z');
      const session = await repository.findActiveByTokenHash(validTokenHash, now);

      expect(session).toBeNull();
    });
  });

  describe('revoke and revokeAllForUser', () => {
    it('DB-AUTH-08: revokes one session without revoking unrelated sessions', async () => {
      mockPrisma.userSession.updateMany.mockResolvedValueOnce({ count: 1 });

      const revokedAt = new Date('2026-10-28T14:30:00Z');
      const result = await repository.revoke('sess-uuid-1', revokedAt);

      expect(mockPrisma.userSession.updateMany).toHaveBeenCalledWith({
        where: { id: 'sess-uuid-1', revokedAt: null },
        data: { revokedAt },
      });
      expect(result).toBe(true);
    });

    it('DB-AUTH-08: revocation is idempotent (returns false if already revoked)', async () => {
      mockPrisma.userSession.updateMany.mockResolvedValueOnce({ count: 0 });

      const revokedAt = new Date('2026-10-28T14:30:00Z');
      const result = await repository.revoke('sess-uuid-already-revoked', revokedAt);

      expect(result).toBe(false);
    });

    it('DB-AUTH-09: revokes all active sessions belonging to one employee', async () => {
      mockPrisma.userSession.updateMany.mockResolvedValueOnce({ count: 3 });

      const revokedAt = new Date('2026-10-28T15:00:00Z');
      const revokedCount = await repository.revokeAllForUser('user-uuid-1', revokedAt);

      expect(mockPrisma.userSession.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-uuid-1', revokedAt: null },
        data: { revokedAt },
      });
      expect(revokedCount).toBe(3);
    });
  });

  describe('findActiveByUserId and touch and deleteExpired', () => {
    it('finds all active sessions for a user ordered by createdAt desc', async () => {
      mockPrisma.userSession.findMany.mockResolvedValueOnce([sampleSessionRecord]);

      const now = new Date('2026-10-28T12:00:00Z');
      const sessions = await repository.findActiveByUserId('user-uuid-1', now);

      expect(mockPrisma.userSession.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-uuid-1',
          revokedAt: null,
          expiresAt: { gt: now },
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(sessions).toHaveLength(1);
    });

    it('touch updates lastActiveAt timestamp for active session', async () => {
      const now = new Date('2026-10-28T12:15:00Z');
      mockPrisma.userSession.updateMany.mockResolvedValueOnce({ count: 1 });

      await repository.touch('sess-uuid-1', now);

      expect(mockPrisma.userSession.updateMany).toHaveBeenCalledWith({
        where: { id: 'sess-uuid-1', revokedAt: null },
        data: { lastActiveAt: now },
      });
    });

    it('deleteExpired deletes sessions that have expired', async () => {
      const now = new Date('2026-10-28T12:00:00Z');
      mockPrisma.userSession.deleteMany.mockResolvedValueOnce({ count: 12 });

      const deletedCount = await repository.deleteExpired(now);

      expect(mockPrisma.userSession.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lte: now } },
      });
      expect(deletedCount).toBe(12);
    });
  });
});
