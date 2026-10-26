import { type PosterSpec } from '../domain/poster-spec.js';
import { type PosterLayoutManifest } from '../domain/poster-templates.js';

export const POSTER_COMPOSITOR = Symbol('POSTER_COMPOSITOR');
export const POSTER_COMPOSITOR_VERSION = 'ps-poster-compositor-v2';

export interface RenderPosterInput {
  readonly creativeJobId: string;
  readonly posterSpec: PosterSpec;
  readonly canonicalProductBuffer: Buffer;
  readonly canonicalProductMimeType: string;
  readonly canonicalProductSha256: string;
  readonly backgroundBuffer: Buffer;
  readonly backgroundMimeType: string;
  readonly backgroundSha256: string;
  readonly logoBuffer?: Buffer;
  readonly logoMimeType?: string;
  readonly generateDebugLayout?: boolean;
  readonly allowNonApprovedForTesting?: boolean;
}

export interface RenderPosterResult {
  readonly posterBuffer: Buffer;
  readonly mimeType: 'image/png';
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
  readonly sha256: string;
  readonly latencyMs: number;
  readonly compositorVersion: string;
  readonly layoutManifest: PosterLayoutManifest;
  readonly debugLayoutBuffer?: Buffer | undefined;
  readonly productDigest: string;
  readonly backgroundDigest: string;
  readonly outputDigest: string;
}

/**
 * Deterministic Poster Compositor Port (V2).
 *
 * Implements strict 8-layer compositing:
 * 1. AI-generated photographic background.
 * 2. Readability contrast gradient or localized panel.
 * 3. Decorative vector/raster elements.
 * 4. Separate product contact shadow layer.
 * 5. Authentic product image.
 * 6. Brand logo from trusted asset storage.
 * 7. Exact typography.
 * 8. Small legal/footer text.
 */
export interface PosterCompositor {
  renderPoster(input: RenderPosterInput): Promise<RenderPosterResult>;
}
