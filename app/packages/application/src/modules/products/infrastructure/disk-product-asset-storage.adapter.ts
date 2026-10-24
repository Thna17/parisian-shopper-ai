import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  type ProductAssetStoragePort,
  type StoredProductAssetInfo,
} from '../application/product-asset-storage.port.js';
import {
  ProductAssetDigestMismatchError,
  ProductAssetOversizedError,
  ProductAssetRegistryValidationError,
} from '../domain/product-asset-errors.js';

export interface DiskProductAssetStorageOptions {
  readonly storageRoot: string;
  readonly maxBytes?: number;
}

const DEFAULT_MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const CAS_KEY_REGEX = /^cas\/([0-9a-f]{2})\/([0-9a-f]{2})\/([0-9a-f]{64})\.(png|jpe?g|webp)$/i;

const MIME_TO_EXT: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
};

export class DiskProductAssetStorageAdapter implements ProductAssetStoragePort {
  private readonly storageRoot: string;
  private readonly maxBytes: number;

  public constructor(options: DiskProductAssetStorageOptions) {
    if (!options.storageRoot || options.storageRoot.trim() === '') {
      throw new Error('storageRoot must be a non-empty string');
    }
    this.storageRoot = path.resolve(options.storageRoot);
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  }

  public deriveStorageKey(sha256: string, extension: string): string {
    const cleanSha = sha256.toLowerCase().trim();
    const cleanExt = extension.toLowerCase().replace(/^\./, '');
    const sub1 = cleanSha.slice(0, 2);
    const sub2 = cleanSha.slice(2, 4);
    return `cas/${sub1}/${sub2}/${cleanSha}.${cleanExt}`;
  }

  public async saveAsset(
    buffer: Buffer,
    mimeType: string,
    extension?: string,
  ): Promise<StoredProductAssetInfo> {
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new ProductAssetRegistryValidationError(['Asset buffer must be a non-empty Buffer']);
    }

    if (buffer.length > this.maxBytes) {
      throw new ProductAssetOversizedError(buffer.length, this.maxBytes);
    }

    const ext = extension?.toLowerCase().replace(/^\./, '') ?? MIME_TO_EXT[mimeType.toLowerCase()];
    if (!ext) {
      throw new ProductAssetRegistryValidationError([
        `Unsupported MIME type or extension: ${mimeType}`,
      ]);
    }

    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex').toLowerCase();
    const storageKey = this.deriveStorageKey(sha256, ext);
    const targetPath = this.resolveSafePath(storageKey);
    const targetDir = path.dirname(targetPath);
    const tmpDir = path.resolve(this.storageRoot, '.tmp');

    await fs.promises.mkdir(tmpDir, { recursive: true });
    await fs.promises.mkdir(targetDir, { recursive: true });

    // Deduplication check: if file already exists, verify its integrity
    const exists = await this.fileExists(targetPath);
    if (exists) {
      return {
        storageKey,
        sha256,
        mimeType,
        byteSize: buffer.length,
      };
    }

    // Atomic write via staging file
    const tempFileId = crypto.randomUUID();
    const tempPath = path.join(tmpDir, `${tempFileId}.tmp`);

    try {
      const fileHandle = await fs.promises.open(tempPath, 'w', 0o600);
      try {
        await fileHandle.writeFile(buffer);
        await fileHandle.sync();
      } finally {
        await fileHandle.close();
      }

      await fs.promises.rename(tempPath, targetPath);

      return {
        storageKey,
        sha256,
        mimeType,
        byteSize: buffer.length,
      };
    } catch (error) {
      await fs.promises.unlink(tempPath).catch(() => {});
      throw error;
    }
  }

  public async getAssetBuffer(storageKey: string): Promise<Buffer | null> {
    this.validateStorageKey(storageKey);
    const targetPath = this.resolveSafePath(storageKey);

    const exists = await this.fileExists(targetPath);
    if (!exists) {
      return null;
    }

    const buffer = await fs.promises.readFile(targetPath);

    // Verify SHA-256 integrity on read to detect bitrot or tampering
    const expectedSha = this.extractDigestFromKey(storageKey);
    const actualSha = crypto.createHash('sha256').update(buffer).digest('hex').toLowerCase();

    if (actualSha !== expectedSha) {
      throw new ProductAssetDigestMismatchError(expectedSha, actualSha);
    }

    return buffer;
  }

  public async assetExists(storageKey: string): Promise<boolean> {
    this.validateStorageKey(storageKey);
    const targetPath = this.resolveSafePath(storageKey);
    return this.fileExists(targetPath);
  }

  private validateStorageKey(storageKey: string): void {
    if (typeof storageKey !== 'string' || storageKey.trim() === '') {
      throw new ProductAssetRegistryValidationError(['storageKey must be a non-empty string']);
    }

    const match = CAS_KEY_REGEX.exec(storageKey);
    if (!match) {
      throw new ProductAssetRegistryValidationError([
        `Invalid storageKey "${storageKey}": must match cas/xx/yy/<sha256>.<ext>`,
      ]);
    }

    const sub1 = match[1]!.toLowerCase();
    const sub2 = match[2]!.toLowerCase();
    const digest = match[3]!.toLowerCase();

    if (sub1 !== digest.slice(0, 2) || sub2 !== digest.slice(2, 4)) {
      throw new ProductAssetRegistryValidationError([
        `Storage key "${storageKey}" prefixes do not match hash prefix`,
      ]);
    }
  }

  private resolveSafePath(storageKey: string): string {
    const resolved = path.resolve(this.storageRoot, storageKey);
    const rootWithSep = this.storageRoot.endsWith(path.sep)
      ? this.storageRoot
      : this.storageRoot + path.sep;

    if (!resolved.startsWith(rootWithSep)) {
      throw new ProductAssetRegistryValidationError([
        `Path traversal detected for key "${storageKey}"`,
      ]);
    }

    return resolved;
  }

  private async fileExists(targetPath: string): Promise<boolean> {
    try {
      const stats = await fs.promises.lstat(targetPath);
      if (stats.isSymbolicLink()) {
        throw new ProductAssetRegistryValidationError([`Symbolic links forbidden: ${targetPath}`]);
      }
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  private extractDigestFromKey(storageKey: string): string {
    const match = CAS_KEY_REGEX.exec(storageKey);
    if (!match) {
      throw new ProductAssetRegistryValidationError([`Invalid CAS storage key: ${storageKey}`]);
    }
    return match[3]!.toLowerCase();
  }
}
