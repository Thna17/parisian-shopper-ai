// Real endpoints, disposable database, fake provider. Legacy queues never connect.
import '../apps/api/node_modules/reflect-metadata/Reflect.js';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { URL } from 'node:url';
const { structuredClone, fetch } = globalThis;
const mcpMode = process.argv.includes('--mcp');
const captionMode = process.argv.includes('--caption');
let fakeMcp;
let fixtureProductSource;
let productSourceMode = 'current';
const root = process.cwd(),
  env = parseEnv(await readFile('.env', 'utf8'));
const adminUrl = process.env.POST_TEST_ADMIN_DATABASE_URL || env.DATABASE_URL;
if (!adminUrl || !['localhost', '127.0.0.1'].includes(new URL(adminUrl).hostname))
  throw new Error('Local PostgreSQL required');
const name = 'post_browser_' + randomUUID().replaceAll('-', ''),
  storageRoot = resolve('output/playwright', name);
await mkdir(storageRoot, { recursive: true });
for (const m of (await readFile('packages/config/src/environment.schema.ts', 'utf8')).matchAll(
  /^ {4}([A-Z][A-Z0-9_]+):/gm,
)) {
  if (m[1].startsWith('FEATURE_')) process.env[m[1]] = 'false';
  else if (/(?:_TOKEN|_API_KEY|_API_BASE_URL|_PASSWORD)$/.test(m[1])) process.env[m[1]] = '';
}
Object.assign(process.env, {
  NODE_ENV: 'test',
  AI_PROVIDER: 'fake',
  POST_CAPTION_REAL_DISPATCH_ENABLED: 'false',
  CREATIVE_PROVIDER: 'fake',
  POST_IMAGE_PROVIDER: mcpMode ? 'higgsfield_mcp' : 'fake',
  HF_MCP_CLIENT_ID: '',
  HF_MCP_CLIENT_SECRET: '',
  ...(mcpMode
    ? {
        HF_MCP_ENCRYPTION_KEY: '1'.repeat(64),
        HF_MCP_REDIRECT_URI: 'http://127.0.0.1:5184/v1/integrations/higgsfield-mcp/callback',
        HF_MCP_DISPATCH_ENABLED: 'true',
        HF_MCP_SHARED_USE_CONFIRMED: 'true',
        FEATURE_AI_IMAGE_GENERATION: 'true',
        FEATURE_CREATIVE_GENERATION: 'true',
        HF_POSTER_ASSET_HOSTS: 'mcp-fixture.example',
      }
    : {}),
  APP_PORT: '3184',
  APP_HOST: '127.0.0.1',
  APP_CORS_ORIGINS: 'http://post-test.localhost:5184',
  CREATIVE_ASSET_STORAGE_ROOT: storageRoot,
  LOG_LEVEL: 'error',
  VALKEY_PORT: '1',
  VITE_API_BASE_URL: '',
});
const { PrismaService } = await import('../packages/database/dist/prisma.service.js');
const admin = new PrismaService({ datasources: { db: { url: adminUrl } } });
await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
const url = new URL(adminUrl);
url.pathname = '/' + name;
process.env.DATABASE_URL = url.toString();
let application, web, worker, prisma;
let cleanupWork;
function cleanup() {
  return (cleanupWork ??= (async () => {
    worker?.onModuleDestroy();
    const closed = await Promise.allSettled([web?.close(), fakeMcp?.close(), application?.close()]);
    for (const result of closed) {
      if (result.status === 'rejected' && result.reason?.code !== 'ERR_SERVER_NOT_RUNNING')
        console.error('Fixture close failed:', result.reason);
    }
    await prisma?.$disconnect();
    try {
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    } finally {
      await admin.$disconnect();
      await rm(storageRoot, { recursive: true, force: true });
      await rm(resolve(root, 'output/playwright/isolated-environment.json'), { force: true });
    }
  })());
}
for (const sig of ['SIGTERM', 'SIGINT'])
  process.on(sig, () => void cleanup().then(() => process.exit()));
try {
  execFileSync('pnpm', ['--filter', '@parisian-shopper/database', 'prisma:migrate:deploy'], {
    env: process.env,
    stdio: 'ignore',
  });
  const { Test } = await import('@nestjs/testing');
  const { AppModule } = await import('../apps/api/dist/app.module.js');
  const { configureApi } = await import('../apps/api/dist/bootstrap.js');
  const jobs = await import('../packages/jobs/dist/index.js'),
    app = await import('../packages/application/dist/index.js');
  const { AppConfigService } = await import('../packages/config/dist/index.js');
  const { PrismaProductSnapshotRepository } =
    await import('../packages/database/dist/product-snapshot/prisma-product-snapshot.repository.js');
  const { PrismaPostGenerationRepository } =
    await import('../packages/database/dist/posts/prisma-post-generation.repository.js');
  const { FakePostImageProvider } =
    await import('../packages/creative-providers/dist/fake-post-image-provider.js');
  const { PostGenerationWorker } = await import('../apps/worker/dist/post-generation.worker.js');
  const { HF_MCP_FETCH } =
    await import('../packages/creative-providers/dist/mcp/higgsfield-mcp.service.js');
  if (mcpMode) {
    const { fakeHiggsfieldMcpServer } =
      await import('../packages/creative-providers/dist/mcp/testing/fake-higgsfield-mcp-server.js');
    fakeMcp = await fakeHiggsfieldMcpServer();
  }
  const builder = Test.createTestingModule({ imports: [AppModule] });
  builder.overrideProvider(app.PRODUCT_SOURCE).useValue({
    adapterName: 'isolated-fake-product-source',
    getBySku: async (sku) => {
      if (productSourceMode === 'offline') throw new Error('Isolated source outage');
      if (!fixtureProductSource || fixtureProductSource.product.sku !== sku) return null;
      const value = structuredClone(fixtureProductSource);
      value.retrieved_at =
        productSourceMode === 'stale' ? '2020-01-01T00:00:00.000Z' : new Date().toISOString();
      if (productSourceMode === 'price-change')
        value.product.price = String(Number(value.product.price) + 7);
      if (productSourceMode === 'low-stock') value.product.stock_status = 'low_stock';
      if (productSourceMode === 'out-of-stock') value.product.stock_status = 'out_of_stock';
      return value;
    },
    search: async () => ({
      items: fixtureProductSource ? [structuredClone(fixtureProductSource)] : [],
    }),
  });

  if (captionMode)
    builder.overrideProvider(app.POST_CAPTION_PROVIDER).useValue(new app.FakeAITextProvider());
  if (fakeMcp) builder.overrideProvider(HF_MCP_FETCH).useValue(fakeMcp.request);
  for (const token of [
    jobs.ContentGenerationQueue,
    jobs.CreativeGenerationQueue,
    jobs.ProductCatalogSyncQueue,
  ])
    builder.overrideProvider(token).useValue({
      enqueue: async () => {
        throw new Error('Legacy queues disabled');
      },
    });
  builder.overrideProvider(jobs.ValkeyConnectionService).useValue({
    ping: async () => {},
    getClient: () => {
      throw new Error('Redis disabled');
    },
  });
  const module = await builder.compile();
  application = module.createNestApplication();
  let fixtureProductBytes;
  application.use('/assets/products', (_req, res) => {
    if (!fixtureProductBytes) return res.sendStatus(503);
    res.type('png').send(fixtureProductBytes);
  });
  prisma = application.get(PrismaService);
  const hasher = new app.Argon2PasswordHasher({
      memorySize: 1024,
      iterations: 2,
      parallelism: 1,
      hashLength: 32,
    }),
    password = 'Isolated-Post-2026!',
    users = [];
  for (const [displayName, code] of [
    ['Isolated Creator', 'ADMIN'],
    ['Isolated Reviewer', 'MARKETING_APPROVER'],
  ]) {
    const role = await prisma.role.upsert({
      where: { code },
      create: { code, name: code },
      update: {},
    });
    users.push(
      await prisma.user.create({
        data: {
          displayName,
          roles: { create: { roleId: role.id } },
          passwordCredential: { create: { passwordHash: await hasher.hash(password) } },
        },
      }),
    );
  }
  const bytes = app.generateTransparentProductPng_TEST_ONLY({ width: 400, height: 700 }),
    disk = new app.DiskProductAssetStorageAdapter({ storageRoot }),
    stored = await disk.saveAsset(bytes, 'image/png');
  fixtureProductBytes = bytes;
  const product = await new PrismaProductSnapshotRepository(prisma).create({
    product: structuredClone(app.FICTIONAL_PRODUCTS[0]),
    snapshotHash: 'a'.repeat(64),
    normalizerVersion: 'isolated-browser-test',
  });
  fixtureProductSource = structuredClone(product.product);
  const raw = await prisma.productSnapshot.findUniqueOrThrow({ where: { id: product.id } });
  const asset = await prisma.productAsset.create({
    data: {
      sha256: createHash('sha256').update(bytes).digest('hex'),
      storageKey: stored.storageKey,
      mimeType: 'image/png',
      format: 'png',
      byteSize: bytes.length,
      width: 400,
      height: 700,
      pixelCount: 280000,
      channels: 4,
      hasAlpha: true,
      transparencyRatio: 0.5,
    },
  });
  const assessment = await prisma.productAssetValidationAssessment.create({
    data: {
      productAssetId: asset.id,
      validatorVersion: '1.0.0',
      isValid: true,
      format: 'png',
      hasAlpha: true,
      transparencyRatio: 0.5,
      width: 400,
      height: 700,
      byteSize: bytes.length,
      pixelCount: 280000,
      findings: [],
      reasonCodes: [],
    },
  });
  const reg = await prisma.productAssetRegistration.create({
    data: {
      productAssetId: asset.id,
      sku: raw.sku,
      productSnapshotId: raw.id,
      role: 'HERO_CUTOUT',
      sourceSystem: 'ISOLATED_TEST',
      rightsState: 'VERIFIED',
      registeredByUserId: users[0].id,
    },
  });
  await prisma.productAssetApprovalEvent.create({
    data: {
      productAssetRegistrationId: reg.id,
      decision: 'APPROVED',
      decidedByUserId: users[1].id,
      validationAssessmentId: assessment.id,
      reason: 'Synthetic fixture only',
    },
  });
  await prisma.productAssetRightsEvent.create({
    data: {
      productAssetRegistrationId: reg.id,
      rightsState: 'VERIFIED',
      verifiedByUserId: users[1].id,
      reason: 'Synthetic fixture only',
    },
  });
  const campaign = await prisma.campaign.create({
    data: {
      code: 'ISOLATED',
      name: 'Isolated fragrance launch',
      objective: 'No-cost end-to-end verification',
      status: 'ACTIVE',
      createdById: users[0].id,
    },
  });
  await prisma.campaignProduct.create({
    data: { campaignId: campaign.id, productSnapshotId: raw.id },
  });
  if (captionMode) {
    const { PrismaBrandRuleRepository } =
      await import('../packages/database/dist/brand/prisma-brand-rule.repository.js');
    await new PrismaBrandRuleRepository(prisma).create({
      name: 'Isolated caption guidance',
      version: 1,
      status: 'ACTIVE',
      activatedAt: new Date(),
      rules: {
        language: ['Write natural Khmer and English'],
        tone: ['Clear and friendly'],
        cta: ['Contact the store'],
        promotion: ['Only approved promotions'],
        perfumeClaims: ['No invented claims'],
        platforms: { FACEBOOK: ['Concise'], INSTAGRAM: [], TELEGRAM: [], GENERIC: [] },
        visualGuidance: [],
      },
    });
  }
  const ledger = new PrismaPostGenerationRepository(prisma),
    provider = mcpMode ? application.get(app.POST_IMAGE_PROVIDER) : new FakePostImageProvider(),
    submits = [];
  let mode = 'complete';
  const submit = provider.submit.bind(provider),
    status = provider.status.bind(provider);
  if (mcpMode) provider.testOnly = true;
  if (!mcpMode)
    provider.submit = async (prompt, id) => {
      submits.push(id);
      if (mode === 'uncertain-no-id')
        throw new Error('Simulated connection lost after accepting request');
      return submit(prompt, id);
    };
  if (!mcpMode)
    provider.status = async (id) => {
      if (mode === 'failure')
        return {
          state: 'failed',
          reason: 'The test image service could not create this draft. No real charge occurred.',
        };
      if (mode === 'uncertain') throw new Error('Isolated polling timeout');
      return status(id);
    };
  const newWorker = () =>
    new PostGenerationWorker(
      ledger,
      application.get(AppConfigService),
      provider,
      application.get(app.PRODUCT_ASSET_ELIGIBILITY_EVALUATOR),
      application.get(app.ASSET_STORAGE),
      new app.SharpPosterCompositor(),
      application.get(app.BrandGuidanceService),
      application.get(app.ProductMarketingEligibilityService),
    );
  worker = newWorker();
  worker.onModuleInit();
  const express = application.getHttpAdapter().getInstance();
  express.get('/assets/products/:sku.png', (req, res) => {
    if (req.params.sku !== raw.sku) return res.sendStatus(404);
    res.type('png').send(bytes);
  });
  express.get('/__test/state', async (_req, res) =>
    res.json({
      database: name,
      provider: mcpMode ? 'isolated-fake-mcp' : 'fake',
      redisConnected: false,
      mode,
      submits: fakeMcp ? fakeMcp.fixture.submissions : submits,
      posts: await prisma.post.findMany(),
      generations: await prisma.postGeneration.findMany(),
    }),
  );
  express.post('/__test/source/:mode', (req, res) => {
    if (
      !['current', 'offline', 'stale', 'price-change', 'low-stock', 'out-of-stock'].includes(
        req.params.mode,
      )
    )
      return res.sendStatus(400);
    productSourceMode = req.params.mode;
    res.json({ source: 'isolated-fake-product-source', mode: productSourceMode });
  });
  express.post('/__test/mode/:mode', (req, res) => {
    mode = req.params.mode;
    if (fakeMcp)
      fakeMcp.fixture.mode =
        { uncertain: 'poll-timeout', 'uncertain-no-id': 'lost-submit' }[mode] ?? mode;
    res.json({ mode });
  });
  express.post('/__test/restart', async (_req, res) => {
    worker.onModuleDestroy();
    await prisma.postGeneration.updateMany({
      where: {
        status: { in: ['PREPARING', 'SUBMITTING', 'GENERATING', 'UNCERTAIN', 'COMPOSITING'] },
      },
      data: { leaseUntil: new Date(0) },
    });
    worker = newWorker();
    await worker.tick();
    worker.onModuleInit();
    res.json({ submits });
  });
  // Fixture monitoring/control is outside the production API rate limiter; actual application endpoints retain it.
  configureApi(application);
  await application.listen(3184, '127.0.0.1');
  const req = createRequire(resolve('apps/web/package.json')),
    { createServer } = await import(req.resolve('vite'));
  process.chdir(resolve(root, 'apps/web'));
  web = await createServer({
    plugins: mcpMode
      ? [
          {
            name: 'isolated-mcp-banner',
            transformIndexHtml: (html) =>
              html.replace(
                '<body>',
                '<body><div role="status" style="padding:8px;background:#fff3cd;color:#423000">ISOLATED TEST — fake Higgsfield MCP. No real credits spent.</div>',
              ),
          },
        ]
      : [],
    configFile: resolve(root, 'apps/web/vite.config.ts'),
    root: resolve(root, 'apps/web'),
    server: {
      host: '127.0.0.1',
      port: 5184,
      strictPort: true,
      proxy: {
        '/v1': { target: 'http://127.0.0.1:3184' },
        '/assets': { target: 'http://127.0.0.1:3184' },
      },
    },
  });
  await web.listen();
  if (fakeMcp) {
    const signed = await fetch('http://127.0.0.1:3184/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginIdentifier: 'Isolated Creator', password }),
    });
    const cookie = signed.headers.get('set-cookie').split(';')[0];
    const connected = await fetch('http://127.0.0.1:3184/v1/integrations/higgsfield-mcp/connect', {
      method: 'POST',
      headers: { cookie, origin: 'http://post-test.localhost:5184' },
    });
    if (!connected.ok) throw new Error('Fake MCP OAuth connect endpoint failed');
    const details = await connected.json(),
      authorize = await fakeMcp.request(details.authorizationUrl, { redirect: 'manual' });
    const callback = new URL(authorize.headers.get('location'));
    const completed = await fetch('http://127.0.0.1:3184' + callback.pathname + callback.search, {
      redirect: 'manual',
    });
    if (completed.status !== 303)
      throw new Error('Fake MCP OAuth callback without session cookie failed');
    const replay = await fetch('http://127.0.0.1:3184' + callback.pathname + callback.search, {
      redirect: 'manual',
    });
    if (replay.status !== 400) throw new Error('OAuth callback replay was not rejected');
    await writeFile(
      resolve(root, 'output/playwright/server-mcp-oauth-endpoint-proof.json'),
      JSON.stringify(
        {
          provider: 'isolated-fake-mcp',
          initiatedByAdmin: true,
          callbackWithoutCookie: completed.status,
          replayedCallback: replay.status,
          realCredentialsUsed: false,
        },
        null,
        2,
      ),
    );
  }
  await writeFile(
    resolve(root, 'output/playwright/isolated-environment.json'),
    JSON.stringify(
      {
        url: 'http://post-test.localhost:5184',
        api: 'http://127.0.0.1:3184',
        database: name,
        productId: raw.id,
        campaignId: campaign.id,
        creator: 'Isolated Creator',
        reviewer: 'Isolated Reviewer',
        password,
        mcpMode,
        captionMode,
      },
      null,
      2,
    ),
  );
  console.log(
    'ISOLATED READY http://post-test.localhost:5184; isolated fake provider; Redis disabled; ' +
      name,
  );
} catch (error) {
  console.error(error);
  await cleanup();
  process.exit(1);
}
