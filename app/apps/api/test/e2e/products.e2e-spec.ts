/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-member-access */
import { createHash } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  Argon2PasswordHasher,
  type AuthenticatedUserAccount,
  FICTIONAL_PRODUCTS,
  PASSWORD_CREDENTIAL_REPOSITORY,
  PASSWORD_HASHER,
  type ProductAssetRepository,
  type ProductFreshnessAssessmentRepository,
  PRODUCT_ASSET_REPOSITORY,
  PRODUCT_FRESHNESS_ASSESSMENT_REPOSITORY,
  PRODUCT_SNAPSHOT_REPOSITORY,
  type ProductSnapshot,
  type ProductSnapshotRepository,
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

describe('Products API Integration (e2e)', () => {
  let application: INestApplication;
  let server: Server;

  const adminUserId = '00000000-0000-4000-8000-000000000001';
  const unauthorizedUserId = '00000000-0000-4000-8000-000000000002';

  const validSessionToken = 'test-ps-session-token-admin-1234567890';
  const validTokenHash = createHash('sha256').update(validSessionToken).digest('hex');

  const unpermittedSessionToken = 'test-ps-session-token-unpermitted-1234567890';
  const unpermittedTokenHash = createHash('sha256').update(unpermittedSessionToken).digest('hex');

  const sampleSnapshot: ProductSnapshot = {
    id: '4b68e914-7e04-4ec5-b6d8-f860189d2d01',
    product: FICTIONAL_PRODUCTS[0]!,
    snapshotHash: 'hash-abc-001',
    normalizerVersion: 'phase-1b-v1',
    createdAt: new Date('2026-10-24T12:00:00.000Z'),
  };

  const mockUserAccountRepo: UserAccountRepository = {
    async findByLoginIdentifier(): Promise<AuthenticatedUserAccount | null> {
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
      if (userId === unauthorizedUserId) {
        return {
          id: unauthorizedUserId,
          displayName: 'No Access User',
          status: 'ACTIVE',
          disabledAt: null,
          roles: [],
          permissions: [], // zero permissions
          passwordCredential: null,
        };
      }
      return null;
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

  const mockSnapshotRepo: ProductSnapshotRepository = {
    async create(): Promise<ProductSnapshot> {
      return sampleSnapshot;
    },
    async findById(id: string): Promise<ProductSnapshot | null> {
      if (id === sampleSnapshot.id) return sampleSnapshot;
      return null;
    },
    async findLatestBySku(sku: string): Promise<ProductSnapshot | null> {
      if (sku === sampleSnapshot.product.product.sku) return sampleSnapshot;
      return null;
    },
    async findPaginated(query = {}) {
      let items = [sampleSnapshot];
      if (
        query.search &&
        !sampleSnapshot.product.product.product_name
          .toLowerCase()
          .includes(query.search.toLowerCase())
      ) {
        items = [];
      }
      return {
        items,
        total: items.length,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        totalPages: 1,
      };
    },
  };

  const mockAssetRepo: Partial<ProductAssetRepository> = {
    async findRegistrationsBySku(sku: string) {
      return [
        {
          id: 'reg-01',
          sequence: 1n,
          productAssetId: 'asset-01',
          sku,
          role: 'HERO_CUTOUT',
          sourceSystem: 'test-source',
          rightsState: 'VERIFIED',
          registeredAt: new Date(),
        },
      ];
    },
  };

  const mockAssessmentRepo: Partial<ProductFreshnessAssessmentRepository> = {
    async findLatestForSnapshot(snapshotId: string) {
      return {
        id: 'assess-01',
        snapshotId,
        evaluatedAt: new Date(),
        policyId: 'policy-01',
        policyVersion: '1.0',
        freshnessState: 'FRESH',
        revalidationOutcome: 'FRESH',
        sourceAvailability: 'AVAILABLE',
        reasonCodes: ['OK_FRESH'],
        evidence: {},
        createdAt: new Date(),
      };
    },
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(),
        $disconnect: jest.fn(),
        $transaction: jest.fn().mockImplementation(() => Promise.resolve([])),
      })
      .overrideProvider(DatabaseHealthIndicator)
      .useValue({ ping: jest.fn().mockResolvedValue(undefined) })
      .overrideProvider(ValkeyConnectionService)
      .useValue({ ping: jest.fn().mockResolvedValue(undefined) })
      .overrideProvider(CreativeGenerationQueue)
      .useValue({ enqueue: jest.fn(), onModuleInit: jest.fn() })
      .overrideProvider(ContentGenerationQueue)
      .useValue({ enqueue: jest.fn(), onModuleInit: jest.fn() })
      .overrideProvider(USER_ACCOUNT_REPOSITORY)
      .useValue(mockUserAccountRepo)
      .overrideProvider(USER_SESSION_REPOSITORY)
      .useValue(mockSessionRepo)
      .overrideProvider(PASSWORD_CREDENTIAL_REPOSITORY)
      .useValue({})
      .overrideProvider(PASSWORD_HASHER)
      .useValue(new Argon2PasswordHasher())
      .overrideProvider(PRODUCT_SNAPSHOT_REPOSITORY)
      .useValue(mockSnapshotRepo)
      .overrideProvider(PRODUCT_ASSET_REPOSITORY)
      .useValue(mockAssetRepo)
      .overrideProvider(PRODUCT_FRESHNESS_ASSESSMENT_REPOSITORY)
      .useValue(mockAssessmentRepo)
      .compile();

    application = module.createNestApplication();
    configureApi(application);
    await application.init();
    server = application.getHttpServer() as Server;
  });

  afterAll(async () => {
    if (server?.listening) {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (application) {
      await application.close();
    }
  });

  it('GET /v1/products — 401 when unauthenticated', async () => {
    const res = await request(server).get('/v1/products');
    expect(res.status).toBe(401);
  });

  it('GET /v1/products — 403 when user lacks VIEW_PRODUCTS permission', async () => {
    const res = await request(server)
      .get('/v1/products')
      .set('Cookie', `ps_session=${unpermittedSessionToken}`);
    expect(res.status).toBe(403);
  });

  it('GET /v1/products — 200 with paginated product catalog for permitted user', async () => {
    const res = await request(server)
      .get('/v1/products')
      .set('Cookie', `ps_session=${validSessionToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.total).toBe(1);
    expect(res.body.data[0].sku).toBe(sampleSnapshot.product.product.sku);
  });

  it('GET /v1/products?q=Moonlit — 200 returns filtered results', async () => {
    const res = await request(server)
      .get('/v1/products?q=Moonlit')
      .set('Cookie', `ps_session=${validSessionToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('GET /v1/products/:id — 200 retrieves product details by UUID', async () => {
    const res = await request(server)
      .get(`/v1/products/${sampleSnapshot.id}`)
      .set('Cookie', `ps_session=${validSessionToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(sampleSnapshot.id);
    expect(res.body.sku).toBe(sampleSnapshot.product.product.sku);
    expect(res.body.price).toBeDefined();
    expect(res.body.price.amount).toBe(38);
    expect(res.body.price.currency).toBe('USD');
    expect(res.body.provenance).toBeDefined();
  });

  it('GET /v1/products/:id — 200 retrieves product details by SKU', async () => {
    const res = await request(server)
      .get(`/v1/products/${sampleSnapshot.product.product.sku}`)
      .set('Cookie', `ps_session=${validSessionToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(sampleSnapshot.id);
    expect(res.body.sku).toBe(sampleSnapshot.product.product.sku);
  });

  it('GET /v1/products/:id/readiness — 200 evaluates commercial readiness', async () => {
    const res = await request(server)
      .get(`/v1/products/${sampleSnapshot.id}/readiness`)
      .set('Cookie', `ps_session=${validSessionToken}`);

    expect(res.status).toBe(200);
    expect(res.body.productId).toBe(sampleSnapshot.id);
    expect(res.body.freshnessState).toBe('FRESH');
    expect(res.body.isReadyForContent).toBe(true);
    expect(res.body.findings).toBeInstanceOf(Array);
  });

  it('GET /v1/products/:id/facts — 200 returns verified commercial facts', async () => {
    const res = await request(server)
      .get(`/v1/products/${sampleSnapshot.id}/facts`)
      .set('Cookie', `ps_session=${validSessionToken}`);

    expect(res.status).toBe(200);
    expect(res.body.sku).toBe(sampleSnapshot.product.product.sku);
    expect(res.body.productName).toBe('Moonlit River Eau de Parfum');
    expect(res.body.price.amount).toBe(38);
    expect(res.body.provenance.snapshotHash).toBe(sampleSnapshot.snapshotHash);
  });

  it('GET /v1/products/:id — 404 for unknown product identifier', async () => {
    const res = await request(server)
      .get('/v1/products/NON_EXISTENT_SKU')
      .set('Cookie', `ps_session=${validSessionToken}`);

    expect(res.status).toBe(404);
  });
});
