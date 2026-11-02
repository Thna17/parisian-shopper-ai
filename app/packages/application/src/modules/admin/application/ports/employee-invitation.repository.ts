import { type EmployeeInvitationRecord } from '../../domain/employee.types.js';

export const EMPLOYEE_INVITATION_REPOSITORY = Symbol('EMPLOYEE_INVITATION_REPOSITORY');

export interface CreateInvitationInput {
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly createdById?: string | null;
}

export interface EmployeeInvitationRepository {
  create(input: CreateInvitationInput): Promise<EmployeeInvitationRecord>;
  findByTokenHash(tokenHash: string): Promise<EmployeeInvitationRecord | null>;
  markClaimed(id: string, claimedAt: Date): Promise<void>;
  findPendingByUserId(userId: string, now: Date): Promise<EmployeeInvitationRecord | null>;
  invalidatePendingForUser(userId: string): Promise<number>;
}
