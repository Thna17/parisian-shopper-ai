export const PRODUCT_ASSET_ACQUISITION = Symbol('PRODUCT_ASSET_ACQUISITION');

export interface AcquiredAssetPayload {
  readonly buffer: Buffer;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly sourceUrl: string;
  readonly etag?: string;
}

export interface ProductAssetAcquisitionPort {
  /**
   * Fetches an asset from an authoritative remote URL with strict SSRF controls.
   */
  fetchAsset(url: string, maxBytes?: number): Promise<AcquiredAssetPayload>;
}
