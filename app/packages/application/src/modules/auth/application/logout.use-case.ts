import { Inject, Injectable } from '@nestjs/common';
import { hashSessionToken } from '../domain/session.js';
import { USER_SESSION_REPOSITORY, type UserSessionRepository } from './user-session.repository.js';

export interface LogoutInput {
  readonly rawSessionToken: string;
}

@Injectable()
export class LogoutUseCase {
  public constructor(
    @Inject(USER_SESSION_REPOSITORY)
    private readonly sessionRepo: UserSessionRepository,
  ) {}

  public async execute(input: LogoutInput): Promise<void> {
    if (!input.rawSessionToken || typeof input.rawSessionToken !== 'string') {
      return;
    }

    try {
      const tokenHash = hashSessionToken(input.rawSessionToken);
      const session = await this.sessionRepo.findByTokenHash(tokenHash);
      if (session !== null) {
        await this.sessionRepo.revoke(session.id, new Date());
      }
    } catch {
      // Idempotent and silent on malformed token strings
    }
  }
}
