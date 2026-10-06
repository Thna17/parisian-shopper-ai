export const CREATIVE_PROVIDER = Symbol('CREATIVE_PROVIDER');

export interface CreativeBrief {
  readonly creativeJobId: string;
  readonly contentVersionId: string;
  readonly briefText: string;
  readonly stylePrompt: string;
  readonly negativePrompt?: string;
  readonly targetWidth: number;
  readonly targetHeight: number;
  readonly aspectRatio: string;
  readonly creativeProfile: string;
}

export interface CreativeProviderOptions {
  readonly seed?: number;
  readonly timeoutMs?: number;
  readonly modelOverride?: string;
}

export interface GeneratedBackgroundAsset {
  readonly imageBuffer: Buffer;
  readonly mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  readonly width: number;
  readonly height: number;
  readonly providerId: string;
  readonly model: string;
  readonly seed?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly latencyMs: number;
  readonly estimatedCostUsd?: number;
}

/**
 * CreativeProvider port.
 *
 * Invariants:
 * 1. Background synthesis ONLY.
 * 2. CreativeProvider MUST NEVER manipulate, synthesize, or modify the canonical product imagery.
 * 3. Execution occurs exclusively asynchronously in background queue workers, never on HTTP/Telegram request cycles.
 */
export interface CreativeProvider {
  readonly providerId: string;
  generateBackground(
    brief: CreativeBrief,
    options?: CreativeProviderOptions,
  ): Promise<GeneratedBackgroundAsset>;
}
