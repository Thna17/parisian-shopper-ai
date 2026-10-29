/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-member-access */
import { createHash } from 'node:crypto';
import { type Server } from 'node:http';
import { jest } from '@jest/globals';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  Argon2PasswordHasher,
  type AuthenticatedUserAccount,
  BRAND_RULE_REPOSITORY,
  type BrandRuleRepository,
  type BrandRuleVersion,
  CAMPAIGN_REPOSITORY,
  CONTENT_GENERATION_ENQUEUER,
  CONTENT_GENERATION_REPOSITORY,
  type ContentGenerationRepository,
  type ContentJob,
  type ContentVersion,
  type CreateContentJobInput,
  type CreateDirectVersionInput,
  DEVELOPMENT_BRAND_RULES,
  FICTIONAL_PRODUCTS,
  type GenerationAttempt,
  type ListContentJobsQuery,
  type PaginatedContentJobs,
  PASSWORD_CREDENTIAL_REPOSITORY,
  PASSWORD_HASHER,
  PRODUCT_SNAPSHOT_REPOSITORY,
  type ProductSnapshot,
  type ProductSnapshotRepository,
  resolvePermissionsForRoles,
  USER_ACCOUNT_REPOSITORY,
  type UserAccountRepository,
  USER_SESSION_REPOSITORY,
  type UserSessionRecord,
  type UserSessionRepository,
  VALIDATION_REPOSITORY,
  type ValidationRepository,
  type PersistedValidationResult,
} from '@parisian-shopper/application';
import { FindingCode, FindingSeverity } from '@parisian-shopper/application';
import { DatabaseHealthIndicator, PrismaService } from '@parisian-shopper/database';
import {
  ContentGenerationQueue,
  CreativeGenerationQueue,
  ValkeyConnectionService,
} from '@parisian-shopper/jobs';
import request from 'supertest';

import { AppModule } from '../../src/app.module.js';
import { configureApi } from '../../src/bootstrap.js';

describe('Content Studio API Integration (e2e)', () => {
  let application: INestApplication;
  let server: Server;

  const adminUserId = '00000000-0000-4000-8000-000000000001';
  const unauthorizedUserId = '00000000-0000-4000-8000-000000000002';

  const validSessionToken = 'test-ps-session-token-admin-content';
  const validTokenHash = createHash('sha256').update(validSessionToken).digest('hex');

  const unpermittedSessionToken = 'test-ps-session-token-unpermitted-content';
  const unpermittedTokenHash = createHash('sha256').update(unpermittedSessionToken).digest('hex');

  const sampleSnapshot: ProductSnapshot = {
    id: '4b68e914-7e04-4ec5-b6d8-f860189d2d01',
    product: {
      ...FICTIONAL_PRODUCTS[0]!,
      product: {
        ...FICTIONAL_PRODUCTS[0]!.product,
        price: '230.00',
        priceUsd: 230.0,
      },
    },
    snapshotHash: 'hash-abc-001',
    normalizerVersion: 'phase-1b-v1',
    createdAt: new Date('2026-10-24T12:00:00.000Z'),
  };

  const sampleBrandRule: BrandRuleVersion = {
    id: 'brand-rule-active-001',
    name: 'Luxury Standard 2026',
    version: 1,
    status: 'ACTIVE',
    rules: DEVELOPMENT_BRAND_RULES,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    activatedAt: new Date('2026-10-01T00:00:00.000Z'),
  };

  // In-memory content job & version store
  const jobs = new Map<string, ContentJob>();
  const versions = new Map<string, ContentVersion[]>();
  const attempts = new Map<string, GenerationAttempt[]>();
  const validationResults = new Map<string, PersistedValidationResult>();

  const initialJob: ContentJob = {
    id: '00000000-0000-4000-8000-000000000010',
    productSnapshotId: sampleSnapshot.id,
    brandRuleVersionId: sampleBrandRule.id,
    requesterUserId: adminUserId,
    campaignId: 'camp-seed-001',
    contentType: 'PRODUCT_SPOTLIGHT',
    language: 'EN',
    platform: 'INSTAGRAM',
    campaignContext: 'Mother’s Day Spotlight',
    status: 'DRAFT',
    createdAt: new Date('2026-10-29T10:00:00.000Z'),
    updatedAt: new Date('2026-10-29T10:00:00.000Z'),
  };

  const initialAttempt: GenerationAttempt = {
    id: '00000000-0000-4000-8000-000000000012',
    contentJobId: initialJob.id,
    attemptNumber: 1,
    provider: 'fake',
    model: 'deterministic-test',
    promptVersion: '1.0',
    status: 'SUCCEEDED',
    startedAt: new Date('2026-10-29T10:00:01.000Z'),
    completedAt: new Date('2026-10-29T10:00:03.000Z'),
  };

  const initialVersion: ContentVersion = {
    id: '00000000-0000-4000-8000-000000000011',
    contentJobId: initialJob.id,
    versionNumber: 1,
    brandRuleVersionId: sampleBrandRule.id,
    productSnapshotId: sampleSnapshot.id,
    generationAttemptId: initialAttempt.id,
    provider: 'fake',
    model: 'deterministic-test',
    promptVersion: '1.0',
    structuredOutput: {
      headline: 'Rose Impériale EDP',
      english_caption: 'A sensory voyage to Grasse with notes of Damask rose.',
      khmer_caption: null,
      cta: 'Discover the Essence',
      hashtags: ['#RoseImperiale', '#ParisianShopper'],
      creative_brief: 'Luxury fragrance spotlight',
      facts_used: ['Rose Impériale', '230.00'],
      warnings: [],
      missing_information: [],
    },
    createdAt: new Date('2026-10-29T10:00:03.000Z'),
  };

  const initialValidation: PersistedValidationResult = {
    id: '00000000-0000-4000-8000-000000000013',
    contentVersionId: initialVersion.id,
    validatorVersion: '1.0',
    status: 'PASSED',
    findingCount: 0,
    blockingCount: 0,
    warningCount: 0,
    infoCount: 0,
    createdAt: new Date('2026-10-29T10:00:04.000Z'),
    findings: [],
  };

  const mockEnqueuedJobs: string[] = [];

  const mockContentGenerationRepo: ContentGenerationRepository = {
    async createJob(input: CreateContentJobInput): Promise<ContentJob> {
      const newJob: ContentJob = {
        id: `job-${Date.now()}`,
        productSnapshotId: input.productSnapshotId,
        brandRuleVersionId: input.brandRuleVersionId,
        requesterUserId: input.requesterUserId,
        campaignId: input.campaignId,
        telegramCreateFlowId: input.telegramCreateFlowId,
        contentType: input.contentType,
        language: input.language,
        platform: input.platform,
        campaignContext: input.campaignContext,
        status: 'REQUESTED',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      jobs.set(newJob.id, newJob);
      versions.set(newJob.id, []);
      attempts.set(newJob.id, []);
      return newJob;
    },
    async findJobById(id: string): Promise<ContentJob | null> {
      return jobs.get(id) ?? null;
    },
    async findPaginatedJobs(query: ListContentJobsQuery): Promise<PaginatedContentJobs> {
      let list = Array.from(jobs.values());
      if (query.status) {
        list = list.filter((j) => j.status === query.status);
      }
      if (query.productSnapshotId) {
        list = list.filter((j) => j.productSnapshotId === query.productSnapshotId);
      }
      if (query.campaignId) {
        list = list.filter((j) => j.campaignId === query.campaignId);
      }
      if (query.requesterUserId) {
        list = list.filter((j) => j.requesterUserId === query.requesterUserId);
      }
      return {
        items: list,
        total: list.length,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        totalPages: 1,
      };
    },
    async updateJobStatus(id: string, status): Promise<ContentJob> {
      const job = jobs.get(id);
      if (!job) throw new Error('Not found');
      const updated = { ...job, status, updatedAt: new Date() };
      jobs.set(id, updated);
      return updated;
    },
    async findVersionById(id: string): Promise<ContentVersion | null> {
      for (const vList of versions.values()) {
        const found = vList.find((v) => v.id === id);
        if (found) return found;
      }
      return null;
    },
    async findVersionsByJobId(contentJobId: string): Promise<readonly ContentVersion[]> {
      return versions.get(contentJobId) ?? [];
    },
    async findAttemptsByJobId(contentJobId: string): Promise<readonly GenerationAttempt[]> {
      return attempts.get(contentJobId) ?? [];
    },
    async createDirectVersion(input: CreateDirectVersionInput): Promise<ContentVersion> {
      const job = jobs.get(input.contentJobId);
      if (!job) throw new Error('Job not found');
      const currentList = versions.get(input.contentJobId) ?? [];
      const newVersion: ContentVersion = {
        id: '00000000-0000-4000-8000-000000000099',
        contentJobId: input.contentJobId,
        versionNumber: currentList.length + 1,
        brandRuleVersionId: job.brandRuleVersionId,
        productSnapshotId: job.productSnapshotId,
        generationAttemptId: 'att-manual-revision',
        provider: input.provider,
        model: input.model,
        promptVersion: input.promptVersion,
        structuredOutput: input.output,
        revisionRequestId: input.revisionRequestId,
        createdAt: new Date(),
      };
      currentList.push(newVersion);
      versions.set(input.contentJobId, currentList);
      jobs.set(job.id, { ...job, status: 'DRAFT', updatedAt: new Date() });
      return newVersion;
    },
    async beginGeneration(): Promise<never> {
      throw new Error('Not used in test direct call');
    },
    async completeGeneration(): Promise<never> {
      throw new Error('Not used in test direct call');
    },
    async failGeneration(): Promise<void> {},
  };

  const mockValidationRepo: ValidationRepository = {
    async create(input): Promise<PersistedValidationResult> {
      const res: PersistedValidationResult = {
        id: `val-${Date.now()}`,
        contentVersionId: input.contentVersionId,
        validatorVersion: '1.0',
        status: input.outcome.status,
        findingCount: input.outcome.findings.length,
        blockingCount: input.outcome.findings.filter((f) => f.severity === FindingSeverity.BLOCKING)
          .length,
        warningCount: input.outcome.findings.filter((f) => f.severity === FindingSeverity.WARNING)
          .length,
        infoCount: input.outcome.findings.filter((f) => f.severity === FindingSeverity.INFO).length,
        createdAt: new Date(),
        findings: input.outcome.findings.map((f, idx) => ({
          id: `finding-${idx}`,
          validationResultId: `val-${Date.now()}`,
          field: f.field,
          severity: f.severity,
          code: f.code,
          message: f.message,
          expectedValue: f.expectedValue,
          actualValue: f.actualValue,
          createdAt: new Date(),
        })),
      };
      validationResults.set(input.contentVersionId, res);
      return res;
    },
    async findByContentVersionAndValidatorVersion(
      versionId,
    ): Promise<PersistedValidationResult | null> {
      return validationResults.get(versionId) ?? null;
    },
    async findLatestByContentVersion(versionId): Promise<PersistedValidationResult | null> {
      return validationResults.get(versionId) ?? null;
    },
  };

  const mockSnapshotRepo: ProductSnapshotRepository = {
    async create(): Promise<ProductSnapshot> {
      return sampleSnapshot;
    },
    async findById(id: string): Promise<ProductSnapshot | null> {
      if (id === sampleSnapshot.id) return sampleSnapshot;
      return null;
    },
    async findByHash(): Promise<ProductSnapshot | null> {
      return null;
    },
    async findLatestBySku(): Promise<ProductSnapshot | null> {
      return sampleSnapshot;
    },
    async listLatestSnapshots(): Promise<readonly ProductSnapshot[]> {
      return [sampleSnapshot];
    },
  };

  const mockBrandRepo: BrandRuleRepository = {
    async create(): Promise<BrandRuleVersion> {
      return sampleBrandRule;
    },
    async findById(id: string): Promise<BrandRuleVersion | null> {
      if (id === sampleBrandRule.id) return sampleBrandRule;
      return null;
    },
    async findActive(): Promise<BrandRuleVersion | null> {
      return sampleBrandRule;
    },
  };

  const mockUserAccountRepo: UserAccountRepository = {
    async findById(id: string): Promise<AuthenticatedUserAccount | null> {
      if (id === adminUserId) {
        return {
          id: adminUserId,
          displayName: 'Admin Merchandiser',
          status: 'ACTIVE',
          disabledAt: null,
          roles: ['ADMIN'],
          permissions: resolvePermissionsForRoles(['ADMIN']),
          passwordCredential: null,
        };
      }
      if (id === unauthorizedUserId) {
        return {
          id: unauthorizedUserId,
          displayName: 'Guest Employee',
          status: 'ACTIVE',
          disabledAt: null,
          roles: ['VIEWER'],
          permissions: resolvePermissionsForRoles(['VIEWER']),
          passwordCredential: null,
        };
      }
      return null;
    },
    async findByTelegramUserId(): Promise<AuthenticatedUserAccount | null> {
      return null;
    },
    async updateRoles(): Promise<AuthenticatedUserAccount> {
      throw new Error('Not needed in e2e');
    },
    async updateStatus(): Promise<AuthenticatedUserAccount> {
      throw new Error('Not needed in e2e');
    },
  };

  const mockSessionRepo: UserSessionRepository = {
    async create(): Promise<UserSessionRecord> {
      throw new Error('Not needed in e2e');
    },
    async findById(): Promise<UserSessionRecord | null> {
      return null;
    },
    async findByTokenHash(tokenHash: string): Promise<UserSessionRecord | null> {
      if (tokenHash === validTokenHash) {
        return {
          id: 'sess-admin',
          userId: adminUserId,
          sessionTokenHash: validTokenHash,
          expiresAt: new Date(Date.now() + 86400000),
          revokedAt: null,
          lastActiveAt: new Date(),
          createdAt: new Date(),
        };
      }
      if (tokenHash === unpermittedTokenHash) {
        return {
          id: 'sess-unpermitted',
          userId: unauthorizedUserId,
          sessionTokenHash: unpermittedTokenHash,
          expiresAt: new Date(Date.now() + 86400000),
          revokedAt: null,
          lastActiveAt: new Date(),
          createdAt: new Date(),
        };
      }
      return null;
    },
    async findActiveByTokenHash(tokenHash: string): Promise<UserSessionRecord | null> {
      return this.findByTokenHash(tokenHash);
    },
    async findActiveByUserId(): Promise<readonly UserSessionRecord[]> {
      return [];
    },
    async touch(): Promise<void> {},
    async revoke(): Promise<boolean> {
      return true;
    },
    async revokeByTokenHash(): Promise<boolean> {
      return true;
    },
    async revokeAllForUser(): Promise<number> {
      return 0;
    },
    async purgeExpired(): Promise<number> {
      return 0;
    },
  };

  beforeAll(async () => {
    // Seed initial records
    jobs.set(initialJob.id, initialJob);
    versions.set(initialJob.id, [initialVersion]);
    attempts.set(initialJob.id, [initialAttempt]);
    validationResults.set(initialVersion.id, initialValidation);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ValkeyConnectionService)
      .useValue({ getClient: () => ({ status: 'ready' }), isHealthy: () => true })
      .overrideProvider(ContentGenerationQueue)
      .useValue({
        enqueue: jest.fn(async (jobId: string) => {
          mockEnqueuedJobs.push(jobId);
        }),
        isHealthy: async () => true,
      })
      .overrideProvider(CONTENT_GENERATION_ENQUEUER)
      .useValue({
        enqueue: jest.fn(async (jobId: string) => {
          mockEnqueuedJobs.push(jobId);
        }),
      })
      .overrideProvider(CreativeGenerationQueue)
      .useValue({ addJob: jest.fn(), isHealthy: async () => true })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(),
        $disconnect: jest.fn(),
        $queryRaw: jest.fn(async () => [{ 1: 1 }]),
      })
      .overrideProvider(DatabaseHealthIndicator)
      .useValue({ isHealthy: async () => true })
      .overrideProvider(PASSWORD_HASHER)
      .useClass(Argon2PasswordHasher)
      .overrideProvider(USER_ACCOUNT_REPOSITORY)
      .useValue(mockUserAccountRepo)
      .overrideProvider(USER_SESSION_REPOSITORY)
      .useValue(mockSessionRepo)
      .overrideProvider(PASSWORD_CREDENTIAL_REPOSITORY)
      .useValue({ findByUserId: async () => null })
      .overrideProvider(PRODUCT_SNAPSHOT_REPOSITORY)
      .useValue(mockSnapshotRepo)
      .overrideProvider(CAMPAIGN_REPOSITORY)
      .useValue({ findById: jest.fn(async () => null) })
      .overrideProvider(BRAND_RULE_REPOSITORY)
      .useValue(mockBrandRepo)
      .overrideProvider(CONTENT_GENERATION_REPOSITORY)
      .useValue(mockContentGenerationRepo)
      .overrideProvider(VALIDATION_REPOSITORY)
      .useValue(mockValidationRepo)
      .compile();

    application = moduleRef.createNestApplication();
    configureApi(application);
    await application.init();
    server = application.getHttpServer() as Server;
  });

  afterAll(async () => {
    if (application) {
      await application.close();
    }
  });

  it('CONTENT-E2E-01: unauthenticated requests are rejected with 401', async () => {
    const res = await request(server).get('/v1/content/jobs');
    expect(res.status).toBe(401);
  });

  it('CONTENT-E2E-02: unauthorized employee without content permissions is rejected with 403', async () => {
    const res = await request(server)
      .post('/v1/content/jobs')
      .set('Cookie', [`ps_session=${unpermittedSessionToken}`])
      .send({
        productSnapshotId: sampleSnapshot.id,
        contentType: 'PRODUCT_SPOTLIGHT',
        language: 'EN',
        platform: 'INSTAGRAM',
      });
    expect(res.status).toBe(403);
  });

  it('CONTENT-E2E-03: mutation without CSRF token is rejected with 403', async () => {
    const res = await request(server)
      .post('/v1/content/jobs')
      .set('Cookie', [`ps_session=${validSessionToken}`])
      .set('Origin', 'https://malicious-attacker.com')
      .send({
        productSnapshotId: sampleSnapshot.id,
        contentType: 'PRODUCT_SPOTLIGHT',
        language: 'EN',
        platform: 'INSTAGRAM',
      });
    expect(res.status).toBe(403);
  });

  it('CONTENT-E2E-04: successfully creates content job and enqueues background worker job', async () => {
    const res = await request(server)
      .post('/v1/content/jobs')
      .set('Cookie', [`ps_session=${validSessionToken}`, 'ps_csrf=test-csrf-token'])
      .set('x-csrf-token', 'test-csrf-token')
      .send({
        productSnapshotId: sampleSnapshot.id,
        contentType: 'PRODUCT_SPOTLIGHT',
        language: 'EN',
        platform: 'INSTAGRAM',
        campaignContext: 'Holiday luxury push',
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('REQUESTED');
    expect(res.body.productSnapshotId).toBe(sampleSnapshot.id);
    expect(res.body.brandRuleVersionId).toBe(sampleBrandRule.id);
    expect(mockEnqueuedJobs).toContain(res.body.id);
  });

  it('CONTENT-E2E-05: invalid payload rejected with 400 Bad Request', async () => {
    const res = await request(server)
      .post('/v1/content/jobs')
      .set('Cookie', [`ps_session=${validSessionToken}`, 'ps_csrf=test-csrf-token'])
      .set('x-csrf-token', 'test-csrf-token')
      .send({
        productSnapshotId: 'invalid-not-uuid',
        contentType: 'PRODUCT_SPOTLIGHT',
        language: 'INVALID_LANG',
        platform: 'INSTAGRAM',
      });

    expect(res.status).toBe(400);
  });

  it('CONTENT-E2E-06: lists content jobs with pagination', async () => {
    const res = await request(server)
      .get('/v1/content/jobs')
      .set('Cookie', [`ps_session=${validSessionToken}`]);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.page).toBe(1);
  });

  it('CONTENT-E2E-07: lists content jobs with status filter', async () => {
    const res = await request(server)
      .get('/v1/content/jobs?status=DRAFT')
      .set('Cookie', [`ps_session=${validSessionToken}`]);

    expect(res.status).toBe(200);
    const items = res.body.items as Array<{ status: string }>;
    expect(items.every((j) => j.status === 'DRAFT')).toBe(true);
  });

  it('CONTENT-E2E-08: gets full content job detail', async () => {
    const res = await request(server)
      .get(`/v1/content/jobs/${initialJob.id}`)
      .set('Cookie', [`ps_session=${validSessionToken}`]);

    expect(res.status).toBe(200);
    expect(res.body.job.id).toBe(initialJob.id);
    expect(res.body.product.sku).toBe('FIC-PERF-001');
    expect(res.body.product.priceUsd).toBe(230);
    expect(res.body.versions).toHaveLength(1);
    expect(res.body.attempts).toHaveLength(1);
    expect(res.body.currentVersion.id).toBe(initialVersion.id);
    expect(res.body.latestValidationResult.status).toBe('PASSED');
  });

  it('CONTENT-E2E-09: returns 404 for nonexistent content job', async () => {
    const res = await request(server)
      .get('/v1/content/jobs/00000000-0000-0000-0000-000000000999')
      .set('Cookie', [`ps_session=${validSessionToken}`]);

    expect(res.status).toBe(404);
  });

  it('CONTENT-E2E-10: gets version history for content job', async () => {
    const res = await request(server)
      .get(`/v1/content/jobs/${initialJob.id}/versions`)
      .set('Cookie', [`ps_session=${validSessionToken}`]);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].id).toBe(initialVersion.id);
  });

  it('CONTENT-E2E-11: gets single version detail with validation outcome', async () => {
    const res = await request(server)
      .get(`/v1/content/versions/${initialVersion.id}`)
      .set('Cookie', [`ps_session=${validSessionToken}`]);

    expect(res.status).toBe(200);
    expect(res.body.version.id).toBe(initialVersion.id);
    expect(res.body.validationResult.status).toBe('PASSED');
  });

  it('CONTENT-E2E-12: manual revision creates immutable new version', async () => {
    const res = await request(server)
      .post(`/v1/content/jobs/${initialJob.id}/revise/manual`)
      .set('Cookie', [`ps_session=${validSessionToken}`, 'ps_csrf=test-csrf-token'])
      .set('x-csrf-token', 'test-csrf-token')
      .send({
        currentVersionId: initialVersion.id,
        field: 'headline',
        newValue: 'Exclusive Rose Impériale Millésime',
      });

    expect(res.status).toBe(200);
    expect(res.body.version.id).not.toBe(initialVersion.id);
    expect(res.body.version.versionNumber).toBe(2);
    expect(res.body.version.structuredOutput.headline).toBe('Exclusive Rose Impériale Millésime');
  });

  it('CONTENT-E2E-13: submit for review fails with 400 when blocking validation error exists', async () => {
    // Create a mock version with blocking error
    const blockedVersion: ContentVersion = {
      ...initialVersion,
      id: '00000000-0000-4000-8000-000000000088',
      versionNumber: 3,
    };
    versions.set(initialJob.id, [...(versions.get(initialJob.id) ?? []), blockedVersion]);
    validationResults.set(blockedVersion.id, {
      id: '00000000-0000-4000-8000-000000000089',
      contentVersionId: blockedVersion.id,
      validatorVersion: '1.0',
      status: 'FAILED',
      findingCount: 1,
      blockingCount: 1,
      warningCount: 0,
      infoCount: 0,
      createdAt: new Date(),
      findings: [
        {
          id: '00000000-0000-4000-8000-000000000090',
          validationResultId: '00000000-0000-4000-8000-000000000089',
          field: 'price',
          severity: FindingSeverity.BLOCKING,
          code: FindingCode.PRICE_MISMATCH,
          message: 'Price does not match verified snapshot MSRP',
          createdAt: new Date(),
        },
      ],
    });

    const res = await request(server)
      .post(`/v1/content/jobs/${initialJob.id}/submit-for-review`)
      .set('Cookie', [`ps_session=${validSessionToken}`, 'ps_csrf=test-csrf-token'])
      .set('x-csrf-token', 'test-csrf-token')
      .send({
        contentVersionId: blockedVersion.id,
      });

    expect(res.status).toBe(400);
  });

  it('CONTENT-E2E-14: submit for review succeeds with valid version and sets status UNDER_REVIEW', async () => {
    const res = await request(server)
      .post(`/v1/content/jobs/${initialJob.id}/submit-for-review`)
      .set('Cookie', [`ps_session=${validSessionToken}`, 'ps_csrf=test-csrf-token'])
      .set('x-csrf-token', 'test-csrf-token')
      .send({
        contentVersionId: initialVersion.id,
      });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(initialJob.id);
    expect(res.body.status).toBe('UNDER_REVIEW');
  });
});
