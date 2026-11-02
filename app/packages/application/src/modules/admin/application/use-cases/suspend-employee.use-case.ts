import { Inject, Injectable } from '@nestjs/common';
import {
  USER_SESSION_REPOSITORY,
  type UserSessionRepository,
} from '../../../auth/application/user-session.repository.js';
import {
  EmployeeNotFoundError,
  LastActiveAdminError,
  SelfSuspensionError,
} from '../../domain/admin-errors.js';
import { type EmployeeDetail } from '../../domain/employee.types.js';
import {
  ADMIN_AUDIT_REPOSITORY,
  type AdminAuditRepository,
} from '../ports/admin-audit.repository.js';
import { EMPLOYEE_REPOSITORY, type EmployeeRepository } from '../ports/employee.repository.js';

export interface SuspendEmployeeRequest {
  readonly id: string;
  readonly actorUserId: string;
  readonly reason?: string | undefined;
}

@Injectable()
export class SuspendEmployeeUseCase {
  public constructor(
    @Inject(EMPLOYEE_REPOSITORY)
    private readonly employeeRepo: EmployeeRepository,
    @Inject(USER_SESSION_REPOSITORY)
    private readonly sessionRepo: UserSessionRepository,
    @Inject(ADMIN_AUDIT_REPOSITORY)
    private readonly auditRepo: AdminAuditRepository,
  ) {}

  public async execute(request: SuspendEmployeeRequest): Promise<EmployeeDetail> {
    // 1. Prevent self-suspension
    if (request.actorUserId === request.id) {
      throw new SelfSuspensionError();
    }

    const target = await this.employeeRepo.findById(request.id);
    if (!target) {
      throw new EmployeeNotFoundError(request.id);
    }

    if (target.status === 'DISABLED') {
      return target;
    }

    // 2. Last active administrator protection
    if (target.roles.includes('ADMIN')) {
      const activeAdminsCount = await this.employeeRepo.countActiveAdmins();
      if (activeAdminsCount <= 1) {
        throw new LastActiveAdminError();
      }
    }

    // 3. Mark account suspended in database
    const suspended = await this.employeeRepo.suspend(request.id, request.actorUserId);

    // 4. Invalidate all active user sessions immediately
    const revokedCount = await this.sessionRepo.revokeAllForUser(request.id, new Date());

    // 5. Audit trail
    await this.auditRepo.record({
      actorUserId: request.actorUserId,
      action: 'EMPLOYEE_SUSPENDED',
      resourceType: 'User',
      resourceId: request.id,
      metadata: {
        reason: request.reason ?? 'Administrative action',
        revokedSessionsCount: revokedCount,
      },
    });

    return suspended;
  }
}
