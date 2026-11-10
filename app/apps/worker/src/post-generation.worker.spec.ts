/* eslint-disable @typescript-eslint/explicit-function-return-type -- Preserve inferred Jest mock signatures in this test harness. */
import { createHash } from 'node:crypto';
import { describe, expect, it, jest } from '@jest/globals';
import {
  type AssetStoragePort,
  type ProductAssetEligibilityEvaluator,
  SharpPosterCompositor,
} from '@parisian-shopper/application';
import { type AppConfigService } from '@parisian-shopper/config';
import { type PrismaPostGenerationRepository } from '@parisian-shopper/database';
import { FakePostImageProvider } from '@parisian-shopper/creative-providers';
import { generateTransparentProductPng_TEST_ONLY } from '../../../packages/application/src/modules/creative/infrastructure/fixtures/fake-product-fixtures.js';
import { PostGenerationWorker } from './post-generation.worker.js';
function setup(status = 'PREPARING', requestId: string | null = null, lifecycleStatus = 'active') {
  const provider = new FakePostImageProvider();
  const product = generateTransparentProductPng_TEST_ONLY({ width: 400, height: 700 });
  const digest = createHash('sha256').update(product).digest('hex');
  const row = {
    id: 'dispatch',
    claimToken: 'token',
    status,
    requestId,
    settings: provider.settings,
    prompt: 'neutral studio',
    backgroundKey: null as string | null,
    provenance: { productDigest: digest, registrationId: 'reg' },
  };
  const buffers = new Map<string, Buffer>();
  const ledger = {
    claim: jest.fn<() => Promise<typeof row | null>>().mockResolvedValue(row),
    source: jest.fn().mockResolvedValue({
      language: 'BILINGUAL',
      brief: 'Launch',
      productSnapshot: {
        id: 'product',
        lifecycleStatus,
        productName: 'Fictional Rose',
        brand: 'Test Maison',
        sku: 'TEST',
        currency: 'USD',
        price: 45,
        snapshotHash: 'a'.repeat(64),
      },
    } as never),
    update: jest.fn((_id: string, _token: string, data: Record<string, unknown>) => {
      Object.assign(row, data);
      return Promise.resolve();
    }),
    complete: jest.fn(() => Promise.resolve()),
  };
  const heroes = {
    resolveAuthoritativeHeroEvidence: jest.fn<() => Promise<unknown>>().mockResolvedValue({
      asset: { id: 'photo', sha256: digest, mimeType: 'image/png' },
      registration: { id: 'reg' },
      assessment: { id: 'check' },
      rightsEvent: { id: 'rights' },
      approvalEvent: { id: 'approval' },
      buffer: product,
    }),
  };
  const storage = {
    saveAsset: jest.fn((input: { buffer: Buffer }) => {
      const sha256Digest = createHash('sha256').update(input.buffer).digest('hex');
      buffers.set(sha256Digest, input.buffer);
      return Promise.resolve({ storageKey: sha256Digest, sha256Digest });
    }),
    getAssetBuffer: jest.fn((key: string) => Promise.resolve(buffers.get(key) ?? null)),
  };
  const worker = new PostGenerationWorker(
    ledger as unknown as PrismaPostGenerationRepository,
    { postImages: {} } as AppConfigService,
    provider,
    heroes as unknown as ProductAssetEligibilityEvaluator,
    storage as unknown as AssetStoragePort,
    new SharpPosterCompositor(),
  );
  return { worker, provider, ledger, heroes, row, buffers, digest };
}
describe('persistent post image worker (no paid requests)', () => {
  it('composites real raster bytes, saves caption and poster together and records product provenance', async () => {
    const t = setup();
    const submit = jest.spyOn(t.provider, 'submit');
    await t.worker.tick();
    expect(t.ledger.complete).toHaveBeenCalledTimes(1);
    const completed = (
      t.ledger.complete.mock.calls as unknown as [
        string,
        string,
        {
          imageKey: string;
          caption: { english_caption: string };
          provenance: { productDigest: string; historicalPostersUsed: boolean; kind: string };
        },
      ][]
    )[0]![2];
    expect(completed.caption.english_caption).toContain('Fictional Rose by Test Maison');
    expect(completed.provenance).toMatchObject({
      productDigest: t.digest,
      historicalPostersUsed: false,
      kind: 'MOCK',
    });
    expect(t.buffers.get(completed.imageKey)?.subarray(1, 4).toString()).toBe('PNG');
    expect(submit).toHaveBeenCalledTimes(1);
    expect(t.ledger.update.mock.calls[0]?.[2].status).toBe('SUBMITTING');
  });
  it('composites the exact saved AI caption and carries its generation provenance instead of replacing it with a template', async () => {
    const t = setup();
    const source = (await t.ledger.source()) as Record<string, unknown>;
    const caption = {
      headline: 'Fictional Rose',
      english_caption: 'Saved wording from the caption engine.',
      khmer_caption: 'សូមទាក់ទងហាង។',
      cta: 'Contact the store',
      hashtags: ['#Fixture'],
      creative_brief: 'Fixture',
      facts_used: [],
      warnings: [],
      missing_information: [],
    };
    t.ledger.source.mockResolvedValue({
      ...source,
      captionDraft: caption,
      captionGenerationId: 'caption-attempt',
      captionProvenance: { method: 'AI_CAPTION', brandRuleVersionId: 'brand' },
    } as never);
    await t.worker.tick();
    const call = t.ledger.complete.mock.calls[0] as unknown as [
      string,
      string,
      { caption: unknown; provenance: unknown },
    ];
    expect(call[0]).toBe('dispatch');
    expect(call[1]).toBe('token');
    expect(call[2]).toMatchObject({
      caption,
      provenance: expect.objectContaining({
        captionGenerationId: 'caption-attempt',
        captionMethod: 'AI_CAPTION',
      }),
    });
  });
  it('marks a timeout uncertain and never sends a second POST when checking a saved ID', async () => {
    const t = setup();
    const submit = jest
      .spyOn(t.provider, 'submit')
      .mockRejectedValue(new Error('timeout after charge'));
    await t.worker.tick();
    expect(t.row.status).toBe('UNCERTAIN');
    expect(t.ledger.complete).not.toHaveBeenCalled();
    t.row.requestId = 'reconciled-request';
    jest.spyOn(t.provider, 'status').mockResolvedValue({ state: 'generating' });
    await t.worker.tick();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(t.row.status).toBe('GENERATING');
  });
  it('resumes polling after restart and prevents submission when the product image is unapproved', async () => {
    const t = setup('GENERATING', 'saved-request');
    const submit = jest.spyOn(t.provider, 'submit');
    await t.worker.tick();
    expect(submit).not.toHaveBeenCalled();
    expect(t.ledger.complete).toHaveBeenCalled();
    const invalid = setup();
    const invalidSubmit = jest.spyOn(invalid.provider, 'submit');
    invalid.heroes.resolveAuthoritativeHeroEvidence.mockRejectedValue(new Error('unapproved'));
    await invalid.worker.tick();
    expect(invalidSubmit).not.toHaveBeenCalled();
    expect(invalid.row.status).toBe('FAILED');
  });
  it('does not resubmit if saving the provider request ID fails after a successful POST', async () => {
    const t = setup();
    const submit = jest.spyOn(t.provider, 'submit');
    const original = t.ledger.update.getMockImplementation()!;
    let calls = 0;
    t.ledger.update.mockImplementation((id, token, data) => {
      if (++calls === 2) return Promise.reject(new Error('Database write failed after dispatch'));
      return original(id, token, data);
    });
    await t.worker.tick();
    expect(t.row.status).toBe('UNCERTAIN');
    expect(t.row.requestId).toBeNull();
    await t.worker.tick();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(t.ledger.complete).not.toHaveBeenCalled();
  });
  it('rejects a discontinued product before submitting an image request', async () => {
    const t = setup('PREPARING', null, 'discontinued');
    const submit = jest.spyOn(t.provider, 'submit');
    await t.worker.tick();
    expect(submit).not.toHaveBeenCalled();
    expect(t.row.status).toBe('FAILED');
  });
});
