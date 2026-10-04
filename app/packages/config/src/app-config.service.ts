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

@Injectable()
export class AppConfigService {
  public constructor(private readonly config: ConfigService<Environment, true>) {}

  public get nodeEnvironment(): Environment['NODE_ENV'] {
    return this.config.get('NODE_ENV', { infer: true });
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

  public get featureFlags(): Readonly<Record<FeatureFlag, boolean>> {
    return Object.freeze({
      AI_TEXT_GENERATION: this.config.get('FEATURE_AI_TEXT_GENERATION', { infer: true }),
      AI_IMAGE_GENERATION: this.config.get('FEATURE_AI_IMAGE_GENERATION', { infer: true }),
      TELEGRAM: this.config.get('FEATURE_TELEGRAM', { infer: true }),
      PRODUCT_API: this.config.get('FEATURE_PRODUCT_API', { infer: true }),
      AUTO_PUBLISHING: this.config.get('FEATURE_AUTO_PUBLISHING', { infer: true }),
      META_PUBLISHING: this.config.get('FEATURE_META_PUBLISHING', { infer: true }),
      ANALYTICS: this.config.get('FEATURE_ANALYTICS', { infer: true }),
    });
  }
}
