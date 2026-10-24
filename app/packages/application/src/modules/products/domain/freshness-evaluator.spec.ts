import { describe, expect, it } from '@jest/globals';
import { FakeClock } from '@parisian-shopper/common';

import {
  PRODUCT_NORMALIZER_VERSION,
  type ProductSnapshot,
} from '../application/product-snapshot.repository.js';
import { calculateProductDependencyHashes } from '../application/product-snapshot-hash.js';
import { FICTIONAL_PRODUCTS } from '../testing/fictional-products.js';
import { FreshnessEvaluator } from './freshness-evaluator.js';
import { createDevelopmentFreshnessPolicy, DEVELOPMENT_TTL_CONFIG } from './freshness-policy.js';
import {
  FreshnessReasonCode,
  FreshnessState,
  RevalidationOutcome,
  SourceAvailability,
} from './freshness-state.js';
import { type NormalizedProductEnvelope } from './product.schema.js';

describe('FreshnessEvaluator (Deterministic TTL Boundary Tests)', () => {
  const evaluator = new FreshnessEvaluator();
  const basePolicy = createDevelopmentFreshnessPolicy('test');
  const baseTime = new Date('2026-10-18T12:00:00.000Z');

  // Policy TTLs:
  // stockSeconds: 300 (300,000 ms)
  // catalogPriceSeconds: 900 (900,000 ms)
  // hardExpiryBoundarySeconds: 172800 (172,800,000 ms / 48h)

  const createTestSnapshot = (retrievedAt: Date = baseTime): ProductSnapshot => {
    const envelope: NormalizedProductEnvelope = {
      ...FICTIONAL_PRODUCTS[0]!,
      retrieved_at: retrievedAt.toISOString(),
      product: {
        ...FICTIONAL_PRODUCTS[0]!.product,
        discount: {
          type: 'fixed_amount',
          value: '10.00',
          calculation_method: 'fixed_amount',
          starts_at: '2026-10-18T10:00:00.000Z',
          ends_at: '2026-10-18T14:00:00.000Z',
        },
      },
    };
    const hashes = calculateProductDependencyHashes(envelope);
    return {
      id: 'snap-eval-001',
      product: envelope,
      snapshotHash: hashes.full,
      dependencyHashes: hashes,
      normalizerVersion: PRODUCT_NORMALIZER_VERSION,
      createdAt: retrievedAt,
    };
  };

  describe('1. Volatile Stock TTL Boundaries (300s / 300,000ms)', () => {
    it('is FRESH 1ms before stock TTL (elapsed = 299,999ms)', () => {
      const clock = new FakeClock(baseTime);
      const snapshot = createTestSnapshot(baseTime);
      clock.advance(299_999);

      const result = evaluator.evaluateTimeDecay({ snapshot, policy: basePolicy, clock });
      expect(result.freshnessState).toBe(FreshnessState.FRESH);
      expect(result.isStockAging).toBe(false);
      expect(result.reasonCodes).toContain(FreshnessReasonCode.OK_FRESH);
    });

    it('is FRESH exactly at stock TTL boundary (elapsed = 300,000ms)', () => {
      const clock = new FakeClock(baseTime);
      const snapshot = createTestSnapshot(baseTime);
      clock.advance(300_000);

      const result = evaluator.evaluateTimeDecay({ snapshot, policy: basePolicy, clock });
      expect(result.freshnessState).toBe(FreshnessState.FRESH);
      expect(result.isStockAging).toBe(false);
      expect(result.reasonCodes).toContain(FreshnessReasonCode.OK_FRESH);
    });

    it('transitions to AGING 1ms after stock TTL (elapsed = 300,001ms)', () => {
      const clock = new FakeClock(baseTime);
      const snapshot = createTestSnapshot(baseTime);
      clock.advance(300_001);

      const result = evaluator.evaluateTimeDecay({ snapshot, policy: basePolicy, clock });
      expect(result.freshnessState).toBe(FreshnessState.AGING);
      expect(result.isStockAging).toBe(true);
      expect(result.reasonCodes).toContain(FreshnessReasonCode.STOCK_STALE);
    });
  });

  describe('2. Commercial Price TTL Boundaries (900s / 900,000ms)', () => {
    it('is AGING 1ms before commercial price TTL (elapsed = 899,999ms)', () => {
      const clock = new FakeClock(baseTime);
      const snapshot = createTestSnapshot(baseTime);
      clock.advance(899_999);

      const result = evaluator.evaluateTimeDecay({ snapshot, policy: basePolicy, clock });
      expect(result.freshnessState).toBe(FreshnessState.AGING);
      expect(result.isCommercialStale).toBe(false);
    });

    it('is AGING exactly at commercial price TTL boundary (elapsed = 900,000ms)', () => {
      const clock = new FakeClock(baseTime);
      const snapshot = createTestSnapshot(baseTime);
      clock.advance(900_000);

      const result = evaluator.evaluateTimeDecay({ snapshot, policy: basePolicy, clock });
      expect(result.freshnessState).toBe(FreshnessState.AGING);
      expect(result.isCommercialStale).toBe(false);
    });

    it('transitions to STALE 1ms after commercial price TTL (elapsed = 900,001ms)', () => {
      const clock = new FakeClock(baseTime);
      const snapshot = createTestSnapshot(baseTime);
      clock.advance(900_001);

      const result = evaluator.evaluateTimeDecay({ snapshot, policy: basePolicy, clock });
      expect(result.freshnessState).toBe(FreshnessState.STALE);
      expect(result.isCommercialStale).toBe(true);
      expect(result.reasonCodes).toContain(FreshnessReasonCode.PRICE_STALE);
    });
  });

  describe('3. Hard Expiry Cap Boundaries (48h / 172,800,000ms)', () => {
    const hardExpiryMs = DEVELOPMENT_TTL_CONFIG.hardExpiryBoundarySeconds * 1000;

    it('is STALE 1ms before hard expiration (elapsed = hardExpiryMs - 1ms)', () => {
      const clock = new FakeClock(baseTime);
      const snapshot = createTestSnapshot(baseTime);
      clock.advance(hardExpiryMs - 1);

      const result = evaluator.evaluateTimeDecay({ snapshot, policy: basePolicy, clock });
      expect(result.freshnessState).toBe(FreshnessState.STALE);
      expect(result.isHardExpired).toBe(false);
    });

    it('is STALE exactly at hard expiration boundary (elapsed = hardExpiryMs)', () => {
      const clock = new FakeClock(baseTime);
      const snapshot = createTestSnapshot(baseTime);
      clock.advance(hardExpiryMs);

      const result = evaluator.evaluateTimeDecay({ snapshot, policy: basePolicy, clock });
      expect(result.freshnessState).toBe(FreshnessState.STALE);
      expect(result.isHardExpired).toBe(false);
    });

    it('transitions to INVALID 1ms after hard expiration (elapsed = hardExpiryMs + 1ms)', () => {
      const clock = new FakeClock(baseTime);
      const snapshot = createTestSnapshot(baseTime);
      clock.advance(hardExpiryMs + 1);

      const result = evaluator.evaluateTimeDecay({ snapshot, policy: basePolicy, clock });
      expect(result.freshnessState).toBe(FreshnessState.INVALID);
      expect(result.isHardExpired).toBe(true);
      expect(result.reasonCodes).toContain(FreshnessReasonCode.HARD_EXPIRY_EXCEEDED);
    });
  });

  describe('4. Promotion Window Boundaries', () => {
    // Promo: starts_at = 10:00:00, ends_at = 14:00:00 (baseTime = 12:00:00)
    it('is active within promotion window', () => {
      const clock = new FakeClock('2026-10-18T13:59:59.999Z'); // 1ms before end
      const snapshot = createTestSnapshot(baseTime);

      const result = evaluator.evaluateTimeDecay({ snapshot, policy: basePolicy, clock });
      expect(result.isPromotionExpired).toBe(false);
    });

    it('is active exactly at promotion end boundary (14:00:00.000Z)', () => {
      const clock = new FakeClock('2026-10-18T14:00:00.000Z');
      const snapshot = createTestSnapshot(baseTime);

      const result = evaluator.evaluateTimeDecay({ snapshot, policy: basePolicy, clock });
      expect(result.isPromotionExpired).toBe(false);
    });

    it('detects PROMOTION_EXPIRED 1ms after promotion end (14:00:00.001Z)', () => {
      const clock = new FakeClock('2026-10-18T14:00:00.001Z');
      const snapshot = createTestSnapshot(baseTime);

      const result = evaluator.evaluateTimeDecay({ snapshot, policy: basePolicy, clock });
      expect(result.isPromotionExpired).toBe(true);
      expect(result.reasonCodes).toContain(FreshnessReasonCode.PROMOTION_EXPIRED);
    });
  });

  describe('5. Provider Outage Before vs After Hard Expiry & Recovery', () => {
    const hardExpiryMs = DEVELOPMENT_TTL_CONFIG.hardExpiryBoundarySeconds * 1000;

    it('preserves snapshot as SOURCE_UNAVAILABLE during provider outage before hard expiry', () => {
      const clock = new FakeClock(baseTime);
      const snapshot = createTestSnapshot(baseTime);
      clock.advance(60_000); // 1 minute elapsed

      const result = evaluator.evaluateRevalidation({
        snapshot,
        policy: basePolicy,
        clock,
        sourceAvailability: SourceAvailability.UNREACHABLE,
        safeErrorCategory: 'NETWORK_TIMEOUT',
      });

      expect(result.freshnessState).toBe(FreshnessState.SOURCE_UNAVAILABLE);
      expect(result.revalidationOutcome).toBe(RevalidationOutcome.SOURCE_UNAVAILABLE);
      expect(result.sourceAvailability).toBe(SourceAvailability.UNREACHABLE);
      expect(result.reasonCodes).toContain(FreshnessReasonCode.UPSTREAM_UNAVAILABLE);
      expect(result.newSnapshotNeeded).toBe(false);
    });

    it('marks snapshot INVALID when outage occurs after hard expiration boundary', () => {
      const clock = new FakeClock(baseTime);
      const snapshot = createTestSnapshot(baseTime);
      clock.advance(hardExpiryMs + 5000); // 5 seconds past hard expiry

      const result = evaluator.evaluateRevalidation({
        snapshot,
        policy: basePolicy,
        clock,
        sourceAvailability: SourceAvailability.UNREACHABLE,
        safeErrorCategory: 'NETWORK_TIMEOUT',
      });

      expect(result.freshnessState).toBe(FreshnessState.INVALID);
      expect(result.revalidationOutcome).toBe(RevalidationOutcome.SOURCE_UNAVAILABLE);
      expect(result.reasonCodes).toContain(FreshnessReasonCode.HARD_EXPIRY_EXCEEDED);
      expect(result.reasonCodes).toContain(FreshnessReasonCode.UPSTREAM_UNAVAILABLE);
    });

    it('resets to FRESH upon successful recovery following provider outage', () => {
      const clock = new FakeClock(baseTime);
      const snapshot = createTestSnapshot(baseTime);
      clock.advance(60_000);

      // 1. Outage
      const outageResult = evaluator.evaluateRevalidation({
        snapshot,
        policy: basePolicy,
        clock,
        sourceAvailability: SourceAvailability.UNREACHABLE,
      });
      expect(outageResult.freshnessState).toBe(FreshnessState.SOURCE_UNAVAILABLE);

      // 2. Recovery: provider responds with identical facts
      const recoveredEnvelope: NormalizedProductEnvelope = {
        ...snapshot.product,
        retrieved_at: clock.now().toISOString(),
      };

      const recoveryResult = evaluator.evaluateRevalidation({
        snapshot,
        policy: basePolicy,
        clock,
        sourceAvailability: SourceAvailability.AVAILABLE,
        upstreamProduct: recoveredEnvelope,
      });

      expect(recoveryResult.freshnessState).toBe(FreshnessState.FRESH);
      expect(recoveryResult.revalidationOutcome).toBe(RevalidationOutcome.NON_MATERIAL_CHANGE);
      expect(recoveryResult.reasonCodes).toContain('METADATA_UPDATED');
    });
  });
});
