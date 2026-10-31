import type {
  BrandProfileStatus,
  BrandProfileVersionDraft,
  BrandProfileVersionRecord,
} from '../domain/brand-profile.types.js';

export const BRAND_PROFILE_REPOSITORY = Symbol('BRAND_PROFILE_REPOSITORY');

export interface BrandProfileRepository {
  createDraft(draft: BrandProfileVersionDraft): Promise<BrandProfileVersionRecord>;
  findById(id: string): Promise<BrandProfileVersionRecord | null>;
  findByNameAndVersion(
    name: string,
    versionNumber: number,
  ): Promise<BrandProfileVersionRecord | null>;
  findActive(): Promise<BrandProfileVersionRecord | null>;
  listProfiles(): Promise<readonly BrandProfileVersionRecord[]>;
  updateStatus(id: string, status: BrandProfileStatus): Promise<BrandProfileVersionRecord>;
  activateVersion(id: string, approvedByUserId: string): Promise<BrandProfileVersionRecord>;
  rollbackToVersion(
    targetVersionId: string,
    authorizedUserId: string,
  ): Promise<{
    revokedProfile: BrandProfileVersionRecord | null;
    restoredProfile: BrandProfileVersionRecord;
  }>;
}
