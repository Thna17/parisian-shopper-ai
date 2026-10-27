import { type CreativeSceneVersionRecord } from '../domain/scene/creative-scene.types.js';

export const HYBRID_COMPOSITOR = Symbol('HYBRID_COMPOSITOR');
export const HYBRID_COMPOSITOR_VERSION = 'ps-hybrid-compositor-v1';

export type HybridCompositorAspectRatio = '1:1' | '4:5' | '9:16';

export type CompositorLayerGroup =
  'BACKGROUND' | 'SURFACE' | 'SHADOW' | 'PRODUCT_HERO' | 'BRAND_LOGO' | 'TYPOGRAPHY' | 'DECORATIVE';

export type CompositorCacheStatus = 'HIT' | 'MISS';

export type LayerAssetResolver = (storageKey: string) => Promise<Buffer | null>;

export interface CompositorPlacement {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly opacity?: number | undefined;
}

export interface CompositorLayerInput {
  readonly layerIndex: number;
  readonly layerGroup: CompositorLayerGroup;
  readonly buffer: Buffer;
  readonly mimeType: string;
  readonly contentDigest: string;
  readonly placement?: CompositorPlacement | undefined;
}

export interface HybridCompositorCanvas {
  readonly width: number;
  readonly height: number;
  readonly safeMargins?:
    | {
        readonly left: number;
        readonly top: number;
        readonly right: number;
        readonly bottom: number;
      }
    | undefined;
}

export interface HybridCompositorInput {
  readonly creativeJobId: string;
  readonly sceneVersionId?: string | undefined;
  readonly templateId?: string | undefined;
  readonly aspectRatio: HybridCompositorAspectRatio;
  readonly canvas: HybridCompositorCanvas;
  readonly layers: readonly CompositorLayerInput[];
  readonly colorProfile?: 'sRGB' | undefined;
  readonly enableContactShadow?: boolean | undefined;
  readonly allowNonApprovedForTesting?: boolean | undefined;
}

export interface LayerExecutionManifestEntry {
  readonly layerIndex: number;
  readonly layerGroup: string;
  readonly sha256: string;
  readonly applied: boolean;
}

export interface HybridCompositorResult {
  readonly compositedBuffer: Buffer;
  readonly mimeType: 'image/png';
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
  readonly sha256: string;
  readonly latencyMs: number;
  readonly compositorVersion: string;
  readonly cacheStatus: CompositorCacheStatus;
  readonly layerExecutionManifest: readonly LayerExecutionManifestEntry[];
  readonly colorProfile: 'sRGB';
  readonly sceneHash?: string | undefined;
  readonly dependencyHash?: string | undefined;
}

/**
 * Deterministic Hybrid Compositor Port.
 *
 * Implements strict 8-layer Z-order compositing with deterministic
 * caching, sRGB IEC61966-2.1 color normalization, authentic product
 * packaging pixel preservation, and HarfBuzz shaped vector typography.
 */
export interface HybridCompositor {
  composite(input: HybridCompositorInput): Promise<HybridCompositorResult>;
  renderSceneVersion(
    sceneVersion: CreativeSceneVersionRecord,
    assetResolver: LayerAssetResolver,
  ): Promise<HybridCompositorResult>;
}
