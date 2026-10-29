import { type CookieOptions, type Request, type Response } from 'express';

export const SESSION_COOKIE_NAME = 'ps_session';
export const DEFAULT_SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours

export interface CookieConfigOptions {
  readonly isProduction?: boolean;
  readonly maxAgeMs?: number;
}

export function getSessionCookieOptions(options?: CookieConfigOptions): CookieOptions {
  const isProduction = options?.isProduction ?? process.env['NODE_ENV'] === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/',
    maxAge: options?.maxAgeMs ?? DEFAULT_SESSION_MAX_AGE_MS,
  };
}

export function setSessionCookie(
  res: Response,
  rawToken: string,
  options?: CookieConfigOptions,
): void {
  const cookieOptions = getSessionCookieOptions(options);
  res.cookie(SESSION_COOKIE_NAME, rawToken, cookieOptions);
}

export function clearSessionCookie(res: Response, options?: CookieConfigOptions): void {
  const isProduction = options?.isProduction ?? process.env['NODE_ENV'] === 'production';
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/',
  });
}

export function parseCookieHeader(header: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of header.split(';')) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      try {
        result[key] = decodeURIComponent(val);
      } catch {
        result[key] = val;
      }
    }
  }
  return result;
}

export function extractSessionToken(req: Request): string | null {
  // 1. Check req.cookies if cookie-parser middleware was executed
  const reqAny = req as unknown as { cookies?: Record<string, string> };
  if (reqAny.cookies?.[SESSION_COOKIE_NAME]) {
    const token = reqAny.cookies[SESSION_COOKIE_NAME]?.trim();
    if (token) return token;
  }

  // 2. Parse raw Cookie request header
  const rawCookieHeader = req.headers.cookie;
  if (typeof rawCookieHeader === 'string') {
    const parsed = parseCookieHeader(rawCookieHeader);
    if (parsed[SESSION_COOKIE_NAME]) {
      const token = parsed[SESSION_COOKIE_NAME]?.trim();
      if (token) return token;
    }
  }

  // 3. Fallback to Authorization: Bearer <token>
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer.length > 0) return bearer;
  }

  return null;
}
