import { Inject, Injectable } from '@nestjs/common';
import {
  USER_SESSION_REPOSITORY,
  type UserSessionRepository,
} from '../../../auth/application/user-session.repository.js';
import { EmployeeNotFoundError } from '../../domain/admin-errors.js';
import {
  ADMIN_AUDIT_REPOSITORY,
  type AdminAuditRepository,
} from '../ports/admin-audit.repository.js';
import { EMPLOYEE_REPOSITORY, type EmployeeRepository } from '../ports/employee.repository.js';

export interface RevokeEmployeeSessionsRequest {
  readonly userId: string;
  readonly sessionId?: string | undefined;
  readonly actorUserId: string;
}

export interface RevokeEmployeeSessionsResult {
  readonly revokedCount: number;
}

@Injectable()
export class RevokeEmployeeSessionsUseCase {
  public constructor(
    @Inject(EMPLOYEE_REPOSITORY)
    private readonly employeeRepo: EmployeeRepository,
    @Inject(USER_SESSION_REPOSITORY)
    private readonly sessionRepo: UserSessionRepository,
    @Inject(ADMIN_AUDIT_REPOSITORY)
    private readonly auditRepo: AdminAuditRepository,
  ) {}

  public async execute(
    request: RevokeEmployeeSessionsRequest,
  ): Promise<RevokeEmployeeSessionsResult> {
    const employee = await this.employeeRepo.findById(request.userId);
    if (!employee) {
      throw new EmployeeNotFoundError(request.userId);
    }

    const now = new Date();
    let count: number;

    if (request.sessionId) {
      const revoked = await this.sessionRepo.revoke(request.sessionId, now);
      count = revoked ? 1 : 0;
    } else {
      count = await this.sessionRepo.revokeAllForUser(request.userId, now);
    }

    await this.auditRepo.record({
      actorUserId: request.actorUserId,
      action: request.sessionId ? 'EMPLOYEE_SESSION_REVOKED' : 'EMPLOYEE_ALL_SESSIONS_REVOKED',
      resourceType: 'UserSession',
      resourceId: request.userId,
      metadata: {
        targetUserId: request.userId,
        targetSessionId: request.sessionId ?? null,
        revokedCount: count,
      },
    });

    return { revokedCount: count };
  }
}
