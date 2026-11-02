import { Inject, Injectable } from '@nestjs/common';
import { isRoleCode, type RoleCode } from '../../../auth/domain/permissions.js';
import {
  EmployeeNotFoundError,
  InvalidRoleAssignmentError,
  LastActiveAdminError,
  SelfRoleModificationError,
} from '../../domain/admin-errors.js';
import { type EmployeeDetail } from '../../domain/employee.types.js';
import {
  ADMIN_AUDIT_REPOSITORY,
  type AdminAuditRepository,
} from '../ports/admin-audit.repository.js';
import { EMPLOYEE_REPOSITORY, type EmployeeRepository } from '../ports/employee.repository.js';

export interface UpdateEmployeeRolesRequest {
  readonly id: string;
  readonly roles: readonly RoleCode[];
  readonly actorUserId: string;
}

@Injectable()
export class UpdateEmployeeRolesUseCase {
  public constructor(
    @Inject(EMPLOYEE_REPOSITORY)
    private readonly employeeRepo: EmployeeRepository,
    @Inject(ADMIN_AUDIT_REPOSITORY)
    private readonly auditRepo: AdminAuditRepository,
  ) {}

  public async execute(request: UpdateEmployeeRolesRequest): Promise<EmployeeDetail> {
    // 1. Prevent self-modification of roles
    if (request.actorUserId === request.id) {
      throw new SelfRoleModificationError();
    }

    // 2. Validate role codes
    const invalidRoles = request.roles.filter((r) => !isRoleCode(r));
    if (invalidRoles.length > 0) {
      throw new InvalidRoleAssignmentError(invalidRoles);
    }

    const target = await this.employeeRepo.findById(request.id);
    if (!target) {
      throw new EmployeeNotFoundError(request.id);
    }

    const currentHasAdmin = target.roles.includes('ADMIN');
    const newHasAdmin = request.roles.includes('ADMIN');

    // 3. Last active administrator protection
    if (currentHasAdmin && !newHasAdmin && target.status === 'ACTIVE') {
      const activeAdminsCount = await this.employeeRepo.countActiveAdmins();
      if (activeAdminsCount <= 1) {
        throw new LastActiveAdminError();
      }
    }

    const updated = await this.employeeRepo.updateRoles(
      request.id,
      request.roles,
      request.actorUserId,
    );

    // 4. Audit trail
    await this.auditRepo.record({
      actorUserId: request.actorUserId,
      action: 'EMPLOYEE_ROLES_UPDATED',
      resourceType: 'User',
      resourceId: request.id,
      metadata: {
        previousRoles: target.roles,
        newRoles: request.roles,
      },
    });

    return updated;
  }
}
