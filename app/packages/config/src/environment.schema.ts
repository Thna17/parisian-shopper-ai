import { z } from 'zod';

const booleanFromEnvironment = z.preprocess((value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }

  return value;
}, z.boolean());

const optionalSecret = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().min(1).optional(),
);

const optionalUrl = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.url().optional(),
);

export const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_NAME: z.string().trim().min(1).max(100).default('parisian-shopper-ai'),
    APP_HOST: z.string().trim().min(1).default('127.0.0.1'),
    APP_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    APP_CORS_ORIGINS: z.string().default(''),
    APP_BODY_LIMIT: z
      .string()
      .regex(/^\d+(kb|mb)$/i)
      .default('1mb'),
    APP_SWAGGER_ENABLED: booleanFromEnvironment.default(false),

    DATABASE_URL: z
      .string()
      .min(1)
      .refine(
        (value) => value.startsWith('postgresql://') || value.startsWith('postgres://'),
        'DATABASE_URL must be a PostgreSQL URL',
      ),

    VALKEY_HOST: z.string().trim().min(1).default('127.0.0.1'),
    VALKEY_PORT: z.coerce.number().int().min(1).max(65_535).default(6379),
    VALKEY_PASSWORD: optionalSecret,

    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    LOG_PRETTY: booleanFromEnvironment.default(false),

    TELEGRAM_BOT_TOKEN: optionalSecret,
    AI_PROVIDER: z.enum(['fake', 'openai']).default('fake'),
    OPENAI_API_KEY: optionalSecret,
    OPENAI_MODEL: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.string().trim().min(1).max(200).optional(),
    ),
    AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
    AI_ATTEMPT_STALE_AFTER_MS: z.coerce.number().int().min(2_000).max(300_000).default(35_000),
    AI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
    AI_ALLOW_FAKE_IN_PRODUCTION: booleanFromEnvironment.default(false),
    AI_BASE_URL: optionalUrl,
    PRODUCT_API_BASE_URL: optionalUrl,
    PRODUCT_API_TOKEN: optionalSecret,

    FEATURE_AI_TEXT_GENERATION: booleanFromEnvironment.default(false),
    FEATURE_AI_IMAGE_GENERATION: booleanFromEnvironment.default(false),
    FEATURE_TELEGRAM: booleanFromEnvironment.default(false),
    FEATURE_PRODUCT_API: booleanFromEnvironment.default(false),
    FEATURE_AUTO_PUBLISHING: booleanFromEnvironment.default(false),
    FEATURE_META_PUBLISHING: booleanFromEnvironment.default(false),
    FEATURE_ANALYTICS: booleanFromEnvironment.default(false),
  })
  .superRefine((environment, context) => {
    if (environment.AI_ATTEMPT_STALE_AFTER_MS <= environment.AI_REQUEST_TIMEOUT_MS) {
      context.addIssue({
        code: 'custom',
        path: ['AI_ATTEMPT_STALE_AFTER_MS'],
        message: 'AI_ATTEMPT_STALE_AFTER_MS must exceed AI_REQUEST_TIMEOUT_MS',
      });
    }
    if (environment.FEATURE_TELEGRAM && environment.TELEGRAM_BOT_TOKEN === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['TELEGRAM_BOT_TOKEN'],
        message: 'TELEGRAM_BOT_TOKEN is required when FEATURE_TELEGRAM=true',
      });
    }

    if (
      environment.FEATURE_AI_TEXT_GENERATION &&
      environment.AI_PROVIDER === 'openai' &&
      environment.OPENAI_API_KEY === undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['OPENAI_API_KEY'],
        message: 'OPENAI_API_KEY is required when AI text generation uses OpenAI',
      });
    }

    if (
      environment.FEATURE_AI_TEXT_GENERATION &&
      environment.AI_PROVIDER === 'openai' &&
      environment.OPENAI_MODEL === undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['OPENAI_MODEL'],
        message: 'OPENAI_MODEL is required when AI text generation uses OpenAI',
      });
    }

    if (
      environment.NODE_ENV === 'production' &&
      environment.FEATURE_AI_TEXT_GENERATION &&
      environment.AI_PROVIDER === 'fake' &&
      !environment.AI_ALLOW_FAKE_IN_PRODUCTION
    ) {
      context.addIssue({
        code: 'custom',
        path: ['AI_PROVIDER'],
        message: 'Fake AI is prohibited in production unless explicitly permitted',
      });
    }

    if (environment.FEATURE_PRODUCT_API && environment.PRODUCT_API_BASE_URL === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['PRODUCT_API_BASE_URL'],
        message: 'PRODUCT_API_BASE_URL is required when FEATURE_PRODUCT_API=true',
      });
    }

    if (environment.FEATURE_AUTO_PUBLISHING) {
      context.addIssue({
        code: 'custom',
        path: ['FEATURE_AUTO_PUBLISHING'],
        message: 'Automatic publishing is unavailable and must remain disabled in the MVP',
      });
    }

    if (environment.FEATURE_META_PUBLISHING) {
      context.addIssue({
        code: 'custom',
        path: ['FEATURE_META_PUBLISHING'],
        message: 'Meta publishing is unavailable in Phase 1A',
      });
    }

    const origins = parseCorsOrigins(environment.APP_CORS_ORIGINS);
    if (environment.NODE_ENV === 'production' && origins.includes('*')) {
      context.addIssue({
        code: 'custom',
        path: ['APP_CORS_ORIGINS'],
        message: 'Wildcard CORS is prohibited in production',
      });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function parseCorsOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export function validateEnvironment(input: Record<string, unknown>): Environment {
  const result = environmentSchema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid application configuration: ${details}`);
  }

  return result.data;
}
