import { describe, expect, it } from '@jest/globals';
import { HardGateCode } from '../services/hard-visual-gates.port.js';
import {
  ApprovalDomain,
  type RevisionPlan,
  RevisionExecutionStrategy,
  RevisionInterpretationConfidence,
  RevisionTargetType,
} from './revision-plan.types.js';
import { SelectiveInvalidationEngine } from './selective-invalidation.engine.js';

describe('SelectiveInvalidationEngine', () => {
  const engine = new SelectiveInvalidationEngine();

  const sampleDigests: Readonly<Record<string, string>> = {
    BACKGROUND: 'cas-sha256-bg-aaa111',
    SURFACE_SHADOW: 'cas-sha256-shadow-bbb222',
    PRODUCT_HERO: 'cas-sha256-hero-ccc333',
    TYPOGRAPHY: 'cas-sha256-typo-ddd444',
    BRAND_DECORATION: 'cas-sha256-brand-eee555',
  };

  describe('Typography Revisions (HEADLINE, SUBHEAD, CTA, LANGUAGE)', () => {
    it('invalidates readability, unicode, glyphs, safe margin, and collision gates', () => {
      const assessment = engine.assessInvalidation({
        mutations: [
          {
            target: RevisionTargetType.HEADLINE,
            fieldName: 'headline',
            requestedValue: 'Parisian Midnight Rose',
          },
        ],
        currentDigests: sampleDigests,
      });

      expect(assessment.invalidatedGateCodes).toContain(HardGateCode.GATE_TEXT_CONTRAST_LOW);
      expect(assessment.invalidatedGateCodes).toContain(HardGateCode.GATE_UNSAFE_UNICODE);
      expect(assessment.invalidatedGateCodes).toContain(HardGateCode.GATE_MISSING_GLYPHS);
      expect(assessment.invalidatedGateCodes).toContain(HardGateCode.GATE_SAFE_MARGIN_VIOLATION);
      expect(assessment.invalidatedGateCodes).toContain(HardGateCode.GATE_CTA_HERO_COLLISION);

      // Preserves Product truth and CAS container integrity
      expect(assessment.preservedGateCodes).toContain(HardGateCode.GATE_PLACEHOLDER_REJECTED);
      expect(assessment.preservedGateCodes).toContain(HardGateCode.GATE_PRODUCT_ALPHA_CLIPPED);
      expect(assessment.preservedGateCodes).toContain(HardGateCode.GATE_PRODUCT_VISIBILITY_LOW);
      expect(assessment.preservedGateCodes).toContain(HardGateCode.GATE_CONTAINER_INVALID);
      expect(assessment.preservedGateCodes).toContain(HardGateCode.GATE_FACTUAL_PRICE_MISMATCH);

      // Approvals: invalidates content, visual, export; preserves product governance
      expect(assessment.invalidatedApprovalDomains).toEqual([
        ApprovalDomain.CONTENT_APPROVED,
        ApprovalDomain.VISUAL_APPROVED,
        ApprovalDomain.EXPORT_APPROVED,
      ]);
      expect(assessment.preservedApprovalDomains).toContain(
        ApprovalDomain.PRODUCT_GOVERNANCE_APPROVED,
      );

      // Layer targeting & hash preservation
      expect(assessment.affectedLayerGroups).toEqual(['TYPOGRAPHY']);
      expect(assessment.preservedLayerDigests['BACKGROUND']).toBe('cas-sha256-bg-aaa111');
      expect(assessment.preservedLayerDigests['PRODUCT_HERO']).toBe('cas-sha256-hero-ccc333');
      expect(assessment.preservedLayerDigests['TYPOGRAPHY']).toBeUndefined();
    });
  });

  describe('Price Revisions (PRICE, PROMOTIONAL_PRICE)', () => {
    it('invalidates factual price/promo, contrast, safe margin while preserving product truth and background', () => {
      const assessment = engine.assessInvalidation({
        mutations: [
          {
            target: RevisionTargetType.PRICE,
            fieldName: 'price',
            requestedValue: '185 EUR',
          },
        ],
        currentDigests: sampleDigests,
      });

      expect(assessment.invalidatedGateCodes).toContain(HardGateCode.GATE_FACTUAL_PRICE_MISMATCH);
      expect(assessment.invalidatedGateCodes).toContain(HardGateCode.GATE_FACTUAL_PROMO_MISMATCH);
      expect(assessment.invalidatedGateCodes).toContain(HardGateCode.GATE_TEXT_CONTRAST_LOW);
      expect(assessment.invalidatedGateCodes).toContain(HardGateCode.GATE_SAFE_MARGIN_VIOLATION);

      // Preserves all product truth
      expect(assessment.preservedGateCodes).toContain(HardGateCode.GATE_PLACEHOLDER_REJECTED);
      expect(assessment.preservedGateCodes).toContain(HardGateCode.GATE_PRODUCT_ALPHA_CLIPPED);

      expect(assessment.affectedLayerGroups).toEqual(['TYPOGRAPHY']);
    });
  });

  describe('Background Revisions (BACKGROUND_PROMPT, STYLE_PRESET, NEW_BACKGROUND)', () => {
    it('strictly preserves CONTENT_APPROVED copy while invalidating visual sign-off and contrast', () => {
      const assessment = engine.assessInvalidation({
        mutations: [
          {
            target: RevisionTargetType.STYLE_PRESET,
            fieldName: 'stylePreset',
            requestedValue: 'NOCTURNE_ROYALE',
          },
        ],
        currentDigests: sampleDigests,
      });

      expect(assessment.invalidatedGateCodes).toContain(HardGateCode.GATE_TEXT_CONTRAST_LOW);
      expect(assessment.invalidatedGateCodes).toContain(HardGateCode.GATE_CONTAINER_INVALID);
      expect(assessment.invalidatedGateCodes).toContain(HardGateCode.GATE_FILE_SIZE_EXCEEDED);

      // Key invariant: Copy content approval is preserved!
      expect(assessment.invalidatedApprovalDomains).toEqual([
        ApprovalDomain.VISUAL_APPROVED,
        ApprovalDomain.EXPORT_APPROVED,
      ]);
      expect(assessment.preservedApprovalDomains).toContain(ApprovalDomain.CONTENT_APPROVED);
      expect(assessment.preservedApprovalDomains).toContain(
        ApprovalDomain.PRODUCT_GOVERNANCE_APPROVED,
      );

      // Product hero is untouched
      expect(assessment.affectedLayerGroups).toContain('BACKGROUND');
      expect(assessment.affectedLayerGroups).toContain('SURFACE_SHADOW');
      expect(assessment.preservedLayerDigests['PRODUCT_HERO']).toBe('cas-sha256-hero-ccc333');
    });
  });

  describe('Product Placement / Scaling Revisions', () => {
    it('invalidates geometry and clipping gates while preserving copy approval and background', () => {
      const assessment = engine.assessInvalidation({
        mutations: [
          {
            target: RevisionTargetType.PRODUCT_PLACEMENT,
            fieldName: 'productPlacement',
            requestedValue: 'LEFT',
          },
        ],
        currentDigests: sampleDigests,
      });

      expect(assessment.invalidatedGateCodes).toContain(HardGateCode.GATE_SAFE_MARGIN_VIOLATION);
      expect(assessment.invalidatedGateCodes).toContain(HardGateCode.GATE_CTA_HERO_COLLISION);
      expect(assessment.invalidatedGateCodes).toContain(HardGateCode.GATE_PRODUCT_ALPHA_CLIPPED);
      expect(assessment.invalidatedGateCodes).toContain(HardGateCode.GATE_PRODUCT_VISIBILITY_LOW);

      // Typography gates are untouched
      expect(assessment.preservedGateCodes).toContain(HardGateCode.GATE_UNSAFE_UNICODE);
      expect(assessment.preservedGateCodes).toContain(HardGateCode.GATE_MISSING_GLYPHS);

      // Copy remains approved
      expect(assessment.preservedApprovalDomains).toContain(ApprovalDomain.CONTENT_APPROVED);
      expect(assessment.preservedLayerDigests['BACKGROUND']).toBe('cas-sha256-bg-aaa111');
    });
  });

  describe('Product Cutout Asset Swap', () => {
    it('invalidates product truth and governance while preserving background and copy', () => {
      const assessment = engine.assessInvalidation({
        mutations: [
          {
            target: RevisionTargetType.PRODUCT_ASSET,
            fieldName: 'assetId',
            requestedValue: 'new-product-cutout-uuid',
          },
        ],
        currentDigests: sampleDigests,
      });

      expect(assessment.invalidatedGateCodes).toContain(HardGateCode.GATE_PLACEHOLDER_REJECTED);
      expect(assessment.invalidatedGateCodes).toContain(HardGateCode.GATE_PRODUCT_ALPHA_CLIPPED);
      expect(assessment.invalidatedGateCodes).toContain(HardGateCode.GATE_PRODUCT_VISIBILITY_LOW);
      expect(assessment.invalidatedApprovalDomains).toContain(
        ApprovalDomain.PRODUCT_GOVERNANCE_APPROVED,
      );
      expect(assessment.preservedApprovalDomains).toContain(ApprovalDomain.CONTENT_APPROVED);
    });
  });

  describe('Layer Drift Guarantees', () => {
    const mockPlan: RevisionPlan = {
      id: 'plan-1',
      creativeJobId: 'job-1',
      baseVersionNumber: 1,
      requestedByUserId: 'user-1',
      rawInstruction: 'Headline: New Fragrance',
      executionStrategy: RevisionExecutionStrategy.ZERO_AI_COMPOSITE,
      confidence: RevisionInterpretationConfidence.CONFIDENT,
      confidenceScore: 1.0,
      mutations: [
        {
          target: RevisionTargetType.HEADLINE,
          fieldName: 'headline',
          requestedValue: 'New Fragrance',
        },
      ],
      affectedLayerGroups: ['TYPOGRAPHY'],
      preservedLayerDigests: {
        BACKGROUND: 'cas-sha256-bg-aaa111',
        PRODUCT_HERO: 'cas-sha256-hero-ccc333',
      },
      requiresConfirmation: false,
      estimatedExecutionMs: 80,
      createdAt: new Date(),
    };

    it('confirms drift integrity when actual digests match expected preserved digests', () => {
      const verification = engine.verifyLayerDriftGuarantees({
        plan: mockPlan,
        previousDigests: sampleDigests,
        actualDigests: {
          BACKGROUND: 'cas-sha256-bg-aaa111',
          PRODUCT_HERO: 'cas-sha256-hero-ccc333',
          TYPOGRAPHY: 'cas-sha256-typo-NEW-HEADLINE',
        },
      });

      expect(verification.isIntact).toBe(true);
      expect(verification.violations).toHaveLength(0);
    });

    it('detects and flags drift violation if a supposedly preserved background asset changes', () => {
      const verification = engine.verifyLayerDriftGuarantees({
        plan: mockPlan,
        previousDigests: sampleDigests,
        actualDigests: {
          BACKGROUND: 'cas-sha256-bg-CORRUPTED-DRIFT',
          PRODUCT_HERO: 'cas-sha256-hero-ccc333',
          TYPOGRAPHY: 'cas-sha256-typo-NEW-HEADLINE',
        },
      });

      expect(verification.isIntact).toBe(false);
      expect(verification.violations).toHaveLength(1);
      expect(verification.violations[0]).toContain(
        'Drift detected in preserved layer "BACKGROUND"',
      );
    });

    it('flags missing digest violation if an expected preserved layer is absent', () => {
      const verification = engine.verifyLayerDriftGuarantees({
        plan: mockPlan,
        previousDigests: sampleDigests,
        actualDigests: {
          PRODUCT_HERO: 'cas-sha256-hero-ccc333',
        },
      });

      expect(verification.isIntact).toBe(false);
      expect(verification.violations[0]).toContain(
        'Missing digest for preserved layer "BACKGROUND"',
      );
    });
  });
});
