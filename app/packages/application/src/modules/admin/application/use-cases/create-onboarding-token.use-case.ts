import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AccountSuspendedError } from '../../../auth/domain/auth-errors.js';
import { EmployeeNotFoundError } from '../../domain/admin-errors.js';
import {
  ADMIN_AUDIT_REPOSITORY,
  type AdminAuditRepository,
} from '../ports/admin-audit.repository.js';
import {
  EMPLOYEE_INVITATION_REPOSITORY,
  type EmployeeInvitationRepository,
} from '../ports/employee-invitation.repository.js';
import { EMPLOYEE_REPOSITORY, type EmployeeRepository } from '../ports/employee.repository.js';

export interface CreateOnboardingTokenRequest {
  readonly userId: string;
  readonly actorUserId?: string | null | undefined;
}

export interface CreateOnboardingTokenResult {
  readonly rawOnboardingToken: string;
  readonly expiresAt: Date;
}

const INVITATION_EXPIRATION_DAYS = 7;

@Injectable()
export class CreateOnboardingTokenUseCase {
  public constructor(
    @Inject(EMPLOYEE_REPOSITORY)
    private readonly employeeRepo: EmployeeRepository,
    @Inject(EMPLOYEE_INVITATION_REPOSITORY)
    private readonly invitationRepo: EmployeeInvitationRepository,
    @Inject(ADMIN_AUDIT_REPOSITORY)
    private readonly auditRepo: AdminAuditRepository,
  ) {}

  public async execute(
    request: CreateOnboardingTokenRequest,
  ): Promise<CreateOnboardingTokenResult> {
    const employee = await this.employeeRepo.findById(request.userId);
    if (!employee) {
      throw new EmployeeNotFoundError(request.userId);
    }

    if (employee.status !== 'ACTIVE') {
      throw new AccountSuspendedError('Cannot issue onboarding token for a deactivated employee.');
    }

    // Invalidate prior unclaimed invitations
    await this.invitationRepo.invalidatePendingForUser(request.userId);

    // Generate fresh cryptographically secure token
    const rawOnboardingToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawOnboardingToken).digest('hex');
    const expiresAt = new Date(Date.now() + INVITATION_EXPIRATION_DAYS * 24 * 60 * 60 * 1000);

    await this.invitationRepo.create({
      userId: employee.id,
      tokenHash,
      expiresAt,
      createdById: request.actorUserId ?? null,
    });

    await this.auditRepo.record({
      actorUserId: request.actorUserId ?? null,
      action: 'ONBOARDING_TOKEN_ISSUED',
      resourceType: 'EmployeeInvitation',
      resourceId: employee.id,
      metadata: {
        userId: employee.id,
        expiresAt: expiresAt.toISOString(),
      },
    });

    return {
      rawOnboardingToken,
      expiresAt,
    };
  }
}
