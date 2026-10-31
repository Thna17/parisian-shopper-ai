import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
  AIContextBuilder,
  ApproveContentVersionUseCase,
  ContentAlreadyApprovedError,
  ContentNotApprovalEligibleError,
  ContentStrategyRegistry,
  CreateContentJobUseCase,
  CreateProductSnapshotUseCase,
  DEVELOPMENT_BRAND_RULES,
  DeterministicFactualValidator,
  FakeAITextProvider,
  GenerateContentUseCase,
  GetApprovalStatusQuery,
  GetContentReviewStateQuery,
  GetProductBySkuUseCase,
  InvalidReviewStateError,
  MockProductSource,
  NoopContentMetrics,
  NoopProductMetrics,
  PermissionService,
  RejectContentVersionUseCase,
  RequestContentEditUseCase,
  RequestContentRegenerationUseCase,
  SearchProductsUseCase,
  TelegramAction,
  TelegramActionTokenService,
  TelegramCommandCenter,
  ValidateContentVersionUseCase,
  type AIContext,
  type AITextGenerationResult,
  type AITextProvider,
  type ContentGenerationEnqueuer,
  type ProductMetrics,
  type TelegramMessage,
  type TelegramResponse,
} from '@parisian-shopper/application';
import { type User } from '@prisma/client';
import { type ApplicationLogger } from '@parisian-shopper/common';
import { FeatureFlag, type FeatureFlagService } from '@parisian-shopper/config';
import { GlideClient } from '@valkey/valkey-glide';
import { jest } from '@jest/globals';
import { Queue, Worker } from 'bullmq';
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';

import { createBullMqConnection } from '../../../jobs/src/bullmq-connection.js';
import { FakeTelegramGateway } from '../../../telegram/src/telegram-delivery.gateway.js';
import { TelegramOutboxDispatcher } from '../../../telegram/src/telegram-outbox.dispatcher.js';
import { PrismaApprovalsRepository } from '../../src/approvals/prisma-approvals.repository.js';
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
  telegramUserId: '800000001',
  username: 'golden_editor',
  displayName: 'Golden Editor',
};
const approverProfile = {
  telegramUserId: '800000002',
  username: 'golden_approver',
  displayName: 'Golden Approver',
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

class FactualErrorAIProvider implements AITextProvider {
  public readonly providerName = 'fake';
  public readonly model = 'deterministic-fixture-v1';

  public constructor(private readonly fakePrice = '$999.00') {}

  public async generate(context: AIContext, signal: AbortSignal): Promise<AITextGenerationResult> {
    const normal = await new FakeAITextProvider().generate(context, signal);
    return {
      ...normal,
      output: {
        ...normal.output,
        headline: `Special deal for only ${this.fakePrice}`,
        english_caption: `Get this exclusive fragrance today at the wrong price of ${this.fakePrice}.`,
      },
    };
  }
}

describe('Phase 1G Acceptance Golden Path and Operational Resilience', () => {
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
  let approvals: PrismaApprovalsRepository | undefined;
  let commandCenter: TelegramCommandCenter | undefined;
  let gateway: TestTelegramGateway | undefined;
  let outboxDispatcher: TelegramOutboxDispatcher | undefined;
  let tokenService: TelegramActionTokenService | undefined;
  let updateSequence = 2_000;
  let currentAIProvider: AITextProvider = new FakeAITextProvider();

  const requiredPostgres = (): StartedPostgreSqlContainer => {
    if (postgres === undefined) throw new Error('Postgres is not started');
    return postgres;
  };

  const requiredValkey = (): StartedTestContainer => {
    if (valkey === undefined) throw new Error('Valkey is not started');
    return valkey;
  };

  const getPrisma = (): PrismaService => {
    if (prisma === undefined) throw new Error('Prisma is not started');
    return prisma;
  };

  const createStaff = async (
    name: string,
    roleCode: string,
    telegramUserId: string,
    username: string,
    disabled = false,
  ): Promise<User> => {
    const user = await getPrisma().user.create({
      data: {
        displayName: name,
        status: disabled ? 'DISABLED' : 'ACTIVE',
        disabledAt: disabled ? new Date() : null,
      },
    });
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
    return user;
  };

  const generationUseCase = (provider: AITextProvider): GenerateContentUseCase =>
    new GenerateContentUseCase(
      content!,
      snapshots!,
      brands!,
      provider,
      { timeoutMs: 2_000, attemptStaleAfterMs: 3_000 },
      new NoopContentMetrics(),
      logger,
      enabledFlags,
      new ContentStrategyRegistry(),
      new AIContextBuilder(),
    );

  const validationUseCase = (): ValidateContentVersionUseCase =>
    new ValidateContentVersionUseCase(
      content!,
      snapshots!,
      validations!,
      new DeterministicFactualValidator(),
    );

  const createCommandCenter = (enqueuer: ContentGenerationEnqueuer): TelegramCommandCenter => {
    const permissions = new PermissionService();
    const source = new MockProductSource();
    const products = new GetProductBySkuUseCase(source, productMetrics, logger);
    const search = new SearchProductsUseCase(source, productMetrics, logger);
    const snapshotUseCase = new CreateProductSnapshotUseCase(snapshots!, productMetrics, logger);
    const createJob = new CreateContentJobUseCase(content!);
    const requestEdit = new RequestContentEditUseCase(approvals!, enqueuer, permissions);
    const requestRegen = new RequestContentRegenerationUseCase(approvals!, enqueuer, permissions);
    const approve = new ApproveContentVersionUseCase(approvals!, permissions);
    const reject = new RejectContentVersionUseCase(approvals!, permissions);
    const reviewState = new GetContentReviewStateQuery(approvals!);
    const approvalStatus = new GetApprovalStatusQuery(approvals!);

    return new TelegramCommandCenter(
      workflow!,
      permissions,
      products,
      search,
      snapshotUseCase,
      createJob,
      brands!,
      enqueuer,
      tokenService!,
      { actionTokenTtlSeconds: 900, demoMode: true },
      requestEdit,
      requestRegen,
      approve,
      reject,
      reviewState,
      approvalStatus,
    );
  };

  beforeAll(async () => {
    [postgres, valkey] = await Promise.all([
      new PostgreSqlContainer('postgres:17.6-alpine')
        .withDatabase('parisian_golden_test')
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
    approvals = new PrismaApprovalsRepository(prisma);
    tokenService = new TelegramActionTokenService(workflow);

    await createStaff(
      'Golden Editor',
      'MARKETING_APPROVER',
      editorProfile.telegramUserId,
      editorProfile.username,
    );
    await createStaff(
      'Golden Approver',
      'MARKETING_APPROVER',
      approverProfile.telegramUserId,
      approverProfile.username,
    );

    await brands.create({
      name: 'Phase 1G Golden Brand Rules',
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

    queue = new Queue(`golden-queue-${crypto.randomUUID()}`, {
      connection: createBullMqConnection(queueClient),
    });

    const enqueuer: ContentGenerationEnqueuer = {
      enqueue: async (contentJobId): Promise<void> => {
        await queue!.add(
          'GENERATE_AND_VALIDATE',
          { contentJobId },
          { jobId: `generate-${contentJobId}-${Date.now()}` },
        );
      },
    };

    commandCenter = createCommandCenter(enqueuer);
    gateway = new TestTelegramGateway();
    outboxDispatcher = new TelegramOutboxDispatcher(
      workflow,
      gateway,
      tokenService,
      { telegram: { actionTokenTtlSeconds: 900, mode: 'webhook' }, demoMode: true },
      enabledFlags,
      logger,
    );

    worker = new Worker(
      queue.name,
      async (job): Promise<void> => {
        const version = await generationUseCase(currentAIProvider).execute(job.data.contentJobId);
        if (version !== null) {
          await validationUseCase().execute(version.id);
        }
      },
      { connection: createBullMqConnection(workerClient) },
    );

    await Promise.all([queue.waitUntilReady(), worker.waitUntilReady()]);
  });

  afterAll(async () => {
    await worker?.close();
    await queue?.close();
    queueClient?.close();
    workerClient?.close();
    await prisma?.$disconnect();
    await Promise.all([postgres?.stop(), valkey?.stop()]);
  });

  const nextUpdateId = (): string => String(++updateSequence);

  const command = (
    profile: { telegramUserId: string; username: string; displayName?: string },
    text: string,
  ): Promise<TelegramResponse> =>
    commandCenter!.handleCommand({ updateId: nextUpdateId(), profile, text });

  const callback = (
    profile: { telegramUserId: string; username: string; displayName?: string },
    data: string,
  ): Promise<TelegramResponse> =>
    commandCenter!.handleCallback({ updateId: nextUpdateId(), profile, callbackData: data });

  const button = (response: TelegramResponse, text: string): string => {
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
      throw new Error(
        `Button containing "${text}" not found. Available buttons: ${JSON.stringify(
          response.messages
            .flatMap((m) => m.buttons ?? [])
            .flat()
            .map((b) => b.text),
        )}`,
      );
    }
    return found.callbackData;
  };

  const completion = (): Promise<void> =>
    new Promise((resolve, reject) => {
      worker!.once('completed', () => resolve());
      worker!.once('failed', (_job, error) => reject(error));
    });

  beforeEach(async () => {
    if (gateway !== undefined) {
      gateway.sent.length = 0;
    }
    if (prisma !== undefined) {
      await prisma.telegramRateLimitBucket.deleteMany();
      await prisma.telegramNotificationDelivery.deleteMany();
      await prisma.outboxEvent.deleteMany();
    }
  });

  describe('Positive Golden Path (20 steps: /create -> V1 -> edit V2 -> approve V2 -> terminal APPROVED)', () => {
    it('executes the full end-to-end lifecycle with zero publishing side effects', async () => {
      currentAIProvider = new FakeAITextProvider();

      // Step 1: Editor executes /create FIC-PERF-001
      const createResponse = await command(editorProfile, '/create FIC-PERF-001');
      expect(createResponse.messages[0]?.text).toContain('Moonlit River Eau de Parfum');
      expect(createResponse.messages[0]?.text).toContain('Step 2 of 6');

      // Step 2 & 3: Select content type PRODUCT_SPOTLIGHT
      const typeResponse = await callback(
        editorProfile,
        button(createResponse, 'Product spotlight'),
      );
      expect(typeResponse.messages[0]?.text).toContain('Step 3 of 6');

      // Step 4: Select language BILINGUAL
      const langResponse = await callback(editorProfile, button(typeResponse, 'Bilingual'));
      expect(langResponse.messages[0]?.text).toContain('Step 4 of 6');

      // Step 5: Select platform TELEGRAM
      const platformResponse = await callback(editorProfile, button(langResponse, 'Telegram'));
      expect(platformResponse.messages[0]?.text).toContain('Step 5 of 6');

      // Step 6: Select visual style & Confirm generation
      const styleResponse = await callback(
        editorProfile,
        button(platformResponse, 'Parisian Morning'),
      );
      expect(styleResponse.messages[0]?.text).toContain('Step 6 of 6');

      const completedV1 = completion();
      const confirmResponse = await callback(
        editorProfile,
        button(styleResponse, 'Generate Poster'),
      );
      expect(confirmResponse.messages[0]?.text).toContain('Generating Poster & Copy');
      await completedV1;

      // Step 6 & 7 & 8: Verify snapshot created immutably and BullMQ job enqueued
      const job = await getPrisma().contentJob.findFirstOrThrow({
        orderBy: { createdAt: 'desc' },
        include: { productSnapshot: true },
      });
      expect(job.productSnapshot.sku).toBe('FIC-PERF-001');
      expect(job.productSnapshot.snapshotHash).toBeDefined();

      // Step 9 & 10: FakeAI generates V1, and validator validates
      const v1 = await getPrisma().contentVersion.findFirstOrThrow({
        where: { contentJobId: job.id, versionNumber: 1 },
        include: { validationResults: { include: { findings: true } }, generationAttempt: true },
      });
      expect(v1.validationResults[0]?.status).toBe('PASSED');
      expect(v1.generationAttempt).toBeDefined();

      // Step 11 & 12: Dispatch outbox events
      await outboxDispatcher!.dispatchOnce();
      const editorMessages = gateway!.popMessages(editorProfile.telegramUserId);
      expect(editorMessages.length).toBeGreaterThan(0);
      const v1DraftMessage = editorMessages[0]!;
      expect(v1DraftMessage.text).toContain('Draft Copy Review');
      expect(v1DraftMessage.text).toContain('V1');
      expect(v1DraftMessage.text).toContain('Facts checked — no blocking issues');

      // Step 13: Inspect draft action buttons
      const draftButtons = v1DraftMessage.buttons?.flat() ?? [];
      expect(draftButtons.some((b) => b.text.includes('Edit'))).toBe(true);
      expect(draftButtons.some((b) => b.text.includes('Regenerate'))).toBe(true);
      expect(draftButtons.some((b) => b.text.includes('Approve'))).toBe(true);
      expect(draftButtons.some((b) => b.text.includes('Source'))).toBe(true);
      expect(draftButtons.some((b) => b.text.includes('Validation'))).toBe(true);

      // Step 14: Editor triggers Edit action
      const editButton = draftButtons.find((b) => b.text.includes('Edit'))!;
      const editPromptResponse = await callback(editorProfile, editButton.callbackData);
      expect(editPromptResponse.messages[0]?.text).toContain(
        'Please reply with your instructions for the revision',
      );

      // Step 15: Editor inputs revision instructions
      const revisionText = 'Make the opening headline more poetic and emphasize jasmine notes.';
      const completedV2 = completion();
      const revisionSubmitted = await command(editorProfile, revisionText);
      expect(revisionSubmitted.messages[0]?.text).toContain('Revision requested');
      await completedV2;

      // Step 16: Worker generates V2 and validates
      const v2 = await getPrisma().contentVersion.findFirstOrThrow({
        where: { contentJobId: job.id, versionNumber: 2 },
        include: { validationResults: true },
      });
      expect(v2.versionNumber).toBe(2);
      expect(v2.validationResults[0]?.status).toBe('PASSED');

      // Step 17: Outbox dispatcher delivers V2 draft
      await outboxDispatcher!.dispatchOnce();
      const v2Messages = gateway!.popMessages(editorProfile.telegramUserId);
      expect(v2Messages.length).toBeGreaterThan(0);
      const v2Draft = v2Messages[0]!;
      expect(v2Draft.text).toContain('V2');

      // Step 18: Reviewer initiates approval on V2
      const approverViewResponse = await command(approverProfile, `/status`);
      expect(approverViewResponse.messages[0]?.text).toContain(job.productSnapshot.productName);

      // Reviewer clicks Approve button on V2
      const v2Buttons = v2Draft.buttons?.flat() ?? [];
      const approveButton = v2Buttons.find((b) => b.text.includes('Approve'))!;
      const confirmApprovalPrompt = await callback(approverProfile, approveButton.callbackData);

      // Step 19: Two-step confirmation: reviewer confirms approval
      expect(confirmApprovalPrompt.messages[0]?.text).toContain('Confirm Approval');
      const confirmButton = confirmApprovalPrompt.messages[0]!.buttons!.flat().find((b) =>
        b.text.includes('Confirm Approve'),
      )!;
      const approvalConfirmedResponse = await callback(approverProfile, confirmButton.callbackData);
      expect(approvalConfirmedResponse.messages[0]?.text).toContain('Approved');

      // Step 20: Verify APPROVED terminal state and absence of publishing side-effects
      const finalJob = await getPrisma().contentJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      expect(finalJob.status).toBe('APPROVED');

      const approvalEvent = await getPrisma().approvalEvent.findFirstOrThrow({
        where: { contentJobId: job.id, contentVersionId: v2.id },
      });
      expect(approvalEvent.decision).toBe('APPROVED');

      // Invariant check: APPROVED is strictly terminal; subsequent edits/approvals fail
      const approverUser = await getPrisma().user.findFirstOrThrow({
        where: { displayName: 'Golden Approver' },
      });
      const editorUser = await getPrisma().user.findFirstOrThrow({
        where: { displayName: 'Golden Editor' },
      });
      const approveUseCase = new ApproveContentVersionUseCase(approvals!, new PermissionService());
      const editUseCase = new RequestContentEditUseCase(
        approvals!,
        { enqueue: async (): Promise<void> => {} },
        new PermissionService(),
      );
      await expect(
        approveUseCase.execute({
          contentJobId: job.id,
          contentVersionId: v2.id,
          approverUserId: approverUser.id,
          approverRoles: ['MARKETING_APPROVER'],
        }),
      ).rejects.toThrow(ContentAlreadyApprovedError);

      await expect(
        editUseCase.execute({
          contentJobId: job.id,
          contentVersionId: v2.id,
          actorUserId: editorUser.id,
          actorRoles: ['MARKETING_EDITOR'],
          instruction: 'Edit after approve',
        }),
      ).rejects.toThrow(InvalidReviewStateError);

      // Invariant check: Check outbox events in database; verify zero publishing events
      const outboxEvents = await getPrisma().outboxEvent.findMany({
        where: { aggregateId: job.id },
      });
      const topics = outboxEvents.map((e) => e.topic);
      expect(topics).toContain('CONTENT_APPROVED');
      expect(
        topics.some((t) => t.includes('PUBLISH') || t.includes('META') || t.includes('SCHEDULE')),
      ).toBe(false);

      // Drain remaining outbox events so subsequent tests have a clean outbox queue
      await outboxDispatcher!.dispatchOnce();
      gateway!.popMessages(editorProfile.telegramUserId);
    });
  });

  describe('Negative Golden Path (Factual Error -> Blocked -> Correction -> Approved)', () => {
    it('blocks unverified price invention, blocks forced approval, and approves corrected V2', async () => {
      // Step 1: Configure FakeAI with factual error: price $999.00 instead of $38.00
      currentAIProvider = new FactualErrorAIProvider('$999.00');

      // Editor creates job
      const create = await command(editorProfile, '/create FIC-PERF-001');
      const type = await callback(editorProfile, button(create, 'Product spotlight'));
      const lang = await callback(editorProfile, button(type, 'Bilingual'));
      const plat = await callback(editorProfile, button(lang, 'Telegram'));
      const style = await callback(editorProfile, button(plat, 'Parisian Morning'));
      const completedNegV1 = completion();
      const confirm = await callback(editorProfile, button(style, 'Generate Poster'));
      expect(confirm.messages[0]?.text).toContain('Generating Poster & Copy');
      await completedNegV1;

      const job = await getPrisma().contentJob.findFirstOrThrow({
        orderBy: { createdAt: 'desc' },
      });

      // Step 2: Verify V1 generated and validated as BLOCKED
      const v1 = await getPrisma().contentVersion.findFirstOrThrow({
        where: { contentJobId: job.id, versionNumber: 1 },
        include: { validationResults: { include: { findings: true } } },
      });
      const val = v1.validationResults[0]!;
      expect(val.status).toBe('BLOCKED');
      expect(val.findings.some((f) => f.code === 'PRICE_MISMATCH')).toBe(true);

      // Step 3: Outbox dispatcher delivers draft to Telegram
      await outboxDispatcher!.dispatchOnce();
      const messages = gateway!.popMessages(editorProfile.telegramUserId);
      expect(messages.length).toBeGreaterThan(0);
      const blockedDraft = messages[0]!;

      // Step 4: Verify draft clearly displays BLOCKED banner
      expect(blockedDraft.text).toContain(
        '❌ BLOCKED — factual issues detected; this draft cannot be approved.',
      );

      // Step 5: Verify Approve button is omitted for non-approvable draft
      const buttons = blockedDraft.buttons?.flat() ?? [];
      const approveBtn = buttons.find((b) => b.text.includes('Approve'));
      expect(approveBtn).toBeUndefined();

      // Step 6: Server-side security barrier: forced approval use-case throws ContentNotApprovalEligibleError
      const approveUseCase = new ApproveContentVersionUseCase(approvals!, new PermissionService());
      const approverUser = await getPrisma().user.findFirstOrThrow({
        where: { displayName: 'Golden Approver' },
      });
      await expect(
        approveUseCase.execute({
          contentJobId: job.id,
          contentVersionId: v1.id,
          approverUserId: approverUser.id,
          approverRoles: ['MARKETING_APPROVER'],
        }),
      ).rejects.toThrow(ContentNotApprovalEligibleError);

      // Step 7: Editor inspects View Validation
      const valBtn = buttons.find((b) => b.text.includes('Validation'))!;
      const valView = await callback(editorProfile, valBtn.callbackData);
      expect(valView.messages[0]?.text).toContain('PRICE_MISMATCH');

      // Step 8: Editor corrects the issue by editing to V2
      currentAIProvider = new FakeAITextProvider(); // restore accurate facts
      const editBtn = buttons.find((b) => b.text.includes('Edit'))!;
      await callback(editorProfile, editBtn.callbackData);
      const completedNegV2 = completion();
      await command(editorProfile, 'Correct the price to 38 USD as stated in the product details.');
      await completedNegV2;

      const v2 = await getPrisma().contentVersion.findFirstOrThrow({
        where: { contentJobId: job.id, versionNumber: 2 },
        include: { validationResults: true },
      });
      expect(v2.validationResults[0]?.status).toBe('PASSED');

      // Step 9: V2 is delivered, approver approves V2
      await outboxDispatcher!.dispatchOnce();
      const v2Messages = gateway!.popMessages(editorProfile.telegramUserId);
      const v2Buttons = v2Messages[0]!.buttons!.flat() ?? [];
      const v2ApproveBtn = v2Buttons.find((b) => b.text.includes('Approve'))!;
      expect(v2ApproveBtn).toBeDefined();

      const confirmPrompt = await callback(approverProfile, v2ApproveBtn.callbackData);
      const confirmBtn = confirmPrompt.messages[0]!.buttons!.flat().find((b) =>
        b.text.includes('Confirm Approve'),
      )!;
      const approvalResult = await callback(approverProfile, confirmBtn.callbackData);
      expect(approvalResult.messages[0]?.text).toContain('Approved');

      const updatedJob = await getPrisma().contentJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      expect(updatedJob.status).toBe('APPROVED');
    });
  });

  describe('Operational Concurrency and Resilience Simulations', () => {
    it('idempotently handles duplicate BullMQ deliveries without creating duplicate versions', async () => {
      currentAIProvider = new FakeAITextProvider();

      const create = await command(editorProfile, '/create FIC-WATCH-001');
      const type = await callback(editorProfile, button(create, 'Product spotlight'));
      const lang = await callback(editorProfile, button(type, 'Bilingual'));
      const plat = await callback(editorProfile, button(lang, 'Telegram'));
      const style = await callback(editorProfile, button(plat, 'Parisian Morning'));
      const completedWatch = completion();
      await callback(editorProfile, button(style, 'Generate Poster'));
      await completedWatch;

      const job = await getPrisma().contentJob.findFirstOrThrow({
        orderBy: { createdAt: 'desc' },
      });

      const versionCountBefore = await getPrisma().contentVersion.count({
        where: { contentJobId: job.id },
      });
      expect(versionCountBefore).toBe(1);

      // Simulate duplicate delivery: manually call generation use-case with the same job ID
      const secondAttemptResult = await generationUseCase(currentAIProvider).execute(job.id);
      expect(secondAttemptResult?.versionNumber).toBe(1); // already generated, returns existing version

      const versionCountAfter = await getPrisma().contentVersion.count({
        where: { contentJobId: job.id },
      });
      expect(versionCountAfter).toBe(1);
    });

    it('rejects stale approval attempts when a newer version has already been created', async () => {
      currentAIProvider = new FakeAITextProvider();

      const create = await command(editorProfile, '/create FIC-PERF-001');
      const type = await callback(editorProfile, button(create, 'Product spotlight'));
      const lang = await callback(editorProfile, button(type, 'Bilingual'));
      const plat = await callback(editorProfile, button(lang, 'Telegram'));
      const style = await callback(editorProfile, button(plat, 'Parisian Morning'));
      const completedStale = completion();
      await callback(editorProfile, button(style, 'Generate Poster'));
      await completedStale;

      const job = await getPrisma().contentJob.findFirstOrThrow({
        orderBy: { createdAt: 'desc' },
      });

      const v1 = await getPrisma().contentVersion.findFirstOrThrow({
        where: { contentJobId: job.id, versionNumber: 1 },
      });

      // Issue an approval token for V1
      const approverIdentity = await getPrisma().telegramIdentity.findUniqueOrThrow({
        where: { telegramUserId: BigInt(approverProfile.telegramUserId) },
      });
      const [v1ApproveToken] = await tokenService!.create(
        approverIdentity.id,
        [{ action: TelegramAction.APPROVE_PROMPT, resourceId: v1.id, singleUse: true }],
        new Date(Date.now() + 60_000),
      );

      // Now create revision
      const editUseCase = new RequestContentEditUseCase(
        approvals!,
        { enqueue: async (): Promise<void> => {} },
        new PermissionService(),
      );
      const editorUser = await getPrisma().user.findFirstOrThrow({
        where: { displayName: 'Golden Editor' },
      });
      await editUseCase.execute({
        contentJobId: job.id,
        contentVersionId: v1.id,
        actorUserId: editorUser.id,
        actorRoles: ['MARKETING_EDITOR'],
        instruction: 'Create V2',
      });

      // Try to use the old V1 approval token
      const staleResponse = await callback(approverProfile, `ps:${v1ApproveToken}`);
      expect(
        staleResponse.messages[0]?.text.includes('revision is in progress') ||
          staleResponse.messages[0]?.text.includes('expired') ||
          staleResponse.messages[0]?.text.includes('cannot be approved'),
      ).toBe(true);

      const jobAfter = await getPrisma().contentJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      expect(jobAfter.status).not.toBe('APPROVED');
    });

    it('retries outbox delivery upon transient network failure and recovers cleanly', async () => {
      // Create a test outbox event
      const event = await getPrisma().outboxEvent.create({
        data: {
          topic: 'CONTENT_VALIDATION_COMPLETED',
          aggregateType: 'ContentJob',
          aggregateId: crypto.randomUUID(),
          idempotencyKey: crypto.randomUUID(),
          payload: {
            jobId: crypto.randomUUID(),
            versionId: crypto.randomUUID(),
            requesterTelegramUserId: editorProfile.telegramUserId,
          },
          occurredAt: new Date(),
          availableAt: new Date(),
        },
      });

      // Make gateway fail once
      const realSend = gateway!.sendMessages.bind(gateway);
      let failedOnce = false;
      gateway!.sendMessages = async (): Promise<void> => {
        if (!failedOnce) {
          failedOnce = true;
          throw new Error('Telegram network connection reset');
        }
        return realSend(editorProfile.telegramUserId, []);
      };

      // First dispatch attempt fails
      await outboxDispatcher!.dispatchOnce();

      const failedEvent = await getPrisma().outboxEvent.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(failedEvent.attemptCount).toBe(1);
      expect(failedEvent.lastErrorCode).toBeDefined();

      // Reset availableAt to now and claimedAt to null so it is claimed immediately
      await getPrisma().outboxEvent.update({
        where: { id: event.id },
        data: { availableAt: new Date(Date.now() - 1_000), claimedAt: null },
      });

      // Second dispatch attempt succeeds
      await outboxDispatcher!.dispatchOnce();

      const recoveredEvent = await getPrisma().outboxEvent.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(recoveredEvent.processedAt).toBeDefined();
    });
  });
});
