import { describe, expect, it } from '@jest/globals';
import {
  ExportDownloadTokenService,
  type ExportDownloadTokenConfig,
} from './export-download-token.service.js';

describe('ExportDownloadTokenService (W32-D)', () => {
  const exportId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  const userId = 'user-emp-001';

  it('generates a URL-safe base64url token with default config', () => {
    const service = new ExportDownloadTokenService();
    const token = service.generateToken({ exportId, userId });

    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(20);
    // base64url chars only: A-Z, a-z, 0-9, -, _
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('verifies a valid token successfully and extracts fields', () => {
    const service = new ExportDownloadTokenService();
    const token = service.generateToken({ exportId, userId });
    const result = service.verifyToken(token, exportId);

    expect(result.isValid).toBe(true);
    expect(result.exportId).toBe(exportId);
    expect(result.userId).toBe(userId);
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.expiresAt!.getTime()).toBeGreaterThan(Date.now());
    expect(result.reason).toBeUndefined();
  });

  it('verifies a valid token when expectedExportId is omitted', () => {
    const service = new ExportDownloadTokenService();
    const token = service.generateToken({ exportId, userId });
    const result = service.verifyToken(token);

    expect(result.isValid).toBe(true);
    expect(result.exportId).toBe(exportId);
    expect(result.userId).toBe(userId);
  });

  it('rejects token when expectedExportId does not match (EXPORT_MISMATCH)', () => {
    const service = new ExportDownloadTokenService();
    const token = service.generateToken({ exportId, userId });
    const result = service.verifyToken(token, 'different-export-id-999');

    expect(result.isValid).toBe(false);
    expect(result.reason).toBe('EXPORT_MISMATCH');
    expect(result.exportId).toBe(exportId);
    expect(result.userId).toBe(userId);
  });

  it('rejects token when expired (EXPIRED)', () => {
    const service = new ExportDownloadTokenService();
    // Negative expiresInSeconds generates an already-expired token
    const token = service.generateToken({ exportId, userId, expiresInSeconds: -10 });
    const result = service.verifyToken(token, exportId);

    expect(result.isValid).toBe(false);
    expect(result.reason).toBe('EXPIRED');
    expect(result.exportId).toBe(exportId);
  });

  it('rejects token when payload has been tampered with (INVALID_SIGNATURE)', () => {
    const service = new ExportDownloadTokenService();
    const token = service.generateToken({ exportId, userId });

    // Decode, tamper with userId, re-encode without updating signature
    const json = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    json['u'] = 'malicious-attacker-user';
    const tamperedToken = Buffer.from(JSON.stringify(json), 'utf8').toString('base64url');

    const result = service.verifyToken(tamperedToken, exportId);
    expect(result.isValid).toBe(false);
    expect(result.reason).toBe('INVALID_SIGNATURE');
  });

  it('rejects token signed with a different secret (INVALID_SIGNATURE)', () => {
    const service1 = new ExportDownloadTokenService({ secret: 'secret-key-alpha-123456789' });
    const service2 = new ExportDownloadTokenService({ secret: 'secret-key-bravo-987654321' });

    const token = service1.generateToken({ exportId, userId });
    const result = service2.verifyToken(token, exportId);

    expect(result.isValid).toBe(false);
    expect(result.reason).toBe('INVALID_SIGNATURE');
  });

  it('rejects malformed token strings (MALFORMED)', () => {
    const service = new ExportDownloadTokenService();

    expect(service.verifyToken('not-a-valid-base64-string!@#$').isValid).toBe(false);
    expect(service.verifyToken('not-a-valid-base64-string!@#$').reason).toBe('MALFORMED');

    const invalidJsonToken = Buffer.from('plain-text-not-json', 'utf8').toString('base64url');
    expect(service.verifyToken(invalidJsonToken).isValid).toBe(false);
    expect(service.verifyToken(invalidJsonToken).reason).toBe('MALFORMED');

    const missingFieldsToken = Buffer.from(JSON.stringify({ foo: 'bar' }), 'utf8').toString(
      'base64url',
    );
    expect(service.verifyToken(missingFieldsToken).isValid).toBe(false);
    expect(service.verifyToken(missingFieldsToken).reason).toBe('MALFORMED');
  });

  it('respects custom config for secret and default TTL', () => {
    const config: ExportDownloadTokenConfig = {
      secret: 'custom-production-secret-99999',
      ttlSeconds: 7200,
    };
    const service = new ExportDownloadTokenService(config);
    const token = service.generateToken({ exportId, userId });
    const result = service.verifyToken(token, exportId);

    expect(result.isValid).toBe(true);
    // Expiration should be roughly 2 hours from now (~7200s)
    const deltaMs = result.expiresAt!.getTime() - Date.now();
    expect(deltaMs).toBeGreaterThan(7100 * 1000);
    expect(deltaMs).toBeLessThanOrEqual(7200 * 1000 + 5000);
  });
});
