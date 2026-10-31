import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
  AIContextBuilder,
  ApproveContentVersionUseCase,
  ApproveCreativeUseCase,
  ContentStrategyRegistry,
  CreateContentJobUseCase,
  CreateProductSnapshotUseCase,
  DEVELOPMENT_BRAND_RULES,
  generateTransparentProductPng,
  DeterministicFactualValidator,
  DeterministicVisualValidator,
  DiskAssetStorageAdapter,
  FakeAITextProvider,
  FakeCreativeProvider,
  GenerateContentUseCase,
  GenerateCreativeUseCase,
  GetApprovalStatusQuery,
  GetContentReviewStateQuery,
  GetProductBySkuUseCase,
  MockProductSource,
  NoopContentMetrics,
  NoopProductMetrics,
  PermissionService,
  RejectContentVersionUseCase,
  RequestContentEditUseCase,
  RequestContentRegenerationUseCase,
  SearchProductsUseCase,
  SharpHeroCompositor,
  TelegramAction,
  TelegramActionTokenService,
  TelegramCommandCenter,
  ValidateContentVersionUseCase,
  ValidateCreativeUseCase,
  VisualSafetyScanner,
  type ContentGenerationEnqueuer,
  type NormalizedProductEnvelope,
  type TelegramMessage,
  type TelegramResponse,
} from '@parisian-shopper/application';
import {
  type ApplicationLogger,
  type OutboxEventDraft,
  type OutboxWriter,
} from '@parisian-shopper/common';
import { FeatureFlag, type FeatureFlagService } from '@parisian-shopper/config';
import {
  PrismaApprovalsRepository,
  PrismaBrandRuleRepository,
  PrismaContentGenerationRepository,
  PrismaCreativeApprovalRepository,
  PrismaCreativeJobRepository,
  PrismaCreativeRevisionRepository,
  PrismaOutboxRelayRepository,
  PrismaProductSnapshotRepository,
  PrismaService,
  PrismaTelegramWorkflowRepository,
  PrismaValidationRepository,
  PrismaVisualAssetRepository,
  PrismaVisualValidationRepository,
} from '../../src/index.js';
import {
  CreativeGenerationQueue,
  CreativeGenerationWorker,
  OutboxRelayWorker,
  QueueRegistry,
  ValkeyConnectionService,
  WorkerRegistry,
} from '../../../jobs/src/index.js';
import { createBullMqConnection } from '../../../jobs/src/bullmq-connection.js';
import { FakeTelegramGateway } from '../../../telegram/src/telegram-delivery.gateway.js';
import { TelegramOutboxDispatcher } from '../../../telegram/src/telegram-outbox.dispatcher.js';
import { VisualReviewCallbackHandler } from '../../../telegram/src/handlers/visual-review-callback.handler.js';
import { type Prisma, type User } from '@prisma/client';
import { GlideClient } from '@valkey/valkey-glide';
import { Queue, Worker } from 'bullmq';
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';

const execFileAsync = promisify(execFile);
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const logger: ApplicationLogger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

const enabledFlags: Pick<FeatureFlagService, 'isEnabled'> = {
  isEnabled: (_flag: FeatureFlag): boolean => true,
};

class TestTelegramGateway extends FakeTelegramGateway {
  public popMessages(telegramUserId: string): TelegramMessage[] {
    const matching: TelegramMessage[] = [];
    const remaining: { telegramUserId: string; message: TelegramMessage }[] = [];
    for (const item of this.sent) {
      if (item.telegramUserId === telegramUserId) {
        matching.push(item.message);
      } else {
        remaining.push(item);
      }
    }
    this.sent.length = 0;
    this.sent.push(...remaining);
    return matching;
  }
}

describe('End-to-End Golden Path Creative Lifecycle', () => {
  let postgres: StartedPostgreSqlContainer | undefined;
  let valkey: StartedTestContainer | undefined;
  let prisma: PrismaService | undefined;

  let queueClient: GlideClient | undefined;
  let workerClient: GlideClient | undefined;
  const dedicatedGlideClients: GlideClient[] = [];
  let textQueue: Queue<{ contentJobId: string }> | undefined;
  let textWorker: Worker<{ contentJobId: string }> | undefined;

  let tempStorageDir: string;
  let storage: DiskAssetStorageAdapter | undefined;
  let compositor: SharpHeroCompositor | undefined;
  let fakeCreativeProvider: FakeCreativeProvider | undefined;

  let snapshotsRepo: PrismaProductSnapshotRepository | undefined;
  let brandsRepo: PrismaBrandRuleRepository | undefined;
  let contentRepo: PrismaContentGenerationRepository | undefined;
  let textValidationsRepo: PrismaValidationRepository | undefined;
  let approvalsRepo: PrismaApprovalsRepository | undefined;
  let workflowRepo: PrismaTelegramWorkflowRepository | undefined;

  let creativeJobRepo: PrismaCreativeJobRepository | undefined;
  let visualAssetRepo: PrismaVisualAssetRepository | undefined;
  let visualValidationRepo: PrismaVisualValidationRepository | undefined;
  let creativeApprovalRepo: PrismaCreativeApprovalRepository | undefined;
  let creativeRevisionRepo: PrismaCreativeRevisionRepository | undefined;

  let tokenService: TelegramActionTokenService | undefined;
  let commandCenter: TelegramCommandCenter | undefined;
  let visualCallbackHandler: VisualReviewCallbackHandler | undefined;
  let gateway: TestTelegramGateway | undefined;
  let outboxDispatcher: TelegramOutboxDispatcher | undefined;

  let creativeQueue: CreativeGenerationQueue | undefined;
  let creativeWorker: CreativeGenerationWorker | undefined;
  let outboxRelay: OutboxRelayWorker | undefined;
  let outboxRelayRepo: PrismaOutboxRelayRepository | undefined;
  let queueRegistry: QueueRegistry | undefined;
  let workerRegistry: WorkerRegistry | undefined;

  let generateCreativeUseCase: GenerateCreativeUseCase | undefined;
  let validateCreativeUseCase: ValidateCreativeUseCase | undefined;
  let approveCreativeUseCase: ApproveCreativeUseCase | undefined;

  let _editorUser: User;
  let _approverUser: User;
  let updateSequence = 9_000;

  const editorProfile = {
    telegramUserId: '900000001',
    username: 'e2e_editor',
    displayName: 'Golden Editor',
  };

  const approverProfile = {
    telegramUserId: '900000002',
    username: 'e2e_approver',
    displayName: 'Golden Approver',
  };

  const nextUpdateId = (): string => String(++updateSequence);

  const getPrisma = (): PrismaService => {
    if (prisma === undefined) throw new Error('Prisma is not connected');
    return prisma;
  };

  const command = (
    profile: { telegramUserId: string; username: string; displayName?: string },
    text: string,
  ): Promise<TelegramResponse> =>
    commandCenter!.handleCommand({ updateId: nextUpdateId(), profile, text });

  const callback = async (
    profile: { telegramUserId: string; username: string; displayName?: string },
    data: string,
  ): Promise<TelegramResponse> => {
    const rawToken = data.startsWith('ps:') ? data.slice(3) : data;
    // Check if the token belongs to visual review
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const tokenRecord = await getPrisma().telegramActionToken.findUnique({
      where: { tokenHash },
    });

    if (
      tokenRecord?.action === TelegramAction.APPROVE_VISUAL ||
      tokenRecord?.action === TelegramAction.CONFIRM_APPROVE_VISUAL ||
      tokenRecord?.action === TelegramAction.REQUEST_VISUAL_EDIT ||
      tokenRecord?.action === TelegramAction.REGENERATE_VISUAL ||
      tokenRecord?.action === TelegramAction.REJECT_VISUAL
    ) {
      return visualCallbackHandler!.handleCallback({
        updateId: nextUpdateId(),
        profile,
        callbackData: data,
      });
    }

    return commandCenter!.handleCallback({ updateId: nextUpdateId(), profile, callbackData: data });
  };

  const findButton = (response: TelegramResponse, text: string): string => {
    const norm = text.toLowerCase().trim();
    const found = response.messages
      .flatMap((msg) => msg.buttons ?? [])
      .flat()
      .find((btn) => {
        const t = btn.text.toLowerCase().trim();
        if (t === norm || t.includes(norm)) return true;
        if (norm === 'bilingual' && (t.includes('english') || t.includes('ខ្មែរ'))) return true;
        if (norm === 'facebook' && t.includes('square')) return true;
        if (norm === 'telegram' && t.includes('telegram')) return true;
        return false;
      });
    if (!found) {
      const available = response.messages
        .flatMap((m) => m.buttons ?? [])
        .flat()
        .map((b) => b.text);
      throw new Error(
        `Button containing "${text}" not found. Available buttons: ${JSON.stringify(available)}`,
      );
    }
    return found.callbackData;
  };

  const createStaff = async (
    name: string,
    roleCode: string,
    telegramUserId: string,
    username: string,
  ): Promise<User> => {
    const user = await getPrisma().user.create({
      data: {
        displayName: name,
        status: 'ACTIVE',
      },
    });
    const role = await getPrisma().role.findUniqueOrThrow({ where: { code: roleCode } });
    await getPrisma().userRole.create({ data: { userId: user.id, roleId: role.id } });
    await getPrisma().telegramIdentity.create({
      data: {
        userId: user.id,
        telegramUserId: BigInt(telegramUserId),
        telegramUsername: username,
        displayName: name,
      },
    });
    return user;
  };

  beforeAll(async () => {
    // 1. Launch PostgreSQL and Valkey Testcontainers
    [postgres, valkey] = await Promise.all([
      new PostgreSqlContainer('postgres:17.6-alpine')
        .withDatabase('parisian_golden_creative_test')
        .withUsername('parisian_test')
        .withPassword('fictional_test_password')
        .start(),
      new GenericContainer('valkey/valkey:8.1.3-alpine')
        .withExposedPorts(6379)
        .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/u))
        .start(),
    ]);

    const databaseUrl = postgres.getConnectionUri();
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

    // 2. Setup file storage and local compositor
    tempStorageDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'golden-path-cas-'));
    storage = new DiskAssetStorageAdapter({
      storageRoot: tempStorageDir,
      maxBytes: 15 * 1024 * 1024,
      baseUrl: 'https://cdn.example.invalid/assets',
    });
    compositor = new SharpHeroCompositor();
    fakeCreativeProvider = new FakeCreativeProvider();

    // 3. Initialize Repositories
    snapshotsRepo = new PrismaProductSnapshotRepository(prisma);
    brandsRepo = new PrismaBrandRuleRepository(prisma);
    contentRepo = new PrismaContentGenerationRepository(prisma);
    textValidationsRepo = new PrismaValidationRepository(prisma);
    approvalsRepo = new PrismaApprovalsRepository(prisma);
    workflowRepo = new PrismaTelegramWorkflowRepository(prisma);

    creativeJobRepo = new PrismaCreativeJobRepository(prisma);
    visualAssetRepo = new PrismaVisualAssetRepository(prisma);
    visualValidationRepo = new PrismaVisualValidationRepository(prisma);
    creativeApprovalRepo = new PrismaCreativeApprovalRepository(prisma);
    creativeRevisionRepo = new PrismaCreativeRevisionRepository(prisma);

    // 4. Seed brand rules and users
    await brandsRepo.create({
      name: 'E2E Golden Brand Rules',
      version: 1,
      status: 'ACTIVE',
      rules: DEVELOPMENT_BRAND_RULES,
      activatedAt: new Date(),
    });

    _editorUser = await createStaff(
      'Golden Editor',
      'MARKETING_EDITOR',
      editorProfile.telegramUserId,
      editorProfile.username,
    );

    _approverUser = await createStaff(
      'Golden Approver',
      'MARKETING_APPROVER',
      approverProfile.telegramUserId,
      approverProfile.username,
    );

    // 5. Connect Valkey clients
    const address = {
      host: valkey.getHost(),
      port: valkey.getMappedPort(6379),
    };
    queueClient = await GlideClient.createClient({ addresses: [address] });
    workerClient = await GlideClient.createClient({ addresses: [address] });

    tokenService = new TelegramActionTokenService(workflowRepo);
    gateway = new TestTelegramGateway();

    // 6. Setup Outbox Writer
    const outboxWriter: OutboxWriter = {
      append: async (event: OutboxEventDraft): Promise<string> => {
        const created = await getPrisma().outboxEvent.create({
          data: {
            topic: event.topic,
            schemaVersion: event.schemaVersion,
            idempotencyKey: event.idempotencyKey,
            payload: event.payload as Prisma.InputJsonObject,
            occurredAt: event.occurredAt,
            availableAt: event.availableAt,
            ...(event.aggregateType !== undefined ? { aggregateType: event.aggregateType } : {}),
            ...(event.aggregateId !== undefined ? { aggregateId: event.aggregateId } : {}),
          },
          select: { id: true },
        });
        return created.id;
      },
    };

    // 7. Setup Creative Use Cases
    generateCreativeUseCase = new GenerateCreativeUseCase(
      creativeJobRepo,
      visualAssetRepo,
      storage,
      fakeCreativeProvider,
      compositor,
      contentRepo,
      snapshotsRepo,
      textValidationsRepo,
      logger,
      undefined,
      undefined,
      undefined,
      undefined,
      true, // Explicit test-only legacy asset fallback; production remains fail-closed.
    );

    validateCreativeUseCase = new ValidateCreativeUseCase(
      creativeJobRepo,
      visualAssetRepo,
      visualValidationRepo,
      storage,
      new DeterministicVisualValidator(),
      new VisualSafetyScanner(),
      logger,
    );

    approveCreativeUseCase = new ApproveCreativeUseCase(
      creativeJobRepo,
      visualAssetRepo,
      creativeApprovalRepo,
      visualValidationRepo,
      logger,
    );

    // 8. Setup Visual Review Callback Handler
    visualCallbackHandler = new VisualReviewCallbackHandler(
      creativeJobRepo,
      visualAssetRepo,
      creativeRevisionRepo,
      creativeApprovalRepo,
      workflowRepo,
      tokenService,
      approveCreativeUseCase,
      generateCreativeUseCase,
      logger,
    );

    // 9. Setup BullMQ Creative Queue & Worker
    const valkeyConnectionMock = {
      createDedicatedClient: async (): Promise<GlideClient> => {
        const client = await GlideClient.createClient({ addresses: [address] });
        dedicatedGlideClients.push(client);
        return client;
      },
    } as unknown as ValkeyConnectionService;

    queueRegistry = new QueueRegistry();
    workerRegistry = new WorkerRegistry();

    creativeQueue = new CreativeGenerationQueue(valkeyConnectionMock, queueRegistry, enabledFlags);
    await creativeQueue.onModuleInit();

    creativeWorker = new CreativeGenerationWorker(
      valkeyConnectionMock,
      workerRegistry,
      generateCreativeUseCase,
      validateCreativeUseCase,
      logger,
      outboxWriter,
    );
    await creativeWorker.onModuleInit();

    // 10. Setup Outbox Relay Worker
    outboxRelayRepo = new PrismaOutboxRelayRepository(prisma);
    outboxRelay = new OutboxRelayWorker(outboxRelayRepo, creativeQueue, logger, undefined);

    // 11. Setup Text Generation Queue & Worker
    textQueue = new Queue(`e2e-text-queue-${crypto.randomUUID()}`, {
      connection: createBullMqConnection(queueClient),
    });

    const textEnqueuer: ContentGenerationEnqueuer = {
      enqueue: async (contentJobId): Promise<void> => {
        await textQueue!.add('GENERATE_AND_VALIDATE', { contentJobId });
      },
    };

    const textGenerationUseCase = new GenerateContentUseCase(
      contentRepo,
      snapshotsRepo,
      brandsRepo,
      new FakeAITextProvider(),
      { timeoutMs: 3_000, attemptStaleAfterMs: 5_000 },
      new NoopContentMetrics(),
      logger,
      enabledFlags,
      new ContentStrategyRegistry(),
      new AIContextBuilder(),
    );

    const textValidationUseCase = new ValidateContentVersionUseCase(
      contentRepo,
      snapshotsRepo,
      textValidationsRepo,
      new DeterministicFactualValidator(),
    );

    textWorker = new Worker(
      textQueue.name,
      async (job): Promise<void> => {
        const version = await textGenerationUseCase.execute(job.data.contentJobId);
        if (version !== null) {
          await textValidationUseCase.execute(version.id);
        }
      },
      { connection: createBullMqConnection(workerClient) },
    );

    await Promise.all([textQueue.waitUntilReady(), textWorker.waitUntilReady()]);

    // 12. Setup Telegram Command Center & Dispatcher
    const permissions = new PermissionService();
    const productMetrics = new NoopProductMetrics();

    // Prepare Hero Product Imagery & Fixture
    const heroBuffer = generateTransparentProductPng({
      width: 400,
      height: 400,
      productWidth: 240,
      productHeight: 240,
      productColor: { r: 218, g: 165, b: 32, a: 255 }, // Gold color
    });

    const heroSaved = await storage.saveAsset({
      buffer: heroBuffer,
      mimeType: 'image/png',
      assetRole: 'CANONICAL_PRODUCT',
      width: 400,
      height: 400,
    });

    const hermesProductEnvelope: NormalizedProductEnvelope = {
      schema_version: '1.0',
      source_system: 'ERP',
      retrieved_at: new Date().toISOString(),
      source_updated_at: new Date().toISOString(),
      lifecycle_status: 'active',
      product: {
        sku: 'HERMES-BIRKIN-25-GOLD',
        product_name: 'Hermès Birkin 25 Togo Gold',
        brand: 'Hermès',
        category: 'Leather Goods',
        price: '24500.0000',
        currency: 'EUR',
        stock_status: 'in_stock',
        description: 'Iconic Hermès Birkin 25 in Togo calfskin with gold-plated hardware.',
        images: [
          {
            url: heroSaved.publicUrl ?? 'https://cdn.example.invalid/hermes-birkin.png',
            role: 'primary',
            position: 1,
            sha256: heroSaved.sha256Digest,
          },
        ],
      },
    };

    const mockSource = new MockProductSource([hermesProductEnvelope]);
    const productsUseCase = new GetProductBySkuUseCase(mockSource, productMetrics, logger);
    const searchUseCase = new SearchProductsUseCase(mockSource, productMetrics, logger);
    const snapshotUseCase = new CreateProductSnapshotUseCase(snapshotsRepo, productMetrics, logger);
    const createJobUseCase = new CreateContentJobUseCase(contentRepo);
    const requestEditUseCase = new RequestContentEditUseCase(
      approvalsRepo,
      textEnqueuer,
      permissions,
    );
    const requestRegenUseCase = new RequestContentRegenerationUseCase(
      approvalsRepo,
      textEnqueuer,
      permissions,
    );
    const approveUseCase = new ApproveContentVersionUseCase(approvalsRepo, permissions);
    const rejectUseCase = new RejectContentVersionUseCase(approvalsRepo, permissions);
    const reviewStateQuery = new GetContentReviewStateQuery(approvalsRepo);
    const approvalStatusQuery = new GetApprovalStatusQuery(approvalsRepo);

    commandCenter = new TelegramCommandCenter(
      workflowRepo,
      permissions,
      productsUseCase,
      searchUseCase,
      snapshotUseCase,
      createJobUseCase,
      brandsRepo,
      textEnqueuer,
      tokenService,
      { actionTokenTtlSeconds: 900, demoMode: true },
      requestEditUseCase,
      requestRegenUseCase,
      approveUseCase,
      rejectUseCase,
      reviewStateQuery,
      approvalStatusQuery,
    );

    outboxDispatcher = new TelegramOutboxDispatcher(
      workflowRepo,
      gateway,
      tokenService,
      { telegram: { actionTokenTtlSeconds: 900, mode: 'webhook' }, demoMode: true },
      enabledFlags,
      logger,
      creativeJobRepo,
      visualAssetRepo,
      visualValidationRepo,
      storage,
    );
  }, 120_000);

  afterAll(async () => {
    outboxRelay?.onModuleDestroy();
    await workerRegistry?.onModuleDestroy();
    await queueRegistry?.onModuleDestroy();
    await textWorker?.close();
    await textQueue?.close();
    for (const client of dedicatedGlideClients) {
      client.close();
    }
    dedicatedGlideClients.length = 0;
    queueClient?.close();
    workerClient?.close();
    await prisma?.$disconnect();
    await fs.promises.rm(tempStorageDir, { recursive: true, force: true }).catch(() => {});
    await Promise.all([postgres?.stop(), valkey?.stop()]);
  });

  const waitForTextCompletion = (): Promise<void> =>
    new Promise((resolve, reject) => {
      textWorker!.once('completed', () => resolve());
      textWorker!.once('failed', (_job, error) => reject(error));
    });

  it('executes complete end-to-end lifecycle from ingestion to visual approval', async () => {
    // -------------------------------------------------------------
    // STEP 1: Product Ingestion & Interactive Text Flow (/create)
    // -------------------------------------------------------------
    const createResponse = await command(editorProfile, '/create HERMES-BIRKIN-25-GOLD');
    expect(createResponse.messages[0]?.text).toContain('Hermès Birkin 25 Togo Gold');
    expect(createResponse.messages[0]?.text).toContain('Step 2 of 6');

    // Select content type: PRODUCT_SPOTLIGHT
    const typeResponse = await callback(
      editorProfile,
      findButton(createResponse, 'Product spotlight'),
    );
    expect(typeResponse.messages[0]?.text).toContain('Step 3 of 6');

    // Select language: Bilingual
    const langResponse = await callback(editorProfile, findButton(typeResponse, 'Bilingual'));
    expect(langResponse.messages[0]?.text).toContain('Step 4 of 6');

    // Select platform: Telegram
    const platformResponse = await callback(editorProfile, findButton(langResponse, 'Telegram'));
    expect(platformResponse.messages[0]?.text).toContain('Step 5 of 6');

    // Select visual style: Parisian Morning Atelier
    const styleResponse = await callback(
      editorProfile,
      findButton(platformResponse, 'Parisian Morning'),
    );
    expect(styleResponse.messages[0]?.text).toContain('Step 6 of 6');

    // Confirm generation -> enqueues text & creative generation
    const textJobPromise = waitForTextCompletion();
    const confirmResponse = await callback(
      editorProfile,
      findButton(styleResponse, 'Generate Poster'),
    );
    expect(confirmResponse.messages[0]?.text).toContain('Generating Poster & Copy');
    await textJobPromise;

    // Verify ProductSnapshot and ContentJob created
    const contentJob = await getPrisma().contentJob.findFirstOrThrow({
      orderBy: { createdAt: 'desc' },
      include: { productSnapshot: true },
    });
    expect(contentJob.productSnapshot.sku).toBe('HERMES-BIRKIN-25-GOLD');
    expect(contentJob.status).toBe('UNDER_REVIEW');

    // Verify Text Version V1 & Validation Result
    const contentVersion1 = await getPrisma().contentVersion.findFirstOrThrow({
      where: { contentJobId: contentJob.id, versionNumber: 1 },
      include: { validationResults: true },
    });
    expect(contentVersion1.validationResults[0]?.status).toBe('PASSED');

    // -------------------------------------------------------------
    // STEP 2: Telegram Text Review & Operator Approval
    // -------------------------------------------------------------
    await outboxDispatcher!.dispatchOnce();
    const editorMessages = gateway!.popMessages(editorProfile.telegramUserId);
    expect(editorMessages.length).toBeGreaterThan(0);
    const draftMessage = editorMessages[0]!;
    expect(draftMessage.text).toContain('Draft Copy Review');
    expect(draftMessage.text).toContain('V1');

    // Operator clicks Approve on Text draft
    const approveButton = findButton({ messages: [draftMessage] }, 'Approve');
    const confirmPrompt = await callback(approverProfile, approveButton);
    expect(confirmPrompt.messages[0]?.text).toContain('Confirm Approval');

    // Confirm text approval by authorized independent approver
    const confirmApproveButton = findButton(confirmPrompt, 'Confirm Approve');
    const approvedResponse = await callback(approverProfile, confirmApproveButton);
    expect(approvedResponse.messages[0]?.text).toContain('Approved');

    // Assert Database state after text approval
    const updatedContentJob = await getPrisma().contentJob.findUniqueOrThrow({
      where: { id: contentJob.id },
    });
    expect(updatedContentJob.status).toBe('APPROVED');

    const textApprovalEvent = await getPrisma().approvalEvent.findFirstOrThrow({
      where: { contentJobId: contentJob.id, contentVersionId: contentVersion1.id },
    });
    expect(textApprovalEvent.decision).toBe('APPROVED');
    expect(textApprovalEvent.approverUserId).toBe(_approverUser.id);

    // -------------------------------------------------------------
    // STEP 3: Outbox Relay & BullMQ Creative Background Generation
    // -------------------------------------------------------------
    // Verify CONTENT_APPROVED event was created in Outbox
    const contentApprovedOutbox = await getPrisma().outboxEvent.findFirstOrThrow({
      where: { topic: 'CONTENT_APPROVED', aggregateId: contentJob.id },
    });
    expect(contentApprovedOutbox).toBeDefined();

    // Outbox relay processes CONTENT_APPROVED and enqueues creative job
    const relayedCount = await outboxRelay!.dispatchOnce();
    expect(relayedCount).toBeGreaterThanOrEqual(1);

    // Wait for BullMQ Creative Generation & Validation to execute
    // Wait until CreativeJob enters READY_FOR_REVIEW
    let creativeJob = await getPrisma().creativeJob.findFirst({
      where: { contentVersionId: contentVersion1.id },
    });

    const maxWaitMs = 15_000;
    const pollIntervalMs = 250;
    let elapsed = 0;
    while (
      (creativeJob === null || creativeJob.status !== 'READY_FOR_REVIEW') &&
      elapsed < maxWaitMs
    ) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      elapsed += pollIntervalMs;
      creativeJob = await getPrisma().creativeJob.findFirst({
        where: { contentVersionId: contentVersion1.id },
      });
    }

    expect(creativeJob).not.toBeNull();
    expect(creativeJob!.status).toBe('READY_FOR_REVIEW');

    // Verify VisualAsset was generated and composited by ps-compositor-v1
    const visualAsset = await getPrisma().visualAsset.findFirstOrThrow({
      where: { creativeJobId: creativeJob!.id, versionNumber: 1 },
    });
    expect(visualAsset.assetRole).toBe('COMPOSITED_CREATIVE');
    expect(visualAsset.width).toBe(1080);
    expect(visualAsset.height).toBe(1080);
    expect(visualAsset.sha256).toBeDefined();
    expect(visualAsset.sha256).toHaveLength(64);

    // Verify CAS storage key integrity on disk
    const casExists = await storage!.assetExists(visualAsset.storageKey);
    expect(casExists).toBe(true);

    const assetBytes = await storage!.getAssetBuffer(visualAsset.storageKey);
    expect(assetBytes).not.toBeNull();
    const computedDigest = crypto.createHash('sha256').update(assetBytes!).digest('hex');
    expect(computedDigest).toBe(visualAsset.sha256);

    // Verify Deterministic Visual Validator marked asset as PASSED
    const visualValidation = await getPrisma().visualValidationResult.findFirstOrThrow({
      where: { visualAssetId: visualAsset.id },
      include: { findings: true },
    });
    expect(visualValidation.status).toBe('PASSED');
    expect(visualValidation.blockingCount).toBe(0);
    expect(visualValidation.findingCount).toBe(0);

    // -------------------------------------------------------------
    // STEP 4: Telegram Visual Review & Two-Step Operator Approval
    // -------------------------------------------------------------
    // Dispatch CREATIVE_VALIDATED notification to Telegram
    await outboxDispatcher!.dispatchOnce();
    const visualReviewMessages = gateway!.popMessages(editorProfile.telegramUserId);
    expect(visualReviewMessages.length).toBeGreaterThan(0);
    const visualCardMessage = visualReviewMessages[0]!;
    expect(visualCardMessage.text).toContain('Visual Creative Review');
    expect(visualCardMessage.text).toContain('Hermès Birkin 25 Togo Gold');
    expect(visualCardMessage.text).toContain('1080×1080');

    // Operator clicks "Approve Poster" or "Approve Visual"
    const approveVisualButton = findButton({ messages: [visualCardMessage] }, 'Approve');
    const visualConfirmPrompt = await callback(approverProfile, approveVisualButton);
    expect(visualConfirmPrompt.messages[0]?.text).toContain('commercial use');

    // Operator confirms visual approval in 2nd step
    const confirmVisualButton = findButton(visualConfirmPrompt, 'Approve Design');
    const visualApprovedResponse = await callback(approverProfile, confirmVisualButton);
    expect(visualApprovedResponse.messages[0]?.text).toContain('Approved');

    // -------------------------------------------------------------
    // STEP 5: Terminal State Assertions Across All Subsystems
    // -------------------------------------------------------------
    // 1. ContentJob and ContentVersion are APPROVED
    const finalContentJob = await getPrisma().contentJob.findUniqueOrThrow({
      where: { id: contentJob.id },
    });
    expect(finalContentJob.status).toBe('APPROVED');

    // 2. CreativeJob is transitioned to CREATIVE_APPROVED
    const finalCreativeJob = await getPrisma().creativeJob.findUniqueOrThrow({
      where: { id: creativeJob!.id },
    });
    expect(finalCreativeJob.status).toBe('CREATIVE_APPROVED');

    // 3. CreativeApprovalEvent recorded with full linkage
    const creativeApproval = await getPrisma().creativeApprovalEvent.findFirstOrThrow({
      where: { creativeJobId: creativeJob!.id, visualAssetId: visualAsset.id },
    });
    expect(creativeApproval.decision).toBe('CREATIVE_APPROVED');
    expect(creativeApproval.approverUserId).toBe(_approverUser.id);
    expect(creativeApproval.visualValidationResultId).toBe(visualValidation.id);

    // 4. Audit Log Entries recorded for both text approval and visual approval
    const textAuditEvents = await getPrisma().auditEvent.findMany({
      where: { action: 'TELEGRAM_CONTENT_APPROVED' },
    });
    expect(textAuditEvents.length).toBeGreaterThanOrEqual(1);

    const visualAuditEvents = await getPrisma().auditEvent.findMany({
      where: { action: 'TELEGRAM_VISUAL_APPROVED' },
    });
    expect(visualAuditEvents.length).toBeGreaterThanOrEqual(1);
    expect(visualAuditEvents[0]?.resourceId).toBe(creativeJob!.id);
  });
});
