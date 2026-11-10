import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type Environment, parseCorsOrigins } from './environment.schema.js';
import { type FeatureFlag } from './feature-flags.js';

export interface ApplicationConfig {
  name: string;
  host: string;
  port: number;
  corsOrigins: readonly string[];
  bodyLimit: string;
  swaggerEnabled: boolean;
}

export interface ValkeyConfig {
  host: string;
  port: number;
  password?: string;
}

export interface AIConfig {
  provider: Environment['AI_PROVIDER'];
  openaiApiKey?: string;
  openaiModel?: string;
  baseUrl?: string;
  deepseekApiKey?: string;
  deepseekModel?: string;
  deepseekBaseUrl?: string;
  requestTimeoutMs: number;
  attemptStaleAfterMs: number;
  maxRetries: number;
}

export interface TelegramConfig {
  mode: Environment['TELEGRAM_MODE'];
  botToken?: string;
  webhookUrl?: string;
  webhookSecret?: string;
  actionTokenTtlSeconds: number;
  channelId?: string;
}

export interface CreativeConfig {
  provider: Environment['CREATIVE_PROVIDER'];
  storageRoot: string;
  maxBytes: number;
  allowFakeInProduction: boolean;
  allowLegacyProductAssetFallback: boolean;
  exportDownloadTokenSecret: string;
  exportDownloadTokenTtlSeconds: number;
}

export interface HiggsfieldConfig {
  provider: Environment['CREATIVE_VIDEO_PROVIDER'];
  credentials?: string;
  videoModel: Environment['HIGGSFIELD_VIDEO_MODEL'];
  videoMaxWaitMs: number;
  generateAudio: boolean;
  runLiveTests: boolean;
}

export interface CodexCliConfig {
  textTimeoutMs: number;
  imageTimeoutMs: number;
  maxConcurrency: number;
}

export interface ProductApiConfig {
  baseUrl?: string | undefined;
  businessId?: string | undefined;
  currency: string;
  allowedHosts: readonly string[];
  timeoutMs: number;
  maxRetries: number;
  token?: string | undefined;
  syncCron?: string | undefined;
  syncWebhookKey?: string | undefined;
  runLiveTests: boolean;
}

export interface MetaConfig {
  enabled: boolean;
  graphApiVersion: string;
  accessToken?: string | undefined;
  facebookPageId?: string | undefined;
  instagramAccountId?: string | undefined;
  fourEyesSecret: string;
}

@Injectable()
export class AppConfigService {
  get postImages(): {
    provider: Environment['POST_IMAGE_PROVIDER'];
    apiKey: string | undefined;
    assetHosts: string[];
    confirmedRequestId: string | undefined;
  } {
    return {
      provider: this.config.get('POST_IMAGE_PROVIDER', { infer: true }),
      apiKey: this.config.get('HF_POSTER_API_KEY', { infer: true }),
      assetHosts: this.config
        .get('HF_POSTER_ASSET_HOSTS', { infer: true })
        .split(',')
        .map((host) => host.trim())
        .filter(Boolean),
      confirmedRequestId: this.config.get('POST_IMAGE_CONFIRMED_REQUEST_ID', { infer: true }),
    };
  }

  get higgsfieldMcp(): {
    encryptionKey: string | undefined;
    redirectUri: string | undefined;
    clientId: string | undefined;
    clientSecret: string | undefined;
    clientAuthMethod: 'client_secret_post' | 'client_secret_basic';
    dispatchEnabled: boolean;
    sharedUseConfirmed: boolean;
  } {
    return {
      encryptionKey: this.config.get('HF_MCP_ENCRYPTION_KEY', { infer: true }),
      redirectUri: this.config.get('HF_MCP_REDIRECT_URI', { infer: true }),
      clientId: this.config.get('HF_MCP_CLIENT_ID', { infer: true }),
      clientSecret: this.config.get('HF_MCP_CLIENT_SECRET', { infer: true }),
      clientAuthMethod: this.config.get('HF_MCP_CLIENT_AUTH_METHOD', { infer: true }),
      dispatchEnabled: this.config.get('HF_MCP_DISPATCH_ENABLED', { infer: true }),
      sharedUseConfirmed: this.config.get('HF_MCP_SHARED_USE_CONFIRMED', { infer: true }),
    };
  }
  public constructor(private readonly config: ConfigService<Environment, true>) {}

  public get nodeEnvironment(): Environment['NODE_ENV'] {
    return this.config.get('NODE_ENV', { infer: true });
  }

  public get demoMode(): boolean {
    return this.config.get('DEMO_MODE', { infer: true });
  }

  public get application(): ApplicationConfig {
    return {
      name: this.config.get('APP_NAME', { infer: true }),
      host: this.config.get('APP_HOST', { infer: true }),
      port: this.config.get('APP_PORT', { infer: true }),
      corsOrigins: parseCorsOrigins(this.config.get('APP_CORS_ORIGINS', { infer: true })),
      bodyLimit: this.config.get('APP_BODY_LIMIT', { infer: true }),
      swaggerEnabled: this.config.get('APP_SWAGGER_ENABLED', { infer: true }),
    };
  }

  public get databaseUrl(): string {
    return this.config.get('DATABASE_URL', { infer: true });
  }

  public get valkey(): ValkeyConfig {
    const password = this.config.get('VALKEY_PASSWORD', { infer: true });
    return {
      host: this.config.get('VALKEY_HOST', { infer: true }),
      port: this.config.get('VALKEY_PORT', { infer: true }),
      ...(password === undefined ? {} : { password }),
    };
  }

  public get logLevel(): Environment['LOG_LEVEL'] {
    return this.config.get('LOG_LEVEL', { infer: true });
  }

  public get prettyLogs(): boolean {
    return (
      this.config.get('LOG_PRETTY', { infer: true }) &&
      this.nodeEnvironment !== 'production' &&
      this.nodeEnvironment !== 'test'
    );
  }

  public get postCaptionLiveDispatchEnabled(): boolean {
    return this.config.get('POST_CAPTION_REAL_DISPATCH_ENABLED', { infer: true });
  }

  public get ai(): AIConfig {
    const openaiApiKey = this.config.get('OPENAI_API_KEY', { infer: true });
    const openaiModel = this.config.get('OPENAI_MODEL', { infer: true });
    const baseUrl = this.config.get('AI_BASE_URL', { infer: true });
    const deepseekApiKey =
      this.config.get('DEEPSEEK_API_KEY', { infer: true }) ?? openaiApiKey;
    const deepseekModel =
      this.config.get('DEEPSEEK_MODEL', { infer: true }) ?? 'deepseek-chat';
    const deepseekBaseUrl =
      this.config.get('DEEPSEEK_BASE_URL', { infer: true }) ?? 'https://api.deepseek.com';
    return {
      provider: this.config.get('AI_PROVIDER', { infer: true }),
      requestTimeoutMs: this.config.get('AI_REQUEST_TIMEOUT_MS', { infer: true }),
      attemptStaleAfterMs: this.config.get('AI_ATTEMPT_STALE_AFTER_MS', { infer: true }),
      maxRetries: this.config.get('AI_MAX_RETRIES', { infer: true }),
      ...(openaiApiKey === undefined ? {} : { openaiApiKey }),
      ...(openaiModel === undefined ? {} : { openaiModel }),
      ...(baseUrl === undefined ? {} : { baseUrl }),
      ...(deepseekApiKey === undefined ? {} : { deepseekApiKey }),
      ...(deepseekModel === undefined ? {} : { deepseekModel }),
      ...(deepseekBaseUrl === undefined ? {} : { deepseekBaseUrl }),
    };
  }

  public get telegram(): TelegramConfig {
    const botToken = this.config.get('TELEGRAM_BOT_TOKEN', { infer: true });
    const webhookUrl = this.config.get('TELEGRAM_WEBHOOK_URL', { infer: true });
    const webhookSecret = this.config.get('TELEGRAM_WEBHOOK_SECRET', { infer: true });
    const channelId =
      this.config.get('TELEGRAM_CHANNEL_ID', { infer: true }) ?? '@parisian_shopper_kh';
    return {
      mode: this.config.get('TELEGRAM_MODE', { infer: true }),
      actionTokenTtlSeconds: this.config.get('TELEGRAM_ACTION_TOKEN_TTL_SECONDS', { infer: true }),
      ...(botToken === undefined ? {} : { botToken }),
      ...(webhookUrl === undefined ? {} : { webhookUrl }),
      ...(webhookSecret === undefined ? {} : { webhookSecret }),
      channelId,
    };
  }

  public get meta(): MetaConfig {
    const accessToken = this.config.get('META_ACCESS_TOKEN', { infer: true });
    const facebookPageId = this.config.get('META_FACEBOOK_PAGE_ID', { infer: true });
    const instagramAccountId = this.config.get('META_INSTAGRAM_ACCOUNT_ID', { infer: true });
    return {
      enabled: this.config.get('FEATURE_META_PUBLISHING', { infer: true }),
      graphApiVersion: this.config.get('META_GRAPH_API_VERSION', { infer: true }),
      fourEyesSecret: this.config.get('PUBLISHING_FOUR_EYES_SECRET', { infer: true }),
      ...(accessToken === undefined ? {} : { accessToken }),
      ...(facebookPageId === undefined ? {} : { facebookPageId }),
      ...(instagramAccountId === undefined ? {} : { instagramAccountId }),
    };
  }

  public get creative(): CreativeConfig {
    return {
      provider: this.config.get('CREATIVE_PROVIDER', { infer: true }),
      storageRoot: this.config.get('CREATIVE_ASSET_STORAGE_ROOT', { infer: true }),
      maxBytes: this.config.get('CREATIVE_ASSET_MAX_BYTES', { infer: true }),
      allowFakeInProduction: this.config.get('CREATIVE_ALLOW_FAKE_IN_PRODUCTION', { infer: true }),
      allowLegacyProductAssetFallback:
        this.config.get('ALLOW_LEGACY_PRODUCT_ASSET_FALLBACK', { infer: true }) ?? false,
      exportDownloadTokenSecret: this.config.get('EXPORT_DOWNLOAD_TOKEN_SECRET', { infer: true }),
      exportDownloadTokenTtlSeconds: this.config.get('EXPORT_DOWNLOAD_TOKEN_TTL_SECONDS', {
        infer: true,
      }),
    };
  }

  public get higgsfield(): HiggsfieldConfig {
    const credentials = this.config.get('HF_CREDENTIALS', { infer: true });
    return {
      provider: this.config.get('CREATIVE_VIDEO_PROVIDER', { infer: true }),
      videoModel: this.config.get('HIGGSFIELD_VIDEO_MODEL', { infer: true }),
      videoMaxWaitMs: this.config.get('HIGGSFIELD_VIDEO_MAX_WAIT_MS', { infer: true }),
      generateAudio: this.config.get('HIGGSFIELD_GENERATE_AUDIO', { infer: true }),
      runLiveTests: this.config.get('RUN_HIGGSFIELD_LIVE_TESTS', { infer: true }),
      ...(credentials === undefined ? {} : { credentials }),
    };
  }

  public get codexCli(): CodexCliConfig {
    return {
      textTimeoutMs: this.config.get('CODEX_CLI_TEXT_TIMEOUT_MS', { infer: true }),
      imageTimeoutMs: this.config.get('CODEX_CLI_IMAGE_TIMEOUT_MS', { infer: true }),
      maxConcurrency: this.config.get('CODEX_CLI_MAX_CONCURRENCY', { infer: true }),
    };
  }

  public get productApi(): ProductApiConfig {
    const rawHosts = this.config.get('PRODUCT_API_ALLOWED_HOSTS', { infer: true });
    const allowedHosts = rawHosts
      ? rawHosts
          .split(',')
          .map((host: string) => host.trim().toLowerCase())
          .filter((host: string) => host.length > 0)
      : [];
    return Object.freeze({
      baseUrl: this.config.get('PRODUCT_API_BASE_URL', { infer: true }),
      businessId: this.config.get('PRODUCT_API_BUSINESS_ID', { infer: true }),
      currency: this.config.get('PRODUCT_API_CURRENCY', { infer: true }) ?? 'USD',
      allowedHosts: Object.freeze(allowedHosts),
      timeoutMs: this.config.get('PRODUCT_API_TIMEOUT_MS', { infer: true }),
      maxRetries: this.config.get('PRODUCT_API_MAX_RETRIES', { infer: true }),
      token: this.config.get('PRODUCT_API_TOKEN', { infer: true }),
      syncCron: this.config.get('PRODUCT_CATALOG_SYNC_CRON', { infer: true }),
      syncWebhookKey: this.config.get('PRODUCT_SYNC_WEBHOOK_KEY', { infer: true }),
      runLiveTests: this.config.get('RUN_PRODUCT_API_LIVE_TESTS', { infer: true }),
    });
  }

  public get featureFlags(): Readonly<Record<FeatureFlag, boolean>> {
    return Object.freeze({
      AI_TEXT_GENERATION: this.config.get('FEATURE_AI_TEXT_GENERATION', { infer: true }),
      AI_IMAGE_GENERATION: this.config.get('FEATURE_AI_IMAGE_GENERATION', { infer: true }),
      CREATIVE_GENERATION: this.config.get('FEATURE_CREATIVE_GENERATION', { infer: true }),
      HIGGSFIELD_PROVIDER: this.config.get('FEATURE_HIGGSFIELD_PROVIDER', { infer: true }),
      PRODUCT_IMAGE_TO_VIDEO: this.config.get('FEATURE_PRODUCT_IMAGE_TO_VIDEO', { infer: true }),
      TELEGRAM: this.config.get('FEATURE_TELEGRAM', { infer: true }),
      PRODUCT_API: this.config.get('FEATURE_PRODUCT_API', { infer: true }),
      AUTO_PUBLISHING: this.config.get('FEATURE_AUTO_PUBLISHING', { infer: true }),
      META_PUBLISHING: this.config.get('FEATURE_META_PUBLISHING', { infer: true }),
      TELEGRAM_CHANNEL_PUBLISHING: this.config.get('FEATURE_TELEGRAM_CHANNEL_PUBLISHING', {
        infer: true,
      }),
      ANALYTICS: this.config.get('FEATURE_ANALYTICS', { infer: true }),
    });
  }
}
