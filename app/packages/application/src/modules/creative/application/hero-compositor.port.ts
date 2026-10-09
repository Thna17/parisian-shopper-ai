export const HERO_COMPOSITOR = Symbol('HERO_COMPOSITOR');

export interface CompositeVisualInput {
  readonly creativeJobId: string;
  readonly canonicalProductBuffer: Buffer;
  readonly canonicalProductMimeType: string;
  readonly canonicalProductSha256: string;
  readonly backgroundBuffer: Buffer;
  readonly backgroundMimeType: string;
  readonly backgroundSha256: string;
  readonly targetWidth: number;
  readonly targetHeight: number;
  readonly aspectRatio: string;
  readonly compositionMarginPercent?: number;
}

export interface HeroBoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CompositeVisualResult {
  readonly compositedBuffer: Buffer;
  readonly mimeType: 'image/png';
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
  readonly sha256: string;
  readonly latencyMs: number;
  readonly compositorVersion: string;
  readonly heroScale: number;
  readonly heroPlacement: string;
  readonly heroBoundingBox: HeroBoundingBox;
  readonly productDigest: string;
  readonly backgroundDigest: string;
  readonly outputDigest: string;
}

/**
 * HeroCompositor port.
 *
 * Invariant:
 * Deterministic local compositing only.
 * Places the trusted canonical product image over a verified AI-generated background.
 * CreativeProvider MUST NEVER manipulate the canonical product image.
 */
export interface HeroCompositor {
  composite(input: CompositeVisualInput): Promise<CompositeVisualResult>;
}
