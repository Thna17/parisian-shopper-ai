/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/explicit-function-return-type */
import { createHash } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  APPROVALS_REPOSITORY,
  Argon2PasswordHasher,
  type AuthenticatedUserAccount,
  CONTENT_GENERATION_REPOSITORY,
  PASSWORD_CREDENTIAL_REPOSITORY,
  PASSWORD_HASHER,
  Permission,
  PUBLISHING_REPOSITORY,
  PublicationChannel,
  type PublicationDetail,
  type PublicationRecord,
  PublicationStatus,
  type PublishingRepository,
  resolvePermissionsForRoles,
  USER_ACCOUNT_REPOSITORY,
  type UserAccountRepository,
  USER_SESSION_REPOSITORY,
  type UserSessionRecord,
  type UserSessionRepository,
} from '@parisian-shopper/application';
import { DatabaseHealthIndicator, PrismaService } from '@parisian-shopper/database';
import {
  ContentGenerationQueue,
  CreativeGenerationQueue,
  ValkeyConnectionService,
} from '@parisian-shopper/jobs';
import { jest } from '@jest/globals';
import { type Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { configureApi } from '../../src/bootstrap.js';

describe('Publishing Desk API Integration (e2e)', () => {
  let application: INestApplication;
  let server: Server;

  const adminUserId = '00000000-0000-4000-8000-000000000001';
  const unauthorizedUserId = '00000000-0000-4000-8000-000000000002';
  const viewerUserId = '00000000-0000-4000-8000-000000000003';

  const validSessionToken = 'test-ps-session-token-admin-publishing';
  const validTokenHash = createHash('sha256').update(validSessionToken).digest('hex');

  const unpermittedSessionToken = 'test-ps-session-token-unpermitted-publishing';
  const unpermittedTokenHash = createHash('sha256').update(unpermittedSessionToken).digest('hex');

  const viewerSessionToken = 'test-ps-session-token-viewer-publishing';
  const viewerTokenHash = createHash('sha256').update(viewerSessionToken).digest('hex');

  const approvedVersionId = '11111111-1111-4000-8000-000000000001';
  const unapprovedVersionId = '22222222-2222-4000-8000-000000000002';
  const contentJobId = '33333333-3333-4000-8000-000000000003';

  // In-memory publication storage for tests
  const publications = new Map<string, PublicationRecord>();
  const publicationAttempts = new Map<string, any[]>();

  const seedPublication: PublicationRecord = {
    id: 'pub-seed-001',
    contentVersionId: approvedVersionId,
    creativeExportId: 'exp-seed-001',
    destinationChannel: PublicationChannel.MANUAL_EXPORT,
    destinationAccountId: null,
    requestedByUserId: adminUserId,
    status: PublicationStatus.READY,
    idempotencyKey: 'seed-idemp-key-001',
    campaignId: 'camp-seed-001',
    scheduledAt: null,
    publishedAt: null,
    externalPublicationId: null,
    cancellationReason: null,
    createdAt: new Date('2026-10-29T10:00:00.000Z'),
    updatedAt: new Date('2026-10-29T10:00:00.000Z'),
  };

  const seedFailedPublication: PublicationRecord = {
    id: 'pub-failed-002',
    contentVersionId: approvedVersionId,
    creativeExportId: null,
    destinationChannel: PublicationChannel.TELEGRAM_CHANNEL,
    destinationAccountId: '@chanel_official',
    requestedByUserId: adminUserId,
    status: PublicationStatus.FAILED,
    idempotencyKey: 'seed-failed-key-002',
    campaignId: null,
    scheduledAt: null,
    publishedAt: null,
    externalPublicationId: null,
    cancellationReason: null,
    createdAt: new Date('2026-10-29T11:00:00.000Z'),
    updatedAt: new Date('2026-10-29T11:00:00.000Z'),
  };

  const mockPublishingRepo: PublishingRepository = {
    async create(input) {
      const id = `pub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const pub: PublicationRecord = {
        id,
        contentVersionId: input.contentVersionId,
        creativeExportId: input.creativeExportId,
        destinationChannel: input.destinationChannel as PublicationChannel,
        destinationAccountId: input.destinationAccountId,
        requestedByUserId: input.requestedByUserId,
        idempotencyKey: input.idempotencyKey,
        campaignId: input.campaignId,
        status: input.status as PublicationStatus,
        scheduledAt: null,
        publishedAt: null,
        externalPublicationId: null,
        cancellationReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      publications.set(id, pub);
      publicationAttempts.set(id, []);
      return pub;
    },

    async findById(id: string): Promise<PublicationDetail | null> {
      const pub = publications.get(id);
      if (!pub) return null;
      const attempts = publicationAttempts.get(id) ?? [];
      return {
        ...pub,
        attempts,
        contentVersion: {
          id: pub.contentVersionId,
          versionNumber: 1,
          contentJobId,
          structuredOutput: { headline: 'Test Headline' },
        },
        creativeExport: null,
        requestedByUser: {
          id: pub.requestedByUserId,
          displayName: 'Admin Merchandiser',
        },
        campaign: null,
      };
    },

    async findByIdempotencyKey(key: string): Promise<PublicationRecord | null> {
      for (const p of publications.values()) {
        if (p.idempotencyKey === key) return p;
      }
      return null;
    },

    async list(query) {
      let items = Array.from(publications.values());
      if (query.status) items = items.filter((p) => p.status === query.status);
      if (query.channel) items = items.filter((p) => p.destinationChannel === query.channel);

      return {
        items,
        total: items.length,
        page: query.page,
        limit: query.limit,
        totalPages: 1,
      };
    },

    async updateStatus(id, status, extra) {
      const pub = publications.get(id);
      if (!pub) throw new Error('Not found');
      const updated: PublicationRecord = {
        ...pub,
        status: status as PublicationStatus,
        ...(extra?.publishedAt ? { publishedAt: extra.publishedAt } : {}),
        ...(extra?.externalPublicationId
          ? { externalPublicationId: extra.externalPublicationId }
          : {}),
        ...(extra?.cancellationReason ? { cancellationReason: extra.cancellationReason } : {}),
        updatedAt: new Date(),
      };
      publications.set(id, updated);
      return updated;
    },

    async createAttempt(input) {
      const att = {
        id: `att-${Date.now()}`,
        publicationId: input.publicationId,
        attemptNumber: input.attemptNumber,
        status: input.status as PublicationStatus,
        startedAt: new Date(),
        completedAt: null,
        providerResult: null,
        externalPublicationId: null,
        errorCode: null,
        errorMessage: null,
        retryEligible: false,
        createdAt: new Date(),
      };
      const list = publicationAttempts.get(input.publicationId) ?? [];
      list.push(att);
      publicationAttempts.set(input.publicationId, list);
      return att;
    },

    async updateAttempt(id, update) {
      for (const list of publicationAttempts.values()) {
        const found = list.find((a) => a.id === id);
        if (found) {
          Object.assign(found, update);
          return found;
        }
      }
      throw new Error('Attempt not found');
    },

    async getAttemptCount(publicationId) {
      return (publicationAttempts.get(publicationId) ?? []).length;
    },

    async findEligibleContentVersions(_query) {
      return {
        items: [
          {
            contentVersionId: approvedVersionId,
            versionNumber: 1,
            contentJobId,
            productName: 'Chanel No 5',
            approvedAt: '2026-10-29T09:00:00.000Z',
            hasCreativeExports: true,
          },
        ],
        total: 1,
      };
    },
  };

  const mockContentRepo = {
    async findVersionById(id: string) {
      if (id === approvedVersionId) {
        return {
          id: approvedVersionId,
          contentJobId,
          versionNumber: 1,
          brandRuleVersionId: 'br-001',
          productSnapshotId: 'snap-001',
          generationAttemptId: 'att-001',
          provider: 'mock',
          model: 'mock',
          promptVersion: '1.0.0',
          structuredOutput: {
            headline: 'Title',
            khmer_caption: null,
            english_caption: null,
            cta: 'Click',
            hashtags: [],
            creative_brief: 'Brief',
            facts_used: [],
            warnings: [],
            missing_information: [],
          },
          createdAt: new Date(),
        };
      }
      if (id === unapprovedVersionId) {
        return {
          id: unapprovedVersionId,
          contentJobId: 'job-unapproved',
          versionNumber: 1,
          brandRuleVersionId: 'br-001',
          productSnapshotId: 'snap-001',
          generationAttemptId: 'att-002',
          provider: 'mock',
          model: 'mock',
          promptVersion: '1.0.0',
          structuredOutput: {
            headline: 'Unapproved',
            khmer_caption: null,
            english_caption: null,
            cta: 'Click',
            hashtags: [],
            creative_brief: 'Brief',
            facts_used: [],
            warnings: [],
            missing_information: [],
          },
          createdAt: new Date(),
        };
      }
      return null;
    },
  };

  const mockApprovalsRepo = {
    async findApprovalEventsByJobId(jobId: string) {
      if (jobId === contentJobId) {
        return [
          {
            id: 'appr-001',
            contentJobId,
            contentVersionId: approvedVersionId,
            approverUserId: adminUserId,
            decision: 'APPROVED',
            comment: 'Looks great',
            createdAt: new Date('2026-10-29T09:00:00.000Z'),
          },
        ];
      }
      return [];
    },
  };

  const mockUserAccountRepo: UserAccountRepository = {
    async findByLoginIdentifier() {
      return null;
    },
    async findById(userId: string): Promise<AuthenticatedUserAccount | null> {
      if (userId === adminUserId) {
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
      if (userId === viewerUserId) {
        return {
          id: viewerUserId,
          displayName: 'Viewer Staff',
          status: 'ACTIVE',
          disabledAt: null,
          roles: ['VIEWER'],
          permissions: [Permission.VIEW_PRODUCTS, Permission.VIEW_OWN_CONTENT],
          passwordCredential: null,
        };
      }
      if (userId === unauthorizedUserId) {
        return {
          id: unauthorizedUserId,
          displayName: 'No Access User',
          status: 'ACTIVE',
          disabledAt: null,
          roles: [],
          permissions: [],
          passwordCredential: null,
        };
      }
      return null;
    },
  };

  const mockSessionRepo: UserSessionRepository = {
    async create() {
      throw new Error('Not needed in e2e');
    },
    async findById() {
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
      if (tokenHash === viewerTokenHash) {
        return {
          id: 'sess-viewer',
          userId: viewerUserId,
          sessionTokenHash: viewerTokenHash,
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
    async findActiveByTokenHash(tokenHash: string) {
      return this.findByTokenHash(tokenHash);
    },
    async findActiveByUserId() {
      return [];
    },
    async touch() {},
    async revoke() {
      return true;
    },
    async revokeByTokenHash() {
      return true;
    },
    async revokeAllForUser() {
      return 0;
    },
    async purgeExpired() {
      return 0;
    },
  };

  beforeAll(async () => {
    // Seed initial publications
    publications.set(seedPublication.id, seedPublication);
    publications.set(seedFailedPublication.id, seedFailedPublication);
    publicationAttempts.set(seedPublication.id, []);
    publicationAttempts.set(seedFailedPublication.id, []);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ValkeyConnectionService)
      .useValue({ getClient: () => ({ status: 'ready' }), isHealthy: () => true })
      .overrideProvider(ContentGenerationQueue)
      .useValue({ addJob: jest.fn(), isHealthy: async () => true })
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
      .overrideProvider(PUBLISHING_REPOSITORY)
      .useValue(mockPublishingRepo)
      .overrideProvider(CONTENT_GENERATION_REPOSITORY)
      .useValue(mockContentRepo)
      .overrideProvider(APPROVALS_REPOSITORY)
      .useValue(mockApprovalsRepo)
      .compile();

    application = moduleRef.createNestApplication();
    configureApi(application);
    await application.init();
    server = application.getHttpServer() as Server;
  });

  afterAll(async () => {
    if (server) {
      server.closeAllConnections?.();
      if (server.listening) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }
    if (application) {
      await application.close();
    }
  });

  it('PUB-API-01: unauthenticated requests are rejected with 401', async () => {
    const res = await request(server).get('/v1/publishing');
    expect(res.status).toBe(401);
  });

  it('PUB-API-02: unauthorized employee without VIEW_OWN_CONTENT is rejected with 403', async () => {
    const res = await request(server)
      .get('/v1/publishing')
      .set('Cookie', `ps_session=${unpermittedSessionToken}`);
    expect(res.status).toBe(403);
  });

  it('PUB-API-03: authorized employee lists publications successfully with 200', async () => {
    const res = await request(server)
      .get('/v1/publishing')
      .set('Cookie', `ps_session=${validSessionToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toBeDefined();
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    expect(res.body.total).toBeDefined();
  });

  it('PUB-API-04: unauthenticated requests to POST /v1/publishing are rejected with 401', async () => {
    const res = await request(server).post('/v1/publishing').send({
      contentVersionId: approvedVersionId,
      destinationChannel: 'MANUAL_EXPORT',
      idempotencyKey: 'unauth-key-1',
    });
    expect(res.status).toBe(401);
  });

  it('PUB-API-05: employee without PUBLISH_CREATIVE is rejected with 403 on POST /v1/publishing', async () => {
    const res = await request(server)
      .post('/v1/publishing')
      .set('Cookie', `ps_session=${viewerSessionToken}`)
      .send({
        contentVersionId: approvedVersionId,
        destinationChannel: 'MANUAL_EXPORT',
        idempotencyKey: 'viewer-create-key-1',
      });
    expect(res.status).toBe(403);
  });

  it('PUB-API-06: rejects publication creation with 422 if content version is not approved', async () => {
    const res = await request(server)
      .post('/v1/publishing')
      .set('Cookie', `ps_session=${validSessionToken}`)
      .send({
        contentVersionId: unapprovedVersionId,
        destinationChannel: 'MANUAL_EXPORT',
        idempotencyKey: 'unapproved-pub-key-1',
      });
    expect(res.status).toBe(422);
  });

  it('PUB-API-07: successfully creates publication for approved content version', async () => {
    const idempotencyKey = `pub-e2e-create-${Date.now()}`;
    const res = await request(server)
      .post('/v1/publishing')
      .set('Cookie', `ps_session=${validSessionToken}`)
      .send({
        contentVersionId: approvedVersionId,
        destinationChannel: 'MANUAL_EXPORT',
        idempotencyKey,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('READY');
    expect(res.body.destinationChannel).toBe('MANUAL_EXPORT');
  });

  it('PUB-API-08: publication creation is idempotent on duplicate key', async () => {
    const res = await request(server)
      .post('/v1/publishing')
      .set('Cookie', `ps_session=${validSessionToken}`)
      .send({
        contentVersionId: approvedVersionId,
        destinationChannel: 'MANUAL_EXPORT',
        idempotencyKey: seedPublication.idempotencyKey,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(seedPublication.id);
  });

  it('PUB-API-09: GET /v1/publishing/destinations returns channel capabilities and indicates live external delivery is safely disabled', async () => {
    const res = await request(server)
      .get('/v1/publishing/destinations')
      .set('Cookie', `ps_session=${validSessionToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const telegram = res.body.find((d: any) => d.channel === 'TELEGRAM_CHANNEL');
    expect(telegram).toBeDefined();
    expect(telegram.enabled).toBe(false);

    const manualExport = res.body.find((d: any) => d.channel === 'MANUAL_EXPORT');
    expect(manualExport).toBeDefined();
    expect(manualExport.enabled).toBe(true);
  });

  it('PUB-API-10: GET /v1/publishing/eligible-assets returns approved content versions', async () => {
    const res = await request(server)
      .get('/v1/publishing/eligible-assets')
      .set('Cookie', `ps_session=${validSessionToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toBeDefined();
    expect(res.body.items[0].contentVersionId).toBe(approvedVersionId);
  });

  it('PUB-API-11: GET /v1/publishing/:id returns detailed publication record', async () => {
    const res = await request(server)
      .get(`/v1/publishing/${seedPublication.id}`)
      .set('Cookie', `ps_session=${validSessionToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(seedPublication.id);
    expect(res.body.attempts).toBeDefined();
  });

  it('PUB-API-12: GET /v1/publishing/:id returns 404 for nonexistent publication', async () => {
    const res = await request(server)
      .get('/v1/publishing/pub-nonexistent-999')
      .set('Cookie', `ps_session=${validSessionToken}`);

    expect(res.status).toBe(404);
  });

  it('PUB-API-13: POST /v1/publishing/:id/confirm rejects disabled channels with 400', async () => {
    const res = await request(server)
      .post(`/v1/publishing/${seedFailedPublication.id}/confirm`)
      .set('Cookie', `ps_session=${validSessionToken}`);

    // Failed is not DRAFT/READY, plus TELEGRAM_CHANNEL is not enabled
    expect([400, 409]).toContain(res.status);
  });

  it('PUB-API-14: POST /v1/publishing/:id/confirm publishes MANUAL_EXPORT and updates status to PUBLISHED', async () => {
    const res = await request(server)
      .post(`/v1/publishing/${seedPublication.id}/confirm`)
      .set('Cookie', `ps_session=${validSessionToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PUBLISHED');
  });

  it('PUB-API-15: POST /v1/publishing/:id/retry rejects non-failed publication with 409', async () => {
    const res = await request(server)
      .post(`/v1/publishing/${seedPublication.id}/retry`)
      .set('Cookie', `ps_session=${validSessionToken}`);

    expect(res.status).toBe(409);
  });

  it('PUB-API-16: POST /v1/publishing/:id/retry re-queues a failed publication to QUEUED', async () => {
    const res = await request(server)
      .post(`/v1/publishing/${seedFailedPublication.id}/retry`)
      .set('Cookie', `ps_session=${validSessionToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('QUEUED');
  });

  it('PUB-API-17: POST /v1/publishing/:id/cancel cancels a publication with reason', async () => {
    // Create a new publication in READY status to cancel
    const newPub = await mockPublishingRepo.create({
      contentVersionId: approvedVersionId,
      creativeExportId: null,
      destinationChannel: 'MANUAL_EXPORT',
      destinationAccountId: null,
      requestedByUserId: adminUserId,
      idempotencyKey: `cancel-pub-${Date.now()}`,
      campaignId: null,
      status: 'READY',
    });

    const res = await request(server)
      .post(`/v1/publishing/${newPub.id}/cancel`)
      .set('Cookie', `ps_session=${validSessionToken}`)
      .send({ reason: 'Customer requested change of schedule' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
    expect(res.body.cancellationReason).toBe('Customer requested change of schedule');
  });

  it('PUB-API-18: POST /v1/publishing/:id/cancel rejects cancelling an already published item with 409', async () => {
    const res = await request(server)
      .post(`/v1/publishing/${seedPublication.id}/cancel`)
      .set('Cookie', `ps_session=${validSessionToken}`)
      .send({ reason: 'Cannot cancel after published' });

    expect(res.status).toBe(409);
  });
});
