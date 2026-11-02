import {
  type AuditEventRecord,
  type AuditListQuery,
  type PaginatedResult,
} from '../../domain/employee.types.js';

export const ADMIN_AUDIT_REPOSITORY = Symbol('ADMIN_AUDIT_REPOSITORY');

export interface RecordAuditEventInput {
  readonly actorUserId?: string | null;
  readonly action: string;
  readonly resourceType?: string | null;
  readonly resourceId?: string | null;
  readonly metadata?: Record<string, unknown> | null;
}

export interface AdminAuditRepository {
  record(input: RecordAuditEventInput): Promise<AuditEventRecord>;
  findPaginated(query: AuditListQuery): Promise<PaginatedResult<AuditEventRecord>>;
}
