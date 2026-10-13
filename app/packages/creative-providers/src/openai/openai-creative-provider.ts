import {
  type CreativeBrief,
  type CreativeProvider,
  type CreativeProviderOptions,
  type GeneratedBackgroundAsset,
} from '@parisian-shopper/application';
import { type ApplicationLogger } from '@parisian-shopper/common';

import {
  OpenAiCircuitBreakerOpenError,
  OpenAiDownloadLimitExceededError,
  OpenAiInvalidImageError,
  OpenAiProviderError,
  OpenAiRateLimitError,
  OpenAiTimeoutError,
} from './openai-errors.js';

export interface OpenAiCreativeProviderConfig {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly model?: string;
  readonly defaultQuality?: 'standard' | 'hd';
  readonly timeoutMs?: number;
  readonly maxBufferBytes?: number;
  readonly maxRetries?: number;
  readonly retryBackoffMs?: number;
  readonly circuitBreakerFailureThreshold?: number;
  readonly circuitBreakerResetTimeoutMs?: number;
  readonly fetchFn?: typeof fetch;
  readonly logger?: ApplicationLogger;
}

export type DalleSize = '1024x1024' | '1024x1792' | '1792x1024';

export class CircuitBreaker {
  private failures = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private nextAttemptAt = 0;

  public constructor(
    private readonly failureThreshold: number = 5,
    private readonly resetTimeoutMs: number = 30_000,
  ) {}

  public getState(): 'CLOSED' | 'OPEN' | 'HALF_OPEN' {
    if (this.state === 'OPEN' && Date.now() >= this.nextAttemptAt) {
      this.state = 'HALF_OPEN';
    }
    return this.state;
  }

  public recordSuccess(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  public recordFailure(): void {
    this.failures++;
    if (this.failures >= this.failureThreshold || this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.nextAttemptAt = Date.now() + this.resetTimeoutMs;
    }
  }

  public checkAllowed(): void {
    const currentState = this.getState();
    if (currentState === 'OPEN') {
      const waitRemainingMs = Math.max(0, this.nextAttemptAt - Date.now());
      throw new OpenAiCircuitBreakerOpenError(waitRemainingMs);
    }
  }
}

export function sanitizeSecret(text: string, secrets: readonly string[]): string {
  let sanitized = text;
  for (const secret of secrets) {
    if (secret && secret.length > 4) {
      sanitized = sanitized.replaceAll(secret, '[REDACTED]');
    }
  }
  sanitized = sanitized.replace(/Bearer\s+[A-Za-z0-9_\-.]+/gi, 'Bearer [REDACTED]');
  sanitized = sanitized.replace(/sk-[A-Za-z0-9_\-.]{15,}/gi, 'sk-[REDACTED]');
  return sanitized;
}

export function detectImageMimeType(
  buffer: Buffer | Uint8Array,
): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (buffer.length < 8) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  // WEBP: RIFF (4 bytes) + size (4 bytes) + WEBP (4 bytes)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

export class OpenAiCreativeProvider implements CreativeProvider {
  public readonly providerId = 'openai-dalle-3';

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly defaultQuality: 'standard' | 'hd';
  private readonly defaultTimeoutMs: number;
  private readonly maxBufferBytes: number;
  private readonly maxRetries: number;
  private readonly retryBackoffMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly logger: ApplicationLogger | undefined;
  private readonly circuitBreaker: CircuitBreaker;

  public constructor(config: OpenAiCreativeProviderConfig) {
    if (!config.apiKey || config.apiKey.trim().length === 0) {
      throw new Error('OPENAI_API_KEY is required for OpenAiCreativeProvider');
    }
    this.apiKey = config.apiKey.trim();
    this.baseUrl = config.baseUrl?.replace(/\/+$/u, '') ?? 'https://api.openai.com/v1';
    this.defaultModel = config.model ?? 'dall-e-3';
    this.defaultQuality = config.defaultQuality ?? 'standard';
    this.defaultTimeoutMs = config.timeoutMs ?? 45_000;
    this.maxBufferBytes = config.maxBufferBytes ?? 15 * 1024 * 1024; // 15MB
    this.maxRetries = config.maxRetries ?? 3;
    this.retryBackoffMs = config.retryBackoffMs ?? 500;
    this.fetchFn = config.fetchFn ?? globalThis.fetch;
    this.logger = config.logger;
    this.circuitBreaker = new CircuitBreaker(
      config.circuitBreakerFailureThreshold ?? 5,
      config.circuitBreakerResetTimeoutMs ?? 30_000,
    );
  }

  public async generateBackground(
    brief: CreativeBrief,
    options?: CreativeProviderOptions,
  ): Promise<GeneratedBackgroundAsset> {
    const startTime = Date.now();
    this.circuitBreaker.checkAllowed();

    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort(new Error(`TIMEOUT_${timeoutMs}`));
    }, timeoutMs);

    try {
      const result = await this.executeWithRetry(brief, options, controller.signal, timeoutMs);
      this.circuitBreaker.recordSuccess();
      const latencyMs = Date.now() - startTime;
      return {
        ...result,
        latencyMs,
      };
    } catch (error) {
      this.circuitBreaker.recordFailure();
      throw this.sanitizeError(error, timeoutMs);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async executeWithRetry(
    brief: CreativeBrief,
    options: CreativeProviderOptions | undefined,
    signal: AbortSignal,
    timeoutMs: number,
  ): Promise<Omit<GeneratedBackgroundAsset, 'latencyMs'>> {
    const prompt = this.buildPrompt(brief);
    const size = this.mapDimensions(brief);
    const model = options?.modelOverride ?? this.defaultModel;
    const quality = this.defaultQuality;

    let attempt = 0;
    while (attempt <= this.maxRetries) {
      if (signal.aborted) {
        throw new OpenAiTimeoutError(timeoutMs);
      }

      try {
        const response = await this.fetchFn(`${this.baseUrl}/images/generations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model,
            prompt,
            n: 1,
            size: size.sizeString,
            quality,
            response_format: 'url',
          }),
          signal,
        });

        if (!response.ok) {
          const status = response.status;
          let errorBodyText = '';
          try {
            errorBodyText = await response.text();
          } catch {
            errorBodyText = response.statusText;
          }

          if (status === 429) {
            const retryHeader = response.headers.get('retry-after');
            const retryMs = retryHeader ? parseInt(retryHeader, 10) * 1000 : undefined;
            if (attempt < this.maxRetries) {
              await this.delay(retryMs ?? this.retryBackoffMs * 2 ** attempt, signal);
              attempt++;
              continue;
            }
            throw new OpenAiRateLimitError(
              `OpenAI rate limit exceeded (HTTP 429): ${errorBodyText}`,
              retryMs,
            );
          }

          if (status >= 500 && status <= 504 && attempt < this.maxRetries) {
            await this.delay(this.retryBackoffMs * 2 ** attempt, signal);
            attempt++;
            continue;
          }

          throw new OpenAiProviderError(
            `OpenAI Images API request failed with status ${status}: ${errorBodyText}`,
            { status, model, size: size.sizeString },
          );
        }

        const data = (await response.json()) as {
          created: number;
          data: { url?: string; b64_json?: string; revised_prompt?: string }[];
        };

        const firstItem = data.data?.[0];
        if (!firstItem) {
          throw new OpenAiProviderError('OpenAI Images API returned empty data array');
        }

        const { buffer, mimeType } = await this.downloadImage(firstItem, signal);

        return {
          imageBuffer: buffer,
          mimeType,
          width: size.width,
          height: size.height,
          providerId: this.providerId,
          model,
          ...(options?.seed !== undefined ? { seed: options.seed } : {}),
          metadata: {
            revisedPrompt: firstItem.revised_prompt,
            quality,
            dalleSize: size.sizeString,
          },
          estimatedCostUsd: quality === 'hd' ? 0.08 : 0.04,
        };
      } catch (err) {
        if (signal.aborted) {
          throw new OpenAiTimeoutError(timeoutMs);
        }

        if (this.isTransientNetworkError(err) && attempt < this.maxRetries) {
          await this.delay(this.retryBackoffMs * 2 ** attempt, signal);
          attempt++;
          continue;
        }

        throw err;
      }
    }

    throw new OpenAiProviderError(`Exhausted ${this.maxRetries} retries calling OpenAI Images API`);
  }

  private async downloadImage(
    item: { url?: string; b64_json?: string },
    signal: AbortSignal,
  ): Promise<{ buffer: Buffer; mimeType: 'image/png' | 'image/jpeg' }> {
    if (item.b64_json) {
      const buffer = Buffer.from(item.b64_json, 'base64');
      if (buffer.length > this.maxBufferBytes) {
        throw new OpenAiDownloadLimitExceededError(buffer.length, this.maxBufferBytes);
      }
      const detected = detectImageMimeType(buffer);
      if (detected !== 'image/png' && detected !== 'image/jpeg') {
        throw new OpenAiInvalidImageError(detected ?? 'unknown');
      }
      return { buffer, mimeType: detected };
    }

    if (!item.url) {
      throw new OpenAiProviderError('OpenAI response missing both image URL and b64_json');
    }

    const parsed = new URL(item.url);
    if (parsed.protocol !== 'https:') {
      throw new OpenAiProviderError('Insecure download URL: TLS is required for downloading creative assets');
    }

    const response = await this.fetchFn(item.url, { method: 'GET', signal });
    if (!response.ok) {
      throw new OpenAiProviderError(
        `Failed to download generated creative asset: HTTP ${response.status} ${response.statusText}`,
      );
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength !== null) {
      const parsedLength = parseInt(contentLength, 10);
      if (!Number.isNaN(parsedLength) && parsedLength > this.maxBufferBytes) {
        throw new OpenAiDownloadLimitExceededError(parsedLength, this.maxBufferBytes);
      }
    }

    if (!response.body) {
      const arrayBuf = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      if (buffer.length > this.maxBufferBytes) {
        throw new OpenAiDownloadLimitExceededError(buffer.length, this.maxBufferBytes);
      }
      const detected = detectImageMimeType(buffer);
      if (detected !== 'image/png' && detected !== 'image/jpeg') {
        throw new OpenAiInvalidImageError(detected ?? 'unknown');
      }
      return { buffer, mimeType: detected };
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.length;
        if (totalBytes > this.maxBufferBytes) {
          await reader.cancel();
          throw new OpenAiDownloadLimitExceededError(totalBytes, this.maxBufferBytes);
        }
        chunks.push(value);
      }
    }

    const completeBuffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    const detected = detectImageMimeType(completeBuffer);
    if (detected !== 'image/png' && detected !== 'image/jpeg') {
      throw new OpenAiInvalidImageError(detected ?? 'unknown');
    }

    return { buffer: completeBuffer, mimeType: detected };
  }

  private buildPrompt(brief: CreativeBrief): string {
    const rawPrompt = brief.stylePrompt.trim();
    const avoidances = brief.negativePrompt?.trim()
      ? ` Avoid: ${brief.negativePrompt.trim()}.`
      : '';

    // Enforce prompt sandboxing: clean background scene only, without foreground objects or products
    const prompt =
      `Ultra-luxury Parisian background scene. ${rawPrompt}. ` +
      `Photorealistic, soft architectural daylight, elegant textures, clean studio aesthetic. ` +
      `Strictly an empty background environment with open negative space in the center, absolutely no foreground products, no bottles, no handbags, no people, no text, no watermarks, no logos.${avoidances}`;

    return prompt.slice(0, 4000);
  }

  private mapDimensions(brief: CreativeBrief): {
    sizeString: DalleSize;
    width: number;
    height: number;
  } {
    if (brief.aspectRatio === '4:5' || brief.aspectRatio === '9:16' || brief.targetHeight > brief.targetWidth) {
      return { sizeString: '1024x1792', width: 1024, height: 1792 };
    }
    if (brief.aspectRatio === '16:9' || brief.targetWidth > brief.targetHeight) {
      return { sizeString: '1792x1024', width: 1792, height: 1024 };
    }
    return { sizeString: '1024x1024', width: 1024, height: 1024 };
  }

  private isTransientNetworkError(err: unknown): boolean {
    if (err instanceof Error) {
      const msg = err.message.toLowerCase();
      return (
        msg.includes('fetch failed') ||
        msg.includes('econnreset') ||
        msg.includes('etimedout') ||
        msg.includes('network') ||
        msg.includes('socket')
      );
    }
    return false;
  }

  private delay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new OpenAiTimeoutError(ms));
      });
    });
  }

  private sanitizeError(error: unknown, timeoutMs: number): Error {
    if (error instanceof Error && error.message.startsWith(`TIMEOUT_${timeoutMs}`)) {
      return new OpenAiTimeoutError(timeoutMs);
    }
    if (
      error instanceof OpenAiTimeoutError ||
      error instanceof OpenAiCircuitBreakerOpenError ||
      error instanceof OpenAiDownloadLimitExceededError ||
      error instanceof OpenAiInvalidImageError ||
      error instanceof OpenAiRateLimitError
    ) {
      return error;
    }

    const rawMessage = error instanceof Error ? error.message : String(error);
    const sanitized = sanitizeSecret(rawMessage, [this.apiKey]);
    return new OpenAiProviderError(sanitized);
  }
}
