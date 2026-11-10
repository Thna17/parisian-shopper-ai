import { describe, expect, it, jest } from '@jest/globals';
import { ZodError } from 'zod';
import { GetCreativeProjectDetailUseCase } from './get-creative-project-detail.use-case.js';

function subject(error: Error) {
  const scene = { id: 'scene', creativeJobId: 'job', campaignId: null };
  const version = {
    sourceContentVersionId: 'content',
    productSnapshotId: null,
    state: { status: 'APPROVED', isExportEligible: true },
  };
  const sceneRepo = {
    findById: async () => scene,
    listVersions: async () => [version],
    findLatestVersionBySceneId: async () => version,
  };
  const contentRepo = {
    findVersionById: async () => {
      throw error;
    },
  };
  const jobRepo = {
    findById: async () => ({ id: 'job', status: 'CREATIVE_APPROVED', requestedByUserId: 'other' }),
  };
  const assetRepo = { findLatestByJobId: async () => null };
  const permissions = { hasAnyRolePermission: jest.fn(() => true) };
  type Args = ConstructorParameters<typeof GetCreativeProjectDetailUseCase>;
  return new GetCreativeProjectDetailUseCase(
    sceneRepo as unknown as Args[0],
    {} as Args[1],
    contentRepo as unknown as Args[2],
    jobRepo as unknown as Args[3],
    assetRepo as unknown as Args[4],
    {} as Args[5],
    permissions as unknown as Args[6],
  );
}

describe('creative project detail with invalid legacy content', () => {
  const input = { projectId: 'scene', requesterUserId: 'viewer', requesterRoles: ['ADMIN'] };
  it('loads with an explicit warning and prevents approval and export in the view', async () => {
    const result = await subject(new ZodError([])).execute(input);
    expect(result.sourceContentInvalid).toBe(true);
    expect(result.contentVersion).toBeUndefined();
    expect(result.canApprove).toBe(false);
    expect(result.canExport).toBe(false);
    expect(result.approvalIneligibilityReasons).toContain(
      'Source copy is invalid and must be repaired before review.',
    );
  });
  it('does not hide unrelated repository failures', async () => {
    await expect(subject(new Error('database unavailable')).execute(input)).rejects.toThrow(
      'database unavailable',
    );
  });
});
