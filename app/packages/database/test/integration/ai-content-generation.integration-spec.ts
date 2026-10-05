import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
  AIContextBuilder,
  type AITextGenerationResult,
  type AITextProvider,
  ContentGenerationError,
  ContentStrategyRegistry,
  CreateProductSnapshotUseCase,
  DEVELOPMENT_BRAND_RULES,
  FakeAITextProvider,
  FICTIONAL_PRODUCTS,
  GenerateContentUseCase,
  NoopContentMetrics,
  type ProductMetrics,
} from '@parisian-shopper/application';
import { type ApplicationLogger } from '@parisian-shopper/common';
import { type FeatureFlag, type FeatureFlagService } from '@parisian-shopper/config';
import { GlideClient } from '@valkey/valkey-glide';
import { jest } from '@jest/globals';
import { Queue, Worker } from 'bullmq';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';

import { PrismaBrandRuleRepository } from '../../src/brand/prisma-brand-rule.repository.js';
import { PrismaContentGenerationRepository } from '../../src/content/prisma-content-generation.repository.js';
import { PrismaProductSnapshotRepository } from '../../src/product-snapshot/prisma-product-snapshot.repository.js';
import { PrismaService } from '../../src/prisma.service.js';
import { createBullMqConnection } from '../../../jobs/src/bullmq-connection.js';

const execFileAsync = promisify(execFile);
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const logger: ApplicationLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
const productMetrics: ProductMetrics = { record: jest.fn() };
const enabledFlags: Pick<FeatureFlagService, 'isEnabled'> = {
  isEnabled: (_flag: FeatureFlag): boolean => true,
};

describe('Phase 1C content generation persistence and queue', () => {
  let postgres: StartedPostgreSqlContainer | undefined;
  let valkey: StartedTestContainer | undefined;
  let prisma: PrismaService | undefined;
  let snapshots: PrismaProductSnapshotRepository | undefined;
  let brands: PrismaBrandRuleRepository | undefined;
  let content: PrismaContentGenerationRepository | undefined;

  beforeAll(async () => {
    [postgres, valkey] = await Promise.all([
      new PostgreSqlContainer('postgres:17.6-alpine')
        .withDatabase('parisian_ai_test')
        .withUsername('parisian_test')
        .withPassword('fictional_test_password')
        .start(),
      new GenericContainer('valkey/valkey:8.1.3-alpine')
        .withExposedPorts(6379)
        .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
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
    snapshots = new PrismaProductSnapshotRepository(prisma);
    brands = new PrismaBrandRuleRepository(prisma);
    content = new PrismaContentGenerationRepository(prisma);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await Promise.all([postgres?.stop(), valkey?.stop()]);
  });

  it('processes the mandatory fictional snapshot-to-V1 flow through BullMQ idempotently', async () => {
    const setup = await createJob('queue-success');
    const useCase = generationUseCase(new FakeAITextProvider(), 2_000);
    const address = valkeyAddress();
    const queueClient = await GlideClient.createClient({ addresses: [address] });
    const workerClient = await GlideClient.createClient({ addresses: [address] });
    const queueName = `phase-1c-generation-${crypto.randomUUID()}`;
    const queue = new Queue<{ contentJobId: string }>(queueName, {
      connection: createBullMqConnection(queueClient),
    });
    const worker = new Worker<{ contentJobId: string }>(
      queueName,
      (job) => useCase.execute(job.data.contentJobId),
      {
        connection: createBullMqConnection(workerClient),
      },
    );
    try {
      await Promise.all([queue.waitUntilReady(), worker.waitUntilReady()]);
      const completed = new Promise<void>((resolve, reject) => {
        worker.once('completed', () => resolve());
        worker.once('failed', (_job, error) => reject(error));
      });
      await queue.add(
        'GENERATE_CONTENT',
        { contentJobId: setup.jobId },
        { jobId: `generate-${setup.jobId}` },
      );
      await completed;

      expect((await getContent().findJobById(setup.jobId))?.status).toBe('DRAFT');
      expect(await getContent().findVersionsByJobId(setup.jobId)).toHaveLength(1);
      expect((await getContent().findVersionsByJobId(setup.jobId))[0]?.versionNumber).toBe(1);
      expect((await getContent().findAttemptsByJobId(setup.jobId))[0]?.status).toBe('SUCCEEDED');
      expect((await getSnapshots().findById(setup.snapshotId))?.product.product.price).toBe('38');
      expect(await getPrisma().outboxEvent.count({ where: { aggregateId: setup.jobId } })).toBe(2);

      const duplicateCompleted = new Promise<void>((resolve, reject) => {
        worker.once('completed', () => resolve());
        worker.once('failed', (_job, error) => reject(error));
      });
      await queue.add(
        'GENERATE_CONTENT',
        { contentJobId: setup.jobId },
        { jobId: `redelivery-${setup.jobId}` },
      );
      await duplicateCompleted;
      expect(await getContent().findVersionsByJobId(setup.jobId)).toHaveLength(1);
      expect(await getContent().findAttemptsByJobId(setup.jobId)).toHaveLength(1);
    } finally {
      await worker.close();
      await queue.close();
      queueClient.close();
      workerClient.close();
    }
  });

  it('records malformed output failure without a version or completion outbox event', async () => {
    const setup = await createJob('malformed');
    const malformed: AITextProvider = {
      providerName: 'malformed-test',
      model: 'invalid-v1',
      generate: () =>
        Promise.resolve({
          output: { headline: 'only one field' },
          provider: 'malformed-test',
          model: 'invalid-v1',
        } as unknown as AITextGenerationResult),
    };
    await expect(generationUseCase(malformed, 1_000).execute(setup.jobId)).rejects.toMatchObject({
      code: 'AI_OUTPUT_INVALID',
    });
    expect((await getContent().findJobById(setup.jobId))?.status).toBe('FAILED');
    expect((await getContent().findAttemptsByJobId(setup.jobId))[0]).toMatchObject({
      status: 'FAILED',
      errorCode: 'AI_OUTPUT_INVALID',
    });
    expect(await getContent().findVersionsByJobId(setup.jobId)).toHaveLength(0);
    expect(await getPrisma().outboxEvent.count({ where: { aggregateId: setup.jobId } })).toBe(1);
  });

  it('bounds provider timeout and never leaves the job generating', async () => {
    const setup = await createJob('timeout');
    const timeoutProvider: AITextProvider = {
      providerName: 'timeout-test',
      model: 'timeout-v1',
      generate: (_context, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(signal.reason instanceof Error ? signal.reason : new Error('Timed out')),
            { once: true },
          );
        }),
    };
    await expect(generationUseCase(timeoutProvider, 25).execute(setup.jobId)).rejects.toMatchObject(
      { code: 'AI_PROVIDER_TIMEOUT', retryable: true },
    );
    expect((await getContent().findJobById(setup.jobId))?.status).toBe('FAILED');
    expect((await getContent().findAttemptsByJobId(setup.jobId))[0]?.status).toBe('TIMED_OUT');
    expect(await getContent().findVersionsByJobId(setup.jobId)).toHaveLength(0);
  });

  it('retries a transient provider error only to the configured BullMQ bound', async () => {
    const setup = await createJob('retry-bound');
    const transient: AITextProvider = {
      providerName: 'transient-test',
      model: 'transient-v1',
      generate: () =>
        Promise.reject(
          new ContentGenerationError({
            code: 'AI_PROVIDER_RATE_LIMITED',
            publicMessage: 'Rate limited.',
            retryable: true,
          }),
        ),
    };
    const useCase = generationUseCase(transient, 1_000);
    const address = valkeyAddress();
    const queueClient = await GlideClient.createClient({ addresses: [address] });
    const workerClient = await GlideClient.createClient({ addresses: [address] });
    const queueName = `phase-1c-retry-${crypto.randomUUID()}`;
    const queue = new Queue<{ contentJobId: string }>(queueName, {
      connection: createBullMqConnection(queueClient),
    });
    const worker = new Worker<{ contentJobId: string }>(
      queueName,
      (job) => useCase.execute(job.data.contentJobId),
      { connection: createBullMqConnection(workerClient) },
    );
    try {
      await Promise.all([queue.waitUntilReady(), worker.waitUntilReady()]);
      const exhausted = new Promise<void>((resolve) => {
        let failureCount = 0;
        worker.on('failed', () => {
          failureCount += 1;
          if (failureCount === 2) resolve();
        });
      });
      await queue.add(
        'GENERATE_CONTENT',
        { contentJobId: setup.jobId },
        {
          jobId: `retry-${setup.jobId}`,
          attempts: 2,
          backoff: { type: 'exponential', delay: 10 },
        },
      );
      await exhausted;
      expect(await getContent().findAttemptsByJobId(setup.jobId)).toHaveLength(2);
      expect((await getContent().findJobById(setup.jobId))?.status).toBe('FAILED');
      expect(await getContent().findVersionsByJobId(setup.jobId)).toHaveLength(0);
    } finally {
      await worker.close();
      await queue.close();
      queueClient.close();
      workerClient.close();
    }
  });

  it('reclaims an expired worker attempt without running two active attempts', async () => {
    const setup = await createJob('stale-lease');
    const first = await getContent().beginGeneration({
      contentJobId: setup.jobId,
      provider: 'fake',
      model: 'lease-test',
      promptVersion: 'test',
      staleAfterMs: 1_000,
    });
    expect(first.disposition).toBe('STARTED');
    const second = await getContent().beginGeneration({
      contentJobId: setup.jobId,
      provider: 'fake',
      model: 'lease-test',
      promptVersion: 'test',
      staleAfterMs: 0,
    });
    expect(second.disposition).toBe('STARTED');
    expect(await getContent().findAttemptsByJobId(setup.jobId)).toMatchObject([
      { status: 'FAILED', errorCode: 'AI_ATTEMPT_ABANDONED' },
      { status: 'RUNNING' },
    ]);
  });

  it('enforces append-only brand/content rows, foreign keys, and per-job version uniqueness', async () => {
    const setup = await createJob('immutability');
    await generationUseCase(new FakeAITextProvider(), 1_000).execute(setup.jobId);
    const version = (await getContent().findVersionsByJobId(setup.jobId))[0];
    expect(version).toBeDefined();
    await expect(
      getPrisma()
        .$executeRaw`UPDATE content_versions SET model = 'changed' WHERE id = ${version?.id}::uuid`,
    ).rejects.toThrow('append-only');
    await expect(
      getPrisma()
        .$executeRaw`UPDATE brand_rule_versions SET name = 'changed' WHERE id = ${setup.brandRuleId}::uuid`,
    ).rejects.toThrow('append-only');
    const duplicateAttempt = await getPrisma().generationAttempt.create({
      data: {
        contentJobId: setup.jobId,
        attemptNumber: 99,
        provider: 'fake',
        model: 'duplicate-test',
        promptVersion: 'test',
        status: 'SUCCEEDED',
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });
    await expect(
      getPrisma().contentVersion.create({
        data: {
          contentJobId: setup.jobId,
          versionNumber: 1,
          brandRuleVersionId: setup.brandRuleId,
          productSnapshotId: setup.snapshotId,
          generationAttemptId: duplicateAttempt.id,
          provider: 'fake',
          model: 'fake',
          promptVersion: 'test',
          structuredOutput: {},
        },
      }),
    ).rejects.toThrow();
  });

  async function createJob(
    suffix: string,
  ): Promise<{ jobId: string; snapshotId: string; brandRuleId: string }> {
    const fixture = FICTIONAL_PRODUCTS[0];
    if (fixture === undefined) throw new Error('Fixture missing');
    const snapshot = await new CreateProductSnapshotUseCase(
      getSnapshots(),
      productMetrics,
      logger,
    ).execute(structuredClone(fixture));
    const brand = await getBrands().create({
      name: `Development placeholder ${suffix}`,
      version: 1,
      status: 'ACTIVE',
      rules: DEVELOPMENT_BRAND_RULES,
      activatedAt: new Date(),
    });
    const job = await getContent().createJob({
      productSnapshotId: snapshot.id,
      brandRuleVersionId: brand.id,
      contentType: 'PRODUCT_SPOTLIGHT',
      language: 'BILINGUAL',
      platform: 'FACEBOOK',
    });
    return { jobId: job.id, snapshotId: snapshot.id, brandRuleId: brand.id };
  }

  function generationUseCase(provider: AITextProvider, timeoutMs: number): GenerateContentUseCase {
    return new GenerateContentUseCase(
      getContent(),
      getSnapshots(),
      getBrands(),
      provider,
      { timeoutMs, attemptStaleAfterMs: timeoutMs + 1_000 },
      new NoopContentMetrics(),
      logger,
      enabledFlags,
      new ContentStrategyRegistry(),
      new AIContextBuilder(),
    );
  }

  function valkeyAddress(): { host: string; port: number } {
    if (valkey === undefined) throw new Error('Valkey container unavailable');
    return { host: valkey.getHost(), port: valkey.getMappedPort(6379) };
  }
  function getPrisma(): PrismaService {
    if (prisma === undefined) throw new Error('Prisma unavailable');
    return prisma;
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
});
