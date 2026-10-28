import { describe, expect, it } from '@jest/globals';
import { hashSessionToken, isSessionActive, type UserSessionRecord } from './session.js';
import { sanitizeCredentialView, type PasswordCredentialRecord } from './credential.js';

describe('Auth Domain: Session and Credential Invariants', () => {
  describe('hashSessionToken', () => {
    it('produces a 64-character lowercase hexadecimal SHA-256 digest', () => {
      const rawToken = '7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069';
      const hash = hashSessionToken(rawToken);

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is deterministic for the same raw bearer token', () => {
      const rawToken = 'super-secret-random-token-entropy-12345';
      const hash1 = hashSessionToken(rawToken);
      const hash2 = hashSessionToken(rawToken);

      expect(hash1).toBe(hash2);
    });

    it('produces distinct digests for different bearer tokens', () => {
      const hash1 = hashSessionToken('token-a');
      const hash2 = hashSessionToken('token-b');

      expect(hash1).not.toBe(hash2);
    });

    it('throws error when token is empty or invalid', () => {
      expect(() => hashSessionToken('')).toThrow(
        'Invalid raw session token: must be a non-empty string',
      );
      // @ts-expect-error Testing runtime guard against non-string
      expect(() => hashSessionToken(null)).toThrow(
        'Invalid raw session token: must be a non-empty string',
      );
    });
  });

  describe('isSessionActive', () => {
    const baseSession: UserSessionRecord = {
      id: 'sess-1',
      userId: 'user-1',
      sessionTokenHash: 'a'.repeat(64),
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0',
      createdAt: new Date('2026-10-28T10:00:00Z'),
      lastActiveAt: new Date('2026-10-28T10:00:00Z'),
      expiresAt: new Date('2026-10-28T18:00:00Z'),
      revokedAt: null,
    };

    it('DB-AUTH-05: evaluates active session as valid when unexpired and unrevoked', () => {
      const now = new Date('2026-10-28T12:00:00Z');
      expect(isSessionActive(baseSession, now)).toBe(true);
    });

    it('DB-AUTH-06: rejects session when expiresAt equals or precedes now', () => {
      const nowExact = new Date('2026-10-28T18:00:00Z');
      const nowPast = new Date('2026-10-28T18:00:01Z');

      expect(isSessionActive(baseSession, nowExact)).toBe(false);
      expect(isSessionActive(baseSession, nowPast)).toBe(false);
    });

    it('DB-AUTH-07: rejects session when revokedAt is set even if unexpired', () => {
      const revokedSession: UserSessionRecord = {
        ...baseSession,
        revokedAt: new Date('2026-10-28T11:00:00Z'),
      };
      const now = new Date('2026-10-28T12:00:00Z');

      expect(isSessionActive(revokedSession, now)).toBe(false);
    });
  });

  describe('sanitizeCredentialView', () => {
    it('DB-AUTH-13: excludes passwordHash from user-facing CredentialStatusView DTO', () => {
      const credentialRecord: PasswordCredentialRecord = {
        id: 'cred-1',
        userId: 'user-1',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$someSecretSalt$someSecretHash',
        hashAlgorithm: 'argon2id',
        failedLogins: 0,
        lockedUntil: null,
        createdAt: new Date('2026-10-28T10:00:00Z'),
        updatedAt: new Date('2026-10-28T10:00:00Z'),
      };

      const view = sanitizeCredentialView(credentialRecord);

      expect(view.hasPassword).toBe(true);
      expect(view.hashAlgorithm).toBe('argon2id');
      expect(view.failedLogins).toBe(0);
      expect(view.isLocked).toBe(false);
      expect(view.lockedUntil).toBeNull();
      // Ensure passwordHash is not present on view
      expect((view as unknown as Record<string, unknown>).passwordHash).toBeUndefined();
    });

    it('indicates isLocked when lockedUntil is in the future', () => {
      const lockedRecord: PasswordCredentialRecord = {
        id: 'cred-2',
        userId: 'user-2',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$secret',
        hashAlgorithm: 'argon2id',
        failedLogins: 5,
        lockedUntil: new Date(Date.now() + 600_000), // 10 minutes in future
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const view = sanitizeCredentialView(lockedRecord);
      expect(view.isLocked).toBe(true);
      expect(view.failedLogins).toBe(5);
    });

    it('handles null credential cleanly', () => {
      const view = sanitizeCredentialView(null);
      expect(view.hasPassword).toBe(false);
      expect(view.isLocked).toBe(false);
      expect(view.failedLogins).toBe(0);
      expect(view.lockedUntil).toBeNull();
    });
  });
});
