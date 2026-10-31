import type { BrandSourceArchiveRecord, BrandSourceSystem } from '../domain/brand-profile.types.js';

export const BRAND_SOURCE_REPOSITORY = Symbol('BRAND_SOURCE_REPOSITORY');

export interface CreateBrandSourceInput {
  readonly sourceSystem: BrandSourceSystem;
  readonly externalPostId: string | null;
  readonly captionText: string;
  readonly sanitizedCaptionText: string;
  readonly copyrightDeclared: boolean;
  readonly copyrightOwner: string;
  readonly licenseReference: string;
  readonly mediaCasKeys: readonly string[];
  readonly tags: readonly string[];
  readonly sha256Hex: string;
  readonly ingestedByUserId: string;
}

export interface BrandSourceRepository {
  storeRawPost(input: CreateBrandSourceInput): Promise<BrandSourceArchiveRecord>;
  findById(id: string): Promise<BrandSourceArchiveRecord | null>;
  findBySha256(sha256Hex: string): Promise<BrandSourceArchiveRecord | null>;
  listSources(limit?: number, offset?: number): Promise<readonly BrandSourceArchiveRecord[]>;
}
