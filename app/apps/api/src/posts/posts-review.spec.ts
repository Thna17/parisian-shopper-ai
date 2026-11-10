/* eslint-disable @typescript-eslint/explicit-function-return-type -- Keep precise inferred Jest mock types in this isolated controller harness. */
import { createHash } from 'node:crypto';
import { describe, expect, it, jest } from '@jest/globals';
import { validate } from 'class-validator';
import type {
  AssetStoragePort,
  ProductAssetEligibilityEvaluator,
  SanitizedEmployeeDto,
} from '@parisian-shopper/application';
import type { AppConfigService } from '@parisian-shopper/config';
import type {
  PrismaPostRepository,
  PrismaPostGenerationRepository,
  PostDetailRecord,
} from '@parisian-shopper/database';
import type { ApprovedPostExportService } from './approved-post-export.service.js';
import { PostsController, PostActionDto } from './posts.controller.js';
function harness() {
  const bytes = Buffer.from('isolated saved-image bytes');
  const actor = {
    id: 'reviewer',
    permissions: ['VIEW_OWN_CONTENT'],
  } as unknown as SanitizedEmployeeDto;
  const post = {
    id: 'post',
    revisionNumber: 2,
    reviewRound: 1,
    creatorUserId: 'creator',
    canReview: true,
    currentRevision: {
      id: 'revision',
      productSnapshot: { sku: 'TEST' },
      generation: { provenance: { productDigest: 'photo-digest', registrationId: 'registration' } },
    },
  } as unknown as PostDetailRecord;
  const posts = {
    get: jest.fn<PrismaPostRepository['get']>().mockResolvedValue(post),
    image: jest.fn<PrismaPostRepository['image']>().mockResolvedValue({
      storageKey: 'saved-image',
      mimeType: 'image/png',
      sha256: createHash('sha256').update(bytes).digest('hex'),
    }),
    transition: jest.fn<PrismaPostRepository['transition']>().mockResolvedValue(post),
  };
  const heroes = {
    resolveAuthoritativeHeroEvidence: jest
      .fn<ProductAssetEligibilityEvaluator['resolveAuthoritativeHeroEvidence']>()
      .mockResolvedValue({
        asset: { sha256: 'photo-digest' },
        registration: { id: 'registration' },
      } as never),
  };
  const storage = {
    getAssetBuffer: jest.fn<AssetStoragePort['getAssetBuffer']>().mockResolvedValue(bytes),
  };
  const controller = new PostsController(
    posts as unknown as PrismaPostRepository,
    {} as PrismaPostGenerationRepository,
    {} as AppConfigService,
    heroes as unknown as ProductAssetEligibilityEvaluator,
    storage as unknown as AssetStoragePort,
    {} as ApprovedPostExportService,
  );
  return { controller, posts, heroes, storage, actor };
}
describe('complete Post review backend evidence safeguards', () => {
  it('checks the exact saved image and current approved photo before forwarding the version-bound decision', async () => {
    const t = harness();
    await t.controller.action(
      'post',
      {
        action: 'APPROVE',
        expectedRevision: 2,
        expectedReviewRound: 1,
        comment: 'Checked the complete post',
      },
      t.actor,
    );
    expect(t.posts.image).toHaveBeenCalledWith('post', t.actor, 'revision');
    expect(t.posts.transition).toHaveBeenCalledWith(
      'post',
      2,
      'APPROVE',
      'Checked the complete post',
      t.actor,
      1,
    );
  });
  it('rejects missing or tampered image bytes instead of approving metadata alone', async () => {
    const t = harness();
    t.storage.getAssetBuffer.mockResolvedValue(Buffer.from('tampered'));
    await expect(
      t.controller.action(
        'post',
        { action: 'APPROVE', expectedRevision: 2, expectedReviewRound: 1 },
        t.actor,
      ),
    ).rejects.toThrow('integrity check');
    expect(t.posts.transition).not.toHaveBeenCalled();
  });
  it('rejects revoked rights and a product-photo replacement without another review-ready poster', async () => {
    const t = harness();
    t.heroes.resolveAuthoritativeHeroEvidence.mockRejectedValueOnce(new Error('rights expired'));
    await expect(
      t.controller.action(
        'post',
        { action: 'APPROVE', expectedRevision: 2, expectedReviewRound: 1 },
        t.actor,
      ),
    ).rejects.toThrow('usage rights');
    t.heroes.resolveAuthoritativeHeroEvidence.mockResolvedValue({
      asset: { sha256: 'replaced' },
      registration: { id: 'registration' },
    } as never);
    await expect(
      t.controller.action(
        'post',
        { action: 'APPROVE', expectedRevision: 2, expectedReviewRound: 1 },
        t.actor,
      ),
    ).rejects.toThrow('photo changed');
    expect(t.posts.transition).not.toHaveBeenCalled();
  });
  it('lets a reviewer request changes even if an image is unavailable', async () => {
    const t = harness();
    t.storage.getAssetBuffer.mockResolvedValue(null);
    await t.controller.action(
      'post',
      {
        action: 'REQUEST_CHANGES',
        expectedRevision: 2,
        expectedReviewRound: 1,
        comment: 'Restore the poster',
      },
      t.actor,
    );
    expect(t.posts.transition).toHaveBeenCalled();
    expect(t.storage.getAssetBuffer).not.toHaveBeenCalled();
  });
  it('requires the review-round token on decisions, including an administrator request', async () => {
    const missing = Object.assign(new PostActionDto(), { action: 'APPROVE', expectedRevision: 1 });
    expect(
      (await validate(missing)).some((error) => error.property === 'expectedReviewRound'),
    ).toBe(true);
    const submit = Object.assign(new PostActionDto(), { action: 'SUBMIT', expectedRevision: 1 });
    expect(await validate(submit)).toEqual([]);
  });
});
