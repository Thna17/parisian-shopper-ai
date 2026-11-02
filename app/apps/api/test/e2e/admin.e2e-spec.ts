/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  Argon2PasswordHasher,
  ADMIN_AUDIT_REPOSITORY,
  EMPLOYEE_INVITATION_REPOSITORY,
  EMPLOYEE_REPOSITORY,
  PASSWORD_CREDENTIAL_REPOSITORY,
  PASSWORD_HASHER,
  RoleCode,
  SYSTEM_SETTING_REPOSITORY,
  USER_ACCOUNT_REPOSITORY,
  USER_SESSION_REPOSITORY,
  resolvePermissionsForRoles,
  type AdminAuditRepository,
  type AuthenticatedUserAccount,
  type CreateEmployeeInput,
  type CreateInvitationInput,
  type CreatePasswordCredentialInput,
  type CreateUserSessionInput,
  type EmployeeDetail,
  type EmployeeInvitationRecord,
  type EmployeeInvitationRepository,
  type EmployeeRepository,
  type EmployeeSummary,
  type PaginatedResult,
  type PasswordCredentialRecord,
  type PasswordCredentialRepository,
  type SafeUserSession,
  type SystemSettingRecord,
  type SystemSettingRepository,
  type UserAccountRepository,
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
import { createHash, randomBytes } from 'node:crypto';
import { type Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { configureApi } from '../../src/bootstrap.js';

describe('Admin & Employee Management (e2e)', () => {
  let application: INestApplication;
  let server: Server;

  const hasher = new Argon2PasswordHasher({
    memorySize: 1024,
    iterations: 2,
    parallelism: 1,
    hashLength: 32,
  });

  const adminUserId = '00000000-0000-4000-8000-000000000001';
  const secondAdminId = '00000000-0000-4000-8000-000000000002';
  const editorUserId = '00000000-0000-4000-8000-000000000003';
  const targetEmployeeId = '00000000-0000-4000-8000-000000000004';

  const adminSessionToken = 'admin-raw-session-token-xyz1234567890';
  const adminTokenHash = createHash('sha256').update(adminSessionToken).digest('hex');

  const editorSessionToken = 'editor-raw-session-token-xyz1234567890';
  const editorTokenHash = createHash('sha256').update(editorSessionToken).digest('hex');

  let employeesMap: Map<string, EmployeeDetail>;
  let invitationsMap: Map<string, EmployeeInvitationRecord>;
  let settingsMap: Map<string, SystemSettingRecord>;
  let auditLogs: Array<any>;
  let sessionsMap: Map<string, UserSessionRecord>;
  let credentialsMap: Map<string, PasswordCredentialRecord>;

  const mockEmployeeRepo: EmployeeRepository = {
    async findPaginated(query): Promise<PaginatedResult<EmployeeSummary>> {
      const items: EmployeeSummary[] = Array.from(employeesMap.values()).map((e) => ({
        id: e.id,
        displayName: e.displayName,
        status: e.status,
        roles: e.roles,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        disabledAt: e.disabledAt,
        telegramUsername: e.telegram?.telegramUsername ?? null,
        activeSessionsCount: e.activeSessionsCount,
      }));
      return {
        items,
        total: items.length,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        totalPages: 1,
      };
    },
    async findById(id: string): Promise<EmployeeDetail | null> {
      return employeesMap.get(id) ?? null;
    },
    async create(input: CreateEmployeeInput): Promise<EmployeeDetail> {
      const id = randomBytes(16)
        .toString('hex')
        .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
      const record: EmployeeDetail = {
        id,
        displayName: input.displayName,
        status: 'ACTIVE',
        roles: [...input.roleCodes],
        createdAt: new Date(),
        updatedAt: new Date(),
        disabledAt: null,
        hasPassword: false,
        telegram: null,
        activeSessionsCount: 0,
        recentActivity: { lastActiveAt: null },
      };
      employeesMap.set(id, record);
      return record;
    },
    async updateDisplayName(id: string, displayName: string): Promise<EmployeeDetail> {
      const existing = employeesMap.get(id);
      if (!existing) throw new Error('Not found');
      const updated = { ...existing, displayName, updatedAt: new Date() };
      employeesMap.set(id, updated);
      return updated;
    },
    async updateRoles(
      id: string,
      roleCodes: readonly RoleCode[],
      _actorId: string,
    ): Promise<EmployeeDetail> {
      const existing = employeesMap.get(id);
      if (!existing) throw new Error('Not found');
      const updated = { ...existing, roles: [...roleCodes], updatedAt: new Date() };
      employeesMap.set(id, updated);
      return updated;
    },
    async suspend(id: string, _actorId: string): Promise<EmployeeDetail> {
      const existing = employeesMap.get(id);
      if (!existing) throw new Error('Not found');
      const updated = {
        ...existing,
        status: 'DISABLED' as const,
        disabledAt: new Date(),
        updatedAt: new Date(),
      };
      employeesMap.set(id, updated);
      return updated;
    },
    async reactivate(id: string, _actorId: string): Promise<EmployeeDetail> {
      const existing = employeesMap.get(id);
      if (!existing) throw new Error('Not found');
      const updated = {
        ...existing,
        status: 'ACTIVE' as const,
        disabledAt: null,
        updatedAt: new Date(),
      };
      employeesMap.set(id, updated);
      return updated;
    },
    async countActiveAdmins(): Promise<number> {
      let count = 0;
      for (const emp of employeesMap.values()) {
        if (emp.status === 'ACTIVE' && emp.roles.includes(RoleCode.ADMIN)) {
          count++;
        }
      }
      return count;
    },
    async existsByDisplayName(displayName: string, excludeId?: string): Promise<boolean> {
      for (const emp of employeesMap.values()) {
        if (emp.displayName.toLowerCase() === displayName.toLowerCase() && emp.id !== excludeId) {
          return true;
        }
      }
      return false;
    },
    async findSessionsByUserId(userId: string): Promise<readonly SafeUserSession[]> {
      const list: SafeUserSession[] = [];
      for (const s of sessionsMap.values()) {
        if (s.userId === userId) {
          list.push({
            id: s.id,
            ipAddress: s.ipAddress,
            userAgent: s.userAgent,
            createdAt: s.createdAt,
            lastActiveAt: s.lastActiveAt,
            expiresAt: s.expiresAt,
            revokedAt: s.revokedAt,
            isActive: s.revokedAt === null && s.expiresAt > new Date(),
          });
        }
      }
      return list;
    },
  };

  const mockInvitationRepo: EmployeeInvitationRepository = {
    async create(input: CreateInvitationInput): Promise<EmployeeInvitationRecord> {
      const record: EmployeeInvitationRecord = {
        id: `inv-${Date.now()}`,
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        claimedAt: null,
        createdById: input.createdById ?? null,
        createdAt: new Date(),
      };
      invitationsMap.set(input.tokenHash, record);
      return record;
    },
    async findByTokenHash(tokenHash: string): Promise<EmployeeInvitationRecord | null> {
      return invitationsMap.get(tokenHash) ?? null;
    },
    async markClaimed(id: string, claimedAt: Date): Promise<void> {
      for (const [hash, record] of invitationsMap.entries()) {
        if (record.id === id) {
          invitationsMap.set(hash, { ...record, claimedAt });
          break;
        }
      }
    },
    async findPendingByUserId(userId: string, now: Date): Promise<EmployeeInvitationRecord | null> {
      for (const record of invitationsMap.values()) {
        if (record.userId === userId && record.claimedAt === null && record.expiresAt > now) {
          return record;
        }
      }
      return null;
    },
    async invalidatePendingForUser(userId: string): Promise<number> {
      let count = 0;
      for (const [hash, record] of invitationsMap.entries()) {
        if (record.userId === userId && record.claimedAt === null) {
          invitationsMap.set(hash, { ...record, expiresAt: new Date() });
          count++;
        }
      }
      return count;
    },
  };

  const mockSettingRepo: SystemSettingRepository = {
    async findAll(): Promise<readonly SystemSettingRecord[]> {
      return Array.from(settingsMap.values());
    },
    async findByKey(key: string): Promise<SystemSettingRecord | null> {
      return settingsMap.get(key) ?? null;
    },
    async upsert(input): Promise<SystemSettingRecord> {
      const existing = settingsMap.get(input.key);
      const record: SystemSettingRecord = {
        id: existing?.id ?? `set-${Date.now()}`,
        key: input.key,
        category: input.category ?? 'GENERAL',
        value: input.value,
        description: input.description ?? null,
        updatedById: input.updatedById ?? null,
        createdAt: existing?.createdAt ?? new Date(),
        updatedAt: new Date(),
      };
      settingsMap.set(input.key, record);
      return record;
    },
  };

  const mockAuditRepo: AdminAuditRepository = {
    async record(input): Promise<any> {
      const record = {
        id: `aud-${Date.now()}-${Math.random()}`,
        actorUserId: input.actorUserId ?? null,
        actorDisplayName: input.actorUserId === adminUserId ? 'Admin User' : 'System',
        action: input.action,
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId ?? null,
        metadata: input.metadata ?? null,
        createdAt: new Date(),
      };
      auditLogs.push(record);
      return record;
    },
    async findPaginated(query): Promise<PaginatedResult<any>> {
      return {
        items: auditLogs,
        total: auditLogs.length,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        totalPages: 1,
      };
    },
  };

  const mockUserAccountRepo: UserAccountRepository = {
    async findById(userId: string): Promise<AuthenticatedUserAccount | null> {
      const emp = employeesMap.get(userId);
      if (!emp) return null;
      return {
        id: emp.id,
        displayName: emp.displayName,
        status: emp.status,
        disabledAt: emp.disabledAt,
        roles: emp.roles,
        permissions: resolvePermissionsForRoles(emp.roles),
        passwordCredential: null,
      };
    },
    async findByLoginIdentifier(identifier: string): Promise<AuthenticatedUserAccount | null> {
      for (const emp of employeesMap.values()) {
        if (emp.displayName.toLowerCase() === identifier.toLowerCase() || emp.id === identifier) {
          return {
            id: emp.id,
            displayName: emp.displayName,
            status: emp.status,
            disabledAt: emp.disabledAt,
            roles: emp.roles,
            permissions: resolvePermissionsForRoles(emp.roles),
            passwordCredential: null,
          };
        }
      }
      return null;
    },
  };

  const mockSessionRepo: UserSessionRepository = {
    async create(input: CreateUserSessionInput): Promise<UserSessionRecord> {
      const record: UserSessionRecord = {
        id: `sess-${Date.now()}`,
        userId: input.userId,
        sessionTokenHash: input.sessionTokenHash,
        expiresAt: input.expiresAt,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        revokedAt: null,
        createdAt: new Date(),
        lastActiveAt: new Date(),
      };
      sessionsMap.set(input.sessionTokenHash, record);
      return record;
    },
    async findById(id: string): Promise<UserSessionRecord | null> {
      for (const s of sessionsMap.values()) {
        if (s.id === id) return s;
      }
      return null;
    },
    async findByTokenHash(tokenHash: string): Promise<UserSessionRecord | null> {
      return sessionsMap.get(tokenHash) ?? null;
    },
    async findActiveByTokenHash(tokenHash: string, now: Date): Promise<UserSessionRecord | null> {
      const s = sessionsMap.get(tokenHash);
      if (!s || s.revokedAt !== null || s.expiresAt.getTime() <= now.getTime()) return null;
      return s;
    },
    async findActiveByUserId(userId: string, now: Date): Promise<readonly UserSessionRecord[]> {
      const list: UserSessionRecord[] = [];
      for (const s of sessionsMap.values()) {
        if (s.userId === userId && s.revokedAt === null && s.expiresAt.getTime() > now.getTime()) {
          list.push(s);
        }
      }
      return list;
    },
    async touch(id: string, lastActiveAt: Date): Promise<void> {
      for (const [hash, s] of sessionsMap.entries()) {
        if (s.id === id) {
          sessionsMap.set(hash, { ...s, lastActiveAt });
          break;
        }
      }
    },
    async revoke(id: string, revokedAt: Date): Promise<boolean> {
      for (const [hash, s] of sessionsMap.entries()) {
        if (s.id === id) {
          sessionsMap.set(hash, { ...s, revokedAt });
          return true;
        }
      }
      return false;
    },
    async revokeByTokenHash(tokenHash: string, revokedAt: Date): Promise<boolean> {
      const s = sessionsMap.get(tokenHash);
      if (!s) return false;
      sessionsMap.set(tokenHash, { ...s, revokedAt });
      return true;
    },
    async revokeAllForUser(userId: string, revokedAt: Date): Promise<number> {
      let count = 0;
      for (const [hash, s] of sessionsMap.entries()) {
        if (s.userId === userId && s.revokedAt === null) {
          sessionsMap.set(hash, { ...s, revokedAt });
          count++;
        }
      }
      return count;
    },
    async purgeExpired(): Promise<number> {
      return 0;
    },
  };

  const mockPasswordCredRepo: PasswordCredentialRepository = {
    async findByUserId(userId: string): Promise<PasswordCredentialRecord | null> {
      return credentialsMap.get(userId) ?? null;
    },
    async create(input: CreatePasswordCredentialInput): Promise<PasswordCredentialRecord> {
      const record: PasswordCredentialRecord = {
        id: `cred-${input.userId}`,
        userId: input.userId,
        passwordHash: input.passwordHash,
        hashAlgorithm: 'argon2id',
        failedLogins: 0,
        lockedUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      credentialsMap.set(input.userId, record);
      return record;
    },
    async updatePasswordHash(input): Promise<PasswordCredentialRecord> {
      const existing = credentialsMap.get(input.userId);
      if (!existing) throw new Error('Not found');
      const updated = { ...existing, passwordHash: input.passwordHash, updatedAt: new Date() };
      credentialsMap.set(input.userId, updated);
      return updated;
    },
    async recordLoginFailure(input): Promise<PasswordCredentialRecord> {
      const existing = credentialsMap.get(input.userId);
      if (!existing) throw new Error('Not found');
      const updated = {
        ...existing,
        failedLogins: existing.failedLogins + 1,
        lockedUntil: input.lockedUntil ?? null,
      };
      credentialsMap.set(input.userId, updated);
      return updated;
    },
    async resetLoginFailures(userId: string): Promise<void> {
      const existing = credentialsMap.get(userId);
      if (existing) {
        credentialsMap.set(userId, { ...existing, failedLogins: 0, lockedUntil: null });
      }
    },
  };

  beforeAll(async () => {
    employeesMap = new Map([
      [
        adminUserId,
        {
          id: adminUserId,
          displayName: 'Admin User',
          status: 'ACTIVE',
          roles: [RoleCode.ADMIN],
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
          disabledAt: null,
          hasPassword: true,
          telegram: null,
          activeSessionsCount: 1,
          recentActivity: { lastActiveAt: new Date() },
        },
      ],
      [
        secondAdminId,
        {
          id: secondAdminId,
          displayName: 'Second Admin',
          status: 'ACTIVE',
          roles: [RoleCode.ADMIN],
          createdAt: new Date('2026-01-02'),
          updatedAt: new Date('2026-01-02'),
          disabledAt: null,
          hasPassword: true,
          telegram: null,
          activeSessionsCount: 0,
          recentActivity: { lastActiveAt: null },
        },
      ],
      [
        editorUserId,
        {
          id: editorUserId,
          displayName: 'Marketing Editor',
          status: 'ACTIVE',
          roles: [RoleCode.MARKETING_EDITOR],
          createdAt: new Date('2026-01-03'),
          updatedAt: new Date('2026-01-03'),
          disabledAt: null,
          hasPassword: true,
          telegram: null,
          activeSessionsCount: 1,
          recentActivity: { lastActiveAt: new Date() },
        },
      ],
      [
        targetEmployeeId,
        {
          id: targetEmployeeId,
          displayName: 'Target Employee',
          status: 'ACTIVE',
          roles: [RoleCode.VIEWER],
          createdAt: new Date('2026-01-04'),
          updatedAt: new Date('2026-01-04'),
          disabledAt: null,
          hasPassword: false,
          telegram: null,
          activeSessionsCount: 1,
          recentActivity: { lastActiveAt: new Date() },
        },
      ],
    ]);

    invitationsMap = new Map();
    settingsMap = new Map();
    auditLogs = [];
    credentialsMap = new Map();

    sessionsMap = new Map([
      [
        adminTokenHash,
        {
          id: 'sess-admin',
          userId: adminUserId,
          sessionTokenHash: adminTokenHash,
          expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
          ipAddress: '127.0.0.1',
          userAgent: 'Jest-E2E-Admin',
          revokedAt: null,
          createdAt: new Date(),
          lastActiveAt: new Date(),
        },
      ],
      [
        editorTokenHash,
        {
          id: 'sess-editor',
          userId: editorUserId,
          sessionTokenHash: editorTokenHash,
          expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
          ipAddress: '127.0.0.1',
          userAgent: 'Jest-E2E-Editor',
          revokedAt: null,
          createdAt: new Date(),
          lastActiveAt: new Date(),
        },
      ],
    ]);

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(),
        $disconnect: jest.fn(),
        $transaction: jest.fn().mockImplementation((fn: any) => fn({})),
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
      .overrideProvider(EMPLOYEE_REPOSITORY)
      .useValue(mockEmployeeRepo)
      .overrideProvider(EMPLOYEE_INVITATION_REPOSITORY)
      .useValue(mockInvitationRepo)
      .overrideProvider(SYSTEM_SETTING_REPOSITORY)
      .useValue(mockSettingRepo)
      .overrideProvider(ADMIN_AUDIT_REPOSITORY)
      .useValue(mockAuditRepo)
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

  describe('GET /v1/admin/employees', () => {
    it('returns 401 when no session cookie is provided', async () => {
      const res = await request(server).get('/v1/admin/employees');
      expect(res.status).toBe(401);
    });

    it('returns 403 when authenticated as a non-admin employee', async () => {
      const res = await request(server)
        .get('/v1/admin/employees')
        .set('Cookie', [`ps_session=${editorSessionToken}`]);
      expect(res.status).toBe(403);
    });

    it('returns 200 with paginated employee directory when authenticated as ADMIN', async () => {
      const res = await request(server)
        .get('/v1/admin/employees')
        .set('Cookie', [`ps_session=${adminSessionToken}`]);
      expect(res.status).toBe(200);
      expect(res.body.items).toBeDefined();
      expect(res.body.items.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('POST /v1/admin/employees (Provisioning)', () => {
    it('provisions a new employee and returns single-use onboarding token', async () => {
      const res = await request(server)
        .post('/v1/admin/employees')
        .set('Cookie', [`ps_session=${adminSessionToken}`])
        .set('Origin', 'http://localhost:3000')
        .send({
          displayName: 'New Editorial Hire',
          roles: [RoleCode.MARKETING_EDITOR],
        });

      expect(res.status).toBe(201);
      expect(res.body.employee.displayName).toBe('New Editorial Hire');
      expect(res.body.rawOnboardingToken).toBeDefined();
      expect(res.body.rawOnboardingToken).toHaveLength(64);
    });
  });

  describe('PATCH /v1/admin/employees/:id/role', () => {
    it('rejects self-role modification with 403', async () => {
      const res = await request(server)
        .patch(`/v1/admin/employees/${adminUserId}/role`)
        .set('Cookie', [`ps_session=${adminSessionToken}`])
        .set('Origin', 'http://localhost:3000')
        .send({
          roles: [RoleCode.VIEWER],
        });

      expect(res.status).toBe(403);
    });

    it('updates another employee roles successfully with 200', async () => {
      const res = await request(server)
        .patch(`/v1/admin/employees/${targetEmployeeId}/role`)
        .set('Cookie', [`ps_session=${adminSessionToken}`])
        .set('Origin', 'http://localhost:3000')
        .send({
          roles: [RoleCode.MARKETING_EDITOR, RoleCode.MARKETING_APPROVER],
        });

      expect(res.status).toBe(200);
      expect(res.body.roles).toContain(RoleCode.MARKETING_APPROVER);
    });
  });

  describe('POST /v1/admin/employees/:id/suspend', () => {
    it('rejects self-suspension with 403', async () => {
      const res = await request(server)
        .post(`/v1/admin/employees/${adminUserId}/suspend`)
        .set('Cookie', [`ps_session=${adminSessionToken}`])
        .set('Origin', 'http://localhost:3000')
        .send({});

      expect(res.status).toBe(403);
    });

    it('suspends target employee and terminates their sessions with 200', async () => {
      const res = await request(server)
        .post(`/v1/admin/employees/${targetEmployeeId}/suspend`)
        .set('Cookie', [`ps_session=${adminSessionToken}`])
        .set('Origin', 'http://localhost:3000')
        .send({ reason: 'Audit pending' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('DISABLED');
    });
  });

  describe('POST /v1/admin/employees/:id/reactivate', () => {
    it('reactivates suspended employee account with 200', async () => {
      const res = await request(server)
        .post(`/v1/admin/employees/${targetEmployeeId}/reactivate`)
        .set('Cookie', [`ps_session=${adminSessionToken}`])
        .set('Origin', 'http://localhost:3000');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ACTIVE');
    });
  });

  describe('GET & PATCH /v1/admin/settings', () => {
    it('reads system settings overview', async () => {
      const res = await request(server)
        .get('/v1/admin/settings')
        .set('Cookie', [`ps_session=${adminSessionToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.organization).toBeDefined();
      expect(res.body.workflow).toBeDefined();
    });

    it('updates system setting with 200', async () => {
      const res = await request(server)
        .patch('/v1/admin/settings')
        .set('Cookie', [`ps_session=${adminSessionToken}`])
        .set('Origin', 'http://localhost:3000')
        .send({
          key: 'WORKFLOW_POLICIES',
          category: 'WORKFLOW',
          value: { sessionTtlHours: 12 },
        });

      expect(res.status).toBe(200);
      expect(res.body.key).toBe('WORKFLOW_POLICIES');
    });
  });

  describe('GET /v1/admin/audit', () => {
    it('queries administrative audit log with 200', async () => {
      const res = await request(server)
        .get('/v1/admin/audit')
        .set('Cookie', [`ps_session=${adminSessionToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.items).toBeDefined();
    });
  });

  describe('POST /v1/auth/onboarding/claim', () => {
    it('rejects claim when token does not exist', async () => {
      const res = await request(server).post('/v1/auth/onboarding/claim').send({
        token: 'invalid-non-existent-token-1234567890',
        password: 'ValidPassword#2026',
      });

      expect(res.status).toBe(400);
    });

    it('claims invitation and activates employee credentials when token is valid', async () => {
      // 1. Generate invitation token
      const rawToken = 'sample-claimable-token-1234567890abcdef1234567890abcdef1234567890';
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      await mockInvitationRepo.create({
        userId: targetEmployeeId,
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 86400 * 1000),
      });

      // 2. Claim invitation
      const res = await request(server).post('/v1/auth/onboarding/claim').send({
        token: rawToken,
        password: 'ValidPassword#2026',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.userId).toBe(targetEmployeeId);
    });
  });
});
