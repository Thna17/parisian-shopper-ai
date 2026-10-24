import { describe, expect, it } from '@jest/globals';
import {
  calculatePolicyHash,
  calculatePolicyVersionHash,
  createDevelopmentFreshnessPolicy,
  DEVELOPMENT_TTL_CONFIG,
  PolicyLifecycleState,
} from './freshness-policy.js';

describe('Freshness Policy Domain', () => {
  it('DEVELOPMENT_TTL_CONFIG matches architectural blueprint and specification', () => {
    expect(DEVELOPMENT_TTL_CONFIG.stockSeconds).toBe(300); // 5m
    expect(DEVELOPMENT_TTL_CONFIG.catalogPriceSeconds).toBe(900); // 15m
    expect(DEVELOPMENT_TTL_CONFIG.campaignPriceSeconds).toBe(900); // 15m
    expect(DEVELOPMENT_TTL_CONFIG.promotionSeconds).toBe(900); // 15m
    expect(DEVELOPMENT_TTL_CONFIG.promotionRecheckWindowSeconds).toBe(3600); // 1h
    expect(DEVELOPMENT_TTL_CONFIG.permanentFactsSeconds).toBe(86400); // 24h
    expect(DEVELOPMENT_TTL_CONFIG.hardExpiryBoundarySeconds).toBe(172800); // 48h
  });

  describe('calculatePolicyVersionHash', () => {
    const baseConfig = {
      policyId: 'fragrance-v1',
      version: '1.0',
      ttl: DEVELOPMENT_TTL_CONFIG,
    };

    it('computes deterministic sha256 hash', () => {
      const hash1 = calculatePolicyVersionHash(baseConfig);
      const hash2 = calculatePolicyVersionHash(baseConfig);

      expect(hash1).toHaveLength(64);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
      expect(hash1).toBe(hash2);
    });

    it('APPROVED, DRAFT, and RETIRED activations share the exact same version hash', () => {
      const draftHash = calculatePolicyVersionHash({
        ...baseConfig,
        // @ts-expect-error verifying that activation state fields are ignored if passed
        lifecycleState: PolicyLifecycleState.DRAFT,
      });
      const approvedHash = calculatePolicyVersionHash({
        ...baseConfig,
        // @ts-expect-error verifying that activation state fields are ignored if passed
        lifecycleState: PolicyLifecycleState.APPROVED,
      });
      const retiredHash = calculatePolicyVersionHash({
        ...baseConfig,
        // @ts-expect-error verifying that activation state fields are ignored if passed
        lifecycleState: PolicyLifecycleState.RETIRED,
      });

      expect(draftHash).toBe(approvedHash);
      expect(approvedHash).toBe(retiredHash);
    });

    it('development, test, staging, and production activations share the exact same version hash', () => {
      const devHash = calculatePolicyVersionHash({
        ...baseConfig,
        // @ts-expect-error verifying that environment is ignored if passed
        environment: 'development',
      });
      const testHash = calculatePolicyVersionHash({
        ...baseConfig,
        // @ts-expect-error verifying that environment is ignored if passed
        environment: 'test',
      });
      const stagingHash = calculatePolicyVersionHash({
        ...baseConfig,
        // @ts-expect-error verifying that environment is ignored if passed
        environment: 'staging',
      });
      const prodHash = calculatePolicyVersionHash({
        ...baseConfig,
        // @ts-expect-error verifying that environment is ignored if passed
        environment: 'production',
      });

      expect(devHash).toBe(testHash);
      expect(testHash).toBe(stagingHash);
      expect(stagingHash).toBe(prodHash);
    });

    it('TTL change alters the version hash', () => {
      const originalHash = calculatePolicyVersionHash(baseConfig);
      const modifiedTtlHash = calculatePolicyVersionHash({
        ...baseConfig,
        ttl: {
          ...baseConfig.ttl,
          stockSeconds: 600, // Changed from 300
        },
      });

      expect(modifiedTtlHash).not.toBe(originalHash);
      expect(modifiedTtlHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('policy ID or version change alters the version hash', () => {
      const originalHash = calculatePolicyVersionHash(baseConfig);

      const modifiedIdHash = calculatePolicyVersionHash({
        ...baseConfig,
        policyId: 'fragrance-v2',
      });
      expect(modifiedIdHash).not.toBe(originalHash);

      const modifiedVersionHash = calculatePolicyVersionHash({
        ...baseConfig,
        version: '1.1',
      });
      expect(modifiedVersionHash).not.toBe(originalHash);
    });

    it('calculatePolicyHash is a backward-compatible alias to calculatePolicyVersionHash', () => {
      const versionHash = calculatePolicyVersionHash(baseConfig);
      const legacyAliasHash = calculatePolicyHash(baseConfig);

      expect(legacyAliasHash).toBe(versionHash);
    });
  });

  describe('createDevelopmentFreshnessPolicy', () => {
    it('returns valid benchmark policy where policyHash matches calculatePolicyVersionHash', () => {
      const devPolicy = createDevelopmentFreshnessPolicy('development');
      expect(devPolicy.policyId).toBe('development-v1');
      expect(devPolicy.version).toBe('1.0');
      expect(devPolicy.environment).toBe('development');
      expect(devPolicy.lifecycleState).toBe(PolicyLifecycleState.APPROVED);
      expect(devPolicy.policyHash).toBe(calculatePolicyVersionHash(devPolicy));

      const testPolicy = createDevelopmentFreshnessPolicy('test');
      expect(testPolicy.environment).toBe('test');
      expect(testPolicy.policyHash).toBe(calculatePolicyVersionHash(testPolicy));
      // Same version & TTL config -> same immutable version hash
      expect(testPolicy.policyHash).toBe(devPolicy.policyHash);
    });
  });
});
