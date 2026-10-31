/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-member-access */
import { createHash } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  Argon2PasswordHasher,
  type AuthenticatedUserAccount,
  CAMPAIGN_REPOSITORY,
  type CampaignDetail,
  type CampaignProductRecord,
  type CampaignRepository,
  CampaignStatus,
  type CampaignSummary,
  type CreateCampaignInput,
  FICTIONAL_PRODUCTS,
  type ListCampaignsQuery,
  type PaginatedCampaigns,
  PASSWORD_CREDENTIAL_REPOSITORY,
  PASSWORD_HASHER,
  Permission,
  PRODUCT_SNAPSHOT_REPOSITORY,
  type ProductSnapshot,
  type ProductSnapshotRepository,
  resolvePermissionsForRoles,
  type UpdateCampaignInput,
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

describe('Campaigns API Integration (e2e)', () => {
  let application: INestApplication;
  let server: Server;

  const adminUserId = '00000000-0000-4000-8000-000000000001';
  const unauthorizedUserId = '00000000-0000-4000-8000-000000000002';

  const validSessionToken = 'test-ps-session-token-admin-campaigns';
  const validTokenHash = createHash('sha256').update(validSessionToken).digest('hex');

  const unpermittedSessionToken = 'test-ps-session-token-unpermitted-campaigns';
  const unpermittedTokenHash = createHash('sha256').update(unpermittedSessionToken).digest('hex');

  const sampleSnapshot2: ProductSnapshot = {
    id: '5c79f025-8f15-4fd6-a7e9-a971290e3e02',
    product: {
      ...FICTIONAL_PRODUCTS[1]!,
      product: {
        ...FICTIONAL_PRODUCTS[1]!.product,
        price: '185.00',
        priceUsd: 185.0,
      },
    },
    snapshotHash: 'hash-def-002',
    normalizerVersion: 'phase-1b-v1',
    createdAt: new Date('2026-10-24T12:00:00.000Z'),
  };
  const initialCatalogPriceUsd = 230.0;
  const sampleSnapshot: ProductSnapshot = {
    id: '4b68e914-7e04-4ec5-b6d8-f860189d2d01',
    product: {
      ...FICTIONAL_PRODUCTS[0]!,
      product: {
        ...FICTIONAL_PRODUCTS[0]!.product,
        priceUsd: initialCatalogPriceUsd,
      },
    },
    snapshotHash: 'hash-abc-001',
    normalizerVersion: 'phase-1b-v1',
    createdAt: new Date('2026-10-24T12:00:00.000Z'),
  };

  // In-memory campaign storage for tests
  const campaigns = new Map<string, CampaignDetail>();
  const campaignProducts = new Map<string, CampaignProductRecord[]>();

  const seedCampaign: CampaignDetail = {
    id: 'camp-seed-001',
    code: 'CAMP-ROSE-2026',
    name: 'Rose Impériale Spring Campaign',
    objective: "Luxury Mother's Day promotion",
    description: 'High-end social media spotlight',
    status: CampaignStatus.DRAFT,
    startDate: new Date('2026-05-01T00:00:00.000Z'),
    endDate: new Date('2026-05-15T00:00:00.000Z'),
    createdById: adminUserId,
    createdByDisplayName: 'Admin Merchandiser',
    productCount: 1,
    heroProductSku: 'PERF-ROSE-001',
    heroProductTitle: 'Rose Impériale EDP 100ml',
    products: [
      {
        id: 'assoc-001',
        campaignId: 'camp-seed-001',
        productSnapshotId: sampleSnapshot.id,
        sortOrder: 0,
        isHero: true,
        notes: 'Featured hero fragrance',
        targetPromoPrice: 195.0,
        targetDiscountPercent: 15.0,
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        productSku: 'PERF-ROSE-001',
        productTitle: 'Rose Impériale EDP 100ml',
        brandName: 'Maison Royale',
        catalogPriceUsd: initialCatalogPriceUsd,
        heroAssetUrl: 'https://cdn.example.com/rose-hero.png',
      },
    ],
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
  };

  const mockCampaignRepo: CampaignRepository = {
    async findById(id: string): Promise<CampaignDetail | null> {
      const c = campaigns.get(id);
      if (!c) return null;
      const prods = campaignProducts.get(id) ?? [];
      return { ...c, products: prods, productCount: prods.length };
    },
    async findByCode(code: string): Promise<CampaignDetail | null> {
      for (const c of campaigns.values()) {
        if (c.code.toUpperCase() === code.toUpperCase()) {
          const prods = campaignProducts.get(c.id) ?? [];
          return { ...c, products: prods, productCount: prods.length };
        }
      }
      return null;
    },
    async findPaginated(query: ListCampaignsQuery): Promise<PaginatedCampaigns> {
      let items: CampaignSummary[] = Array.from(campaigns.values()).map((c) => {
        const prods = campaignProducts.get(c.id) ?? [];
        return { ...c, products: prods, productCount: prods.length };
      });

      if (query.status) {
        items = items.filter((i) => i.status === query.status);
      }
      if (query.search) {
        const s = query.search.toLowerCase();
        items = items.filter(
          (i) =>
            i.name.toLowerCase().includes(s) ||
            i.code.toLowerCase().includes(s) ||
            i.objective.toLowerCase().includes(s),
        );
      }
      if (query.createdById) {
        items = items.filter((i) => i.createdById === query.createdById);
      }

      return {
        items,
        total: items.length,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        totalPages: 1,
      };
    },
    async create(input: CreateCampaignInput): Promise<CampaignDetail> {
      const id = `camp-${Date.now()}`;
      const newCampaign: CampaignDetail = {
        id,
        code: input.code,
        name: input.name,
        objective: input.objective,
        description: input.description ?? null,
        status: input.status ?? CampaignStatus.DRAFT,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        createdById: input.createdById,
        createdByDisplayName: 'Admin Merchandiser',
        productCount: 0,
        products: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      campaigns.set(id, newCampaign);
      campaignProducts.set(id, []);
      return newCampaign;
    },
    async update(id: string, input: UpdateCampaignInput): Promise<CampaignDetail> {
      const current = campaigns.get(id);
      if (!current) throw new Error('Not found');
      const updated: CampaignDetail = {
        ...current,
        name: input.name !== undefined ? input.name : current.name,
        objective: input.objective !== undefined ? input.objective : current.objective,
        description: input.description !== undefined ? input.description : current.description,
        startDate: input.startDate !== undefined ? input.startDate : current.startDate,
        endDate: input.endDate !== undefined ? input.endDate : current.endDate,
        updatedAt: new Date(),
      };
      campaigns.set(id, updated);
      const prods = campaignProducts.get(id) ?? [];
      return { ...updated, products: prods, productCount: prods.length };
    },
    async updateStatus(id: string, status: CampaignStatus): Promise<CampaignDetail> {
      const current = campaigns.get(id);
      if (!current) throw new Error('Not found');
      const updated: CampaignDetail = {
        ...current,
        status,
        updatedAt: new Date(),
      };
      campaigns.set(id, updated);
      const prods = campaignProducts.get(id) ?? [];
      return { ...updated, products: prods, productCount: prods.length };
    },
    async addProduct(campaignId: string, input): Promise<CampaignProductRecord> {
      const prods = campaignProducts.get(campaignId) ?? [];
      const newProd: CampaignProductRecord = {
        id: `assoc-${Date.now()}`,
        campaignId,
        productSnapshotId: input.productSnapshotId,
        sortOrder: input.sortOrder ?? prods.length,
        isHero: input.isHero ?? false,
        notes: input.notes ?? null,
        targetPromoPrice: input.targetPromoPrice ?? null,
        targetDiscountPercent: input.targetDiscountPercent ?? null,
        createdAt: new Date(),
        productSku: sampleSnapshot.product.product.sku,
        productTitle: sampleSnapshot.product.product.product_name,
        brandName: sampleSnapshot.product.product.brand,
        catalogPriceUsd: initialCatalogPriceUsd,
      };
      prods.push(newProd);
      campaignProducts.set(campaignId, prods);
      return newProd;
    },
    async removeProduct(campaignId: string, productSnapshotIdOrAssocId: string): Promise<void> {
      const prods = campaignProducts.get(campaignId) ?? [];
      const filtered = prods.filter(
        (p) =>
          p.id !== productSnapshotIdOrAssocId && p.productSnapshotId !== productSnapshotIdOrAssocId,
      );
      campaignProducts.set(campaignId, filtered);
    },
    async delete(id: string): Promise<void> {
      campaigns.delete(id);
      campaignProducts.delete(id);
    },
  };

  const mockSnapshotRepo: ProductSnapshotRepository = {
    async create(): Promise<ProductSnapshot> {
      return sampleSnapshot;
    },
    async findById(id: string): Promise<ProductSnapshot | null> {
      if (id === sampleSnapshot.id) return sampleSnapshot;
      if (id === sampleSnapshot2.id) return sampleSnapshot2;
      return null;
    },
    async findLatestBySku(sku: string): Promise<ProductSnapshot | null> {
      if (sku === sampleSnapshot.product.product.sku) return sampleSnapshot;
      return null;
    },
    async findPaginated() {
      return {
        items: [sampleSnapshot],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      };
    },
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
          displayName: 'No Content Access User',
          status: 'ACTIVE',
          disabledAt: null,
          roles: [],
          permissions: [Permission.VIEW_PRODUCTS], // only products, no campaigns/content
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

  beforeAll(async () => {
    // Seed initial campaign
    campaigns.set(seedCampaign.id, seedCampaign);
    campaignProducts.set(seedCampaign.id, [...seedCampaign.products]);

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
      .overrideProvider(PRODUCT_SNAPSHOT_REPOSITORY)
      .useValue(mockSnapshotRepo)
      .overrideProvider(CAMPAIGN_REPOSITORY)
      .useValue(mockCampaignRepo)
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

  it('E2E-CAMP-01: unauthenticated requests are rejected with 401', async () => {
    const res = await request(server).get('/v1/campaigns');
    expect(res.status).toBe(401);
  });

  it('E2E-CAMP-02: unauthorized employee without content permissions is rejected with 403', async () => {
    const res = await request(server)
      .get('/v1/campaigns')
      .set('Cookie', `ps_session=${unpermittedSessionToken}`);

    expect(res.status).toBe(403);
  });

  it('E2E-CAMP-03: authorized employee lists campaigns successfully with pagination', async () => {
    const res = await request(server)
      .get('/v1/campaigns')
      .set('Cookie', [`ps_session=${validSessionToken}`]);

    expect(res.status).toBe(200);
    expect(res.body.items).toBeInstanceOf(Array);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    expect(res.body.items[0].code).toBe('CAMP-ROSE-2026');
  });

  it('E2E-CAMP-04: creates a new campaign and verifies server-derived actor attribution', async () => {
    const newCampaignPayload = {
      code: 'CAMP-SUMMER-2026',
      name: 'Summer Riviera Fragrance Preview',
      objective: 'Launch summer aquatic collection',
      description: 'Influencer and retail showroom activation',
      startDate: '2026-06-01T00:00:00.000Z',
      endDate: '2026-06-30T00:00:00.000Z',
    };

    const res = await request(server)
      .post('/v1/campaigns')
      .set('Cookie', [`ps_session=${validSessionToken}`])
      .set('x-csrf-token', '1')
      .send(newCampaignPayload);

    expect(res.status).toBe(201);
    expect(res.body.code).toBe('CAMP-SUMMER-2026');
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.createdById).toBe(adminUserId); // Derived from session
  });

  it('E2E-CAMP-05: rejects duplicate campaign code with 409 Conflict', async () => {
    const res = await request(server)
      .post('/v1/campaigns')
      .set('Cookie', [`ps_session=${validSessionToken}`])
      .set('x-csrf-token', '1')
      .send({
        code: 'CAMP-ROSE-2026', // already exists
        name: 'Another Rose Campaign',
        objective: 'Test duplicate rejection',
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_CAMPAIGN_CODE');
  });

  it('E2E-CAMP-06: retrieves campaign details by identifier including associated products', async () => {
    const res = await request(server)
      .get(`/v1/campaigns/${seedCampaign.id}`)
      .set('Cookie', [`ps_session=${validSessionToken}`]);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(seedCampaign.id);
    expect(res.body.products).toHaveLength(1);
    expect(res.body.products[0].productSku).toBe('PERF-ROSE-001');
    expect(res.body.products[0].catalogPriceUsd).toBe(initialCatalogPriceUsd);
  });

  it('E2E-CAMP-07: updates allowed campaign attributes', async () => {
    const res = await request(server)
      .patch(`/v1/campaigns/${seedCampaign.id}`)
      .set('Cookie', [`ps_session=${validSessionToken}`])
      .set('x-csrf-token', '1')
      .send({
        name: 'Rose Impériale Premium Spring Spotlight',
      });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Rose Impériale Premium Spring Spotlight');
  });

  it('E2E-CAMP-08 & E2E-CAMP-09: associates product snapshot with proposed target pricing, verifying ProductSnapshot MSRP is NOT mutated', async () => {
    // 1. Associate product with proposed promo target
    const assocRes = await request(server)
      .post(`/v1/campaigns/${seedCampaign.id}/products`)
      .set('Cookie', `ps_session=${validSessionToken}`)
      .set('x-csrf-token', '1')
      .send({
        productSnapshotId: sampleSnapshot2.id,
        isHero: false,
        notes: 'Targeting promotional price of 150 USD',
        targetPromoPrice: 150.0,
        targetDiscountPercent: 18.9,
      });

    // Association succeeds
    expect(assocRes.status).toBe(201);
    expect(assocRes.body.targetPromoPrice).toBe(150.0);
    expect(assocRes.body.targetDiscountPercent).toBe(18.9);

    // 2. COMMERCIAL INTEGRITY INVARIANT:
    // Fetch product snapshot directly from product API
    const productRes = await request(server)
      .get(`/v1/products/${sampleSnapshot2.id}`)
      .set('Cookie', `ps_session=${validSessionToken}`);

    expect(productRes.status).toBe(200);
    // Baseline catalog MSRP must remain strictly 185.00
    expect(productRes.body.price.amount).toBe(185.0);
  });

  it('E2E-CAMP-10: enforces permitted lifecycle status transitions', async () => {
    const statusRes = await request(server)
      .post(`/v1/campaigns/${seedCampaign.id}/status`)
      .set('Cookie', [`ps_session=${validSessionToken}`])
      .set('x-csrf-token', '1')
      .send({
        status: CampaignStatus.PLANNED,
      });

    expect(statusRes.status).toBe(200);
    expect(statusRes.body.status).toBe('PLANNED');
  });

  it('E2E-CAMP-11: CSRF protection blocks cross-origin mutation without required CSRF verification', async () => {
    const crossOriginRes = await request(server)
      .post(`/v1/campaigns/${seedCampaign.id}/status`)
      .set('Cookie', [`ps_session=${validSessionToken}`])
      .set('Origin', 'https://malicious-attacker.com') // Untrusted origin
      .send({ status: CampaignStatus.ARCHIVED });

    expect(crossOriginRes.status).toBe(403);
    expect(crossOriginRes.body.error.code).toBe('CSRF_VALIDATION_FAILED');
  });

  it('E2E-CAMP-12: removes product association from campaign', async () => {
    const delRes = await request(server)
      .delete(`/v1/campaigns/${seedCampaign.id}/products/assoc-001`)
      .set('Cookie', [`ps_session=${validSessionToken}`])
      .set('x-csrf-token', '1');

    expect(delRes.status).toBe(204);
  });
});
