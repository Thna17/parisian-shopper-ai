import { Injectable, Optional } from '@nestjs/common';
import {
  type PublishingGateway,
  type PublishPostPayload,
  type PublishPostResult,
  PublishingSafetyInvariantError,
  verifyFourEyesProof,
} from '@parisian-shopper/application';
import { type ApplicationLogger } from '@parisian-shopper/common';

import {
  MetaApiError,
  MetaConfigurationError,
  MetaRetryExhaustedError,
} from './meta-publishing.errors.js';
import type {
  FacebookPhotoResponse,
  InstagramMediaContainerResponse,
  InstagramMediaPublishResponse,
  MetaGraphErrorResponse,
  MetaPublishingOptions,
} from './meta-publishing.types.js';

@Injectable()
export class MetaPublishingGateway implements PublishingGateway {
  private readonly baseUrl: string;
  private readonly defaultAccessToken?: string | undefined;
  private readonly defaultFacebookPageId?: string | undefined;
  private readonly defaultInstagramAccountId?: string | undefined;
  private readonly fourEyesSecret: string;
  private readonly maxRetries: number;
  private readonly initialBackoffMs: number;
  private readonly backoffMultiplier: number;
  private readonly fetchFn: typeof fetch;
  private readonly logger?: ApplicationLogger | undefined;

  public constructor(@Optional() options: MetaPublishingOptions = {}) {
    const version = options.graphApiVersion ?? 'v21.0';
    this.baseUrl = (options.baseUrl ?? `https://graph.facebook.com/${version}`).replace(/\/+$/, '');
    this.defaultAccessToken = options.defaultAccessToken;
    this.defaultFacebookPageId = options.defaultFacebookPageId;
    this.defaultInstagramAccountId = options.defaultInstagramAccountId;
    this.fourEyesSecret =
      options.fourEyesSecret ??
      process.env.PUBLISHING_FOUR_EYES_SECRET ??
      'parisian-shopper-four-eyes-secret-production-key';
    this.maxRetries = Math.max(0, options.maxRetries ?? 3);
    this.initialBackoffMs = Math.max(1, options.initialBackoffMs ?? 300);
    this.backoffMultiplier = Math.max(1, options.backoffMultiplier ?? 2);
    this.fetchFn = options.fetchFn ?? fetch;
    this.logger = options.logger;
  }

  public async publishPost(payload: PublishPostPayload): Promise<PublishPostResult> {
    // 1. Publishing Safety Invariants Enforcement:
    // Invariant A: Job status must strictly be APPROVED
    if (payload.contentJobStatus !== 'APPROVED') {
      const currentStatus: string = payload.contentJobStatus;
      throw new PublishingSafetyInvariantError(
        `Cannot publish unapproved content job. Current status: ${currentStatus}`,
      );
    }

    // Invariant B: Four-Eyes Verification must be cryptographically confirmed
    if (!payload.fourEyesProof) {
      throw new PublishingSafetyInvariantError(
        'Four-Eyes verification proof is missing from publication payload',
      );
    }
    verifyFourEyesProof(payload.fourEyesProof, this.fourEyesSecret);

    // 2. Dispatch to designated channel
    if (payload.channel === 'FACEBOOK_PAGE') {
      return this.publishToFacebookPage(payload);
    }

    if (payload.channel === 'INSTAGRAM') {
      return this.publishToInstagram(payload);
    }

    throw new MetaConfigurationError(`Unsupported Meta channel: ${String(payload.channel)}`);
  }

  private async publishToFacebookPage(payload: PublishPostPayload): Promise<PublishPostResult> {
    const pageId = payload.targetAccountId ?? this.defaultFacebookPageId;
    if (!pageId) {
      throw new MetaConfigurationError(
        'Facebook Page ID is required (neither targetAccountId nor defaultFacebookPageId configured)',
      );
    }

    const accessToken = this.defaultAccessToken ?? process.env.META_ACCESS_TOKEN;
    if (!accessToken) {
      throw new MetaConfigurationError('Meta Access Token is required for publishing');
    }

    const endpoint = `${this.baseUrl}/${encodeURIComponent(pageId)}/photos`;
    const bodyParams = new URLSearchParams({
      url: payload.imageUrl,
      caption: payload.caption,
      access_token: accessToken,
    });

    const responseData = await this.executeWithRetry<FacebookPhotoResponse>(
      `Facebook Page Photo [${pageId}]`,
      async () => {
        const res = await this.fetchFn(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: bodyParams.toString(),
        });
        return this.parseAndValidateResponse<FacebookPhotoResponse>(res);
      },
    );

    const publicationId = responseData.post_id ?? responseData.id;
    return {
      success: true,
      externalPublicationId: publicationId,
      permalinkUrl: `https://facebook.com/${publicationId}`,
      channel: 'FACEBOOK_PAGE',
      publishedAt: new Date(),
      rawProviderResult: responseData as unknown as Record<string, unknown>,
    };
  }

  private async publishToInstagram(payload: PublishPostPayload): Promise<PublishPostResult> {
    const igUserId = payload.targetAccountId ?? this.defaultInstagramAccountId;
    if (!igUserId) {
      throw new MetaConfigurationError(
        'Instagram Professional Account ID is required (neither targetAccountId nor defaultInstagramAccountId configured)',
      );
    }

    const accessToken = this.defaultAccessToken ?? process.env.META_ACCESS_TOKEN;
    if (!accessToken) {
      throw new MetaConfigurationError('Meta Access Token is required for publishing');
    }

    // Step 1: Create IG Media Container via POST /{ig-user-id}/media
    const createContainerEndpoint = `${this.baseUrl}/${encodeURIComponent(igUserId)}/media`;
    const containerParams = new URLSearchParams({
      image_url: payload.imageUrl,
      caption: payload.caption,
      access_token: accessToken,
    });

    const containerData = await this.executeWithRetry<InstagramMediaContainerResponse>(
      `Instagram Media Container [${igUserId}]`,
      async () => {
        const res = await this.fetchFn(createContainerEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: containerParams.toString(),
        });
        return this.parseAndValidateResponse<InstagramMediaContainerResponse>(res);
      },
    );

    const creationId = containerData.id;

    // Step 2: Publish Media Container via POST /{ig-user-id}/media_publish
    const publishEndpoint = `${this.baseUrl}/${encodeURIComponent(igUserId)}/media_publish`;
    const publishParams = new URLSearchParams({
      creation_id: creationId,
      access_token: accessToken,
    });

    const publishData = await this.executeWithRetry<InstagramMediaPublishResponse>(
      `Instagram Media Publish [${creationId}]`,
      async () => {
        const res = await this.fetchFn(publishEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: publishParams.toString(),
        });
        return this.parseAndValidateResponse<InstagramMediaPublishResponse>(res);
      },
    );

    const mediaId = publishData.id;
    return {
      success: true,
      externalPublicationId: mediaId,
      permalinkUrl: `https://instagram.com/p/${mediaId}`,
      channel: 'INSTAGRAM',
      publishedAt: new Date(),
      rawProviderResult: publishData as unknown as Record<string, unknown>,
    };
  }

  private async executeWithRetry<T>(operationName: string, op: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await op();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const isTransient = this.isTransientError(err);

        if (!isTransient) {
          throw lastError;
        }

        if (attempt >= this.maxRetries) {
          throw new MetaRetryExhaustedError(attempt + 1, lastError);
        }

        const delay = this.initialBackoffMs * Math.pow(this.backoffMultiplier, attempt);
        this.logger?.warn(
          `Transient error during ${operationName} (attempt ${attempt + 1}/${this.maxRetries + 1}). Retrying in ${delay}ms: ${lastError.message}`,
          { attempt, delay, operationName },
        );

        await this.delay(delay);
      }
    }

    throw new MetaRetryExhaustedError(this.maxRetries + 1, lastError ?? new Error('Unknown error'));
  }

  private async parseAndValidateResponse<T>(res: Response): Promise<T> {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      if (!res.ok) {
        throw new MetaApiError(`Meta API HTTP ${res.status}: ${res.statusText}`, {
          statusCode: res.status,
          isTransient: res.status >= 500,
        });
      }
      throw new MetaApiError('Failed to parse Meta API JSON response', {
        statusCode: res.status,
      });
    }

    const metaRes = body as MetaGraphErrorResponse;
    if (!res.ok || metaRes.error) {
      const err = metaRes.error;
      const errorCode = err?.code;
      const errorSubcode = err?.error_subcode;
      const message = err?.message ?? `Meta API request failed with status ${res.status}`;
      const isTransient =
        res.status >= 500 ||
        errorCode === 500 ||
        errorSubcode === 2207001 ||
        err?.is_transient === true ||
        errorCode === 1 ||
        errorCode === 2 ||
        errorCode === 4 ||
        errorCode === 17;

      throw new MetaApiError(message, {
        statusCode: res.status,
        errorCode,
        errorSubcode,
        fbtraceId: err?.fbtrace_id,
        isTransient,
      });
    }

    return body as T;
  }

  private isTransientError(error: unknown): boolean {
    if (error instanceof MetaApiError) {
      return error.isTransient;
    }
    // Network / fetch errors are transient
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return true;
    }
    return false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
