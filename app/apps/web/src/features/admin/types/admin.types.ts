import type { RoleCode } from '../../../types/auth.types.js';

export type EmployeeStatus = 'ACTIVE' | 'DISABLED';

export interface EmployeeSummary {
  readonly id: string;
  readonly displayName: string;
  readonly status: EmployeeStatus;
  readonly roles: readonly RoleCode[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly disabledAt: string | null;
  readonly telegramUsername: string | null;
  readonly activeSessionsCount: number;
}

export interface TelegramIdentitySummary {
  readonly id: string;
  readonly telegramUserId: string;
  readonly maskedTelegramUserId: string;
  readonly telegramUsername: string | null;
  readonly displayName: string | null;
  readonly lastSeenAt: string | null;
  readonly disabledAt: string | null;
}

export interface EmployeeDetail {
  readonly id: string;
  readonly displayName: string;
  readonly status: EmployeeStatus;
  readonly roles: readonly RoleCode[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly disabledAt: string | null;
  readonly hasPassword: boolean;
  readonly telegram: TelegramIdentitySummary | null;
  readonly activeSessionsCount: number;
  readonly recentActivity: {
    readonly lastActiveAt: string | null;
  };
}

export interface SafeUserSession {
  readonly id: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly createdAt: string;
  readonly lastActiveAt: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
  readonly isActive: boolean;
}

export interface SystemSettingRecord {
  readonly id: string;
  readonly key: string;
  readonly category: string;
  readonly value: Record<string, unknown>;
  readonly description: string | null;
  readonly updatedById: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SystemSettingsOverview {
  readonly organization: Record<string, unknown>;
  readonly workflow: Record<string, unknown>;
  readonly notifications: Record<string, unknown>;
  readonly aiBudgetSummary: {
    readonly monthlyCeiling: number;
    readonly perRequestCeiling: number;
    readonly costControlUrl: string;
  };
  readonly rawSettings: readonly SystemSettingRecord[];
}

export interface AuditEventRecord {
  readonly id: string;
  readonly actorUserId: string | null;
  readonly actorDisplayName: string | null;
  readonly action: string;
  readonly resourceType: string | null;
  readonly resourceId: string | null;
  readonly metadata: Record<string, unknown> | null;
  readonly createdAt: string;
}

export interface PaginatedResult<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
}

export interface EmployeeListQuery {
  readonly search?: string;
  readonly role?: RoleCode;
  readonly status?: EmployeeStatus;
  readonly page?: number;
  readonly limit?: number;
}

export interface AuditListQuery {
  readonly actorUserId?: string;
  readonly action?: string;
  readonly resourceType?: string;
  readonly fromDate?: string;
  readonly toDate?: string;
  readonly page?: number;
  readonly limit?: number;
}

export interface CreateEmployeeInput {
  readonly displayName: string;
  readonly roles: readonly RoleCode[];
}

export interface CreateEmployeeResult {
  readonly employee: EmployeeDetail;
  readonly rawOnboardingToken: string;
  readonly expiresAt: string;
}

export interface UpdateEmployeeProfileInput {
  readonly displayName: string;
}

export interface UpdateEmployeeRolesInput {
  readonly roles: readonly RoleCode[];
}

export interface SuspendEmployeeInput {
  readonly reason?: string;
}

export interface UpdateSystemSettingInput {
  readonly key: string;
  readonly value: Record<string, unknown>;
  readonly category?: string;
  readonly description?: string;
}

export interface ClaimInvitationInput {
  readonly token: string;
  readonly password: string;
}

export interface ClaimInvitationResult {
  readonly success: boolean;
  readonly userId: string;
  readonly displayName: string;
}
