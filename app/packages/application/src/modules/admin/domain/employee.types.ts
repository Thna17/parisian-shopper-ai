import { type RoleCode } from '../../auth/domain/permissions.js';

export type EmployeeStatus = 'ACTIVE' | 'DISABLED';

export interface EmployeeSummary {
  readonly id: string;
  readonly displayName: string;
  readonly status: EmployeeStatus;
  readonly roles: readonly RoleCode[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly disabledAt: Date | null;
  readonly telegramUsername: string | null;
  readonly activeSessionsCount: number;
}

export interface TelegramIdentitySummary {
  readonly id: string;
  readonly telegramUserId: string;
  readonly maskedTelegramUserId: string;
  readonly telegramUsername: string | null;
  readonly displayName: string | null;
  readonly lastSeenAt: Date | null;
  readonly disabledAt: Date | null;
}

export interface EmployeeDetail {
  readonly id: string;
  readonly displayName: string;
  readonly status: EmployeeStatus;
  readonly roles: readonly RoleCode[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly disabledAt: Date | null;
  readonly hasPassword: boolean;
  readonly telegram: TelegramIdentitySummary | null;
  readonly activeSessionsCount: number;
  readonly recentActivity: {
    readonly lastActiveAt: Date | null;
  };
}

export interface SafeUserSession {
  readonly id: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly createdAt: Date;
  readonly lastActiveAt: Date;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly isActive: boolean;
}

export interface EmployeeInvitationRecord {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly claimedAt: Date | null;
  readonly createdById: string | null;
  readonly createdAt: Date;
}

export interface SystemSettingRecord {
  readonly id: string;
  readonly key: string;
  readonly category: string;
  readonly value: Record<string, unknown>;
  readonly description: string | null;
  readonly updatedById: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AuditEventRecord {
  readonly id: string;
  readonly actorUserId: string | null;
  readonly actorDisplayName: string | null;
  readonly action: string;
  readonly resourceType: string | null;
  readonly resourceId: string | null;
  readonly metadata: Record<string, unknown> | null;
  readonly createdAt: Date;
}

export interface EmployeeListQuery {
  readonly search?: string | undefined;
  readonly role?: RoleCode | undefined;
  readonly status?: EmployeeStatus | undefined;
  readonly page?: number | undefined;
  readonly limit?: number | undefined;
}

export interface PaginatedResult<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
}

export interface AuditListQuery {
  readonly actorUserId?: string | undefined;
  readonly action?: string | undefined;
  readonly resourceType?: string | undefined;
  readonly fromDate?: Date | undefined;
  readonly toDate?: Date | undefined;
  readonly page?: number | undefined;
  readonly limit?: number | undefined;
}
