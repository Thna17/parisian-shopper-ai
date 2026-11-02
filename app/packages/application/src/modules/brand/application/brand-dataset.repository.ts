import type {
  BrandDatasetStatus,
  BrandDatasetVersionRecord,
  CreateBrandDatasetInput,
  ReviewFeedbackRecord,
} from '../domain/brand-profile.types.js';

export const BRAND_DATASET_REPOSITORY = Symbol('BRAND_DATASET_REPOSITORY');

export interface BrandDatasetRepository {
  createDatasetVersion(input: CreateBrandDatasetInput): Promise<BrandDatasetVersionRecord>;
  findById(id: string): Promise<BrandDatasetVersionRecord | null>;
  findByVersionString(versionString: string): Promise<BrandDatasetVersionRecord | null>;
  listDatasets(): Promise<readonly BrandDatasetVersionRecord[]>;
  updateStatus(id: string, status: BrandDatasetStatus): Promise<BrandDatasetVersionRecord>;
  storeFeedbackRecords(
    records: readonly ReviewFeedbackRecord[],
  ): Promise<readonly ReviewFeedbackRecord[]>;
  listFeedback(datasetVersionId?: string): Promise<readonly ReviewFeedbackRecord[]>;
}
