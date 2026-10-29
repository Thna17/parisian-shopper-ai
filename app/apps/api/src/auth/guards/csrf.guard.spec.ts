import { describe, expect, it } from '@jest/globals';
import { type ExecutionContext } from '@nestjs/common';
import { CsrfValidationFailedError } from '@parisian-shopper/application';
import { type AppConfigService } from '@parisian-shopper/config';
import { type Request } from 'express';
import { CsrfGuard } from './csrf.guard.js';

describe('CsrfGuard', () => {
  const mockConfig = {
    application: {
      corsOrigins: ['http://localhost:3000', 'https://app.parisianshopper.com'],
    },
  } as unknown as AppConfigService;

  const guard = new CsrfGuard(mockConfig);

  function createMockContext(req: Partial<Request>): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => req as Request,
      }),
    } as unknown as ExecutionContext;
  }

  it('allows safe methods (GET, HEAD, OPTIONS) without checking CSRF', () => {
    const context = createMockContext({
      method: 'GET',
      headers: { cookie: 'ps_session=token' },
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows login endpoint without checking CSRF (session not established yet)', () => {
    const context = createMockContext({
      method: 'POST',
      url: '/v1/auth/login',
      originalUrl: '/v1/auth/login',
      headers: {},
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows non-cookie (pure API/Bearer) mutation requests without CSRF check', () => {
    const context = createMockContext({
      method: 'POST',
      url: '/v1/some-resource',
      headers: { authorization: 'Bearer token123' },
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows cookie mutation request when origin matches allowed CORS origins', () => {
    const context = createMockContext({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: {
        cookie: 'ps_session=token123',
        origin: 'http://localhost:3000',
        'x-csrf-token': 'valid-csrf-header',
      },
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects cookie mutation request when origin is untrusted', () => {
    const context = createMockContext({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: {
        cookie: 'ps_session=token123',
        origin: 'https://evil-attacker.com',
      },
    });
    expect(() => guard.canActivate(context)).toThrow(CsrfValidationFailedError);
  });

  it('rejects cookie mutation request when referer is untrusted', () => {
    const context = createMockContext({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: {
        cookie: 'ps_session=token123',
        referer: 'https://evil-attacker.com/malicious-page',
      },
    });
    expect(() => guard.canActivate(context)).toThrow(CsrfValidationFailedError);
  });
});
