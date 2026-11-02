import { apiClient } from '../../../services/api/api-client.js';
import type {
  AuditEventRecord,
  AuditListQuery,
  ClaimInvitationInput,
  ClaimInvitationResult,
  CreateEmployeeInput,
  CreateEmployeeResult,
  EmployeeDetail,
  EmployeeListQuery,
  EmployeeSummary,
  PaginatedResult,
  SafeUserSession,
  SuspendEmployeeInput,
  SystemSettingsOverview,
  SystemSettingRecord,
  UpdateEmployeeProfileInput,
  UpdateEmployeeRolesInput,
  UpdateSystemSettingInput,
} from '../types/admin.types.js';

function buildEmployeeQuery(params?: EmployeeListQuery): string {
  if (!params) return '';
  const searchParams = new URLSearchParams();
  if (params.search) searchParams.set('search', params.search);
  if (params.role) searchParams.set('role', params.role);
  if (params.status) searchParams.set('status', params.status);
  if (params.page !== undefined) searchParams.set('page', String(params.page));
  if (params.limit !== undefined) searchParams.set('limit', String(params.limit));
  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

function buildAuditQuery(params?: AuditListQuery): string {
  if (!params) return '';
  const searchParams = new URLSearchParams();
  if (params.actorUserId) searchParams.set('actorUserId', params.actorUserId);
  if (params.action) searchParams.set('action', params.action);
  if (params.resourceType) searchParams.set('resourceType', params.resourceType);
  if (params.fromDate) searchParams.set('fromDate', params.fromDate);
  if (params.toDate) searchParams.set('toDate', params.toDate);
  if (params.page !== undefined) searchParams.set('page', String(params.page));
  if (params.limit !== undefined) searchParams.set('limit', String(params.limit));
  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

export const adminApi = {
  listEmployees: async (params?: EmployeeListQuery): Promise<PaginatedResult<EmployeeSummary>> => {
    return apiClient.get<PaginatedResult<EmployeeSummary>>(
      `/v1/admin/employees${buildEmployeeQuery(params)}`,
    );
  },

  getEmployeeDetail: async (id: string): Promise<EmployeeDetail> => {
    return apiClient.get<EmployeeDetail>(`/v1/admin/employees/${id}`);
  },

  createEmployee: async (input: CreateEmployeeInput): Promise<CreateEmployeeResult> => {
    return apiClient.post<CreateEmployeeResult>('/v1/admin/employees', input);
  },

  updateEmployeeProfile: async (
    id: string,
    input: UpdateEmployeeProfileInput,
  ): Promise<EmployeeDetail> => {
    return apiClient.patch<EmployeeDetail>(`/v1/admin/employees/${id}`, input);
  },

  updateEmployeeRoles: async (
    id: string,
    input: UpdateEmployeeRolesInput,
  ): Promise<EmployeeDetail> => {
    return apiClient.patch<EmployeeDetail>(`/v1/admin/employees/${id}/role`, input);
  },

  suspendEmployee: async (id: string, input?: SuspendEmployeeInput): Promise<EmployeeDetail> => {
    return apiClient.post<EmployeeDetail>(`/v1/admin/employees/${id}/suspend`, input ?? {});
  },

  reactivateEmployee: async (id: string): Promise<EmployeeDetail> => {
    return apiClient.post<EmployeeDetail>(`/v1/admin/employees/${id}/reactivate`, {});
  },

  getEmployeeSessions: async (id: string): Promise<{ sessions: readonly SafeUserSession[] }> => {
    return apiClient.get<{ sessions: readonly SafeUserSession[] }>(
      `/v1/admin/employees/${id}/sessions`,
    );
  },

  revokeSessions: async (id: string, sessionId?: string): Promise<{ revokedCount: number }> => {
    return apiClient.post<{ revokedCount: number }>(`/v1/admin/employees/${id}/revoke-sessions`, {
      sessionId,
    });
  },

  createOnboardingToken: async (
    id: string,
  ): Promise<{ rawOnboardingToken: string; expiresAt: string }> => {
    return apiClient.post<{ rawOnboardingToken: string; expiresAt: string }>(
      `/v1/admin/employees/${id}/onboarding-token`,
      {},
    );
  },

  getSettings: async (): Promise<SystemSettingsOverview> => {
    return apiClient.get<SystemSettingsOverview>('/v1/admin/settings');
  },

  updateSetting: async (input: UpdateSystemSettingInput): Promise<SystemSettingRecord> => {
    return apiClient.patch<SystemSettingRecord>('/v1/admin/settings', input);
  },

  listAudit: async (params?: AuditListQuery): Promise<PaginatedResult<AuditEventRecord>> => {
    return apiClient.get<PaginatedResult<AuditEventRecord>>(
      `/v1/admin/audit${buildAuditQuery(params)}`,
    );
  },

  claimOnboarding: async (input: ClaimInvitationInput): Promise<ClaimInvitationResult> => {
    return apiClient.post<ClaimInvitationResult>('/v1/auth/onboarding/claim', input);
  },
};
