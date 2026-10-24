import { type Clock } from '@parisian-shopper/common';

import {
  ALL_PRODUCT_DEPENDENCY_SCOPES,
  calculateProductDependencyHashes,
  type ProductDependencyHashes,
  type ProductDependencyScope,
} from '../application/product-snapshot-hash.js';
import {
  type ProductSnapshot,
  resolveSnapshotDependencyHashes,
} from '../application/product-snapshot.repository.js';
import { type FreshnessPolicy } from './freshness-policy.js';
import {
  FreshnessReasonCode,
  FreshnessState,
  RevalidationOutcome,
  SourceAvailability,
} from './freshness-state.js';
import { type NormalizedProductEnvelope } from './product.schema.js';

export interface EvaluateTimeDecayInput {
  readonly snapshot: ProductSnapshot;
  readonly policy: FreshnessPolicy;
  readonly clock: Clock;
}

export interface TimeDecayEvaluationResult {
  readonly freshnessState: FreshnessState;
  readonly reasonCodes: readonly string[];
  readonly elapsedMs: number;
  readonly stockTtlMs: number;
  readonly commercialTtlMs: number;
  readonly hardExpiryMs: number;
  readonly isHardExpired: boolean;
  readonly isCommercialStale: boolean;
  readonly isStockAging: boolean;
  readonly isPromotionExpired: boolean;
  readonly isOutOfStock: boolean;
}

export interface EvaluateRevalidationInput {
  readonly snapshot: ProductSnapshot;
  readonly policy: FreshnessPolicy;
  readonly clock: Clock;
  readonly sourceAvailability: SourceAvailability;
  readonly upstreamProduct?: NormalizedProductEnvelope | null | undefined;
  readonly safeErrorCategory?: string | undefined;
}

export interface RevalidationEvaluationResult {
  readonly freshnessState: FreshnessState;
  readonly revalidationOutcome: RevalidationOutcome;
  readonly sourceAvailability: SourceAvailability;
  readonly reasonCodes: readonly string[];
  readonly changedScopes: readonly ProductDependencyScope[];
  readonly preservedScopes: readonly ProductDependencyScope[];
  readonly isMaterial: boolean;
  readonly newSnapshotNeeded: boolean;
  readonly newHashes?: ProductDependencyHashes | undefined;
  readonly explanation: string;
}

export class FreshnessEvaluator {
  /**
   * Evaluates the time-decay freshness state of an existing stored snapshot against policy TTLs.
   *
   * Boundary Inclusivity Rule:
   * Stored facts remain within their tier while elapsedMs <= ttlMs.
   * When elapsedMs > ttlMs, the boundary is exceeded and transitions to the next degradation state.
   */
  public evaluateTimeDecay(input: EvaluateTimeDecayInput): TimeDecayEvaluationResult {
    const { snapshot, policy, clock } = input;
    const nowMs = clock.nowEpochMs();
    const retrievedAtMs = new Date(snapshot.product.retrieved_at).getTime();
    const elapsedMs = Math.max(0, nowMs - retrievedAtMs);

    const stockTtlMs = policy.ttl.stockSeconds * 1000;
    const commercialTtlMs =
      Math.min(
        policy.ttl.catalogPriceSeconds,
        policy.ttl.campaignPriceSeconds,
        policy.ttl.promotionSeconds,
      ) * 1000;
    const hardExpiryMs = policy.ttl.hardExpiryBoundarySeconds * 1000;

    const isHardExpired = elapsedMs > hardExpiryMs;
    const isCommercialStale = elapsedMs > commercialTtlMs && !isHardExpired;
    const isStockAging = elapsedMs > stockTtlMs && elapsedMs <= commercialTtlMs;

    const discount = snapshot.product.product.discount;
    let isPromotionExpired = false;
    if (discount?.ends_at !== undefined) {
      const endsAtMs = new Date(discount.ends_at).getTime();
      if (nowMs > endsAtMs) {
        isPromotionExpired = true;
      }
    }

    const isOutOfStock = snapshot.product.product.stock_status === 'out_of_stock';

    const reasonCodes: string[] = [];
    let freshnessState: FreshnessState;

    if (isHardExpired) {
      freshnessState = FreshnessState.INVALID;
      reasonCodes.push(FreshnessReasonCode.HARD_EXPIRY_EXCEEDED);
    } else if (isCommercialStale) {
      freshnessState = FreshnessState.STALE;
      reasonCodes.push(FreshnessReasonCode.PRICE_STALE);
    } else if (isStockAging) {
      freshnessState = FreshnessState.AGING;
      reasonCodes.push(FreshnessReasonCode.STOCK_STALE);
    } else {
      freshnessState = FreshnessState.FRESH;
      reasonCodes.push(FreshnessReasonCode.OK_FRESH);
    }

    if (isPromotionExpired) {
      reasonCodes.push(FreshnessReasonCode.PROMOTION_EXPIRED);
    }
    if (isOutOfStock) {
      reasonCodes.push(FreshnessReasonCode.OUT_OF_STOCK);
    }

    return {
      freshnessState,
      reasonCodes,
      elapsedMs,
      stockTtlMs,
      commercialTtlMs,
      hardExpiryMs,
      isHardExpired,
      isCommercialStale,
      isStockAging,
      isPromotionExpired,
      isOutOfStock,
    };
  }

  /**
   * Evaluates the outcome of an active upstream revalidation check.
   */
  public evaluateRevalidation(input: EvaluateRevalidationInput): RevalidationEvaluationResult {
    const { snapshot, policy, clock, sourceAvailability, upstreamProduct, safeErrorCategory } =
      input;
    const timeDecay = this.evaluateTimeDecay({ snapshot, policy, clock });
    const nowMs = clock.nowEpochMs();

    // Case A: Upstream source unavailable
    if (sourceAvailability !== SourceAvailability.AVAILABLE) {
      const reasonCodes: string[] = [
        FreshnessReasonCode.UPSTREAM_UNAVAILABLE,
        safeErrorCategory ?? 'SOURCE_UNAVAILABLE',
      ];

      // If hard expiration is exceeded during an outage, hard expiration takes precedence
      let freshnessState: FreshnessState = FreshnessState.SOURCE_UNAVAILABLE;
      if (timeDecay.isHardExpired) {
        freshnessState = FreshnessState.INVALID;
        reasonCodes.unshift(FreshnessReasonCode.HARD_EXPIRY_EXCEEDED);
      }

      return {
        freshnessState,
        revalidationOutcome: RevalidationOutcome.SOURCE_UNAVAILABLE,
        sourceAvailability,
        reasonCodes,
        changedScopes: [],
        preservedScopes: ALL_PRODUCT_DEPENDENCY_SCOPES,
        isMaterial: false,
        newSnapshotNeeded: false,
        explanation: timeDecay.isHardExpired
          ? 'Upstream source unavailable and snapshot has exceeded hard expiration boundary.'
          : 'Upstream source is temporarily unavailable. Stored snapshot safely preserved.',
      };
    }

    // Case B: Upstream product deleted / discontinued (null response)
    if (upstreamProduct === null || upstreamProduct === undefined) {
      const reasonCodes = [
        FreshnessReasonCode.UPSTREAM_NOT_FOUND,
        FreshnessReasonCode.DISCONTINUED,
      ];
      return {
        freshnessState: FreshnessState.INVALID,
        revalidationOutcome: RevalidationOutcome.MATERIAL_CHANGE,
        sourceAvailability: SourceAvailability.AVAILABLE,
        reasonCodes,
        changedScopes: ALL_PRODUCT_DEPENDENCY_SCOPES,
        preservedScopes: [],
        isMaterial: true,
        newSnapshotNeeded: false,
        explanation: 'Product is no longer available in the upstream catalog.',
      };
    }

    // Case C: Upstream product returned valid envelope
    const existingHashes = resolveSnapshotDependencyHashes(snapshot);
    const newHashes = calculateProductDependencyHashes(upstreamProduct);

    const changedScopes: ProductDependencyScope[] = [];
    const preservedScopes: ProductDependencyScope[] = [];

    for (const scope of ALL_PRODUCT_DEPENDENCY_SCOPES) {
      if (existingHashes[scope] !== newHashes[scope]) {
        changedScopes.push(scope);
      } else {
        preservedScopes.push(scope);
      }
    }

    const isOutOfStock = upstreamProduct.product.stock_status === 'out_of_stock';
    const discount = upstreamProduct.product.discount;
    let isPromotionExpired = false;
    if (discount?.ends_at !== undefined) {
      const endsAtMs = new Date(discount.ends_at).getTime();
      if (nowMs > endsAtMs) {
        isPromotionExpired = true;
      }
    }

    const reasonCodes: string[] = [];
    let revalidationOutcome: RevalidationOutcome = RevalidationOutcome.FRESH;

    if (isOutOfStock) {
      revalidationOutcome = RevalidationOutcome.OUT_OF_STOCK;
      reasonCodes.push(FreshnessReasonCode.OUT_OF_STOCK);
    }

    if (isPromotionExpired) {
      revalidationOutcome = RevalidationOutcome.PROMOTION_EXPIRED;
      reasonCodes.push(FreshnessReasonCode.PROMOTION_EXPIRED);
    }

    const isMaterial = changedScopes.length > 0;

    if (isMaterial) {
      if (!isOutOfStock && !isPromoExpired(isPromotionExpired)) {
        revalidationOutcome = RevalidationOutcome.MATERIAL_CHANGE;
      }
      reasonCodes.push(FreshnessReasonCode.FACT_DRIFT_DETECTED);
      for (const scope of changedScopes) {
        reasonCodes.push(`CHANGED_${scope.toUpperCase()}`);
      }
    } else {
      // No business hash changed; check provider metadata change
      const metadataChanged =
        upstreamProduct.retrieved_at !== snapshot.product.retrieved_at ||
        upstreamProduct.source_updated_at !== snapshot.product.source_updated_at;

      if (metadataChanged && !isOutOfStock && !isPromotionExpired) {
        revalidationOutcome = RevalidationOutcome.NON_MATERIAL_CHANGE;
        reasonCodes.push('METADATA_UPDATED');
      } else if (!isOutOfStock && !isPromotionExpired) {
        revalidationOutcome = RevalidationOutcome.FRESH;
        reasonCodes.push(FreshnessReasonCode.OK_FRESH);
      }
    }

    // Successful recheck resets verified facts to FRESH
    const freshnessState = FreshnessState.FRESH;

    return {
      freshnessState,
      revalidationOutcome,
      sourceAvailability: SourceAvailability.AVAILABLE,
      reasonCodes,
      changedScopes,
      preservedScopes,
      isMaterial,
      newSnapshotNeeded: isMaterial,
      newHashes,
      explanation: isMaterial
        ? `Upstream facts diverged in scopes: ${changedScopes.join(', ')}.`
        : 'Upstream facts verified; all business dependencies remain identical.',
    };
  }
}

function isPromoExpired(flag: boolean): boolean {
  return flag;
}
