import { type VisualAssetRole } from '../domain/creative.js';

export const ASSET_STORAGE = Symbol('ASSET_STORAGE');

export interface StoredAssetMetadata {
  readonly storageKey: string;
  readonly sha256Digest: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly width?: number;
  readonly height?: number;
  readonly assetRole: VisualAssetRole;
  readonly publicUrl?: string;
  readonly createdAt: Date;
}

export interface SaveAssetInput {
  readonly buffer: Buffer;
  readonly mimeType: string;
  readonly assetRole: VisualAssetRole;
  readonly width?: number;
  readonly height?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Content-Addressable Storage (CAS) contract for normal application workflows.
 *
 * Invariants:
 * 1. Storage keys must be derived deterministically from sha256(raw bytes), never from user-supplied filenames.
 * 2. Distinct asset roles separate canonical catalog photography from generated backgrounds and composited creatives.
 * 3. Historical assets participate in the audit chain and must not be casually deleted through application ports.
 *    Any future legal or operational retention purge must be handled by a separate privileged port
 *    (e.g., AssetRetentionPort or AssetAdministrationPort).
 */
export interface AssetStoragePort {
  saveAsset(input: SaveAssetInput): Promise<StoredAssetMetadata>;
  getMetadata(storageKey: string): Promise<StoredAssetMetadata | null>;
  getAssetBuffer(storageKey: string): Promise<Buffer | null>;
  assetExists(storageKey: string): Promise<boolean>;
}
