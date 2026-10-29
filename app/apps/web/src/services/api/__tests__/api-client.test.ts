/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClient } from '../api-client.js';
import { ApiClientError } from '../../../types/api.types.js';

describe('ApiClient (WEB-AUTH-13)', () => {
  let client: ApiClient;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    client = new ApiClient('http://localhost:3000');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('includes credentials: include and anti-CSRF header on mutating requests', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ success: true }),
    });
    globalThis.fetch = mockFetch;

    await client.post('/v1/auth/login', { test: true });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/v1/auth/login',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({
          'x-csrf-token': '1',
          'Content-Type': 'application/json',
          Accept: 'application/json',
        }),
        body: JSON.stringify({ test: true }),
      }),
    );
  });

  it('parses backend structured error payloads correctly', async () => {
    const errorPayload = {
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid login credentials.',
        requestId: 'req-12345',
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve(errorPayload),
    });

    await expect(client.post('/v1/auth/login', {})).rejects.toThrowError(ApiClientError);

    try {
      await client.post('/v1/auth/login', {});
    } catch (err) {
      const apiErr = err as ApiClientError;
      expect(apiErr.status).toBe(401);
      expect(apiErr.code).toBe('INVALID_CREDENTIALS');
      expect(apiErr.message).toBe('Invalid login credentials.');
      expect(apiErr.requestId).toBe('req-12345');
    }
  });

  it('handles network failure gracefully', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

    await expect(client.get('/v1/auth/me')).rejects.toThrowError(ApiClientError);

    try {
      await client.get('/v1/auth/me');
    } catch (err) {
      const apiErr = err as ApiClientError;
      expect(apiErr.code).toBe('NETWORK_ERROR');
      expect(apiErr.status).toBe(0);
    }
  });
});
