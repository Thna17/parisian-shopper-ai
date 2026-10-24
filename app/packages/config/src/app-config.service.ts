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
  runLiveTests: boolean;
}

@Injectable()
export class AppConfigService {
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
    return this.config.get('LOG_PRETTY', { infer: true }) && this.nodeEnvironment !== 'production';
  }

  public get ai(): AIConfig {
    const openaiApiKey = this.config.get('OPENAI_API_KEY', { infer: true });
    const openaiModel = this.config.get('OPENAI_MODEL', { infer: true });
    const baseUrl = this.config.get('AI_BASE_URL', { infer: true });
    return {
      provider: this.config.get('AI_PROVIDER', { infer: true }),
      requestTimeoutMs: this.config.get('AI_REQUEST_TIMEOUT_MS', { infer: true }),
      attemptStaleAfterMs: this.config.get('AI_ATTEMPT_STALE_AFTER_MS', { infer: true }),
      maxRetries: this.config.get('AI_MAX_RETRIES', { infer: true }),
      ...(openaiApiKey === undefined ? {} : { openaiApiKey }),
      ...(openaiModel === undefined ? {} : { openaiModel }),
      ...(baseUrl === undefined ? {} : { baseUrl }),
    };
  }

  public get telegram(): TelegramConfig {
    const botToken = this.config.get('TELEGRAM_BOT_TOKEN', { infer: true });
    const webhookUrl = this.config.get('TELEGRAM_WEBHOOK_URL', { infer: true });
    const webhookSecret = this.config.get('TELEGRAM_WEBHOOK_SECRET', { infer: true });
    const channelId = this.config.get('TELEGRAM_CHANNEL_ID', { infer: true });
    return {
      mode: this.config.get('TELEGRAM_MODE', { infer: true }),
      actionTokenTtlSeconds: this.config.get('TELEGRAM_ACTION_TOKEN_TTL_SECONDS', { infer: true }),
      ...(botToken === undefined ? {} : { botToken }),
      ...(webhookUrl === undefined ? {} : { webhookUrl }),
      ...(webhookSecret === undefined ? {} : { webhookSecret }),
      ...(channelId === undefined ? {} : { channelId }),
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
