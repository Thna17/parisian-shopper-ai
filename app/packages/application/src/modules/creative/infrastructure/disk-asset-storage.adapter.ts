import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  type AssetStoragePort,
  type SaveAssetInput,
  type StoredAssetMetadata,
} from '../application/asset-storage.port.js';
import { type VisualAssetRole } from '../domain/creative.js';
import {
  AssetDigestMismatchError,
  AssetOversizedError,
  AssetPathTraversalError,
  CreativeBriefValidationError,
  InvalidStorageKeyError,
} from '../domain/creative-errors.js';

export interface DiskAssetStorageOptions {
  readonly storageRoot: string;
  readonly maxBytes?: number;
  readonly baseUrl?: string;
}

const DEFAULT_MAX_BYTES = 10_485_760; // 10 MB

const CAS_KEY_REGEX = /^cas\/([0-9a-f]{2})\/([0-9a-f]{2})\/([0-9a-f]{64})\.(png|jpe?g|webp)$/i;

const SUPPORTED_MIME_TYPES: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

const EXTENSION_TO_MIME: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

interface SerializedSidecarMetadata {
  readonly storageKey: string;
  readonly sha256Digest: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly assetRole: VisualAssetRole;
  readonly createdAt: string;
  readonly publicUrl?: string | undefined;
}

/**
 * Disk-based Content-Addressable Storage (CAS) Adapter.
 *
 * Implements AssetStoragePort with:
 * - Deterministic CAS keys derived strictly from sha256(rawBytes)
 * - Strict regex-based path validation & directory escape prevention
 * - Rejection of symbolic links
 * - Atomic writes via .tmp staging + fsync + rename
 * - Deduplication for identical asset payloads
 * - Tamper detection on read via digest verification
 * - No deletion operations (preserves audit integrity)
 */
export class DiskAssetStorageAdapter implements AssetStoragePort {
  private readonly storageRoot: string;
  private readonly maxBytes: number;
  private readonly baseUrl?: string | undefined;

  public constructor(options: DiskAssetStorageOptions) {
    if (!options.storageRoot || options.storageRoot.trim() === '') {
      throw new Error('storageRoot must be a non-empty string');
    }
    this.storageRoot = path.resolve(options.storageRoot);
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.baseUrl = options.baseUrl;
  }

  public async saveAsset(input: SaveAssetInput): Promise<StoredAssetMetadata> {
    if (!input || !Buffer.isBuffer(input.buffer) || input.buffer.length === 0) {
      throw new CreativeBriefValidationError('Asset buffer must be a non-empty Buffer');
    }

    if (input.buffer.length > this.maxBytes) {
      throw new AssetOversizedError(input.buffer.length, this.maxBytes);
    }

    const ext = SUPPORTED_MIME_TYPES[input.mimeType];
    if (ext === undefined) {
      throw new CreativeBriefValidationError(
        `Unsupported MIME type: ${input.mimeType}. Supported: ${Object.keys(SUPPORTED_MIME_TYPES).join(', ')}`,
      );
    }

    const sha256Digest = crypto
      .createHash('sha256')
      .update(input.buffer)
      .digest('hex')
      .toLowerCase();

    const sub1 = sha256Digest.slice(0, 2);
    const sub2 = sha256Digest.slice(2, 4);
    const storageKey = `cas/${sub1}/${sub2}/${sha256Digest}.${ext}`;

    const targetPath = this.resolveSafePath(storageKey);
    const targetMetaPath = `${targetPath}.meta.json`;
    const targetDir = path.dirname(targetPath);
    const tmpDir = path.resolve(this.storageRoot, '.tmp');

    const metadata: StoredAssetMetadata = {
      storageKey,
      sha256Digest,
      mimeType: input.mimeType,
      byteSize: input.buffer.length,
      ...(input.width !== undefined ? { width: input.width } : {}),
      ...(input.height !== undefined ? { height: input.height } : {}),
      assetRole: input.assetRole,
      createdAt: new Date(),
      ...(this.baseUrl !== undefined
        ? { publicUrl: `${this.baseUrl.replace(/\/+$/, '')}/${storageKey}` }
        : {}),
    };

    // Ensure storage directories exist
    await fs.promises.mkdir(tmpDir, { recursive: true });
    await fs.promises.mkdir(targetDir, { recursive: true });

    // Deduplication check: if identical content already exists, preserve it
    const fileAlreadyExists = await this.fileExists(targetPath);
    if (fileAlreadyExists) {
      // If metadata sidecar exists, read and return existing metadata
      const existingMeta = await this.readSidecarMetadata(targetMetaPath);
      if (existingMeta) {
        return existingMeta;
      }
    }

    // Atomic write to staging file
    const tempFileId = crypto.randomUUID();
    const tempFilePath = path.join(tmpDir, `${tempFileId}.tmp`);
    const tempMetaPath = path.join(tmpDir, `${tempFileId}.meta.tmp`);

    try {
      if (!fileAlreadyExists) {
        const fileHandle = await fs.promises.open(tempFilePath, 'w', 0o600);
        try {
          await fileHandle.writeFile(input.buffer);
          await fileHandle.sync();
        } finally {
          await fileHandle.close();
        }
      }

      const serializedMeta: SerializedSidecarMetadata = {
        storageKey: metadata.storageKey,
        sha256Digest: metadata.sha256Digest,
        mimeType: metadata.mimeType,
        byteSize: metadata.byteSize,
        ...(metadata.width !== undefined ? { width: metadata.width } : {}),
        ...(metadata.height !== undefined ? { height: metadata.height } : {}),
        assetRole: metadata.assetRole,
        createdAt: metadata.createdAt.toISOString(),
        ...(metadata.publicUrl !== undefined ? { publicUrl: metadata.publicUrl } : {}),
      };

      const metaHandle = await fs.promises.open(tempMetaPath, 'w', 0o600);
      try {
        await metaHandle.writeFile(JSON.stringify(serializedMeta, null, 2), 'utf8');
        await metaHandle.sync();
      } finally {
        await metaHandle.close();
      }

      // Atomic rename into target destinations
      if (!fileAlreadyExists) {
        await fs.promises.rename(tempFilePath, targetPath);
      }
      await fs.promises.rename(tempMetaPath, targetMetaPath);

      return metadata;
    } catch (error) {
      // Clean up orphaned temp files on failure
      await fs.promises.unlink(tempFilePath).catch(() => {});
      await fs.promises.unlink(tempMetaPath).catch(() => {});
      throw error;
    }
  }

  public async getMetadata(storageKey: string): Promise<StoredAssetMetadata | null> {
    this.validateStorageKey(storageKey);
    const targetPath = this.resolveSafePath(storageKey);

    const exists = await this.fileExists(targetPath);
    if (!exists) {
      return null;
    }

    const targetMetaPath = `${targetPath}.meta.json`;
    const sidecar = await this.readSidecarMetadata(targetMetaPath);
    if (sidecar) {
      return sidecar;
    }

    // Fallback: reconstruct metadata from disk stat if sidecar is missing
    const stats = await fs.promises.stat(targetPath);
    const ext = path.extname(storageKey).replace(/^\./, '').toLowerCase();
    const mimeType = EXTENSION_TO_MIME[ext] ?? 'application/octet-stream';
    const sha256Digest = this.extractDigestFromKey(storageKey);

    return {
      storageKey,
      sha256Digest,
      mimeType,
      byteSize: stats.size,
      assetRole: 'CANONICAL_PRODUCT',
      createdAt: stats.birthtime,
      ...(this.baseUrl !== undefined
        ? { publicUrl: `${this.baseUrl.replace(/\/+$/, '')}/${storageKey}` }
        : {}),
    };
  }

  public async getAssetBuffer(storageKey: string): Promise<Buffer | null> {
    this.validateStorageKey(storageKey);
    const targetPath = this.resolveSafePath(storageKey);

    const exists = await this.fileExists(targetPath);
    if (!exists) {
      return null;
    }

    const buffer = await fs.promises.readFile(targetPath);

    // Verify SHA-256 integrity on read to detect disk bitrot or tampering
    const expectedDigest = this.extractDigestFromKey(storageKey);
    const actualDigest = crypto.createHash('sha256').update(buffer).digest('hex').toLowerCase();

    if (actualDigest !== expectedDigest) {
      throw new AssetDigestMismatchError(expectedDigest, actualDigest);
    }

    return buffer;
  }

  public async assetExists(storageKey: string): Promise<boolean> {
    this.validateStorageKey(storageKey);
    const targetPath = this.resolveSafePath(storageKey);
    return this.fileExists(targetPath);
  }

  // --- Internal Security Validation & Resolution ---

  private validateStorageKey(storageKey: string): void {
    if (typeof storageKey !== 'string' || storageKey.trim() === '') {
      throw new InvalidStorageKeyError(String(storageKey), 'storageKey must be a non-empty string');
    }

    const match = CAS_KEY_REGEX.exec(storageKey);
    if (!match) {
      throw new InvalidStorageKeyError(storageKey, 'must match cas/xx/yy/<sha256>.<ext> format');
    }

    const sub1 = match[1]!.toLowerCase();
    const sub2 = match[2]!.toLowerCase();
    const digest = match[3]!.toLowerCase();

    if (sub1 !== digest.slice(0, 2) || sub2 !== digest.slice(2, 4)) {
      throw new InvalidStorageKeyError(
        storageKey,
        'directory prefixes must match SHA-256 hash prefix',
      );
    }
  }

  private resolveSafePath(storageKey: string): string {
    const resolved = path.resolve(this.storageRoot, storageKey);
    const rootWithSep = this.storageRoot.endsWith(path.sep)
      ? this.storageRoot
      : this.storageRoot + path.sep;

    if (!resolved.startsWith(rootWithSep)) {
      throw new AssetPathTraversalError(storageKey);
    }

    return resolved;
  }

  private async fileExists(targetPath: string): Promise<boolean> {
    try {
      const stats = await fs.promises.lstat(targetPath);
      if (stats.isSymbolicLink()) {
        throw new AssetPathTraversalError(targetPath);
      }
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  private async readSidecarMetadata(metaPath: string): Promise<StoredAssetMetadata | null> {
    try {
      const content = await fs.promises.readFile(metaPath, 'utf8');
      const parsed = JSON.parse(content) as SerializedSidecarMetadata;
      return {
        storageKey: parsed.storageKey,
        sha256Digest: parsed.sha256Digest,
        mimeType: parsed.mimeType,
        byteSize: parsed.byteSize,
        ...(parsed.width !== undefined ? { width: parsed.width } : {}),
        ...(parsed.height !== undefined ? { height: parsed.height } : {}),
        assetRole: parsed.assetRole,
        createdAt: new Date(parsed.createdAt),
        ...(parsed.publicUrl !== undefined ? { publicUrl: parsed.publicUrl } : {}),
      };
    } catch {
      return null;
    }
  }

  private extractDigestFromKey(storageKey: string): string {
    const match = CAS_KEY_REGEX.exec(storageKey);
    if (!match) {
      throw new InvalidStorageKeyError(storageKey);
    }
    return match[3]!.toLowerCase();
  }
}
