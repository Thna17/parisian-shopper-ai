export const CREATIVE_PROVIDER = Symbol('CREATIVE_PROVIDER');

export interface GenerateBackgroundRequest {
  readonly creativeJobId: string;
  readonly contentVersionId: string;
  readonly creativeBrief: string;
  readonly stylePrompt: string;
  readonly negativePrompt?: string;
  readonly width: number;
  readonly height: number;
  readonly aspectRatio: string;
  readonly seed?: number;
  readonly timeoutMs?: number;
}

export interface GenerateBackgroundResult {
  readonly imageBuffer: Buffer;
  readonly mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  readonly width: number;
  readonly height: number;
  readonly provider: string;
  readonly model: string;
  readonly seed?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly latencyMs: number;
  readonly estimatedCostUsd?: number;
}

/**
 * CreativeProvider port.
 *
 * Invariant:
 * The creative provider generates ambient background imagery ONLY.
 * It is strictly prohibited from synthesizing the canonical product packaging.
 */
export interface CreativeProvider {
  readonly providerName: string;
  readonly defaultModel: string;
  generateBackground(request: GenerateBackgroundRequest): Promise<GenerateBackgroundResult>;
}
