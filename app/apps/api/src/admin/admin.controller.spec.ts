/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import {
  CreateEmployeeUseCase,
  CreateOnboardingTokenUseCase,
  GetEmployeeDetailUseCase,
  GetSystemSettingsUseCase,
  ListAdminAuditLogsUseCase,
  ListEmployeeSessionsUseCase,
  ListEmployeesUseCase,
  ReactivateEmployeeUseCase,
  RevokeEmployeeSessionsUseCase,
  SuspendEmployeeUseCase,
  UpdateEmployeeProfileUseCase,
  UpdateEmployeeRolesUseCase,
  UpdateSystemSettingsUseCase,
  type CreateEmployeeResult,
  type EmployeeDetail,
  type EmployeeSummary,
  type PaginatedResult,
  RoleCode,
  type SafeUserSession,
  type SanitizedEmployeeDto,
  type SystemSettingsOverview,
} from '@parisian-shopper/application';
import { AdminController } from './admin.controller.js';

describe('AdminController', () => {
  let controller: AdminController;

  let mockListEmployeesUseCase: jest.Mocked<ListEmployeesUseCase>;
  let mockGetEmployeeDetailUseCase: jest.Mocked<GetEmployeeDetailUseCase>;
  let mockCreateEmployeeUseCase: jest.Mocked<CreateEmployeeUseCase>;
  let mockUpdateEmployeeProfileUseCase: jest.Mocked<UpdateEmployeeProfileUseCase>;
  let mockUpdateEmployeeRolesUseCase: jest.Mocked<UpdateEmployeeRolesUseCase>;
  let mockSuspendEmployeeUseCase: jest.Mocked<SuspendEmployeeUseCase>;
  let mockReactivateEmployeeUseCase: jest.Mocked<ReactivateEmployeeUseCase>;
  let mockListEmployeeSessionsUseCase: jest.Mocked<ListEmployeeSessionsUseCase>;
  let mockRevokeEmployeeSessionsUseCase: jest.Mocked<RevokeEmployeeSessionsUseCase>;
  let mockCreateOnboardingTokenUseCase: jest.Mocked<CreateOnboardingTokenUseCase>;
  let mockGetSystemSettingsUseCase: jest.Mocked<GetSystemSettingsUseCase>;
  let mockUpdateSystemSettingsUseCase: jest.Mocked<UpdateSystemSettingsUseCase>;
  let mockListAdminAuditLogsUseCase: jest.Mocked<ListAdminAuditLogsUseCase>;

  const mockAdminUser: SanitizedEmployeeDto = {
    id: 'admin-uuid-111',
    displayName: 'Thna Chan',
    roles: [RoleCode.ADMIN],
    status: 'ACTIVE',
    permissions: ['ADMIN'] as any,
  };

  const sampleEmployeeDetail: EmployeeDetail = {
    id: 'emp-uuid-222',
    displayName: 'Aurelie Moreau',
    status: 'ACTIVE',
    roles: [RoleCode.MARKETING_EDITOR],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    disabledAt: null,
    hasPassword: true,
    telegram: null,
    activeSessionsCount: 1,
    recentActivity: { lastActiveAt: new Date() },
  };

  beforeEach(() => {
    mockListEmployeesUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ListEmployeesUseCase>;
    mockGetEmployeeDetailUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetEmployeeDetailUseCase>;
    mockCreateEmployeeUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CreateEmployeeUseCase>;
    mockUpdateEmployeeProfileUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<UpdateEmployeeProfileUseCase>;
    mockUpdateEmployeeRolesUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<UpdateEmployeeRolesUseCase>;
    mockSuspendEmployeeUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<SuspendEmployeeUseCase>;
    mockReactivateEmployeeUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ReactivateEmployeeUseCase>;
    mockListEmployeeSessionsUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ListEmployeeSessionsUseCase>;
    mockRevokeEmployeeSessionsUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<RevokeEmployeeSessionsUseCase>;
    mockCreateOnboardingTokenUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CreateOnboardingTokenUseCase>;
    mockGetSystemSettingsUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetSystemSettingsUseCase>;
    mockUpdateSystemSettingsUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<UpdateSystemSettingsUseCase>;
    mockListAdminAuditLogsUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ListAdminAuditLogsUseCase>;

    controller = new AdminController(
      mockListEmployeesUseCase,
      mockGetEmployeeDetailUseCase,
      mockCreateEmployeeUseCase,
      mockUpdateEmployeeProfileUseCase,
      mockUpdateEmployeeRolesUseCase,
      mockSuspendEmployeeUseCase,
      mockReactivateEmployeeUseCase,
      mockListEmployeeSessionsUseCase,
      mockRevokeEmployeeSessionsUseCase,
      mockCreateOnboardingTokenUseCase,
      mockGetSystemSettingsUseCase,
      mockUpdateSystemSettingsUseCase,
      mockListAdminAuditLogsUseCase,
    );
  });

  describe('listEmployees', () => {
    it('delegates query to ListEmployeesUseCase', async () => {
      const mockResult: PaginatedResult<EmployeeSummary> = {
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      };
      mockListEmployeesUseCase.execute.mockResolvedValueOnce(mockResult);

      const result = await controller.listEmployees({ search: 'Aurelie', page: 1, limit: 20 });
      expect(result).toBe(mockResult);
      expect(mockListEmployeesUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'Aurelie', page: 1, limit: 20 }),
      );
    });
  });

  describe('createEmployee', () => {
    it('creates employee and returns details with raw onboarding token', async () => {
      const mockResult: CreateEmployeeResult = {
        employee: sampleEmployeeDetail,
        rawOnboardingToken: 'token-64-hex',
        expiresAt: new Date(),
      };
      mockCreateEmployeeUseCase.execute.mockResolvedValueOnce(mockResult);

      const result = await controller.createEmployee(
        { displayName: 'Aurelie Moreau', roles: [RoleCode.MARKETING_EDITOR] },
        mockAdminUser,
      );

      expect(result).toBe(mockResult);
      expect(mockCreateEmployeeUseCase.execute).toHaveBeenCalledWith({
        displayName: 'Aurelie Moreau',
        roles: [RoleCode.MARKETING_EDITOR],
        actorUserId: mockAdminUser.id,
      });
    });
  });

  describe('getEmployeeDetail', () => {
    it('fetches employee detail by id', async () => {
      mockGetEmployeeDetailUseCase.execute.mockResolvedValueOnce(sampleEmployeeDetail);

      const result = await controller.getEmployeeDetail('emp-uuid-222');
      expect(result).toBe(sampleEmployeeDetail);
      expect(mockGetEmployeeDetailUseCase.execute).toHaveBeenCalledWith('emp-uuid-222');
    });
  });

  describe('updateEmployeeRoles', () => {
    it('updates employee roles with actor id', async () => {
      const updated = { ...sampleEmployeeDetail, roles: [RoleCode.MARKETING_APPROVER] };
      mockUpdateEmployeeRolesUseCase.execute.mockResolvedValueOnce(updated);

      const result = await controller.updateEmployeeRoles(
        'emp-uuid-222',
        { roles: [RoleCode.MARKETING_APPROVER] },
        mockAdminUser,
      );

      expect(result.roles).toEqual([RoleCode.MARKETING_APPROVER]);
      expect(mockUpdateEmployeeRolesUseCase.execute).toHaveBeenCalledWith({
        id: 'emp-uuid-222',
        roles: [RoleCode.MARKETING_APPROVER],
        actorUserId: mockAdminUser.id,
      });
    });
  });

  describe('suspendEmployee', () => {
    it('suspends employee and passes reason and actor id', async () => {
      const suspended = { ...sampleEmployeeDetail, status: 'DISABLED' as const };
      mockSuspendEmployeeUseCase.execute.mockResolvedValueOnce(suspended);

      const result = await controller.suspendEmployee(
        'emp-uuid-222',
        { reason: 'Security check' },
        mockAdminUser,
      );

      expect(result.status).toBe('DISABLED');
      expect(mockSuspendEmployeeUseCase.execute).toHaveBeenCalledWith({
        id: 'emp-uuid-222',
        reason: 'Security check',
        actorUserId: mockAdminUser.id,
      });
    });
  });

  describe('reactivateEmployee', () => {
    it('reactivates employee account', async () => {
      mockReactivateEmployeeUseCase.execute.mockResolvedValueOnce(sampleEmployeeDetail);

      const result = await controller.reactivateEmployee('emp-uuid-222', mockAdminUser);
      expect(result.status).toBe('ACTIVE');
      expect(mockReactivateEmployeeUseCase.execute).toHaveBeenCalledWith({
        id: 'emp-uuid-222',
        actorUserId: mockAdminUser.id,
      });
    });
  });

  describe('sessions', () => {
    it('lists employee safe sessions', async () => {
      const mockSessions: SafeUserSession[] = [];
      mockListEmployeeSessionsUseCase.execute.mockResolvedValueOnce(mockSessions);

      const result = await controller.getEmployeeSessions('emp-uuid-222');
      expect(result.sessions).toBe(mockSessions);
      expect(mockListEmployeeSessionsUseCase.execute).toHaveBeenCalledWith('emp-uuid-222');
    });

    it('revokes employee sessions', async () => {
      mockRevokeEmployeeSessionsUseCase.execute.mockResolvedValueOnce({ revokedCount: 2 });

      const result = await controller.revokeSessions('emp-uuid-222', {}, mockAdminUser);
      expect(result.revokedCount).toBe(2);
      expect(mockRevokeEmployeeSessionsUseCase.execute).toHaveBeenCalledWith({
        userId: 'emp-uuid-222',
        sessionId: undefined,
        actorUserId: mockAdminUser.id,
      });
    });
  });

  describe('onboarding token', () => {
    it('generates a new onboarding token', async () => {
      const tokenResult = { rawOnboardingToken: 'new-token-hex', expiresAt: new Date() };
      mockCreateOnboardingTokenUseCase.execute.mockResolvedValueOnce(tokenResult);

      const result = await controller.createOnboardingToken('emp-uuid-222', mockAdminUser);
      expect(result).toBe(tokenResult);
      expect(mockCreateOnboardingTokenUseCase.execute).toHaveBeenCalledWith({
        userId: 'emp-uuid-222',
        actorUserId: mockAdminUser.id,
      });
    });
  });

  describe('settings', () => {
    it('returns system settings overview', async () => {
      const overview: SystemSettingsOverview = {
        organization: {},
        workflow: {},
        notifications: {},
        aiBudgetSummary: { monthlyCeiling: 20, perRequestCeiling: 1, costControlUrl: '/analytics' },
        rawSettings: [],
      };
      mockGetSystemSettingsUseCase.execute.mockResolvedValueOnce(overview);

      const result = await controller.getSettings();
      expect(result).toBe(overview);
    });

    it('updates system setting', async () => {
      const settingRecord = {
        id: 's-1',
        key: 'ORGANIZATION_PROFILE',
        category: 'ORGANIZATION',
        value: { name: 'Maison' },
        description: null,
        updatedById: mockAdminUser.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockUpdateSystemSettingsUseCase.execute.mockResolvedValueOnce(settingRecord);

      const result = await controller.updateSetting(
        { key: 'ORGANIZATION_PROFILE', value: { name: 'Maison' } },
        mockAdminUser,
      );
      expect(result).toBe(settingRecord);
    });
  });

  describe('audit', () => {
    it('lists audit logs', async () => {
      const auditResult = { items: [], total: 0, page: 1, limit: 20, totalPages: 0 };
      mockListAdminAuditLogsUseCase.execute.mockResolvedValueOnce(auditResult);

      const result = await controller.listAudit({ action: 'SUSPEND', page: 1, limit: 20 });
      expect(result).toBe(auditResult);
    });
  });
});
