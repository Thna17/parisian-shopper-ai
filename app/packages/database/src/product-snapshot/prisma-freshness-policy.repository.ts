import { Injectable, Optional } from '@nestjs/common';
import {
  calculatePolicyVersionHash,
  createDevelopmentFreshnessPolicy,
  type FreshnessPolicy,
  type FreshnessPolicyRepository,
} from '@parisian-shopper/application';
import { type Clock, SystemClock } from '@parisian-shopper/common';
import {
  type FreshnessPolicyActivation as PrismaPolicyActivation,
  type FreshnessPolicyVersion as PrismaPolicyVersion,
} from '@prisma/client';

import { PrismaService } from '../prisma.service.js';

@Injectable()
export class PrismaFreshnessPolicyRepository implements FreshnessPolicyRepository {
  private readonly clock: Clock;

  public constructor(
    private readonly prisma: PrismaService,
    @Optional() clock?: Clock,
  ) {
    this.clock = clock ?? new SystemClock();
  }

  public async findActivePolicy(
    environment: string,
    evalTime?: Date,
  ): Promise<FreshnessPolicy | null> {
    const effectiveTime = evalTime ?? this.clock.now();

    // 1. Query the latest activation at or before effectiveTime for this environment,
    // ordered monotonically by activatedAt DESC, sequence DESC.
    const activation = await this.prisma.freshnessPolicyActivation.findFirst({
      where: {
        environment,
        activatedAt: {
          lte: effectiveTime,
        },
      },
      orderBy: [{ activatedAt: 'desc' }, { sequence: 'desc' }],
      include: { policyVersion: true },
    });

    if (activation) {
      if (activation.lifecycleState === 'APPROVED') {
        return toDomain(activation.policyVersion, activation);
      }
      // If the latest activation at or before effectiveTime is RETIRED or DRAFT, no policy is active
      return null;
    }

    // 2. If no activation exists at or before effectiveTime, check if ANY activation history
    // exists in the database for this specific environment (e.g. future-dated).
    const envActivationCount = await this.prisma.freshnessPolicyActivation.count({
      where: { environment },
    });
    if (envActivationCount > 0) {
      // An explicit activation exists for this environment, so do NOT bypass it with a fallback
      return null;
    }

    // 3. In development and test, if this specific environment has NO activation history in the database,
    // provide the approved development benchmark policy.
    // An unrelated environment's policy (e.g. staging or production) does NOT disable this fallback!
    if (environment === 'development' || environment === 'test') {
      return createDevelopmentFreshnessPolicy(environment);
    }

    // Production and staging strictly fail closed if no approved policy exists in DB
    return null;
  }

  public async findByPolicyId(policyId: string, version?: string): Promise<FreshnessPolicy | null> {
    const policyVersion = await this.prisma.freshnessPolicyVersion.findFirst({
      where: {
        policyId,
        ...(version ? { version } : {}),
      },
      include: {
        activations: {
          orderBy: [{ activatedAt: 'desc' }, { sequence: 'desc' }],
          take: 1,
        },
      },
    });

    if (policyVersion) {
      const latestActivation = policyVersion.activations[0];
      if (latestActivation) {
        return toDomain(policyVersion, latestActivation);
      }
      // If version exists but has never been activated, represent strictly as DRAFT with no active environment
      return {
        id: policyVersion.id,
        policyId: policyVersion.policyId,
        version: policyVersion.version,
        environment: '',
        lifecycleState: 'DRAFT',
        ttl: {
          stockSeconds: policyVersion.stockTtlSeconds,
          catalogPriceSeconds: policyVersion.catalogPriceTtlSeconds,
          campaignPriceSeconds: policyVersion.campaignPriceTtlSeconds,
          promotionSeconds: policyVersion.promotionTtlSeconds,
          promotionRecheckWindowSeconds: policyVersion.promotionRecheckWindowSeconds,
          permanentFactsSeconds: policyVersion.permanentFactsTtlSeconds,
          hardExpiryBoundarySeconds: policyVersion.hardExpiryBoundarySeconds,
        },
        effectiveAt: policyVersion.createdAt,
        policyHash: policyVersion.policyHash,
      };
    }

    if (policyId === 'development-v1' && (!version || version === '1.0')) {
      const devActivationCount = await this.prisma.freshnessPolicyActivation.count({
        where: { environment: 'development' },
      });
      if (devActivationCount === 0) {
        return createDevelopmentFreshnessPolicy('development');
      }
    }

    return null;
  }

  public async create(policy: FreshnessPolicy): Promise<FreshnessPolicy> {
    const expectedHash = calculatePolicyVersionHash(policy);
    if (policy.policyHash && policy.policyHash !== expectedHash) {
      throw new Error(
        `Invalid policy hash for TTL configuration: expected ${expectedHash}, received ${policy.policyHash}`,
      );
    }
    const resolvedHash = policy.policyHash || expectedHash;

    return this.prisma.$transaction(async (tx) => {
      // 1. Find or create the immutable policy version
      const existingVersion = await tx.freshnessPolicyVersion.findUnique({
        where: {
          policyId_version: {
            policyId: policy.policyId,
            version: policy.version,
          },
        },
      });

      let policyVersion: PrismaPolicyVersion;
      if (existingVersion) {
        if (existingVersion.policyHash !== resolvedHash) {
          throw new Error(
            `Conflict: FreshnessPolicyVersion ${policy.policyId}:${policy.version} already exists with differing hash (${existingVersion.policyHash} !== ${resolvedHash})`,
          );
        }
        policyVersion = existingVersion;
      } else {
        policyVersion = await tx.freshnessPolicyVersion.create({
          data: {
            policyId: policy.policyId,
            version: policy.version,
            stockTtlSeconds: policy.ttl.stockSeconds,
            catalogPriceTtlSeconds: policy.ttl.catalogPriceSeconds,
            campaignPriceTtlSeconds: policy.ttl.campaignPriceSeconds,
            promotionTtlSeconds: policy.ttl.promotionSeconds,
            promotionRecheckWindowSeconds: policy.ttl.promotionRecheckWindowSeconds,
            permanentFactsTtlSeconds: policy.ttl.permanentFactsSeconds,
            hardExpiryBoundarySeconds: policy.ttl.hardExpiryBoundarySeconds,
            policyHash: resolvedHash,
          },
        });
      }

      // 2. Append activation record to ledger
      const activation = await tx.freshnessPolicyActivation.create({
        data: {
          policyVersionId: policyVersion.id,
          environment: policy.environment,
          lifecycleState: policy.lifecycleState,
          activatedAt: policy.effectiveAt,
        },
      });

      return toDomain(policyVersion, activation);
    });
  }
}

function toDomain(
  versionRecord: PrismaPolicyVersion,
  activationRecord: PrismaPolicyActivation,
): FreshnessPolicy {
  return {
    id: versionRecord.id,
    policyId: versionRecord.policyId,
    version: versionRecord.version,
    environment: activationRecord.environment,
    lifecycleState: activationRecord.lifecycleState,
    ttl: {
      stockSeconds: versionRecord.stockTtlSeconds,
      catalogPriceSeconds: versionRecord.catalogPriceTtlSeconds,
      campaignPriceSeconds: versionRecord.campaignPriceTtlSeconds,
      promotionSeconds: versionRecord.promotionTtlSeconds,
      promotionRecheckWindowSeconds: versionRecord.promotionRecheckWindowSeconds,
      permanentFactsSeconds: versionRecord.permanentFactsTtlSeconds,
      hardExpiryBoundarySeconds: versionRecord.hardExpiryBoundarySeconds,
    },
    effectiveAt: activationRecord.activatedAt,
    policyHash: versionRecord.policyHash,
  };
}
