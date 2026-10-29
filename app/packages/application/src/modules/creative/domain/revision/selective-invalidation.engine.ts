import { HardGateCode } from '../services/hard-visual-gates.port.js';
import { type LayerGroup } from '../scene/creative-scene.types.js';
import {
  ApprovalDomain,
  type InvalidationAssessment,
  type LayerDriftGuarantee,
  type RevisionPlan,
  RevisionTargetType,
  type TargetMutation,
} from './revision-plan.types.js';

const ALL_HARD_GATE_CODES: readonly HardGateCode[] = [
  HardGateCode.GATE_CAS_HASH_MISMATCH,
  HardGateCode.GATE_FILE_SIZE_EXCEEDED,
  HardGateCode.GATE_CONTAINER_INVALID,
  HardGateCode.GATE_DIMENSIONS_MISMATCH,
  HardGateCode.GATE_PLACEHOLDER_REJECTED,
  HardGateCode.GATE_PRODUCT_ALPHA_CLIPPED,
  HardGateCode.GATE_PRODUCT_VISIBILITY_LOW,
  HardGateCode.GATE_SAFE_MARGIN_VIOLATION,
  HardGateCode.GATE_CTA_HERO_COLLISION,
  HardGateCode.GATE_UNSAFE_UNICODE,
  HardGateCode.GATE_MISSING_GLYPHS,
  HardGateCode.GATE_TEXT_CONTRAST_LOW,
  HardGateCode.GATE_FACTUAL_PRICE_MISMATCH,
  HardGateCode.GATE_FACTUAL_PROMO_MISMATCH,
  HardGateCode.GATE_FACTUAL_SKU_MISMATCH,
  HardGateCode.GATE_SNAPSHOT_STALE,
];

const ALL_APPROVAL_DOMAINS: readonly ApprovalDomain[] = [
  ApprovalDomain.CONTENT_APPROVED,
  ApprovalDomain.VISUAL_APPROVED,
  ApprovalDomain.EXPORT_APPROVED,
  ApprovalDomain.PRODUCT_GOVERNANCE_APPROVED,
];

const ALL_LAYER_GROUPS: readonly LayerGroup[] = [
  'BACKGROUND',
  'SURFACE_SHADOW',
  'PRODUCT_HERO',
  'TYPOGRAPHY',
  'BRAND_DECORATION',
];

export class SelectiveInvalidationEngine {
  public assessInvalidation(input: {
    readonly mutations: readonly TargetMutation[];
    readonly currentDigests?: Readonly<Record<string, string>> | undefined;
  }): InvalidationAssessment {
    const invalidatedGatesSet = new Set<HardGateCode>();
    const invalidatedApprovalsSet = new Set<ApprovalDomain>();
    const affectedLayersSet = new Set<LayerGroup>();

    for (const mutation of input.mutations) {
      const targetAssessment = this.getRulesForTarget(mutation.target);

      for (const gate of targetAssessment.invalidatedGates) {
        invalidatedGatesSet.add(gate);
      }
      for (const approval of targetAssessment.invalidatedApprovals) {
        invalidatedApprovalsSet.add(approval);
      }
      for (const layer of targetAssessment.affectedLayers) {
        affectedLayersSet.add(layer);
      }
    }

    const invalidatedGateCodes = Array.from(invalidatedGatesSet);
    const preservedGateCodes = ALL_HARD_GATE_CODES.filter((code) => !invalidatedGatesSet.has(code));

    const invalidatedApprovalDomains = Array.from(invalidatedApprovalsSet);
    const preservedApprovalDomains = ALL_APPROVAL_DOMAINS.filter(
      (domain) => !invalidatedApprovalsSet.has(domain),
    );

    const affectedLayerGroups = Array.from(affectedLayersSet);

    // Compute preserved layer digests
    const preservedLayerDigests: Record<string, string> = {};
    if (input.currentDigests) {
      for (const [key, digest] of Object.entries(input.currentDigests)) {
        // If key corresponds to an unaffected layer group or custom digest key
        const isAffected = affectedLayerGroups.some((layer) => key.toUpperCase().includes(layer));
        if (!isAffected) {
          preservedLayerDigests[key] = digest;
        }
      }
    }

    const layerDriftGuarantees: LayerDriftGuarantee[] = ALL_LAYER_GROUPS.map((layerGroup) => {
      const isPreserved = !affectedLayersSet.has(layerGroup);
      const expectedDigest = input.currentDigests?.[layerGroup];
      return {
        layerGroup,
        isPreserved,
        ...(expectedDigest ? { expectedDigest } : {}),
        reason: isPreserved
          ? `Target mutations do not touch ${layerGroup} layer group; cryptographic hash continuity enforced.`
          : `Layer group ${layerGroup} targeted for mutation; will re-render and re-hash.`,
      };
    });

    return {
      invalidatedGateCodes,
      preservedGateCodes,
      invalidatedApprovalDomains,
      preservedApprovalDomains,
      affectedLayerGroups,
      preservedLayerDigests,
      layerDriftGuarantees,
    };
  }

  public verifyLayerDriftGuarantees(params: {
    readonly plan: RevisionPlan;
    readonly previousDigests: Readonly<Record<string, string>>;
    readonly actualDigests: Readonly<Record<string, string>>;
  }): { readonly isIntact: boolean; readonly violations: readonly string[] } {
    const violations: string[] = [];

    for (const [layerKey, expectedDigest] of Object.entries(params.plan.preservedLayerDigests)) {
      const actualDigest = params.actualDigests[layerKey];
      if (!actualDigest) {
        violations.push(
          `Missing digest for preserved layer "${layerKey}". Expected "${expectedDigest}".`,
        );
      } else if (actualDigest !== expectedDigest) {
        violations.push(
          `Drift detected in preserved layer "${layerKey}": expected "${expectedDigest}", got "${actualDigest}".`,
        );
      }
    }

    return {
      isIntact: violations.length === 0,
      violations,
    };
  }

  private getRulesForTarget(target: RevisionTargetType): {
    readonly invalidatedGates: readonly HardGateCode[];
    readonly invalidatedApprovals: readonly ApprovalDomain[];
    readonly affectedLayers: readonly LayerGroup[];
  } {
    switch (target) {
      case RevisionTargetType.HEADLINE:
      case RevisionTargetType.SUBHEAD:
      case RevisionTargetType.CTA:
      case RevisionTargetType.LANGUAGE:
        return {
          invalidatedGates: [
            HardGateCode.GATE_TEXT_CONTRAST_LOW,
            HardGateCode.GATE_UNSAFE_UNICODE,
            HardGateCode.GATE_MISSING_GLYPHS,
            HardGateCode.GATE_SAFE_MARGIN_VIOLATION,
            HardGateCode.GATE_CTA_HERO_COLLISION,
          ],
          invalidatedApprovals: [
            ApprovalDomain.CONTENT_APPROVED,
            ApprovalDomain.VISUAL_APPROVED,
            ApprovalDomain.EXPORT_APPROVED,
          ],
          affectedLayers: ['TYPOGRAPHY'],
        };

      case RevisionTargetType.PRICE:
      case RevisionTargetType.PROMOTIONAL_PRICE:
        return {
          invalidatedGates: [
            HardGateCode.GATE_FACTUAL_PRICE_MISMATCH,
            HardGateCode.GATE_FACTUAL_PROMO_MISMATCH,
            HardGateCode.GATE_TEXT_CONTRAST_LOW,
            HardGateCode.GATE_SAFE_MARGIN_VIOLATION,
          ],
          invalidatedApprovals: [
            ApprovalDomain.CONTENT_APPROVED,
            ApprovalDomain.VISUAL_APPROVED,
            ApprovalDomain.EXPORT_APPROVED,
          ],
          affectedLayers: ['TYPOGRAPHY'],
        };

      case RevisionTargetType.BACKGROUND_PROMPT:
      case RevisionTargetType.STYLE_PRESET:
      case RevisionTargetType.NEW_BACKGROUND:
        return {
          invalidatedGates: [
            HardGateCode.GATE_TEXT_CONTRAST_LOW,
            HardGateCode.GATE_CONTAINER_INVALID,
            HardGateCode.GATE_FILE_SIZE_EXCEEDED,
          ],
          invalidatedApprovals: [ApprovalDomain.VISUAL_APPROVED, ApprovalDomain.EXPORT_APPROVED],
          affectedLayers: ['BACKGROUND', 'SURFACE_SHADOW'],
        };

      case RevisionTargetType.PRODUCT_PLACEMENT:
      case RevisionTargetType.PRODUCT_SCALE:
        return {
          invalidatedGates: [
            HardGateCode.GATE_SAFE_MARGIN_VIOLATION,
            HardGateCode.GATE_CTA_HERO_COLLISION,
            HardGateCode.GATE_PRODUCT_ALPHA_CLIPPED,
            HardGateCode.GATE_PRODUCT_VISIBILITY_LOW,
          ],
          invalidatedApprovals: [ApprovalDomain.VISUAL_APPROVED, ApprovalDomain.EXPORT_APPROVED],
          affectedLayers: ['PRODUCT_HERO', 'SURFACE_SHADOW'],
        };

      case RevisionTargetType.PRODUCT_ASSET:
        return {
          invalidatedGates: [
            HardGateCode.GATE_PLACEHOLDER_REJECTED,
            HardGateCode.GATE_PRODUCT_ALPHA_CLIPPED,
            HardGateCode.GATE_PRODUCT_VISIBILITY_LOW,
            HardGateCode.GATE_CTA_HERO_COLLISION,
            HardGateCode.GATE_SAFE_MARGIN_VIOLATION,
          ],
          invalidatedApprovals: [
            ApprovalDomain.VISUAL_APPROVED,
            ApprovalDomain.EXPORT_APPROVED,
            ApprovalDomain.PRODUCT_GOVERNANCE_APPROVED,
          ],
          affectedLayers: ['PRODUCT_HERO', 'SURFACE_SHADOW'],
        };

      case RevisionTargetType.TEMPLATE:
        return {
          invalidatedGates: [
            HardGateCode.GATE_TEXT_CONTRAST_LOW,
            HardGateCode.GATE_SAFE_MARGIN_VIOLATION,
            HardGateCode.GATE_CTA_HERO_COLLISION,
          ],
          invalidatedApprovals: [ApprovalDomain.VISUAL_APPROVED, ApprovalDomain.EXPORT_APPROVED],
          affectedLayers: ['PRODUCT_HERO', 'TYPOGRAPHY', 'BRAND_DECORATION'],
        };

      case RevisionTargetType.ASPECT_RATIO:
        return {
          invalidatedGates: [
            HardGateCode.GATE_DIMENSIONS_MISMATCH,
            HardGateCode.GATE_TEXT_CONTRAST_LOW,
            HardGateCode.GATE_SAFE_MARGIN_VIOLATION,
            HardGateCode.GATE_CTA_HERO_COLLISION,
            HardGateCode.GATE_PRODUCT_ALPHA_CLIPPED,
            HardGateCode.GATE_PRODUCT_VISIBILITY_LOW,
          ],
          invalidatedApprovals: [ApprovalDomain.VISUAL_APPROVED, ApprovalDomain.EXPORT_APPROVED],
          affectedLayers: [
            'BACKGROUND',
            'SURFACE_SHADOW',
            'PRODUCT_HERO',
            'TYPOGRAPHY',
            'BRAND_DECORATION',
          ],
        };
    }
  }
}
