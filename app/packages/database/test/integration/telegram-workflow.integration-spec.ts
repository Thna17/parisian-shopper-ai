import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
  AIContextBuilder,
  ContentStrategyRegistry,
  CreateContentJobUseCase,
  CreateProductSnapshotUseCase,
  DEVELOPMENT_BRAND_RULES,
  DeterministicFactualValidator,
  FakeAITextProvider,
  FICTIONAL_PRODUCTS,
  GetProductBySkuUseCase,
  MockProductSource,
  NoopContentMetrics,
  NoopProductMetrics,
  PermissionService,
  SearchProductsUseCase,
  TelegramAction,
  TelegramActionTokenService,
  TelegramCommandCenter,
  ValidateContentVersionUseCase,
  GenerateContentUseCase,
  hashTelegramActionToken,
  type AITextProvider,
  type ContentGenerationEnqueuer,
  type ProductMetrics,
  type TelegramResponse,
} from '@parisian-shopper/application';
import { type ApplicationLogger } from '@parisian-shopper/common';
import { FeatureFlag, type FeatureFlagService } from '@parisian-shopper/config';
import { GlideClient } from '@valkey/valkey-glide';
import { jest } from '@jest/globals';
import { Queue, Worker } from 'bullmq';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';

import { createBullMqConnection } from '../../../jobs/src/bullmq-connection.js';
import { FakeTelegramGateway } from '../../../telegram/src/telegram-delivery.gateway.js';
import { TelegramOutboxDispatcher } from '../../../telegram/src/telegram-outbox.dispatcher.js';
import { PrismaBrandRuleRepository } from '../../src/brand/prisma-brand-rule.repository.js';
import { PrismaContentGenerationRepository } from '../../src/content/prisma-content-generation.repository.js';
import { PrismaProductSnapshotRepository } from '../../src/product-snapshot/prisma-product-snapshot.repository.js';
import { PrismaService } from '../../src/prisma.service.js';
import { PrismaTelegramWorkflowRepository } from '../../src/telegram/prisma-telegram-workflow.repository.js';
import { PrismaValidationRepository } from '../../src/validation/prisma-validation.repository.js';

const execFileAsync = promisify(execFile);
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const logger: ApplicationLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
const productMetrics: ProductMetrics = new NoopProductMetrics();
const enabledFlags: Pick<FeatureFlagService, 'isEnabled'> = {
  isEnabled: (_flag: FeatureFlag): boolean => true,
};
const editorProfile = {
  telegramUserId: '700000001',
  username: 'editor_original',
  displayName: 'Fictional Editor',
};
const approverProfile = { telegramUserId: '700000003', username: 'approver' };

describe('Phase 1E durable Telegram workflow', () => {
  let postgres: StartedPostgreSqlContainer | undefined;
  let valkey: StartedTestContainer | undefined;
  let prisma: PrismaService | undefined;
  let queueClient: GlideClient | undefined;
  let workerClient: GlideClient | undefined;
  let queue: Queue<{ contentJobId: string }> | undefined;
  let worker: Worker<{ contentJobId: string }> | undefined;
  let workflow: PrismaTelegramWorkflowRepository | undefined;
  let snapshots: PrismaProductSnapshotRepository | undefined;
  let brands: PrismaBrandRuleRepository | undefined;
  let content: PrismaContentGenerationRepository | undefined;
  let validations: PrismaValidationRepository | undefined;
  let commandCenter: TelegramCommandCenter | undefined;
  let updateSequence = 1_000;

  beforeAll(async () => {
    [postgres, valkey] = await Promise.all([
      new PostgreSqlContainer('postgres:17.6-alpine')
        .withDatabase('parisian_telegram_test')
        .withUsername('parisian_test')
        .withPassword('fictional_test_password')
        .start(),
      new GenericContainer('valkey/valkey:8.1.3-alpine')
        .withExposedPorts(6379)
        .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/u))
        .start(),
    ]);
    const databaseUrl = requiredPostgres().getConnectionUri();
    await execFileAsync(
      'pnpm',
      ['--filter', '@parisian-shopper/database', 'prisma:migrate:deploy'],
      {
        cwd: appRoot,
        env: { ...process.env, DATABASE_URL: databaseUrl },
      },
    );
    process.env.DATABASE_URL = databaseUrl;
    prisma = new PrismaService();
    await prisma.$connect();
    snapshots = new PrismaProductSnapshotRepository(prisma);
    brands = new PrismaBrandRuleRepository(prisma);
    content = new PrismaContentGenerationRepository(prisma);
    validations = new PrismaValidationRepository(prisma);
    workflow = new PrismaTelegramWorkflowRepository(prisma);

    const editor = await createStaff(
      'Editor',
      'MARKETING_EDITOR',
      editorProfile.telegramUserId,
      editorProfile.username,
    );
    await createStaff('Viewer', 'VIEWER', '700000002', 'shared_name');
    await createStaff('Approver', 'MARKETING_APPROVER', '700000003', 'approver');
    await createStaff('Disabled identity', 'MARKETING_EDITOR', '700000004', 'disabled', true);
    expect(editor).toBeDefined();
    await getBrands().create({
      name: 'Phase 1E fictional brand rules',
      version: 1,
      status: 'ACTIVE',
      rules: DEVELOPMENT_BRAND_RULES,
      activatedAt: new Date(),
    });

    const address = {
      host: requiredValkey().getHost(),
      port: requiredValkey().getMappedPort(6379),
    };
    queueClient = await GlideClient.createClient({ addresses: [address] });
    workerClient = await GlideClient.createClient({ addresses: [address] });
    queue = new Queue(`phase-1e-${crypto.randomUUID()}`, {
      connection: createBullMqConnection(queueClient),
    });
    const enqueuer: ContentGenerationEnqueuer = {
      enqueue: async (contentJobId): Promise<void> => {
        await requiredQueue().add(
          'GENERATE_AND_VALIDATE',
          { contentJobId },
          { jobId: `generate-${contentJobId}` },
        );
      },
    };
    commandCenter = createCommandCenter(enqueuer);
    worker = new Worker(
      requiredQueue().name,
      async (job): Promise<void> => {
        const version = await generationUseCase(new FakeAITextProvider()).execute(
          job.data.contentJobId,
        );
        if (version !== null) await validationUseCase().execute(version.id);
      },
      { connection: createBullMqConnection(workerClient) },
    );
    await Promise.all([requiredQueue().waitUntilReady(), requiredWorker().waitUntilReady()]);
  });

  afterAll(async () => {
    await worker?.close();
    await queue?.close();
    queueClient?.close();
    workerClient?.close();
    await prisma?.$disconnect();
    await Promise.all([postgres?.stop(), valkey?.stop()]);
  });

  it('authorizes by numeric ID and enforces role/disabled identity rules', async () => {
    expect(
      (await command({ telegramUserId: '799999999', username: 'editor_original' }, '/start'))
        .messages[0]?.text,
    ).toContain('Access denied');
    expect(
      (
        await command(
          { telegramUserId: '700000002', username: 'shared_name' },
          '/create FIC-PERF-001',
        )
      ).messages[0]?.text,
    ).toContain('Access denied');
    expect(
      (await command({ telegramUserId: '700000004', username: 'disabled' }, '/start')).messages[0]
        ?.text,
    ).toContain('Access denied');
    expect(
      (await command({ telegramUserId: '799999998', username: 'shared_name' }, '/start'))
        .messages[0]?.text,
    ).toContain('Access denied');
    expect(
      (await command({ ...editorProfile, username: 'editor_renamed' }, '/create FIC-PERF-001'))
        .messages[0]?.text,
    ).toContain('Step 2 of 6');
    expect(
      (await command({ telegramUserId: '700000003', username: 'approver' }, '/create FIC-PERF-001'))
        .messages[0]?.text,
    ).toContain('Step 2 of 6');
    expect(
      (await getPrisma().telegramIdentity.findUnique({ where: { telegramUserId: 700000001n } }))
        ?.telegramUsername,
    ).toBe('editor_renamed');
    const viewerHelp = await command(
      { telegramUserId: '700000002', username: 'shared_name' },
      '/help',
    );
    expect(viewerHelp.messages[0]?.text).toContain('/search');
    expect(viewerHelp.messages[0]?.text).not.toContain('/create');
    const search = await command(editorProfile, '/search Maison Imaginaire');
    expect(search.messages[0]?.text).toContain('FIC-PERF-001');
    expect(search.messages[0]?.buttons?.flat().some((item) => item.text.startsWith('Select'))).toBe(
      true,
    );
  });

  it('persists the full create flow, runs FakeAI and validation through Valkey, and emits a draft', async () => {
    const beforeSnapshots = await getPrisma().productSnapshot.count();
    const create = await command(editorProfile, '/create FIC-PERF-001');
    expect(create.messages[0]?.text).toContain('Moonlit River Eau de Parfum');
    expect(create.messages[0]?.text).toContain('Step 2 of 6');
    expect(await getPrisma().contentJob.count()).toBe(0);

    const contentType = await callback(editorProfile, button(create, 'Product spotlight'));
    const language = await callback(editorProfile, button(contentType, 'Bilingual'));
    const platform = await callback(editorProfile, button(language, 'Facebook'));
    const style = await callback(editorProfile, button(platform, 'Parisian Morning'));
    const completed = completion();
    const generating = await callback(editorProfile, button(style, 'Generate Poster'));
    expect(generating.messages[0]?.text).toContain('Generating Poster & Copy');
    await completed;

    const job = await getPrisma().contentJob.findFirst({
      orderBy: { createdAt: 'desc' },
      include: { versions: { include: { validationResults: true } } },
    });
    expect(job).not.toBeNull();
    expect(await getPrisma().productSnapshot.count()).toBe(beforeSnapshots + 1);
    expect(job?.versions).toHaveLength(1);
    expect(job?.versions[0]?.versionNumber).toBe(1);
    expect(job?.versions[0]?.validationResults[0]?.status).toBe('PASSED');

    const gateway = new FakeTelegramGateway();
    await dispatcher(gateway).dispatchOnce();
    const notification = gateway.sent.at(-1)?.message;
    expect(notification?.text).toContain('Draft Copy Review');
    expect(notification?.text).toContain('Facts checked');
    expect(notification?.buttons?.flat().map((item) => item.text)).toEqual([
      '📋 Source Facts',
      '🛡️ Validation Details',
      '✏️ Request Edit',
      '🔄 Regenerate',
    ]);
    expect(notification?.text).not.toContain('Approve');

    const status = await command(editorProfile, '/status');
    expect(status.messages[0]?.text).toContain('Moonlit River Eau de Parfum');
    const history = await command(editorProfile, '/history FIC-PERF-001');
    expect(history.messages[0]?.text).toContain('Validated');

    const source = await callback(editorProfile, buttonFromMessage(notification, 'Source Facts'));
    expect(source.messages[0]?.text).toContain('SKU: FIC-PERF-001');
    const validation = await callback(
      editorProfile,
      buttonFromMessage(notification, 'Validation Details'),
    );
    expect(validation.messages[0]?.text).toContain('no blocking issues');
  });

  it('blocks wrong-price output and exposes PRICE_MISMATCH without approval actions', async () => {
    const flow = await completeSelectionsWithoutWaiting('/create FIC-PERF-001', false);
    const job = await getPrisma().contentJob.findUnique({ where: { telegramCreateFlowId: flow } });
    if (job === null) throw new Error('Blocked test job missing');
    const badProvider: AITextProvider = {
      providerName: 'phase-1e-wrong-price',
      model: 'fixture-v1',
      generate: () =>
        Promise.resolve({
          provider: 'phase-1e-wrong-price',
          model: 'fixture-v1',
          output: {
            headline: 'Fictional product',
            khmer_caption: 'តម្លៃ $35 USD',
            english_caption: 'Now $35 USD.',
            cta: 'Learn more',
            hashtags: ['#Fictional'],
            creative_brief: 'Static card',
            facts_used: ['$35 USD'],
            warnings: [],
            missing_information: [],
          },
        }),
    };
    const version = await generationUseCase(badProvider).execute(job.id);
    if (version === null) throw new Error('Blocked version missing');
    const result = await validationUseCase().execute(version.id);
    expect(result.status).toBe('BLOCKED');
    expect(result.findings.map((finding) => finding.code)).toContain('PRICE_MISMATCH');

    const gateway = new FakeTelegramGateway();
    await dispatcher(gateway).dispatchOnce();
    const notification = gateway.sent.at(-1)?.message;
    expect(notification?.text).toContain('BLOCKED');
    expect(notification?.buttons?.flat().some((item) => item.text === 'Approve')).toBe(false);
    const detail = await callback(
      editorProfile,
      buttonFromMessage(notification, 'Validation Details'),
    );
    expect(detail.messages[0]?.text).toContain('PRICE_MISMATCH');
  });

  it('rejects duplicate updates, callback replay, wrong-user and expired tokens durably', async () => {
    const updateId = nextUpdateId();
    const first = await getCommandCenter().handleCommand({
      updateId,
      profile: editorProfile,
      text: '/create FIC-PERF-001',
    });
    const duplicate = await getCommandCenter().handleCommand({
      updateId,
      profile: editorProfile,
      text: '/create FIC-PERF-001',
    });
    expect(first.messages).toHaveLength(1);
    expect(duplicate.messages).toHaveLength(0);

    const token = button(first, 'Product spotlight');
    const before = await getPrisma().telegramCreateFlow.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    const wrongUser = await callback({ telegramUserId: '700000003', username: 'approver' }, token);
    expect(wrongUser.messages[0]?.text).toContain('another user');
    expect(
      (await getPrisma().telegramCreateFlow.findUnique({ where: { id: requiredId(before?.id) } }))
        ?.contentType,
    ).toBeNull();

    const accepted = await callback(editorProfile, token);
    expect(accepted.messages[0]?.text).toContain('Step 3 of 6');
    const replay = await callback(editorProfile, token);
    expect(replay.messages[0]?.text).toContain('expired');

    const expiring = await command(editorProfile, '/create FIC-PERF-001');
    const raw = button(expiring, 'Product spotlight').slice(3);
    await getPrisma().telegramActionToken.update({
      where: { tokenHash: createHash('sha256').update(raw).digest('hex') },
      data: { expiresAt: new Date(0) },
    });
    const expired = await callback(editorProfile, `ps:${raw}`);
    expect(expired.messages[0]?.text).toContain('expired');
  });

  it('preserves the snapshot and sends a safe notification when generation fails', async () => {
    const product = FICTIONAL_PRODUCTS[0];
    if (product === undefined) throw new Error('Fixture missing');
    const snapshot = await new CreateProductSnapshotUseCase(
      getSnapshots(),
      productMetrics,
      logger,
    ).execute(product);
    const brand = await getBrands().findActive();
    const identity = await getPrisma().telegramIdentity.findUniqueOrThrow({
      where: { telegramUserId: BigInt(editorProfile.telegramUserId) },
    });
    if (brand === null) throw new Error('Brand rules missing');
    const job = await getContent().createJob({
      productSnapshotId: snapshot.id,
      brandRuleVersionId: brand.id,
      requesterUserId: identity.userId,
      contentType: 'PRODUCT_SPOTLIGHT',
      language: 'BILINGUAL',
      platform: 'FACEBOOK',
    });
    const failingProvider: AITextProvider = {
      providerName: 'phase-1e-failure',
      model: 'fixture-v1',
      generate: () => Promise.reject(new Error('Fictional provider outage')),
    };
    await expect(generationUseCase(failingProvider).execute(job.id)).rejects.toBeDefined();
    expect((await getContent().findJobById(job.id))?.status).toBe('FAILED');
    expect(await getContent().findVersionsByJobId(job.id)).toHaveLength(0);
    expect(await getSnapshots().findById(snapshot.id)).not.toBeNull();

    const gateway = new FakeTelegramGateway();
    await dispatcher(gateway).dispatchOnce();
    expect(gateway.sent.at(-1)?.message.text).toContain('Content generation failed');
    expect(gateway.sent.at(-1)?.message.text).not.toContain('Fictional provider outage');
  });

  it('recovers selection state after command-center reconstruction and never creates duplicate jobs', async () => {
    const create = await command(approverProfile, '/create FIC-PERF-001');
    const contentType = await callback(approverProfile, button(create, 'Product spotlight'));
    commandCenter = createCommandCenter({
      enqueue: (): Promise<void> => Promise.resolve(),
    });
    const language = await callback(approverProfile, button(contentType, 'Bilingual'));
    const platform = await callback(approverProfile, button(language, 'Facebook'));
    const style = await callback(approverProfile, button(platform, 'Parisian Morning'));
    const finalToken = button(style, 'Generate Poster');
    const first = await callback(approverProfile, finalToken);
    const second = await callback(approverProfile, finalToken);
    expect(first.messages[0]?.text).toContain('Generating Poster & Copy');
    expect(second.messages[0]?.text).toContain('expired');
    const flow = await getPrisma().telegramCreateFlow.findFirst({ orderBy: { createdAt: 'desc' } });
    expect(await getPrisma().contentJob.count({ where: { telegramCreateFlowId: flow?.id } })).toBe(
      1,
    );
  });

  it('W30-B: persists active workflow messages and channel publications across distinct repository instances', async () => {
    const repo1 = getWorkflow();
    const repo2 = new PrismaTelegramWorkflowRepository(getPrisma());

    const testResourceKey = 'flow-test-w30b-1';
    await repo1.setActiveWorkflowMessage(testResourceKey, 1042, 'chat-789', {
      messageType: 'WIZARD_PROMPT',
      payloadMetadata: { step: 3 },
    });

    const retrieved = await repo2.getActiveWorkflowMessage(testResourceKey);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.messageId).toBe(1042);
    expect(retrieved?.chatId).toBe('chat-789');
    expect(retrieved?.messageType).toBe('WIZARD_PROMPT');
    expect(retrieved?.payloadMetadata).toEqual({ step: 3 });

    await repo2.clearActiveWorkflowMessage(testResourceKey);
    const cleared = await repo1.getActiveWorkflowMessage(testResourceKey);
    expect(cleared).toBeNull();
  });

  it('W30-B: cancels an in-progress flow and retrieves active flow by identity', async () => {
    const actor = await getWorkflow().resolveActor(editorProfile);
    expect(actor).not.toBeNull();
    const identityId = actor?.identityId;
    if (identityId === undefined) throw new Error('Identity missing');

    const product = FICTIONAL_PRODUCTS[0];
    if (product === undefined) throw new Error('Product fixture missing');

    const flow = await getWorkflow().createFlow(
      identityId,
      product,
      new Date(Date.now() + 600_000),
    );

    const activeBefore = await getWorkflow().findActiveFlowByIdentity(identityId);
    expect(activeBefore).not.toBeNull();
    expect(activeBefore?.id).toBe(flow.id);
    expect(activeBefore?.status).toBe('SELECTING_CONTENT_TYPE');

    await getWorkflow().cancelFlow(flow.id);

    const cancelledFlow = await getWorkflow().findFlowById(flow.id);
    expect(cancelledFlow?.status).toBe('CANCELLED');

    const activeAfter = await getWorkflow().findActiveFlowByIdentity(identityId);
    expect(activeAfter).toBeNull();
  });

  it('W30-E: recovers wizard state upon simulated process restart and /resume', async () => {
    // 1. User starts /create and advances to Step 3
    const startRes = await command(editorProfile, '/create FIC-PERF-001');
    expect(startRes.messages[0]?.text).toContain('Step 2 of 6');
    const token = button(startRes, 'Product spotlight');
    const step3Res = await callback(editorProfile, token);
    expect(step3Res.messages[0]?.text).toContain('Step 3 of 6');

    // 2. Simulate process exit & cold start: create fresh repository and fresh CommandCenter
    const freshRepo = new PrismaTelegramWorkflowRepository(getPrisma());
    const freshCommandCenter = new TelegramCommandCenter(
      freshRepo,
      new PermissionService(),
      new GetProductBySkuUseCase(new MockProductSource(), productMetrics, logger),
      new SearchProductsUseCase(new MockProductSource(), productMetrics, logger),
      new CreateProductSnapshotUseCase(getSnapshots(), productMetrics, logger),
      new CreateContentJobUseCase(getContent()),
      getBrands(),
      { enqueue: (): Promise<void> => Promise.resolve() },
      new TelegramActionTokenService(freshRepo),
      { actionTokenTtlSeconds: 900 },
    );

    // 3. User invokes /resume on fresh instance
    const resumeRes = await freshCommandCenter.handleCommand({
      updateId: nextUpdateId(),
      profile: editorProfile,
      text: '/resume',
    });

    expect(resumeRes.messages).toHaveLength(1);
    expect(resumeRes.messages[0]?.text).toContain('Resumed Creation Wizard');
    expect(resumeRes.messages[0]?.text).toContain('Step 3 of 6');
  });

  it('W30-E: handles concurrent action token race condition atomically in PostgreSQL', async () => {
    const actor = await getWorkflow().resolveActor(editorProfile);
    if (!actor) throw new Error('Actor missing');

    const tokenService = new TelegramActionTokenService(getWorkflow());
    const [rawToken] = await tokenService.create(actor.identityId, [
      { action: TelegramAction.CONFIRM_APPROVE_VISUAL, resourceId: 'test-job-conc' },
    ]);
    if (!rawToken) throw new Error('Token creation failed');
    const tokenHash = hashTelegramActionToken(rawToken);

    // Simulate rapid concurrent button clicks (both trying to consume the token)
    const [result1, result2] = await Promise.all([
      getWorkflow().consumeActionToken(tokenHash, editorProfile.telegramUserId, new Date()),
      getWorkflow().consumeActionToken(tokenHash, editorProfile.telegramUserId, new Date()),
    ]);

    const resolved = [result1, result2].filter((r) => r.disposition === 'RESOLVED');
    const consumed = [result1, result2].filter((r) => r.disposition === 'CONSUMED');

    expect(resolved).toHaveLength(1);
    expect(consumed).toHaveLength(1);
  });

  it('W30-E: enforces webhook update deduplication atomically via claimInboundUpdate in PostgreSQL', async () => {
    const updateId = `inbound-race-${Date.now()}`;
    const [res1, res2] = await Promise.all([
      getWorkflow().claimInboundUpdate(updateId, editorProfile.telegramUserId, 'message'),
      getWorkflow().claimInboundUpdate(updateId, editorProfile.telegramUserId, 'message'),
    ]);

    expect([res1, res2].filter(Boolean)).toHaveLength(1);

    // Sequential replay also rejected
    const replayRes = await getWorkflow().claimInboundUpdate(
      updateId,
      editorProfile.telegramUserId,
      'message',
    );
    expect(replayRes).toBe(false);
  });

  function createCommandCenter(enqueuer: ContentGenerationEnqueuer): TelegramCommandCenter {
    const source = new MockProductSource();
    return new TelegramCommandCenter(
      getWorkflow(),
      new PermissionService(),
      new GetProductBySkuUseCase(source, productMetrics, logger),
      new SearchProductsUseCase(source, productMetrics, logger),
      new CreateProductSnapshotUseCase(getSnapshots(), productMetrics, logger),
      new CreateContentJobUseCase(getContent()),
      getBrands(),
      enqueuer,
      new TelegramActionTokenService(getWorkflow()),
      { actionTokenTtlSeconds: 900 },
    );
  }

  async function createStaff(
    label: string,
    roleCode: string,
    telegramUserId: string,
    username: string,
    disabled = false,
  ): Promise<string> {
    const user = await getPrisma().user.create({ data: { displayName: `Phase 1E ${label}` } });
    const role = await getPrisma().role.findUniqueOrThrow({ where: { code: roleCode } });
    await getPrisma().userRole.create({ data: { userId: user.id, roleId: role.id } });
    await getPrisma().telegramIdentity.create({
      data: {
        userId: user.id,
        telegramUserId: BigInt(telegramUserId),
        telegramUsername: username,
        ...(disabled ? { disabledAt: new Date() } : {}),
      },
    });
    return user.id;
  }

  async function command(
    profile: typeof editorProfile | { telegramUserId: string; username?: string },
    text: string,
  ): Promise<TelegramResponse> {
    return getCommandCenter().handleCommand({ updateId: nextUpdateId(), profile, text });
  }

  async function callback(
    profile: typeof editorProfile | { telegramUserId: string; username?: string },
    callbackData: string,
  ): Promise<TelegramResponse> {
    return getCommandCenter().handleCallback({ updateId: nextUpdateId(), profile, callbackData });
  }

  async function completeSelectionsWithoutWaiting(
    createText: string,
    enqueue: boolean,
  ): Promise<string> {
    commandCenter = createCommandCenter({
      enqueue: enqueue
        ? (id): Promise<void> =>
            requiredQueue()
              .add('GENERATE_AND_VALIDATE', { contentJobId: id })
              .then(() => undefined)
        : (): Promise<void> => Promise.resolve(),
    });
    const create = await command(editorProfile, createText);
    const flowId = (
      await getPrisma().telegramCreateFlow.findFirst({ orderBy: { createdAt: 'desc' } })
    )?.id;
    const contentType = await callback(editorProfile, button(create, 'Product spotlight'));
    const language = await callback(editorProfile, button(contentType, 'Bilingual'));
    const platform = await callback(editorProfile, button(language, 'Facebook'));
    const style = await callback(editorProfile, button(platform, 'Parisian Morning'));
    await callback(editorProfile, button(style, 'Generate Poster'));
    return requiredId(flowId);
  }

  function generationUseCase(provider: AITextProvider): GenerateContentUseCase {
    return new GenerateContentUseCase(
      getContent(),
      getSnapshots(),
      getBrands(),
      provider,
      { timeoutMs: 2_000, attemptStaleAfterMs: 3_000 },
      new NoopContentMetrics(),
      logger,
      enabledFlags,
      new ContentStrategyRegistry(),
      new AIContextBuilder(),
    );
  }

  function validationUseCase(): ValidateContentVersionUseCase {
    return new ValidateContentVersionUseCase(
      getContent(),
      getSnapshots(),
      getValidations(),
      new DeterministicFactualValidator(),
    );
  }

  function dispatcher(gateway: FakeTelegramGateway): TelegramOutboxDispatcher {
    const config = {
      telegram: { mode: 'webhook', actionTokenTtlSeconds: 900 },
    };
    return new TelegramOutboxDispatcher(
      getWorkflow(),
      gateway,
      new TelegramActionTokenService(getWorkflow()),
      config,
      enabledFlags,
      logger,
    );
  }

  function completion(): Promise<void> {
    return new Promise((resolve, reject) => {
      requiredWorker().once('completed', () => resolve());
      requiredWorker().once('failed', (_job, error) => reject(error));
    });
  }

  function button(response: TelegramResponse, label: string): string {
    return buttonFromMessage(response.messages[0], label);
  }

  function buttonFromMessage(
    message: TelegramResponse['messages'][number] | undefined,
    label: string,
  ): string {
    const norm = label.toLowerCase().trim();
    const value = message?.buttons?.flat().find((item) => {
      const text = item.text.toLowerCase().trim();
      if (text === norm || text.includes(norm)) return true;
      if (norm === 'bilingual' && (text.includes('english') || text.includes('ខ្មែរ'))) return true;
      if (norm === 'facebook' && text.includes('square')) return true;
      if (norm === 'telegram' && text.includes('telegram')) return true;
      return false;
    })?.callbackData;
    if (value === undefined) throw new Error(`Button missing: ${label}`);
    return value;
  }

  function nextUpdateId(): string {
    updateSequence += 1;
    return String(updateSequence);
  }
  function requiredId(value: string | undefined): string {
    if (value === undefined) throw new Error('ID missing');
    return value;
  }
  function requiredPostgres(): StartedPostgreSqlContainer {
    if (postgres === undefined) throw new Error('PostgreSQL unavailable');
    return postgres;
  }
  function requiredValkey(): StartedTestContainer {
    if (valkey === undefined) throw new Error('Valkey unavailable');
    return valkey;
  }
  function requiredQueue(): Queue<{ contentJobId: string }> {
    if (queue === undefined) throw new Error('Queue unavailable');
    return queue;
  }
  function requiredWorker(): Worker<{ contentJobId: string }> {
    if (worker === undefined) throw new Error('Worker unavailable');
    return worker;
  }
  function getPrisma(): PrismaService {
    if (prisma === undefined) throw new Error('Prisma unavailable');
    return prisma;
  }
  function getWorkflow(): PrismaTelegramWorkflowRepository {
    if (workflow === undefined) throw new Error('Workflow repository unavailable');
    return workflow;
  }
  function getSnapshots(): PrismaProductSnapshotRepository {
    if (snapshots === undefined) throw new Error('Snapshot repository unavailable');
    return snapshots;
  }
  function getBrands(): PrismaBrandRuleRepository {
    if (brands === undefined) throw new Error('Brand repository unavailable');
    return brands;
  }
  function getContent(): PrismaContentGenerationRepository {
    if (content === undefined) throw new Error('Content repository unavailable');
    return content;
  }
  function getValidations(): PrismaValidationRepository {
    if (validations === undefined) throw new Error('Validation repository unavailable');
    return validations;
  }
  function getCommandCenter(): TelegramCommandCenter {
    if (commandCenter === undefined) throw new Error('Command center unavailable');
    return commandCenter;
  }
});
