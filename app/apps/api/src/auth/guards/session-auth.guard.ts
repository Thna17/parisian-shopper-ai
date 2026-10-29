import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import {
  GetCurrentEmployeeUseCase,
  type SanitizedEmployeeDto,
  UnauthorizedSessionError,
} from '@parisian-shopper/application';
import { ApplicationError } from '@parisian-shopper/common';
import { type Request } from 'express';
import { extractSessionToken } from '../auth-cookie.util.js';

export interface AuthenticatedRequest extends Request {
  user: SanitizedEmployeeDto;
  sessionToken: string;
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  public constructor(
    @Inject(GetCurrentEmployeeUseCase)
    private readonly getCurrentEmployeeUseCase: GetCurrentEmployeeUseCase,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractSessionToken(request);

    if (!token) {
      throw new UnauthorizedSessionError('Authentication required.');
    }

    try {
      const user = await this.getCurrentEmployeeUseCase.execute({ rawSessionToken: token });
      request.user = user;
      request.sessionToken = token;
      return true;
    } catch (error) {
      if (error instanceof ApplicationError) {
        throw error;
      }
      throw new UnauthorizedSessionError('Invalid, expired, or revoked session.');
    }
  }
}
