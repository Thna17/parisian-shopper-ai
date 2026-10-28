import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { Prisma } from '@prisma/client';
import { PrismaPasswordCredentialRepository } from './prisma-password-credential.repository.js';
import { type PrismaService } from '../prisma.service.js';

type AsyncMock<T = unknown> = jest.MockedFunction<(...args: unknown[]) => Promise<T>>;

interface MockPasswordCredentialModel {
  create: AsyncMock;
  findUnique: AsyncMock;
  update: AsyncMock;
  updateMany: AsyncMock;
  deleteMany: AsyncMock;
}

interface MockPrismaService {
  passwordCredential: MockPasswordCredentialModel;
}

describe('PrismaPasswordCredentialRepository', () => {
  let repository: PrismaPasswordCredentialRepository;
  let mockPrisma: MockPrismaService;

  beforeEach(() => {
    mockPrisma = {
      passwordCredential: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    repository = new PrismaPasswordCredentialRepository(mockPrisma as unknown as PrismaService);
  });

  const sampleDbRecord = {
    id: 'cred-uuid-1',
    userId: 'user-uuid-1',
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$someSalt$someCalculatedHash',
    hashAlgorithm: 'argon2id',
    failedLogins: 0,
    lockedUntil: null,
    createdAt: new Date('2026-10-28T10:00:00Z'),
    updatedAt: new Date('2026-10-28T10:00:00Z'),
  };

  describe('create', () => {
    it('DB-AUTH-01: creates a password credential for an existing user', async () => {
      mockPrisma.passwordCredential.create.mockResolvedValueOnce(sampleDbRecord);

      const result = await repository.create({
        userId: 'user-uuid-1',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$someSalt$someCalculatedHash',
        hashAlgorithm: 'argon2id',
      });

      expect(mockPrisma.passwordCredential.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-uuid-1',
          passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$someSalt$someCalculatedHash',
          hashAlgorithm: 'argon2id',
        },
      });

      expect(result.id).toBe('cred-uuid-1');
      expect(result.userId).toBe('user-uuid-1');
      expect(result.passwordHash).toBe(sampleDbRecord.passwordHash);
      expect(result.hashAlgorithm).toBe('argon2id');
    });

    it('DB-AUTH-02: propagates unique constraint violation when duplicate credential is created for user', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the constraint: password_credentials_user_id_key',
        {
          code: 'P2002',
          clientVersion: '6.19.3',
          meta: { target: ['user_id'] },
        },
      );
      mockPrisma.passwordCredential.create.mockRejectedValueOnce(prismaError);

      await expect(
        repository.create({
          userId: 'user-uuid-1',
          passwordHash: '$argon2id$v=19$hash',
        }),
      ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
    });

    it('DB-AUTH-03: ensures the repository only persists the supplied cryptographic hash, not plaintext', async () => {
      mockPrisma.passwordCredential.create.mockResolvedValueOnce(sampleDbRecord);

      const hashInput = '$argon2id$v=19$m=65536,t=3,p=4$someSalt$someCalculatedHash';
      await repository.create({
        userId: 'user-uuid-1',
        passwordHash: hashInput,
      });

      const callArgs = mockPrisma.passwordCredential.create.mock.calls[0]?.[0] as {
        data: { passwordHash: string };
      };
      expect(callArgs.data.passwordHash).toBe(hashInput);
      expect(callArgs.data.passwordHash).not.toBe('plaintext-password');
    });
  });

  describe('findByUserId', () => {
    it('returns null when no credential exists for user', async () => {
      mockPrisma.passwordCredential.findUnique.mockResolvedValueOnce(null);

      const result = await repository.findByUserId('non-existent-user');
      expect(result).toBeNull();
      expect(mockPrisma.passwordCredential.findUnique).toHaveBeenCalledWith({
        where: { userId: 'non-existent-user' },
      });
    });

    it('returns mapped domain record when credential exists', async () => {
      mockPrisma.passwordCredential.findUnique.mockResolvedValueOnce(sampleDbRecord);

      const result = await repository.findByUserId('user-uuid-1');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('cred-uuid-1');
      expect(result?.userId).toBe('user-uuid-1');
      expect(result?.passwordHash).toBe(sampleDbRecord.passwordHash);
    });
  });

  describe('updatePasswordHash', () => {
    it('updates password hash and resets failure counts and locks', async () => {
      const updatedDbRecord = {
        ...sampleDbRecord,
        passwordHash: '$argon2id$new-hash',
        failedLogins: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      };
      mockPrisma.passwordCredential.update.mockResolvedValueOnce(updatedDbRecord);

      const result = await repository.updatePasswordHash({
        userId: 'user-uuid-1',
        passwordHash: '$argon2id$new-hash',
      });

      expect(mockPrisma.passwordCredential.update).toHaveBeenCalledWith({
        where: { userId: 'user-uuid-1' },
        data: {
          passwordHash: '$argon2id$new-hash',
          hashAlgorithm: 'argon2id',
          failedLogins: 0,
          lockedUntil: null,
        },
      });
      expect(result.passwordHash).toBe('$argon2id$new-hash');
    });
  });

  describe('recordLoginFailure and resetLoginFailures', () => {
    it('increments failedLogins counter and updates lockedUntil', async () => {
      const lockedUntil = new Date(Date.now() + 900_000);
      mockPrisma.passwordCredential.update.mockResolvedValueOnce({
        ...sampleDbRecord,
        failedLogins: 5,
        lockedUntil,
      });

      const result = await repository.recordLoginFailure({
        userId: 'user-uuid-1',
        lockedUntil,
      });

      expect(mockPrisma.passwordCredential.update).toHaveBeenCalledWith({
        where: { userId: 'user-uuid-1' },
        data: {
          failedLogins: { increment: 1 },
          lockedUntil,
        },
      });
      expect(result.failedLogins).toBe(5);
    });

    it('resets login failures to zero', async () => {
      mockPrisma.passwordCredential.updateMany.mockResolvedValueOnce({ count: 1 });

      await repository.resetLoginFailures('user-uuid-1');

      expect(mockPrisma.passwordCredential.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-uuid-1' },
        data: {
          failedLogins: 0,
          lockedUntil: null,
        },
      });
    });
  });

  describe('deleteByUserId', () => {
    it('deletes credential and returns true if deleted', async () => {
      mockPrisma.passwordCredential.deleteMany.mockResolvedValueOnce({ count: 1 });

      const deleted = await repository.deleteByUserId('user-uuid-1');
      expect(deleted).toBe(true);
      expect(mockPrisma.passwordCredential.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-uuid-1' },
      });
    });

    it('returns false if no credential existed to delete', async () => {
      mockPrisma.passwordCredential.deleteMany.mockResolvedValueOnce({ count: 0 });

      const deleted = await repository.deleteByUserId('user-uuid-unknown');
      expect(deleted).toBe(false);
    });
  });
});
