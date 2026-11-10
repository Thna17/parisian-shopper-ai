import { describe, expect, it } from '@jest/globals';
import { ValidateCreativeProjectUseCase } from './validate-creative-project.use-case.js';

describe('scene validation', () => {
  it('blocks an empty scene rather than reporting that it passed', async () => {
    const sceneRepo = {
      findById: async () => ({ id: 'scene' }),
      findLatestVersionBySceneId: async () => ({
        productSnapshotId: 'snapshot',
        aspectRatio: '1:1',
        safeMargins: { top: 40, bottom: 40, left: 40, right: 40 },
        layers: [],
      }),
    };
    const snapshotRepo = { findById: async () => null };
    const permissions = { hasAnyRolePermission: () => true };
    type Args = ConstructorParameters<typeof ValidateCreativeProjectUseCase>;
    const subject = new ValidateCreativeProjectUseCase(
      sceneRepo as unknown as Args[0],
      snapshotRepo as unknown as Args[1],
      permissions as unknown as Args[2],
    );
    const result = await subject.execute({
      projectId: 'scene',
      requesterUserId: 'user',
      requesterRoles: ['ADMIN'],
    });
    expect(result.isPassed).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'GATE_EMPTY_SCENE', severity: 'BLOCKING' }),
      ]),
    );
  });
});
