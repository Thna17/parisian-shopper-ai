import { config, higgsfield } from '@higgsfield/client/v2';
import {
  APIError,
  AuthenticationError,
  BadInputError,
  NotEnoughCreditsError,
  TimeoutError,
  ValidationError,
} from '@higgsfield/client';

const MODEL_ID = 'bytedance/seedance-2.5/text-to-video';

type SmokeFailureCode =
  | 'PROVIDER_FAILURE'
  | 'AUTH_FAILURE'
  | 'BLOCKED_INSUFFICIENT_CREDITS'
  | 'MODERATION_BLOCKED'
  | 'CANCELED'
  | 'TIMEOUT';

class SeedanceExampleError extends Error {
  public constructor(
    public readonly code: SmokeFailureCode,
    message: string,
  ) {
    super(message);
    this.name = 'SeedanceExampleError';
  }
}

interface SafeFailure {
  readonly code: string;
  readonly message: string;
}

function safeFailure(error: unknown): SafeFailure {
  if (error instanceof AuthenticationError) {
    return { code: 'AUTH_FAILURE', message: 'Higgsfield rejected the API credentials' };
  }
  if (error instanceof NotEnoughCreditsError) {
    return {
      code: 'BLOCKED_INSUFFICIENT_CREDITS',
      message: 'Higgsfield account has insufficient credits',
    };
  }
  if (error instanceof ValidationError || error instanceof BadInputError) {
    return { code: 'PROVIDER_FAILURE', message: 'Higgsfield rejected the request' };
  }
  if (error instanceof TimeoutError) {
    return { code: 'TIMEOUT', message: 'Higgsfield polling timed out before completion' };
  }
  if (error instanceof APIError) {
    return {
      code: 'PROVIDER_FAILURE',
      message: `Higgsfield API request failed with HTTP status ${error.statusCode ?? 'unknown'}`,
    };
  }
  if (error instanceof SeedanceExampleError) {
    return { code: error.code, message: error.message };
  }
  return {
    code: 'PROVIDER_FAILURE',
    message: 'Higgsfield request failed; inspect the provider dashboard',
  };
}

async function main(): Promise<void> {
  if (process.env['RUN_HIGGSFIELD_LIVE_TESTS'] !== 'true') {
    throw new SeedanceExampleError(
      'PROVIDER_FAILURE',
      'Set RUN_HIGGSFIELD_LIVE_TESTS=true locally to authorize one potentially billable request',
    );
  }

  const credentials = process.env['HF_CREDENTIALS'];
  if (credentials === undefined || credentials.trim() === '' || !credentials.includes(':')) {
    throw new SeedanceExampleError(
      'PROVIDER_FAILURE',
      'HF_CREDENTIALS must be configured locally in .env.local using key-id:key-secret format',
    );
  }

  config({ credentials });

  const result = await higgsfield.subscribe(MODEL_ID, {
    input: {
      prompt: 'A cinematic scene at sunset',
      duration: 5,
      resolution: '720p',
      aspect_ratio: '16:9',
    },
    withPolling: true,
  });

  const status: string = result.status;
  if (status === 'failed' || status === 'canceled' || status === 'nsfw') {
    const code =
      status === 'nsfw'
        ? 'MODERATION_BLOCKED'
        : status === 'canceled'
          ? 'CANCELED'
          : 'PROVIDER_FAILURE';
    throw new SeedanceExampleError(code, `Terminal provider status: ${status}`);
  }

  if (status !== 'completed') {
    throw new SeedanceExampleError(
      'PROVIDER_FAILURE',
      `Higgsfield generation returned unexpected status: ${status}`,
    );
  }

  const videoUrl = result.video?.url;
  if (videoUrl === undefined || videoUrl.trim() === '') {
    throw new SeedanceExampleError(
      'PROVIDER_FAILURE',
      'Higgsfield generation completed without a video URL',
    );
  }

  process.stdout.write(`SUCCESS\n${videoUrl}\n`);
}

void main().catch((error: unknown) => {
  const failure = safeFailure(error);
  process.stderr.write(`Seedance generation ${failure.code}: ${failure.message}\n`);
  process.exitCode = 1;
});
