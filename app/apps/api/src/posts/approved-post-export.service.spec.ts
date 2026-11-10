/* eslint-disable @typescript-eslint/explicit-function-return-type -- Retain precise inferred mocks for this isolated export harness. */
import { createHash } from 'node:crypto';
import { describe, expect, it, jest } from '@jest/globals';
import {
  generateTransparentProductPng_TEST_ONLY,
  type AssetStoragePort,
  type ProductAssetEligibilityEvaluator,
} from '@parisian-shopper/application';
import type { PrismaPostRepository, PostDetailRecord } from '@parisian-shopper/database';
import type { AppConfigService } from '@parisian-shopper/config';
import { ApprovedPostExportService } from './approved-post-export.service.js';
function harness() {
  const bytes = generateTransparentProductPng_TEST_ONLY({ width: 640, height: 640 });
  const checksum = createHash('sha256').update(bytes).digest('hex');
  const caption = {
    headline: 'Exact approved heading',
    english_caption: 'Approved English caption.',
    khmer_caption: 'ក្លិនក្រអូប',
    cta: 'Contact the shop.',
    hashtags: ['#ParisianShopper'],
    creative_brief: 'Saved brief',
    facts_used: [],
    warnings: [],
    missing_information: [],
  };
  const provenance = {
    kind: 'MOCK',
    productDigest: 'photo',
    registrationId: 'registration',
    historicalPostersUsed: false,
    posterSpec: { outputFormat: { width: 640, height: 640 } },
  };
  const post = {
    id: 'post',
    status: 'APPROVED',
    reviewRound: 2,
    factualValidation: { status: 'PASSED', blockingCount: 0, findings: [] },
    caption,
    currentRevision: {
      id: 'revision',
      revisionNumber: 4,
      productSnapshotId: 'product',
      productSnapshot: { sku: 'TEST' },
      captionVersionId: null,
      posterVersionId: null,
      visualAssetId: null,
      campaignSnapshot: null,
      generationId: 'generation',
      channel: 'FACEBOOK',
      language: 'BILINGUAL',
      generation: { provider: 'fake', provenance },
    },
    events: [
      {
        id: 'approval',
        revisionId: 'revision',
        action: 'APPROVE',
        reviewRound: 2,
        actorUserId: 'reviewer',
        createdAt: new Date('2026-11-06T00:00:00Z'),
      },
    ],
  } as unknown as PostDetailRecord;
  const posts = {
    approvedExport: jest.fn<PrismaPostRepository['approvedExport']>().mockResolvedValue(post),
    image: jest
      .fn<PrismaPostRepository['image']>()
      .mockResolvedValue({ storageKey: 'saved-png', mimeType: 'image/png', sha256: checksum }),
    recordApprovedExport: jest
      .fn<PrismaPostRepository['recordApprovedExport']>()
      .mockResolvedValue(undefined),
  };
  const storage = {
    getAssetBuffer: jest.fn<AssetStoragePort['getAssetBuffer']>().mockResolvedValue(bytes),
  };
  const heroes = {
    resolveAuthoritativeHeroEvidence: jest
      .fn<ProductAssetEligibilityEvaluator['resolveAuthoritativeHeroEvidence']>()
      .mockResolvedValue({
        asset: { sha256: 'photo' },
        registration: { id: 'registration' },
      } as never),
  };
  const config = { nodeEnvironment: 'test' };
  const service = new ApprovedPostExportService(
    posts as unknown as PrismaPostRepository,
    storage as unknown as AssetStoragePort,
    heroes as unknown as ProductAssetEligibilityEvaluator,
    config as AppConfigService,
  );
  const actor = { id: 'staff', permissions: ['EXPORT_CREATIVE', 'VIEW_OWN_CONTENT'] };
  return { service, posts, storage, heroes, config, actor, bytes, checksum, caption, provenance };
}
describe('approved Post downloads', () => {
  it('returns identical PNG bytes and verifiable captions/manifest associated with the exact approval', async () => {
    const t = harness();
    const image = await t.service.prepare('post', 'revision', 2, 'poster', t.actor);
    expect(image.bytes.equals(t.bytes)).toBe(true);
    expect(image.sha256).toBe(t.checksum);
    const caption = await t.service.prepare('post', 'revision', 2, 'caption-json', t.actor);
    expect(JSON.parse(caption.bytes.toString())).toEqual(t.caption);
    const text = await t.service.prepare('post', 'revision', 2, 'caption-text', t.actor);
    expect(text.bytes.toString()).toContain(t.caption.khmer_caption);
    const manifest = await t.service.prepare('post', 'revision', 2, 'manifest', t.actor);
    expect(JSON.parse(manifest.bytes.toString())).toMatchObject({
      postId: 'post',
      revisionId: 'revision',
      revisionNumber: 4,
      reviewRound: 2,
      approvalEventId: 'approval',
      captionRevisionId: 'revision',
      posterGenerationId: 'generation',
      historicalPostersUsed: false,
      poster: { width: 640, height: 640, sha256: t.checksum, byteSize: t.bytes.length },
      captions: { jsonSha256: caption.sha256, textSha256: text.sha256 },
    });
    expect(t.posts.recordApprovedExport).toHaveBeenCalledTimes(4);
  });
  it('rejects corrupted bytes, wrong dimensions and MIME mismatches without recording an export', async () => {
    const corrupt = harness();
    corrupt.storage.getAssetBuffer.mockResolvedValue(Buffer.from('bad bytes'));
    await expect(
      corrupt.service.prepare('post', 'revision', 2, 'poster', corrupt.actor),
    ).rejects.toThrow('byte');
    const dimensions = harness();
    dimensions.provenance.posterSpec.outputFormat.width = 1280;
    await expect(
      dimensions.service.prepare('post', 'revision', 2, 'poster', dimensions.actor),
    ).rejects.toThrow('dimension');
    const mime = harness();
    mime.posts.image.mockResolvedValue({
      storageKey: 'saved-png',
      mimeType: 'image/jpeg',
      sha256: mime.checksum,
    });
    await expect(mime.service.prepare('post', 'revision', 2, 'poster', mime.actor)).rejects.toThrow(
      'format',
    );
    expect(corrupt.posts.recordApprovedExport).not.toHaveBeenCalled();
    expect(dimensions.posts.recordApprovedExport).not.toHaveBeenCalled();
    expect(mime.posts.recordApprovedExport).not.toHaveBeenCalled();
  });
  it('refuses unapproved/stale requests before reading media and refuses approval invalidated during preparation', async () => {
    const t = harness();
    t.posts.approvedExport.mockRejectedValueOnce(new Error('Not the approved version'));
    await expect(t.service.prepare('post', 'old-revision', 1, 'poster', t.actor)).rejects.toThrow(
      'approved version',
    );
    expect(t.storage.getAssetBuffer).not.toHaveBeenCalled();
    t.posts.recordApprovedExport.mockRejectedValueOnce(new Error('Post changed during download'));
    await expect(t.service.prepare('post', 'revision', 2, 'poster', t.actor)).rejects.toThrow(
      'Post changed',
    );
  });
  it('blocks missing files, revoked photo rights and production mock exports', async () => {
    const t = harness();
    t.storage.getAssetBuffer.mockResolvedValueOnce(null);
    await expect(t.service.prepare('post', 'revision', 2, 'caption-text', t.actor)).rejects.toThrow(
      'missing',
    );
    t.heroes.resolveAuthoritativeHeroEvidence.mockRejectedValueOnce(new Error('revoked'));
    await expect(t.service.prepare('post', 'revision', 2, 'poster', t.actor)).rejects.toThrow(
      'usage rights',
    );
    t.config.nodeEnvironment = 'production';
    await expect(t.service.prepare('post', 'revision', 2, 'poster', t.actor)).rejects.toThrow(
      'Mock posters',
    );
    expect(t.posts.recordApprovedExport).not.toHaveBeenCalled();
  });
});
