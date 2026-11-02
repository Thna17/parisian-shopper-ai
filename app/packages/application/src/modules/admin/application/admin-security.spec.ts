/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { AccountSuspendedError } from '../../auth/domain/auth-errors.js';
import { RoleCode } from '../../auth/domain/permissions.js';
import type { PasswordHasher } from '../../auth/domain/password-hasher.port.js';
import type { UserAccountRepository } from '../../auth/application/user-account.repository.js';
import type { UserSessionRepository } from '../../auth/application/user-session.repository.js';
import type { PasswordCredentialRepository } from '../../auth/application/password-credential.repository.js';
import {
  InvalidInvitationTokenError,
  LastActiveAdminError,
  SelfRoleModificationError,
  SelfSuspensionError,
} from '../domain/admin-errors.js';
import type {
  EmployeeDetail,
  EmployeeInvitationRecord,
  EmployeeSummary,
  SafeUserSession,
  SystemSettingRecord,
} from '../domain/employee.types.js';
import type { AdminAuditRepository } from './ports/admin-audit.repository.js';
import type {
  CreateInvitationInput,
  EmployeeInvitationRepository,
} from './ports/employee-invitation.repository.js';
import type { EmployeeRepository } from './ports/employee.repository.js';
import type { SystemSettingRepository } from './ports/system-setting.repository.js';
import { ClaimOnboardingInvitationUseCase } from './use-cases/claim-onboarding-invitation.use-case.js';
import { CreateEmployeeUseCase } from './use-cases/create-employee.use-case.js';
import { GetEmployeeDetailUseCase } from './use-cases/get-employee-detail.use-case.js';
import { GetSystemSettingsUseCase } from './use-cases/get-system-settings.use-case.js';
import { ListAdminAuditLogsUseCase } from './use-cases/list-admin-audit-logs.use-case.js';
import { ListEmployeeSessionsUseCase } from './use-cases/list-employee-sessions.use-case.js';
import { ListEmployeesUseCase } from './use-cases/list-employees.use-case.js';
import { ReactivateEmployeeUseCase } from './use-cases/reactivate-employee.use-case.js';
import { RevokeEmployeeSessionsUseCase } from './use-cases/revoke-employee-sessions.use-case.js';
import { SuspendEmployeeUseCase } from './use-cases/suspend-employee.use-case.js';
import { UpdateEmployeeRolesUseCase } from './use-cases/update-employee-roles.use-case.js';
import { UpdateSystemSettingsUseCase } from './use-cases/update-system-settings.use-case.js';

describe('Admin & Employee Management Security Suite (ADMIN-01 - ADMIN-20)', () => {
  let mockEmployeeRepo: jest.Mocked<EmployeeRepository>;
  let mockInvitationRepo: jest.Mocked<EmployeeInvitationRepository>;
  let mockSettingRepo: jest.Mocked<SystemSettingRepository>;
  let mockAuditRepo: jest.Mocked<AdminAuditRepository>;
  let mockSessionRepo: jest.Mocked<UserSessionRepository>;
  let mockAccountRepo: jest.Mocked<UserAccountRepository>;
  let mockCredentialRepo: jest.Mocked<PasswordCredentialRepository>;
  let mockHasher: jest.Mocked<PasswordHasher>;

  const adminUserId = '11111111-1111-1111-1111-111111111111';
  const targetEmployeeId = '22222222-2222-2222-2222-222222222222';
  const secondAdminId = '33333333-3333-3333-3333-333333333333';

  const sampleEmployeeSummary: EmployeeSummary = {
    id: targetEmployeeId,
    displayName: 'Aurelie Moreau',
    status: 'ACTIVE',
    roles: [RoleCode.MARKETING_EDITOR],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    disabledAt: null,
    telegramUsername: 'aurelie_m',
    activeSessionsCount: 2,
  };

  const sampleEmployeeDetail: EmployeeDetail = {
    id: targetEmployeeId,
    displayName: 'Aurelie Moreau',
    status: 'ACTIVE',
    roles: [RoleCode.MARKETING_EDITOR],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    disabledAt: null,
    hasPassword: true,
    telegram: {
      id: 'tg-001',
      telegramUserId: '9876543210',
      maskedTelegramUserId: '••••••3210',
      telegramUsername: 'aurelie_m',
      displayName: 'Aurelie M.',
      lastSeenAt: new Date('2026-02-01'),
      disabledAt: null,
    },
    activeSessionsCount: 2,
    recentActivity: {
      lastActiveAt: new Date('2026-02-01T12:00:00Z'),
    },
  };

  const sampleSafeSession: SafeUserSession = {
    id: 'sess-001',
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0 Chrome/120',
    createdAt: new Date('2026-02-01T10:00:00Z'),
    lastActiveAt: new Date('2026-02-01T12:00:00Z'),
    expiresAt: new Date(Date.now() + 1000 * 3600),
    revokedAt: null,
    isActive: true,
  };

  beforeEach(() => {
    mockEmployeeRepo = {
      findPaginated: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      updateDisplayName: jest.fn(),
      updateRoles: jest.fn(),
      suspend: jest.fn(),
      reactivate: jest.fn(),
      countActiveAdmins: jest.fn(),
      existsByDisplayName: jest.fn(),
      findSessionsByUserId: jest.fn(),
    } as unknown as jest.Mocked<EmployeeRepository>;

    mockInvitationRepo = {
      create: jest.fn(),
      findByTokenHash: jest.fn(),
      markClaimed: jest.fn(),
      findPendingByUserId: jest.fn(),
      invalidatePendingForUser: jest.fn(),
    } as unknown as jest.Mocked<EmployeeInvitationRepository>;

    mockSettingRepo = {
      findAll: jest.fn(),
      findByKey: jest.fn(),
      upsert: jest.fn(),
    } as unknown as jest.Mocked<SystemSettingRepository>;

    mockAuditRepo = {
      record: jest.fn(),
      findPaginated: jest.fn(),
    } as unknown as jest.Mocked<AdminAuditRepository>;

    mockSessionRepo = {
      create: jest.fn(),
      findActiveByTokenHash: jest.fn(),
      touch: jest.fn(),
      revoke: jest.fn(),
      revokeAllForUser: jest.fn(),
      deleteExpired: jest.fn(),
    } as unknown as jest.Mocked<UserSessionRepository>;

    mockAccountRepo = {
      findById: jest.fn(),
      findByLoginIdentifier: jest.fn(),
    } as unknown as jest.Mocked<UserAccountRepository>;

    mockCredentialRepo = {
      findByUserId: jest.fn(),
      create: jest.fn(),
      updatePasswordHash: jest.fn(),
      recordFailedLogin: jest.fn(),
      resetFailedLogins: jest.fn(),
      lockUntil: jest.fn(),
    } as unknown as jest.Mocked<PasswordCredentialRepository>;

    mockHasher = {
      hash: jest.fn().mockResolvedValue('mock-argon2-hash' as never),
      verify: jest.fn().mockResolvedValue(true as never),
    } as unknown as jest.Mocked<PasswordHasher>;
  });

  // ADMIN-01: Directory lists employees with correct roles, session counts, and safe metadata
  it('ADMIN-01: lists employees with active roles, session counts, and safe summary metadata', async () => {
    mockEmployeeRepo.findPaginated.mockResolvedValueOnce({
      items: [sampleEmployeeSummary],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    const useCase = new ListEmployeesUseCase(mockEmployeeRepo);
    const result = await useCase.execute({});

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe(targetEmployeeId);
    expect(result.items[0]!.roles).toEqual([RoleCode.MARKETING_EDITOR]);
    expect(result.items[0]!.activeSessionsCount).toBe(2);
    expect(mockEmployeeRepo.findPaginated).toHaveBeenCalledWith({});
  });

  // ADMIN-02: Search and filter work across display name, Telegram identity, and role/status
  it('ADMIN-02: forwards search term, role filter, and status filter to repository query', async () => {
    mockEmployeeRepo.findPaginated.mockResolvedValueOnce({
      items: [sampleEmployeeSummary],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    });

    const useCase = new ListEmployeesUseCase(mockEmployeeRepo);
    await useCase.execute({
      search: 'aurelie',
      role: RoleCode.MARKETING_EDITOR,
      status: 'ACTIVE',
      page: 1,
      limit: 10,
    });

    expect(mockEmployeeRepo.findPaginated).toHaveBeenCalledWith({
      search: 'aurelie',
      role: RoleCode.MARKETING_EDITOR,
      status: 'ACTIVE',
      page: 1,
      limit: 10,
    });
  });

  // ADMIN-03: Detail view returns comprehensive profile without exposing credentials or hashes
  it('ADMIN-03: detail view returns safe profile without passwords or session token hashes', async () => {
    mockEmployeeRepo.findById.mockResolvedValueOnce(sampleEmployeeDetail);

    const useCase = new GetEmployeeDetailUseCase(mockEmployeeRepo);
    const result = await useCase.execute(targetEmployeeId);

    expect(result.id).toBe(targetEmployeeId);
    expect(result.displayName).toBe('Aurelie Moreau');
    expect(result.hasPassword).toBe(true);
    expect((result as unknown as Record<string, unknown>)['passwordHash']).toBeUndefined();
    expect((result as unknown as Record<string, unknown>)['sessionTokenHash']).toBeUndefined();
    expect(result.telegram?.maskedTelegramUserId).toBe('••••••3210');
  });

  // ADMIN-04: Safe session inspection lists active/revoked sessions without session tokens
  it('ADMIN-04: lists safe user sessions containing IP, user agent, timestamps without raw tokens', async () => {
    mockEmployeeRepo.findById.mockResolvedValueOnce(sampleEmployeeDetail);
    mockEmployeeRepo.findSessionsByUserId.mockResolvedValueOnce([sampleSafeSession]);

    const useCase = new ListEmployeeSessionsUseCase(mockEmployeeRepo);
    const sessions = await useCase.execute(targetEmployeeId);

    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.id).toBe('sess-001');
    expect(sessions[0]!.ipAddress).toBe('192.168.1.1');
    expect(sessions[0]!.userAgent).toBe('Mozilla/5.0 Chrome/120');
    expect(sessions[0]!.isActive).toBe(true);
    expect((sessions[0] as unknown as Record<string, unknown>)['sessionToken']).toBeUndefined();
    expect((sessions[0] as unknown as Record<string, unknown>)['sessionTokenHash']).toBeUndefined();
  });

  // ADMIN-05: Single-session revocation terminates target session immediately
  it('ADMIN-05: revokes a single session and records an audit log', async () => {
    mockEmployeeRepo.findById.mockResolvedValueOnce(sampleEmployeeDetail);
    mockSessionRepo.revoke.mockResolvedValueOnce(true);

    const useCase = new RevokeEmployeeSessionsUseCase(
      mockEmployeeRepo,
      mockSessionRepo,
      mockAuditRepo,
    );
    const result = await useCase.execute({
      userId: targetEmployeeId,
      sessionId: 'sess-001',
      actorUserId: adminUserId,
    });

    expect(result.revokedCount).toBe(1);
    expect(mockSessionRepo.revoke).toHaveBeenCalledWith('sess-001', expect.any(Date));
    expect(mockAuditRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EMPLOYEE_SESSION_REVOKED',
        actorUserId: adminUserId,
        resourceId: targetEmployeeId,
      }),
    );
  });

  // ADMIN-06: Bulk-session revocation terminates all active sessions for that employee
  it('ADMIN-06: revokes all active sessions for an employee and records an audit log', async () => {
    mockEmployeeRepo.findById.mockResolvedValueOnce(sampleEmployeeDetail);
    mockSessionRepo.revokeAllForUser.mockResolvedValueOnce(3);

    const useCase = new RevokeEmployeeSessionsUseCase(
      mockEmployeeRepo,
      mockSessionRepo,
      mockAuditRepo,
    );
    const result = await useCase.execute({
      userId: targetEmployeeId,
      actorUserId: adminUserId,
    });

    expect(result.revokedCount).toBe(3);
    expect(mockSessionRepo.revokeAllForUser).toHaveBeenCalledWith(
      targetEmployeeId,
      expect.any(Date),
    );
    expect(mockAuditRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EMPLOYEE_ALL_SESSIONS_REVOKED',
        actorUserId: adminUserId,
        resourceId: targetEmployeeId,
      }),
    );
  });

  // ADMIN-07: Account suspension terminates all active sessions immediately
  it('ADMIN-07: suspending an employee revokes all active sessions immediately', async () => {
    mockEmployeeRepo.findById.mockResolvedValueOnce(sampleEmployeeDetail);
    mockEmployeeRepo.suspend.mockResolvedValueOnce({
      ...sampleEmployeeDetail,
      status: 'DISABLED',
      disabledAt: new Date(),
    });

    const useCase = new SuspendEmployeeUseCase(mockEmployeeRepo, mockSessionRepo, mockAuditRepo);
    const updated = await useCase.execute({
      id: targetEmployeeId,
      actorUserId: adminUserId,
      reason: 'Security review pending',
    });

    expect(updated.status).toBe('DISABLED');
    expect(mockSessionRepo.revokeAllForUser).toHaveBeenCalledWith(
      targetEmployeeId,
      expect.any(Date),
    );
    expect(mockAuditRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EMPLOYEE_SUSPENDED',
        actorUserId: adminUserId,
        resourceId: targetEmployeeId,
      }),
    );
  });

  // ADMIN-08: Suspended employee is rejected on claim or login
  it('ADMIN-08: claiming invitation for a suspended account throws AccountSuspendedError', async () => {
    const expiredRecord: EmployeeInvitationRecord = {
      id: 'inv-001',
      userId: targetEmployeeId,
      tokenHash: 'sample-token-hash',
      expiresAt: new Date(Date.now() + 1000 * 3600),
      claimedAt: null,
      createdById: adminUserId,
      createdAt: new Date(),
    };

    mockInvitationRepo.findByTokenHash.mockResolvedValueOnce(expiredRecord);
    mockAccountRepo.findById.mockResolvedValueOnce({
      id: targetEmployeeId,
      displayName: 'Aurelie Moreau',
      status: 'DISABLED',
      disabledAt: new Date(),
      roles: [RoleCode.MARKETING_EDITOR],
      permissions: [],
      passwordCredential: null,
    });

    const useCase = new ClaimOnboardingInvitationUseCase(
      mockInvitationRepo,
      mockAccountRepo,
      mockCredentialRepo,
      mockHasher,
      mockAuditRepo,
    );

    await expect(
      useCase.execute({
        token: 'sample-plain-token',
        password: 'ValidPassword#2026',
      }),
    ).rejects.toThrow(AccountSuspendedError);
  });

  // ADMIN-09: Account reactivation restores status and audits event
  it('ADMIN-09: reactivates previously suspended employee account', async () => {
    const suspendedEmployee: EmployeeDetail = {
      ...sampleEmployeeDetail,
      status: 'DISABLED',
      disabledAt: new Date('2026-02-01'),
    };
    mockEmployeeRepo.findById.mockResolvedValueOnce(suspendedEmployee);
    mockEmployeeRepo.reactivate.mockResolvedValueOnce({
      ...sampleEmployeeDetail,
      status: 'ACTIVE',
      disabledAt: null,
    });

    const useCase = new ReactivateEmployeeUseCase(mockEmployeeRepo, mockAuditRepo);
    const result = await useCase.execute({
      id: targetEmployeeId,
      actorUserId: adminUserId,
    });

    expect(result.status).toBe('ACTIVE');
    expect(result.disabledAt).toBeNull();
    expect(mockAuditRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EMPLOYEE_REACTIVATED',
        actorUserId: adminUserId,
        resourceId: targetEmployeeId,
      }),
    );
  });

  // ADMIN-10: Role modification updates permissions immediately and records audit
  it('ADMIN-10: updates employee roles with validation and logs audit', async () => {
    mockEmployeeRepo.findById.mockResolvedValueOnce(sampleEmployeeDetail);
    mockEmployeeRepo.updateRoles.mockResolvedValueOnce({
      ...sampleEmployeeDetail,
      roles: [RoleCode.MARKETING_EDITOR, RoleCode.MARKETING_APPROVER],
    });

    const useCase = new UpdateEmployeeRolesUseCase(mockEmployeeRepo, mockAuditRepo);
    const updated = await useCase.execute({
      id: targetEmployeeId,
      roles: [RoleCode.MARKETING_EDITOR, RoleCode.MARKETING_APPROVER],
      actorUserId: adminUserId,
    });

    expect(updated.roles).toEqual([RoleCode.MARKETING_EDITOR, RoleCode.MARKETING_APPROVER]);
    expect(mockEmployeeRepo.updateRoles).toHaveBeenCalledWith(
      targetEmployeeId,
      [RoleCode.MARKETING_EDITOR, RoleCode.MARKETING_APPROVER],
      adminUserId,
    );
    expect(mockAuditRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EMPLOYEE_ROLES_UPDATED',
        actorUserId: adminUserId,
      }),
    );
  });

  // ADMIN-11: Self-demotion from ADMIN role is rejected (403/409)
  it('ADMIN-11: rejects self-role modification with SelfRoleModificationError', async () => {
    const useCase = new UpdateEmployeeRolesUseCase(mockEmployeeRepo, mockAuditRepo);

    await expect(
      useCase.execute({
        id: adminUserId,
        roles: [RoleCode.VIEWER],
        actorUserId: adminUserId,
      }),
    ).rejects.toThrow(SelfRoleModificationError);
  });

  // ADMIN-12: Self-suspension is rejected (403)
  it('ADMIN-12: rejects self-suspension with SelfSuspensionError', async () => {
    const useCase = new SuspendEmployeeUseCase(mockEmployeeRepo, mockSessionRepo, mockAuditRepo);

    await expect(
      useCase.execute({
        id: adminUserId,
        actorUserId: adminUserId,
      }),
    ).rejects.toThrow(SelfSuspensionError);
  });

  // ADMIN-13: Last active administrator cannot be demoted (409)
  it('ADMIN-13: prevents demoting the last active administrator with LastActiveAdminError', async () => {
    const adminTarget: EmployeeDetail = {
      ...sampleEmployeeDetail,
      id: secondAdminId,
      roles: [RoleCode.ADMIN],
    };

    mockEmployeeRepo.findById.mockResolvedValueOnce(adminTarget);
    mockEmployeeRepo.countActiveAdmins.mockResolvedValueOnce(1); // Only 1 active admin exists!

    const useCase = new UpdateEmployeeRolesUseCase(mockEmployeeRepo, mockAuditRepo);

    await expect(
      useCase.execute({
        id: secondAdminId,
        roles: [RoleCode.MARKETING_EDITOR], // Demotion away from ADMIN
        actorUserId: adminUserId,
      }),
    ).rejects.toThrow(LastActiveAdminError);
  });

  // ADMIN-14: Last active administrator cannot be suspended (409)
  it('ADMIN-14: prevents suspending the last active administrator with LastActiveAdminError', async () => {
    const adminTarget: EmployeeDetail = {
      ...sampleEmployeeDetail,
      id: secondAdminId,
      roles: [RoleCode.ADMIN],
    };

    mockEmployeeRepo.findById.mockResolvedValueOnce(adminTarget);
    mockEmployeeRepo.countActiveAdmins.mockResolvedValueOnce(1); // Only 1 active admin exists!

    const useCase = new SuspendEmployeeUseCase(mockEmployeeRepo, mockSessionRepo, mockAuditRepo);

    await expect(
      useCase.execute({
        id: secondAdminId,
        actorUserId: adminUserId,
      }),
    ).rejects.toThrow(LastActiveAdminError);
  });

  // ADMIN-15: Onboarding creates employee and generates cryptographically secure invitation token
  it('ADMIN-15: creates employee and returns one-time onboarding token with 7-day expiration', async () => {
    mockEmployeeRepo.existsByDisplayName.mockResolvedValueOnce(false);
    mockEmployeeRepo.create.mockResolvedValueOnce(sampleEmployeeDetail);
    mockInvitationRepo.create.mockImplementationOnce((input: CreateInvitationInput) =>
      Promise.resolve({
        id: 'inv-123',
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        claimedAt: null,
        createdById: input.createdById ?? null,
        createdAt: new Date(),
      }),
    );

    const useCase = new CreateEmployeeUseCase(mockEmployeeRepo, mockInvitationRepo, mockAuditRepo);
    const result = await useCase.execute({
      displayName: 'Aurelie Moreau',
      roles: [RoleCode.MARKETING_EDITOR],
      actorUserId: adminUserId,
    });

    expect(result.employee.displayName).toBe('Aurelie Moreau');
    expect(result.rawOnboardingToken).toBeDefined();
    expect(result.rawOnboardingToken.length).toBe(64); // 32 bytes hex = 64 characters
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 86400 * 1000);
    expect(mockAuditRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EMPLOYEE_CREATED',
        actorUserId: adminUserId,
      }),
    );
  });

  // ADMIN-16: Invitation token hash is stored (SHA-256), plaintext never persisted
  it('ADMIN-16: persists only SHA-256 hash of onboarding token, never the plaintext token', async () => {
    mockEmployeeRepo.existsByDisplayName.mockResolvedValueOnce(false);
    mockEmployeeRepo.create.mockResolvedValueOnce(sampleEmployeeDetail);

    let persistedTokenHash: string | null = null;
    mockInvitationRepo.create.mockImplementationOnce((input: CreateInvitationInput) => {
      persistedTokenHash = input.tokenHash;
      return Promise.resolve({
        id: 'inv-456',
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        claimedAt: null,
        createdById: input.createdById ?? null,
        createdAt: new Date(),
      });
    });

    const useCase = new CreateEmployeeUseCase(mockEmployeeRepo, mockInvitationRepo, mockAuditRepo);
    const result = await useCase.execute({
      displayName: 'Claire Laurent',
      roles: [RoleCode.VIEWER],
      actorUserId: adminUserId,
    });

    expect(persistedTokenHash).not.toBeNull();
    expect(persistedTokenHash).not.toBe(result.rawOnboardingToken);
    expect(persistedTokenHash).toHaveLength(64);
  });

  // ADMIN-17: Invitation claiming sets initial password (Argon2id) and marks invitation claimed
  it('ADMIN-17: claiming invitation hashes password with Argon2id, activates credential, and marks token claimed', async () => {
    const validInvitation: EmployeeInvitationRecord = {
      id: 'inv-789',
      userId: targetEmployeeId,
      tokenHash: 'token-sha256-hash',
      expiresAt: new Date(Date.now() + 1000 * 3600),
      claimedAt: null,
      createdById: adminUserId,
      createdAt: new Date(),
    };

    mockInvitationRepo.findByTokenHash.mockResolvedValueOnce(validInvitation);
    mockAccountRepo.findById.mockResolvedValueOnce({
      id: targetEmployeeId,
      displayName: 'Aurelie Moreau',
      status: 'ACTIVE',
      disabledAt: null,
      roles: [RoleCode.MARKETING_EDITOR],
      permissions: [],
      passwordCredential: null,
    });

    const useCase = new ClaimOnboardingInvitationUseCase(
      mockInvitationRepo,
      mockAccountRepo,
      mockCredentialRepo,
      mockHasher,
      mockAuditRepo,
    );

    const result = await useCase.execute({
      token: 'raw-token-1234567890abcdef',
      password: 'StrongPassword#2026',
    });

    expect(result.success).toBe(true);
    expect(result.userId).toBe(targetEmployeeId);
    expect(mockHasher.hash).toHaveBeenCalledWith('StrongPassword#2026');
    expect(mockCredentialRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: targetEmployeeId,
        passwordHash: 'mock-argon2-hash',
      }),
    );
    expect(mockInvitationRepo.markClaimed).toHaveBeenCalledWith('inv-789', expect.any(Date));
  });

  // ADMIN-18: Expired or claimed invitation tokens are rejected
  it('ADMIN-18: rejects already claimed or expired invitation tokens with InvalidInvitationTokenError', async () => {
    // 1. Already claimed token
    mockInvitationRepo.findByTokenHash.mockResolvedValueOnce({
      id: 'inv-claimed',
      userId: targetEmployeeId,
      tokenHash: 'claimed-hash',
      expiresAt: new Date(Date.now() + 1000 * 3600),
      claimedAt: new Date('2026-01-01'), // Already claimed!
      createdById: adminUserId,
      createdAt: new Date(),
    });

    const useCase = new ClaimOnboardingInvitationUseCase(
      mockInvitationRepo,
      mockAccountRepo,
      mockCredentialRepo,
      mockHasher,
      mockAuditRepo,
    );

    await expect(
      useCase.execute({
        token: 'claimed-token-test-123456',
        password: 'ValidPassword#2026',
      }),
    ).rejects.toThrow(InvalidInvitationTokenError);

    // 2. Expired token
    mockInvitationRepo.findByTokenHash.mockResolvedValueOnce({
      id: 'inv-expired',
      userId: targetEmployeeId,
      tokenHash: 'expired-hash',
      expiresAt: new Date(Date.now() - 1000 * 3600), // Expired!
      claimedAt: null,
      createdById: adminUserId,
      createdAt: new Date(),
    });

    await expect(
      useCase.execute({
        token: 'expired-token-test-123456',
        password: 'ValidPassword#2026',
      }),
    ).rejects.toThrow(InvalidInvitationTokenError);
  });

  // ADMIN-19: System settings workspace reads and updates organization/workflow/notification settings
  it('ADMIN-19: reads system settings overview and updates settings with audit log', async () => {
    const existingSettings: SystemSettingRecord[] = [
      {
        id: 'set-001',
        key: 'ORGANIZATION_PROFILE',
        category: 'ORGANIZATION',
        value: { name: 'Maison Parisienne', timezone: 'Europe/Paris' },
        description: 'Brand identity defaults',
        updatedById: adminUserId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    mockSettingRepo.findAll.mockResolvedValueOnce(existingSettings);

    const getUseCase = new GetSystemSettingsUseCase(mockSettingRepo);
    const overview = await getUseCase.execute();

    expect(overview.organization.name).toBe('Maison Parisienne');
    expect(overview.workflow).toBeDefined();
    expect(overview.notifications).toBeDefined();

    mockSettingRepo.upsert.mockResolvedValueOnce({
      id: 'set-002',
      key: 'WORKFLOW_POLICIES',
      category: 'WORKFLOW',
      value: { sessionTtlHours: 12 },
      description: 'Session timeout rules',
      updatedById: adminUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const updateUseCase = new UpdateSystemSettingsUseCase(mockSettingRepo, mockAuditRepo);
    const updated = await updateUseCase.execute({
      key: 'WORKFLOW_POLICIES',
      value: { sessionTtlHours: 12 },
      actorUserId: adminUserId,
    });

    expect(updated.key).toBe('WORKFLOW_POLICIES');
    expect(mockAuditRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SYSTEM_SETTING_UPDATED',
        actorUserId: adminUserId,
      }),
    );
  });

  // ADMIN-20: Administrative audit logs every mutation with actor ID and timestamp
  it('ADMIN-20: lists paginated administrative audit logs with filtering and actor display name', async () => {
    mockAuditRepo.findPaginated.mockResolvedValueOnce({
      items: [
        {
          id: 'aud-001',
          actorUserId: adminUserId,
          actorDisplayName: 'Super Admin',
          action: 'EMPLOYEE_SUSPENDED',
          resourceType: 'USER',
          resourceId: targetEmployeeId,
          metadata: { reason: 'Security check' },
          createdAt: new Date('2026-02-01T14:00:00Z'),
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    const useCase = new ListAdminAuditLogsUseCase(mockAuditRepo);
    const result = await useCase.execute({
      action: 'EMPLOYEE_SUSPENDED',
      page: 1,
      limit: 20,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.action).toBe('EMPLOYEE_SUSPENDED');
    expect(result.items[0]!.actorDisplayName).toBe('Super Admin');
    expect(mockAuditRepo.findPaginated).toHaveBeenCalledWith({
      action: 'EMPLOYEE_SUSPENDED',
      page: 1,
      limit: 20,
    });
  });
});
