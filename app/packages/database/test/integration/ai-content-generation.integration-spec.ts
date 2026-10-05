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
  DeterministicFactualValidator,
  FindingCode,
  IsContentVersionApprovalEligibleQuery,
  NoopContentMetrics,
  type NormalizedProduct,
  ValidateContentVersionUseCase,
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
import { PrismaValidationRepository } from '../../src/validation/prisma-validation.repository.js';
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
  let validations: PrismaValidationRepository | undefined;

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
    validations = new PrismaValidationRepository(prisma);
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

  it('persists a successful immutable validation once and reports approval eligibility', async () => {
    const setup = await createJob('validation-pass', 0, {
      size: { value: '100', unit: 'ml', display: '100 ml' },
    });
    const provider = outputProvider(
      'Moonlit River Eau de Parfum is an EDP in 100ml at $38 USD. Top notes: Fictional bergamot, Fictional pear. Heart notes: Fictional jasmine. Base notes: Fictional cedar, Fictional musk.',
    );
    const version = await generationUseCase(provider, 1_000).execute(setup.jobId);
    if (version === null) throw new Error('Version missing');
    const useCase = validationUseCase();
    const first = await useCase.execute(version.id);
    const duplicate = await useCase.execute(version.id);
    expect(duplicate.id).toBe(first.id);
    expect(first.status).toMatch(/PASSED/u);
    expect(
      await new IsContentVersionApprovalEligibleQuery(getValidations()).execute(version.id),
    ).toBe(true);
    expect(
      await getPrisma().outboxEvent.count({
        where: { topic: 'CONTENT_VALIDATION_COMPLETED', aggregateId: version.id },
      }),
    ).toBe(1);
    await expect(
      getPrisma()
        .$executeRaw`UPDATE validation_results SET validator_version = 'changed' WHERE id = ${first.id}::uuid`,
    ).rejects.toThrow('append-only');
    await expect(
      getPrisma()
        .$executeRaw`DELETE FROM validation_findings WHERE validation_result_id = ${first.id}::uuid`,
    ).rejects.toThrow('append-only');
  });

  it('blocks a scent-pyramid note assigned outside the verified snapshot', async () => {
    const setup = await createJob('validation-scent', 0, {
      fragrance_notes: { top: ['Bergamot'], heart: ['Rose'], base: ['Cedar'] },
    });
    const version = await generationUseCase(
      outputProvider('Top notes: Lemon. Heart notes: Rose. Base notes: Cedar.'),
      1_000,
    ).execute(setup.jobId);
    if (version === null) throw new Error('Version missing');
    const result = await validationUseCase().execute(version.id);
    expect(result.status).toBe('BLOCKED');
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: FindingCode.UNSUPPORTED_FRAGRANCE_NOTE,
          actualValue: 'Lemon',
        }),
      ]),
    );
  });

  it('blocks wrong price and invented origin through the persisted end-to-end path', async () => {
    const setup = await createJob('validation-blocked');
    const provider: AITextProvider = {
      providerName: 'deterministic-bad-output',
      model: 'fixture-v1',
      generate: () =>
        Promise.resolve({
          provider: 'deterministic-bad-output',
          model: 'fixture-v1',
          output: {
            headline: 'Fictional offer',
            khmer_caption: 'តម្លៃ $38 USD ផលិតនៅប្រទេសកម្ពុជា',
            english_caption: 'Now $35 USD. Made in Cambodia. Top notes: invented lemon.',
            cta: 'Learn more',
            hashtags: ['#Fictional'],
            creative_brief: 'Static product card',
            facts_used: ['$35 USD', 'Made in Cambodia'],
            warnings: [],
            missing_information: [],
          },
        }),
    };
    const version = await generationUseCase(provider, 1_000).execute(setup.jobId);
    if (version === null) throw new Error('Version missing');
    const result = await validationUseCase().execute(version.id);
    expect(result.status).toBe('BLOCKED');
    expect(result.findings.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        FindingCode.PRICE_MISMATCH,
        FindingCode.ORIGIN_MISMATCH,
        FindingCode.UNSUPPORTED_FRAGRANCE_NOTE,
      ]),
    );
    expect(
      await new IsContentVersionApprovalEligibleQuery(getValidations()).execute(version.id),
    ).toBe(false);
  });

  it('blocks origin and similarity hallucinations when both controlled source fields are absent', async () => {
    const setup = await createJob('validation-hallucination', 7);
    const provider: AITextProvider = {
      providerName: 'deterministic-hallucination-output',
      model: 'fixture-v1',
      generate: () =>
        Promise.resolve({
          provider: 'deterministic-hallucination-output',
          model: 'fixture-v1',
          output: {
            headline: 'Essential Carry Pouch',
            khmer_caption: 'ផលិតផលប្រឌិតសម្រាប់សាកល្បង។',
            english_caption: 'Made in France. Similar to Dior Sauvage.',
            cta: 'Learn more',
            hashtags: ['#Fictional'],
            creative_brief: 'Static product card',
            facts_used: [],
            warnings: [],
            missing_information: [],
          },
        }),
    };
    const version = await generationUseCase(provider, 1_000).execute(setup.jobId);
    if (version === null) throw new Error('Version missing');
    const result = await validationUseCase().execute(version.id);
    expect(result.findings.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        FindingCode.UNSUPPORTED_ORIGIN,
        FindingCode.UNSUPPORTED_SIMILARITY_CLAIM,
      ]),
    );
    expect(result.status).toBe('BLOCKED');
  });

  it('processes validation through BullMQ and remains idempotent on duplicate delivery', async () => {
    const setup = await createJob('validation-queue');
    const version = await generationUseCase(new FakeAITextProvider(), 1_000).execute(setup.jobId);
    if (version === null) throw new Error('Version missing');
    const address = valkeyAddress();
    const queueClient = await GlideClient.createClient({ addresses: [address] });
    const workerClient = await GlideClient.createClient({ addresses: [address] });
    const queueName = `phase-1d-validation-${crypto.randomUUID()}`;
    const queue = new Queue<{ contentVersionId: string }>(queueName, {
      connection: createBullMqConnection(queueClient),
    });
    const worker = new Worker<{ contentVersionId: string }>(
      queueName,
      (job) => validationUseCase().execute(job.data.contentVersionId),
      { connection: createBullMqConnection(workerClient) },
    );
    try {
      await Promise.all([queue.waitUntilReady(), worker.waitUntilReady()]);
      for (const suffix of ['first', 'duplicate']) {
        const completed = new Promise<void>((resolve, reject) => {
          worker.once('completed', () => resolve());
          worker.once('failed', (_job, error) => reject(error));
        });
        await queue.add(
          'VALIDATE_CONTENT_VERSION',
          { contentVersionId: version.id },
          {
            jobId: `${suffix}-${version.id}`,
          },
        );
        await completed;
      }
      expect(
        await getPrisma().validationResult.count({ where: { contentVersionId: version.id } }),
      ).toBe(1);
    } finally {
      await worker.close();
      await queue.close();
      queueClient.close();
      workerClient.close();
    }
  });

  async function createJob(
    suffix: string,
    fixtureIndex = 0,
    overrides: Partial<NormalizedProduct> = {},
  ): Promise<{ jobId: string; snapshotId: string; brandRuleId: string }> {
    const fixture = FICTIONAL_PRODUCTS[fixtureIndex];
    if (fixture === undefined) throw new Error('Fixture missing');
    const product = { ...structuredClone(fixture), product: { ...fixture.product, ...overrides } };
    const snapshot = await new CreateProductSnapshotUseCase(
      getSnapshots(),
      productMetrics,
      logger,
    ).execute(product);
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

  function outputProvider(englishCaption: string): AITextProvider {
    return {
      providerName: 'deterministic-grounded-output',
      model: 'fixture-v1',
      generate: () =>
        Promise.resolve({
          provider: 'deterministic-grounded-output',
          model: 'fixture-v1',
          output: {
            headline: 'Fictional product spotlight',
            khmer_caption: 'ផលិតផលប្រឌិតសម្រាប់ការសាកល្បង។',
            english_caption: englishCaption,
            cta: 'Learn more',
            hashtags: ['#Fictional'],
            creative_brief: 'Static product card',
            facts_used: [],
            warnings: [],
            missing_information: [],
          },
        }),
    };
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

  function validationUseCase(): ValidateContentVersionUseCase {
    return new ValidateContentVersionUseCase(
      getContent(),
      getSnapshots(),
      getValidations(),
      new DeterministicFactualValidator(),
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
  function getValidations(): PrismaValidationRepository {
    if (validations === undefined) throw new Error('Validation repository unavailable');
    return validations;
  }
});
