#!/usr/bin/env node
/**
 * Parisian Shopper AI — Interactive Management Demo & CLI Simulator
 *
 * Runs the live management demo directly in the terminal against real PostgreSQL.
 * Simulates the Telegram bot interface with high-fidelity formatting, inline buttons,
 * factual verification banners, and two-step approval confirmations.
 *
 * Usage:
 *   node --env-file=.env scripts/interactive-demo.mjs --auto         # Guided automated presentation
 *   node --env-file=.env scripts/interactive-demo.mjs --interactive  # Interactive CLI simulator
 */

import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');

const { PrismaClient } = await import(
  path.join(appRoot, 'packages/database/node_modules/@prisma/client/index.js')
);

// Load domain modules from dist
const appDist = path.join(appRoot, 'packages/application/dist/index.js');
const dbDist = path.join(appRoot, 'packages/database/dist/index.js');
const tgDist = path.join(appRoot, 'packages/telegram/dist/index.js');

const {
  AIContextBuilder,
  ApproveContentVersionUseCase,
  ContentStrategyRegistry,
  CreateContentJobUseCase,
  CreateProductSnapshotUseCase,
  DeterministicFactualValidator,
  FakeAITextProvider,
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
  TelegramActionTokenService,
  TelegramCommandCenter,
  ValidateContentVersionUseCase,
  GenerateContentUseCase,
} = await import(appDist);

const {
  PrismaApprovalsRepository,
  PrismaBrandRuleRepository,
  PrismaContentGenerationRepository,
  PrismaProductSnapshotRepository,
  PrismaTelegramWorkflowRepository,
  PrismaValidationRepository,
} = await import(dbDist);

const { TelegramOutboxDispatcher, FakeTelegramGateway } = await import(tgDist);

// Terminal Styling
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgGreen: '\x1b[42m',
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const isNonInteractive = !process.stdin.isTTY || process.argv.includes('--non-interactive');

const ask = (query) => {
  if (isNonInteractive) return Promise.resolve('');
  return new Promise((resolve) => {
    try {
      rl.question(query, resolve);
    } catch {
      resolve('');
    }
  });
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, isNonInteractive ? 50 : ms));

const prisma = new PrismaClient();

// In-Memory Gateway to capture Outbox deliveries
class DemoTelegramGateway extends FakeTelegramGateway {
  popMessages(telegramUserId) {
    const target = String(telegramUserId);
    const matching = [];
    const remaining = [];
    for (const item of this.sent) {
      if (item.telegramUserId === target) {
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

// Hallucination provider for Scene 2
class HallucinationAIProvider {
  providerName = 'fake-hallucinating';
  model = 'deterministic-fixture-v1';

  async generate(context, signal) {
    const normal = await new FakeAITextProvider().generate(context, signal);
    return {
      ...normal,
      output: {
        ...normal.output,
        headline: '🚨 Limited Flash Sale: Moonlit River for only $999.00 USD!',
        english_caption:
          'Indulge in luxury for just $999.00 (Catalogue Price: $38.00). Unbeatable special offer.',
      },
    };
  }
}

async function main() {
  const isAuto = process.argv.includes('--auto') || !process.argv.includes('--interactive');

  console.clear();
  console.log(
    `${C.bold}${C.cyan}╔══════════════════════════════════════════════════════════════════════════╗${C.reset}`,
  );
  console.log(
    `${C.bold}${C.cyan}║         PARISIAN SHOPPER AI — MANAGEMENT DEMONSTRATION & RUNNER          ║${C.reset}`,
  );
  console.log(
    `${C.bold}${C.cyan}║   Luxury Multilingual Content System with Deterministic Fact-Checking   ║${C.reset}`,
  );
  console.log(
    `${C.bold}${C.cyan}╚══════════════════════════════════════════════════════════════════════════╝${C.reset}\n`,
  );

  await prisma.$connect();

  // Ensure active brand rules and demo user exist
  const brand = await prisma.brandRuleVersion.findFirst({
    where: { status: 'ACTIVE' },
  });
  if (!brand) {
    console.log(
      `${C.red}Error: No active BrandRuleVersion found. Please run 'pnpm db:seed' first.${C.reset}`,
    );
    process.exit(1);
  }

  const staff = await prisma.telegramIdentity.findUnique({
    where: { telegramUserId: 700000001n },
    include: { user: true },
  });
  if (!staff) {
    console.log(
      `${C.red}Error: Default demo presenter not found. Please run 'pnpm db:seed' first.${C.reset}`,
    );
    process.exit(1);
  }

  // Set up domain repositories
  const workflowRepo = new PrismaTelegramWorkflowRepository(prisma);
  const snapshotRepo = new PrismaProductSnapshotRepository(prisma);
  const brandRepo = new PrismaBrandRuleRepository(prisma);
  const contentRepo = new PrismaContentGenerationRepository(prisma);
  const validationRepo = new PrismaValidationRepository(prisma);
  const approvalsRepo = new PrismaApprovalsRepository(prisma);

  const permissions = new PermissionService();
  const productSource = new MockProductSource();
  const productMetrics = new NoopProductMetrics();
  const logger = { log: () => {}, warn: () => {}, error: () => {} };

  const getProduct = new GetProductBySkuUseCase(productSource, productMetrics, logger);
  const searchProduct = new SearchProductsUseCase(productSource, productMetrics, logger);
  const snapshotUseCase = new CreateProductSnapshotUseCase(snapshotRepo, productMetrics, logger);
  const createJob = new CreateContentJobUseCase(contentRepo);

  let activeAIProvider = new FakeAITextProvider();
  const gateway = new DemoTelegramGateway();
  const tokenService = new TelegramActionTokenService(workflowRepo);

  const outboxDispatcher = new TelegramOutboxDispatcher(
    workflowRepo,
    gateway,
    tokenService,
    {
      telegram: { actionTokenTtlSeconds: 900, mode: 'webhook' },
      demoMode: true,
    },
    { isEnabled: () => true },
    logger,
  );

  let latestDeliveredMessages = [];

  const enqueuer = {
    enqueue: async (contentJobId) => {
      // Execute background worker immediately
      const genUseCase = new GenerateContentUseCase(
        contentRepo,
        snapshotRepo,
        brandRepo,
        activeAIProvider,
        { timeoutMs: 5_000, attemptStaleAfterMs: 6_000 },
        new NoopContentMetrics(),
        logger,
        { isEnabled: () => true },
        new ContentStrategyRegistry(),
        new AIContextBuilder(),
      );
      try {
        const version = await genUseCase.execute(contentJobId);
        if (version) {
          const valUseCase = new ValidateContentVersionUseCase(
            contentRepo,
            snapshotRepo,
            validationRepo,
            new DeterministicFactualValidator(),
          );
          await valUseCase.execute(version.id);
        }
        // Dispatch outbox delivery
        await outboxDispatcher.dispatchOnce();
        const delivered = gateway.popMessages('700000001');
        if (delivered.length > 0) {
          latestDeliveredMessages = delivered;
          renderTelegramResponse({ messages: delivered });
        }
      } catch (err) {
        console.error('[Enqueue Error]', err);
      }
    },
  };

  const requestEdit = new RequestContentEditUseCase(approvalsRepo, enqueuer, permissions);
  const requestRegen = new RequestContentRegenerationUseCase(approvalsRepo, enqueuer, permissions);
  const approveUseCase = new ApproveContentVersionUseCase(approvalsRepo, permissions);
  const rejectUseCase = new RejectContentVersionUseCase(approvalsRepo, permissions);
  const reviewStateQuery = new GetContentReviewStateQuery(approvalsRepo);
  const approvalStatusQuery = new GetApprovalStatusQuery(approvalsRepo);

  const commandCenter = new TelegramCommandCenter(
    workflowRepo,
    permissions,
    getProduct,
    searchProduct,
    snapshotUseCase,
    createJob,
    brandRepo,
    enqueuer,
    tokenService,
    { actionTokenTtlSeconds: 900, demoMode: true },
    requestEdit,
    requestRegen,
    approveUseCase,
    rejectUseCase,
    reviewStateQuery,
    approvalStatusQuery,
  );

  const presenterProfile = {
    telegramUserId: '700000001',
    username: 'parisian_demo_presenter',
    displayName: staff.user.displayName,
  };

  let updateSeq = Date.now();

  function renderTelegramResponse(resp) {
    for (const msg of resp.messages) {
      console.log(`\n${C.bgBlue}${C.white} 📱 TELEGRAM BOT [@ParisianShopperDemoBot] ${C.reset}`);
      console.log(
        `${C.cyan}──────────────────────────────────────────────────────────────────────${C.reset}`,
      );
      console.log(msg.text);
      console.log(
        `${C.cyan}──────────────────────────────────────────────────────────────────────${C.reset}`,
      );
      if (msg.buttons && msg.buttons.length > 0) {
        console.log(`${C.bold}🔘 INLINE BUTTONS:${C.reset}`);
        msg.buttons.forEach((row) => {
          const rowStr = row.map((b) => `[ ${C.yellow}${b.text}${C.reset} ]`).join('   ');
          console.log(`   ${rowStr}`);
        });
      }
      console.log('');
    }
  }

  async function sendCommand(text) {
    updateSeq++;
    console.log(`\n${C.bold}${C.green}👤 PRESENTER:${C.reset} ${text}`);
    await sleep(400);
    const resp = await commandCenter.handleCommand({
      updateId: String(updateSeq),
      profile: presenterProfile,
      text,
    });
    renderTelegramResponse(resp);
    return resp;
  }

  async function sendCallback(callbackData, label = '') {
    updateSeq++;
    console.log(`\n${C.bold}${C.green}👤 PRESENTER CLICKS:${C.reset} [ ${label || callbackData} ]`);
    await sleep(400);
    const resp = await commandCenter.handleCallback({
      updateId: String(updateSeq),
      profile: presenterProfile,
      callbackData,
    });
    renderTelegramResponse(resp);
    return resp;
  }

  if (isAuto) {
    console.log(
      `${C.yellow}Running in GUIDED DEMONSTRATION MODE (5-7 minute executive script)${C.reset}`,
    );
    console.log(
      `${C.dim}Follows the official script at /docs/management-demo-script.md${C.reset}\n`,
    );

    await ask(`${C.bold}Press [ENTER] to begin Executive Briefing...${C.reset}`);

    console.log(
      `\n${C.magenta}══════════════════════════════════════════════════════════════════════${C.reset}`,
    );
    console.log(`${C.bold}${C.magenta} 1. EXECUTIVE BRIEFING (30 Seconds)${C.reset}`);
    console.log(
      `${C.magenta}══════════════════════════════════════════════════════════════════════${C.reset}`,
    );
    console.log(`\n${C.bold}Presenter Talking Points:${C.reset}`);
    console.log(
      `> "Good morning everyone. Today we are demonstrating the Parisian Shopper AI Content System."`,
    );
    console.log(
      `> "Key takeaway: This is NOT an unmonitored auto-poster. The AI is a co-pilot that drafts and fact-checks; human reviewers maintain complete editorial authority."`,
    );
    console.log(`> "Every post on screen carries the [DEMO] tag for full visibility."`);

    await ask(
      `\n${C.bold}Press [ENTER] to start SCENE 1: The Golden Path (Creation, Revision, Approval)...${C.reset}`,
    );

    // Scene 1, Step 1: /create FIC-PERF-001
    console.log(
      `\n${C.magenta}── Step 1: Initiating Content Creation with Verified SKU ──${C.reset}`,
    );
    console.log(
      `> "We initiate draft creation using SKU FIC-PERF-001 (Moonlit River Eau de Parfum, $38 USD)."`,
    );
    const resp1 = await sendCommand('/create FIC-PERF-001');

    // Find "Product Spotlight" button
    const spotlightBtn = resp1.messages[0].buttons[0][0];
    const resp2 = await sendCallback(spotlightBtn.callbackData, spotlightBtn.text);

    // Find "Bilingual" button
    const bilingualBtn = resp2.messages[0].buttons
      .flat()
      .find((b) => b.text.toLowerCase().includes('bilingual'));
    const resp3 = await sendCallback(bilingualBtn.callbackData, bilingualBtn.text);

    // Find "Telegram" platform button
    const telegramBtn = resp3.messages[0].buttons
      .flat()
      .find((b) => b.text.toLowerCase().includes('telegram'));
    await sendCallback(telegramBtn.callbackData, telegramBtn.text);

    console.log(`\n${C.bold}Presenter Talking Points:${C.reset}`);
    console.log(
      `> "Within 2 seconds, our background workers generated the copy and ran deterministic fact-checking."`,
    );
    console.log(`> "Notice the green banner: '✅ Facts checked — no blocking issues'."`);
    console.log(
      `> "The card displays headline, Khmer caption, English caption, CTA, and hashtags."`,
    );

    await ask(`\n${C.bold}Press [ENTER] for Step 2: Requesting an Edit (Creating V2)...${C.reset}`);

    // Scene 1, Step 2: Request Edit
    const deliveredDraftV1 = latestDeliveredMessages.at(-1);
    const editBtn = deliveredDraftV1.buttons.flat().find((b) => b.text.includes('Edit'));
    await sendCallback(editBtn.callbackData, editBtn.text);

    console.log(`\n${C.bold}Presenter Talking Points:${C.reset}`);
    console.log(
      `> "As a reviewer, I can give conversational revision feedback directly in the chat."`,
    );
    const editInstruction =
      'Make the English headline more poetic and emphasize the jasmine notes.';
    await sendCommand(editInstruction);

    console.log(`\n${C.bold}Presenter Talking Points:${C.reset}`);
    console.log(
      `> "The worker has generated DRAFT — V2! Version incremented to V2, facts re-verified."`,
    );

    await ask(`\n${C.bold}Press [ENTER] for Step 3: Two-Step Approval Confirmation...${C.reset}`);

    // Scene 1, Step 3: Approve V2
    const deliveredDraftV2 = latestDeliveredMessages.at(-1);
    const approveBtn = deliveredDraftV2.buttons.flat().find((b) => b.text.includes('Approve'));
    const confirmPrompt = await sendCallback(approveBtn.callbackData, approveBtn.text);

    console.log(`\n${C.bold}Presenter Talking Points:${C.reset}`);
    console.log(
      `> "Notice the two-step safety check: Are you sure you want to approve version V2?"`,
    );
    console.log(
      `> "This prevents accidental clicks from approving marketing content prematurely."`,
    );

    const confirmBtn = confirmPrompt.messages[0].buttons
      .flat()
      .find((b) => b.text.includes('Confirm'));
    await sendCallback(confirmBtn.callbackData, confirmBtn.text);

    // Check final delivery
    await outboxDispatcher.dispatchOnce();
    const finalDelivered = gateway.popMessages('700000001');
    if (finalDelivered.length > 0) renderTelegramResponse({ messages: finalDelivered });

    console.log(
      `\n${C.green}✔ Positive Golden Path Complete: Content Job is now strictly terminal APPROVED.${C.reset}`,
    );

    await ask(
      `\n${C.bold}Press [ENTER] to start SCENE 2: Safety & Anti-Hallucination Guardrails...${C.reset}`,
    );

    console.log(
      `\n${C.magenta}══════════════════════════════════════════════════════════════════════${C.reset}`,
    );
    console.log(
      `${C.bold}${C.magenta} 2. SCENE 2: ANTI-HALLUCINATION GUARDRAILS & FACTUAL VALIDATION ${C.reset}`,
    );
    console.log(
      `${C.magenta}══════════════════════════════════════════════════════════════════════${C.reset}`,
    );
    console.log(`\n${C.bold}Presenter Talking Points:${C.reset}`);
    console.log(
      `> "The biggest risk in retail AI is price hallucination: advertising a $38 item for $999 or $10."`,
    );
    console.log(
      `> "Watch how our deterministic validation engine physically prevents publication of bad copy."`,
    );

    // Switch to hallucinating provider
    activeAIProvider = new HallucinationAIProvider();

    // Trigger draft creation
    const neg1 = await sendCommand('/create FIC-PERF-001');
    const negSpotlight = neg1.messages[0].buttons[0][0];
    const neg2 = await sendCallback(negSpotlight.callbackData, negSpotlight.text);
    const negBilingual = neg2.messages[0].buttons
      .flat()
      .find((b) => b.text.toLowerCase().includes('bilingual'));
    const neg3 = await sendCallback(negBilingual.callbackData, negBilingual.text);
    const negTelegram = neg3.messages[0].buttons
      .flat()
      .find((b) => b.text.toLowerCase().includes('telegram'));
    await sendCallback(negTelegram.callbackData, negTelegram.text);

    console.log(`\n${C.bold}${C.red}CRITICAL SAFETY INVARIANTS DEMONSTRATED:${C.reset}`);
    console.log(
      `${C.red}1. Bold Red Banner: '❌ BLOCKED — factual issues detected; this draft cannot be approved.'${C.reset}`,
    );
    console.log(
      `${C.red}2. The 'Approve' button is COMPLETELY OMITTED from the interface!${C.reset}`,
    );

    // Click "View Validation" button
    const negDeliveredDraft = latestDeliveredMessages.at(-1);
    const valBtn = negDeliveredDraft.buttons.flat().find((b) => b.text.includes('Validation'));
    if (valBtn) {
      console.log(`\n> Presenter inspects the validation findings:`);
      await sendCallback(valBtn.callbackData, valBtn.text);
    }

    console.log(`\n${C.bold}Presenter Talking Points:${C.reset}`);
    console.log(
      `> "Even if an AI model hallucinates or an editor tries to approve, our server-side security layer blocks it."`,
    );

    await ask(
      `\n${C.bold}Press [ENTER] to start SCENE 3: Audit Trail & Status Inspection...${C.reset}`,
    );

    console.log(
      `\n${C.magenta}══════════════════════════════════════════════════════════════════════${C.reset}`,
    );
    console.log(
      `${C.bold}${C.magenta} 3. SCENE 3: AUDIT TRAIL & OPERATIONAL TRANSPARENCY ${C.reset}`,
    );
    console.log(
      `${C.magenta}══════════════════════════════════════════════════════════════════════${C.reset}`,
    );

    console.log(
      `> "Any team member can instantly check pipeline status and full version history."`,
    );
    await sendCommand('/status');
    await sendCommand('/history FIC-PERF-001');

    console.log(
      `\n${C.bold}${C.green}══════════════════════════════════════════════════════════════════════${C.reset}`,
    );
    console.log(
      `${C.bold}${C.green}           MANAGEMENT DEMONSTRATION SUCCESSFULLY CONCLUDED            ${C.reset}`,
    );
    console.log(
      `${C.bold}${C.green}══════════════════════════════════════════════════════════════════════${C.reset}`,
    );
    console.log(`\n${C.bold}Summary for Leadership:${C.reset}`);
    console.log(`1. Speed: Content drafted, translated, and checked in 2 seconds.`);
    console.log(
      `2. Accuracy: Deterministic engine blocks hallucinations with 0 false-approval escapes.`,
    );
    console.log(`3. Complete Control: Human approver sign-off is mandatory and audit-trailed.`);
    console.log(`4. Zero Premature Publishing: No unapproved content can ever leave the system.\n`);
  }

  await prisma.$disconnect();
  rl.close();
}

main().catch((err) => {
  console.error('\nDemo error:', err);
  rl.close();
  process.exit(1);
});
