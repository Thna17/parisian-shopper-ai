import {
  APIError,
  AuthenticationError,
  BadInputError,
  NotEnoughCreditsError,
  TimeoutError,
  ValidationError,
} from '@higgsfield/client';
import { createHiggsfieldClient } from '@higgsfield/client/v2';

export const HIGGSFIELD_SEEDANCE_2_5_MODEL = 'bytedance/seedance-2.5/text-to-video';
export const SUPPORTED_HIGGSFIELD_VIDEO_MODELS = Object.freeze([
  HIGGSFIELD_SEEDANCE_2_5_MODEL,
] as const);

export type HiggsfieldVideoModel = (typeof SUPPORTED_HIGGSFIELD_VIDEO_MODELS)[number];
export type HiggsfieldTerminalStatus = 'completed' | 'failed' | 'nsfw' | 'canceled';

export interface HiggsfieldVideoRequest {
  readonly model: HiggsfieldVideoModel;
  readonly prompt: string;
  readonly duration: number;
  readonly resolution: '480p' | '720p' | '1080p';
  readonly aspectRatio: '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | '21:9';
  readonly outputFormat: 'mp4' | 'mov';
  readonly generateAudio: boolean;
}

export interface HiggsfieldVideoResponse {
  readonly status: HiggsfieldTerminalStatus;
  readonly requestId?: string;
  readonly videoUrl?: string;
}

export type HiggsfieldSdkErrorKind =
  | 'INSUFFICIENT_CREDITS'
  | 'AUTH_FAILED'
  | 'RATE_LIMITED'
  | 'REQUEST_REJECTED'
  | 'PROVIDER_FAILED'
  | 'TIMEOUT';

export class HiggsfieldSdkClientError extends Error {
  public constructor(
    public readonly kind: HiggsfieldSdkErrorKind,
    public readonly statusCode?: number,
  ) {
    super(`Higgsfield SDK operation failed: ${kind}`);
    this.name = 'HiggsfieldSdkClientError';
  }
}

export interface HiggsfieldSdkClient {
  subscribeVideo(request: HiggsfieldVideoRequest): Promise<HiggsfieldVideoResponse>;
}

export interface OfficialHiggsfieldSdkClientOptions {
  readonly credentials: string;
  readonly maxWaitMs: number;
}

export interface HiggsfieldSdkTransport {
  subscribe(
    model: string,
    options: {
      readonly input: Readonly<Record<string, unknown>>;
      readonly withPolling: true;
    },
  ): Promise<{
    readonly status: unknown;
    readonly request_id?: unknown;
    readonly video?: { readonly url?: unknown };
  }>;
}

/**
 * The only class allowed to depend on the vendor SDK. Version 0.2.6 exposes
 * subscribe() with automatic polling but no documented public status/result/cancel methods.
 */
export class OfficialHiggsfieldSdkClient implements HiggsfieldSdkClient {
  private readonly client: HiggsfieldSdkTransport;

  public constructor(
    options: OfficialHiggsfieldSdkClientOptions,
    transport?: HiggsfieldSdkTransport,
  ) {
    const officialClient = createHiggsfieldClient({
      credentials: options.credentials,
      maxPollTime: options.maxWaitMs,
      pollInterval: 2_000,
      timeout: Math.min(options.maxWaitMs, 120_000),
      maxRetries: 0,
    });
    this.client =
      transport ??
      ({
        subscribe: (model, subscribeOptions): ReturnType<HiggsfieldSdkTransport['subscribe']> =>
          officialClient.subscribe(model, subscribeOptions),
      } satisfies HiggsfieldSdkTransport);
  }

  public async subscribeVideo(request: HiggsfieldVideoRequest): Promise<HiggsfieldVideoResponse> {
    try {
      const result = await this.client.subscribe(request.model, {
        input: {
          prompt: request.prompt,
          duration: request.duration,
          resolution: request.resolution,
          aspect_ratio: request.aspectRatio,
          output_format: request.outputFormat,
          generate_audio: request.generateAudio,
        },
        withPolling: true,
      });

      const status = String(result.status);
      if (!isTerminalStatus(status)) {
        throw new HiggsfieldSdkClientError('PROVIDER_FAILED');
      }

      const requestId = nonEmptyString(result.request_id);
      const videoUrl = nonEmptyString(result.video?.url);
      return {
        status,
        ...(requestId === undefined ? {} : { requestId }),
        ...(videoUrl === undefined ? {} : { videoUrl }),
      };
    } catch (error: unknown) {
      if (error instanceof HiggsfieldSdkClientError) throw error;
      throw mapSdkError(error);
    }
  }
}

function isTerminalStatus(value: string): value is HiggsfieldTerminalStatus {
  return ['completed', 'failed', 'nsfw', 'canceled'].includes(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function mapSdkError(error: unknown): HiggsfieldSdkClientError {
  if (error instanceof NotEnoughCreditsError) {
    return new HiggsfieldSdkClientError('INSUFFICIENT_CREDITS', 403);
  }
  if (error instanceof AuthenticationError) {
    return new HiggsfieldSdkClientError('AUTH_FAILED', 401);
  }
  if (error instanceof TimeoutError) {
    return new HiggsfieldSdkClientError('TIMEOUT');
  }
  if (error instanceof ValidationError || error instanceof BadInputError) {
    return new HiggsfieldSdkClientError('REQUEST_REJECTED', error.statusCode);
  }
  if (error instanceof APIError) {
    if (error.statusCode === 429) {
      return new HiggsfieldSdkClientError('RATE_LIMITED', 429);
    }
    return new HiggsfieldSdkClientError('PROVIDER_FAILED', error.statusCode);
  }
  return new HiggsfieldSdkClientError('PROVIDER_FAILED');
}
