import { describe, expect, it } from '@jest/globals';
import {
  type CreativeBrief,
  type CreativeProvider,
  type GeneratedBackgroundAsset,
} from './creative-provider.port.js';
import {
  type CreativeVideoProvider,
  type VideoCreativeBrief,
} from './creative-video-provider.port.js';
import {
  type CompositeVisualInput,
  type CompositeVisualResult,
  type HeroCompositor,
} from './hero-compositor.port.js';
import {
  type AssetStoragePort,
  type SaveAssetInput,
  type StoredAssetMetadata,
} from './asset-storage.port.js';

describe('Creative Ports Contract Tests', () => {
  it('CreativeProvider contract exposes background generation only (NO compositing)', () => {
    // Structural mock verifying interface shapes
    const mockProvider: CreativeProvider = {
      providerId: 'fake-ai-provider',
      generateBackground(brief: CreativeBrief): Promise<GeneratedBackgroundAsset> {
        return Promise.resolve({
          imageBuffer: Buffer.from('mock-bg'),
          mimeType: 'image/png',
          width: brief.targetWidth,
          height: brief.targetHeight,
          providerId: 'fake-ai-provider',
          model: 'mock-model-v1',
          latencyMs: 120,
        });
      },
    };

    expect(mockProvider.providerId).toBe('fake-ai-provider');
    expect(typeof mockProvider.generateBackground).toBe('function');
    // Verify compositeVisual does NOT exist on CreativeProvider
    expect('compositeVisual' in mockProvider).toBe(false);
  });

  it('HeroCompositor contract is separate and performs deterministic product compositing', () => {
    const mockCompositor: HeroCompositor = {
      composite(input: CompositeVisualInput): Promise<CompositeVisualResult> {
        return Promise.resolve({
          compositedBuffer: Buffer.from('mock-composited'),
          mimeType: 'image/png',
          width: input.targetWidth,
          height: input.targetHeight,
          byteSize: 15,
          sha256: 'a'.repeat(64),
          latencyMs: 45,
        });
      },
    };

    expect(typeof mockCompositor.composite).toBe('function');
    // Verify background generation does not exist on HeroCompositor
    expect('generateBackground' in mockCompositor).toBe(false);
  });

  it('CreativeVideoProvider remains separate from image generation and compositing', () => {
    const mockProvider: CreativeVideoProvider = {
      providerId: 'mock-video-provider',
      generateVideo: (brief: VideoCreativeBrief) =>
        Promise.resolve({
          providerId: 'mock-video-provider',
          model: 'mock-video-v1',
          videoUrl: 'https://example.invalid/video.mp4',
          durationSeconds: brief.durationSeconds,
          resolution: brief.resolution,
          aspectRatio: brief.aspectRatio,
          mimeType: 'video/mp4',
          metadata: {
            outputFormat: brief.outputFormat,
            generateAudio: brief.generateAudio ?? false,
            providerStatus: 'completed',
          },
        }),
    };

    expect(typeof mockProvider.generateVideo).toBe('function');
    expect('generateBackground' in mockProvider).toBe(false);
    expect('composite' in mockProvider).toBe(false);
    expect('publish' in mockProvider).toBe(false);
  });

  it('AssetStoragePort contract contains safe access only (NO deleteAsset method)', () => {
    const mockStorage: AssetStoragePort = {
      saveAsset(input: SaveAssetInput): Promise<StoredAssetMetadata> {
        return Promise.resolve({
          storageKey: 'cas/dummy-sha256',
          sha256Digest: 'b'.repeat(64),
          mimeType: input.mimeType,
          byteSize: input.buffer.length,
          assetRole: input.assetRole,
          createdAt: new Date(),
        });
      },
      getMetadata(_storageKey: string): Promise<StoredAssetMetadata | null> {
        return Promise.resolve(null);
      },
      getAssetBuffer(_storageKey: string): Promise<Buffer | null> {
        return Promise.resolve(null);
      },
      assetExists(_storageKey: string): Promise<boolean> {
        return Promise.resolve(true);
      },
    };

    expect(typeof mockStorage.saveAsset).toBe('function');
    expect(typeof mockStorage.getMetadata).toBe('function');
    expect(typeof mockStorage.getAssetBuffer).toBe('function');
    expect(typeof mockStorage.assetExists).toBe('function');

    // Invariant: Normal storage port does not allow deleting assets (audit preservation)
    expect('deleteAsset' in mockStorage).toBe(false);
  });
});
