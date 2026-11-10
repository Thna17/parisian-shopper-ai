import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { FakeClock } from '@parisian-shopper/common';
import { AppConfigService } from '@parisian-shopper/config';
import {
  ProductMarketingEligibilityService,
  productConceptWarnings,
} from './product-marketing-eligibility.service.js';
import {
  createDevelopmentFreshnessPolicy,
  calculatePolicyVersionHash,
  type FreshnessPolicy,
  type FreshnessPolicyRepository,
} from '../domain/freshness-policy.js';
import type { ProductSnapshot, ProductSnapshotRepository } from './product-snapshot.repository.js';
import type {
  ProductFreshnessAssessment,
  ProductFreshnessAssessmentRepository,
} from './product-freshness-assessment.repository.js';
import type { ProductSource } from './product-source.port.js';
import type { ProductMarketingHistory } from './product-marketing-history.port.js';
import { FICTIONAL_PRODUCTS } from '../testing/fictional-products.js';
import type { NormalizedProductEnvelope } from '../domain/product.schema.js';
import { deriveStockStatus } from '../infrastructure/mekhla-product-source.js';
import { marketingSafeSnapshot } from './product-marketing-facts.js';
const now = new Date('2026-11-07T10:00:00.000Z'),
  actor = { id: 'creator', permissions: ['VIEW_OWN_CONTENT'] };
describe('shared product marketing eligibility and release checks', () => {
  let snapshot: ProductSnapshot,
    live: NormalizedProductEnvelope | null,
    policy: FreshnessPolicy | null,
    latest: ProductFreshnessAssessment | null,
    source: ProductSource,
    service: ProductMarketingEligibilityService,
    history: ProductMarketingHistory;
  beforeEach(() => {
    snapshot = {
      id: 'saved',
      product: { ...structuredClone(FICTIONAL_PRODUCTS[0]!), retrieved_at: now.toISOString() },
      snapshotHash: 'stored',
      normalizerVersion: 'fixture',
      createdAt: now,
    };
    live = structuredClone(snapshot.product);
    policy = {
      ...createDevelopmentFreshnessPolicy('test'),
      marketing: { stockActions: { low_stock: 'WARN', out_of_stock: 'BLOCK', unknown: 'BLOCK' } },
    };
    latest = null;
    const snapshots = {
      findById: () => Promise.resolve(snapshot),
      create: jest
        .fn<ProductSnapshotRepository['create']>()
        .mockImplementation((v) =>
          Promise.resolve({ ...snapshot, id: 'new-source-version', product: v.product }),
        ),
      findLatestBySku: () => Promise.resolve(snapshot),
    } as ProductSnapshotRepository;
    const assessments = {
      findLatestForSnapshot: () => Promise.resolve(latest),
      create: jest
        .fn<ProductFreshnessAssessmentRepository['create']>()
        .mockImplementation(async (input) => {
          latest = { ...input, id: 'assessment', createdAt: now };
          return latest;
        }),
    } as unknown as ProductFreshnessAssessmentRepository;
    source = {
      adapterName: 'fixture-source',
      getBySku: () => Promise.resolve(live),
      search: () => Promise.resolve({ items: [] }),
    };
    history = { recent: () => Promise.resolve([]) };
    service = new ProductMarketingEligibilityService(
      snapshots,
      { findActivePolicy: () => Promise.resolve(policy) } as unknown as FreshnessPolicyRepository,
      source,
      assessments,
      history,
      { nodeEnvironment: 'test' } as AppConfigService,
      new FakeClock(now),
    );
  });
  const input = { snapshotId: 'saved', action: 'EXPORT' as const, recheck: true };
  function sameFacts() {
    snapshot.product = structuredClone(live!);
  }
  function promotion(end = '2026-11-07T11:00:00.000Z') {
    live!.product.promo_price = '28';
    live!.product.discount = {
      type: 'fixed_amount',
      value: '10',
      calculation_method: 'source price',
      starts_at: '2026-11-07T09:00:00.000Z',
      ends_at: end,
      approval: {
        status: 'approved',
        approved_by: 'Fixture manager',
        approved_at: '2026-11-06T10:00:00.000Z',
        reference: 'Synthetic test authorization',
      },
    };
    sameFacts();
  }
  it('distinguishes source checks from saved source/as-of facts and labels fake sources', async () => {
    const r = await service.check(input, actor);
    expect(r.eligible).toBe(true);
    expect(r.source).toMatchObject({
      status: 'MOCK',
      asOf: now.toISOString(),
      checkedAt: now.toISOString(),
      freshness: 'FRESH',
    });
  });
  it('requires an approved promotion with valid dates and positive source prices', async () => {
    promotion();
    expect(
      (await service.check({ ...input, creationPlan: { purpose: 'PROMOTION' } }, actor)).eligible,
    ).toBe(true);
    delete live!.product.discount!.approval;
    sameFacts();
    expect(
      (await service.check({ ...input, creationPlan: { purpose: 'PROMOTION' } }, actor)).issues,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'PROMOTION_NOT_APPROVED' })]),
    );
  });
  it('blocks expired offers at the exact end boundary without inventing an alternative discount', async () => {
    promotion(now.toISOString());
    const r = await service.check({ ...input, creationPlan: { purpose: 'PROMOTION' } }, actor);
    expect(r.eligible).toBe(false);
    expect(r.issues.find((i) => i.code === 'PROMOTION_NOT_APPROVED')?.alternatives.join()).toMatch(
      /Product spotlight/,
    );
    expect(marketingSafeSnapshot(snapshot, now).product.product.promo_price).toBeUndefined();
    expect(snapshot.product.product.promo_price).toBe('28');
  });
  it('rejects future promotions even when their approval exists', async () => {
    promotion();
    live!.product.discount!.starts_at = '2026-11-07T10:30:00.000Z';
    sameFacts();
    expect(
      (await service.check({ ...input, creationPlan: { purpose: 'PROMOTION' } }, actor)).eligible,
    ).toBe(false);
  });
  it('requires verified notes for note-based education while offering general product education', async () => {
    delete live!.product.fragrance_notes;
    sameFacts();
    const r = await service.check(
      { ...input, creationPlan: { purpose: 'EDUCATIONAL', educationMode: 'FRAGRANCE_NOTES' } },
      actor,
    );
    expect(r.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'NOTES_MISSING' })]),
    );
    expect(
      (
        await service.check(
          { ...input, creationPlan: { purpose: 'EDUCATIONAL', educationMode: 'PRODUCT_FACTS' } },
          actor,
        )
      ).eligible,
    ).toBe(true);
  });
  it('does not call an import or recent snapshot a new arrival', async () => {
    expect(
      (await service.check({ ...input, creationPlan: { purpose: 'NEW_ARRIVAL' } }, actor)).issues,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'ARRIVAL_UNVERIFIED' })]));
  });
  it('blocks changed prices and saves a separate candidate snapshot without modifying approved facts', async () => {
    live!.product.price = '40';
    const r = await service.check(input, actor);
    expect(r.eligible).toBe(false);
    expect(r.changedScopes).toContain('catalogPrice');
    expect(r.currentSnapshotId).toBe('new-source-version');
    expect(snapshot.product.product.price).toBe('38');
    await expect(service.assert(input, actor)).rejects.toThrow(/new revision/);
  });
  it('treats stock changes as material even when the new stock state is allowed with a warning', async () => {
    live!.product.stock_status = 'low_stock';
    const r = await service.check(input, actor);
    expect(r.changedScopes).toContain('stock');
    expect(r.eligible).toBe(false);
    sameFacts();
    const current = await service.check(input, actor);
    expect(current.eligible).toBe(true);
    expect(current.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'STOCK_WARNING', blocking: false })]),
    );
  });
  it('does not invent a low-stock or out-of-stock business policy', async () => {
    policy = createDevelopmentFreshnessPolicy('test');
    live!.product.stock_status = 'low_stock';
    sameFacts();
    expect((await service.check(input, actor)).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'STOCK_POLICY_MISSING' })]),
    );
    live!.product.stock_status = 'out_of_stock';
    sameFacts();
    expect((await service.check(input, actor)).eligible).toBe(false);
  });
  it('honors explicit out-of-stock blocking or an explicit allowed evergreen marketing policy', async () => {
    live!.product.stock_status = 'out_of_stock';
    sameFacts();
    expect((await service.check(input, actor)).eligible).toBe(false);
    policy = { ...policy!, marketing: { stockActions: { out_of_stock: 'ALLOW' } } };
    expect((await service.check(input, actor)).eligible).toBe(true);
  });
  it('requires rechecking stale saved data and does not relabel it after an outage', async () => {
    snapshot.product = { ...snapshot.product, retrieved_at: '2026-11-06T10:00:00.000Z' };
    const cached = await service.check({ ...input, recheck: false }, actor);
    expect(cached.eligible).toBe(false);
    source.getBySku = () => Promise.reject(new Error('Offline'));
    const r = await service.check(input, actor);
    expect(r.source.status).toBe('UNAVAILABLE');
    expect(r.source.asOf).toBe('2026-11-06T10:00:00.000Z');
    expect((await service.check({ ...input, recheck: false }, actor)).source.status).toBe(
      'UNAVAILABLE',
    );
  });
  it('does not call a stale cached response fresh just because the source answered', async () => {
    live = { ...live!, retrieved_at: '2026-11-06T10:00:00.000Z' };
    expect((await service.check(input, actor)).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'SOURCE_DATA_STALE' })]),
    );
  });
  it('requires an approved freshness policy', async () => {
    policy = null;
    expect((await service.check(input, actor)).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'POLICY_MISSING' })]),
    );
  });
  it('keeps intentional campaign repeats advisory and separate from request idempotency', async () => {
    history.recent = () =>
      Promise.resolve([
        {
          postId: 'old',
          purpose: 'PRODUCT_SPOTLIGHT',
          brief: 'Same idea',
          campaignId: 'campaign',
          createdAt: now.toISOString(),
          status: 'APPROVED',
        },
      ]);
    const r = await service.check({ ...input, brief: 'Same idea', campaignId: 'campaign' }, actor);
    expect(r.eligible).toBe(true);
    expect(r.historyWarnings[0]?.code).toBe('CAMPAIGN_REPEAT');
    expect(
      productConceptWarnings(
        [
          {
            postId: 'old',
            purpose: 'PRODUCT_SPOTLIGHT',
            brief: 'SAME idea!',
            campaignId: null,
            createdAt: now.toISOString(),
            status: 'DRAFT',
          },
        ],
        'Same idea',
        'PRODUCT_SPOTLIGHT',
      )[0]?.code,
    ).toBe('CONCEPT_REPEAT');
  });
  it('includes explicit stock rules in immutable policy content hashes', () => {
    const base = createDevelopmentFreshnessPolicy('test');
    expect(
      calculatePolicyVersionHash({ ...base, marketing: { stockActions: { low_stock: 'WARN' } } }),
    ).not.toBe(
      calculatePolicyVersionHash({ ...base, marketing: { stockActions: { low_stock: 'BLOCK' } } }),
    );
  });
  it('does not convert missing inventory data into out of stock or assume inventory tracking', () => {
    expect(deriveStockStatus({ trackInventory: true })).toBe('unknown');
    expect(deriveStockStatus({ stockQuantity: 10 })).toBe('unknown');
    expect(deriveStockStatus({ trackInventory: true, stockQuantity: 0 })).toBe('out_of_stock');
  });
  it('rejects an invented performance benefit in a saved caption before release', async () => {
    const r = await service.check(
      {
        ...input,
        caption: {
          headline: snapshot.product.product.product_name,
          english_caption: 'Lasts for 12 hours.',
          khmer_caption: null,
          cta: 'Contact the store.',
          hashtags: [],
          creative_brief: '',
          facts_used: [],
          warnings: [],
          missing_information: [],
        },
      },
      actor,
    );
    expect(r.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'CAPTION_FACTS_INVALID' })]),
    );
  });
  it('does not treat permission to market unknown stock as proof of availability', async () => {
    live!.product.stock_status = 'unknown';
    sameFacts();
    policy = { ...policy!, marketing: { stockActions: { unknown: 'ALLOW' } } };
    const r = await service.check(
      {
        ...input,
        caption: {
          headline: snapshot.product.product.product_name,
          english_caption: 'In stock now.',
          khmer_caption: null,
          cta: 'Contact the store.',
          hashtags: [],
          creative_brief: '',
          facts_used: [],
          warnings: [],
          missing_information: [],
        },
      },
      actor,
    );
    expect(r.eligible).toBe(false);
    expect(r.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'CAPTION_FACTS_INVALID' })]),
    );
  });
  it('never labels recently cached facts as freshly verified after the latest source check fails', async () => {
    source.getBySku = () => Promise.reject(new Error('Offline'));
    await service.check(input, actor);
    const cached = await service.check({ ...input, recheck: false }, actor);
    expect(cached.source.status).toBe('UNAVAILABLE');
    expect(cached.source.freshness).toBe('SOURCE_UNAVAILABLE');
    expect(cached.eligible).toBe(false);
  });
});
