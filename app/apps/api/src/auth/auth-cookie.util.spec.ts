/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, jest } from '@jest/globals';
import { type Request, type Response } from 'express';
import {
  clearSessionCookie,
  extractSessionToken,
  getSessionCookieOptions,
  parseCookieHeader,
  SESSION_COOKIE_NAME,
  setSessionCookie,
} from './auth-cookie.util.js';

describe('Auth Cookie Utilities', () => {
  describe('parseCookieHeader', () => {
    it('parses multiple cookies from cookie header string', () => {
      const header = 'ps_session=abc123xyz; theme=dark; tracking_id=42';
      const parsed = parseCookieHeader(header);

      expect(parsed[SESSION_COOKIE_NAME]).toBe('abc123xyz');
      expect(parsed['theme']).toBe('dark');
      expect(parsed['tracking_id']).toBe('42');
    });

    it('handles empty and whitespace-only headers gracefully', () => {
      expect(parseCookieHeader('')).toEqual({});
      expect(parseCookieHeader('   ; ; ')).toEqual({});
    });
  });

  describe('extractSessionToken', () => {
    it('extracts token from pre-parsed req.cookies', () => {
      const req = {
        cookies: { [SESSION_COOKIE_NAME]: 'token-from-cookies-obj' },
        headers: {},
      } as unknown as Request;

      expect(extractSessionToken(req)).toBe('token-from-cookies-obj');
    });

    it('extracts token from raw req.headers.cookie string', () => {
      const req = {
        headers: { cookie: `other=foo; ${SESSION_COOKIE_NAME}=token-from-header; bar=baz` },
      } as unknown as Request;

      expect(extractSessionToken(req)).toBe('token-from-header');
    });

    it('falls back to Authorization Bearer header if cookie is absent', () => {
      const req = {
        headers: { authorization: 'Bearer token-from-bearer' },
      } as unknown as Request;

      expect(extractSessionToken(req)).toBe('token-from-bearer');
    });

    it('returns null if neither cookie nor bearer token is provided', () => {
      const req = {
        headers: {},
      } as unknown as Request;

      expect(extractSessionToken(req)).toBeNull();
    });
  });

  describe('getSessionCookieOptions, setSessionCookie, clearSessionCookie', () => {
    it('configures HttpOnly, path=/, and SameSite=strict in production', () => {
      const options = getSessionCookieOptions({ isProduction: true });
      expect(options.httpOnly).toBe(true);
      expect(options.secure).toBe(true);
      expect(options.sameSite).toBe('strict');
      expect(options.path).toBe('/');
      expect(options.maxAge).toBe(8 * 60 * 60 * 1000);
    });

    it('permits secure=false in non-production local development', () => {
      const options = getSessionCookieOptions({ isProduction: false });
      expect(options.httpOnly).toBe(true);
      expect(options.secure).toBe(false);
      expect(options.sameSite).toBe('lax');
    });

    it('setSessionCookie calls res.cookie with appropriate options', () => {
      const mockRes = {
        cookie: jest.fn(),
      } as unknown as Response;

      setSessionCookie(mockRes, 'raw-token-123', { isProduction: false });

      expect(mockRes.cookie).toHaveBeenCalledWith(
        SESSION_COOKIE_NAME,
        'raw-token-123',
        expect.objectContaining({ httpOnly: true, path: '/' }),
      );
    });

    it('clearSessionCookie calls res.clearCookie with appropriate options', () => {
      const mockRes = {
        clearCookie: jest.fn(),
      } as unknown as Response;

      clearSessionCookie(mockRes, { isProduction: false });

      expect(mockRes.clearCookie).toHaveBeenCalledWith(
        SESSION_COOKIE_NAME,
        expect.objectContaining({ httpOnly: true, path: '/' }),
      );
    });
  });
});
