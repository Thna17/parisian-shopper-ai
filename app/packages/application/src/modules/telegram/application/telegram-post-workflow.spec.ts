/* eslint-disable @typescript-eslint/explicit-function-return-type -- Isolated typed mocks retain their inferred signatures. */
import { describe, expect, it, jest } from '@jest/globals';
import type { AppConfigService } from '@parisian-shopper/config';
import { TelegramPostWorkflow } from './telegram-post-workflow.js';
import { TelegramCommandCenter } from './telegram-command-center.js';
import type { TelegramActionTokenService } from './telegram-action-token.service.js';
import type { TelegramWorkflowRepository } from './telegram-workflow.repository.js';
import { PermissionService } from '../../auth/domain/permissions.js';
import type { PostWorkflowService } from '../../posts/post-workflow.service.js';
import type { PostGenerationCommands } from '../../posts/post-generation.commands.js';
import type { PostWorkflowView } from '../../posts/post-workflow.port.js';
import { TelegramAction, type TelegramActor } from '../domain/telegram.js';
import { FICTIONAL_PRODUCTS } from '../../products/testing/fictional-products.js';
const id = '10000000-0000-4000-8000-000000000001';
const actor: TelegramActor = {
  identityId: 'identity',
  internalUserId: 'staff',
  telegramUserId: '810001',
  displayName: 'Fixture staff',
  roles: ['ADMIN'],
};
function harness() {
  const post: PostWorkflowView = {
    id,
    creatorUserId: 'other',
    status: 'UNDER_REVIEW',
    revisionNumber: 3,
    reviewRound: 2,
    canReview: true,
    canEdit: false,
    reviewReason: 'Review this post',
    caption: null,
    factualValidation: null,
    currentRevision: {
      id: 'revision',
      creationPlan: null,
      brief: 'Saved brief',
      channel: 'FACEBOOK',
      language: 'BILINGUAL',
      campaignId: null,
      productSnapshotId: 'snapshot',
      generationId: null,
      posterVersionId: null,
      visualAssetId: null,
      productSnapshot: {
        sku: 'FIX',
        productName: 'Fixture product',
        brand: 'Fixture brand',
        price: 38,
        currency: 'USD',
      },
    },
  };
  const service = {
    get: jest.fn<PostWorkflowService['get']>().mockResolvedValue(post),
    decide: jest.fn<PostWorkflowService['decide']>().mockResolvedValue(post),
    preview: jest.fn<PostWorkflowService['preview']>().mockResolvedValue(Buffer.from('mock media')),
  };
  const tokens = {
    create: jest
      .fn<TelegramActionTokenService['create']>()
      .mockResolvedValue(['refresh-token', 'approve-token', 'changes-token']),
  };
  const generations = {
    state: jest.fn<PostGenerationCommands['state']>().mockResolvedValue(null),
    prepare: jest.fn<PostGenerationCommands['prepare']>().mockResolvedValue(undefined),
  };
  const adapter = new TelegramPostWorkflow(
    service as unknown as PostWorkflowService,
    tokens as unknown as TelegramActionTokenService,
    {} as TelegramWorkflowRepository,
    { application: { corsOrigins: ['https://staff.example'] } } as unknown as AppConfigService,
    generations as unknown as PostGenerationCommands,
  );
  return { adapter, post, service, tokens, generations };
}
describe('shared Post Telegram adapter', () => {
  it('uses the authenticated internal identity and existing roles rather than callback metadata', async () => {
    const t = harness();
    await t.adapter.callback(actor, TelegramAction.APPROVE_POST, id, {
      revisionId: 'revision',
      revision: 3,
      round: 2,
      actorId: 'other',
      permissions: ['ADMIN'],
    });
    expect(t.service.decide).toHaveBeenCalledWith(
      id,
      { expectedRevision: 3, expectedReviewRound: 2, action: 'APPROVE' },
      {
        id: 'staff',
        permissions: expect.arrayContaining([
          'VIEW_OWN_CONTENT',
          'APPROVE_CONTENT',
          'APPROVE_CREATIVE',
        ]),
      },
    );
  });
  it('rejects stale revision identity or review round before calling a business decision', async () => {
    const t = harness();
    for (const metadata of [
      { revisionId: 'old', revision: 3, round: 2 },
      { revisionId: 'revision', revision: 2, round: 2 },
      { revisionId: 'revision', revision: 3, round: 1 },
    ])
      await expect(
        t.adapter.callback(actor, TelegramAction.APPROVE_POST, id, metadata),
      ).rejects.toThrow('changed');
    expect(t.service.decide).not.toHaveBeenCalled();
  });
  it('keeps request-changes feedback bound to an explicit revision and round without in-memory conversation state', async () => {
    const t = harness();
    await t.adapter.command(actor, 'postchanges', `${id} 3 2 Please shorten the Khmer caption`);
    expect(t.service.decide).toHaveBeenCalledWith(
      id,
      {
        expectedRevision: 3,
        expectedReviewRound: 2,
        action: 'REQUEST_CHANGES',
        comment: 'Please shorten the Khmer caption',
      },
      expect.objectContaining({ id: 'staff' }),
    );
  });
  it('renders all caption text, saved media and reviewer feedback without truncating the review', async () => {
    const t = harness();
    t.post.currentRevision.visualAssetId = 'asset';
    t.post.events = [
      { action: 'REQUEST_CHANGES', comment: 'Use a simpler layout', revisionId: 'older' },
    ];
    t.post.caption = {
      headline: 'Fixture',
      english_caption: 'Long caption '.repeat(900),
      khmer_caption: 'សួស្តី',
      cta: 'Contact the store',
      hashtags: ['#Fixture'],
      creative_brief: 'Fixture',
      facts_used: [],
      warnings: [],
      missing_information: [],
    };
    const response = await t.adapter.render(actor, t.post);
    expect(response.messages.every((m) => m.text.length <= 3900)).toBe(true);
    expect(response.messages.map((m) => m.text).join('')).toContain(
      t.post.caption.english_caption!.replaceAll('\n', ''),
    );
    expect(response.messages.some((m) => m.text.includes('Use a simpler layout'))).toBe(true);
    expect(response.messages[0]?.photoBuffer).toEqual(Buffer.from('mock media'));
    expect(
      response.messages
        .at(-1)
        ?.buttons?.flat()
        .some((b) => b.url === `https://staff.example/posts/${id}`),
    ).toBe(true);
  });
  it('prepares generation without quoting or confirming spending in Telegram', async () => {
    const t = harness();
    await t.adapter.command(actor, 'postprepare', `${id} 3`);
    expect(t.generations.prepare).toHaveBeenCalledWith(
      id,
      3,
      expect.objectContaining({ id: 'staff' }),
    );
  });
  it('explains uncertain image outcomes without presenting a retry or exposing provider details', async () => {
    const t = harness();
    t.post.currentRevision.generationId = 'generation';
    t.generations.state.mockResolvedValue({
      id: 'generation',
      status: 'UNCERTAIN',
      provider: 'secret-provider',
      model: 'internal-model',
      sourceRevisionNumber: 3,
      requestId: null,
      provenance: null,
    });
    const response = await t.adapter.render(actor, t.post);
    const text = response.messages.map((m) => m.text).join(' ');
    expect(text).toContain('check before trying again');
    expect(text).not.toContain('secret-provider');
    expect(t.generations.prepare).not.toHaveBeenCalled();
  });
  it('withholds approval when the saved image cannot be previewed', async () => {
    const t = harness();
    t.post.currentRevision.visualAssetId = 'asset';
    t.service.preview.mockRejectedValue(new Error('missing image'));
    await t.adapter.render(actor, t.post);
    const actions = t.tokens.create.mock.calls[0]![1];
    expect(actions.some((a) => a.action === TelegramAction.APPROVE_POST)).toBe(false);
    expect(actions.some((a) => a.action === TelegramAction.CHANGES_POST)).toBe(true);
  });
  it('saves a new marked wizard as a shared Post and never calls legacy caption generation', async () => {
    const create = jest
      .fn<TelegramPostWorkflow['create']>()
      .mockResolvedValue({ messages: [{ text: 'Complete Post saved' }] });
    const legacy = jest
      .fn<() => Promise<never>>()
      .mockRejectedValue(new Error('Legacy generation must not run'));
    const complete = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const repo = {
      claimInboundUpdate: () => Promise.resolve(true),
      resolveActor: () => Promise.resolve(actor),
      consumeRateLimit: () => Promise.resolve(true),
      consumeActionToken: () =>
        Promise.resolve({
          disposition: 'VALID',
          token: { action: TelegramAction.CONFIRM_GENERATION, resourceId: 'flow' },
        }),
      findFlowById: () =>
        Promise.resolve({
          id: 'flow',
          telegramIdentityId: actor.identityId,
          product: FICTIONAL_PRODUCTS[0],
          expiresAt: new Date(Date.now() + 60000),
          contentType: 'EDUCATIONAL',
          language: 'BILINGUAL',
          platform: 'FACEBOOK',
          metadata: { postWorkflow: true, postSnapshotId: 'saved-snapshot' },
        }),
      completeFlow: complete,
    };
    const args = [
      repo,
      new PermissionService(),
      {},
      {},
      { execute: legacy },
      { execute: legacy },
      {},
      { enqueue: legacy },
      {},
      { actionTokenTtlSeconds: 900 },
      {},
      {},
      {},
      {},
      {},
      {},
      undefined,
      undefined,
      { create },
    ] as unknown as ConstructorParameters<typeof TelegramCommandCenter>;
    const response = await new TelegramCommandCenter(...args).handleCallback({
      updateId: '101',
      profile: { telegramUserId: actor.telegramUserId },
      callbackData: 'ps:abcdefghijklmnopqrstuvwx',
    });
    expect(response.messages[0]?.text).toBe('Complete Post saved');
    expect(create).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        requestKey: 'telegram-flow:flow',
        productSnapshotId: 'saved-snapshot',
        channel: 'FACEBOOK',
        language: 'BILINGUAL',
        creationPlan: expect.objectContaining({ purpose: 'EDUCATIONAL' }),
      }),
    );
    expect(complete).toHaveBeenCalledTimes(1);
    expect(legacy).not.toHaveBeenCalled();
  });
});
