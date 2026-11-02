import { Inject, Injectable } from '@nestjs/common';
import { EmployeeNotFoundError } from '../../domain/admin-errors.js';
import { type EmployeeDetail } from '../../domain/employee.types.js';
import {
  ADMIN_AUDIT_REPOSITORY,
  type AdminAuditRepository,
} from '../ports/admin-audit.repository.js';
import { EMPLOYEE_REPOSITORY, type EmployeeRepository } from '../ports/employee.repository.js';

export interface ReactivateEmployeeRequest {
  readonly id: string;
  readonly actorUserId: string;
}

@Injectable()
export class ReactivateEmployeeUseCase {
  public constructor(
    @Inject(EMPLOYEE_REPOSITORY)
    private readonly employeeRepo: EmployeeRepository,
    @Inject(ADMIN_AUDIT_REPOSITORY)
    private readonly auditRepo: AdminAuditRepository,
  ) {}

  public async execute(request: ReactivateEmployeeRequest): Promise<EmployeeDetail> {
    const target = await this.employeeRepo.findById(request.id);
    if (!target) {
      throw new EmployeeNotFoundError(request.id);
    }

    if (target.status === 'ACTIVE') {
      return target;
    }

    const reactivated = await this.employeeRepo.reactivate(request.id, request.actorUserId);

    await this.auditRepo.record({
      actorUserId: request.actorUserId,
      action: 'EMPLOYEE_REACTIVATED',
      resourceType: 'User',
      resourceId: request.id,
      metadata: {
        displayName: reactivated.displayName,
      },
    });

    return reactivated;
  }
}
