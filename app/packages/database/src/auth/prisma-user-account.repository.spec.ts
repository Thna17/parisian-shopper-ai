import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { PrismaUserAccountRepository } from './prisma-user-account.repository.js';
import { type PrismaService } from '../prisma.service.js';

type AsyncMock<T = unknown> = jest.MockedFunction<(...args: unknown[]) => Promise<T>>;

interface MockUserModel {
  findFirst: AsyncMock;
  findUnique: AsyncMock;
}

interface MockPrismaService {
  user: MockUserModel;
}

describe('PrismaUserAccountRepository', () => {
  let repository: PrismaUserAccountRepository;
  let mockPrisma: MockPrismaService;

  beforeEach(() => {
    mockPrisma = {
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    repository = new PrismaUserAccountRepository(mockPrisma as unknown as PrismaService);
  });

  const validUuid = '11111111-1111-4111-8111-111111111111';

  const mockDbUser = {
    id: validUuid,
    displayName: 'Thna Chan',
    status: 'ACTIVE' as const,
    disabledAt: null,
    roles: [{ role: { code: 'ADMIN' } }],
    passwordCredential: {
      id: 'cred-1',
      userId: validUuid,
      passwordHash: '$argon2id$...',
      hashAlgorithm: 'argon2id',
      failedLogins: 0,
      lockedUntil: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    },
  };

  describe('findByLoginIdentifier', () => {
    it('returns null for empty or whitespace identifiers without querying DB', async () => {
      expect(await repository.findByLoginIdentifier('')).toBeNull();
      expect(await repository.findByLoginIdentifier('   ')).toBeNull();
      expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
    });

    it('finds by displayName and resolves permissions', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(mockDbUser);

      const result = await repository.findByLoginIdentifier('Thna Chan');

      expect(result).not.toBeNull();
      expect(result?.id).toBe(validUuid);
      expect(result?.displayName).toBe('Thna Chan');
      expect(result?.roles).toContain('ADMIN');
      expect(result?.permissions.length).toBeGreaterThan(0);
      expect(result?.passwordCredential?.passwordHash).toBe('$argon2id$...');
      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { displayName: { equals: 'Thna Chan', mode: 'insensitive' } },
              {
                telegramIdentities: {
                  some: {
                    telegramUsername: { equals: 'Thna Chan', mode: 'insensitive' },
                  },
                },
              },
            ],
          },
        }),
      );
    });

    it('strips leading @ from telegram username and searches', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(mockDbUser);

      await repository.findByLoginIdentifier('@thna_bot');

      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { displayName: { equals: '@thna_bot', mode: 'insensitive' } },
              {
                telegramIdentities: {
                  some: {
                    telegramUsername: { equals: 'thna_bot', mode: 'insensitive' },
                  },
                },
              },
            ],
          },
        }),
      );
    });

    it('includes UUID search condition when identifier matches UUID format', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(mockDbUser);

      await repository.findByLoginIdentifier(validUuid);

      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { id: validUuid },
              { displayName: { equals: validUuid, mode: 'insensitive' } },
              {
                telegramIdentities: {
                  some: {
                    telegramUsername: { equals: validUuid, mode: 'insensitive' },
                  },
                },
              },
            ],
          },
        }),
      );
    });

    it('returns null if no record matched', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);

      const result = await repository.findByLoginIdentifier('unknown');
      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('returns null immediately if userId is not a valid UUID', async () => {
      const result = await repository.findById('invalid-uuid');
      expect(result).toBeNull();
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('queries by UUID and returns mapped account', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(mockDbUser);

      const result = await repository.findById(validUuid);

      expect(result?.id).toBe(validUuid);
      expect(result?.displayName).toBe('Thna Chan');
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: validUuid },
        }),
      );
    });

    it('returns null if record not found by UUID', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      const result = await repository.findById(validUuid);
      expect(result).toBeNull();
    });
  });
});
