import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { CsrfValidationFailedError } from '@parisian-shopper/application';
import { AppConfigService } from '@parisian-shopper/config';
import { type Request } from 'express';
import { parseCookieHeader, SESSION_COOKIE_NAME } from '../auth-cookie.util.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  public constructor(private readonly config: AppConfigService) {}

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method?.toUpperCase();

    if (SAFE_METHODS.has(method)) {
      return true;
    }

    // Exempt login endpoint (session does not exist yet)
    const url = request.originalUrl ?? request.url ?? '';
    if (url.includes('/auth/login') || url.includes('/telegram/webhook')) {
      return true;
    }

    // Check if request is authenticated via cookie
    const hasSessionCookie = this.hasSessionCookie(request);
    if (!hasSessionCookie) {
      // If bearer token or non-cookie, standard token auth applies
      return true;
    }

    // 1. Origin / Referer Validation (Anti-CSRF Invariant)
    const origin = request.headers['origin'];
    const referer = request.headers['referer'];
    const host = request.headers['host'];

    const allowedOrigins = new Set(this.config.application.corsOrigins);

    if (origin && typeof origin === 'string') {
      const originMatch = allowedOrigins.has(origin) || (host && origin.includes(host));
      if (!originMatch) {
        throw new CsrfValidationFailedError('CSRF check failed: untrusted origin.');
      }
    } else if (referer && typeof referer === 'string') {
      try {
        const refererUrl = new URL(referer);
        const refererOrigin = refererUrl.origin;
        const refererMatch =
          allowedOrigins.has(refererOrigin) || (host && refererUrl.host === host);
        if (!refererMatch) {
          throw new CsrfValidationFailedError('CSRF check failed: untrusted referer.');
        }
      } catch {
        throw new CsrfValidationFailedError('CSRF check failed: malformed referer header.');
      }
    } else {
      // In production, browser mutations authenticated with cookies must specify Origin or Referer
      if (process.env['NODE_ENV'] === 'production') {
        throw new CsrfValidationFailedError('CSRF check failed: missing Origin/Referer header.');
      }
    }

    // 2. Custom Header or Anti-CSRF token verification
    // Browsers cannot set custom headers cross-origin without CORS preflight approval
    const customHeader =
      request.headers['x-csrf-token'] ??
      request.headers['x-requested-with'] ??
      request.headers['x-ps-csrf'];

    if (!customHeader && process.env['NODE_ENV'] === 'production') {
      throw new CsrfValidationFailedError('CSRF check failed: missing anti-CSRF request header.');
    }

    return true;
  }

  private hasSessionCookie(request: Request): boolean {
    const reqAny = request as unknown as { cookies?: Record<string, string> };
    if (reqAny.cookies?.[SESSION_COOKIE_NAME]) {
      return true;
    }

    const raw = request.headers['cookie'];
    if (typeof raw === 'string') {
      const parsed = parseCookieHeader(raw);
      return Boolean(parsed[SESSION_COOKIE_NAME]);
    }

    return false;
  }
}
