import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  PRODUCT_SNAPSHOT_REPOSITORY,
  type ProductSnapshot,
  type ProductSnapshotRepository,
} from '../../../products/application/product-snapshot.repository.js';
import {
  PRODUCT_ASSET_ELIGIBILITY_EVALUATOR,
  ProductAssetEligibilityEvaluator,
  type AuthoritativeHeroEvidence,
} from '../../../products/application/product-asset-eligibility-evaluator.js';
import {
  CONTENT_GENERATION_REPOSITORY,
  type ContentGenerationRepository,
  type ContentVersion,
} from '../../../content/application/content-generation.repository.js';
import {
  BRAND_RULE_REPOSITORY,
  type BrandRuleRepository,
  type BrandRuleVersion,
} from '../../../brand/application/brand-rule.repository.js';
import { CURRENT_VALIDATOR_VERSION } from '../../domain/services/product-asset-validator.js';
import { ProductAssetValidationStatus } from '../../../products/domain/product-asset.js';
import { ProductHeroEvidenceMismatchError } from '../../domain/scene/creative-scene-errors.js';
import type {
  LayerDependencyDraft,
  ProductHeroPayload,
  SceneLayerDraft,
} from '../../domain/scene/creative-scene.types.js';
import {
  computeSnapshotDigest,
  computeProductAssetDigest,
  computeRegistrationDigest,
  computeAssessmentDigest,
  computeRightsEventDigest,
  computeApprovalEventDigest,
  computeContentVersionDigest,
  computeBrandRuleDigest,
  computeFontAssetDigest,
  computeTypographyPolicyDigest,
  TYPOGRAPHY_SHAPING_ENGINE_VERSION,
  TYPOGRAPHY_POLICY_VERSION,
} from '../../domain/scene/scene-hash.js';
import { APPROVED_FONT_MANIFEST } from '../../infrastructure/fonts/font-manifest.js';

export const AUTHORITATIVE_SCENE_EVIDENCE_VERIFIER = Symbol('AUTHORITATIVE_SCENE_EVIDENCE_VERIFIER');

export interface VerifyAuthoritativeSceneEvidenceInput {
  readonly layers: readonly SceneLayerDraft[];
  readonly productSnapshotId: string;
  readonly sourceContentVersionId: string;
  readonly brandProfileVersionId: string;
}

export interface VerifiedAuthoritativeSceneEvidence {
  readonly snapshot: ProductSnapshot;
  readonly evidence: AuthoritativeHeroEvidence;
  readonly contentVersion: ContentVersion;
  readonly brandRuleVersion: BrandRuleVersion;
  readonly heroLayer: SceneLayerDraft;
  readonly heroPayload: ProductHeroPayload;
  readonly dependencies: readonly LayerDependencyDraft[];
}

@Injectable()
export class AuthoritativeSceneEvidenceVerifier {
  public constructor(
    @Inject(PRODUCT_SNAPSHOT_REPOSITORY)
    private readonly snapshotRepo: ProductSnapshotRepository,
    @Inject(PRODUCT_ASSET_ELIGIBILITY_EVALUATOR)
    private readonly assetEvaluator: ProductAssetEligibilityEvaluator,
    @Inject(CONTENT_GENERATION_REPOSITORY)
    private readonly contentRepo: ContentGenerationRepository,
    @Inject(BRAND_RULE_REPOSITORY)
    private readonly brandRepo: BrandRuleRepository,
  ) {}

  public async verifyAuthoritativeSceneEvidence(
    input: VerifyAuthoritativeSceneEvidenceInput,
  ): Promise<VerifiedAuthoritativeSceneEvidence> {
    // 1. Identify PRODUCT_HERO layer and extract payload
    const heroLayer = input.layers.find((l) => l.layerGroup === 'PRODUCT_HERO');
    if (!heroLayer) {
      throw new ProductHeroEvidenceMismatchError('Scene must contain a PRODUCT_HERO layer');
    }
    const heroPayload = heroLayer.payload as ProductHeroPayload;

    if (heroPayload.productSnapshotId !== input.productSnapshotId) {
      throw new ProductHeroEvidenceMismatchError(
        `Product hero productSnapshotId "${heroPayload.productSnapshotId}" must match scene productSnapshotId "${input.productSnapshotId}"`,
      );
    }

    // 2. Load authoritative ProductSnapshot
    const snapshot = await this.snapshotRepo.findById(input.productSnapshotId);
    if (!snapshot) {
      throw new ProductHeroEvidenceMismatchError(
        `ProductSnapshot "${input.productSnapshotId}" not found in authoritative repository`,
      );
    }
    const sku = snapshot.product?.product?.sku;
    if (!sku) {
      throw new ProductHeroEvidenceMismatchError(
        `ProductSnapshot "${input.productSnapshotId}" contains no valid SKU`,
      );
    }

    // 3. Load authoritative ContentVersion
    const contentVersion = await this.contentRepo.findVersionById(input.sourceContentVersionId);
    if (!contentVersion) {
      throw new ProductHeroEvidenceMismatchError(
        `ContentVersion "${input.sourceContentVersionId}" not found in authoritative repository`,
      );
    }

    // 4. Load authoritative BrandRuleVersion
    const brandRuleVersion = await this.brandRepo.findById(input.brandProfileVersionId);
    if (!brandRuleVersion) {
      throw new ProductHeroEvidenceMismatchError(
        `BrandRuleVersion "${input.brandProfileVersionId}" not found in authoritative repository`,
      );
    }

    // 5. Verify ContentVersion relationships
    if (contentVersion.productSnapshotId !== input.productSnapshotId) {
      throw new ProductHeroEvidenceMismatchError(
        `ContentVersion productSnapshotId "${contentVersion.productSnapshotId}" does not match scene productSnapshotId "${input.productSnapshotId}"`,
      );
    }
    if (contentVersion.brandRuleVersionId !== input.brandProfileVersionId) {
      throw new ProductHeroEvidenceMismatchError(
        `ContentVersion brandRuleVersionId "${contentVersion.brandRuleVersionId}" does not match scene brandProfileVersionId "${input.brandProfileVersionId}"`,
      );
    }

    // 6. Resolve authoritative W12 Hero Evidence
    const evidence = await this.assetEvaluator.resolveAuthoritativeHeroEvidence(sku, {
      productAssetRegistrationId: heroPayload.productAssetRegistrationId,
      productAssetId: heroPayload.productAssetId,
    });

    // 7. Verify authoritative relationship chain:
    // ProductSnapshot -> SKU -> ProductAssetRegistration -> ProductAsset -> ValidationAssessment -> RightsEvent -> ApprovalEvent -> CAS bytes
    if (evidence.registration.sku !== sku) {
      throw new ProductHeroEvidenceMismatchError(
        `Registration SKU "${evidence.registration.sku}" does not match snapshot SKU "${sku}"`,
      );
    }
    if (evidence.registration.productSnapshotId !== input.productSnapshotId) {
      throw new ProductHeroEvidenceMismatchError(
        `Registration productSnapshotId "${evidence.registration.productSnapshotId}" does not match scene productSnapshotId "${input.productSnapshotId}"`,
      );
    }
    if (evidence.registration.role !== 'HERO_CUTOUT') {
      throw new ProductHeroEvidenceMismatchError(
        `Registration role "${evidence.registration.role}" is not HERO_CUTOUT`,
      );
    }
    if (evidence.registration.productAssetId !== evidence.asset.id) {
      throw new ProductHeroEvidenceMismatchError(
        `Registration productAssetId "${evidence.registration.productAssetId}" does not match asset id "${evidence.asset.id}"`,
      );
    }
    if (evidence.assessment.productAssetId !== evidence.asset.id) {
      throw new ProductHeroEvidenceMismatchError(
        `Validation assessment productAssetId "${evidence.assessment.productAssetId}" does not match asset id "${evidence.asset.id}"`,
      );
    }
    if (!evidence.assessment.isValid) {
      throw new ProductHeroEvidenceMismatchError('Validation assessment is marked invalid');
    }
    if (evidence.assessment.status === ProductAssetValidationStatus.FAIL) {
      throw new ProductHeroEvidenceMismatchError('Validation assessment has FAIL status');
    }
    if (evidence.assessment.validatorVersion !== CURRENT_VALIDATOR_VERSION) {
      throw new ProductHeroEvidenceMismatchError(
        `Validation assessment validator version "${evidence.assessment.validatorVersion}" does not match active "${CURRENT_VALIDATOR_VERSION}"`,
      );
    }
    if (evidence.rightsEvent.productAssetRegistrationId !== evidence.registration.id) {
      throw new ProductHeroEvidenceMismatchError(
        `Rights event registration id "${evidence.rightsEvent.productAssetRegistrationId}" does not match registration id "${evidence.registration.id}"`,
      );
    }
    if (evidence.rightsEvent.rightsState !== 'VERIFIED') {
      throw new ProductHeroEvidenceMismatchError(
        `Rights event rightsState "${evidence.rightsEvent.rightsState}" is not VERIFIED`,
      );
    }
    if (evidence.approvalEvent.productAssetRegistrationId !== evidence.registration.id) {
      throw new ProductHeroEvidenceMismatchError(
        `Approval event registration id "${evidence.approvalEvent.productAssetRegistrationId}" does not match registration id "${evidence.registration.id}"`,
      );
    }
    if (evidence.approvalEvent.decision !== 'APPROVED') {
      throw new ProductHeroEvidenceMismatchError(
        `Approval event decision "${evidence.approvalEvent.decision}" is not APPROVED`,
      );
    }
    if (
      evidence.approvalEvent.validationAssessmentId &&
      evidence.approvalEvent.validationAssessmentId !== evidence.assessment.id
    ) {
      throw new ProductHeroEvidenceMismatchError(
        `Approval event validationAssessmentId "${evidence.approvalEvent.validationAssessmentId}" does not match assessment id "${evidence.assessment.id}"`,
      );
    }

    // Verify raw CAS bytes
    if (evidence.buffer.length !== evidence.asset.byteSize) {
      throw new ProductHeroEvidenceMismatchError(
        `CAS buffer length (${evidence.buffer.length}) does not match asset byteSize (${evidence.asset.byteSize})`,
      );
    }
    const computedBufferSha = createHash('sha256').update(evidence.buffer).digest('hex').toLowerCase();
    if (computedBufferSha !== evidence.asset.sha256.toLowerCase()) {
      throw new ProductHeroEvidenceMismatchError(
        `CAS buffer digest "${computedBufferSha}" does not match asset sha256 "${evidence.asset.sha256}"`,
      );
    }

    // 8. Verify hero payload matches authoritative records exactly
    if (heroPayload.productAssetId !== evidence.asset.id) {
      throw new ProductHeroEvidenceMismatchError(
        `Hero productAssetId mismatch: expected "${evidence.asset.id}", got "${heroPayload.productAssetId}"`,
      );
    }
    if (heroPayload.productAssetRegistrationId !== evidence.registration.id) {
      throw new ProductHeroEvidenceMismatchError(
        `Hero productAssetRegistrationId mismatch: expected "${evidence.registration.id}", got "${heroPayload.productAssetRegistrationId}"`,
      );
    }
    if (heroPayload.sha256.toLowerCase() !== evidence.asset.sha256.toLowerCase()) {
      throw new ProductHeroEvidenceMismatchError(
        `Hero digest mismatch: expected "${evidence.asset.sha256}", got "${heroPayload.sha256}"`,
      );
    }
    if (heroPayload.casStorageKey !== evidence.asset.storageKey) {
      throw new ProductHeroEvidenceMismatchError(
        `Hero casStorageKey mismatch: expected "${evidence.asset.storageKey}", got "${heroPayload.casStorageKey}"`,
      );
    }
    if (heroPayload.mimeType !== evidence.asset.mimeType) {
      throw new ProductHeroEvidenceMismatchError(
        `Hero mimeType mismatch: expected "${evidence.asset.mimeType}", got "${heroPayload.mimeType}"`,
      );
    }
    if (heroPayload.format.toLowerCase() !== evidence.asset.format.toLowerCase()) {
      throw new ProductHeroEvidenceMismatchError(
        `Hero format mismatch: expected "${evidence.asset.format}", got "${heroPayload.format}"`,
      );
    }
    if (heroPayload.byteSize !== evidence.asset.byteSize) {
      throw new ProductHeroEvidenceMismatchError(
        `Hero byteSize mismatch: expected "${evidence.asset.byteSize}", got "${heroPayload.byteSize}"`,
      );
    }
    if (heroPayload.width !== evidence.asset.width) {
      throw new ProductHeroEvidenceMismatchError(
        `Hero width mismatch: expected "${evidence.asset.width}", got "${heroPayload.width}"`,
      );
    }
    if (heroPayload.height !== evidence.asset.height) {
      throw new ProductHeroEvidenceMismatchError(
        `Hero height mismatch: expected "${evidence.asset.height}", got "${heroPayload.height}"`,
      );
    }
    if (heroPayload.pixelCount !== evidence.asset.pixelCount) {
      throw new ProductHeroEvidenceMismatchError(
        `Hero pixelCount mismatch: expected "${evidence.asset.pixelCount}", got "${heroPayload.pixelCount}"`,
      );
    }
    if (heroPayload.channels !== evidence.asset.channels) {
      throw new ProductHeroEvidenceMismatchError(
        `Hero channels mismatch: expected "${evidence.asset.channels}", got "${heroPayload.channels}"`,
      );
    }
    if (heroPayload.hasAlpha !== evidence.asset.hasAlpha || evidence.asset.hasAlpha !== true) {
      throw new ProductHeroEvidenceMismatchError(
        `Hero hasAlpha mismatch: expected "${evidence.asset.hasAlpha}", got "${heroPayload.hasAlpha}"`,
      );
    }
    if (heroPayload.transparencyRatio !== evidence.asset.transparencyRatio) {
      throw new ProductHeroEvidenceMismatchError(
        `Hero transparencyRatio mismatch: expected "${evidence.asset.transparencyRatio}", got "${heroPayload.transparencyRatio}"`,
      );
    }
    if (heroPayload.rightsState !== evidence.rightsEvent.rightsState || evidence.rightsEvent.rightsState !== 'VERIFIED') {
      throw new ProductHeroEvidenceMismatchError(
        `Hero rightsState mismatch: expected "${String(evidence.rightsEvent.rightsState)}", got "${String(heroPayload.rightsState)}"`,
      );
    }
    if (heroPayload.approvalDecision !== evidence.approvalEvent.decision || evidence.approvalEvent.decision !== 'APPROVED') {
      throw new ProductHeroEvidenceMismatchError(
        `Hero approvalDecision mismatch: expected "${String(evidence.approvalEvent.decision)}", got "${String(heroPayload.approvalDecision)}"`,
      );
    }
    if (heroPayload.validatorVersion !== evidence.assessment.validatorVersion) {
      throw new ProductHeroEvidenceMismatchError(
        `Hero validatorVersion mismatch: expected "${evidence.assessment.validatorVersion}", got "${heroPayload.validatorVersion}"`,
      );
    }
    if (heroPayload.validationAssessmentId !== evidence.assessment.id) {
      throw new ProductHeroEvidenceMismatchError(
        `Hero validationAssessmentId mismatch: expected "${evidence.assessment.id}", got "${heroPayload.validationAssessmentId}"`,
      );
    }
    if (heroPayload.approvalEventId !== evidence.approvalEvent.id) {
      throw new ProductHeroEvidenceMismatchError(
        `Hero approvalEventId mismatch: expected "${evidence.approvalEvent.id}", got "${heroPayload.approvalEventId}"`,
      );
    }
    if (heroPayload.rightsEventId !== evidence.rightsEvent.id) {
      throw new ProductHeroEvidenceMismatchError(
        `Hero rightsEventId mismatch: expected "${evidence.rightsEvent.id}", got "${heroPayload.rightsEventId}"`,
      );
    }
    if (heroPayload.alphaEvidence.hasAlpha !== evidence.asset.hasAlpha) {
      throw new ProductHeroEvidenceMismatchError(
        `Hero alphaEvidence.hasAlpha mismatch: expected "${evidence.asset.hasAlpha}", got "${heroPayload.alphaEvidence.hasAlpha}"`,
      );
    }
    if (heroPayload.alphaEvidence.transparencyRatio !== evidence.asset.transparencyRatio) {
      throw new ProductHeroEvidenceMismatchError(
        `Hero alphaEvidence.transparencyRatio mismatch: expected "${evidence.asset.transparencyRatio}", got "${heroPayload.alphaEvidence.transparencyRatio}"`,
      );
    }

    // 9. Compute authoritative digests using loaded records (never bare ID strings)
    const snapshotDigest = computeSnapshotDigest(snapshot);
    const heroAssetDigest = computeProductAssetDigest(evidence.asset);
    const registrationDigest = computeRegistrationDigest(evidence.registration);
    const assessmentDigest = computeAssessmentDigest(evidence.assessment);
    const rightsEventDigest = computeRightsEventDigest(evidence.rightsEvent);
    const approvalEventDigest = computeApprovalEventDigest(evidence.approvalEvent);
    const contentVersionDigest = computeContentVersionDigest(contentVersion);
    const brandRuleDigest = computeBrandRuleDigest(brandRuleVersion);

    // 10. Assemble normalized layer dependencies
    const dependencies: LayerDependencyDraft[] = [
      {
        dependencyType: 'PRODUCT_SNAPSHOT',
        dependencyIdentifier: input.productSnapshotId,
        sceneLayerKey: null,
        immutableDigest: snapshotDigest,
        sortOrder: 0,
      },
      {
        dependencyType: 'PRODUCT_ASSET',
        dependencyIdentifier: heroPayload.productAssetId,
        evidenceIdentifier: heroPayload.casStorageKey,
        sceneLayerKey: heroLayer.layerKey,
        immutableDigest: heroAssetDigest,
        sortOrder: 1,
      },
      {
        dependencyType: 'PRODUCT_ASSET_REGISTRATION',
        dependencyIdentifier: heroPayload.productAssetRegistrationId,
        sceneLayerKey: heroLayer.layerKey,
        immutableDigest: registrationDigest,
        sortOrder: 2,
      },
      {
        dependencyType: 'VALIDATION_ASSESSMENT',
        dependencyIdentifier: heroPayload.validationAssessmentId,
        evidenceIdentifier: heroPayload.validatorVersion,
        sceneLayerKey: heroLayer.layerKey,
        immutableDigest: assessmentDigest,
        sortOrder: 3,
      },
      {
        dependencyType: 'RIGHTS_EVENT',
        dependencyIdentifier: heroPayload.rightsEventId,
        sceneLayerKey: heroLayer.layerKey,
        immutableDigest: rightsEventDigest,
        sortOrder: 4,
      },
      {
        dependencyType: 'APPROVAL_EVENT',
        dependencyIdentifier: heroPayload.approvalEventId,
        sceneLayerKey: heroLayer.layerKey,
        immutableDigest: approvalEventDigest,
        sortOrder: 5,
      },
      {
        dependencyType: 'CONTENT_VERSION',
        dependencyIdentifier: input.sourceContentVersionId,
        sceneLayerKey: null,
        immutableDigest: contentVersionDigest,
        sortOrder: 6,
      },
      {
        dependencyType: 'BRAND_PROFILE',
        dependencyIdentifier: input.brandProfileVersionId,
        sceneLayerKey: null,
        immutableDigest: brandRuleDigest,
        sortOrder: 7,
      },
    ];

    // 11. Attach typography and font asset dependencies if scene contains TYPOGRAPHY layer
    const typoLayer = input.layers.find((l) => l.layerGroup === 'TYPOGRAPHY');
    if (typoLayer) {
      APPROVED_FONT_MANIFEST.forEach((entry, idx) => {
        dependencies.push({
          dependencyType: 'FONT_ASSET',
          dependencyIdentifier: entry.id,
          evidenceIdentifier: entry.assetPath,
          sceneLayerKey: typoLayer.layerKey,
          immutableDigest: computeFontAssetDigest({
            fontId: entry.id,
            fontFamily: entry.family,
            fontSha256: entry.sha256,
            byteSize: entry.byteSize,
            supportedWeights: entry.supportedWeights,
          }),
          sortOrder: 10 + idx,
        });
      });

      dependencies.push({
        dependencyType: 'TYPOGRAPHY_POLICY',
        dependencyIdentifier: 'typography-policy-w21',
        evidenceIdentifier: TYPOGRAPHY_POLICY_VERSION,
        sceneLayerKey: typoLayer.layerKey,
        immutableDigest: computeTypographyPolicyDigest({
          policyVersion: TYPOGRAPHY_POLICY_VERSION,
          shapingEngineVersion: TYPOGRAPHY_SHAPING_ENGINE_VERSION,
          approvedFonts: APPROVED_FONT_MANIFEST.map((f) => f.id),
          normalization: 'NFC',
          bidiEnforcement: 'FAIL_CLOSED',
        }),
        sortOrder: 20,
      });
    }

    return {
      snapshot,
      evidence,
      contentVersion,
      brandRuleVersion,
      heroLayer,
      heroPayload,
      dependencies,
    };
  }
}
