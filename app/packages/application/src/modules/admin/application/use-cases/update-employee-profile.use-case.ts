import { Inject, Injectable } from '@nestjs/common';
import { DuplicateLoginIdentifierError, EmployeeNotFoundError } from '../../domain/admin-errors.js';
import { type EmployeeDetail } from '../../domain/employee.types.js';
import {
  ADMIN_AUDIT_REPOSITORY,
  type AdminAuditRepository,
} from '../ports/admin-audit.repository.js';
import { EMPLOYEE_REPOSITORY, type EmployeeRepository } from '../ports/employee.repository.js';

export interface UpdateEmployeeProfileRequest {
  readonly id: string;
  readonly displayName: string;
  readonly actorUserId?: string | null;
}

@Injectable()
export class UpdateEmployeeProfileUseCase {
  public constructor(
    @Inject(EMPLOYEE_REPOSITORY)
    private readonly employeeRepo: EmployeeRepository,
    @Inject(ADMIN_AUDIT_REPOSITORY)
    private readonly auditRepo: AdminAuditRepository,
  ) {}

  public async execute(request: UpdateEmployeeProfileRequest): Promise<EmployeeDetail> {
    const trimmed = request.displayName?.trim();
    if (!trimmed) {
      throw new DuplicateLoginIdentifierError('');
    }

    const existing = await this.employeeRepo.findById(request.id);
    if (!existing) {
      throw new EmployeeNotFoundError(request.id);
    }

    // Check duplicate if name is changing
    if (existing.displayName.toLowerCase() !== trimmed.toLowerCase()) {
      const duplicate = await this.employeeRepo.existsByDisplayName(trimmed, request.id);
      if (duplicate) {
        throw new DuplicateLoginIdentifierError(trimmed);
      }
    }

    const updated = await this.employeeRepo.updateDisplayName(request.id, trimmed);

    await this.auditRepo.record({
      actorUserId: request.actorUserId ?? null,
      action: 'EMPLOYEE_PROFILE_UPDATED',
      resourceType: 'User',
      resourceId: request.id,
      metadata: {
        previousDisplayName: existing.displayName,
        newDisplayName: trimmed,
      },
    });

    return updated;
  }
}
