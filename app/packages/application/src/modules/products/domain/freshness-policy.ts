import { createHash } from 'node:crypto';
import { canonicalJson } from '../application/product-snapshot-hash.js';

export const PolicyLifecycleState = {
  DRAFT: 'DRAFT',
  APPROVED: 'APPROVED',
  RETIRED: 'RETIRED',
} as const;

export type PolicyLifecycleState = (typeof PolicyLifecycleState)[keyof typeof PolicyLifecycleState];

export interface FreshnessPolicyTtlConfig {
  readonly stockSeconds: number;
  readonly catalogPriceSeconds: number;
  readonly campaignPriceSeconds: number;
  readonly promotionSeconds: number;
  readonly promotionRecheckWindowSeconds: number;
  readonly permanentFactsSeconds: number;
  readonly hardExpiryBoundarySeconds: number;
}

export interface FreshnessPolicy {
  readonly id?: string | undefined;
  readonly policyId: string;
  readonly version: string;
  readonly environment: string;
  readonly lifecycleState: PolicyLifecycleState;
  readonly ttl: FreshnessPolicyTtlConfig;
  readonly effectiveAt: Date;
  readonly policyHash: string;
}

export interface PolicyVersionInput {
  readonly policyId: string;
  readonly version: string;
  readonly ttl: FreshnessPolicyTtlConfig;
}

export function calculatePolicyVersionHash(input: PolicyVersionInput): string {
  const payload = {
    policy_id: input.policyId,
    ttl: {
      campaign_price_seconds: input.ttl.campaignPriceSeconds,
      catalog_price_seconds: input.ttl.catalogPriceSeconds,
      hard_expiry_boundary_seconds: input.ttl.hardExpiryBoundarySeconds,
      permanent_facts_seconds: input.ttl.permanentFactsSeconds,
      promotion_recheck_window_seconds: input.ttl.promotionRecheckWindowSeconds,
      promotion_seconds: input.ttl.promotionSeconds,
      stock_seconds: input.ttl.stockSeconds,
    },
    version: input.version,
  };
  return createHash('sha256').update(canonicalJson(payload), 'utf8').digest('hex');
}

/**
 * @deprecated Use calculatePolicyVersionHash. Decoupled from environment and lifecycleState.
 * Retained as an explicitly documented alias for backward compatibility.
 */
export function calculatePolicyHash(input: PolicyVersionInput): string {
  return calculatePolicyVersionHash(input);
}

/**
 * Recommended development and test benchmark policy: development-v1.
 * Stock: 5m (300s)
 * Catalog & Campaign Price: 15m (900s)
 * Promotion Details: 15m (900s)
 * Promotion Validity Recheck Window: 1h (3600s)
 * Permanent Facts: 24h (86400s)
 * Hard Expiration Cap: 48h (172800s)
 */
export const DEVELOPMENT_TTL_CONFIG: FreshnessPolicyTtlConfig = Object.freeze({
  stockSeconds: 300,
  catalogPriceSeconds: 900,
  campaignPriceSeconds: 900,
  promotionSeconds: 900,
  promotionRecheckWindowSeconds: 3600,
  permanentFactsSeconds: 86400,
  hardExpiryBoundarySeconds: 172800,
});

export function createDevelopmentFreshnessPolicy(
  environment: 'development' | 'test' = 'development',
): FreshnessPolicy {
  const base = {
    policyId: 'development-v1',
    version: '1.0',
    environment,
    lifecycleState: PolicyLifecycleState.APPROVED,
    ttl: DEVELOPMENT_TTL_CONFIG,
    effectiveAt: new Date('2026-10-18T00:00:00.000Z'),
  };
  return {
    ...base,
    policyHash: calculatePolicyVersionHash(base),
  };
}

export const FRESHNESS_POLICY_REPOSITORY = Symbol('FRESHNESS_POLICY_REPOSITORY');

export interface FreshnessPolicyRepository {
  findActivePolicy(environment: string, evalTime?: Date): Promise<FreshnessPolicy | null>;
  findByPolicyId(policyId: string, version?: string): Promise<FreshnessPolicy | null>;
  create(policy: FreshnessPolicy): Promise<FreshnessPolicy>;
}
