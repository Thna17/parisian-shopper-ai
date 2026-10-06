import {
  APIError,
  AuthenticationError,
  NotEnoughCreditsError,
  TimeoutError,
} from '@higgsfield/client';
import { describe, expect, it, jest } from '@jest/globals';

import {
  HIGGSFIELD_SEEDANCE_2_5_MODEL,
  type HiggsfieldSdkTransport,
  HiggsfieldSdkClientError,
  OfficialHiggsfieldSdkClient,
} from './higgsfield-sdk-client.js';

const request = {
  model: HIGGSFIELD_SEEDANCE_2_5_MODEL,
  prompt: 'A cinematic scene at sunset',
  duration: 5,
  resolution: '720p' as const,
  aspectRatio: '16:9' as const,
  outputFormat: 'mp4' as const,
  generateAudio: false,
} as const;

function clientWith(transport: HiggsfieldSdkTransport): OfficialHiggsfieldSdkClient {
  return new OfficialHiggsfieldSdkClient(
    { credentials: 'TEST_KEY_ID:SUPER_SECRET_TEST_VALUE', maxWaitMs: 300_000 },
    transport,
  );
}

async function capturedError(operation: Promise<unknown>): Promise<HiggsfieldSdkClientError> {
  try {
    await operation;
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(HiggsfieldSdkClientError);
    return error as HiggsfieldSdkClientError;
  }
  throw new Error('Expected HiggsfieldSdkClientError');
}

describe('OfficialHiggsfieldSdkClient', () => {
  it('uses documented subscribe polling and maps the result without leaking SDK types', async () => {
    const subscribe = jest.fn<HiggsfieldSdkTransport['subscribe']>().mockResolvedValue({
      status: 'completed',
      request_id: 'request-123',
      video: { url: 'https://cdn.example/video.mp4' },
    });
    const result = await clientWith({ subscribe }).subscribeVideo(request);

    expect(subscribe).toHaveBeenCalledWith(HIGGSFIELD_SEEDANCE_2_5_MODEL, {
      input: {
        prompt: request.prompt,
        duration: 5,
        resolution: '720p',
        aspect_ratio: '16:9',
        output_format: 'mp4',
        generate_audio: false,
      },
      withPolling: true,
    });
    expect(result).toEqual({
      status: 'completed',
      requestId: 'request-123',
      videoUrl: 'https://cdn.example/video.mp4',
    });
  });

  it.each([
    [new AuthenticationError(), 'AUTH_FAILED'],
    [new NotEnoughCreditsError(), 'INSUFFICIENT_CREDITS'],
    [new APIError('rate limited', 429), 'RATE_LIMITED'],
    [new APIError('provider failure', 500), 'PROVIDER_FAILED'],
    [new TimeoutError('polling timed out'), 'TIMEOUT'],
  ] as const)('maps vendor error classes to sanitized %s failures', async (vendorError, kind) => {
    const subscribe = jest.fn<HiggsfieldSdkTransport['subscribe']>().mockRejectedValue(vendorError);

    const error = await capturedError(clientWith({ subscribe }).subscribeVideo(request));

    expect(error.kind).toBe(kind);
    expect(JSON.stringify(error)).not.toContain('SUPER_SECRET_TEST_VALUE');
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it('rejects an undocumented response status', async () => {
    const subscribe = jest
      .fn<HiggsfieldSdkTransport['subscribe']>()
      .mockResolvedValue({ status: 'mystery' });

    const error = await capturedError(clientWith({ subscribe }).subscribeVideo(request));

    expect(error.kind).toBe('PROVIDER_FAILED');
  });
});
