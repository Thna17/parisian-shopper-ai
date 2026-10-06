import { describe, expect, it, jest } from '@jest/globals';
import {
  type GeneratedVideoAsset,
  HiggsfieldProviderError,
  type VideoCreativeBrief,
} from '@parisian-shopper/application';
import { type ApplicationLogger } from '@parisian-shopper/common';

import {
  HIGGSFIELD_SEEDANCE_2_5_MODEL,
  type HiggsfieldSdkClient,
  HiggsfieldSdkClientError,
  type HiggsfieldVideoResponse,
} from './higgsfield-sdk-client.js';
import { HiggsfieldVideoProvider } from './higgsfield-video-provider.js';

const validBrief: VideoCreativeBrief = {
  prompt: 'A cinematic scene at sunset',
  durationSeconds: 5,
  resolution: '720p',
  aspectRatio: '16:9',
  outputFormat: 'mp4',
  generateAudio: false,
};

function provider(
  response: HiggsfieldVideoResponse | HiggsfieldSdkClientError,
  logger?: ApplicationLogger,
): {
  provider: HiggsfieldVideoProvider;
  subscribeVideo: jest.MockedFunction<HiggsfieldSdkClient['subscribeVideo']>;
} {
  const subscribeVideo = jest.fn<HiggsfieldSdkClient['subscribeVideo']>();
  if (response instanceof HiggsfieldSdkClientError) {
    subscribeVideo.mockRejectedValue(response);
  } else {
    subscribeVideo.mockResolvedValue(response);
  }
  return {
    provider: new HiggsfieldVideoProvider(
      { subscribeVideo },
      {
        model: HIGGSFIELD_SEEDANCE_2_5_MODEL,
        maxWaitMs: 300_000,
        defaultGenerateAudio: false,
      },
      logger,
    ),
    subscribeVideo,
  };
}

async function expectCode(
  operation: Promise<GeneratedVideoAsset>,
  code: HiggsfieldProviderError['code'],
): Promise<HiggsfieldProviderError> {
  try {
    await operation;
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(HiggsfieldProviderError);
    expect((error as HiggsfieldProviderError).code).toBe(code);
    return error as HiggsfieldProviderError;
  }
  throw new Error('Expected HiggsfieldProviderError');
}

describe('HiggsfieldVideoProvider', () => {
  it('maps the controlled brief to Seedance and returns controlled metadata', async () => {
    const { provider: subject, subscribeVideo } = provider({
      status: 'completed',
      requestId: 'request-123',
      videoUrl: 'https://cdn.higgsfield.example/video.mp4',
    });

    const result = await subject.generateVideo(validBrief);

    expect(subject.providerId).toBe('higgsfield');
    expect(subscribeVideo).toHaveBeenCalledTimes(1);
    expect(subscribeVideo).toHaveBeenCalledWith({
      model: HIGGSFIELD_SEEDANCE_2_5_MODEL,
      prompt: validBrief.prompt,
      duration: 5,
      resolution: '720p',
      aspectRatio: '16:9',
      outputFormat: 'mp4',
      generateAudio: false,
    });
    expect(result).toMatchObject({
      providerId: 'higgsfield',
      providerRequestId: 'request-123',
      mimeType: 'video/mp4',
      durationSeconds: 5,
    });
    expect('generateBackground' in subject).toBe(false);
    expect('composite' in subject).toBe(false);
  });

  it.each([
    ['INSUFFICIENT_CREDITS', 'HIGGSFIELD_INSUFFICIENT_CREDITS'],
    ['AUTH_FAILED', 'HIGGSFIELD_AUTH_FAILED'],
    ['RATE_LIMITED', 'HIGGSFIELD_RATE_LIMITED'],
    ['REQUEST_REJECTED', 'HIGGSFIELD_INVALID_REQUEST'],
    ['PROVIDER_FAILED', 'HIGGSFIELD_GENERATION_FAILED'],
    ['TIMEOUT', 'HIGGSFIELD_PROVIDER_TIMEOUT'],
  ] as const)('maps SDK %s without retry to %s', async (kind, code) => {
    const { provider: subject, subscribeVideo } = provider(new HiggsfieldSdkClientError(kind));

    await expectCode(subject.generateVideo(validBrief), code);

    expect(subscribeVideo).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['nsfw', 'HIGGSFIELD_MODERATION_BLOCKED'],
    ['failed', 'HIGGSFIELD_GENERATION_FAILED'],
    ['canceled', 'HIGGSFIELD_REQUEST_CANCELED'],
  ] as const)('maps terminal %s without retry to %s', async (status, code) => {
    const { provider: subject, subscribeVideo } = provider({ status, requestId: 'request-safe' });

    const error = await expectCode(subject.generateVideo(validBrief), code);

    expect(error.details?.['providerRequestId']).toBe('request-safe');
    expect(subscribeVideo).toHaveBeenCalledTimes(1);
  });

  it('rejects missing and non-HTTPS results', async () => {
    const missing = provider({ status: 'completed', requestId: 'missing-result' });
    await expectCode(missing.provider.generateVideo(validBrief), 'HIGGSFIELD_RESULT_INVALID');

    const unsafe = provider({
      status: 'completed',
      requestId: 'unsafe-result',
      videoUrl: 'http://127.0.0.1/video.mp4',
    });
    await expectCode(unsafe.provider.generateVideo(validBrief), 'HIGGSFIELD_RESULT_INVALID');
  });

  it('validates Seedance constraints before submission and fails unknown models closed', async () => {
    const controlled = provider({
      status: 'completed',
      videoUrl: 'https://cdn.higgsfield.example/video.mp4',
    });
    await expectCode(
      controlled.provider.generateVideo({ ...validBrief, durationSeconds: 3 }),
      'HIGGSFIELD_INVALID_REQUEST',
    );
    expect(controlled.subscribeVideo).not.toHaveBeenCalled();

    expect(
      () =>
        new HiggsfieldVideoProvider(
          { subscribeVideo: controlled.subscribeVideo },
          { model: 'unknown/model', maxWaitMs: 300_000, defaultGenerateAudio: false },
        ),
    ).toThrow(HiggsfieldProviderError);
  });

  it.each([
    ['success', { status: 'completed', videoUrl: 'https://cdn.example/video.mp4' }],
    ['auth', new HiggsfieldSdkClientError('AUTH_FAILED')],
    ['credits', new HiggsfieldSdkClientError('INSUFFICIENT_CREDITS')],
    ['rate-limit', new HiggsfieldSdkClientError('RATE_LIMITED', 429)],
    ['provider', new HiggsfieldSdkClientError('PROVIDER_FAILED', 500)],
    ['timeout', new HiggsfieldSdkClientError('TIMEOUT')],
  ] as const)('never leaks secrets through %s logs or errors', async (_scenario, outcome) => {
    const events: unknown[] = [];
    const logger: ApplicationLogger = {
      log: (message, fields) => events.push({ message, fields }),
      warn: (message, fields) => events.push({ message, fields }),
      error: (message, fields) => events.push({ message, fields }),
    };
    const configuredCredential = 'TEST_KEY_ID:SUPER_SECRET_TEST_VALUE';
    const fixture = provider(outcome, logger);

    try {
      await fixture.provider.generateVideo(validBrief);
    } catch (error: unknown) {
      events.push(error);
    }

    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain(configuredCredential);
    expect(serialized).not.toContain('SUPER_SECRET_TEST_VALUE');
    expect(serialized).not.toContain('Authorization');
    expect(serialized).not.toContain('HF_CREDENTIALS');
  });
});
