import { Inject, Injectable } from '@nestjs/common';
import { AccountSuspendedError, UnauthorizedSessionError } from '../domain/auth-errors.js';
import { hashSessionToken } from '../domain/session.js';
import { type SanitizedEmployeeDto, sanitizeUserAccount } from '../domain/user-account.js';
import { USER_ACCOUNT_REPOSITORY, type UserAccountRepository } from './user-account.repository.js';
import { USER_SESSION_REPOSITORY, type UserSessionRepository } from './user-session.repository.js';

export interface GetCurrentEmployeeInput {
  readonly rawSessionToken: string;
}

@Injectable()
export class GetCurrentEmployeeUseCase {
  public constructor(
    @Inject(USER_ACCOUNT_REPOSITORY)
    private readonly userAccountRepo: UserAccountRepository,
    @Inject(USER_SESSION_REPOSITORY)
    private readonly sessionRepo: UserSessionRepository,
  ) {}

  public async execute(input: GetCurrentEmployeeInput): Promise<SanitizedEmployeeDto> {
    if (!input.rawSessionToken || typeof input.rawSessionToken !== 'string') {
      throw new UnauthorizedSessionError();
    }

    const tokenHash = hashSessionToken(input.rawSessionToken);
    const now = new Date();
    const session = await this.sessionRepo.findActiveByTokenHash(tokenHash, now);

    if (session === null) {
      throw new UnauthorizedSessionError();
    }

    const account = await this.userAccountRepo.findById(session.userId);

    if (account === null || account.status === 'DISABLED' || account.disabledAt !== null) {
      // Invalidate active session for suspended employee
      await this.sessionRepo.revoke(session.id, now);
      throw new AccountSuspendedError();
    }

    // Touch last active timestamp asynchronously
    await this.sessionRepo.touch(session.id, now);

    return sanitizeUserAccount(account);
  }
}
