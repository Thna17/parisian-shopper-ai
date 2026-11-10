import { type ApplicationLogger } from '@parisian-shopper/common';

export interface MetaPublishingOptions {
  readonly graphApiVersion?: string | undefined;
  readonly baseUrl?: string | undefined;
  readonly defaultAccessToken?: string | undefined;
  readonly defaultFacebookPageId?: string | undefined;
  readonly defaultInstagramAccountId?: string | undefined;
  readonly fourEyesSecret?: string | undefined;
  readonly maxRetries?: number | undefined;
  readonly initialBackoffMs?: number | undefined;
  readonly backoffMultiplier?: number | undefined;
  readonly fetchFn?: typeof fetch | undefined;
  readonly logger?: ApplicationLogger | undefined;
}

export interface MetaGraphErrorResponse {
  readonly error?: {
    readonly message?: string | undefined;
    readonly type?: string | undefined;
    readonly code?: number | undefined;
    readonly error_subcode?: number | undefined;
    readonly fbtrace_id?: string | undefined;
    readonly is_transient?: boolean | undefined;
  };
}

export interface FacebookPhotoResponse {
  readonly id: string;
  readonly post_id?: string;
}

export interface InstagramMediaContainerResponse {
  readonly id: string;
}

export interface InstagramMediaPublishResponse {
  readonly id: string;
}
