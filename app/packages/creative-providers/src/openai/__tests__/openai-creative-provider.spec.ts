/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, jest } from '@jest/globals';
import { type CreativeBrief } from '@parisian-shopper/application';
import { type ApplicationLogger } from '@parisian-shopper/common';

import {
  OpenAiCreativeProvider,
  detectImageMimeType,
  sanitizeSecret,
} from '../openai-creative-provider.js';
import {
  OpenAiCircuitBreakerOpenError,
  OpenAiDownloadLimitExceededError,
  OpenAiInvalidImageError,
  OpenAiProviderError,
  OpenAiRateLimitError,
  OpenAiTimeoutError,
} from '../openai-errors.js';
import { createCreativeImageProvider } from '../../factory.js';

describe('OpenAiCreativeProvider', () => {
  const apiKey = 'sk-proj-supersecretkey1234567890abcdef';
  const mockLogger: ApplicationLogger = {
    log: jest.fn((_message: string, _meta?: unknown) => undefined),
    error: jest.fn((_message: string, _meta?: unknown) => undefined),
    warn: jest.fn((_message: string, _meta?: unknown) => undefined),
  };

  const validPngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ]);
  const validJpegBuffer = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  ]);

  const squareBrief: CreativeBrief = {
    creativeJobId: 'job-sq-1',
    contentVersionId: 'ver-sq-1',
    briefText: 'Luxury perfume visual',
    stylePrompt:
      'Haussmann interior with marble mantlepiece, soft morning sunlight, neutral French luxury tones',
    negativePrompt: 'clutter, neon colors',
    targetWidth: 1080,
    targetHeight: 1080,
    aspectRatio: '1:1',
    creativeProfile: 'STUDIO_MINIMAL',
  };

  const portraitBrief: CreativeBrief = {
    creativeJobId: 'job-port-1',
    contentVersionId: 'ver-port-1',
    briefText: 'High fashion story visual',
    stylePrompt: 'Minimalist Parisian apartment balcony overlooking Eiffel tower in morning mist',
    targetWidth: 1080,
    targetHeight: 1350,
    aspectRatio: '4:5',
    creativeProfile: 'EDITORIAL',
  };

  const landscapeBrief: CreativeBrief = {
    creativeJobId: 'job-land-1',
    contentVersionId: 'ver-land-1',
    briefText: 'Banner visual',
    stylePrompt: 'Place Vendome architecture at sunset',
    targetWidth: 1920,
    targetHeight: 1080,
    aspectRatio: '16:9',
    creativeProfile: 'BANNER',
  };

  function toUrlString(input: RequestInfo | URL): string {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.href;
    return input.url;
  }

  describe('Magic Bytes Detection', () => {
    it('correctly detects PNG magic bytes', () => {
      expect(detectImageMimeType(validPngBuffer)).toBe('image/png');
    });

    it('correctly detects JPEG magic bytes', () => {
      expect(detectImageMimeType(validJpegBuffer)).toBe('image/jpeg');
    });

    it('returns null for corrupted or non-image buffers', () => {
      expect(detectImageMimeType(Buffer.from('not an image at all'))).toBeNull();
      expect(detectImageMimeType(Buffer.from([0x00, 0x01, 0x02]))).toBeNull();
    });
  });

  describe('Secret Sanitization', () => {
    it('redacts full API keys, Bearer tokens, and sk- prefixes from error messages', () => {
      const sensitive = `Failed to connect with Authorization: Bearer ${apiKey} and key ${apiKey}. Secret: sk-1234567890abcdef1234567890`;
      const sanitized = sanitizeSecret(sensitive, [apiKey]);

      expect(sanitized).not.toContain(apiKey);
      expect(sanitized).toContain('Bearer [REDACTED]');
      expect(sanitized).toContain('[REDACTED]');
    });
  });

  describe('Request Payload Structure', () => {
    it('constructs correct DALL-E 3 payload with prompt sandboxing and square 1024x1024 size', async () => {
      let capturedUrl = '';
      let capturedOptions: RequestInit | undefined;

      const mockFetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = toUrlString(input);
        if (urlStr.includes('/images/generations')) {
          capturedUrl = urlStr;
          capturedOptions = init;
          return Promise.resolve(
            new Response(
              JSON.stringify({
                created: 1234567890,
                data: [
                  {
                    url: 'https://images.openai.com/generated/asset-1.png',
                    revised_prompt: 'A refined luxury Parisian interior',
                  },
                ],
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            ),
          );
        }

        if (urlStr === 'https://images.openai.com/generated/asset-1.png') {
          return Promise.resolve(
            new Response(validPngBuffer, {
              status: 200,
              headers: { 'Content-Type': 'image/png' },
            }),
          );
        }

        return Promise.reject(new Error(`Unexpected URL: ${urlStr}`));
      }) as unknown as typeof fetch;

      const provider = new OpenAiCreativeProvider({
        apiKey,
        fetchFn: mockFetch,
        logger: mockLogger,
      });

      const result = await provider.generateBackground(squareBrief);

      expect(capturedUrl).toBe('https://api.openai.com/v1/images/generations');
      expect(capturedOptions?.method).toBe('POST');

      const headers = capturedOptions?.headers as Record<string, string>;
      expect(headers.Authorization).toBe(`Bearer ${apiKey}`);
      expect(headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(capturedOptions?.body as string) as {
        model: string;
        prompt: string;
        n: number;
        size: string;
        quality: string;
        response_format: string;
      };

      expect(body.model).toBe('dall-e-3');
      expect(body.size).toBe('1024x1024');
      expect(body.quality).toBe('standard');
      expect(body.n).toBe(1);
      expect(body.response_format).toBe('url');
      expect(body.prompt).toContain('Ultra-luxury Parisian background scene');
      expect(body.prompt).toContain(squareBrief.stylePrompt);
      expect(body.prompt).toContain(
        'Strictly an empty background environment with open negative space',
      );
      expect(body.prompt).toContain('Avoid: clutter, neon colors.');

      expect(result.width).toBe(1024);
      expect(result.height).toBe(1024);
      expect(result.mimeType).toBe('image/png');
      expect(result.imageBuffer.equals(validPngBuffer)).toBe(true);
      expect(result.providerId).toBe('openai-dalle-3');
      expect(result.model).toBe('dall-e-3');
      expect(result.metadata?.revisedPrompt).toBe('A refined luxury Parisian interior');
      expect(result.estimatedCostUsd).toBe(0.04);
    });

    it('maps 4:5 portrait aspect ratio to 1024x1792 size', async () => {
      let capturedBody: { size: string } | undefined;

      const mockFetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = toUrlString(input);
        if (urlStr.includes('/images/generations')) {
          capturedBody = JSON.parse(init?.body as string) as { size: string };
          return Promise.resolve(
            new Response(
              JSON.stringify({
                created: 1234567890,
                data: [{ url: 'https://images.openai.com/generated/port.jpg' }],
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            ),
          );
        }
        return Promise.resolve(new Response(validJpegBuffer, { status: 200 }));
      }) as unknown as typeof fetch;

      const provider = new OpenAiCreativeProvider({
        apiKey,
        fetchFn: mockFetch,
        defaultQuality: 'hd',
      });

      const result = await provider.generateBackground(portraitBrief);

      expect(capturedBody?.size).toBe('1024x1792');
      expect(result.width).toBe(1024);
      expect(result.height).toBe(1792);
      expect(result.mimeType).toBe('image/jpeg');
      expect(result.estimatedCostUsd).toBe(0.08);
    });

    it('maps 16:9 landscape aspect ratio to 1792x1024 size', async () => {
      let capturedBody: { size: string } | undefined;

      const mockFetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = toUrlString(input);
        if (urlStr.includes('/images/generations')) {
          capturedBody = JSON.parse(init?.body as string) as { size: string };
          return Promise.resolve(
            new Response(
              JSON.stringify({
                created: 1234567890,
                data: [{ url: 'https://images.openai.com/generated/land.png' }],
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            ),
          );
        }
        return Promise.resolve(new Response(validPngBuffer, { status: 200 }));
      }) as unknown as typeof fetch;

      const provider = new OpenAiCreativeProvider({
        apiKey,
        fetchFn: mockFetch,
      });

      const result = await provider.generateBackground(landscapeBrief);

      expect(capturedBody?.size).toBe('1792x1024');
      expect(result.width).toBe(1792);
      expect(result.height).toBe(1024);
    });
  });

  describe('Buffer Downloading and Validation', () => {
    it('rejects insecure non-TLS HTTP image download URLs', async () => {
      const mockFetch = jest.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              created: 1234567890,
              data: [{ url: 'http://insecure-cdn.openai.com/image.png' }],
            }),
            { status: 200 },
          ),
        ),
      ) as unknown as typeof fetch;

      const provider = new OpenAiCreativeProvider({
        apiKey,
        fetchFn: mockFetch,
      });

      await expect(provider.generateBackground(squareBrief)).rejects.toThrow(/TLS is required/u);
    });

    it('throws OpenAiDownloadLimitExceededError when Content-Length exceeds max limit', async () => {
      const mockFetch = jest.fn((input: RequestInfo | URL) => {
        const urlStr = toUrlString(input);
        if (urlStr.includes('/images/generations')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                created: 1234567890,
                data: [{ url: 'https://images.openai.com/huge.png' }],
              }),
              { status: 200 },
            ),
          );
        }
        return Promise.resolve(
          new Response(validPngBuffer, {
            status: 200,
            headers: { 'Content-Length': String(20 * 1024 * 1024) }, // 20MB
          }),
        );
      }) as unknown as typeof fetch;

      const provider = new OpenAiCreativeProvider({
        apiKey,
        maxBufferBytes: 15 * 1024 * 1024,
        fetchFn: mockFetch,
      });

      await expect(provider.generateBackground(squareBrief)).rejects.toThrow(
        OpenAiDownloadLimitExceededError,
      );
    });

    it('throws OpenAiInvalidImageError when downloaded bytes fail magic bytes validation', async () => {
      const mockFetch = jest.fn((input: RequestInfo | URL) => {
        const urlStr = toUrlString(input);
        if (urlStr.includes('/images/generations')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                created: 1234567890,
                data: [{ url: 'https://images.openai.com/corrupt.png' }],
              }),
              { status: 200 },
            ),
          );
        }
        return Promise.resolve(
          new Response(Buffer.from('<!DOCTYPE html><html><body>Error</body></html>'), {
            status: 200,
          }),
        );
      }) as unknown as typeof fetch;

      const provider = new OpenAiCreativeProvider({
        apiKey,
        fetchFn: mockFetch,
      });

      await expect(provider.generateBackground(squareBrief)).rejects.toThrow(
        OpenAiInvalidImageError,
      );
    });

    it('handles base64 json format directly', async () => {
      const mockFetch = jest.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              created: 1234567890,
              data: [{ b64_json: validPngBuffer.toString('base64') }],
            }),
            { status: 200 },
          ),
        ),
      ) as unknown as typeof fetch;

      const provider = new OpenAiCreativeProvider({
        apiKey,
        fetchFn: mockFetch,
      });

      const result = await provider.generateBackground(squareBrief);
      expect(result.mimeType).toBe('image/png');
      expect(result.imageBuffer.equals(validPngBuffer)).toBe(true);
    });
  });

  describe('Timeout and Retry Policy', () => {
    it('times out and throws OpenAiTimeoutError when request exceeds budget', async () => {
      const mockFetch = jest.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new Error('TIMEOUT_100'));
            });
          }),
      ) as unknown as typeof fetch;

      const provider = new OpenAiCreativeProvider({
        apiKey,
        timeoutMs: 100,
        fetchFn: mockFetch,
      });

      await expect(provider.generateBackground(squareBrief)).rejects.toThrow(OpenAiTimeoutError);
    });

    it('retries on transient HTTP 429 rate limit error up to maxRetries', async () => {
      let callCount = 0;
      const mockFetch = jest.fn((input: RequestInfo | URL) => {
        const urlStr = toUrlString(input);
        if (urlStr.includes('/images/generations')) {
          callCount++;
          if (callCount < 3) {
            return Promise.resolve(
              new Response('Rate limit reached', {
                status: 429,
                headers: { 'Retry-After': '0' },
              }),
            );
          }
          return Promise.resolve(
            new Response(
              JSON.stringify({
                created: 1234567890,
                data: [{ url: 'https://images.openai.com/success.png' }],
              }),
              { status: 200 },
            ),
          );
        }
        return Promise.resolve(new Response(validPngBuffer, { status: 200 }));
      }) as unknown as typeof fetch;

      const provider = new OpenAiCreativeProvider({
        apiKey,
        maxRetries: 3,
        retryBackoffMs: 10,
        fetchFn: mockFetch,
      });

      const result = await provider.generateBackground(squareBrief);

      expect(callCount).toBe(3);
      expect(result.mimeType).toBe('image/png');
    });

    it('throws OpenAiRateLimitError when retries are exhausted on 429', async () => {
      const mockFetch = jest.fn(() =>
        Promise.resolve(
          new Response('Rate limit exceeded', {
            status: 429,
          }),
        ),
      ) as unknown as typeof fetch;

      const provider = new OpenAiCreativeProvider({
        apiKey,
        maxRetries: 1,
        retryBackoffMs: 10,
        fetchFn: mockFetch,
      });

      await expect(provider.generateBackground(squareBrief)).rejects.toThrow(OpenAiRateLimitError);
    });

    it('fails fast on 400 Bad Request without retrying', async () => {
      let callCount = 0;
      const mockFetch = jest.fn(() => {
        callCount++;
        return Promise.resolve(new Response('Safety policy violation', { status: 400 }));
      }) as unknown as typeof fetch;

      const provider = new OpenAiCreativeProvider({
        apiKey,
        maxRetries: 3,
        fetchFn: mockFetch,
      });

      await expect(provider.generateBackground(squareBrief)).rejects.toThrow(OpenAiProviderError);
      expect(callCount).toBe(1);
    });

    it('sanitizes API key from error message when upstream throws with bearer token', async () => {
      const mockFetch = jest.fn(() =>
        Promise.reject(
          new Error(
            `Failed to authenticate with Bearer ${apiKey} secret sk-proj-1234567890abcdef12345`,
          ),
        ),
      ) as unknown as typeof fetch;

      const provider = new OpenAiCreativeProvider({
        apiKey,
        maxRetries: 0,
        fetchFn: mockFetch,
      });

      try {
        await provider.generateBackground(squareBrief);
        expect(true).toBe(false); // unreachable
      } catch (err) {
        const error = err as Error;
        expect(error.message).not.toContain(apiKey);
        expect(error.message).toContain('Bearer [REDACTED]');
      }
    });
  });

  describe('Circuit Breaker', () => {
    it('trips circuit breaker to OPEN after consecutive failures and fails fast', async () => {
      const mockFetchFn = jest.fn(() =>
        Promise.resolve(new Response('Internal Server Error', { status: 500 })),
      );
      const mockFetch = mockFetchFn as unknown as typeof fetch;

      const provider = new OpenAiCreativeProvider({
        apiKey,
        maxRetries: 0,
        circuitBreakerFailureThreshold: 2,
        circuitBreakerResetTimeoutMs: 60_000,
        fetchFn: mockFetch,
      });

      // 1st failure
      await expect(provider.generateBackground(squareBrief)).rejects.toThrow(OpenAiProviderError);
      // 2nd failure -> trips circuit breaker
      await expect(provider.generateBackground(squareBrief)).rejects.toThrow(OpenAiProviderError);

      // 3rd call -> should immediately fail with OpenAiCircuitBreakerOpenError without hitting fetch
      mockFetchFn.mockClear();
      await expect(provider.generateBackground(squareBrief)).rejects.toThrow(
        OpenAiCircuitBreakerOpenError,
      );
      expect(mockFetchFn).not.toHaveBeenCalled();
    });
  });

  describe('Provider Factory & Feature Flag', () => {
    it('returns FakeCreativeProvider by default when CREATIVE_IMAGE_PROVIDER is unset', () => {
      const provider = createCreativeImageProvider({
        env: {},
        logger: mockLogger,
      });

      expect(provider.providerId).toBe('fake-creative-provider');
    });

    it('returns FakeCreativeProvider when CREATIVE_IMAGE_PROVIDER=fake', () => {
      const provider = createCreativeImageProvider({
        env: { CREATIVE_IMAGE_PROVIDER: 'fake' },
        logger: mockLogger,
      });

      expect(provider.providerId).toBe('fake-creative-provider');
    });

    it('returns OpenAiCreativeProvider when CREATIVE_IMAGE_PROVIDER=openai and OPENAI_API_KEY is present', () => {
      const provider = createCreativeImageProvider({
        env: {
          CREATIVE_IMAGE_PROVIDER: 'openai',
          OPENAI_API_KEY: 'sk-proj-test1234567890abcdef',
        },
        logger: mockLogger,
      });

      expect(provider.providerId).toBe('openai-dalle-3');
    });

    it('falls back to FakeCreativeProvider and logs warning if CREATIVE_IMAGE_PROVIDER=openai but OPENAI_API_KEY is missing', () => {
      const provider = createCreativeImageProvider({
        env: {
          CREATIVE_IMAGE_PROVIDER: 'openai',
        },
        logger: mockLogger,
      });

      expect(provider.providerId).toBe('fake-creative-provider');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('OPENAI_API_KEY is missing'),
        expect.anything(),
      );
    });
  });
});
