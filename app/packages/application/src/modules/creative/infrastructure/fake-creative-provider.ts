import * as crypto from 'node:crypto';
import {
  type CreativeBrief,
  type CreativeProvider,
  type CreativeProviderOptions,
  type GeneratedBackgroundAsset,
} from '../application/creative-provider.port.js';
import {
  CreativeBriefValidationError,
  CreativeProviderProductionGuardError,
  FakeCreativeProviderError,
  FakeCreativeProviderTimeoutError,
} from '../domain/creative-errors.js';
import {
  DEFAULT_FIXTURE_SEED,
  generateDeterministicBackgroundPng,
} from './fixtures/fake-background-fixtures.js';

export interface FakeCreativeProviderConfig {
  readonly isProduction?: boolean | undefined;
  readonly allowFakeInProduction?: boolean | undefined;
  readonly defaultSeed?: number | undefined;
  readonly defaultLatencyMs?: number | undefined;
}

export type FakeCreativeProviderFailureMode =
  | { readonly type: 'none' }
  | { readonly type: 'error'; readonly message?: string | undefined }
  | { readonly type: 'timeout'; readonly delayMs?: number | undefined }
  | { readonly type: 'corrupt_buffer' };

export interface FakeCreativeProviderInvocation {
  readonly brief: CreativeBrief;
  readonly options?: CreativeProviderOptions | undefined;
  readonly timestamp: Date;
}

export class FakeCreativeProvider implements CreativeProvider {
  public readonly providerId = 'fake-creative-provider';

  private failureMode: FakeCreativeProviderFailureMode = { type: 'none' };
  private simulatedLatencyMs?: number | undefined;
  private readonly callHistory: FakeCreativeProviderInvocation[] = [];

  public constructor(private readonly config: FakeCreativeProviderConfig = {}) {}

  /**
   * Generates a deterministic background asset from a structured CreativeBrief.
   *
   * Invariants:
   * 1. Background synthesis ONLY. Canonical product imagery is NEVER accepted, touched, or altered.
   * 2. Fails closed immediately in production unless explicitly permitted.
   * 3. Output is 100% deterministic given the same brief and seed.
   */
  public generateBackground(
    brief: CreativeBrief,
    options?: CreativeProviderOptions,
  ): Promise<GeneratedBackgroundAsset> {
    try {
      this.assertProductionGuard();
      this.validateBrief(brief);
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }

    this.callHistory.push({
      brief,
      ...(options !== undefined ? { options } : {}),
      timestamp: new Date(),
    });

    if (this.failureMode.type === 'error') {
      return Promise.reject(
        new FakeCreativeProviderError(
          this.failureMode.message ?? 'Synthetic creative provider error',
        ),
      );
    }

    if (this.failureMode.type === 'timeout') {
      const delayMs = this.failureMode.delayMs ?? options?.timeoutMs ?? 5000;
      return Promise.reject(new FakeCreativeProviderTimeoutError(delayMs));
    }

    const effectiveSeed =
      options?.seed ?? this.config.defaultSeed ?? this.deriveSeedFromBrief(brief);

    const latencyMs = this.simulatedLatencyMs ?? this.config.defaultLatencyMs ?? 15;

    if (this.failureMode.type === 'corrupt_buffer') {
      return Promise.resolve({
        imageBuffer: Buffer.from('NOT_A_VALID_PNG_CORRUPTED_DATA'),
        mimeType: 'image/png',
        width: brief.targetWidth,
        height: brief.targetHeight,
        providerId: this.providerId,
        model: options?.modelOverride ?? 'fake-creative-v1',
        seed: effectiveSeed,
        metadata: {
          creativeProfile: brief.creativeProfile,
          stylePrompt: brief.stylePrompt,
          aspectRatio: brief.aspectRatio,
          corrupted: true,
        },
        latencyMs,
        estimatedCostUsd: 0,
      });
    }

    const imageBuffer = generateDeterministicBackgroundPng({
      width: brief.targetWidth,
      height: brief.targetHeight,
      seed: effectiveSeed,
      profile: brief.creativeProfile,
    });

    return Promise.resolve({
      imageBuffer,
      mimeType: 'image/png',
      width: brief.targetWidth,
      height: brief.targetHeight,
      providerId: this.providerId,
      model: options?.modelOverride ?? 'fake-creative-v1',
      seed: effectiveSeed,
      metadata: {
        creativeProfile: brief.creativeProfile,
        stylePrompt: brief.stylePrompt,
        aspectRatio: brief.aspectRatio,
        generatedAt: new Date().toISOString(),
      },
      latencyMs,
      estimatedCostUsd: 0,
    });
  }

  // --- Test Double Controls ---

  public setFailureMode(mode: FakeCreativeProviderFailureMode): void {
    this.failureMode = mode;
  }

  public setSimulatedLatencyMs(ms: number): void {
    this.simulatedLatencyMs = ms;
  }

  public getCallHistory(): readonly FakeCreativeProviderInvocation[] {
    return [...this.callHistory];
  }

  public clearCallHistory(): void {
    this.callHistory.length = 0;
  }

  public reset(): void {
    this.failureMode = { type: 'none' };
    this.simulatedLatencyMs = undefined;
    this.clearCallHistory();
  }

  // --- Internal Invariant Guards & Helpers ---

  private assertProductionGuard(): void {
    const isProduction = this.config.isProduction ?? process.env['NODE_ENV'] === 'production';
    const allowFake =
      this.config.allowFakeInProduction ??
      process.env['CREATIVE_ALLOW_FAKE_IN_PRODUCTION'] === 'true';

    if (isProduction && !allowFake) {
      throw new CreativeProviderProductionGuardError(
        'Fake creative provider is prohibited in production without explicit CREATIVE_ALLOW_FAKE_IN_PRODUCTION=true',
      );
    }
  }

  private validateBrief(brief: CreativeBrief): void {
    if (!brief) {
      throw new CreativeBriefValidationError('Creative brief must be defined');
    }
    if (!brief.creativeJobId || brief.creativeJobId.trim() === '') {
      throw new CreativeBriefValidationError('creativeJobId is required');
    }
    if (!brief.contentVersionId || brief.contentVersionId.trim() === '') {
      throw new CreativeBriefValidationError('contentVersionId is required');
    }
    if (!brief.briefText || brief.briefText.trim() === '') {
      throw new CreativeBriefValidationError('briefText must not be empty');
    }
    if (!brief.stylePrompt || brief.stylePrompt.trim() === '') {
      throw new CreativeBriefValidationError('stylePrompt must not be empty');
    }
    if (!Number.isInteger(brief.targetWidth) || brief.targetWidth <= 0) {
      throw new CreativeBriefValidationError('targetWidth must be a positive integer');
    }
    if (!Number.isInteger(brief.targetHeight) || brief.targetHeight <= 0) {
      throw new CreativeBriefValidationError('targetHeight must be a positive integer');
    }
    if (brief.targetWidth > 4096 || brief.targetHeight > 4096) {
      throw new CreativeBriefValidationError(
        'targetWidth and targetHeight must not exceed 4096 pixels',
      );
    }
    if (!brief.creativeProfile || brief.creativeProfile.trim() === '') {
      throw new CreativeBriefValidationError('creativeProfile must not be empty');
    }
  }

  private deriveSeedFromBrief(brief: CreativeBrief): number {
    const hash = crypto
      .createHash('sha256')
      .update(
        `${brief.creativeProfile}:${brief.stylePrompt}:${brief.targetWidth}:${brief.targetHeight}`,
      )
      .digest();
    return hash.readInt32BE(0) || DEFAULT_FIXTURE_SEED;
  }
}
