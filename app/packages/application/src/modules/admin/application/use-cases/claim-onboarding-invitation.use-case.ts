import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  PASSWORD_CREDENTIAL_REPOSITORY,
  type PasswordCredentialRepository,
} from '../../../auth/application/password-credential.repository.js';
import {
  USER_ACCOUNT_REPOSITORY,
  type UserAccountRepository,
} from '../../../auth/application/user-account.repository.js';
import { PASSWORD_HASHER, type PasswordHasher } from '../../../auth/domain/password-hasher.port.js';
import { AccountSuspendedError } from '../../../auth/domain/auth-errors.js';
import { InvalidInvitationTokenError } from '../../domain/admin-errors.js';
import {
  ADMIN_AUDIT_REPOSITORY,
  type AdminAuditRepository,
} from '../ports/admin-audit.repository.js';
import {
  EMPLOYEE_INVITATION_REPOSITORY,
  type EmployeeInvitationRepository,
} from '../ports/employee-invitation.repository.js';

export interface ClaimOnboardingInvitationRequest {
  readonly token: string;
  readonly password: string;
}

export interface ClaimOnboardingInvitationResult {
  readonly success: boolean;
  readonly userId: string;
  readonly displayName: string;
}

@Injectable()
export class ClaimOnboardingInvitationUseCase {
  public constructor(
    @Inject(EMPLOYEE_INVITATION_REPOSITORY)
    private readonly invitationRepo: EmployeeInvitationRepository,
    @Inject(USER_ACCOUNT_REPOSITORY)
    private readonly userRepo: UserAccountRepository,
    @Inject(PASSWORD_CREDENTIAL_REPOSITORY)
    private readonly credentialRepo: PasswordCredentialRepository,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasher,
    @Inject(ADMIN_AUDIT_REPOSITORY)
    private readonly auditRepo: AdminAuditRepository,
  ) {}

  public async execute(
    request: ClaimOnboardingInvitationRequest,
  ): Promise<ClaimOnboardingInvitationResult> {
    const rawToken = request.token?.trim();
    if (!rawToken || !request.password || request.password.length < 8) {
      throw new InvalidInvitationTokenError();
    }

    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const invitation = await this.invitationRepo.findByTokenHash(tokenHash);

    if (!invitation) {
      throw new InvalidInvitationTokenError();
    }

    const now = new Date();

    // Replay prevention: single-use check
    if (invitation.claimedAt !== null) {
      throw new InvalidInvitationTokenError('Invitation token has already been redeemed.');
    }

    // Expiration check
    if (invitation.expiresAt.getTime() <= now.getTime()) {
      throw new InvalidInvitationTokenError('Invitation token has expired.');
    }

    // Account status check
    const account = await this.userRepo.findById(invitation.userId);
    if (!account) {
      throw new InvalidInvitationTokenError();
    }

    if (account.status !== 'ACTIVE') {
      throw new AccountSuspendedError('This employee account is deactivated.');
    }

    // Hash password with Argon2id
    const passwordHash = await this.passwordHasher.hash(request.password);

    // Upsert or create password credential
    const existingCred = await this.credentialRepo.findByUserId(invitation.userId);
    if (existingCred) {
      await this.credentialRepo.updatePasswordHash({
        userId: invitation.userId,
        passwordHash,
        hashAlgorithm: 'argon2id',
      });
    } else {
      await this.credentialRepo.create({
        userId: invitation.userId,
        passwordHash,
        hashAlgorithm: 'argon2id',
      });
    }

    // Mark invitation claimed (single use)
    await this.invitationRepo.markClaimed(invitation.id, now);

    // Invalidate any other outstanding invitations for this user
    await this.invitationRepo.invalidatePendingForUser(invitation.userId);

    // Audit log
    await this.auditRepo.record({
      actorUserId: invitation.userId,
      action: 'ONBOARDING_CLAIMED',
      resourceType: 'EmployeeInvitation',
      resourceId: invitation.id,
      metadata: {
        userId: invitation.userId,
        claimedAt: now.toISOString(),
      },
    });

    return {
      success: true,
      userId: account.id,
      displayName: account.displayName,
    };
  }
}
