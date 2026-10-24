import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import { DiskProductAssetStorageAdapter } from './disk-product-asset-storage.adapter.js';
import {
  ProductAssetDigestMismatchError,
  ProductAssetOversizedError,
  ProductAssetRegistryValidationError,
} from '../domain/product-asset-errors.js';

describe('DiskProductAssetStorageAdapter (CAS)', () => {
  let tempDir: string;
  let storage: DiskProductAssetStorageAdapter;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cas-test-'));
    storage = new DiskProductAssetStorageAdapter({
      storageRoot: tempDir,
      maxBytes: 1024 * 1024, // 1 MB limit for test
    });
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it('derives deterministic CAS key matching cas/xx/yy/<sha256>.<ext>', () => {
    const dummySha = 'a1b2c3d4e5f607182930415263748596a1b2c3d4e5f607182930415263748596';
    const key = storage.deriveStorageKey(dummySha, 'png');
    expect(key).toBe(`cas/a1/b2/${dummySha}.png`);
  });

  it('saves an asset atomically and allows reading it back', async () => {
    const payload = Buffer.from('test-product-image-bytes-12345');
    const sha256 = crypto.createHash('sha256').update(payload).digest('hex');

    const stored = await storage.saveAsset(payload, 'image/png');
    expect(stored.sha256).toBe(sha256);
    expect(stored.byteSize).toBe(payload.length);
    expect(stored.storageKey).toBe(`cas/${sha256.slice(0, 2)}/${sha256.slice(2, 4)}/${sha256}.png`);

    const exists = await storage.assetExists(stored.storageKey);
    expect(exists).toBe(true);

    const loaded = await storage.getAssetBuffer(stored.storageKey);
    expect(loaded).toEqual(payload);
  });

  it('detects disk tampering/bitrot on read via SHA-256 verification', async () => {
    const payload = Buffer.from('authentic-product-photography');
    const stored = await storage.saveAsset(payload, 'image/png');

    // Tamper with the file on disk
    const onDiskPath = path.resolve(tempDir, stored.storageKey);
    await fs.promises.writeFile(onDiskPath, Buffer.from('tampered-product-bytes'));

    await expect(storage.getAssetBuffer(stored.storageKey)).rejects.toThrow(
      ProductAssetDigestMismatchError,
    );
  });

  it('rejects path traversal attempts on read and exists checks', async () => {
    await expect(storage.getAssetBuffer('../secret.txt')).rejects.toThrow(
      ProductAssetRegistryValidationError,
    );
    await expect(storage.assetExists('cas/../../etc/passwd')).rejects.toThrow(
      ProductAssetRegistryValidationError,
    );
  });

  it('rejects oversized asset payloads', async () => {
    const largePayload = Buffer.alloc(1024 * 1024 + 10); // Exceeds 1 MB
    await expect(storage.saveAsset(largePayload, 'image/png')).rejects.toThrow(
      ProductAssetOversizedError,
    );
  });

  it('deduplicates identical asset writes', async () => {
    const payload = Buffer.from('identical-bytes-multi-write');
    const res1 = await storage.saveAsset(payload, 'image/png');
    const res2 = await storage.saveAsset(payload, 'image/png');

    expect(res1.storageKey).toBe(res2.storageKey);
    expect(res1.sha256).toBe(res2.sha256);
  });
});
