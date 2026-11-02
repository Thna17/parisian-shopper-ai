import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { isRoleCode, type RoleCode } from '../../../auth/domain/permissions.js';
import {
  DuplicateLoginIdentifierError,
  InvalidRoleAssignmentError,
} from '../../domain/admin-errors.js';
import { type EmployeeDetail } from '../../domain/employee.types.js';
import {
  ADMIN_AUDIT_REPOSITORY,
  type AdminAuditRepository,
} from '../ports/admin-audit.repository.js';
import {
  EMPLOYEE_INVITATION_REPOSITORY,
  type EmployeeInvitationRepository,
} from '../ports/employee-invitation.repository.js';
import { EMPLOYEE_REPOSITORY, type EmployeeRepository } from '../ports/employee.repository.js';

export interface CreateEmployeeRequest {
  readonly displayName: string;
  readonly roles: readonly RoleCode[];
  readonly actorUserId?: string | null | undefined;
}

export interface CreateEmployeeResult {
  readonly employee: EmployeeDetail;
  readonly rawOnboardingToken: string;
  readonly expiresAt: Date;
}

const INVITATION_EXPIRATION_DAYS = 7;

@Injectable()
export class CreateEmployeeUseCase {
  public constructor(
    @Inject(EMPLOYEE_REPOSITORY)
    private readonly employeeRepo: EmployeeRepository,
    @Inject(EMPLOYEE_INVITATION_REPOSITORY)
    private readonly invitationRepo: EmployeeInvitationRepository,
    @Inject(ADMIN_AUDIT_REPOSITORY)
    private readonly auditRepo: AdminAuditRepository,
  ) {}

  public async execute(request: CreateEmployeeRequest): Promise<CreateEmployeeResult> {
    const trimmedName = request.displayName?.trim();
    if (!trimmedName) {
      throw new DuplicateLoginIdentifierError('');
    }

    // Validate role codes
    const invalidRoles = request.roles.filter((r) => !isRoleCode(r));
    if (invalidRoles.length > 0) {
      throw new InvalidRoleAssignmentError(invalidRoles);
    }

    // Ensure display name is unique
    const exists = await this.employeeRepo.existsByDisplayName(trimmedName);
    if (exists) {
      throw new DuplicateLoginIdentifierError(trimmedName);
    }

    // Default to VIEWER if empty
    const rolesToAssign = request.roles.length > 0 ? request.roles : (['VIEWER'] as RoleCode[]);

    // 1. Create employee
    const employee = await this.employeeRepo.create({
      displayName: trimmedName,
      roleCodes: rolesToAssign,
    });

    // 2. Generate secure one-time onboarding token
    const rawOnboardingToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawOnboardingToken).digest('hex');
    const expiresAt = new Date(Date.now() + INVITATION_EXPIRATION_DAYS * 24 * 60 * 60 * 1000);

    await this.invitationRepo.create({
      userId: employee.id,
      tokenHash,
      expiresAt,
      createdById: request.actorUserId ?? null,
    });

    // 3. Record audit event
    await this.auditRepo.record({
      actorUserId: request.actorUserId ?? null,
      action: 'EMPLOYEE_CREATED',
      resourceType: 'User',
      resourceId: employee.id,
      metadata: {
        displayName: employee.displayName,
        roles: employee.roles,
        invitationExpiresAt: expiresAt.toISOString(),
      },
    });

    return {
      employee,
      rawOnboardingToken,
      expiresAt,
    };
  }
}
