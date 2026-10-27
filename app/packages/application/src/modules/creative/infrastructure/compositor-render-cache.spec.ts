import { createHash } from 'node:crypto';
import { describe, expect, it } from '@jest/globals';
import {
  type AssetStoragePort,
  type SaveAssetInput,
  type StoredAssetMetadata,
} from '../application/asset-storage.port.js';
import {
  HYBRID_COMPOSITOR_VERSION,
  type CompositorLayerInput,
  type HybridCompositorInput,
  type HybridCompositorResult,
} from '../application/hybrid-compositor.port.js';
import {
  CompositorColorProfileError,
  CompositorCorruptedLayerAssetError,
  CompositorLayerMissingAssetError,
  CompositorUnsupportedCanvasGeometryError,
} from '../domain/creative-errors.js';
import { canonicalStringify } from '../domain/scene/scene-hash.js';
import {
  CompositorRenderCache,
  computeRenderCacheKey,
  normalizeLayerForCacheKey,
  validateCompositorCanvas,
  validateCompositorColorProfile,
  validateCompositorInput,
  validateCompositorLayers,
} from './compositor-render-cache.js';

function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex').toLowerCase();
}

function makeFakeLayer(
  layerIndex: number,
  layerGroup: CompositorLayerInput['layerGroup'],
  content: string,
  placement?: CompositorLayerInput['placement'],
): CompositorLayerInput {
  const buffer = Buffer.from(content, 'utf8');
  return {
    layerIndex,
    layerGroup,
    buffer,
    mimeType: 'image/png',
    contentDigest: sha256(buffer),
    ...(placement !== undefined ? { placement } : {}),
  };
}

class InMemoryAssetStorageMock implements AssetStoragePort {
  public readonly buffers = new Map<string, Buffer>();
  public readonly metadata = new Map<string, StoredAssetMetadata>();
  public saveCount = 0;
  public getBufferCount = 0;

  public saveAsset(input: SaveAssetInput): Promise<StoredAssetMetadata> {
    this.saveCount += 1;
    const digest = sha256(input.buffer);
    const storageKey = `cas/${digest.slice(0, 2)}/${digest.slice(2, 4)}/${digest}.png`;
    const meta: StoredAssetMetadata = {
      storageKey,
      sha256Digest: digest,
      mimeType: input.mimeType,
      byteSize: input.buffer.length,
      ...(input.width !== undefined ? { width: input.width } : {}),
      ...(input.height !== undefined ? { height: input.height } : {}),
      assetRole: input.assetRole,
      createdAt: new Date(),
    };
    this.buffers.set(storageKey, Buffer.from(input.buffer));
    this.metadata.set(storageKey, meta);
    return Promise.resolve(meta);
  }

  public getMetadata(storageKey: string): Promise<StoredAssetMetadata | null> {
    return Promise.resolve(this.metadata.get(storageKey) ?? null);
  }

  public getAssetBuffer(storageKey: string): Promise<Buffer | null> {
    this.getBufferCount += 1;
    const buf = this.buffers.get(storageKey);
    return Promise.resolve(buf ? Buffer.from(buf) : null);
  }

  public assetExists(storageKey: string): Promise<boolean> {
    return Promise.resolve(this.buffers.has(storageKey));
  }
}

describe('Deterministic Hybrid Compositor Render Cache', () => {
  const sampleCanvas = { width: 1080, height: 1080 };
  const sampleLayers: readonly CompositorLayerInput[] = [
    makeFakeLayer(0, 'BACKGROUND', 'fake-bg-asset'),
    makeFakeLayer(200, 'PRODUCT_HERO', 'fake-product-asset', {
      x: 140,
      y: 200,
      width: 800,
      height: 680,
      opacity: 1,
    }),
    makeFakeLayer(350, 'TYPOGRAPHY', 'fake-typography-asset'),
  ];

  describe('1. Deterministic Cache Key Generation', () => {
    it('generates identical cache key across multiple invocations with same input', () => {
      const key1 = computeRenderCacheKey({
        canvas: sampleCanvas,
        layers: sampleLayers,
      });

      const key2 = computeRenderCacheKey({
        canvas: sampleCanvas,
        layers: sampleLayers,
      });

      expect(key1).toBe(key2);
      expect(key1).toMatch(/^[0-9a-f]{64}$/);
    });

    it('matches exact formula sha256(canonicalStringify({ compositorVersion, canvas, layers, colorProfile }))', () => {
      const key = computeRenderCacheKey({
        compositorVersion: HYBRID_COMPOSITOR_VERSION,
        canvas: sampleCanvas,
        layers: sampleLayers,
        colorProfile: 'sRGB',
      });

      const normalizedLayers = sampleLayers
        .map(normalizeLayerForCacheKey)
        .sort((a, b) => a.layerIndex - b.layerIndex);

      const expectedPayload = {
        canvas: sampleCanvas,
        colorProfile: 'sRGB',
        compositorVersion: HYBRID_COMPOSITOR_VERSION,
        layers: normalizedLayers,
      };

      const expected = sha256(canonicalStringify(expectedPayload));
      expect(key).toBe(expected);
    });

    it('is immune to layer array ordering (sorts by layerIndex deterministically)', () => {
      const reversedLayers = [...sampleLayers].reverse();
      const keyNormal = computeRenderCacheKey({ canvas: sampleCanvas, layers: sampleLayers });
      const keyReversed = computeRenderCacheKey({ canvas: sampleCanvas, layers: reversedLayers });

      expect(keyNormal).toBe(keyReversed);
    });

    it('produces distinct keys when canvas dimensions differ', () => {
      const key1 = computeRenderCacheKey({
        canvas: { width: 1080, height: 1080 },
        layers: sampleLayers,
      });
      const key2 = computeRenderCacheKey({
        canvas: { width: 1080, height: 1350 },
        layers: sampleLayers,
      });
      const key3 = computeRenderCacheKey({
        canvas: { width: 1080, height: 1920 },
        layers: sampleLayers,
      });

      expect(key1).not.toBe(key2);
      expect(key2).not.toBe(key3);
      expect(key1).not.toBe(key3);
    });

    it('produces distinct keys when layer contentDigest changes', () => {
      const modifiedLayers: readonly CompositorLayerInput[] = [
        sampleLayers[0]!,
        makeFakeLayer(200, 'PRODUCT_HERO', 'modified-product-asset', {
          x: 140,
          y: 200,
          width: 800,
          height: 680,
          opacity: 1,
        }),
        sampleLayers[2]!,
      ];

      const keyOriginal = computeRenderCacheKey({ canvas: sampleCanvas, layers: sampleLayers });
      const keyModified = computeRenderCacheKey({ canvas: sampleCanvas, layers: modifiedLayers });

      expect(keyOriginal).not.toBe(keyModified);
    });

    it('produces distinct keys when layer placement changes', () => {
      const movedLayers: readonly CompositorLayerInput[] = [
        sampleLayers[0]!,
        makeFakeLayer(200, 'PRODUCT_HERO', 'fake-product-asset', {
          x: 180, // shifted x
          y: 200,
          width: 800,
          height: 680,
          opacity: 1,
        }),
        sampleLayers[2]!,
      ];

      const keyOriginal = computeRenderCacheKey({ canvas: sampleCanvas, layers: sampleLayers });
      const keyMoved = computeRenderCacheKey({ canvas: sampleCanvas, layers: movedLayers });

      expect(keyOriginal).not.toBe(keyMoved);
    });

    it('produces distinct keys when compositorVersion changes', () => {
      const keyV1 = computeRenderCacheKey({
        compositorVersion: 'ps-hybrid-compositor-v1',
        canvas: sampleCanvas,
        layers: sampleLayers,
      });

      const keyV2 = computeRenderCacheKey({
        compositorVersion: 'ps-hybrid-compositor-v2',
        canvas: sampleCanvas,
        layers: sampleLayers,
      });

      expect(keyV1).not.toBe(keyV2);
    });
  });

  describe('2. Cache Hit vs Cache Miss Behavior', () => {
    it('returns null on cache miss for unseen key', async () => {
      const cache = new CompositorRenderCache();
      const result = await cache.get(
        '0000000000000000000000000000000000000000000000000000000000000000',
      );
      expect(result).toBeNull();
    });

    it('stores and retrieves render result with identical Buffer and metadata (L1 Memory Hit)', async () => {
      const cache = new CompositorRenderCache();
      const key = cache.computeKey({ canvas: sampleCanvas, layers: sampleLayers });

      const fakeCompositedPng = Buffer.from('FAKE-COMPOSITED-PNG-BYTES', 'utf8');
      const pngSha256 = sha256(fakeCompositedPng);

      const renderResult: Omit<HybridCompositorResult, 'cacheStatus' | 'latencyMs'> = {
        compositedBuffer: fakeCompositedPng,
        mimeType: 'image/png',
        width: 1080,
        height: 1080,
        byteSize: fakeCompositedPng.length,
        sha256: pngSha256,
        compositorVersion: HYBRID_COMPOSITOR_VERSION,
        layerExecutionManifest: [
          {
            layerIndex: 0,
            layerGroup: 'BACKGROUND',
            sha256: sampleLayers[0]!.contentDigest,
            applied: true,
          },
          {
            layerIndex: 200,
            layerGroup: 'PRODUCT_HERO',
            sha256: sampleLayers[1]!.contentDigest,
            applied: true,
          },
          {
            layerIndex: 350,
            layerGroup: 'TYPOGRAPHY',
            sha256: sampleLayers[2]!.contentDigest,
            applied: true,
          },
        ],
        colorProfile: 'sRGB',
      };

      await cache.set(key, renderResult);
      expect(cache.has(key)).toBe(true);

      const hit = await cache.get(key);
      expect(hit).not.toBeNull();
      expect(hit?.cacheStatus).toBe('HIT');
      expect(hit?.compositedBuffer).toEqual(fakeCompositedPng);
      expect(hit?.sha256).toBe(pngSha256);
      expect(hit?.width).toBe(1080);
      expect(hit?.height).toBe(1080);
      expect(hit?.byteSize).toBe(fakeCompositedPng.length);
      expect(hit?.compositorVersion).toBe(HYBRID_COMPOSITOR_VERSION);
      expect(hit?.colorProfile).toBe('sRGB');
      expect(hit?.layerExecutionManifest).toHaveLength(3);
    });

    it('falls back to L2 CAS storage when entry is absent from L1 memory', async () => {
      const storageMock = new InMemoryAssetStorageMock();
      const cache = new CompositorRenderCache({ assetStorage: storageMock });
      const key = cache.computeKey({ canvas: sampleCanvas, layers: sampleLayers });

      const fakeCompositedPng = Buffer.from('L2-CAS-RENDERED-PNG-BYTES', 'utf8');
      const pngSha256 = sha256(fakeCompositedPng);

      await cache.set(key, {
        compositedBuffer: fakeCompositedPng,
        mimeType: 'image/png',
        width: 1080,
        height: 1080,
        byteSize: fakeCompositedPng.length,
        sha256: pngSha256,
        compositorVersion: HYBRID_COMPOSITOR_VERSION,
        layerExecutionManifest: [],
        colorProfile: 'sRGB',
      });

      expect(storageMock.saveCount).toBe(1);

      // Simulate process restart or L1 eviction by clearing L1 memory cache directly
      // while retaining keyToStorageKey mapping
      expect(cache.has(key)).toBe(true);

      // Remove from L1 memory cache only (simulating memory eviction)
      // We can create a new cache instance sharing storageMock and registered mapping
      const cache2 = new CompositorRenderCache({ assetStorage: storageMock });
      // Initially cache2 has no mapping:
      expect(await cache2.get(key)).toBeNull();

      // Now register mapping in cache and fetch
      cache.invalidate(); // clears L1, but wait: invalidate() clears mappings too
      // Let's verify normal L2 flow:
      await cache.set(key, {
        compositedBuffer: fakeCompositedPng,
        mimeType: 'image/png',
        width: 1080,
        height: 1080,
        byteSize: fakeCompositedPng.length,
        sha256: pngSha256,
        compositorVersion: HYBRID_COMPOSITOR_VERSION,
        layerExecutionManifest: [],
        colorProfile: 'sRGB',
      });

      // Evict from L1 memory by overflowing memory capacity with other entries
      const smallL1Cache = new CompositorRenderCache({
        maxMemoryEntries: 1,
        assetStorage: storageMock,
      });

      await smallL1Cache.set(key, {
        compositedBuffer: fakeCompositedPng,
        mimeType: 'image/png',
        width: 1080,
        height: 1080,
        byteSize: fakeCompositedPng.length,
        sha256: pngSha256,
        compositorVersion: HYBRID_COMPOSITOR_VERSION,
        layerExecutionManifest: [],
        colorProfile: 'sRGB',
      });

      // Overwrite with a second key to force eviction of 'key' from L1
      const key2 = '1111111111111111111111111111111111111111111111111111111111111111';
      const secondPng = Buffer.from('SECOND-PNG', 'utf8');
      await smallL1Cache.set(key2, {
        compositedBuffer: secondPng,
        mimeType: 'image/png',
        width: 1080,
        height: 1080,
        byteSize: secondPng.length,
        sha256: sha256(secondPng),
        compositorVersion: HYBRID_COMPOSITOR_VERSION,
        layerExecutionManifest: [],
        colorProfile: 'sRGB',
      });

      // key is now evicted from L1 memory:
      expect(smallL1Cache.has(key)).toBe(false);

      // But get(key) should recover from L2 CAS:
      const l2Hit = await smallL1Cache.get(key);
      expect(l2Hit).not.toBeNull();
      expect(l2Hit?.cacheStatus).toBe('HIT');
      expect(l2Hit?.compositedBuffer).toEqual(fakeCompositedPng);
      expect(l2Hit?.sha256).toBe(pngSha256);
      expect(storageMock.getBufferCount).toBe(1);
    });

    it('coalesces concurrent L2 CAS lookups to prevent duplicate reads (thundering herd)', async () => {
      const storageMock = new InMemoryAssetStorageMock();
      const smallCache = new CompositorRenderCache({
        maxMemoryEntries: 1,
        assetStorage: storageMock,
      });

      const key1 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const buf1 = Buffer.from('CONCURRENT-READ-TEST', 'utf8');
      await smallCache.set(key1, {
        compositedBuffer: buf1,
        mimeType: 'image/png',
        width: 1080,
        height: 1080,
        byteSize: buf1.length,
        sha256: sha256(buf1),
        compositorVersion: HYBRID_COMPOSITOR_VERSION,
        layerExecutionManifest: [],
        colorProfile: 'sRGB',
      });

      // Evict key1 from L1
      const key2 = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
      const buf2 = Buffer.from('EVICTION-TRIGGER', 'utf8');
      await smallCache.set(key2, {
        compositedBuffer: buf2,
        mimeType: 'image/png',
        width: 1080,
        height: 1080,
        byteSize: buf2.length,
        sha256: sha256(buf2),
        compositorVersion: HYBRID_COMPOSITOR_VERSION,
        layerExecutionManifest: [],
        colorProfile: 'sRGB',
      });

      expect(smallCache.has(key1)).toBe(false);

      const beforeReads = storageMock.getBufferCount;

      // Launch 5 concurrent reads for key1
      const [res1, res2, res3, res4, res5] = await Promise.all([
        smallCache.get(key1),
        smallCache.get(key1),
        smallCache.get(key1),
        smallCache.get(key1),
        smallCache.get(key1),
      ]);

      expect(res1?.compositedBuffer).toEqual(buf1);
      expect(res2?.compositedBuffer).toEqual(buf1);
      expect(res3?.compositedBuffer).toEqual(buf1);
      expect(res4?.compositedBuffer).toEqual(buf1);
      expect(res5?.compositedBuffer).toEqual(buf1);

      // Only 1 storage fetch should have been made due to promise coalescing
      expect(storageMock.getBufferCount - beforeReads).toBe(1);
    });

    it('supports getForInput() end-to-end with preflight validation', async () => {
      const cache = new CompositorRenderCache();
      const input: HybridCompositorInput = {
        creativeJobId: 'job-123',
        aspectRatio: '1:1',
        canvas: sampleCanvas,
        layers: sampleLayers,
        colorProfile: 'sRGB',
      };

      expect(await cache.getForInput(input)).toBeNull();

      const key = cache.computeKey({ canvas: input.canvas, layers: input.layers });
      const fakePng = Buffer.from('COMPOSITED-CREATIVE', 'utf8');
      await cache.set(key, {
        compositedBuffer: fakePng,
        mimeType: 'image/png',
        width: 1080,
        height: 1080,
        byteSize: fakePng.length,
        sha256: sha256(fakePng),
        compositorVersion: HYBRID_COMPOSITOR_VERSION,
        layerExecutionManifest: [],
        colorProfile: 'sRGB',
      });

      const hit = await cache.getForInput(input);
      expect(hit).not.toBeNull();
      expect(hit?.cacheStatus).toBe('HIT');
      expect(hit?.compositedBuffer).toEqual(fakePng);
    });
  });

  describe('3. Cache Invalidation and Capacity Eviction', () => {
    it('invalidates a specific entry by key', async () => {
      const cache = new CompositorRenderCache();
      const key1 = 'key-one';
      const key2 = 'key-two';
      const buf = Buffer.from('data', 'utf8');

      await cache.set(key1, {
        compositedBuffer: buf,
        mimeType: 'image/png',
        width: 100,
        height: 100,
        byteSize: buf.length,
        sha256: sha256(buf),
        compositorVersion: HYBRID_COMPOSITOR_VERSION,
        layerExecutionManifest: [],
        colorProfile: 'sRGB',
      });
      await cache.set(key2, {
        compositedBuffer: buf,
        mimeType: 'image/png',
        width: 100,
        height: 100,
        byteSize: buf.length,
        sha256: sha256(buf),
        compositorVersion: HYBRID_COMPOSITOR_VERSION,
        layerExecutionManifest: [],
        colorProfile: 'sRGB',
      });

      expect(cache.size()).toBe(2);
      cache.invalidate(key1);

      expect(cache.has(key1)).toBe(false);
      expect(cache.has(key2)).toBe(true);
      expect(cache.size()).toBe(1);
    });

    it('clears all entries and resets memory byte count on clear()', async () => {
      const cache = new CompositorRenderCache();
      const buf = Buffer.from('some-data', 'utf8');

      await cache.set('k1', {
        compositedBuffer: buf,
        mimeType: 'image/png',
        width: 100,
        height: 100,
        byteSize: buf.length,
        sha256: sha256(buf),
        compositorVersion: HYBRID_COMPOSITOR_VERSION,
        layerExecutionManifest: [],
        colorProfile: 'sRGB',
      });

      expect(cache.size()).toBe(1);
      expect(cache.memoryBytes()).toBe(buf.length);

      cache.clear();

      expect(cache.size()).toBe(0);
      expect(cache.memoryBytes()).toBe(0);
    });

    it('enforces LRU eviction based on maxMemoryEntries', async () => {
      const cache = new CompositorRenderCache({ maxMemoryEntries: 3 });
      const makeEntry = (id: string): Omit<HybridCompositorResult, 'cacheStatus' | 'latencyMs'> => {
        const b = Buffer.from(id, 'utf8');
        return {
          compositedBuffer: b,
          mimeType: 'image/png' as const,
          width: 100,
          height: 100,
          byteSize: b.length,
          sha256: sha256(b),
          compositorVersion: HYBRID_COMPOSITOR_VERSION,
          layerExecutionManifest: [],
          colorProfile: 'sRGB' as const,
        };
      };

      await cache.set('e1', makeEntry('e1'));
      await cache.set('e2', makeEntry('e2'));
      await cache.set('e3', makeEntry('e3'));

      expect(cache.size()).toBe(3);
      expect(cache.has('e1')).toBe(true);

      // Access e1 to make it most recently used; order is now: e2, e3, e1
      await cache.get('e1');

      // Add e4: capacity 3 exceeded, least recently used 'e2' should be evicted
      await cache.set('e4', makeEntry('e4'));

      expect(cache.size()).toBe(3);
      expect(cache.has('e2')).toBe(false); // evicted
      expect(cache.has('e1')).toBe(true); // retained because recently accessed
      expect(cache.has('e3')).toBe(true);
      expect(cache.has('e4')).toBe(true);
    });

    it('enforces LRU eviction based on maxMemoryBytes limit', async () => {
      const singleSize = 50; // bytes
      const cache = new CompositorRenderCache({
        maxMemoryEntries: 100,
        maxMemoryBytes: 110, // allows at most two 50-byte entries
      });

      const makeBufEntry = (
        id: string,
      ): Omit<HybridCompositorResult, 'cacheStatus' | 'latencyMs'> => {
        const b = Buffer.alloc(singleSize, id);
        return {
          compositedBuffer: b,
          mimeType: 'image/png' as const,
          width: 100,
          height: 100,
          byteSize: b.length,
          sha256: sha256(b),
          compositorVersion: HYBRID_COMPOSITOR_VERSION,
          layerExecutionManifest: [],
          colorProfile: 'sRGB' as const,
        };
      };

      await cache.set('b1', makeBufEntry('1'));
      await cache.set('b2', makeBufEntry('2'));
      expect(cache.size()).toBe(2);
      expect(cache.memoryBytes()).toBe(100);

      // Adding b3 (50 bytes) pushes total to 150 > 110, forces eviction of b1
      await cache.set('b3', makeBufEntry('3'));

      expect(cache.size()).toBe(2);
      expect(cache.has('b1')).toBe(false);
      expect(cache.has('b2')).toBe(true);
      expect(cache.has('b3')).toBe(true);
      expect(cache.memoryBytes()).toBe(100);
    });
  });

  describe('4. Corrupted Asset Detection and Fail-Closed Errors', () => {
    it('throws CompositorLayerMissingAssetError when buffer is missing or empty', () => {
      const invalidLayer: CompositorLayerInput = {
        layerIndex: 0,
        layerGroup: 'BACKGROUND',
        buffer: Buffer.alloc(0), // empty
        mimeType: 'image/png',
        contentDigest: 'some-hash',
      };

      expect(() => validateCompositorLayers([invalidLayer])).toThrow(
        CompositorLayerMissingAssetError,
      );
    });

    it('throws CompositorLayerMissingAssetError when contentDigest is missing or empty', () => {
      const invalidLayer: CompositorLayerInput = {
        layerIndex: 0,
        layerGroup: 'BACKGROUND',
        buffer: Buffer.from('data'),
        mimeType: 'image/png',
        contentDigest: '   ', // whitespace only
      };

      expect(() => validateCompositorLayers([invalidLayer])).toThrow(
        CompositorLayerMissingAssetError,
      );
    });

    it('throws CompositorCorruptedLayerAssetError when buffer sha256 does not match contentDigest', () => {
      const layerWithWrongDigest: CompositorLayerInput = {
        layerIndex: 5,
        layerGroup: 'PRODUCT_HERO',
        buffer: Buffer.from('genuine-product-packaging-bytes'),
        mimeType: 'image/png',
        contentDigest: '0000000000000000000000000000000000000000000000000000000000000000', // tampered
      };

      expect(() => validateCompositorLayers([layerWithWrongDigest])).toThrow(
        CompositorCorruptedLayerAssetError,
      );

      try {
        validateCompositorLayers([layerWithWrongDigest]);
      } catch (err) {
        expect(err).toBeInstanceOf(CompositorCorruptedLayerAssetError);
        const corError = err as CompositorCorruptedLayerAssetError;
        expect(corError.details).toHaveProperty('layerIndex', 5);
        expect(corError.details).toHaveProperty('expectedDigest');
        expect(corError.details).toHaveProperty('actualDigest');
      }
    });

    it('throws CompositorUnsupportedCanvasGeometryError for negative or non-integer dimensions', () => {
      expect(() => validateCompositorCanvas({ width: -100, height: 1080 })).toThrow(
        CompositorUnsupportedCanvasGeometryError,
      );
      expect(() => validateCompositorCanvas({ width: 1080, height: 0 })).toThrow(
        CompositorUnsupportedCanvasGeometryError,
      );
      expect(() => validateCompositorCanvas({ width: 1080.5, height: 1080 })).toThrow(
        CompositorUnsupportedCanvasGeometryError,
      );
    });

    it('throws CompositorColorProfileError when unsupported color profile is specified', () => {
      expect(() => validateCompositorColorProfile('Display-P3')).toThrow(
        CompositorColorProfileError,
      );
      expect(() => validateCompositorColorProfile('AdobeRGB')).toThrow(CompositorColorProfileError);
      // 'sRGB' and undefined must pass
      expect(() => validateCompositorColorProfile('sRGB')).not.toThrow();
      expect(() => validateCompositorColorProfile(undefined)).not.toThrow();
    });

    it('fails closed when an L2 CAS asset has been corrupted or tampered with on disk', async () => {
      const storageMock = new InMemoryAssetStorageMock();
      const smallCache = new CompositorRenderCache({
        maxMemoryEntries: 1,
        assetStorage: storageMock,
      });

      const key = 'tampered-key';
      const genuinePng = Buffer.from('GENUINE-CONTENT', 'utf8');
      await smallCache.set(key, {
        compositedBuffer: genuinePng,
        mimeType: 'image/png',
        width: 1080,
        height: 1080,
        byteSize: genuinePng.length,
        sha256: sha256(genuinePng),
        compositorVersion: HYBRID_COMPOSITOR_VERSION,
        layerExecutionManifest: [],
        colorProfile: 'sRGB',
      });

      // Force eviction from L1
      await smallCache.set('filler-key', {
        compositedBuffer: Buffer.from('filler'),
        mimeType: 'image/png',
        width: 1080,
        height: 1080,
        byteSize: 6,
        sha256: sha256(Buffer.from('filler')),
        compositorVersion: HYBRID_COMPOSITOR_VERSION,
        layerExecutionManifest: [],
        colorProfile: 'sRGB',
      });

      // Tamper with the raw buffer stored in CAS mock
      const storedKey = Array.from(storageMock.buffers.keys())[0];
      if (!storedKey) throw new Error('Expected storedKey');
      storageMock.buffers.set(storedKey, Buffer.from('TAMPERED-MALICIOUS-PAYLOAD', 'utf8'));

      // Cache lookup must fail closed and return null rather than emitting corrupted buffer
      const corruptedResult = await smallCache.get(key);
      expect(corruptedResult).toBeNull();
    });

    it('rejects invalid input fail-closed in validateCompositorInput()', () => {
      const badInput = {
        canvas: { width: 1080, height: 1080 },
        layers: [
          {
            layerIndex: 1,
            layerGroup: 'BACKGROUND' as const,
            buffer: Buffer.from('content'),
            mimeType: 'image/png',
            contentDigest: 'bad-digest',
          },
        ],
        colorProfile: 'sRGB',
      };

      expect(() => validateCompositorInput(badInput)).toThrow(CompositorCorruptedLayerAssetError);
    });
  });
});
