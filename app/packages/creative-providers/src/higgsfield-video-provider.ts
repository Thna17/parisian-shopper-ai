import {
  type CreativeVideoOptions,
  type CreativeVideoProvider,
  type GeneratedVideoAsset,
  HiggsfieldProviderError,
  type VideoCreativeBrief,
  videoCreativeBriefSchema,
} from '@parisian-shopper/application';
import { type ApplicationLogger } from '@parisian-shopper/common';

import {
  type HiggsfieldSdkClient,
  HiggsfieldSdkClientError,
  type HiggsfieldVideoModel,
  SUPPORTED_HIGGSFIELD_VIDEO_MODELS,
} from './higgsfield-sdk-client.js';

const noopLogger: ApplicationLogger = {
  log: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export interface HiggsfieldVideoProviderOptions {
  readonly model: string;
  readonly maxWaitMs: number;
  readonly defaultGenerateAudio: boolean;
}

export class HiggsfieldVideoProvider implements CreativeVideoProvider {
  public readonly providerId = 'higgsfield';
  private readonly model: HiggsfieldVideoModel;

  public constructor(
    private readonly client: HiggsfieldSdkClient,
    private readonly options: HiggsfieldVideoProviderOptions,
    private readonly logger: ApplicationLogger = noopLogger,
  ) {
    if (!isSupportedModel(options.model)) {
      throw new HiggsfieldProviderError({
        code: 'HIGGSFIELD_INVALID_REQUEST',
        publicMessage: 'Configured Higgsfield video model is not supported.',
        retryClassification: 'PERMANENT_UNTIL_CONFIGURATION_CHANGE',
        details: { model: options.model },
      });
    }
    this.model = options.model;
  }

  public async generateVideo(
    brief: VideoCreativeBrief,
    generationOptions?: CreativeVideoOptions,
  ): Promise<GeneratedVideoAsset> {
    const parsed = videoCreativeBriefSchema.safeParse(brief);
    if (!parsed.success) {
      throw new HiggsfieldProviderError({
        code: 'HIGGSFIELD_INVALID_REQUEST',
        publicMessage: 'Video creative brief is invalid.',
        retryClassification: 'PERMANENT_UNTIL_CONFIGURATION_CHANGE',
        details: { fields: parsed.error.issues.map((issue) => issue.path.join('.')) },
      });
    }

    const timeoutMs = generationOptions?.timeoutMs ?? this.options.maxWaitMs;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > this.options.maxWaitMs) {
      throw new HiggsfieldProviderError({
        code: 'HIGGSFIELD_INVALID_REQUEST',
        publicMessage: 'Higgsfield video timeout is outside the configured limit.',
        retryClassification: 'PERMANENT_UNTIL_CONFIGURATION_CHANGE',
        details: { maxWaitMs: this.options.maxWaitMs },
      });
    }

    this.logger.log('Submitting Higgsfield video generation', {
      provider: this.providerId,
      model: this.model,
      durationSeconds: parsed.data.durationSeconds,
      resolution: parsed.data.resolution,
      aspectRatio: parsed.data.aspectRatio,
    });

    try {
      const response = await withApplicationTimeout(
        this.client.subscribeVideo({
          model: this.model,
          prompt: parsed.data.prompt,
          duration: parsed.data.durationSeconds,
          resolution: parsed.data.resolution,
          aspectRatio: parsed.data.aspectRatio,
          outputFormat: parsed.data.outputFormat,
          generateAudio: parsed.data.generateAudio ?? this.options.defaultGenerateAudio,
        }),
        timeoutMs,
      );

      if (response.status === 'nsfw') {
        throw providerError(
          'HIGGSFIELD_MODERATION_BLOCKED',
          'Higgsfield blocked the video request during moderation.',
          'DO_NOT_RETRY_SAME_CONTENT',
          response.requestId,
          this.model,
        );
      }
      if (response.status === 'failed') {
        throw providerError(
          'HIGGSFIELD_GENERATION_FAILED',
          'Higgsfield video generation failed.',
          'TRANSIENT_WITH_BACKOFF',
          response.requestId,
          this.model,
        );
      }
      if (response.status === 'canceled') {
        throw providerError(
          'HIGGSFIELD_REQUEST_CANCELED',
          'Higgsfield video generation was canceled.',
          'UNKNOWN_PROVIDER_STATE',
          response.requestId,
          this.model,
        );
      }
      if (response.videoUrl === undefined || !isHttpsUrl(response.videoUrl)) {
        throw providerError(
          'HIGGSFIELD_RESULT_INVALID',
          'Higgsfield completed without a valid HTTPS video result.',
          'DO_NOT_RETRY_SAME_CONTENT',
          response.requestId,
          this.model,
        );
      }

      this.logger.log('Higgsfield video generation completed', {
        provider: this.providerId,
        model: this.model,
        ...(response.requestId === undefined ? {} : { providerRequestId: response.requestId }),
      });

      const generateAudio = parsed.data.generateAudio ?? this.options.defaultGenerateAudio;
      return {
        providerId: this.providerId,
        model: this.model,
        ...(response.requestId === undefined ? {} : { providerRequestId: response.requestId }),
        videoUrl: response.videoUrl,
        durationSeconds: parsed.data.durationSeconds,
        resolution: parsed.data.resolution,
        aspectRatio: parsed.data.aspectRatio,
        mimeType: parsed.data.outputFormat === 'mp4' ? 'video/mp4' : 'video/quicktime',
        metadata: {
          outputFormat: parsed.data.outputFormat,
          generateAudio,
          providerStatus: 'completed',
        },
      };
    } catch (error: unknown) {
      const mapped = mapProviderError(error, this.model);
      this.logger.warn('Higgsfield video generation did not complete', {
        provider: this.providerId,
        model: this.model,
        code: mapped.code,
        retryClassification: mapped.retryClassification,
        ...(mapped.details?.['providerRequestId'] === undefined
          ? {}
          : { providerRequestId: mapped.details['providerRequestId'] }),
      });
      throw mapped;
    }
  }
}

function isSupportedModel(model: string): model is HiggsfieldVideoModel {
  return (SUPPORTED_HIGGSFIELD_VIDEO_MODELS as readonly string[]).includes(model);
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function providerError(
  code: ConstructorParameters<typeof HiggsfieldProviderError>[0]['code'],
  publicMessage: string,
  retryClassification: ConstructorParameters<
    typeof HiggsfieldProviderError
  >[0]['retryClassification'],
  providerRequestId: string | undefined,
  model: string,
): HiggsfieldProviderError {
  return new HiggsfieldProviderError({
    code,
    publicMessage,
    retryClassification,
    details: {
      model,
      ...(providerRequestId === undefined ? {} : { providerRequestId }),
    },
  });
}

function mapProviderError(error: unknown, model: string): HiggsfieldProviderError {
  if (error instanceof HiggsfieldProviderError) return error;
  if (!(error instanceof HiggsfieldSdkClientError)) {
    return providerError(
      'HIGGSFIELD_UNKNOWN_STATE',
      'Higgsfield video generation state is unknown.',
      'UNKNOWN_PROVIDER_STATE',
      undefined,
      model,
    );
  }

  switch (error.kind) {
    case 'INSUFFICIENT_CREDITS':
      return providerError(
        'HIGGSFIELD_INSUFFICIENT_CREDITS',
        'Higgsfield account has insufficient credits.',
        'PERMANENT_UNTIL_ACCOUNT_ACTION',
        undefined,
        model,
      );
    case 'AUTH_FAILED':
      return providerError(
        'HIGGSFIELD_AUTH_FAILED',
        'Higgsfield authentication failed.',
        'PERMANENT_UNTIL_CONFIGURATION_CHANGE',
        undefined,
        model,
      );
    case 'RATE_LIMITED':
      return providerError(
        'HIGGSFIELD_RATE_LIMITED',
        'Higgsfield rate limit was reached.',
        'TRANSIENT_WITH_BACKOFF',
        undefined,
        model,
      );
    case 'REQUEST_REJECTED':
      return providerError(
        'HIGGSFIELD_INVALID_REQUEST',
        'Higgsfield rejected the video request.',
        'DO_NOT_RETRY_SAME_CONTENT',
        undefined,
        model,
      );
    case 'TIMEOUT':
      return providerError(
        'HIGGSFIELD_PROVIDER_TIMEOUT',
        'Higgsfield polling timed out; provider state is unknown.',
        'UNKNOWN_PROVIDER_STATE',
        undefined,
        model,
      );
    case 'PROVIDER_FAILED':
      return providerError(
        'HIGGSFIELD_GENERATION_FAILED',
        'Higgsfield provider request failed.',
        'TRANSIENT_WITH_BACKOFF',
        undefined,
        model,
      );
  }
}

async function withApplicationTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new HiggsfieldSdkClientError('TIMEOUT')), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}
