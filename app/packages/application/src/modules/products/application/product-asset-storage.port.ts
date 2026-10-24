export const PRODUCT_ASSET_STORAGE = Symbol('PRODUCT_ASSET_STORAGE');

export interface StoredProductAssetInfo {
  readonly storageKey: string;
  readonly sha256: string;
  readonly mimeType: string;
  readonly byteSize: number;
}

export interface ProductAssetStoragePort {
  /**
   * Saves raw bytes to CAS storage under deterministic key cas/xx/yy/<sha256>.<ext>.
   */
  saveAsset(buffer: Buffer, mimeType: string, extension?: string): Promise<StoredProductAssetInfo>;

  /**
   * Retrieves raw bytes from CAS storage by storage key, verifying digest on read.
   */
  getAssetBuffer(storageKey: string): Promise<Buffer | null>;

  /**
   * Checks whether an asset exists in CAS storage.
   */
  assetExists(storageKey: string): Promise<boolean>;

  /**
   * Computes the deterministic storage key for a given SHA-256 digest and extension.
   */
  deriveStorageKey(sha256: string, extension: string): string;
}
