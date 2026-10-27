import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { type AssetStoragePort } from '../application/asset-storage.port.js';
import {
  HYBRID_COMPOSITOR_VERSION,
  type CompositorLayerInput,
  type CompositorPlacement,
  type HybridCompositorInput,
  type HybridCompositorResult,
  type LayerExecutionManifestEntry,
} from '../application/hybrid-compositor.port.js';
import {
  CompositorColorProfileError,
  CompositorCorruptedLayerAssetError,
  CompositorLayerMissingAssetError,
  CompositorUnsupportedCanvasGeometryError,
} from '../domain/creative-errors.js';
import { canonicalStringify } from '../domain/scene/scene-hash.js';

export interface RenderCacheLayerKeyInput {
  readonly layerIndex: number;
  readonly layerGroup: string;
  readonly contentDigest: string;
  readonly mimeType?: string;
  readonly placement?: CompositorPlacement;
}

export interface RenderCacheKeyInput {
  readonly compositorVersion?: string | undefined;
  readonly canvas: { readonly width: number; readonly height: number };
  readonly layers: readonly (CompositorLayerInput | RenderCacheLayerKeyInput)[];
  readonly colorProfile?: string | undefined;
}

export interface CachedRenderEntry {
  readonly cacheKey: string;
  readonly compositedBuffer: Buffer;
  readonly mimeType: 'image/png';
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
  readonly sha256: string;
  readonly compositorVersion: string;
  readonly colorProfile: 'sRGB';
  readonly layerExecutionManifest: readonly LayerExecutionManifestEntry[];
  readonly createdAt: Date;
  readonly storageKey?: string;
}

export interface CompositorRenderCacheOptions {
  readonly maxMemoryEntries?: number;
  readonly maxMemoryBytes?: number;
  readonly assetStorage?: AssetStoragePort;
}

const DEFAULT_MAX_MEMORY_ENTRIES = 50;
const DEFAULT_MAX_MEMORY_BYTES = 128 * 1024 * 1024; // 128 MB

/**
 * Normalizes a layer input into a minimal digest payload for deterministic cache key derivation.
 * Strips raw image buffers while preserving layerIndex, layerGroup, contentDigest, mimeType, and placement.
 */
export function normalizeLayerForCacheKey(
  layer: CompositorLayerInput | RenderCacheLayerKeyInput,
): RenderCacheLayerKeyInput {
  return {
    layerIndex: layer.layerIndex,
    layerGroup: layer.layerGroup,
    contentDigest: layer.contentDigest,
    ...(layer.mimeType !== undefined ? { mimeType: layer.mimeType } : {}),
    ...(layer.placement !== undefined ? { placement: layer.placement } : {}),
  };
}

/**
 * Validates canvas geometry, failing fast if dimensions are non-positive or non-integer.
 */
export function validateCompositorCanvas(canvas: {
  readonly width: number;
  readonly height: number;
}): void {
  if (
    !canvas ||
    typeof canvas.width !== 'number' ||
    typeof canvas.height !== 'number' ||
    canvas.width <= 0 ||
    canvas.height <= 0 ||
    !Number.isInteger(canvas.width) ||
    !Number.isInteger(canvas.height)
  ) {
    throw new CompositorUnsupportedCanvasGeometryError(
      canvas?.width,
      canvas?.height,
      'Canvas width and height must be positive integers',
    );
  }
}

/**
 * Validates color profile, enforcing sRGB IEC61966-2.1.
 */
export function validateCompositorColorProfile(colorProfile?: string): void {
  if (colorProfile !== undefined && colorProfile !== 'sRGB') {
    throw new CompositorColorProfileError(
      colorProfile,
      'Only sRGB color profile is supported in this compositor version',
    );
  }
}

/**
 * Validates all layer assets for presence and cryptographic integrity.
 * Throws CompositorLayerMissingAssetError if a buffer or digest is missing.
 * Throws CompositorCorruptedLayerAssetError if sha256(buffer) does not match contentDigest.
 */
export function validateCompositorLayers(layers: readonly CompositorLayerInput[]): void {
  for (const layer of layers) {
    if (!layer.buffer || !Buffer.isBuffer(layer.buffer) || layer.buffer.length === 0) {
      throw new CompositorLayerMissingAssetError(
        layer.layerIndex,
        'Layer asset buffer is missing or empty',
      );
    }

    if (
      !layer.contentDigest ||
      typeof layer.contentDigest !== 'string' ||
      layer.contentDigest.trim() === ''
    ) {
      throw new CompositorLayerMissingAssetError(
        layer.layerIndex,
        'Layer contentDigest is missing or empty',
      );
    }

    const computedDigest = createHash('sha256').update(layer.buffer).digest('hex').toLowerCase();

    if (computedDigest !== layer.contentDigest.toLowerCase()) {
      throw new CompositorCorruptedLayerAssetError(
        layer.layerIndex,
        layer.contentDigest,
        computedDigest,
      );
    }
  }
}

/**
 * Full preflight input validation.
 */
export function validateCompositorInput(input: {
  readonly canvas: { readonly width: number; readonly height: number };
  readonly layers: readonly CompositorLayerInput[];
  readonly colorProfile?: string | undefined;
}): void {
  validateCompositorCanvas(input.canvas);
  validateCompositorColorProfile(input.colorProfile);
  validateCompositorLayers(input.layers);
}

/**
 * Computes a deterministic SHA-256 cache key from compositor version, canvas geometry,
 * sorted layer digests, and color profile.
 *
 * Formula: sha256(canonicalStringify({ compositorVersion, canvas, layers, colorProfile }))
 */
export function computeRenderCacheKey(options: RenderCacheKeyInput): string {
  const compositorVersion = options.compositorVersion ?? HYBRID_COMPOSITOR_VERSION;
  const colorProfile = options.colorProfile ?? 'sRGB';
  const canvas = {
    width: options.canvas.width,
    height: options.canvas.height,
  };

  const layers = options.layers
    .map(normalizeLayerForCacheKey)
    .sort((a, b) => a.layerIndex - b.layerIndex);

  const payload = {
    canvas,
    colorProfile,
    compositorVersion,
    layers,
  };

  const canonical = canonicalStringify(payload);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Two-Tier Content-Addressable Render Cache for Deterministic Hybrid Compositor.
 *
 * - Tier 1: In-memory LRU cache bounded by entry count and byte capacity.
 * - Tier 2: Persistent Content-Addressable Storage (CAS) backed by AssetStoragePort.
 * - Thread-safe thundering-herd coalesce for concurrent lookups.
 * - Cryptographic verification on retrieval to guarantee tamper immunity.
 */
export class CompositorRenderCache {
  private readonly memoryCache: Map<string, CachedRenderEntry> = new Map();
  private readonly keyToStorageKey: Map<string, string> = new Map();
  private readonly pendingLookups: Map<string, Promise<HybridCompositorResult | null>> = new Map();

  private readonly maxMemoryEntries: number;
  private readonly maxMemoryBytes: number;
  private readonly assetStorage?: AssetStoragePort | undefined;
  private currentBytes = 0;

  public constructor(options?: CompositorRenderCacheOptions) {
    this.maxMemoryEntries = options?.maxMemoryEntries ?? DEFAULT_MAX_MEMORY_ENTRIES;
    this.maxMemoryBytes = options?.maxMemoryBytes ?? DEFAULT_MAX_MEMORY_BYTES;
    this.assetStorage = options?.assetStorage;
  }

  /**
   * Computes deterministic cache key for the given render parameters.
   */
  public computeKey(options: RenderCacheKeyInput): string {
    return computeRenderCacheKey(options);
  }

  /**
   * Validates compositor input parameters.
   */
  public validateInput(input: {
    readonly canvas: { readonly width: number; readonly height: number };
    readonly layers: readonly CompositorLayerInput[];
    readonly colorProfile?: string | undefined;
  }): void {
    validateCompositorInput(input);
  }

  /**
   * Looks up a rendered creative by cacheKey.
   * Checks L1 memory first, then falls back to L2 CAS.
   * Returns identical Buffer, sha256, dimensions, and execution manifest on hit.
   */
  public async get(cacheKey: string): Promise<HybridCompositorResult | null> {
    const startTime = performance.now();

    // 1. Check L1 Memory Cache (synchronous LRU hit)
    const memoryHit = this.memoryCache.get(cacheKey);
    if (memoryHit !== undefined) {
      // Re-insert to mark as Most Recently Used
      this.memoryCache.delete(cacheKey);
      this.memoryCache.set(cacheKey, memoryHit);

      const latencyMs = Math.round((performance.now() - startTime) * 100) / 100;
      return this.entryToResult(memoryHit, 'HIT', latencyMs);
    }

    // 2. If no L2 backing or no mapping, miss immediately
    if (!this.assetStorage) {
      return null;
    }

    const storageKey = this.keyToStorageKey.get(cacheKey);
    if (!storageKey) {
      return null;
    }

    // 3. Coalesce concurrent L2 lookups for identical cacheKey
    const inFlight = this.pendingLookups.get(cacheKey);
    if (inFlight !== undefined) {
      return inFlight;
    }

    const lookupPromise = this.fetchFromL2(cacheKey, storageKey, startTime);
    this.pendingLookups.set(cacheKey, lookupPromise);

    try {
      return await lookupPromise;
    } finally {
      this.pendingLookups.delete(cacheKey);
    }
  }

  /**
   * High-level lookup accepting full HybridCompositorInput.
   * Runs fail-closed validation on layers and geometry before lookup.
   */
  public async getForInput(input: HybridCompositorInput): Promise<HybridCompositorResult | null> {
    this.validateInput(input);
    const key = this.computeKey({
      compositorVersion: HYBRID_COMPOSITOR_VERSION,
      canvas: input.canvas,
      layers: input.layers,
      colorProfile: input.colorProfile ?? 'sRGB',
    });
    return this.get(key);
  }

  /**
   * Stores a freshly composited creative into L1 memory and optionally L2 CAS.
   */
  public async set(
    cacheKey: string,
    result: Omit<HybridCompositorResult, 'cacheStatus' | 'latencyMs'>,
    options?: { readonly storageKey?: string },
  ): Promise<void> {
    let resolvedStorageKey = options?.storageKey ?? this.keyToStorageKey.get(cacheKey);

    // Save to L2 CAS if available and not yet stored
    if (this.assetStorage && !resolvedStorageKey) {
      const stored = await this.assetStorage.saveAsset({
        buffer: result.compositedBuffer,
        mimeType: 'image/png',
        assetRole: 'COMPOSITED_CREATIVE',
        width: result.width,
        height: result.height,
        metadata: {
          cacheKey,
          sha256: result.sha256,
          compositorVersion: result.compositorVersion,
          colorProfile: result.colorProfile,
        },
      });
      resolvedStorageKey = stored.storageKey;
      this.keyToStorageKey.set(cacheKey, resolvedStorageKey);
    } else if (resolvedStorageKey) {
      this.keyToStorageKey.set(cacheKey, resolvedStorageKey);
    }

    const entry: CachedRenderEntry = {
      cacheKey,
      compositedBuffer: result.compositedBuffer,
      mimeType: result.mimeType,
      width: result.width,
      height: result.height,
      byteSize: result.byteSize,
      sha256: result.sha256,
      compositorVersion: result.compositorVersion,
      colorProfile: result.colorProfile,
      layerExecutionManifest: result.layerExecutionManifest,
      createdAt: new Date(),
      ...(resolvedStorageKey !== undefined ? { storageKey: resolvedStorageKey } : {}),
    };

    // Remove existing entry byte footprint if key is overwritten
    const existing = this.memoryCache.get(cacheKey);
    if (existing !== undefined) {
      this.currentBytes -= existing.byteSize;
      this.memoryCache.delete(cacheKey);
    }

    this.memoryCache.set(cacheKey, entry);
    this.currentBytes += entry.byteSize;

    // Enforce LRU eviction
    this.evictToCapacity();
  }

  /**
   * Returns true if entry exists in L1 memory.
   */
  public has(cacheKey: string): boolean {
    return this.memoryCache.has(cacheKey);
  }

  /**
   * Invalidates a specific cache entry, or clears all entries if key omitted.
   */
  public invalidate(cacheKey?: string): void {
    if (cacheKey !== undefined) {
      const existing = this.memoryCache.get(cacheKey);
      if (existing !== undefined) {
        this.currentBytes -= existing.byteSize;
        this.memoryCache.delete(cacheKey);
      }
      this.keyToStorageKey.delete(cacheKey);
      this.pendingLookups.delete(cacheKey);
    } else {
      this.clear();
    }
  }

  /**
   * Clears the entire in-memory cache and mapping indices.
   */
  public clear(): void {
    this.memoryCache.clear();
    this.keyToStorageKey.clear();
    this.pendingLookups.clear();
    this.currentBytes = 0;
  }

  /**
   * Returns current count of entries in L1 memory.
   */
  public size(): number {
    return this.memoryCache.size;
  }

  /**
   * Returns current byte footprint of entries in L1 memory.
   */
  public memoryBytes(): number {
    return this.currentBytes;
  }

  private async fetchFromL2(
    cacheKey: string,
    storageKey: string,
    startTime: number,
  ): Promise<HybridCompositorResult | null> {
    if (!this.assetStorage) {
      return null;
    }

    try {
      const [buffer, metadata] = await Promise.all([
        this.assetStorage.getAssetBuffer(storageKey),
        this.assetStorage.getMetadata(storageKey),
      ]);

      if (!buffer || !metadata) {
        return null;
      }

      // Verify content digest integrity to fail closed on tampered disk files
      const digest = createHash('sha256').update(buffer).digest('hex').toLowerCase();
      if (digest !== metadata.sha256Digest.toLowerCase()) {
        this.keyToStorageKey.delete(cacheKey);
        return null;
      }

      const entry: CachedRenderEntry = {
        cacheKey,
        compositedBuffer: buffer,
        mimeType: 'image/png',
        width: metadata.width ?? 0,
        height: metadata.height ?? 0,
        byteSize: buffer.length,
        sha256: metadata.sha256Digest,
        compositorVersion: HYBRID_COMPOSITOR_VERSION,
        colorProfile: 'sRGB',
        layerExecutionManifest: [],
        createdAt: metadata.createdAt,
        storageKey,
      };

      // Populate L1 memory
      this.memoryCache.set(cacheKey, entry);
      this.currentBytes += entry.byteSize;
      this.evictToCapacity();

      const latencyMs = Math.round((performance.now() - startTime) * 100) / 100;
      return this.entryToResult(entry, 'HIT', latencyMs);
    } catch {
      return null;
    }
  }

  private evictToCapacity(): void {
    while (
      this.memoryCache.size > this.maxMemoryEntries ||
      (this.maxMemoryBytes > 0 &&
        this.currentBytes > this.maxMemoryBytes &&
        this.memoryCache.size > 1)
    ) {
      const oldestKey = this.memoryCache.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      const entry = this.memoryCache.get(oldestKey);
      if (entry !== undefined) {
        this.currentBytes -= entry.byteSize;
      }
      this.memoryCache.delete(oldestKey);
    }
  }

  private entryToResult(
    entry: CachedRenderEntry,
    cacheStatus: 'HIT' | 'MISS',
    latencyMs: number,
  ): HybridCompositorResult {
    return {
      compositedBuffer: entry.compositedBuffer,
      mimeType: entry.mimeType,
      width: entry.width,
      height: entry.height,
      byteSize: entry.byteSize,
      sha256: entry.sha256,
      latencyMs,
      compositorVersion: entry.compositorVersion,
      cacheStatus,
      layerExecutionManifest: entry.layerExecutionManifest,
      colorProfile: entry.colorProfile,
    };
  }
}
