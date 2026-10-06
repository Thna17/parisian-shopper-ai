import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { type SaveAssetInput } from '../application/asset-storage.port.js';
import {
  AssetDigestMismatchError,
  AssetOversizedError,
  CreativeBriefValidationError,
  InvalidStorageKeyError,
} from '../domain/creative-errors.js';
import { DiskAssetStorageAdapter } from './disk-asset-storage.adapter.js';

describe('DiskAssetStorageAdapter', () => {
  let tempDir: string;
  let storage: DiskAssetStorageAdapter;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cas-storage-test-'));
    storage = new DiskAssetStorageAdapter({
      storageRoot: tempDir,
      maxBytes: 1024 * 1024, // 1 MB limit for test
      baseUrl: 'https://cdn.example.invalid/assets',
    });
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  describe('CAS addressing and saving', () => {
    it('saves asset with deterministic SHA-256 CAS key and preserves metadata', async () => {
      const samplePayload = Buffer.from('test-image-content-parisian-shopper-12345');
      const expectedDigest = crypto.createHash('sha256').update(samplePayload).digest('hex');
      const expectedKey = `cas/${expectedDigest.slice(0, 2)}/${expectedDigest.slice(2, 4)}/${expectedDigest}.png`;

      const input: SaveAssetInput = {
        buffer: samplePayload,
        mimeType: 'image/png',
        assetRole: 'GENERATED_BACKGROUND',
        width: 1080,
        height: 1080,
      };

      const result = await storage.saveAsset(input);

      expect(result.storageKey).toBe(expectedKey);
      expect(result.sha256Digest).toBe(expectedDigest);
      expect(result.mimeType).toBe('image/png');
      expect(result.byteSize).toBe(samplePayload.length);
      expect(result.width).toBe(1080);
      expect(result.height).toBe(1080);
      expect(result.assetRole).toBe('GENERATED_BACKGROUND');
      expect(result.publicUrl).toBe(`https://cdn.example.invalid/assets/${expectedKey}`);
      expect(result.createdAt).toBeInstanceOf(Date);

      // Verify file exists on disk at CAS path
      const diskPath = path.join(tempDir, expectedKey);
      expect(fs.existsSync(diskPath)).toBe(true);
      const onDiskBytes = await fs.promises.readFile(diskPath);
      expect(onDiskBytes.equals(samplePayload)).toBe(true);
    });

    it('deduplicates identical asset buffers without error', async () => {
      const samplePayload = Buffer.from('identical-bytes-for-deduplication');
      const input: SaveAssetInput = {
        buffer: samplePayload,
        mimeType: 'image/webp',
        assetRole: 'COMPOSITED_CREATIVE',
      };

      const run1 = await storage.saveAsset(input);
      const run2 = await storage.saveAsset(input);

      expect(run1.storageKey).toBe(run2.storageKey);
      expect(run1.sha256Digest).toBe(run2.sha256Digest);
      expect(await storage.assetExists(run1.storageKey)).toBe(true);
    });

    it('supports parallel concurrent writes of the same asset', async () => {
      const samplePayload = Buffer.from('concurrent-write-test-payload');
      const input: SaveAssetInput = {
        buffer: samplePayload,
        mimeType: 'image/jpeg',
        assetRole: 'CANONICAL_PRODUCT',
      };

      const [res0, res1, res2] = await Promise.all([
        storage.saveAsset(input),
        storage.saveAsset(input),
        storage.saveAsset(input),
      ]);

      expect(res0.storageKey).toBe(res1.storageKey);
      expect(res1.storageKey).toBe(res2.storageKey);

      const buffer = await storage.getAssetBuffer(res0.storageKey);
      expect(buffer?.equals(samplePayload)).toBe(true);
    });
  });

  describe('retrieval and existence checks', () => {
    it('retrieves buffer and metadata for an existing asset', async () => {
      const samplePayload = Buffer.from('retrieval-test-payload');
      const input: SaveAssetInput = {
        buffer: samplePayload,
        mimeType: 'image/png',
        assetRole: 'PREVIEW',
        width: 600,
        height: 600,
      };

      const saved = await storage.saveAsset(input);

      const retrievedBuffer = await storage.getAssetBuffer(saved.storageKey);
      expect(retrievedBuffer).not.toBeNull();
      expect(retrievedBuffer?.equals(samplePayload)).toBe(true);

      const metadata = await storage.getMetadata(saved.storageKey);
      expect(metadata).not.toBeNull();
      expect(metadata?.storageKey).toBe(saved.storageKey);
      expect(metadata?.byteSize).toBe(samplePayload.length);
      expect(metadata?.width).toBe(600);
      expect(metadata?.assetRole).toBe('PREVIEW');

      const exists = await storage.assetExists(saved.storageKey);
      expect(exists).toBe(true);
    });

    it('returns null and false for non-existent assets with valid keys', async () => {
      const nonExistentDigest = crypto
        .createHash('sha256')
        .update('non-existent-payload-seed')
        .digest('hex');
      const nonExistentKey = `cas/${nonExistentDigest.slice(0, 2)}/${nonExistentDigest.slice(2, 4)}/${nonExistentDigest}.png`;

      expect(await storage.getAssetBuffer(nonExistentKey)).toBeNull();
      expect(await storage.getMetadata(nonExistentKey)).toBeNull();
      expect(await storage.assetExists(nonExistentKey)).toBe(false);
    });
  });

  describe('security and integrity defenses', () => {
    it('rejects path traversal attempts with directory traversal tokens', async () => {
      const maliciousKeys = [
        '../evil.png',
        'cas/../../etc/passwd',
        'cas/aa/bb/../../../escape.png',
        'cas/aa/bb/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.png/../../x',
      ];

      for (const badKey of maliciousKeys) {
        await expect(storage.getAssetBuffer(badKey)).rejects.toThrow();
        await expect(storage.getMetadata(badKey)).rejects.toThrow();
        await expect(storage.assetExists(badKey)).rejects.toThrow();
      }
    });

    it('rejects keys where path prefixes do not match hash', async () => {
      const hash = 'a'.repeat(64);
      // Prefixes 'zz/yy' do not match 'aa'
      const mismatchedKey = `cas/zz/yy/${hash}.png`;

      await expect(storage.getAssetBuffer(mismatchedKey)).rejects.toThrow(InvalidStorageKeyError);
    });

    it('rejects oversized assets exceeding maxBytes limit', async () => {
      const oversizedPayload = Buffer.alloc(1024 * 1024 + 10); // > 1 MB

      const input: SaveAssetInput = {
        buffer: oversizedPayload,
        mimeType: 'image/png',
        assetRole: 'GENERATED_BACKGROUND',
      };

      await expect(storage.saveAsset(input)).rejects.toThrow(AssetOversizedError);
    });

    it('rejects unsupported MIME types', async () => {
      const input: SaveAssetInput = {
        buffer: Buffer.from('svg or exe content'),
        mimeType: 'image/svg+xml',
        assetRole: 'GENERATED_BACKGROUND',
      };

      await expect(storage.saveAsset(input)).rejects.toThrow(CreativeBriefValidationError);
    });

    it('detects tampering or bitrot on read via SHA-256 integrity check', async () => {
      const samplePayload = Buffer.from('original-tamper-evident-payload');
      const saved = await storage.saveAsset({
        buffer: samplePayload,
        mimeType: 'image/png',
        assetRole: 'GENERATED_BACKGROUND',
      });

      // Directly tamper with file bytes on disk
      const diskPath = path.join(tempDir, saved.storageKey);
      await fs.promises.writeFile(diskPath, Buffer.from('tampered-corrupted-bytes-on-disk'));

      // Reading through getAssetBuffer must detect digest mismatch and throw
      await expect(storage.getAssetBuffer(saved.storageKey)).rejects.toThrow(
        AssetDigestMismatchError,
      );
    });

    it('ensures normal application AssetStoragePort exposes NO delete method', () => {
      expect('deleteAsset' in storage).toBe(false);
      expect('delete' in storage).toBe(false);
      expect('remove' in storage).toBe(false);
    });
  });
});
