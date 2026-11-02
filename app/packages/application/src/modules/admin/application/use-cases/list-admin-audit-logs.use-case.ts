import { Inject, Injectable } from '@nestjs/common';
import {
  type AuditEventRecord,
  type AuditListQuery,
  type PaginatedResult,
} from '../../domain/employee.types.js';
import {
  ADMIN_AUDIT_REPOSITORY,
  type AdminAuditRepository,
} from '../ports/admin-audit.repository.js';

@Injectable()
export class ListAdminAuditLogsUseCase {
  public constructor(
    @Inject(ADMIN_AUDIT_REPOSITORY)
    private readonly auditRepo: AdminAuditRepository,
  ) {}

  public async execute(query: AuditListQuery): Promise<PaginatedResult<AuditEventRecord>> {
    return this.auditRepo.findPaginated(query);
  }
}
