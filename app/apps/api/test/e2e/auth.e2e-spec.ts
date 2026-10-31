/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  Argon2PasswordHasher,
  type AuthenticatedUserAccount,
  type CreatePasswordCredentialInput,
  type CreateUserSessionInput,
  PASSWORD_CREDENTIAL_REPOSITORY,
  PASSWORD_HASHER,
  type PasswordCredentialRecord,
  type PasswordCredentialRepository,
  type RecordLoginFailureInput,
  resolvePermissionsForRoles,
  USER_ACCOUNT_REPOSITORY,
  type UpdatePasswordHashInput,
  type UserAccountRepository,
  USER_SESSION_REPOSITORY,
  type UserSessionRecord,
  type UserSessionRepository,
} from '@parisian-shopper/application';
import { DatabaseHealthIndicator, PrismaService } from '@parisian-shopper/database';
import {
  ContentGenerationQueue,
  CreativeGenerationQueue,
  ValkeyConnectionService,
} from '@parisian-shopper/jobs';
import { jest } from '@jest/globals';
import { type Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { configureApi } from '../../src/bootstrap.js';

describe('Employee Web Authentication (e2e)', () => {
  let application: INestApplication;
  let server: Server;

  // In-memory state for authentication E2E verification
  const hasher = new Argon2PasswordHasher({
    memorySize: 1024,
    iterations: 2,
    parallelism: 1,
    hashLength: 32,
  });
  const testPassword = 'SecureParisianPassword2026!';
  let validPasswordHash: string;

  const adminUserId = '00000000-0000-4000-8000-000000000001';
  const suspendedUserId = '00000000-0000-4000-8000-000000000002';
  const lockedUserId = '00000000-0000-4000-8000-000000000003';

  let accounts: Map<string, AuthenticatedUserAccount>;
  let credentials: Map<string, PasswordCredentialRecord>;
  let sessions: Map<string, UserSessionRecord>;
  let sessionCounter = 1;

  const mockUserAccountRepo: UserAccountRepository = {
    async findByLoginIdentifier(identifier: string): Promise<AuthenticatedUserAccount | null> {
      const clean = identifier.trim().toLowerCase();
      const stripped = clean.replace(/^@/, '');

      for (const acc of accounts.values()) {
        if (
          acc.id.toLowerCase() === clean ||
          acc.displayName.toLowerCase() === clean ||
          (acc.displayName.toLowerCase() === stripped && stripped.length > 0)
        ) {
          // Return account with fresh credential state
          const cred = credentials.get(acc.id) ?? null;
          return { ...acc, passwordCredential: cred };
        }
      }
      return null;
    },

    async findById(userId: string): Promise<AuthenticatedUserAccount | null> {
      const acc = accounts.get(userId);
      if (!acc) return null;
      const cred = credentials.get(acc.id) ?? null;
      return { ...acc, passwordCredential: cred };
    },
  };

  const mockPasswordCredRepo: PasswordCredentialRepository = {
    async findByUserId(userId: string): Promise<PasswordCredentialRecord | null> {
      return credentials.get(userId) ?? null;
    },
    async create(input: CreatePasswordCredentialInput): Promise<PasswordCredentialRecord> {
      const record: PasswordCredentialRecord = {
        id: `cred-${input.userId}`,
        userId: input.userId,
        passwordHash: input.passwordHash,
        hashAlgorithm: input.hashAlgorithm ?? 'argon2id',
        failedLogins: 0,
        lockedUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      credentials.set(input.userId, record);
      return record;
    },
    async updatePasswordHash(input: UpdatePasswordHashInput): Promise<PasswordCredentialRecord> {
      const existing = credentials.get(input.userId);
      if (!existing) throw new Error('Credential not found');
      const updated: PasswordCredentialRecord = {
        ...existing,
        passwordHash: input.passwordHash,
        hashAlgorithm: input.hashAlgorithm ?? existing.hashAlgorithm,
        failedLogins: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      };
      credentials.set(input.userId, updated);
      return updated;
    },
    async recordLoginFailure(input: RecordLoginFailureInput): Promise<PasswordCredentialRecord> {
      const existing = credentials.get(input.userId);
      if (!existing) throw new Error('Credential not found');
      const updated: PasswordCredentialRecord = {
        ...existing,
        failedLogins: existing.failedLogins + 1,
        lockedUntil: input.lockedUntil !== undefined ? input.lockedUntil : existing.lockedUntil,
        updatedAt: new Date(),
      };
      credentials.set(input.userId, updated);
      return updated;
    },
    async resetLoginFailures(userId: string): Promise<void> {
      const existing = credentials.get(userId);
      if (existing) {
        credentials.set(userId, {
          ...existing,
          failedLogins: 0,
          lockedUntil: null,
          updatedAt: new Date(),
        });
      }
    },
  };

  const mockSessionRepo: UserSessionRepository = {
    async create(input: CreateUserSessionInput): Promise<UserSessionRecord> {
      const id = `sess-${sessionCounter++}`;
      const record: UserSessionRecord = {
        id,
        userId: input.userId,
        sessionTokenHash: input.sessionTokenHash,
        expiresAt: input.expiresAt,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        revokedAt: null,
        createdAt: input.createdAt ?? new Date(),
        lastActiveAt: input.lastActiveAt ?? new Date(),
      };
      sessions.set(input.sessionTokenHash, record);
      return record;
    },
    async findById(id: string): Promise<UserSessionRecord | null> {
      for (const sess of sessions.values()) {
        if (sess.id === id) return sess;
      }
      return null;
    },
    async findByTokenHash(tokenHash: string): Promise<UserSessionRecord | null> {
      return sessions.get(tokenHash) ?? null;
    },
    async findActiveByTokenHash(tokenHash: string, now: Date): Promise<UserSessionRecord | null> {
      const sess = sessions.get(tokenHash);
      if (!sess) return null;
      if (sess.revokedAt !== null) return null;
      if (sess.expiresAt.getTime() <= now.getTime()) return null;
      return sess;
    },
    async findActiveByUserId(userId: string, now: Date): Promise<readonly UserSessionRecord[]> {
      const list: UserSessionRecord[] = [];
      for (const sess of sessions.values()) {
        if (
          sess.userId === userId &&
          sess.revokedAt === null &&
          sess.expiresAt.getTime() > now.getTime()
        ) {
          list.push(sess);
        }
      }
      return list;
    },
    async touch(id: string, lastActiveAt: Date): Promise<void> {
      for (const [hash, sess] of sessions.entries()) {
        if (sess.id === id) {
          sessions.set(hash, { ...sess, lastActiveAt });
          break;
        }
      }
    },
    async revoke(id: string, revokedAt: Date): Promise<boolean> {
      for (const [hash, sess] of sessions.entries()) {
        if (sess.id === id) {
          if (sess.revokedAt !== null) return false;
          sessions.set(hash, { ...sess, revokedAt });
          return true;
        }
      }
      return false;
    },
    async revokeByTokenHash(tokenHash: string, revokedAt: Date): Promise<boolean> {
      const sess = sessions.get(tokenHash);
      if (!sess) return false;
      if (sess.revokedAt !== null) return false;
      sessions.set(tokenHash, { ...sess, revokedAt });
      return true;
    },
    async revokeAllForUser(userId: string, revokedAt: Date): Promise<number> {
      let count = 0;
      for (const [hash, sess] of sessions.entries()) {
        if (sess.userId === userId && sess.revokedAt === null) {
          sessions.set(hash, { ...sess, revokedAt });
          count++;
        }
      }
      return count;
    },
    async purgeExpired(now: Date): Promise<number> {
      let count = 0;
      for (const [hash, sess] of sessions.entries()) {
        if (sess.expiresAt.getTime() <= now.getTime()) {
          sessions.delete(hash);
          count++;
        }
      }
      return count;
    },
  };

  beforeAll(async () => {
    validPasswordHash = await hasher.hash(testPassword);

    accounts = new Map([
      [
        adminUserId,
        {
          id: adminUserId,
          displayName: 'Admin User',
          status: 'ACTIVE',
          disabledAt: null,
          roles: ['ADMIN'],
          permissions: resolvePermissionsForRoles(['ADMIN']),
          passwordCredential: null,
        },
      ],
      [
        suspendedUserId,
        {
          id: suspendedUserId,
          displayName: 'Suspended Staff',
          status: 'DISABLED',
          disabledAt: new Date(),
          roles: ['OPERATOR'],
          permissions: resolvePermissionsForRoles(['OPERATOR']),
          passwordCredential: null,
        },
      ],
      [
        lockedUserId,
        {
          id: lockedUserId,
          displayName: 'Locked Staff',
          status: 'ACTIVE',
          disabledAt: null,
          roles: ['OPERATOR'],
          permissions: resolvePermissionsForRoles(['OPERATOR']),
          passwordCredential: null,
        },
      ],
    ]);

    credentials = new Map([
      [
        adminUserId,
        {
          id: 'cred-admin',
          userId: adminUserId,
          passwordHash: validPasswordHash,
          hashAlgorithm: 'argon2id',
          failedLogins: 0,
          lockedUntil: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      [
        suspendedUserId,
        {
          id: 'cred-suspended',
          userId: suspendedUserId,
          passwordHash: validPasswordHash,
          hashAlgorithm: 'argon2id',
          failedLogins: 0,
          lockedUntil: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      [
        lockedUserId,
        {
          id: 'cred-locked',
          userId: lockedUserId,
          passwordHash: validPasswordHash,
          hashAlgorithm: 'argon2id',
          failedLogins: 5,
          lockedUntil: new Date(Date.now() + 15 * 60 * 1000), // 15 mins locked
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    ]);

    sessions = new Map();

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(),
        $disconnect: jest.fn(),
        $transaction: jest.fn().mockImplementation(() => Promise.resolve([])),
      })
      .overrideProvider(DatabaseHealthIndicator)
      .useValue({ ping: jest.fn().mockResolvedValue(undefined) })
      .overrideProvider(ValkeyConnectionService)
      .useValue({ ping: jest.fn().mockResolvedValue(undefined) })
      .overrideProvider(CreativeGenerationQueue)
      .useValue({ enqueue: jest.fn(), onModuleInit: jest.fn() })
      .overrideProvider(ContentGenerationQueue)
      .useValue({ enqueue: jest.fn(), onModuleInit: jest.fn() })
      .overrideProvider(USER_ACCOUNT_REPOSITORY)
      .useValue(mockUserAccountRepo)
      .overrideProvider(USER_SESSION_REPOSITORY)
      .useValue(mockSessionRepo)
      .overrideProvider(PASSWORD_CREDENTIAL_REPOSITORY)
      .useValue(mockPasswordCredRepo)
      .overrideProvider(PASSWORD_HASHER)
      .useValue(hasher)
      .compile();

    application = module.createNestApplication();
    configureApi(application);
    await application.init();
    server = application.getHttpServer() as Server;
  });

  afterAll(async () => {
    if (server) {
      server.closeAllConnections?.();
      if (server.listening) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }
    if (application) {
      await application.close();
    }
  });

  describe('Full Authentication Lifecycle', () => {
    let sessionCookie: string;

    it('logs in with valid credentials, sets ps_session cookie, and returns sanitized profile', async () => {
      const response = await request(server)
        .post('/v1/auth/login')
        .send({
          loginIdentifier: 'Admin User',
          password: testPassword,
        })
        .expect(200);

      expect(response.body).toEqual({
        user: {
          id: adminUserId,
          displayName: 'Admin User',
          status: 'ACTIVE',
          roles: ['ADMIN'],
          permissions: expect.arrayContaining(['APPROVE_CONTENT', 'PUBLISH_CREATIVE']),
        },
      });

      // Verify Set-Cookie header contains ps_session
      const setCookieHeader = response.headers['set-cookie'];
      expect(setCookieHeader).toBeDefined();
      const cookieStr = Array.isArray(setCookieHeader)
        ? setCookieHeader.join(';')
        : setCookieHeader;
      expect(cookieStr).toContain('ps_session=');
      expect(cookieStr).toContain('HttpOnly');
      expect(cookieStr).toContain('Path=/');

      // Extract raw ps_session cookie value for subsequent requests
      const match = /ps_session=([^;]+)/.exec(cookieStr);
      expect(match).not.toBeNull();
      sessionCookie = `ps_session=${match![1]}`;
    });

    it('retrieves current authenticated employee profile via GET /v1/auth/me using cookie', async () => {
      const response = await request(server)
        .get('/v1/auth/me')
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(response.body).toEqual({
        user: {
          id: adminUserId,
          displayName: 'Admin User',
          status: 'ACTIVE',
          roles: ['ADMIN'],
          permissions: expect.any(Array),
        },
      });
    });

    it('logs out successfully, revoking the session and clearing the cookie', async () => {
      const response = await request(server)
        .post('/v1/auth/logout')
        .set('Cookie', sessionCookie)
        .set('x-csrf-token', 'valid-anti-csrf-nonce')
        .expect(200);

      expect(response.body).toEqual({
        ok: true,
        message: 'Logged out successfully',
      });

      // Verify cookie is cleared (Max-Age=0 or Expires in past)
      const setCookieHeader = response.headers['set-cookie'];
      expect(setCookieHeader).toBeDefined();
      const cookieStr = Array.isArray(setCookieHeader)
        ? setCookieHeader.join(';')
        : setCookieHeader;
      expect(cookieStr).toContain('ps_session=;');
    });

    it('rejects subsequent /v1/auth/me requests with revoked session cookie (401)', async () => {
      const response = await request(server)
        .get('/v1/auth/me')
        .set('Cookie', sessionCookie)
        .expect(401);

      expect(response.body.error).toEqual(
        expect.objectContaining({
          code: 'UNAUTHORIZED_SESSION',
        }),
      );
    });
  });

  describe('Identifier Flexibility', () => {
    it('authenticates successfully using internal User UUID', async () => {
      const response = await request(server)
        .post('/v1/auth/login')
        .send({
          loginIdentifier: adminUserId,
          password: testPassword,
        })
        .expect(200);

      expect(response.body.user.id).toBe(adminUserId);
    });
  });

  describe('Adversarial & Failure Paths', () => {
    it('rejects invalid password with 401 INVALID_CREDENTIALS', async () => {
      const response = await request(server)
        .post('/v1/auth/login')
        .send({
          loginIdentifier: 'Admin User',
          password: 'WrongPassword123!',
        })
        .expect(401);

      expect(response.body.error).toEqual(
        expect.objectContaining({
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid login credentials.',
        }),
      );
    });

    it('rejects unknown identifier with identical 401 INVALID_CREDENTIALS', async () => {
      const response = await request(server)
        .post('/v1/auth/login')
        .send({
          loginIdentifier: 'nonexistent-user',
          password: 'AnyPassword123!',
        })
        .expect(401);

      expect(response.body.error).toEqual(
        expect.objectContaining({
          code: 'INVALID_CREDENTIALS',
        }),
      );
    });

    it('rejects temporarily locked account with 429 ACCOUNT_LOCKED', async () => {
      const response = await request(server)
        .post('/v1/auth/login')
        .send({
          loginIdentifier: 'Locked Staff',
          password: testPassword,
        })
        .expect(429);

      expect(response.body.error).toEqual(
        expect.objectContaining({
          code: 'ACCOUNT_LOCKED',
        }),
      );
    });

    it('rejects disabled/suspended account with 403 ACCOUNT_SUSPENDED', async () => {
      const response = await request(server)
        .post('/v1/auth/login')
        .send({
          loginIdentifier: 'Suspended Staff',
          password: testPassword,
        })
        .expect(403);

      expect(response.body.error).toEqual(
        expect.objectContaining({
          code: 'ACCOUNT_SUSPENDED',
        }),
      );
    });

    it('blocks CSRF attack on cookie-authenticated logout with untrusted origin (403)', async () => {
      // Create a fresh active session
      const loginRes = await request(server)
        .post('/v1/auth/login')
        .send({
          loginIdentifier: adminUserId,
          password: testPassword,
        })
        .expect(200);

      const cookieStr = loginRes.headers['set-cookie'][0];
      const match = /ps_session=([^;]+)/.exec(cookieStr);
      const cookie = `ps_session=${match![1]}`;

      // Simulate malicious cross-origin post without valid Origin
      const attackRes = await request(server)
        .post('/v1/auth/logout')
        .set('Cookie', cookie)
        .set('Origin', 'https://malicious-phishing-site.example')
        .expect(403);

      expect(attackRes.body.error).toEqual(
        expect.objectContaining({
          code: 'CSRF_VALIDATION_FAILED',
        }),
      );
    });
  });
});
