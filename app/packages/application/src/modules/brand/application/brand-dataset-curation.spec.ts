/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Permission } from '../../auth/domain/permissions.js';
import {
  DuplicateBrandDatasetVersionError,
  InsufficientBrandPermissionError,
} from '../domain/brand-errors.js';
import type { BrandDatasetVersionRecord } from '../domain/brand-profile.types.js';
import { type BrandDatasetRepository } from './brand-dataset.repository.js';
import { CurateBrandDatasetUseCase } from './curate-brand-dataset.use-case.js';

describe('SEC-BRAND-EVAL-14 to SEC-BRAND-EVAL-16: Brand Dataset Partition Curation', () => {
  let mockDatasetRepo: jest.Mocked<BrandDatasetRepository>;
  let curateDatasetUseCase: CurateBrandDatasetUseCase;

  const sampleDatasetRecord: BrandDatasetVersionRecord = {
    id: 'ds-uuid-001',
    name: 'Parisian Autumn 2026 Golden',
    versionString: 'v2026.11.01-gold',
    status: 'CURATING',
    assetCount: 2,
    gitCommitHash: 'commit-sha-789',
    approvedByUserId: 'usr-admin-01',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockDatasetRepo = {
      createDatasetVersion: jest
        .fn<(...args: any[]) => Promise<any>>()
        .mockResolvedValue(sampleDatasetRecord),
      findById: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(sampleDatasetRecord),
      findByVersionString: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(null),
      listDatasets: jest
        .fn<(...args: any[]) => Promise<any>>()
        .mockResolvedValue([sampleDatasetRecord]),
      updateStatus: jest
        .fn<(...args: any[]) => Promise<any>>()
        .mockResolvedValue(sampleDatasetRecord),
      storeFeedbackRecords: jest.fn<(...args: any[]) => Promise<any>>(),
      listFeedback: jest.fn<(...args: any[]) => Promise<any>>(),
    };

    curateDatasetUseCase = new CurateBrandDatasetUseCase(mockDatasetRepo);
  });

  it('SEC-BRAND-EVAL-14: requires Permission.ADMIN to curate a dataset version; rejects unauthorized non-admin users', async () => {
    await expect(
      curateDatasetUseCase.execute({
        name: 'Unauth Dataset',
        versionString: 'v2026.11.02',
        permissions: [Permission.VIEW_PRODUCTS],
      }),
    ).rejects.toThrow(InsufficientBrandPermissionError);

    expect(mockDatasetRepo.createDatasetVersion).not.toHaveBeenCalled();
  });

  it('SEC-BRAND-EVAL-15: rejects creation if versionString already exists, throwing DuplicateBrandDatasetVersionError', async () => {
    mockDatasetRepo.findByVersionString.mockResolvedValueOnce(sampleDatasetRecord);

    await expect(
      curateDatasetUseCase.execute({
        name: 'Duplicate Dataset',
        versionString: 'v2026.11.01-gold',
        permissions: [Permission.ADMIN],
      }),
    ).rejects.toThrow(DuplicateBrandDatasetVersionError);

    expect(mockDatasetRepo.createDatasetVersion).not.toHaveBeenCalled();
  });

  it('SEC-BRAND-EVAL-16: curates brand dataset version with status, commit hash, and initial feedback links', async () => {
    const result = await curateDatasetUseCase.execute({
      name: 'Parisian Autumn 2026 Golden',
      versionString: 'v2026.11.01-gold',
      status: 'CURATING',
      gitCommitHash: 'commit-sha-789',
      approvedByUserId: 'usr-admin-01',
      initialFeedbackIds: ['fb-01', 'fb-02'],
      permissions: [Permission.ADMIN],
    });

    expect(result.id).toBe('ds-uuid-001');
    expect(result.versionString).toBe('v2026.11.01-gold');
    expect(mockDatasetRepo.createDatasetVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Parisian Autumn 2026 Golden',
        versionString: 'v2026.11.01-gold',
        status: 'CURATING',
        gitCommitHash: 'commit-sha-789',
        approvedByUserId: 'usr-admin-01',
        initialFeedbackIds: ['fb-01', 'fb-02'],
      }),
    );
  });
});
