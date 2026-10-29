/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { type ExecutionContext } from '@nestjs/common';
import {
  type GetCurrentEmployeeUseCase,
  type SanitizedEmployeeDto,
  UnauthorizedSessionError,
} from '@parisian-shopper/application';
import { type AuthenticatedRequest, SessionAuthGuard } from './session-auth.guard.js';

describe('SessionAuthGuard', () => {
  let guard: SessionAuthGuard;
  let mockUseCase: jest.Mocked<GetCurrentEmployeeUseCase>;

  const sampleUser: SanitizedEmployeeDto = {
    id: 'user-1',
    displayName: 'Golden Approver',
    status: 'ACTIVE',
    roles: ['MARKETING_APPROVER'],
    permissions: ['APPROVE_CONTENT'],
  };

  beforeEach(() => {
    mockUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetCurrentEmployeeUseCase>;

    guard = new SessionAuthGuard(mockUseCase);
  });

  function createMockContext(req: Partial<AuthenticatedRequest>): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => req as AuthenticatedRequest,
      }),
    } as unknown as ExecutionContext;
  }

  it('authenticates request, attaches user and sessionToken, and returns true', async () => {
    mockUseCase.execute.mockResolvedValueOnce(sampleUser);

    const req: Partial<AuthenticatedRequest> = {
      headers: { cookie: 'ps_session=valid-token-123' },
    };
    const context = createMockContext(req);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(req.user).toEqual(sampleUser);
    expect(req.sessionToken).toBe('valid-token-123');
    expect(mockUseCase.execute).toHaveBeenCalledWith({ rawSessionToken: 'valid-token-123' });
  });

  it('throws UnauthorizedSessionError when no session cookie or bearer token is present', async () => {
    const req: Partial<AuthenticatedRequest> = {
      headers: {},
    };
    const context = createMockContext(req);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedSessionError);
    expect(mockUseCase.execute).not.toHaveBeenCalled();
  });

  it('re-throws domain UnauthorizedSessionError for global filter to map', async () => {
    mockUseCase.execute.mockRejectedValueOnce(new UnauthorizedSessionError());

    const req: Partial<AuthenticatedRequest> = {
      headers: { cookie: 'ps_session=expired-token' },
    };
    const context = createMockContext(req);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedSessionError);
  });
});
