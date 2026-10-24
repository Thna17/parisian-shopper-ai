import {
  type ProductDependencyHashes,
  type ProductDependencyScope,
} from './product-snapshot-hash.js';
import { type DependencyManifest } from '../domain/dependency-manifest.js';
import { type FreshnessPolicy } from '../domain/freshness-policy.js';
import {
  FreshnessReasonCode,
  FreshnessState,
  RevalidationOutcome,
  SourceAvailability,
} from '../domain/freshness-state.js';
import { type ProductFreshnessAssessment } from './product-freshness-assessment.repository.js';

export const ProductActionConcept = {
  DRAFT: 'DRAFT',
  FINAL_APPROVAL: 'FINAL_APPROVAL',
  EXPORT: 'EXPORT',
  PUBLISH: 'PUBLISH',
} as const;

export type ProductActionConcept = (typeof ProductActionConcept)[keyof typeof ProductActionConcept];

export interface ProductEligibilityInput {
  readonly manifest: DependencyManifest;
  readonly latestDependencyHashes: ProductDependencyHashes;
  readonly latestAssessment?: ProductFreshnessAssessment | undefined;
  readonly activePolicy?: FreshnessPolicy | undefined;
  readonly action: ProductActionConcept;
}

export interface ProductEligibilityResult {
  readonly isEligible: boolean;
  readonly action: ProductActionConcept;
  readonly reasonCodes: readonly string[];
  readonly violatedScopes: readonly ProductDependencyScope[];
  readonly explanation: string;
}

export class ProductEligibilityEvaluator {
  public evaluate(input: ProductEligibilityInput): ProductEligibilityResult {
    const { manifest, latestDependencyHashes, latestAssessment, activePolicy, action } = input;

    // 1. Publishing is permanently fail-closed pending W61
    if (action === ProductActionConcept.PUBLISH) {
      return {
        isEligible: false,
        action,
        reasonCodes: [FreshnessReasonCode.PUBLISHING_LOCKED_PENDING_W61],
        violatedScopes: [],
        explanation: 'Automated publishing is permanently fail-closed pending W61.',
      };
    }

    // 2. Invalid facts block all actions including DRAFT
    if (latestAssessment?.freshnessState === FreshnessState.INVALID) {
      return {
        isEligible: false,
        action,
        reasonCodes: [FreshnessReasonCode.HARD_EXPIRY_EXCEEDED],
        violatedScopes: [],
        explanation: 'Product facts are invalid or hard-expired. Operation blocked.',
      };
    }

    // 3. Strict fail-closed policy and assessment gates for FINAL_APPROVAL and EXPORT
    if (action === ProductActionConcept.FINAL_APPROVAL || action === ProductActionConcept.EXPORT) {
      if (!activePolicy) {
        return {
          isEligible: false,
          action,
          reasonCodes: [FreshnessReasonCode.FRESHNESS_POLICY_MISSING],
          violatedScopes: [],
          explanation:
            'No active freshness policy is configured. Final approval and export are blocked fail-closed.',
        };
      }

      if (activePolicy.lifecycleState !== 'APPROVED') {
        return {
          isEligible: false,
          action,
          reasonCodes: [FreshnessReasonCode.POLICY_NOT_APPROVED],
          violatedScopes: [],
          explanation:
            'Active freshness policy is not approved. Final approval and export are blocked fail-closed.',
        };
      }

      if (!latestAssessment) {
        return {
          isEligible: false,
          action,
          reasonCodes: [FreshnessReasonCode.ASSESSMENT_MISSING],
          violatedScopes: [],
          explanation:
            'Product snapshot has no freshness assessment. Revalidation is required before final approval or export.',
        };
      }

      if (
        latestAssessment.policyId !== activePolicy.policyId ||
        latestAssessment.policyVersion !== activePolicy.version
      ) {
        return {
          isEligible: false,
          action,
          reasonCodes: [FreshnessReasonCode.POLICY_VERSION_MISMATCH],
          violatedScopes: [],
          explanation:
            'Assessment policy version does not match active policy version. Fresh revalidation is required.',
        };
      }

      if (latestAssessment.sourceAvailability !== SourceAvailability.AVAILABLE) {
        return {
          isEligible: false,
          action,
          reasonCodes: [FreshnessReasonCode.UPSTREAM_UNAVAILABLE],
          violatedScopes: [],
          explanation:
            'Product catalog is temporarily unreachable. Approval and export are blocked fail-closed until connectivity is restored.',
        };
      }

      if (latestAssessment.revalidationOutcome === RevalidationOutcome.OUT_OF_STOCK) {
        return {
          isEligible: false,
          action,
          reasonCodes: [FreshnessReasonCode.OUT_OF_STOCK],
          violatedScopes: [],
          explanation: 'Product is currently out of stock. Approval and export are blocked.',
        };
      }

      if (
        latestAssessment.revalidationOutcome === RevalidationOutcome.PROMOTION_EXPIRED &&
        manifest.requiredScopes.includes('promotion')
      ) {
        return {
          isEligible: false,
          action,
          reasonCodes: [FreshnessReasonCode.PROMOTION_EXPIRED],
          violatedScopes: [],
          explanation: 'Promotion validity has expired. Approval and export are blocked.',
        };
      }

      if (
        latestAssessment.freshnessState === FreshnessState.STALE ||
        latestAssessment.freshnessState === FreshnessState.AGING
      ) {
        const reasonCode =
          latestAssessment.freshnessState === FreshnessState.STALE
            ? FreshnessReasonCode.PRICE_STALE
            : FreshnessReasonCode.STOCK_STALE;
        return {
          isEligible: false,
          action,
          reasonCodes: [reasonCode],
          violatedScopes: [],
          explanation: `Product facts are ${latestAssessment.freshnessState.toLowerCase()}. Synchronous revalidation is required before ${
            action === ProductActionConcept.FINAL_APPROVAL ? 'final approval' : 'export'
          }.`,
        };
      }

      if (latestAssessment.freshnessState !== FreshnessState.FRESH) {
        return {
          isEligible: false,
          action,
          reasonCodes: [latestAssessment.reasonCodes[0] ?? FreshnessReasonCode.PRICE_STALE],
          violatedScopes: [],
          explanation: `Product facts are not fresh (${latestAssessment.freshnessState.toLowerCase()}). Operation blocked.`,
        };
      }
    }

    // 4. Check for hash divergence across manifest requiredScopes
    const violatedScopes: ProductDependencyScope[] = [];
    for (const scope of manifest.requiredScopes) {
      const captured = manifest.capturedHashes[scope];
      const current = latestDependencyHashes[scope];
      if (captured !== undefined && current !== undefined && captured !== current) {
        violatedScopes.push(scope);
      }
    }

    if (violatedScopes.length > 0) {
      if (
        action === ProductActionConcept.FINAL_APPROVAL ||
        action === ProductActionConcept.EXPORT
      ) {
        return {
          isEligible: false,
          action,
          reasonCodes: [
            FreshnessReasonCode.FACT_DRIFT_DETECTED,
            ...violatedScopes.map((s) => `SCOPE_DIVERGED_${s.toUpperCase()}`),
          ],
          violatedScopes,
          explanation: `Product dependencies diverged in scopes: ${violatedScopes.join(
            ', ',
          )}. Re-review is required.`,
        };
      }
    }

    return {
      isEligible: true,
      action,
      reasonCodes: [FreshnessReasonCode.OK_FRESH],
      violatedScopes,
      explanation: 'All required product dependencies are verified, fresh, and eligible.',
    };
  }
}
