import { apiClient } from '../../../services/api/api-client.js';
import type {
  BenchmarkEvaluationReport,
  BrandDatasetVersionRecord,
  BrandProfileVersionRecord,
  CreateBrandProfileInput,
  CurateBrandDatasetParams,
  ListBrandFeedbackParams,
  ReviewFeedbackRecord,
  RollbackBrandProfileResult,
  RunBrandBenchmarkParams,
} from '../types/brand.types.js';

export const brandApi = {
  /**
   * Fetch currently active authoritative BrandProfileVersion.
   */
  getActiveBrandProfile: async (): Promise<BrandProfileVersionRecord | null> => {
    return apiClient.get<BrandProfileVersionRecord | null>('/v1/brand/profile/active');
  },

  /**
   * List all historical and draft brand profiles.
   */
  listBrandProfiles: async (): Promise<readonly BrandProfileVersionRecord[]> => {
    return apiClient.get<readonly BrandProfileVersionRecord[]>('/v1/brand/profiles');
  },

  /**
   * Create a new draft BrandProfileVersion.
   */
  createBrandProfile: async (data: CreateBrandProfileInput): Promise<BrandProfileVersionRecord> => {
    return apiClient.post<BrandProfileVersionRecord>('/v1/brand/profile', data);
  },

  /**
   * Activate a specific BrandProfileVersion, retiring prior active.
   */
  activateBrandProfile: async (id: string): Promise<BrandProfileVersionRecord> => {
    return apiClient.post<BrandProfileVersionRecord>(`/v1/brand/profile/${id}/activate`);
  },

  /**
   * Rollback to a specific previously approved BrandProfileVersion.
   */
  rollbackBrandProfile: async (
    id: string,
    reason?: string,
  ): Promise<RollbackBrandProfileResult> => {
    return apiClient.post<RollbackBrandProfileResult>(`/v1/brand/profile/${id}/rollback`, {
      targetVersionId: id,
      reason: reason ?? 'Emergency rollback to previous brand profile version',
    });
  },

  /**
   * Run benchmark evaluation against a brand profile.
   */
  runBrandBenchmark: async (
    params: RunBrandBenchmarkParams,
  ): Promise<BenchmarkEvaluationReport> => {
    return apiClient.post<BenchmarkEvaluationReport>('/v1/brand/benchmark', params);
  },

  /**
   * List human review feedback records available for curation.
   */
  listBrandFeedback: async (
    params?: ListBrandFeedbackParams,
  ): Promise<readonly ReviewFeedbackRecord[]> => {
    const qs = params?.limit ? `?limit=${params.limit}` : '';
    return apiClient.get<readonly ReviewFeedbackRecord[]>(`/v1/brand/feedback${qs}`);
  },

  /**
   * List curated brand dataset versions.
   */
  listBrandDatasets: async (): Promise<readonly BrandDatasetVersionRecord[]> => {
    return apiClient.get<readonly BrandDatasetVersionRecord[]>('/v1/brand/datasets');
  },

  /**
   * Curate a new brand dataset partition.
   */
  curateBrandDataset: async (
    params: CurateBrandDatasetParams,
  ): Promise<BrandDatasetVersionRecord> => {
    return apiClient.post<BrandDatasetVersionRecord>('/v1/brand/datasets', params);
  },
};

// Also export standalone functions for direct import convenience
export const getActiveBrandProfile = brandApi.getActiveBrandProfile;
export const listBrandProfiles = brandApi.listBrandProfiles;
export const createBrandProfile = brandApi.createBrandProfile;
export const activateBrandProfile = brandApi.activateBrandProfile;
export const rollbackBrandProfile = brandApi.rollbackBrandProfile;
export const runBrandBenchmark = brandApi.runBrandBenchmark;
export const listBrandFeedback = brandApi.listBrandFeedback;
export const listBrandDatasets = brandApi.listBrandDatasets;
export const curateBrandDataset = brandApi.curateBrandDataset;
