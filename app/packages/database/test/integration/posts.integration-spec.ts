import { FakeTelegramGateway } from '../../../telegram/src/telegram-delivery.gateway.js';
import {
  ProductMarketingEligibilityService,
  type ProductSource,
} from '@parisian-shopper/application';
import { PrismaFreshnessPolicyRepository } from '../../src/product-snapshot/prisma-freshness-policy.repository.js';
import { PrismaProductFreshnessAssessmentRepository } from '../../src/product-snapshot/prisma-product-freshness-assessment.repository.js';
import { PrismaProductMarketingHistory } from '../../src/product-snapshot/prisma-product-marketing-history.repository.js';
import { BrandGuidanceService } from '@parisian-shopper/application';
import { PrismaBrandGuidanceRepository } from '../../src/brand/prisma-brand-guidance.repository.js';
import { PrismaBrandProfileRepository } from '../../src/brand/prisma-brand-profile.repository.js';
import {
  PostCaptionService,
  FakeAITextProvider,
  type AITextProvider,
} from '@parisian-shopper/application';
import { PrismaPostCaptionRepository } from '../../src/posts/prisma-post-caption.repository.js';
import { PrismaBrandRuleRepository } from '../../src/brand/prisma-brand-rule.repository.js';
import {
  PostGenerationCommands,
  PostWorkflowService,
  TelegramPostWorkflow,
  TelegramActionTokenService,
  TelegramCommandCenter,
  PermissionService,
  TelegramAction,
  type SanitizedEmployeeDto,
  type AssetStoragePort,
} from '@parisian-shopper/application';
import { PostsController } from '../../../../apps/api/src/posts/posts.controller.js';
import { PrismaTelegramWorkflowRepository } from '../../src/telegram/prisma-telegram-workflow.repository.js';
import {
  HiggsfieldMcpService,
  HiggsfieldMcpImageProvider,
  mcpFingerprint,
  mcpParams,
  McpBeforeSubmitError,
} from '@parisian-shopper/creative-providers';
import { fakeHiggsfieldMcpServer } from '../../../creative-providers/src/mcp/testing/fake-higgsfield-mcp-server.js';
import { ApprovedPostExportService } from '../../../../apps/api/src/posts/approved-post-export.service.js';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppConfigService } from '@parisian-shopper/config';
import { FakePostImageProvider } from '@parisian-shopper/creative-providers';
import {
  DiskAssetStorageAdapter,
  SharpPosterCompositor,
  generateTransparentProductPng_TEST_ONLY,
  type ProductAssetEligibilityEvaluator,
} from '@parisian-shopper/application';
import { PostGenerationWorker } from '../../../../apps/worker/src/post-generation.worker.js';
import type { Prisma } from '@prisma/client';
import { PrismaPostGenerationRepository } from '../../src/posts/prisma-post-generation.repository.js';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { FICTIONAL_PRODUCTS, type PostActor } from '@parisian-shopper/application';
import { PrismaService } from '../../src/prisma.service.js';
import {
  PrismaPostRepository,
  type SavePostInput,
} from '../../src/posts/prisma-post.repository.js';
import { PrismaProductSnapshotRepository } from '../../src/product-snapshot/prisma-product-snapshot.repository.js';
const exec = promisify(execFile);

describe('persistent Post database integration', () => {
  let admin: PrismaService | undefined;
  let container: StartedPostgreSqlContainer | undefined;
  let prisma: PrismaService;
  let repo: PrismaPostRepository;
  let databaseName: string | undefined;
  let creator: PostActor;
  let reviewer: PostActor;
  let stranger: PostActor;
  let input: SavePostInput;
  let complete: SavePostInput;
  beforeAll(async () => {
    let url: string;
    if (process.env.POST_TEST_ADMIN_DATABASE_URL) {
      admin = new PrismaService({
        datasources: { db: { url: process.env.POST_TEST_ADMIN_DATABASE_URL } },
      });
      databaseName = `post_test_${randomUUID().replaceAll('-', '')}`;
      await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
      const parsed = new URL(process.env.POST_TEST_ADMIN_DATABASE_URL);
      parsed.pathname = `/${databaseName}`;
      url = parsed.toString();
    } else {
      container = await new PostgreSqlContainer('postgres:17.6-alpine').start();
      url = container.getConnectionUri();
    }
    await exec('pnpm', ['--filter', '@parisian-shopper/database', 'prisma:migrate:deploy'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: url },
    });
    prisma = new PrismaService({ datasources: { db: { url } } });
    repo = new PrismaPostRepository(prisma);
    const permissions = [
      'CREATE_CONTENT',
      'EDIT_CONTENT',
      'VIEW_OWN_CONTENT',
      'APPROVE_CONTENT',
      'APPROVE_CREATIVE',
    ];
    creator = {
      id: (await prisma.user.create({ data: { displayName: 'Post creator test' } })).id,
      permissions,
    };
    reviewer = {
      id: (await prisma.user.create({ data: { displayName: 'Post reviewer test' } })).id,
      permissions,
    };
    stranger = {
      id: (await prisma.user.create({ data: { displayName: 'Other editor test' } })).id,
      permissions: ['VIEW_OWN_CONTENT', 'EDIT_CONTENT'],
    };
    const product = await new PrismaProductSnapshotRepository(prisma).create({
      product: FICTIONAL_PRODUCTS[0]!,
      snapshotHash: 'a'.repeat(64),
      normalizerVersion: 'post-test',
    });
    const brand = await prisma.brandRuleVersion.create({
      data: {
        name: 'Post test rules',
        version: 1,
        status: 'ACTIVE',
        languageRules: {},
        toneRules: {},
        ctaRules: {},
        promotionRules: {},
        perfumeClaimRules: {},
        platformRules: {},
        visualGuidance: {},
      },
    });
    const job = await prisma.contentJob.create({
      data: {
        productSnapshotId: product.id,
        brandRuleVersionId: brand.id,
        requesterUserId: creator.id,
        contentType: 'PRODUCT_SPOTLIGHT',
        language: 'BILINGUAL',
        platform: 'FACEBOOK',
        status: 'APPROVED',
      },
    });
    const attempt = await prisma.generationAttempt.create({
      data: {
        contentJobId: job.id,
        attemptNumber: 1,
        provider: 'fake',
        model: 'fixture',
        promptVersion: 'test',
        status: 'SUCCEEDED',
        startedAt: new Date(),
      },
    });
    const caption = await prisma.contentVersion.create({
      data: {
        contentJobId: job.id,
        productSnapshotId: product.id,
        brandRuleVersionId: brand.id,
        generationAttemptId: attempt.id,
        versionNumber: 1,
        provider: 'fake',
        model: 'fixture',
        promptVersion: 'test',
        structuredOutput: {
          headline: 'Test caption',
          english_caption: 'Fictional fragrance',
          khmer_caption: 'ក្លិនក្រអូប',
          cta: 'Discover',
          hashtags: [],
          creative_brief: 'Fictional poster',
          facts_used: [],
          warnings: [],
          missing_information: [],
        },
      },
    });
    await prisma.validationResult.create({
      data: {
        contentVersionId: caption.id,
        validatorVersion: 'test',
        status: 'PASSED',
        findingCount: 0,
        blockingCount: 0,
        warningCount: 0,
        infoCount: 0,
      },
    });
    const creative = await prisma.creativeJob.create({
      data: {
        contentVersionId: caption.id,
        productSnapshotId: product.id,
        brandRuleVersionId: brand.id,
        requestedByUserId: creator.id,
        status: 'READY_FOR_REVIEW',
      },
    });
    const scene = await prisma.creativeScene.create({
      data: { creativeJobId: creative.id, title: 'Fixture poster' },
    });
    const version = await prisma.creativeSceneVersion.create({
      data: {
        sceneId: scene.id,
        versionNumber: 1,
        aspectRatio: '1:1',
        width: 1080,
        height: 1080,
        templateId: 'CENTERED_HERO',
        templateVersion: '1',
        safeMargins: {},
        brandProfileVersionId: brand.id,
        sourceContentVersionId: caption.id,
        productSnapshotId: product.id,
        sceneHash: 'b'.repeat(64),
        dependencyHash: 'c'.repeat(64),
        requestedByUserId: creator.id,
      },
    });
    const asset = await prisma.visualAsset.create({
      data: {
        creativeJobId: creative.id,
        sceneVersionId: version.id,
        versionNumber: 1,
        mimeType: 'image/png',
        width: 1080,
        height: 1080,
        byteSize: 10,
        sha256: 'd'.repeat(64),
        storageKey: 'test-only/no-real-image.png',
        sourceProductAssetDigest: 'e'.repeat(64),
      },
    });
    await prisma.visualValidationResult.create({
      data: {
        visualAssetId: asset.id,
        validatorVersion: 'test',
        status: 'PASSED',
        findingCount: 0,
        blockingCount: 0,
        warningCount: 0,
        infoCount: 0,
      },
    });
    input = {
      productSnapshotId: product.id,
      brief: 'Persistent fixture brief',
      channel: 'FACEBOOK',
      language: 'BILINGUAL',
    };
    complete = {
      ...input,
      captionVersionId: caption.id,
      posterVersionId: version.id,
      visualAssetId: asset.id,
    };
  }, 60000);
  afterAll(async () => {
    await prisma?.$disconnect();
    // Only remove the disposable database created by this test, never the app database.
    if (admin && databaseName?.startsWith('post_test_'))
      await admin.$executeRawUnsafe(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
    await admin?.$disconnect();
    await container?.stop();
  });
  it('recovers saved Telegram edits after restart, fences replies and callbacks, and never dispatches feedback', async () => {
    const identities = new PrismaTelegramWorkflowRepository(prisma);
    const role = await prisma.role.upsert({
      where: { code: 'ADMIN' },
      create: { code: 'ADMIN', name: 'Fixture administrator' },
      update: {},
    });
    const identity = await prisma.telegramIdentity.create({
      data: { userId: creator.id, telegramUserId: BigInt('840000001') },
    });
    await prisma.userRole.create({ data: { userId: creator.id, roleId: role.id } });
    const actor = (await identities.resolveActor({ telegramUserId: '840000001' }))!;
    const workflow = new PostWorkflowService(
      repo,
      {} as ProductAssetEligibilityEvaluator,
      {} as AssetStoragePort,
    );
    const config = {
      application: { corsOrigins: ['https://staff.example.invalid'] },
    } as unknown as AppConfigService;
    let paidRequests = 0;
    const generations = {
      state: () => Promise.resolve(null),
      prepare: () => {
        paidRequests++;
        return Promise.resolve();
      },
    } as unknown as PostGenerationCommands;
    const restart = (): TelegramPostWorkflow =>
      new TelegramPostWorkflow(
        workflow,
        new TelegramActionTokenService(new PrismaTelegramWorkflowRepository(prisma)),
        new PrismaTelegramWorkflowRepository(prisma),
        config,
        generations,
      );
    const post = await repo.create(complete, creator);
    const metadata = {
      revisionId: post.currentRevision.id,
      revision: post.revisionNumber,
      round: post.reviewRound,
      field: 'cta',
    };
    await restart().callback(actor, TelegramAction.EDIT_POST, post.id, metadata);
    const stored = await identities.findPostInteraction(identity.id, new Date());
    expect(stored).toMatchObject({
      actorUserId: creator.id,
      field: 'cta',
      intendedAction: 'CAPTION_FIELD',
      postRevisionId: post.currentRevision.id,
    });
    const fake = new FakeTelegramGateway();
    const reminder = await restart().handleText(actor, '/resume');
    expect(reminder!.messages[0]!.text).toContain('cta');
    const replies = await Promise.all([
      restart().handleText(actor, 'Please contact our store.'),
      restart().handleText(actor, 'Please contact our store.'),
    ]);
    for (const reply of replies)
      if (reply) await fake.sendMessages(actor.telegramUserId, reply.messages);
    const changed = await repo.get(post.id, creator);
    expect(changed.revisionNumber).toBe(2);
    expect(changed.caption!.cta).toBe('Please contact our store.');
    expect(changed.currentRevision.visualAssetId).toBeNull();
    expect(await identities.findPostInteraction(identity.id, new Date())).toBeNull();
    expect(fake.sent.length).toBeGreaterThan(0);
    await expect(
      restart().callback(actor, TelegramAction.EDIT_POST, post.id, metadata),
    ).rejects.toThrow(/changed/);
    const current = {
      revisionId: changed.currentRevision.id,
      revision: 2,
      round: changed.reviewRound,
    };
    await restart().callback(actor, TelegramAction.FEEDBACK_POST, post.id, current);
    const proposal = await restart().handleText(
      actor,
      'Regenerate a new image with a gold background',
    );
    expect(proposal!.messages[0]!.text).toContain('Paid regeneration');
    expect(paidRequests).toBe(0);
    expect((await repo.get(post.id, creator)).revisionNumber).toBe(2);
    const proposalRow = await identities.findPostInteraction(identity.id, new Date());
    expect(proposalRow!.payload).toMatchObject({ category: 'Paid regeneration' });
    await prisma.telegramPendingReviewInteraction.update({
      where: { id: proposalRow!.id },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    expect(await restart().handleText(actor, 'yes')).toBeNull();
    // A lost reply claim expires; the expected revision still fences a repeated mutation.
    await restart().callback(actor, TelegramAction.EDIT_POST, post.id, {
      ...current,
      field: 'headline',
    });
    const recovery = await identities.findPostInteraction(identity.id, new Date());
    const claim = randomUUID();
    expect(
      await identities.claimPostInteraction(recovery!.id, identity.id, claim, new Date()),
    ).toBe(true);
    await prisma.telegramPendingReviewInteraction.update({
      where: { id: recovery!.id },
      data: { claimedUntil: new Date(Date.now() - 1) },
    });
    await restart().handleText(actor, 'Fixture product');
    expect((await repo.get(post.id, creator)).revisionNumber).toBe(3);
    const tokens = new TelegramActionTokenService(identities);
    const [token] = await tokens.create(identity.id, [
      {
        action: TelegramAction.FEEDBACK_POST,
        resourceId: post.id,
        singleUse: true,
        metadata: current,
      },
    ]);
    expect(
      (await identities.consumeActionToken(hashToken(token!), '840000099', new Date())).disposition,
    ).toBe('WRONG_USER');
    const consumes = await Promise.all([
      identities.consumeActionToken(hashToken(token!), actor.telegramUserId, new Date()),
      identities.consumeActionToken(hashToken(token!), actor.telegramUserId, new Date()),
    ]);
    expect(consumes.map((x) => x.disposition).sort()).toEqual(['CONSUMED', 'VALID']);
    const [expired] = await tokens.create(
      identity.id,
      [{ action: TelegramAction.FEEDBACK_POST, resourceId: post.id }],
      new Date(Date.now() - 1000),
    );
    expect(
      (await identities.consumeActionToken(hashToken(expired!), actor.telegramUserId, new Date()))
        .disposition,
    ).toBe('EXPIRED');
    const latest = await repo.get(post.id, creator);
    const adapter = restart();
    const args = [
      identities,
      new PermissionService(),
      {},
      {},
      {},
      {},
      {},
      {},
      new TelegramActionTokenService(identities),
      { actionTokenTtlSeconds: 900 },
      {},
      {},
      {},
      {},
      {},
      {},
      undefined,
      undefined,
      adapter,
    ] as unknown as ConstructorParameters<typeof TelegramCommandCenter>;
    const center = new TelegramCommandCenter(...args);
    const [button] = await tokens.create(identity.id, [
      {
        action: TelegramAction.FEEDBACK_POST,
        resourceId: post.id,
        metadata: {
          revisionId: latest.currentRevision.id,
          revision: latest.revisionNumber,
          round: latest.reviewRound,
        },
      },
    ]);
    const first = await center.handleCallback({
      updateId: '84000101',
      profile: { telegramUserId: actor.telegramUserId },
      callbackData: 'ps:' + button,
    });
    expect(first.messages[0]!.text).toContain('describe what');
    const duplicate = await center.handleCallback({
      updateId: '84000101',
      profile: { telegramUserId: actor.telegramUserId },
      callbackData: 'ps:' + button,
    });
    expect(duplicate.callbackNotice).toBe('Already handled.');
    const replay = await center.handleCallback({
      updateId: '84000102',
      profile: { telegramUserId: actor.telegramUserId },
      callbackData: 'ps:' + button,
    });
    expect(replay.messages.map((m) => m.text).join(' ')).toMatch(/expired|used|active/i);
    const response = await center.handleCommand({
      updateId: '84000103',
      profile: { telegramUserId: actor.telegramUserId },
      text: 'Make the background ivory',
    });
    await fake.sendMessages(actor.telegramUserId, response.messages);
    expect(response.messages[0]!.text).toContain('Layout change');
    expect(paidRequests).toBe(0);
    await restart().callback(actor, TelegramAction.EDIT_POST, post.id, {
      revisionId: latest.currentRevision.id,
      revision: latest.revisionNumber,
      round: latest.reviewRound,
      field: 'cta',
    });
    await expect(
      restart().handleText({ ...actor, internalUserId: reviewer.id }, 'Changed invitation'),
    ).rejects.toThrow(/another staff/);
    await repo.revise(
      post.id,
      latest.revisionNumber,
      { ...input, captionDraft: latest.caption },
      creator,
    );
    await expect(restart().handleText(actor, 'Old prompt reply')).rejects.toThrow(/post changed/);
    expect((await repo.get(post.id, creator)).caption!.cta).toBe(latest.caption!.cta);
    expect(paidRequests).toBe(0);
    // Legacy field context is also durable and isolated from Post prompts.
    await identities.createPendingInteraction({
      telegramIdentityId: identity.id,
      contentJobId: (
        await prisma.contentVersion.findUniqueOrThrow({ where: { id: complete.captionVersionId! } })
      ).contentJobId,
      contentVersionId: complete.captionVersionId!,
      action: 'EDIT',
      field: 'khmerCaption',
      intendedAction: 'CAPTION_FIELD',
      expiresAt: new Date(Date.now() + 60000),
    });
    expect(
      await new PrismaTelegramWorkflowRepository(prisma).findActivePendingInteraction(
        identity.id,
        new Date(),
      ),
    ).toMatchObject({ field: 'khmerCaption', actorUserId: creator.id });
  });
  it('requires business approval, pins exact brand/reference versions and preserves Post provenance across a replacement and revocation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'brand-guidance-'));
    try {
      const storage = new DiskAssetStorageAdapter({ storageRoot: directory });
      const repository = new PrismaBrandGuidanceRepository(prisma);
      const guidance = new BrandGuidanceService(repository, storage);
      const manager = { ...creator, permissions: [...creator.permissions, 'ADMIN'] };
      const bytes = generateTransparentProductPng_TEST_ONLY({ width: 400, height: 700 });
      const media = await guidance.upload(bytes, 'image/png', manager);
      const refInput = {
        sourceSystem: 'FACEBOOK' as const,
        sourceUrl: 'https://example.invalid/test-source',
        captionText: 'An approved style example, not product facts.',
        copyrightDeclared: true,
        copyrightOwner: 'Fixture business',
        licenseReference: 'Fixture permission only',
        tags: ['historical-poster', 'logo'],
        mediaCasKeys: [media.storageKey],
      };
      const reference = await guidance.createReference(refInput, manager);
      expect(reference.status).toBe('UNREVIEWED');
      await expect(guidance.createReference(refInput, creator)).rejects.toThrow();
      expect(await guidance.references(creator)).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: reference.id })]),
      );
      await expect(
        guidance.reviewReference(
          reference.id,
          reference.sourceDigest,
          'APPROVED',
          'Checked fixture',
          false,
          manager,
        ),
      ).rejects.toThrow();
      await guidance.reviewReference(
        reference.id,
        reference.sourceDigest,
        'APPROVED',
        'Fixture rights verified',
        true,
        manager,
      );
      await expect(
        guidance.reviewReference(
          reference.id,
          reference.sourceDigest,
          'REJECTED',
          'Stale review',
          false,
          manager,
          null,
        ),
      ).rejects.toThrow(/review changed/);
      const c = await captionFixture();
      const packInput = {
        name: `Fixture guidance ${randomUUID()}`,
        formality: 'EDITORIAL' as const,
        capitalization: 'SENTENCE_CASE' as const,
        emojiLimit: 0,
        tone: 'Clear product introductions',
        khmerTone: 'Natural Khmer, human evaluation required',
        terminology: [{ english: 'Perfume', khmer: 'ទឹកអប់' }],
        ctaEnglish: 'Contact the store',
        ctaKhmer: 'ទាក់ទងហាង',
        contact: 'Fixture contact only',
        claimsRestrictions: ['No invented claims'],
        colors: ['#20313D', '#FFFFFF'],
        headlineFont: 'Playfair Display' as const,
        khmerFont: 'Noto Sans Khmer' as const,
        englishFont: 'Montserrat' as const,
        logoSourceId: reference.id,
        textOnlyBrandName: 'Fixture brand',
        channels: {
          FACEBOOK: {
            templateId: 'EDITORIAL_SPLIT' as const,
            textColor: '#FFFFFF',
            accentColor: '#FFFFFF',
            panelBackground: '#20313D',
            productPlacement: 'RIGHT' as const,
            textPlacement: 'LEFT' as const,
          },
        },
        lighting: 'Soft neutral light',
        referenceSourceIds: [reference.id],
        captionRules: c.brand.rules,
      };
      const draft = await guidance.create(packInput, manager);
      await expect(guidance.pin(draft.id, [reference.id], creator)).rejects.toThrow();
      await expect(guidance.approve(draft.id, draft.digest, creator)).rejects.toThrow();
      await expect(guidance.approve(draft.id, '0'.repeat(64), manager)).rejects.toThrow();
      await expect(
        new PrismaBrandProfileRepository(prisma).activateVersion(draft.id, manager.id),
      ).rejects.toThrow();
      await expect(
        prisma.brandProfileVersion.update({ where: { id: draft.id }, data: { status: 'ACTIVE' } }),
      ).rejects.toThrow();
      const active = await guidance.approve(draft.id, draft.digest, manager);
      expect(active.status).toBe('ACTIVE');
      expect(active.approvalId).toBeTruthy();
      const pinned = await guidance.pin(active.id, [reference.id], creator);
      await expect(guidance.pin(active.id, [randomUUID()], creator)).rejects.toThrow();
      expect(pinned.references[0]).toMatchObject({
        sourceId: reference.id,
        version: 1,
        sourceUrl: refInput.sourceUrl,
        media: [{ storageKey: media.storageKey, sha256: media.sha256, mimeType: 'image/png' }],
      });
      await expect(
        guidance.verifyPinned({ ...pinned, guidance: { ...pinned.guidance, tone: 'Tampered' } }),
      ).rejects.toThrow();
      await expect(
        prisma.brandSourceArchive.update({
          where: { id: reference.id },
          data: { copyrightOwner: 'Changed' },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.brandProfileVersion.update({
          where: { id: active.id },
          data: { guidance: { changed: true } },
        }),
      ).rejects.toThrow();
      let providerContext: unknown;
      const fake = new FakeAITextProvider();
      const provider: AITextProvider = {
        providerName: 'fake',
        model: fake.model,
        generate: (context, options) => {
          providerContext = context;
          return fake.generate(context, options);
        },
      };
      const service = new PostCaptionService(
        c.posts,
        c.ledger,
        provider,
        new PrismaProductSnapshotRepository(prisma),
        {
          ai: { requestTimeoutMs: 5000 },
          postCaptionLiveDispatchEnabled: true,
        } as AppConfigService,
        guidance,
      );
      const post = await repo.create(input, creator);
      await service.generate(
        post.id,
        {
          method: 'AI',
          expectedRevision: 1,
          brandProfileVersionId: active.id,
          referenceSourceIds: [reference.id],
        },
        creator,
      );
      const saved = await repo.get(post.id, creator);
      expect(saved.currentRevision.brandSnapshot).toEqual(pinned);
      expect(providerContext).toMatchObject({ referenceExamples: { trust: 'UNTRUSTED_DATA' } });
      expect(saved.currentRevision.captionProvenance).toMatchObject({
        referenceGuidedCaption: true,
        historicalPostersUsed: false,
        imageInputReferences: [],
      });
      await new PrismaBrandProfileRepository(prisma).updateBenchmarkReport(active.id, {
        passed: true,
        overallScore: 100,
      });
      await guidance.verifyPinned(pinned); // Later heuristic reports do not rewrite approval evidence.
      const imageProvider = new FakePostImageProvider();
      const imageLedger = new PrismaPostGenerationRepository(prisma);
      const digest = createHash('sha256').update(bytes).digest('hex');
      const heroes = {
        resolveAuthoritativeHeroEvidence: () =>
          Promise.resolve({
            asset: { id: 'fixture-product', sha256: digest, mimeType: 'image/png' },
            registration: { id: 'fixture-registration' },
            assessment: { id: 'fixture-assessment' },
            rightsEvent: { id: 'fixture-rights' },
            approvalEvent: { id: 'fixture-approval' },
            buffer: bytes,
          }),
      } as unknown as ProductAssetEligibilityEvaluator;
      await imageLedger.enqueue(
        post.id,
        saved.revisionNumber,
        creator,
        'fake',
        imageProvider.settings,
        { productDigest: digest },
      );
      const compositor = new SharpPosterCompositor();
      let renderedLogo: Buffer | undefined;
      const render = compositor.renderPoster.bind(compositor);
      compositor.renderPoster = (value): ReturnType<SharpPosterCompositor['renderPoster']> => {
        renderedLogo = value.logoBuffer;
        return render(value);
      };
      await new PostGenerationWorker(
        imageLedger,
        { postImages: {} } as AppConfigService,
        imageProvider,
        heroes,
        storage,
        compositor,
        guidance,
      ).tick();
      const generated = await repo.get(post.id, creator);
      expect(generated.currentRevision.generation?.status).toBe('COMPLETE');
      expect(renderedLogo?.equals(bytes)).toBe(true);
      expect(generated.currentRevision.generation?.provenance).toMatchObject({
        brandProfile: pinned,
        referenceGuidedImage: false,
        imageInputReferences: [],
        historicalPostersUsed: false,
        posterSpec: {
          palette: { textColor: '#FFFFFF', panelBackground: '#20313D' },
          cta: 'Contact the store',
        },
      });
      expect(
        (await storage.getAssetBuffer((await repo.image(post.id, creator)).storageKey))
          ?.subarray(1, 4)
          .toString(),
      ).toBe('PNG');
      const workflow = new PostWorkflowService(repo, heroes, storage, guidance);
      await workflow.decide(
        post.id,
        { action: 'SUBMIT', expectedRevision: generated.revisionNumber },
        creator,
      );
      const approvedPost = await workflow.decide(
        post.id,
        { action: 'APPROVE', expectedRevision: generated.revisionNumber, expectedReviewRound: 1 },
        reviewer,
      );
      const exports = new ApprovedPostExportService(
        repo,
        storage,
        heroes,
        { nodeEnvironment: 'test' } as AppConfigService,
        guidance,
      );
      const exporter = { ...reviewer, permissions: [...reviewer.permissions, 'EXPORT_CREATIVE'] };
      const manifest = await exports.prepare(
        post.id,
        approvedPost.currentRevision.id,
        1,
        'manifest',
        exporter,
      );
      expect(JSON.parse(manifest.bytes.toString())).toMatchObject({ brandSnapshot: pinned });
      const v2 = await guidance.create({ ...packInput, tone: 'Revised business tone' }, manager);
      await guidance.approve(v2.id, v2.digest, manager);
      expect((await repo.get(post.id, creator)).currentRevision.brandSnapshot).toEqual(pinned);
      await guidance.verifyPinned(pinned); // Retired but approved exact versions remain usable.
      await expect(guidance.pin(active.id, [reference.id], creator)).rejects.toThrow(); // New captions use current guidance.
      const sourceV2 = await guidance.createReference(
        { ...refInput, previousSourceId: reference.id, captionText: 'New reference version' },
        manager,
      );
      const legacySource = await prisma.brandSourceArchive.create({
        data: {
          sourceSystem: 'FACEBOOK',
          captionText: 'Legacy fixture',
          sanitizedCaptionText: 'Legacy fixture',
          copyrightDeclared: true,
          copyrightOwner: 'Fixture owner',
          licenseReference: 'Fixture rights',
          mediaCasKeys: [media.storageKey],
          tags: [],
          sha256Hex: createHash('sha256').update(randomUUID()).digest('hex'),
          ingestedByUserId: manager.id,
        },
      });
      const revisedLegacy = await guidance.createReference(
        { ...refInput, previousSourceId: legacySource.id },
        manager,
      );
      expect(revisedLegacy.history).toEqual(
        expect.arrayContaining([
          { id: legacySource.id, version: 1 },
          { id: revisedLegacy.id, version: 2 },
        ]),
      );
      expect(
        (await repository.references()).find((r) => r.id === legacySource.id)?.history,
      ).toEqual(revisedLegacy.history);
      const unreviewedPack = await guidance.create(
        {
          ...packInput,
          name: `Unreviewed pack ${randomUUID()}`,
          referenceSourceIds: [sourceV2.id],
          logoSourceId: null,
        },
        manager,
      );
      await expect(
        guidance.approve(unreviewedPack.id, unreviewedPack.digest, manager),
      ).rejects.toThrow(/approve each selected/);
      expect(sourceV2).toMatchObject({
        version: 2,
        status: 'UNREVIEWED',
        groupId: reference.groupId,
      });
      await guidance.reviewReference(
        reference.id,
        reference.sourceDigest,
        'REVOKED',
        'Fixture rights withdrawn',
        false,
        manager,
      );
      await expect(
        exports.prepare(post.id, approvedPost.currentRevision.id, 1, 'poster', exporter),
      ).rejects.toThrow();
      await expect(guidance.verifyPinned(pinned)).rejects.toThrow();
      expect((await repo.get(post.id, creator)).currentRevision.brandSnapshot).toEqual(pinned);
      await expect(
        prisma.brandProfileApproval.delete({ where: { id: active.approvalId! } }),
      ).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('uses shared source checks for review and approved export, preserves old facts, and creates a separately reviewed source revision', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'product-freshness-post-'));
    try {
      const snapshots = new PrismaProductSnapshotRepository(prisma),
        policyRepo = new PrismaFreshnessPolicyRepository(prisma),
        assessments = new PrismaProductFreshnessAssessmentRepository(prisma),
        history = new PrismaProductMarketingHistory(prisma);
      const original = (await snapshots.findById(input.productSnapshotId))!;
      const live = { ...structuredClone(original.product), retrieved_at: new Date().toISOString() };
      let offline = false;
      const source: ProductSource = {
        adapterName: 'isolated-fixture-source',
        getBySku: () =>
          offline
            ? Promise.reject(new Error('Fixture outage'))
            : Promise.resolve({ ...live, retrieved_at: new Date().toISOString() }),
        search: () => Promise.resolve({ items: [] }),
      };
      const products = new ProductMarketingEligibilityService(
        snapshots,
        policyRepo,
        source,
        assessments,
        history,
        { nodeEnvironment: 'test' } as AppConfigService,
      );
      const storage = new DiskAssetStorageAdapter({ storageRoot: directory }),
        image = generateTransparentProductPng_TEST_ONLY({ width: 400, height: 700 }),
        digest = createHash('sha256').update(image).digest('hex');
      const heroes = {
        resolveAuthoritativeHeroEvidence: () =>
          Promise.resolve({
            asset: { id: 'fixture-product', sha256: digest, mimeType: 'image/png' },
            registration: { id: 'fixture-registration' },
            assessment: { id: 'fixture-assessment' },
            rightsEvent: { id: 'fixture-rights' },
            approvalEvent: { id: 'fixture-approval' },
            buffer: image,
          }),
      } as unknown as ProductAssetEligibilityEvaluator;
      const captionSeed = (await repo.create(complete, creator)).caption!;
      const post = await repo.create({ ...input, captionDraft: captionSeed }, creator),
        provider = new FakePostImageProvider(),
        ledger = new PrismaPostGenerationRepository(prisma);
      await ledger.enqueue(post.id, 1, creator, 'fake', provider.settings, {
        productDigest: digest,
      });
      await new PostGenerationWorker(
        ledger,
        { postImages: {} } as AppConfigService,
        provider,
        heroes,
        storage,
        new SharpPosterCompositor(),
        undefined,
        products,
      ).tick();
      const generated = await repo.get(post.id, creator);
      expect(generated.currentRevision.generation?.status).toBe('COMPLETE');
      const workflow = new PostWorkflowService(repo, heroes, storage, undefined, products);
      await workflow.decide(
        post.id,
        { action: 'SUBMIT', expectedRevision: generated.revisionNumber },
        creator,
      );
      await expect(
        workflow.decide(
          post.id,
          { action: 'APPROVE', expectedRevision: generated.revisionNumber, expectedReviewRound: 1 },
          creator,
        ),
      ).rejects.toThrow();
      const approved = await workflow.decide(
        post.id,
        { action: 'APPROVE', expectedRevision: generated.revisionNumber, expectedReviewRound: 1 },
        reviewer,
      );
      const exporter = { ...reviewer, permissions: [...reviewer.permissions, 'EXPORT_CREATIVE'] };
      const downloads = new ApprovedPostExportService(
        repo,
        storage,
        heroes,
        { nodeEnvironment: 'test' } as AppConfigService,
        undefined,
        products,
      );
      expect(
        (await downloads.prepare(post.id, approved.currentRevision.id, 1, 'poster', exporter)).bytes
          .subarray(1, 4)
          .toString(),
      ).toBe('PNG');
      const checked = await workflow.productCheck(post.id, creator);
      expect(checked.source.asOf).toBe(original.product.retrieved_at);
      expect(checked.historyWarnings.length).toBeGreaterThan(0);
      const identity = await prisma.telegramIdentity.create({
        data: { userId: creator.id, telegramUserId: BigInt('830000001') },
      });
      const identities = new PrismaTelegramWorkflowRepository(prisma);
      const telegramActor = {
        identityId: identity.id,
        internalUserId: creator.id,
        telegramUserId: '830000001',
        displayName: 'Isolated marketing staff',
        roles: ['MARKETING_EDITOR'],
      };
      const telegramConfig = {
        application: { corsOrigins: ['https://staff.example.invalid'] },
        postImages: { provider: 'fake' },
      } as unknown as AppConfigService;
      const telegram = new TelegramPostWorkflow(
        workflow,
        new TelegramActionTokenService(identities),
        identities,
        telegramConfig,
        new PostGenerationCommands(workflow, ledger, telegramConfig, heroes),
      );
      const fakeDeliveries = [];
      fakeDeliveries.push(await telegram.command(telegramActor, 'post', post.id));
      expect(fakeDeliveries[0]!.messages.map((m) => m.text).join(' ')).toContain(
        original.product.retrieved_at,
      );
      expect(
        fakeDeliveries[0]!.messages.some((m) => m.photoBuffer?.subarray(1, 4).toString() === 'PNG'),
      ).toBe(true);
      live.product.price = String(Number(live.product.price) + 7);
      await expect(
        downloads.prepare(post.id, approved.currentRevision.id, 1, 'poster', exporter),
      ).rejects.toThrow(/new revision/);
      expect((await repo.get(post.id, creator)).status).toBe('APPROVED');
      expect((await snapshots.findById(original.id))!.product.product.price).toBe(
        original.product.product.price,
      );
      await expect(
        workflow.refreshProductFacts(post.id, approved.revisionNumber, reviewer),
      ).rejects.toThrow();
      const revised = await workflow.refreshProductFacts(post.id, approved.revisionNumber, creator);
      expect(revised.status).toBe('DRAFT');
      expect(revised.currentRevision.productSnapshotId).not.toBe(original.id);
      expect(revised.caption).toBeNull();
      expect(revised.currentRevision.generationId).toBeNull();
      expect(
        revised.events.some(
          (e) => e.action === 'APPROVE' && e.revisionId === approved.currentRevision.id,
        ),
      ).toBe(true);
      offline = true;
      const outage = await workflow.productCheck(post.id, creator, true);
      expect(outage.source.status).toBe('UNAVAILABLE');
      fakeDeliveries.push(await telegram.command(telegramActor, 'post', post.id));
      expect(fakeDeliveries[1]!.messages.map((m) => m.text).join(' ')).toContain(
        'last source check failed',
      );
      expect(outage.eligible).toBe(false);
      expect((await assessments.listForSnapshot(original.id)).length).toBeGreaterThan(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  async function captionFixture(provider: AITextProvider = new FakeAITextProvider()): Promise<{
    brand: Awaited<ReturnType<PrismaBrandRuleRepository['create']>>;
    ledger: PrismaPostCaptionRepository;
    service: PostCaptionService;
    posts: PostWorkflowService;
  }> {
    const brandRepo = new PrismaBrandRuleRepository(prisma);
    const brand = await brandRepo.create({
      name: `Caption fixture ${randomUUID()}`,
      version: 1,
      status: 'ACTIVE',
      activatedAt: new Date(),
      rules: {
        language: ['Use natural Khmer and English'],
        tone: ['Clear product introductions'],
        cta: ['Contact Parisian Shopper'],
        promotion: ['Approved promotions only'],
        perfumeClaims: ['No invented claims'],
        platforms: { FACEBOOK: ['Concise'], INSTAGRAM: [], TELEGRAM: [], GENERIC: [] },
        visualGuidance: [],
      },
    });
    const ledger = new PrismaPostCaptionRepository(prisma, brandRepo);
    const option = (await ledger.brands()).find((b) => b.version.id === brand.id)!;
    const admin = { ...creator, permissions: [...creator.permissions, 'ADMIN'] };
    await ledger.approveBrand(brand.id, option.digest, admin);
    const storage = { getAssetBuffer: () => Promise.resolve(null) } as unknown as AssetStoragePort;
    const posts = new PostWorkflowService(repo, {} as ProductAssetEligibilityEvaluator, storage);
    const config = {
      ai: { requestTimeoutMs: 40 },
      postCaptionLiveDispatchEnabled: true,
    } as AppConfigService;
    const service = new PostCaptionService(
      posts,
      ledger,
      provider,
      new PrismaProductSnapshotRepository(prisma),
      config,
    );
    return { brand, ledger, service, posts };
  }
  it('pins a business-approved brand version, serializes caption dispatch and associates exact new wording without replacing old versions', async () => {
    const fake = new FakeAITextProvider();
    let calls = 0;
    const provider: AITextProvider = {
      providerName: 'fake',
      model: fake.model,
      generate: (c, s) => {
        calls++;
        return fake.generate(c, s);
      },
    };
    const t = await captionFixture(provider);
    const post = await repo.create(
      { ...complete, brief: 'Introduce the verified fragrance' },
      creator,
    );
    const before = post.caption;
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        t.service.generate(
          post.id,
          { expectedRevision: 1, brandRuleVersionId: t.brand.id, method: 'AI' },
          creator,
        ),
      ),
    );
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
    expect(calls).toBe(1);
    const saved = await repo.get(post.id, creator);
    const attempt = await t.ledger.latest(post.id);
    expect(attempt?.status).toBe('COMPLETE');
    expect(saved.revisionNumber).toBe(2);
    expect(saved.currentRevision.captionGenerationId).toBe(attempt!.id);
    expect(saved.currentRevision.captionDraft).toEqual(attempt!.output);
    expect(saved.currentRevision.captionProvenance).toMatchObject({
      method: 'MOCK_AI_CAPTION',
      authorUserId: creator.id,
      brandRuleVersionId: t.brand.id,
    });
    expect(saved.currentRevision.posterVersionId).toBeNull();
    expect(saved.currentRevision.visualAssetId).toBeNull();
    expect(
      saved.revisions.find((r) => r.revisionNumber === 1)?.captionVersion?.structuredOutput,
    ).toEqual(before);
    const edited = await repo.revise(
      post.id,
      2,
      { ...input, captionDraft: { ...saved.caption!, cta: 'Please contact Parisian Shopper.' } },
      creator,
    );
    expect(edited.currentRevision.captionGenerationId).toBeNull();
    expect(edited.currentRevision.captionProvenance).toMatchObject({
      method: 'STAFF_EDIT',
      basedOnCaptionGenerationId: attempt!.id,
    });
    await expect(
      prisma.postCaptionAttempt.update({
        where: { id: attempt!.id },
        data: { output: { headline: 'overwrite' } },
      }),
    ).rejects.toThrow('immutable');
  });
  it('keeps a potentially charged failed dispatch uncertain across service replacement and blocks both edits and another submission', async () => {
    let calls = 0;
    const provider: AITextProvider = {
      providerName: 'paid-fixture',
      model: 'no-network',
      generate: () => {
        calls++;
        return Promise.reject(new Error('Fixture lost response'));
      },
    };
    const t = await captionFixture(provider);
    const post = await repo.create(input, creator);
    await t.service.generate(
      post.id,
      { expectedRevision: 1, brandRuleVersionId: t.brand.id, method: 'AI' },
      creator,
    );
    expect((await t.ledger.latest(post.id))?.status).toBe('UNCERTAIN');
    const restarted = new PostCaptionService(
      t.posts,
      new PrismaPostCaptionRepository(prisma, new PrismaBrandRuleRepository(prisma)),
      provider,
      new PrismaProductSnapshotRepository(prisma),
      { ai: { requestTimeoutMs: 40 }, postCaptionLiveDispatchEnabled: true } as AppConfigService,
    );
    await restarted.generate(
      post.id,
      { expectedRevision: 1, brandRuleVersionId: t.brand.id, method: 'AI' },
      creator,
    );
    expect(calls).toBe(1);
    await expect(repo.revise(post.id, 1, input, creator)).rejects.toThrow('reconcile');
    await expect(restarted.recover(post.id, creator)).rejects.toThrow('No saved response');
  });
  it('recovers a saved response after an expired attachment lease without dispatching the provider again', async () => {
    const fake = new FakeAITextProvider();
    let calls = 0;
    const t = await captionFixture({
      providerName: 'fake',
      model: fake.model,
      generate: (c, s) => {
        calls++;
        return fake.generate(c, s);
      },
    });
    const post = await repo.create(input, creator);
    const finish = t.ledger.finish.bind(t.ledger);
    t.ledger.finish = (): Promise<void> =>
      Promise.reject(new Error('Fixture process ended before attachment'));
    await t.service.generate(
      post.id,
      { expectedRevision: 1, brandRuleVersionId: t.brand.id, method: 'AI' },
      creator,
    );
    const row = await t.ledger.latest(post.id);
    expect(row?.output).toBeTruthy();
    t.ledger.finish = finish;
    await prisma.postCaptionAttempt.update({
      where: { id: row!.id },
      data: { status: 'GENERATING', deadline: new Date(0) },
    });
    const replacement = new PostCaptionService(
      t.posts,
      new PrismaPostCaptionRepository(prisma, new PrismaBrandRuleRepository(prisma)),
      {
        providerName: 'fake',
        model: fake.model,
        generate: (): ReturnType<AITextProvider['generate']> =>
          Promise.reject(new Error('Provider must not run')),
      },
      new PrismaProductSnapshotRepository(prisma),
      { ai: { requestTimeoutMs: 40 }, postCaptionLiveDispatchEnabled: false } as AppConfigService,
    );
    await replacement.recover(post.id, creator);
    expect(calls).toBe(1);
    const saved = await repo.get(post.id, creator);
    expect(saved.revisionNumber).toBe(2);
    expect(saved.currentRevision.captionGenerationId).toBe(row!.id);
    expect((await t.ledger.latest(post.id))?.status).toBe('COMPLETE');
  });
  it('never converts an active development rule into approved guidance or permits unauthorized brand approval', async () => {
    const t = await captionFixture();
    const option = (await t.ledger.brands()).find((b) => b.version.id === t.brand.id)!;
    await expect(t.ledger.approveBrand(t.brand.id, option.digest, creator)).rejects.toThrow(
      'administrator',
    );
    const placeholders = await new PrismaBrandRuleRepository(prisma).create({
      name: `Unapproved ${randomUUID()}`,
      version: 1,
      status: 'ACTIVE',
      rules: { ...option.version.rules, tone: ['TODO_BUSINESS_CONFIRMATION: tone'] },
    });
    const candidate = (await t.ledger.brands()).find((b) => b.version.id === placeholders.id)!;
    await expect(
      t.ledger.approveBrand(placeholders.id, candidate.digest, {
        ...creator,
        permissions: ['ADMIN'],
      }),
    ).rejects.toThrow('Placeholder');
    const post = await repo.create(input, creator);
    await expect(
      t.service.generate(
        post.id,
        { expectedRevision: 1, brandRuleVersionId: placeholders.id, method: 'AI' },
        creator,
      ),
    ).rejects.toThrow('business-approved');
    expect(await prisma.postCaptionAttempt.count({ where: { postId: post.id } })).toBe(0);
  });
  it('deduplicates concurrent complete-Post creation and rejects reuse of a key with changed facts', async () => {
    const request = { ...input, requestKey: `isolated:${randomUUID()}` };
    const results = await Promise.all(
      Array.from({ length: 8 }, () => new PrismaPostRepository(prisma).create(request, creator)),
    );
    expect(new Set(results.map((p) => p.id)).size).toBe(1);
    expect(
      await prisma.postEvent.count({ where: { postId: results[0]!.id, action: 'CREATED' } }),
    ).toBe(1);
    await expect(repo.create({ ...request, brief: 'Changed request' }, creator)).rejects.toThrow(
      'different details',
    );
    const other = await repo.create(request, reviewer);
    expect(other.id).not.toBe(results[0]!.id);
  });

  it('continues a Telegram Post in the web and reviews that exact revision through authenticated Telegram callbacks', async () => {
    const role = await prisma.role.upsert({
      where: { code: 'ADMIN' },
      create: { code: 'ADMIN', name: 'Isolated test admin' },
      update: {},
    });
    for (const user of [creator, reviewer])
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        create: { userId: user.id, roleId: role.id },
        update: { revokedAt: null },
      });
    const creatorIdentity = await prisma.telegramIdentity.create({
      data: { userId: creator.id, telegramUserId: BigInt('810000001') },
    });
    const reviewerIdentity = await prisma.telegramIdentity.create({
      data: { userId: reviewer.id, telegramUserId: BigInt('810000002') },
    });
    const identities = new PrismaTelegramWorkflowRepository(prisma);
    const telegramCreator = (await identities.resolveActor({
      telegramUserId: creatorIdentity.telegramUserId.toString(),
    }))!;
    const telegramReviewer = (await identities.resolveActor({
      telegramUserId: reviewerIdentity.telegramUserId.toString(),
    }))!;
    const bytes = Buffer.from('isolated Post media; not a generated business poster');
    const sourceAsset = await prisma.visualAsset.findUniqueOrThrow({
      where: { id: complete.visualAssetId! },
    });
    const asset = await prisma.visualAsset.create({
      data: {
        ...sourceAsset,
        id: randomUUID(),
        versionNumber: 9000,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        storageKey: 'test-only/shared-post.bin',
      },
    });
    await prisma.visualValidationResult.create({
      data: {
        visualAssetId: asset.id,
        validatorVersion: 'shared-post-test',
        status: 'PASSED',
        findingCount: 0,
        blockingCount: 0,
        warningCount: 0,
        infoCount: 0,
      },
    });
    const storage = { getAssetBuffer: () => Promise.resolve(bytes) } as unknown as AssetStoragePort;
    const heroes = {
      resolveAuthoritativeHeroEvidence: () =>
        Promise.resolve({
          asset: { sha256: sourceAsset.sourceProductAssetDigest },
          registration: { id: 'isolated-registration' },
        }),
    } as unknown as ProductAssetEligibilityEvaluator;
    const service = new PostWorkflowService(repo, heroes, storage);
    const tokens = new TelegramActionTokenService(identities);
    const config = {
      application: { corsOrigins: ['http://post-test.localhost:5184'] },
    } as unknown as AppConfigService;
    const telegram = new TelegramPostWorkflow(
      service,
      tokens,
      identities,
      config,
      new PostGenerationCommands(
        service,
        new PrismaPostGenerationRepository(prisma),
        config,
        heroes,
      ),
    );
    const args = [
      identities,
      new PermissionService(),
      {},
      {},
      {},
      {},
      {},
      {},
      tokens,
      { actionTokenTtlSeconds: 900 },
      {},
      {},
      {},
      {},
      {},
      {},
      undefined,
      undefined,
      telegram,
    ] as unknown as ConstructorParameters<typeof TelegramCommandCenter>;
    const center = new TelegramCommandCenter(...args);
    const web = new PostsController(
      repo,
      new PrismaPostGenerationRepository(prisma),
      config,
      heroes,
      storage,
      {} as ApprovedPostExportService,
      undefined,
      undefined,
      undefined,
      service,
    );
    const asWeb = (user: PostActor): SanitizedEmployeeDto =>
      user as unknown as SanitizedEmployeeDto;
    const beforeLegacyJobs = await prisma.contentJob.count();
    const request = {
      ...complete,
      visualAssetId: asset.id,
      requestKey: `telegram-flow:${randomUUID()}`,
    };
    const createdCard = await telegram.create(telegramCreator, request);
    expect(
      createdCard.messages.some((m) => m.photoBuffer && Buffer.from(m.photoBuffer).equals(bytes)),
    ).toBe(true);
    const saved = await web.create(request, asWeb(creator));
    expect(await prisma.post.count({ where: { requestKey: request.requestKey } })).toBe(1);
    expect(saved.currentRevision.captionVersionId).toBe(request.captionVersionId);
    expect(saved.currentRevision.posterVersionId).toBe(request.posterVersionId);
    expect(saved.currentRevision.visualAssetId).toBe(asset.id);
    const edited = await web.revise(
      saved.id,
      { ...request, brief: 'Updated in the web', expectedRevision: 1 },
      asWeb(creator),
    );
    const opened = await center.handleCommand({
      updateId: '810001',
      profile: { telegramUserId: '810000001' },
      text: `/post ${saved.id}`,
    });
    expect(opened.messages.some((m) => m.text.includes('Updated in the web'))).toBe(true);
    expect(opened.messages.some((m) => m.text.includes('Revision 2'))).toBe(true);
    await expect(service.revise(saved.id, 2, request, stranger)).rejects.toThrow();
    const submitted = await web.action(
      saved.id,
      { action: 'SUBMIT', expectedRevision: edited.revisionNumber },
      asWeb(creator),
    );
    await expect(
      telegram.callback(telegramCreator, TelegramAction.APPROVE_POST, saved.id, {
        revisionId: submitted.currentRevision.id,
        revision: 2,
        round: 1,
      }),
    ).rejects.toThrow();
    const card = await telegram.command(telegramReviewer, 'post', saved.id);
    const approve = card.messages
      .flatMap((m) => m.buttons?.flat() ?? [])
      .find((b) => b.text === 'Approve complete post')!.callbackData!;
    const wrong = await center.handleCallback({
      updateId: '810002',
      profile: { telegramUserId: '810000001' },
      callbackData: approve,
    });
    expect(wrong.callbackNotice).toContain('another user');
    await center.handleCallback({
      updateId: '810003',
      profile: { telegramUserId: '810000002' },
      callbackData: approve,
    });
    expect((await web.get(saved.id, asWeb(creator))).status).toBe('APPROVED');
    await center.handleCallback({
      updateId: '810004',
      profile: { telegramUserId: '810000002' },
      callbackData: approve,
    });
    expect(await prisma.postEvent.count({ where: { postId: saved.id, action: 'APPROVE' } })).toBe(
      1,
    );
    await web.revise(
      saved.id,
      { ...request, brief: 'Changed after approval', expectedRevision: 2 },
      asWeb(creator),
    );
    await expect(
      telegram.callback(telegramReviewer, TelegramAction.APPROVE_POST, saved.id, {
        revisionId: submitted.currentRevision.id,
        revision: 2,
        round: 1,
      }),
    ).rejects.toThrow('changed');
    expect((await service.get(saved.id, creator)).status).toBe('DRAFT');
    const events = await prisma.postEvent.findMany({ where: { postId: saved.id } });
    expect(
      await prisma.outboxEvent.count({ where: { topic: 'POST_CHANGED', aggregateId: saved.id } }),
    ).toBe(events.length);
    expect(await prisma.contentJob.count()).toBe(beforeLegacyJobs);
    await identities.acknowledgePostNotification(
      (await prisma.outboxEvent.findFirstOrThrow({ where: { aggregateId: saved.id } })).id,
      telegramCreator.identityId,
    );
    expect(
      await identities.postNotificationSent(
        (await prisma.outboxEvent.findFirstOrThrow({ where: { aggregateId: saved.id } })).id,
        telegramCreator.identityId,
      ),
    ).toBe(true);
  });

  it('persists the brief and exact associations across fresh repository instances', async () => {
    const saved = await repo.create(complete, creator);
    const loaded = await new PrismaPostRepository(prisma).get(saved.id, creator);
    expect(loaded.currentRevision.captionVersionId).toBe(complete.captionVersionId);
    expect(loaded.currentRevision.posterVersionId).toBe(complete.posterVersionId);
    expect(loaded.currentRevision.visualAssetId).toBe(complete.visualAssetId);
    expect(loaded.currentRevision.brief).toBe(input.brief);
    expect(loaded.events).toHaveLength(1);
    await expect(repo.get(saved.id, stranger)).rejects.toThrow('cannot view');
    await expect(repo.revise(saved.id, 1, input, stranger)).rejects.toThrow('Only the creator');
  });
  it('rejects mismatched product and unproven older-image links', async () => {
    const second = await new PrismaProductSnapshotRepository(prisma).create({
      product: FICTIONAL_PRODUCTS[1]!,
      snapshotHash: 'f'.repeat(64),
      normalizerVersion: 'test',
    });
    await expect(
      repo.create({ ...complete, productSnapshotId: second.id }, creator),
    ).rejects.toThrow('selected product');
    const source = await prisma.visualAsset.findUniqueOrThrow({
      where: { id: complete.visualAssetId! },
    });
    const legacy = await prisma.visualAsset.create({
      data: {
        creativeJobId: source.creativeJobId,
        versionNumber: 2,
        mimeType: 'image/png',
        width: 1080,
        height: 1080,
        byteSize: 10,
        sha256: '8'.repeat(64),
        storageKey: 'test-only/legacy-image.png',
        sourceProductAssetDigest: '9'.repeat(64),
      },
    });
    await expect(repo.create({ ...complete, visualAssetId: legacy.id }, creator)).rejects.toThrow(
      'exact selected poster',
    );
  });
  it('blocks incomplete submissions and self-approval; independently approves an exact revision and invalidates it on edit', async () => {
    const incomplete = await repo.create(input, creator);
    await expect(repo.transition(incomplete.id, 1, 'SUBMIT', undefined, creator)).rejects.toThrow(
      'Save a caption',
    );
    const saved = await repo.create(complete, creator);
    expect((await repo.transition(saved.id, 1, 'SUBMIT', undefined, creator)).status).toBe(
      'UNDER_REVIEW',
    );
    await expect(repo.transition(saved.id, 1, 'APPROVE', undefined, creator, 1)).rejects.toThrow(
      'different authorized colleague',
    );
    await expect(repo.revise(saved.id, 1, complete, creator)).rejects.toThrow('before editing');
    const approved = await repo.transition(saved.id, 1, 'APPROVE', 'Checked fixture', reviewer, 1);
    expect(approved.status).toBe('APPROVED');
    const revised = await repo.revise(saved.id, 1, { ...complete, brief: 'New brief' }, creator);
    expect(revised.status).toBe('DRAFT');
    expect(revised.revisions).toHaveLength(2);
    expect(revised.events.some((e) => e.action === 'APPROVAL_INVALIDATED_BY_EDIT')).toBe(true);
    await expect(
      prisma.postRevision.update({
        where: { id: saved.currentRevision.id },
        data: { brief: 'rewrite' },
      }),
    ).rejects.toThrow('append-only');
  });
  it('allows request changes and rejects stale or simultaneous writes without overwriting history', async () => {
    const saved = await repo.create(complete, creator);
    await repo.transition(saved.id, 1, 'SUBMIT', undefined, creator);
    expect(
      (await repo.transition(saved.id, 1, 'REQUEST_CHANGES', 'Correct the caption', reviewer, 1))
        .status,
    ).toBe('CHANGES_REQUESTED');
    const results = await Promise.allSettled([
      repo.revise(saved.id, 1, complete, creator),
      repo.revise(saved.id, 1, { ...complete, brief: 'Concurrent' }, creator),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await repo.get(saved.id, creator)).revisions).toHaveLength(2);
    await expect(repo.transition(saved.id, 1, 'SUBMIT', undefined, creator)).rejects.toThrow(
      'out of date',
    );
  });
  const imageSettings = {
    model: 'fake-background-v1',
    resolution: '1k' as const,
    aspect_ratio: '1:1' as const,
    quality: 'low' as const,
    enhance_prompt: false as const,
  };
  it('deduplicates concurrent image requests and worker claims using the database', async () => {
    const post = await repo.create(input, creator);
    const ledger = new PrismaPostGenerationRepository(prisma);
    const [first, duplicate] = await Promise.all([
      ledger.enqueue(post.id, 1, creator, 'fake', imageSettings),
      ledger.enqueue(post.id, 1, creator, 'fake', imageSettings),
    ]);
    expect(first.id).toBe(duplicate.id);
    expect(await prisma.postGeneration.count({ where: { postId: post.id } })).toBe(1);
    const claims = await Promise.all([ledger.claim('fake'), ledger.claim('fake')]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    await expect(repo.revise(post.id, 1, input, creator)).rejects.toThrow('reconciled');
    await prisma.postGeneration.update({
      where: { id: first.id },
      data: { status: 'FAILED', leaseUntil: null },
    });
  });
  it('never reclaims an ambiguous POST for submission, including after a worker restart', async () => {
    const post = await repo.create(input, creator);
    const ledger = new PrismaPostGenerationRepository(prisma);
    const row = await ledger.enqueue(post.id, 1, creator, 'fake', imageSettings);
    await prisma.postGeneration.update({
      where: { id: row.id },
      data: { status: 'SUBMITTING', leaseUntil: new Date(0) },
    });
    expect(await ledger.claim('fake')).toBeNull();
    expect((await ledger.latest(post.id))?.status).toBe('UNCERTAIN');
    await expect(ledger.reconcile(row.id)).rejects.toThrow(
      'Another paid submission remains blocked',
    );
    await expect(repo.revise(post.id, 1, input, creator)).rejects.toThrow('reconciled');
    expect((await ledger.enqueue(post.id, 1, creator, 'fake', imageSettings)).id).toBe(row.id);
    await prisma.postGeneration.update({ where: { id: row.id }, data: { status: 'FAILED' } });
  });
  it('pins one complete caption/image artifact, retains independent review and freezes completed evidence', async () => {
    const post = await repo.create(input, creator);
    const ledger = new PrismaPostGenerationRepository(prisma);
    const row = await ledger.enqueue(post.id, 1, creator, 'fake', imageSettings);
    const claimed = await ledger.claim('fake');
    expect(claimed?.id).toBe(row.id);
    await ledger.update(row.id, claimed!.claimToken!, {
      status: 'COMPOSITING',
      requestId: 'fake-' + row.id,
    });
    const caption = (await repo.get((await repo.create(complete, creator)).id, creator))
      .currentRevision.captionVersion!.structuredOutput as Prisma.InputJsonObject;
    await ledger.complete(row.id, claimed!.claimToken!, {
      caption,
      provenance: {
        kind: 'MOCK',
        historicalPostersUsed: false,
        checks: { visual: { status: 'PASSED', blockingCount: 0 }, safety: { blockingCount: 0 } },
      },
      imageKey: 'test-only-saved-png',
      imageSha256: 'b'.repeat(64),
    });
    const result = await repo.get(post.id, creator);
    expect(result.revisionNumber).toBe(2);
    expect(result.currentRevision.generation?.id).toBe(row.id);
    expect(result.previewUrl).toContain(post.id);
    expect(result.currentRevision.captionVersionId).toBeNull();
    await repo.transition(post.id, 2, 'SUBMIT', undefined, creator);
    await expect(repo.transition(post.id, 2, 'APPROVE', undefined, creator, 1)).rejects.toThrow();
    expect((await repo.transition(post.id, 2, 'APPROVE', undefined, reviewer, 1)).status).toBe(
      'APPROVED',
    );
    await expect(
      prisma.postGeneration.update({ where: { id: row.id }, data: { imageKey: 'tampered' } }),
    ).rejects.toThrow('immutable');
    const edited = await repo.revise(post.id, 2, input, creator);
    expect(edited.status).toBe('DRAFT');
    expect(edited.currentRevision.generationId).toBeNull();
    expect(edited.revisions[1]?.generationId).toBe(row.id);
  });
  it('connects a business-owned OAuth client, encrypts tokens, serializes renewal and disconnects without using live credentials', async () => {
    const fake = await fakeHiggsfieldMcpServer();
    try {
      fake.fixture.expiresIn = 1;
      const config = {
        nodeEnvironment: 'test',
        higgsfieldMcp: {
          encryptionKey: '1'.repeat(64),
          redirectUri: 'http://127.0.0.1:5184/v1/integrations/higgsfield-mcp/callback',
          dispatchEnabled: false,
          sharedUseConfirmed: false,
        },
        featureFlags: { AI_IMAGE_GENERATION: true, CREATIVE_GENERATION: true },
      } as AppConfigService;
      const service = new HiggsfieldMcpService(prisma, config, fake.request);
      const authorization = await service.connect(creator.id);
      const url = new URL(authorization.authorizationUrl);
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      await fake.request(url, { redirect: 'manual' });
      const state = url.searchParams.get('state')!;
      await expect(service.callback(reviewer.id, state, 'fixture-code')).rejects.toThrow(
        'another session',
      );
      await service.callback(creator.id, state, 'fixture-code');
      await expect(service.callback(creator.id, state, 'fixture-code')).rejects.toThrow();
      const encrypted = await prisma.higgsfieldMcpConnection.findUniqueOrThrow({
        where: { id: 'business' },
      });
      expect(encrypted.encryptedState).not.toContain('fixture-access');
      expect(encrypted.encryptedState).not.toContain('fixture-refresh');
      const quotes = await Promise.all([
        service.quote('Background one'),
        service.quote('Background two'),
      ]);
      expect(fake.fixture.refreshes).toBe(1);
      expect(quotes[0]?.credits).toBe(0.25);
      expect(quotes[0]?.workspaceId).toBe('fixture-business-workspace');
      expect(fake.fixture.submissions).toHaveLength(0);
      await expect(service.submit('Background one', quotes[0])).rejects.toBeInstanceOf(
        McpBeforeSubmitError,
      );
      await service.disconnect(creator.id);
      expect(fake.fixture.revocations).toBe(1);
      expect((await service.status()).status).toBe('DISCONNECTED');
      expect(
        (await prisma.higgsfieldMcpConnection.findUniqueOrThrow({ where: { id: 'business' } }))
          .encryptedState,
      ).toBeNull();
      await expect(service.quote('Background one')).rejects.toThrow('reconnect');
      const reconnect = new URL((await service.connect(creator.id)).authorizationUrl);
      await fake.request(reconnect, { redirect: 'manual' });
      await service.callback(creator.id, reconnect.searchParams.get('state')!, 'fixture-code');
      fake.fixture.revokeFails = true;
      await service.disconnect(creator.id);
      expect((await service.status()).status).toBe('DISCONNECTED');
      expect(
        (await prisma.higgsfieldMcpConnection.findUniqueOrThrow({ where: { id: 'business' } }))
          .encryptedState,
      ).toBeNull();
      expect(fake.fixture.revocations).toBe(2);
    } finally {
      await fake.close();
    }
  });
  it('supports the live-style inline MCP preflight without spending during quotes and rejects unadvertised cost calls', async () => {
    const fake = await fakeHiggsfieldMcpServer();
    const config = {
      nodeEnvironment: 'test',
      higgsfieldMcp: {
        encryptionKey: '1'.repeat(64),
        redirectUri: 'http://127.0.0.1:5184/v1/integrations/higgsfield-mcp/callback',
        dispatchEnabled: true,
        sharedUseConfirmed: true,
      },
      featureFlags: { AI_IMAGE_GENERATION: true, CREATIVE_GENERATION: true },
    } as AppConfigService;
    const service = new HiggsfieldMcpService(prisma, config, fake.request);
    try {
      fake.fixture.contract = 'inline';
      const url = new URL((await service.connect(creator.id)).authorizationUrl);
      await fake.request(url, { redirect: 'manual' });
      await service.callback(creator.id, url.searchParams.get('state')!, 'fixture-code');
      fake.fixture.selected = false;
      await expect(service.connectionCheck()).rejects.toBeInstanceOf(McpBeforeSubmitError);
      expect((await service.workspaces()).workspaces[0]?.selected).toBe(false);
      await expect(service.selectWorkspace(creator.id, 'not-accessible')).rejects.toBeInstanceOf(
        McpBeforeSubmitError,
      );
      const beforeEpoch = (await service.status()).epoch;
      await service.selectWorkspace(creator.id, fake.fixture.workspace);
      expect((await service.status()).epoch).toBe(beforeEpoch + 1);
      // A replacement HTTP session restores the explicit workspace instead of assuming a default.
      fake.fixture.selected = false;
      expect(await service.connectionCheck()).toMatchObject({
        balance: 100,
        model: { id: 'gpt_image_2_6' },
      });
      const prompt = 'Test-only background';
      const quote = await service.quote(prompt);
      expect(quote.credits).toBe(0.25);
      expect(quote.params.use_unlim).toBe(false);
      expect(quote.params.get_cost).toBeUndefined();
      expect(fake.fixture.preflights).toBe(1);
      expect(fake.fixture.submissions).toHaveLength(0);
      fake.fixture.contract = 'unsafe-inline';
      await expect(service.quote(prompt)).rejects.toBeInstanceOf(McpBeforeSubmitError);
      expect(fake.fixture.preflights).toBe(1);
      expect(fake.fixture.submissions).toHaveLength(0);
      fake.fixture.contract = 'inline';
      const submitted = await service.submit(prompt, quote);
      expect(submitted.requestId).toBe(fake.fixture.submissions[0]);
      expect(fake.fixture.preflights).toBe(2);
      expect(fake.fixture.submissions).toHaveLength(1);
      expect(fake.fixture.balance).toBe(99.75);
      fake.fixture.cost = 0.5;
      await expect(service.submit(prompt, quote)).rejects.toBeInstanceOf(McpBeforeSubmitError);
      expect(fake.fixture.submissions).toHaveLength(1);
    } finally {
      await service.disconnect(creator.id);
      await fake.close();
    }
  });
  it('expires OAuth state and requires reconnection after a rejected token refresh without dispatching', async () => {
    const fake = await fakeHiggsfieldMcpServer(),
      realNow = Date.now;
    try {
      const config = {
        nodeEnvironment: 'test',
        higgsfieldMcp: {
          encryptionKey: '1'.repeat(64),
          redirectUri: 'http://127.0.0.1:5184/v1/integrations/higgsfield-mcp/callback',
          dispatchEnabled: false,
          sharedUseConfirmed: false,
        },
        featureFlags: { AI_IMAGE_GENERATION: false, CREATIVE_GENERATION: false },
      } as AppConfigService;
      const service = new HiggsfieldMcpService(prisma, config, fake.request);
      const expired = new URL((await service.connect(creator.id)).authorizationUrl);
      await fake.request(expired, { redirect: 'manual' });
      Date.now = (): number => realNow() + 700000;
      await expect(
        service.callback(creator.id, expired.searchParams.get('state')!, 'fixture-code'),
      ).rejects.toThrow('expired');
      Date.now = realNow;
      fake.fixture.expiresIn = 1;
      const current = new URL((await service.connect(creator.id)).authorizationUrl);
      await fake.request(current, { redirect: 'manual' });
      await service.callback(creator.id, current.searchParams.get('state')!, 'fixture-code');
      fake.fixture.refreshFails = true;
      await expect(service.quote('No charge')).rejects.toThrow('reconnect');
      expect((await service.status()).status).toBe('RECONNECT_REQUIRED');
      expect(fake.fixture.submissions).toHaveLength(0);
    } finally {
      Date.now = realNow;
      await fake.close();
    }
  });
  it('runs MCP transport through durable Post dispatch, recovers polling and blocks changed credit quotes without duplicate submissions', async () => {
    const fake = await fakeHiggsfieldMcpServer();
    const directory = await mkdtemp(join(tmpdir(), 'post-mcp-integration-'));
    try {
      const config = {
        nodeEnvironment: 'test',
        postImages: {},
        higgsfieldMcp: {
          encryptionKey: '1'.repeat(64),
          redirectUri: 'http://127.0.0.1:5184/v1/integrations/higgsfield-mcp/callback',
          dispatchEnabled: true,
          sharedUseConfirmed: true,
        },
        featureFlags: { AI_IMAGE_GENERATION: true, CREATIVE_GENERATION: true },
      } as AppConfigService;
      const service = new HiggsfieldMcpService(prisma, config, fake.request);
      const authorization = await service.connect(creator.id),
        url = new URL(authorization.authorizationUrl);
      await fake.request(url, { redirect: 'manual' });
      await service.callback(creator.id, url.searchParams.get('state')!, 'fixture-code');
      const ledger = new PrismaPostGenerationRepository(prisma),
        provider = new HiggsfieldMcpImageProvider(service, prisma, ['mcp-fixture.example']);
      const photo = generateTransparentProductPng_TEST_ONLY({ width: 400, height: 700 }),
        digest = createHash('sha256').update(photo).digest('hex');
      const heroes = {
        resolveAuthoritativeHeroEvidence: () =>
          Promise.resolve({
            asset: { id: 'test-photo', sha256: digest, mimeType: 'image/png' },
            registration: { id: 'test-registration' },
            assessment: { id: 'check' },
            rightsEvent: { id: 'rights' },
            approvalEvent: { id: 'approval' },
            buffer: photo,
          }),
      } as unknown as ProductAssetEligibilityEvaluator;
      const storage = new DiskAssetStorageAdapter({ storageRoot: directory });
      const worker = (): PostGenerationWorker =>
        new PostGenerationWorker(
          ledger,
          config,
          provider,
          heroes,
          storage,
          new SharpPosterCompositor(),
        );
      const owner = { ...creator, permissions: [...creator.permissions, 'MANAGE_AI_BUDGETS'] };
      const captionSeed = (await repo.create(complete, creator)).caption!;
      const post = await repo.create({ ...input, captionDraft: captionSeed }, creator);
      const rows = await Promise.all(
        Array.from({ length: 5 }, () =>
          ledger.enqueue(post.id, 1, creator, provider.id, provider.settings, {
            productDigest: digest,
          }),
        ),
      );
      expect(new Set(rows.map((row) => row.id)).size).toBe(1);
      const row = rows[0]!;
      expect(await ledger.claim(provider.id)).toBeNull();
      const quote = await service.quote(row.prompt);
      await ledger.saveCreditQuote(row.id, creator, { ...quote });
      await expect(ledger.authorizeCredits(row.id, creator, quote.fingerprint)).rejects.toThrow(
        'budget administrator',
      );
      await ledger.authorizeCredits(row.id, owner, quote.fingerprint);
      fake.fixture.cost = 1;
      await worker().tick();
      expect(fake.fixture.submissions).toHaveLength(0);
      expect((await ledger.latest(post.id))?.status).toBe('FAILED');
      fake.fixture.cost = 0.25;
      const revised = await repo.revise(
        post.id,
        1,
        { ...input, captionDraft: captionSeed },
        creator,
      );
      const retry = await ledger.enqueue(
        post.id,
        revised.revisionNumber,
        creator,
        provider.id,
        provider.settings,
        { productDigest: digest },
      );
      const first = await service.quote(retry.prompt);
      await ledger.saveCreditQuote(retry.id, creator, { ...first });
      const second = { ...first, expiresAt: new Date(Date.now() + 200000).toISOString() };
      second.fingerprint = mcpFingerprint(
        mcpParams(retry.prompt),
        second.connectionEpoch,
        second.workspaceId,
        second.credits,
        second.expiresAt,
      );
      await ledger.saveCreditQuote(retry.id, creator, { ...second });
      await expect(ledger.authorizeCredits(retry.id, owner, first.fingerprint)).rejects.toThrow(
        'changed or expired',
      );
      await ledger.authorizeCredits(retry.id, owner, second.fingerprint);
      fake.fixture.mode = 'poll-timeout';
      await Promise.all([worker().tick(), worker().tick()]);
      expect(fake.fixture.submissions).toHaveLength(1);
      expect((await ledger.latest(post.id))?.status).toBe('UNCERTAIN');
      fake.fixture.mode = 'complete';
      await ledger.reconcile(retry.id);
      await worker().tick();
      const completed = await repo.get(post.id, creator);
      expect(completed.currentRevision.generation?.status).toBe('COMPLETE');
      expect(completed.currentRevision.generation?.provider).toBe('higgsfield_mcp');
      expect(completed.currentRevision.generation?.estimatedCredits?.toNumber()).toBe(0.25);
      expect(completed.currentRevision.generation?.actualCostUsd).toBeNull();
      expect(fake.fixture.submissions).toHaveLength(1);
      const saved = await repo.image(post.id, creator);
      expect((await storage.getAssetBuffer(saved.storageKey))?.subarray(1, 4).toString()).toBe(
        'PNG',
      );
      await repo.transition(post.id, completed.revisionNumber, 'SUBMIT', undefined, creator);
      await expect(
        repo.transition(post.id, completed.revisionNumber, 'APPROVE', undefined, creator, 1),
      ).rejects.toThrow();
      await repo.transition(post.id, completed.revisionNumber, 'APPROVE', undefined, reviewer, 1);
      const exporter = { ...reviewer, permissions: [...reviewer.permissions, 'EXPORT_CREATIVE'] };
      const download = new ApprovedPostExportService(repo, storage, heroes, {
        nodeEnvironment: 'test',
      } as AppConfigService);
      expect(
        (
          await download.prepare(post.id, completed.currentRevision.id, 1, 'poster', exporter)
        ).bytes.equals((await storage.getAssetBuffer(saved.storageKey))!),
      ).toBe(true);
      await repo.revise(
        post.id,
        completed.revisionNumber,
        {
          ...input,
          generationId: completed.currentRevision.generationId,
          captionDraft: { ...completed.caption!, cta: 'Contact the store.' },
        },
        creator,
      );
      await expect(
        download.prepare(post.id, completed.currentRevision.id, 1, 'poster', exporter),
      ).rejects.toThrow('current approved');

      const oldConnectionQuote = await service.quote('Reconnection test');
      const newAuthorization = new URL((await service.connect(creator.id)).authorizationUrl);
      await fake.request(newAuthorization, { redirect: 'manual' });
      await service.callback(
        creator.id,
        newAuthorization.searchParams.get('state')!,
        'fixture-code',
      );
      const beforeReconnect = fake.fixture.submissions.length;
      await expect(service.submit('Reconnection test', oldConnectionQuote)).rejects.toBeInstanceOf(
        McpBeforeSubmitError,
      );
      expect(fake.fixture.submissions).toHaveLength(beforeReconnect);
      const lostPost = await repo.create({ ...input, captionDraft: captionSeed }, creator);
      const lost = await ledger.enqueue(lostPost.id, 1, creator, provider.id, provider.settings, {
        productDigest: digest,
      });
      const lostQuote = await service.quote(lost.prompt);
      await ledger.saveCreditQuote(lost.id, creator, { ...lostQuote });
      await ledger.authorizeCredits(lost.id, owner, lostQuote.fingerprint);
      fake.fixture.mode = 'lost-submit';
      await worker().tick();
      expect((await ledger.latest(lostPost.id))?.status).toBe('UNCERTAIN');
      expect((await ledger.latest(lostPost.id))?.requestId).toBeNull();
      const count = fake.fixture.submissions.length;
      fake.fixture.mode = 'complete';
      await prisma.postGeneration.update({
        where: { id: lost.id },
        data: { leaseUntil: new Date(0) },
      });
      await worker().tick();
      await expect(ledger.reconcile(lost.id)).rejects.toThrow('No provider request ID');
      expect(fake.fixture.submissions).toHaveLength(count);
    } finally {
      await fake.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('runs a no-cost complete Post generation with durable PNG storage and resumes it from the database', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'post-image-integration-'));
    try {
      const captionSource = await repo.create(complete, creator);
      const captionDraft = {
        ...captionSource.caption!,
        english_caption: 'Prepared before human review.',
      };
      const post = await repo.create({ ...input, captionDraft }, creator);
      expect(post.status).toBe('DRAFT');
      expect(post.currentRevision.captionVersionId).toBeNull();
      expect(post.events.some((event) => event.action === 'APPROVE')).toBe(false);
      const provider = new FakePostImageProvider();
      const ledger = new PrismaPostGenerationRepository(prisma);
      const product = generateTransparentProductPng_TEST_ONLY({ width: 400, height: 700 });
      const digest = createHash('sha256').update(product).digest('hex');
      // Synthetic approved-image evidence is a test double; no real product rights approval is asserted.
      const heroes = {
        resolveAuthoritativeHeroEvidence: () =>
          Promise.resolve({
            asset: { id: 'test-photo', sha256: digest, mimeType: 'image/png' },
            registration: { id: 'test-registration' },
            assessment: { id: 'test-check' },
            rightsEvent: { id: 'test-rights' },
            approvalEvent: { id: 'test-approval' },
            buffer: product,
          }),
      } as unknown as ProductAssetEligibilityEvaluator;
      await ledger.enqueue(post.id, 1, creator, 'fake', provider.settings, {
        productDigest: digest,
      });
      const storage = new DiskAssetStorageAdapter({ storageRoot: directory });
      const worker = new PostGenerationWorker(
        ledger,
        { postImages: {} } as AppConfigService,
        provider,
        heroes,
        storage,
        new SharpPosterCompositor(),
      );
      await worker.tick();
      const result = await new PrismaPostRepository(prisma).get(post.id, creator);
      expect(result.currentRevision.generation?.status).toBe('COMPLETE');
      expect(result.currentRevision.generation?.actualCostUsd?.toNumber()).toBe(0);
      expect(result.currentRevision.generation?.caption).toMatchObject({
        english_caption: 'Prepared before human review.',
      });
      const saved = await repo.image(post.id, creator);
      const bytes = await new DiskAssetStorageAdapter({ storageRoot: directory }).getAssetBuffer(
        saved.storageKey,
      );
      expect(bytes?.subarray(1, 4).toString()).toBe('PNG');
      await repo.transition(post.id, 2, 'SUBMIT', undefined, creator);
      await expect(repo.transition(post.id, 2, 'APPROVE', undefined, creator, 1)).rejects.toThrow();
      expect((await repo.transition(post.id, 2, 'APPROVE', undefined, reviewer, 1)).status).toBe(
        'APPROVED',
      );
      const exporter = { ...reviewer, permissions: [...reviewer.permissions, 'EXPORT_CREATIVE'] };
      const downloads = new ApprovedPostExportService(repo, storage, heroes, {
        nodeEnvironment: 'test',
      } as AppConfigService);
      const png = await downloads.prepare(
        post.id,
        result.currentRevision.id,
        1,
        'poster',
        exporter,
      );
      expect(png.bytes.equals(bytes!)).toBe(true);
      const json = await downloads.prepare(
        post.id,
        result.currentRevision.id,
        1,
        'caption-json',
        exporter,
      );
      expect(JSON.parse(json.bytes.toString())).toEqual(
        (await repo.get(post.id, exporter)).caption,
      );
      const manifest = await downloads.prepare(
        post.id,
        result.currentRevision.id,
        1,
        'manifest',
        exporter,
      );
      expect(JSON.parse(manifest.bytes.toString())).toMatchObject({
        revisionId: result.currentRevision.id,
        captionRevisionId: result.currentRevision.id,
        posterGenerationId: result.currentRevision.generationId,
        poster: {
          sha256: createHash('sha256').update(bytes!).digest('hex'),
          width: 1080,
          height: 1080,
        },
        captions: { jsonSha256: json.sha256 },
      });
      await expect(
        downloads.prepare(post.id, result.currentRevision.id, 1, 'poster', creator),
      ).rejects.toThrow('permission');
      await expect(
        downloads.prepare(post.id, result.currentRevision.id, 1, 'poster', {
          ...stranger,
          permissions: ['VIEW_OWN_CONTENT', 'EXPORT_CREATIVE'],
        }),
      ).rejects.toThrow('view');
      expect(await repo.canPreviewStorageKey(saved.storageKey, stranger)).toBe(false);
      expect(await repo.canPreviewStorageKey(saved.storageKey, creator)).toBe(true);
      const edited = await repo.revise(
        post.id,
        2,
        {
          ...input,
          generationId: result.currentRevision.generationId,
          captionDraft: { ...result.caption!, cta: 'Contact our store.' },
        },
        creator,
      );
      expect(edited.status).toBe('DRAFT');
      await expect(
        downloads.prepare(post.id, result.currentRevision.id, 1, 'poster', exporter),
      ).rejects.toThrow('current approved post');
      expect(
        (await repo.get(post.id, exporter)).events.filter(
          (event) => event.action === 'APPROVED_DOWNLOAD',
        ),
      ).toHaveLength(3);
      expect(await ledger.claim('fake')).toBeNull();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('holds live requests until a current quote, balance, confirmation and exact request enablement exist', async () => {
    const post = await repo.create(input, creator);
    const ledger = new PrismaPostGenerationRepository(prisma);
    const row = await ledger.enqueue(post.id, 1, creator, 'higgsfield', {
      ...imageSettings,
      model: 'marketing-studio/image',
    });
    expect(row.status).toBe('AWAITING_CONFIRMATION');
    expect(await ledger.claim('higgsfield')).toBeNull();
    await expect(
      ledger.authorize(row.id, creator, {
        expectedCostUsd: 1,
        currentBalanceUsd: 10,
        verifiedAt: new Date().toISOString(),
        evidence: 'Test-only quote',
      }),
    ).rejects.toThrow('budget administrator');
    const admin = { ...creator, permissions: [...creator.permissions, 'MANAGE_AI_BUDGETS'] };
    await expect(
      ledger.authorize(row.id, admin, {
        expectedCostUsd: 1,
        currentBalanceUsd: 0,
        verifiedAt: new Date().toISOString(),
        evidence: 'Insufficient test balance',
      }),
    ).rejects.toThrow('sufficient balance');
    await ledger.authorize(row.id, admin, {
      expectedCostUsd: 1,
      currentBalanceUsd: 10,
      verifiedAt: new Date().toISOString(),
      evidence: 'Test quote only; no live dispatch',
    });
    expect(await ledger.claim('higgsfield')).toBeNull();
    await ledger.cancelUnsubmitted(row.id, creator);
    expect((await ledger.latest(post.id))?.status).toBe('FAILED');
  });
  it('keeps caption approval independent, edits locally, returns reviewer feedback and requires reapproval', async () => {
    const saved = await repo.create(complete, creator);
    const originalCaption = await prisma.contentVersion.findUniqueOrThrow({
      where: { id: complete.captionVersionId! },
    });
    const originalCheck = await prisma.validationResult.findFirstOrThrow({
      where: { contentVersionId: originalCaption.id },
    });
    await prisma.approvalEvent.create({
      data: {
        contentJobId: originalCaption.contentJobId,
        contentVersionId: originalCaption.id,
        approverUserId: reviewer.id,
        decision: 'APPROVED',
        validationResultId: originalCheck.id,
        comment: 'Existing standalone fixture approval',
      },
    });
    const originalDecisions = await prisma.approvalEvent.findMany({
      where: { contentVersionId: originalCaption.id },
    });
    const originalJob = await prisma.contentJob.findUniqueOrThrow({
      where: { id: originalCaption.contentJobId },
    });
    await repo.transition(saved.id, 1, 'SUBMIT', undefined, creator);
    const changes = await repo.transition(
      saved.id,
      1,
      'REQUEST_CHANGES',
      'Make the caption clearer',
      reviewer,
      1,
    );
    expect(changes.canEdit).toBe(false);
    expect((await repo.get(saved.id, creator)).canEdit).toBe(true);
    expect(changes.events.at(-1)?.comment).toBe('Make the caption clearer');
    const editedCaption = {
      ...(originalCaption.structuredOutput as Prisma.JsonObject),
      english_caption: 'Find this product at Parisian Shopper.',
    } as unknown as NonNullable<SavePostInput['captionDraft']>;
    const edited = await repo.revise(
      saved.id,
      1,
      { ...complete, captionDraft: editedCaption },
      creator,
    );
    expect(edited.caption?.english_caption).toContain('Find this product');
    expect(edited.factualValidation?.blockingCount).toBe(0);
    const submitted = await repo.transition(saved.id, 2, 'SUBMIT', undefined, creator);
    expect(submitted.reviewRound).toBe(2);
    await expect(repo.transition(saved.id, 1, 'APPROVE', undefined, reviewer, 1)).rejects.toThrow(
      'out of date',
    );
    await repo.transition(saved.id, 2, 'APPROVE', 'Complete post checked', reviewer, 2);
    const changedAgain = await repo.revise(
      saved.id,
      2,
      { ...complete, captionDraft: { ...editedCaption, cta: 'Contact Parisian Shopper.' } },
      creator,
    );
    expect(changedAgain.status).toBe('DRAFT');
    expect(changedAgain.currentRevision.captionValidation).toMatchObject({ blockingCount: 0 });
    expect(
      changedAgain.events.some((event) => event.action === 'APPROVAL_INVALIDATED_BY_EDIT'),
    ).toBe(true);
    await expect(repo.transition(saved.id, 3, 'APPROVE', undefined, reviewer, 2)).rejects.toThrow();
    await repo.transition(saved.id, 3, 'SUBMIT', undefined, creator);
    await expect(repo.transition(saved.id, 3, 'APPROVE', undefined, reviewer, 2)).rejects.toThrow(
      'out of date',
    );
    const reapproved = await repo.transition(saved.id, 3, 'APPROVE', undefined, reviewer, 3);
    expect(reapproved.revisions).toHaveLength(3);
    expect(reapproved.revisions[1]?.captionDraft).toEqual(editedCaption);
    expect(reapproved.events.filter((event) => event.action === 'APPROVE')).toHaveLength(2);
    expect(reapproved.events.at(-1)?.validationSnapshot).toMatchObject({ blockingCount: 0 });
    expect(
      (await prisma.contentVersion.findUniqueOrThrow({ where: { id: originalCaption.id } }))
        .structuredOutput,
    ).toEqual(originalCaption.structuredOutput);
    expect(
      await prisma.approvalEvent.findMany({ where: { contentVersionId: originalCaption.id } }),
    ).toEqual(originalDecisions);
    expect(
      (await prisma.contentJob.findUniqueOrThrow({ where: { id: originalJob.id } })).status,
    ).toBe(originalJob.status);
  });
  it('rejects stale decisions after unchanged resubmission and serializes opposing reviewer decisions', async () => {
    const saved = await repo.create(complete, creator);
    await repo.transition(saved.id, 1, 'SUBMIT', undefined, creator);
    await repo.transition(saved.id, 1, 'REQUEST_CHANGES', 'Please check once more', reviewer, 1);
    const resubmitted = await repo.transition(saved.id, 1, 'SUBMIT', undefined, creator);
    expect(resubmitted.reviewRound).toBe(2);
    await expect(repo.transition(saved.id, 1, 'APPROVE', undefined, reviewer, 1)).rejects.toThrow(
      'out of date',
    );
    await expect(repo.transition(saved.id, 1, 'APPROVE', undefined, reviewer)).rejects.toThrow(
      'out of date',
    );
    const decisions = await Promise.allSettled([
      repo.transition(saved.id, 1, 'APPROVE', undefined, reviewer, 2),
      repo.transition(saved.id, 1, 'REQUEST_CHANGES', 'Use a different layout', reviewer, 2),
    ]);
    expect(decisions.filter((d) => d.status === 'fulfilled')).toHaveLength(1);
    const result = await repo.get(saved.id, creator);
    expect(
      result.events.filter(
        (event) => event.reviewRound === 2 && ['APPROVE', 'REQUEST_CHANGES'].includes(event.action),
      ),
    ).toHaveLength(1);
  });
  it('blocks requesters and submitted revision authors even when they are administrators', async () => {
    const newOwner = {
      ...creator,
      id: (await prisma.user.create({ data: { displayName: 'Separate fixture owner' } })).id,
    };
    const post = await repo.create(complete, newOwner);
    await prisma.$transaction(async (tx) => {
      await tx.postRevision.create({
        data: {
          productSnapshotId: complete.productSnapshotId,
          brief: complete.brief ?? '',
          channel: complete.channel,
          language: complete.language,
          campaignId: complete.campaignId ?? null,
          captionVersionId: complete.captionVersionId ?? null,
          posterVersionId: complete.posterVersionId ?? null,
          visualAssetId: complete.visualAssetId ?? null,
          postId: post.id,
          revisionNumber: 2,
          authorUserId: reviewer.id,
        },
      });
      await tx.post.update({ where: { id: post.id }, data: { revisionNumber: 2 } });
    });
    await repo.transition(post.id, 2, 'SUBMIT', undefined, newOwner);
    await expect(
      repo.transition(
        post.id,
        2,
        'APPROVE',
        undefined,
        { ...creator, permissions: [...creator.permissions, 'ADMIN'] },
        1,
      ),
    ).rejects.toThrow('created, requested, or edited');
    await expect(
      repo.transition(
        post.id,
        2,
        'APPROVE',
        undefined,
        { ...reviewer, permissions: [...reviewer.permissions, 'ADMIN'] },
        1,
      ),
    ).rejects.toThrow('created, requested, or edited');
    await expect(
      repo.transition(
        post.id,
        2,
        'APPROVE',
        undefined,
        { ...newOwner, permissions: [...newOwner.permissions, 'ADMIN'] },
        1,
      ),
    ).rejects.toThrow('created, requested, or edited');
  });
  it('stores invalid factual drafts but blocks review until corrected and preserves versioned image links', async () => {
    const post = await repo.create(complete, creator);
    const base = post.caption!;
    const edited = await repo.revise(
      post.id,
      1,
      { ...complete, captionDraft: { ...base, english_caption: 'Price: $0.01 USD.' } },
      creator,
    );
    expect(edited.status).toBe('DRAFT');
    expect(edited.factualValidation?.blockingCount).toBeGreaterThan(0);
    await expect(repo.transition(post.id, 2, 'SUBMIT', undefined, creator)).rejects.toThrow(
      'factual findings',
    );
    expect((await repo.image(post.id, creator, post.currentRevision.id)).storageKey).toBe(
      (await repo.image(post.id, creator, edited.currentRevision.id)).storageKey,
    );
    expect(post.previewUrl).not.toBe(edited.previewUrl);
    await expect(repo.image(post.id, creator, randomUUID())).rejects.toThrow('revision not found');
    await expect(
      prisma.postRevision.update({
        where: { id: edited.currentRevision.id },
        data: { captionDraft: { tampered: true } },
      }),
    ).rejects.toThrow('append-only');
    await expect(
      repo.revise(
        post.id,
        2,
        { ...complete, captionDraft: { ...base, hashtags: ['invalid tag'] } },
        creator,
      ),
    ).rejects.toThrow('valid hashtags');
  });
  it('freezes campaign context instead of changing an approved Post when its campaign is edited', async () => {
    const campaign = await prisma.campaign.create({
      data: {
        name: 'Original campaign',
        code: 'TEST-' + randomUUID(),
        objective: 'Promote the selected product',
        description: 'Original context',
        createdById: creator.id,
      },
    });
    const post = await repo.create({ ...complete, campaignId: campaign.id }, creator);
    await repo.transition(post.id, 1, 'SUBMIT', undefined, creator);
    await repo.transition(post.id, 1, 'APPROVE', undefined, reviewer, 1);
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { name: 'Changed campaign', objective: 'Changed objective' },
    });
    const approved = await repo.get(post.id, reviewer);
    expect(approved.currentRevision.campaignSnapshot).toMatchObject({
      name: 'Original campaign',
      objective: 'Promote the selected product',
    });
    expect(approved.status).toBe('APPROVED');
    const updated = await repo.revise(
      post.id,
      1,
      { ...complete, campaignId: campaign.id },
      creator,
    );
    expect(updated.status).toBe('DRAFT');
    expect(updated.currentRevision.campaignSnapshot).toMatchObject({ name: 'Changed campaign' });
  });
  it('filters My posts, Reviews and Approved posts without widening access or accepting fabricated approvals', async () => {
    const exporter = { ...reviewer, permissions: [...reviewer.permissions, 'EXPORT_CREATIVE'] };
    const ownerPost = await repo.create(complete, creator);
    const otherPost = await repo.create(complete, reviewer);
    const mine = await repo.list(creator, 1, 'mine');
    expect(mine.items.every((item) => item.creatorName === 'Post creator test')).toBe(true);
    expect(mine.items.some((item) => item.id === otherPost.id)).toBe(false);
    await repo.transition(ownerPost.id, 1, 'SUBMIT', undefined, creator);
    expect(
      (await repo.list(exporter, 1, 'reviews')).items.every(
        (item) => item.status === 'UNDER_REVIEW',
      ),
    ).toBe(true);
    await expect(
      repo.approvedExport(ownerPost.id, ownerPost.currentRevision.id, 1, exporter),
    ).rejects.toThrow('current approved post');
    await repo.transition(ownerPost.id, 1, 'APPROVE', undefined, reviewer, 1);
    expect(
      (await repo.approvedExport(ownerPost.id, ownerPost.currentRevision.id, 1, exporter))
        .currentRevision.id,
    ).toBe(ownerPost.currentRevision.id);
    await expect(repo.approvedExport(ownerPost.id, randomUUID(), 1, exporter)).rejects.toThrow(
      'current approved post',
    );
    await expect(
      repo.approvedExport(ownerPost.id, ownerPost.currentRevision.id, 0, exporter),
    ).rejects.toThrow('current approved post');
    expect(
      (await repo.list(exporter, 1, 'approved')).items.every((item) => item.status === 'APPROVED'),
    ).toBe(true);
    expect((await repo.list(stranger, 1, 'approved')).items).toHaveLength(0);
    const forged = await repo.create(complete, creator);
    await prisma.post.update({ where: { id: forged.id }, data: { status: 'APPROVED' } });
    await expect(
      repo.approvedExport(forged.id, forged.currentRevision.id, 0, exporter),
    ).rejects.toThrow('current approved post');
  });
  it('saves video planning separately and prevents video briefs using image dispatch or image approval', async () => {
    const videoPlan = {
      format: 'VIDEO' as const,
      purpose: 'CUSTOM' as const,
      style: 'EDITORIAL' as const,
      feedback: '',
      intent: 'INITIAL' as const,
    };
    const video = await repo.create({ ...input, creationPlan: videoPlan }, creator);
    expect(video.currentRevision.creationPlan).toEqual(videoPlan);
    const ledger = new PrismaPostGenerationRepository(prisma),
      provider = new FakePostImageProvider();
    await expect(
      ledger.enqueue(video.id, 1, creator, 'fake', provider.settings, {}),
    ).rejects.toThrow('Video generation is not connected');
    expect(await ledger.latest(video.id)).toBeNull();
    await expect(repo.transition(video.id, 1, 'SUBMIT', undefined, creator)).rejects.toThrow(
      'Video generation and video review',
    );
    await expect(repo.create({ ...complete, creationPlan: videoPlan }, creator)).rejects.toThrow(
      'cannot be linked as a video',
    );
  });
  it('rejects a submitted version independently and creates a feedback-guided design without replacing its history or dispatching', async () => {
    const post = await repo.create(complete, creator);
    await repo.transition(post.id, 1, 'SUBMIT', undefined, creator);
    await expect(
      repo.transition(post.id, 1, 'REJECT', 'Use a simpler layout', creator, 1),
    ).rejects.toThrow('different authorized colleague');
    await expect(repo.transition(post.id, 1, 'REJECT', '', reviewer, 1)).rejects.toThrow(
      'Explain what',
    );
    const rejected = await repo.transition(
      post.id,
      1,
      'REJECT',
      'Use a simpler layout',
      reviewer,
      1,
    );
    expect(rejected.status).toBe('REJECTED');
    await expect(repo.transition(post.id, 1, 'SUBMIT', undefined, creator)).rejects.toThrow();
    await expect(
      repo.prepareVariation(post.id, 1, reviewer, 'NEW_DESIGN', 'MINIMAL', 'More whitespace'),
    ).rejects.toThrow('Only the creator');
    await expect(
      repo.prepareVariation(post.id, 1, creator, 'REGENERATE', 'LUXURY', 'More whitespace'),
    ).rejects.toThrow('no recorded style');
    const revised = await repo.prepareVariation(
      post.id,
      1,
      creator,
      'NEW_DESIGN',
      'MINIMAL',
      'More whitespace',
    );
    expect(revised.status).toBe('DRAFT');
    expect(revised.revisionNumber).toBe(2);
    expect(revised.currentRevision.creationPlan).toMatchObject({
      style: 'MINIMAL',
      intent: 'NEW_DESIGN',
      feedback: 'More whitespace',
    });
    expect(revised.currentRevision.visualAssetId).toBeNull();
    expect(revised.previewUrl).toBeNull();
    expect(revised.revisions[1]?.visualAssetId).toBe(complete.visualAssetId);
    expect(revised.events.some((event) => event.action === 'REJECT')).toBe(true);
    const ledger = new PrismaPostGenerationRepository(prisma),
      provider = new FakePostImageProvider();
    expect(await ledger.latest(post.id)).toBeNull();
    await ledger.enqueue(post.id, 2, creator, 'fake', provider.settings, {});
    const prepared = await ledger.latest(post.id);
    expect(prepared?.prompt).toContain('minimal composition');
    expect(prepared?.prompt).toContain('More whitespace');
  });
});

function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
