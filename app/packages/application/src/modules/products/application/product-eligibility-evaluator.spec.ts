import { describe, expect, it } from '@jest/globals';
import { ArtifactType } from '../domain/dependency-manifest.js';
import type { DependencyManifest } from '../domain/dependency-manifest.js';
import {
  PolicyLifecycleState,
  createDevelopmentFreshnessPolicy,
  type FreshnessPolicy,
} from '../domain/freshness-policy.js';
import {
  FreshnessReasonCode,
  FreshnessState,
  RevalidationOutcome,
  SourceAvailability,
} from '../domain/freshness-state.js';
import {
  ProductActionConcept,
  ProductEligibilityEvaluator,
} from './product-eligibility-evaluator.js';
import type { ProductDependencyHashes } from './product-snapshot-hash.js';
import type { ProductFreshnessAssessment } from './product-freshness-assessment.repository.js';

describe('ProductEligibilityEvaluator', () => {
  const evaluator = new ProductEligibilityEvaluator();
  const defaultPolicy = createDevelopmentFreshnessPolicy('test');

  const baseHashes: ProductDependencyHashes = {
    full: 'f'.repeat(64),
    catalogPrice: '1'.repeat(64),
    campaignPrice: '2'.repeat(64),
    stock: '3'.repeat(64),
    promotion: '4'.repeat(64),
    permanentFacts: '5'.repeat(64),
    visualAssets: '6'.repeat(64),
  };

  const createManifest = (
    requiredScopes: DependencyManifest['requiredScopes'] = [
      'catalogPrice',
      'campaignPrice',
      'stock',
      'promotion',
      'permanentFacts',
      'visualAssets',
    ],
    overrides?: Partial<DependencyManifest>,
  ): DependencyManifest => ({
    artifactType: ArtifactType.VISUAL_POSTER,
    artifactId: 'poster-123',
    productSnapshotId: 'snap-1',
    requiredScopes,
    capturedHashes: { ...baseHashes },
    ...overrides,
  });

  const createAssessment = (
    overrides?: Partial<ProductFreshnessAssessment>,
  ): ProductFreshnessAssessment => ({
    id: 'asmt-1',
    snapshotId: 'snap-1',
    evaluatedAt: new Date('2026-10-18T10:05:00.000Z'),
    policyId: 'development-v1',
    policyVersion: '1.0',
    freshnessState: FreshnessState.FRESH,
    revalidationOutcome: RevalidationOutcome.FRESH,
    sourceAvailability: SourceAvailability.AVAILABLE,
    reasonCodes: [FreshnessReasonCode.OK_FRESH],
    evidence: {},
    createdAt: new Date('2026-10-18T10:05:00.000Z'),
    ...overrides,
  });

  describe('1. Fail-closed Publishing Gate', () => {
    it('permanently blocks PUBLISH action regardless of freshness or manifest', () => {
      const manifest = createManifest();
      const assessment = createAssessment();

      const result = evaluator.evaluate({
        manifest,
        latestDependencyHashes: baseHashes,
        latestAssessment: assessment,
        activePolicy: defaultPolicy,
        action: ProductActionConcept.PUBLISH,
      });

      expect(result.isEligible).toBe(false);
      expect(result.action).toBe(ProductActionConcept.PUBLISH);
      expect(result.reasonCodes).toContain('PUBLISHING_LOCKED_PENDING_W61');
    });
  });

  describe('2. Scope-based Drift Detection', () => {
    const scopes: Array<keyof ProductDependencyHashes> = [
      'catalogPrice',
      'campaignPrice',
      'stock',
      'promotion',
      'permanentFacts',
      'visualAssets',
    ];

    scopes.forEach((scope) => {
      if (scope === 'full') return;

      it(`detects drift in scope: ${scope} and blocks FINAL_APPROVAL and EXPORT`, () => {
        const manifest = createManifest([scope]);
        const changedHashes = {
          ...baseHashes,
          [scope]: 'a'.repeat(64),
        };
        const assessment = createAssessment();

        // FINAL_APPROVAL blocked
        const approvalResult = evaluator.evaluate({
          manifest,
          latestDependencyHashes: changedHashes,
          latestAssessment: assessment,
          activePolicy: defaultPolicy,
          action: ProductActionConcept.FINAL_APPROVAL,
        });
        expect(approvalResult.isEligible).toBe(false);
        expect(approvalResult.violatedScopes).toContain(scope);
        expect(approvalResult.reasonCodes).toContain(FreshnessReasonCode.FACT_DRIFT_DETECTED);

        // EXPORT blocked
        const exportResult = evaluator.evaluate({
          manifest,
          latestDependencyHashes: changedHashes,
          latestAssessment: assessment,
          activePolicy: defaultPolicy,
          action: ProductActionConcept.EXPORT,
        });
        expect(exportResult.isEligible).toBe(false);
        expect(exportResult.violatedScopes).toContain(scope);

        // DRAFT permitted
        const draftResult = evaluator.evaluate({
          manifest,
          latestDependencyHashes: changedHashes,
          latestAssessment: assessment,
          activePolicy: defaultPolicy,
          action: ProductActionConcept.DRAFT,
        });
        expect(draftResult.isEligible).toBe(true);
      });
    });

    it('ignores drift in unrequired scopes', () => {
      // Manifest only requires catalogPrice
      const manifest = createManifest(['catalogPrice']);
      const changedHashes = {
        ...baseHashes,
        visualAssets: '9'.repeat(64), // changed, but not in requiredScopes
      };
      const assessment = createAssessment();

      const result = evaluator.evaluate({
        manifest,
        latestDependencyHashes: changedHashes,
        latestAssessment: assessment,
        activePolicy: defaultPolicy,
        action: ProductActionConcept.FINAL_APPROVAL,
      });

      expect(result.isEligible).toBe(true);
      expect(result.violatedScopes).toHaveLength(0);
    });
  });

  describe('3. Freshness Assessment Gates', () => {
    it('blocks FINAL_APPROVAL and EXPORT if product is OUT_OF_STOCK', () => {
      const manifest = createManifest();
      const assessment = createAssessment({
        revalidationOutcome: RevalidationOutcome.OUT_OF_STOCK,
        reasonCodes: [FreshnessReasonCode.OUT_OF_STOCK],
      });

      const approval = evaluator.evaluate({
        manifest,
        latestDependencyHashes: baseHashes,
        latestAssessment: assessment,
        activePolicy: defaultPolicy,
        action: ProductActionConcept.FINAL_APPROVAL,
      });
      expect(approval.isEligible).toBe(false);
      expect(approval.reasonCodes).toContain(FreshnessReasonCode.OUT_OF_STOCK);

      const exp = evaluator.evaluate({
        manifest,
        latestDependencyHashes: baseHashes,
        latestAssessment: assessment,
        activePolicy: defaultPolicy,
        action: ProductActionConcept.EXPORT,
      });
      expect(exp.isEligible).toBe(false);
    });

    it('blocks FINAL_APPROVAL and EXPORT if PROMOTION_EXPIRED and manifest requires promotion', () => {
      const manifestWithPromo = createManifest(['promotion']);
      const manifestWithoutPromo = createManifest(['stock']);
      const assessment = createAssessment({
        revalidationOutcome: RevalidationOutcome.PROMOTION_EXPIRED,
        reasonCodes: [FreshnessReasonCode.PROMOTION_EXPIRED],
      });

      const blockedApproval = evaluator.evaluate({
        manifest: manifestWithPromo,
        latestDependencyHashes: baseHashes,
        latestAssessment: assessment,
        activePolicy: defaultPolicy,
        action: ProductActionConcept.FINAL_APPROVAL,
      });
      expect(blockedApproval.isEligible).toBe(false);
      expect(blockedApproval.reasonCodes).toContain(FreshnessReasonCode.PROMOTION_EXPIRED);

      const allowedApproval = evaluator.evaluate({
        manifest: manifestWithoutPromo,
        latestDependencyHashes: baseHashes,
        latestAssessment: assessment,
        activePolicy: defaultPolicy,
        action: ProductActionConcept.FINAL_APPROVAL,
      });
      expect(allowedApproval.isEligible).toBe(true);
    });

    it('blocks FINAL_APPROVAL and EXPORT fail-closed when SOURCE_UNAVAILABLE', () => {
      const manifest = createManifest();
      const assessment = createAssessment({
        freshnessState: FreshnessState.SOURCE_UNAVAILABLE,
        revalidationOutcome: RevalidationOutcome.SOURCE_UNAVAILABLE,
        sourceAvailability: SourceAvailability.UNREACHABLE,
        reasonCodes: [FreshnessReasonCode.UPSTREAM_UNAVAILABLE],
      });

      const approval = evaluator.evaluate({
        manifest,
        latestDependencyHashes: baseHashes,
        latestAssessment: assessment,
        activePolicy: defaultPolicy,
        action: ProductActionConcept.FINAL_APPROVAL,
      });
      expect(approval.isEligible).toBe(false);
      expect(approval.reasonCodes).toContain(FreshnessReasonCode.UPSTREAM_UNAVAILABLE);
    });

    it('blocks FINAL_APPROVAL and EXPORT when AGING or STALE, but permits DRAFT', () => {
      const manifest = createManifest();
      const agingAssessment = createAssessment({
        freshnessState: FreshnessState.AGING,
      });

      const agingApproval = evaluator.evaluate({
        manifest,
        latestDependencyHashes: baseHashes,
        latestAssessment: agingAssessment,
        activePolicy: defaultPolicy,
        action: ProductActionConcept.FINAL_APPROVAL,
      });
      expect(agingApproval.isEligible).toBe(false);

      const agingDraft = evaluator.evaluate({
        manifest,
        latestDependencyHashes: baseHashes,
        latestAssessment: agingAssessment,
        activePolicy: defaultPolicy,
        action: ProductActionConcept.DRAFT,
      });
      expect(agingDraft.isEligible).toBe(true);

      const staleAssessment = createAssessment({
        freshnessState: FreshnessState.STALE,
      });

      const staleApproval = evaluator.evaluate({
        manifest,
        latestDependencyHashes: baseHashes,
        latestAssessment: staleAssessment,
        activePolicy: defaultPolicy,
        action: ProductActionConcept.FINAL_APPROVAL,
      });
      expect(staleApproval.isEligible).toBe(false);

      const staleDraft = evaluator.evaluate({
        manifest,
        latestDependencyHashes: baseHashes,
        latestAssessment: staleAssessment,
        activePolicy: defaultPolicy,
        action: ProductActionConcept.DRAFT,
      });
      expect(staleDraft.isEligible).toBe(true);
    });

    it('blocks all actions including DRAFT when freshnessState is INVALID', () => {
      const manifest = createManifest();
      const invalidAssessment = createAssessment({
        freshnessState: FreshnessState.INVALID,
        reasonCodes: [FreshnessReasonCode.HARD_EXPIRY_EXCEEDED],
      });

      const draftResult = evaluator.evaluate({
        manifest,
        latestDependencyHashes: baseHashes,
        latestAssessment: invalidAssessment,
        activePolicy: defaultPolicy,
        action: ProductActionConcept.DRAFT,
      });
      expect(draftResult.isEligible).toBe(false);
      expect(draftResult.reasonCodes).toContain(FreshnessReasonCode.HARD_EXPIRY_EXCEEDED);
    });
  });

  describe('4. Fully Fresh and Verified', () => {
    it('permits DRAFT, FINAL_APPROVAL, and EXPORT when completely fresh', () => {
      const manifest = createManifest();
      const freshAssessment = createAssessment();

      for (const action of [
        ProductActionConcept.DRAFT,
        ProductActionConcept.FINAL_APPROVAL,
        ProductActionConcept.EXPORT,
      ]) {
        const result = evaluator.evaluate({
          manifest,
          latestDependencyHashes: baseHashes,
          latestAssessment: freshAssessment,
          activePolicy: defaultPolicy,
          action,
        });
        expect(result.isEligible).toBe(true);
        expect(result.reasonCodes).toContain(FreshnessReasonCode.OK_FRESH);
      }
    });
  });

  describe('5. Policy and Assessment Gate Enforcement', () => {
    it('blocks FINAL_APPROVAL and EXPORT when activePolicy is missing', () => {
      const resultApproval = evaluator.evaluate({
        manifest: createManifest(),
        latestDependencyHashes: baseHashes,
        latestAssessment: createAssessment(),
        activePolicy: undefined,
        action: ProductActionConcept.FINAL_APPROVAL,
      });
      expect(resultApproval.isEligible).toBe(false);
      expect(resultApproval.reasonCodes).toContain(FreshnessReasonCode.FRESHNESS_POLICY_MISSING);

      const resultExport = evaluator.evaluate({
        manifest: createManifest(),
        latestDependencyHashes: baseHashes,
        latestAssessment: createAssessment(),
        activePolicy: undefined,
        action: ProductActionConcept.EXPORT,
      });
      expect(resultExport.isEligible).toBe(false);
      expect(resultExport.reasonCodes).toContain(FreshnessReasonCode.FRESHNESS_POLICY_MISSING);

      // DRAFT is allowed even when activePolicy is not set (unless facts are proven INVALID)
      const resultDraft = evaluator.evaluate({
        manifest: createManifest(),
        latestDependencyHashes: baseHashes,
        latestAssessment: createAssessment(),
        activePolicy: undefined,
        action: ProductActionConcept.DRAFT,
      });
      expect(resultDraft.isEligible).toBe(true);
    });

    it('blocks FINAL_APPROVAL and EXPORT when activePolicy is not APPROVED', () => {
      const draftPolicy: FreshnessPolicy = {
        ...defaultPolicy,
        lifecycleState: PolicyLifecycleState.DRAFT,
      };

      const resultApproval = evaluator.evaluate({
        manifest: createManifest(),
        latestDependencyHashes: baseHashes,
        latestAssessment: createAssessment(),
        activePolicy: draftPolicy,
        action: ProductActionConcept.FINAL_APPROVAL,
      });
      expect(resultApproval.isEligible).toBe(false);
      expect(resultApproval.reasonCodes).toContain(FreshnessReasonCode.POLICY_NOT_APPROVED);

      const retiredPolicy: FreshnessPolicy = {
        ...defaultPolicy,
        lifecycleState: PolicyLifecycleState.RETIRED,
      };
      const resultExport = evaluator.evaluate({
        manifest: createManifest(),
        latestDependencyHashes: baseHashes,
        latestAssessment: createAssessment(),
        activePolicy: retiredPolicy,
        action: ProductActionConcept.EXPORT,
      });
      expect(resultExport.isEligible).toBe(false);
      expect(resultExport.reasonCodes).toContain(FreshnessReasonCode.POLICY_NOT_APPROVED);
    });

    it('blocks FINAL_APPROVAL and EXPORT when latestAssessment is missing', () => {
      const resultApproval = evaluator.evaluate({
        manifest: createManifest(),
        latestDependencyHashes: baseHashes,
        latestAssessment: undefined,
        activePolicy: defaultPolicy,
        action: ProductActionConcept.FINAL_APPROVAL,
      });
      expect(resultApproval.isEligible).toBe(false);
      expect(resultApproval.reasonCodes).toContain(FreshnessReasonCode.ASSESSMENT_MISSING);

      const resultExport = evaluator.evaluate({
        manifest: createManifest(),
        latestDependencyHashes: baseHashes,
        latestAssessment: undefined,
        activePolicy: defaultPolicy,
        action: ProductActionConcept.EXPORT,
      });
      expect(resultExport.isEligible).toBe(false);
      expect(resultExport.reasonCodes).toContain(FreshnessReasonCode.ASSESSMENT_MISSING);
    });

    it('blocks FINAL_APPROVAL and EXPORT when assessment policy version does not match active policy', () => {
      const mismatchedAssessment = createAssessment({
        policyId: 'development-v1',
        policyVersion: '0.9',
      });

      const resultApproval = evaluator.evaluate({
        manifest: createManifest(),
        latestDependencyHashes: baseHashes,
        latestAssessment: mismatchedAssessment,
        activePolicy: defaultPolicy,
        action: ProductActionConcept.FINAL_APPROVAL,
      });
      expect(resultApproval.isEligible).toBe(false);
      expect(resultApproval.reasonCodes).toContain(FreshnessReasonCode.POLICY_VERSION_MISMATCH);

      const mismatchedPolicyId = createAssessment({
        policyId: 'production-v1',
        policyVersion: '1.0',
      });
      const resultExport = evaluator.evaluate({
        manifest: createManifest(),
        latestDependencyHashes: baseHashes,
        latestAssessment: mismatchedPolicyId,
        activePolicy: defaultPolicy,
        action: ProductActionConcept.EXPORT,
      });
      expect(resultExport.isEligible).toBe(false);
      expect(resultExport.reasonCodes).toContain(FreshnessReasonCode.POLICY_VERSION_MISMATCH);
    });
  });
});
