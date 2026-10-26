import { createHash } from 'node:crypto';
import { describe, expect, it, beforeEach } from '@jest/globals';
import { ForbiddenError } from '@parisian-shopper/common';
import { PermissionService } from '../../auth/domain/permissions.js';
import {
  type CreateInitialSceneInput,
  type CreativeSceneRecord,
  type CreativeSceneVersionRecord,
  type OutboxEventDraft,
  type ReviseSceneInput,
  type SceneInvalidationEventRecord,
  type SceneLayerDraft,
  type SceneVersionStateRecord,
} from '../domain/scene/creative-scene.types.js';
import {
  CreativeSceneNotFoundError,
  CreativeSceneVersionNotFoundError,
  InvalidSceneLayerError,
  NegativeCoordinateSpaceError,
  ProductHeroEvidenceMismatchError,
} from '../domain/scene/creative-scene-errors.js';
import {
  type CreateInitialSceneAtomicInput,
  type CreateRevisionAtomicInput,
  type CreativeSceneRepository,
  type RecordDependencyInvalidationInput,
} from './creative-scene.repository.js';
import { CreateInitialSceneUseCase } from './create-initial-scene.use-case.js';
import { ReviseSceneUseCase } from './revise-scene.use-case.js';
import { GetSceneVersionUseCase } from './get-scene-version.use-case.js';
import { SceneInvalidationService } from './scene-invalidation.service.js';
import { AuthoritativeSceneEvidenceVerifier } from './services/authoritative-scene-evidence-verifier.js';
import {
  computeLayerHash,
  computeDependencyHash,
  computeSceneHash,
  computeFontAssetDigest,
  computeTypographyPolicyDigest,
  TYPOGRAPHY_SHAPING_ENGINE_VERSION,
  TYPOGRAPHY_POLICY_VERSION,
} from '../domain/scene/scene-hash.js';
import { APPROVED_FONT_MANIFEST } from '../infrastructure/fonts/font-manifest.js';
import {
  type ProductSnapshot,
  type ProductSnapshotRepository,
} from '../../products/application/product-snapshot.repository.js';
import {
  type AuthoritativeHeroEvidence,
  type ProductAssetEligibilityEvaluator,
} from '../../products/application/product-asset-eligibility-evaluator.js';
import {
  type ProductAsset,
  type ProductAssetApprovalEvent,
  type ProductAssetRegistration,
  type ProductAssetRightsEvent,
  type ProductAssetValidationAssessment,
} from '../../products/domain/product-asset.js';
import {
  type ContentGenerationRepository,
  type ContentVersion,
} from '../../content/application/content-generation.repository.js';
import {
  type BrandRuleRepository,
  type BrandRuleVersion,
} from '../../brand/application/brand-rule.repository.js';
import { DEVELOPMENT_BRAND_RULES } from '../../brand/domain/brand-rule.schema.js';
import {
  ProductAssetRightsUnverifiedError,
  ProductAssetUnapprovedError,
  ProductAssetIneligibleError,
} from '../../products/domain/product-asset-errors.js';

class InMemoryCreativeSceneRepository implements CreativeSceneRepository {
  public scenes = new Map<string, CreativeSceneRecord>();
  public versions = new Map<string, CreativeSceneVersionRecord>();
  public invalidationEvents: SceneInvalidationEventRecord[] = [];
  public outboxEvents: OutboxEventDraft[] = [];

  public async createInitialScene(input: CreateInitialSceneAtomicInput): Promise<{
    readonly scene: CreativeSceneRecord;
    readonly version: CreativeSceneVersionRecord;
  }> {
    const sceneId = 'scene-uuid-1';
    const versionId = 'version-uuid-1';
    const scene: CreativeSceneRecord = {
      id: sceneId,
      creativeJobId: input.creativeJobId,
      campaignId: input.campaignId ?? null,
      title: input.title,
      currentVersionNumber: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.scenes.set(sceneId, scene);

    const version: CreativeSceneVersionRecord = {
      id: versionId,
      sceneId,
      versionNumber: 1,
      parentVersionId: null,
      aspectRatio: input.aspectRatio,
      width: input.width,
      height: input.height,
      templateId: input.templateId,
      templateVersion: input.templateVersion,
      stylePresetId: input.stylePresetId ?? null,
      language: input.language,
      safeMargins: input.safeMargins,
      brandProfileVersionId: input.brandProfileVersionId,
      sourceContentVersionId: input.sourceContentVersionId,
      productSnapshotId: input.productSnapshotId,
      sceneHash: input.sceneHash,
      dependencyHash: input.dependencyHash,
      changeReason: 'Initial scene composition',
      operationCode: 'INITIAL_DRAFT',
      requestedByUserId: input.requestedByUserId ?? null,
      metadata: input.metadata ?? null,
      createdAt: new Date(),
      layers: input.layers.map((l, idx) => {
        const { dependencies: _, ...layerDraft } = l;
        return {
          ...layerDraft,
          id: l.id ?? `layer-${idx}`,
          sceneVersionId: versionId,
          layerHash: computeLayerHash(l),
          createdAt: new Date(),
        };
      }),
      dependencies: input.dependencies.map((d, idx) => ({
        ...d,
        id: d.id ?? `dep-${idx}`,
        sceneVersionId: versionId,
        sceneLayerId: d.sceneLayerId ?? null,
        evidenceIdentifier: d.evidenceIdentifier ?? null,
        createdAt: new Date(),
      })),
      state: {
        id: 'state-1',
        sceneVersionId: versionId,
        status: 'DRAFT',
        isExportEligible: false,
        updatedAt: new Date(),
      },
    };
    this.versions.set(versionId, version);

    this.outboxEvents.push(input.outboxEvent);

    return await Promise.resolve({ scene, version });
  }

  public async createRevision(
    input: CreateRevisionAtomicInput,
  ): Promise<CreativeSceneVersionRecord> {
    const parentVersion = this.versions.get(
      Array.from(this.versions.values()).find(
        (v) => v.sceneId === input.sceneId && v.versionNumber === input.expectedVersionNumber,
      )?.id ?? '',
    );

    const versionId = `version-uuid-${input.expectedVersionNumber + 1}`;
    const newVersion: CreativeSceneVersionRecord = {
      id: versionId,
      sceneId: input.sceneId,
      versionNumber: input.expectedVersionNumber + 1,
      parentVersionId: parentVersion?.id ?? null,
      aspectRatio: parentVersion?.aspectRatio ?? '4:5',
      width: parentVersion?.width ?? 1080,
      height: parentVersion?.height ?? 1350,
      templateId: input.templateId,
      templateVersion: input.templateVersion,
      stylePresetId: input.stylePresetId ?? null,
      language: input.language,
      safeMargins: input.safeMargins,
      brandProfileVersionId: input.brandProfileVersionId,
      sourceContentVersionId: input.sourceContentVersionId,
      productSnapshotId: input.productSnapshotId,
      sceneHash: input.sceneHash,
      dependencyHash: input.dependencyHash,
      changeReason: input.changeReason,
      operationCode: input.operationCode,
      requestedByUserId: input.requestedByUserId ?? null,
      metadata: input.metadata ?? null,
      createdAt: new Date(),
      layers: input.layers.map((l, idx) => {
        const { dependencies: _, ...layerDraft } = l;
        return {
          ...layerDraft,
          id: l.id ?? `layer-rev-${idx}`,
          sceneVersionId: versionId,
          layerHash: computeLayerHash(l),
          createdAt: new Date(),
        };
      }),
      dependencies: input.dependencies.map((d, idx) => ({
        ...d,
        id: d.id ?? `dep-rev-${idx}`,
        sceneVersionId: versionId,
        sceneLayerId: d.sceneLayerId ?? null,
        evidenceIdentifier: d.evidenceIdentifier ?? null,
        createdAt: new Date(),
      })),
      state: {
        id: `state-${input.expectedVersionNumber + 1}`,
        sceneVersionId: versionId,
        status: 'DRAFT',
        isExportEligible: false,
        updatedAt: new Date(),
      },
    };
    this.versions.set(versionId, newVersion);

    for (const outbox of input.outboxEvents) {
      this.outboxEvents.push(outbox);
    }

    return await Promise.resolve(newVersion);
  }

  public async recordDependencyInvalidation(
    input: RecordDependencyInvalidationInput,
  ): Promise<SceneInvalidationEventRecord> {
    const event: SceneInvalidationEventRecord = {
      id: `inval-${Date.now()}`,
      sceneVersionId: input.sceneVersionId,
      reason: input.reason,
      divergedDependencyType: input.divergedDependencyType,
      expectedDigest: input.expectedDigest,
      actualDigest: input.actualDigest,
      recordedByUserId: input.recordedByUserId ?? null,
      metadata: input.metadata ?? null,
      recordedAt: new Date(),
    };
    this.invalidationEvents.push(event);

    const version = this.versions.get(input.sceneVersionId);
    if (version && version.state) {
      const updatedState: SceneVersionStateRecord = {
        ...version.state,
        status: 'STALE_FACTS',
        invalidationReason: input.reason,
        invalidatedAt: new Date(),
        updatedAt: new Date(),
      };
      this.versions.set(input.sceneVersionId, {
        ...version,
        state: updatedState,
      });
    }

    if (input.outboxEvent) {
      this.outboxEvents.push(input.outboxEvent);
    }

    return await Promise.resolve(event);
  }

  public async findById(sceneId: string): Promise<CreativeSceneRecord | null> {
    return await Promise.resolve(this.scenes.get(sceneId) ?? null);
  }

  public async findByJobId(creativeJobId: string): Promise<CreativeSceneRecord | null> {
    for (const s of this.scenes.values()) {
      if (s.creativeJobId === creativeJobId) return await Promise.resolve(s);
    }
    return await Promise.resolve(null);
  }

  public async findVersionById(versionId: string): Promise<CreativeSceneVersionRecord | null> {
    return await Promise.resolve(this.versions.get(versionId) ?? null);
  }

  public async findVersionByNumber(
    sceneId: string,
    versionNumber: number,
  ): Promise<CreativeSceneVersionRecord | null> {
    for (const v of this.versions.values()) {
      if (v.sceneId === sceneId && v.versionNumber === versionNumber) {
        return await Promise.resolve(v);
      }
    }
    return await Promise.resolve(null);
  }

  public async findLatestVersionByJobId(
    creativeJobId: string,
  ): Promise<CreativeSceneVersionRecord | null> {
    const scene = await this.findByJobId(creativeJobId);
    if (!scene) return null;
    return await this.findLatestVersionBySceneId(scene.id);
  }

  public async findLatestVersionBySceneId(
    sceneId: string,
  ): Promise<CreativeSceneVersionRecord | null> {
    let latest: CreativeSceneVersionRecord | null = null;
    for (const v of this.versions.values()) {
      if (v.sceneId === sceneId) {
        if (!latest || v.versionNumber > latest.versionNumber) {
          latest = v;
        }
      }
    }
    return await Promise.resolve(latest);
  }

  public async listVersions(sceneId: string): Promise<readonly CreativeSceneVersionRecord[]> {
    const result: CreativeSceneVersionRecord[] = [];
    for (const v of this.versions.values()) {
      if (v.sceneId === sceneId) result.push(v);
    }
    return await Promise.resolve(result.sort((a, b) => a.versionNumber - b.versionNumber));
  }
}

const TEST_HERO_BUFFER = Buffer.alloc(50000, 0x62);
const TEST_HERO_SHA256 = createHash('sha256').update(TEST_HERO_BUFFER).digest('hex').toLowerCase();
const TEST_BG_SHA256 = 'a'.repeat(64);
const TEST_PRODUCT_SNAPSHOT_ID = '11111111-1111-4111-8111-111111111111';
const TEST_PRODUCT_ASSET_ID = '22222222-2222-4222-8222-222222222222';
const TEST_REGISTRATION_ID = '33333333-3333-4333-8333-333333333333';
const TEST_ASSESSMENT_ID = '44444444-4444-4444-8444-444444444444';
const TEST_RIGHTS_EVENT_ID = '55555555-5555-4555-8555-555555555555';
const TEST_APPROVAL_EVENT_ID = '66666666-6666-4666-8666-666666666666';
const TEST_CONTENT_VERSION_ID = 'cv-uuid-1';
const TEST_BRAND_PROFILE_VERSION_ID = 'bp-uuid-1';

function createAuthoritativeEvidence(overrides?: {
  asset?: Partial<ProductAsset>;
  registration?: Partial<ProductAssetRegistration>;
  assessment?: Partial<ProductAssetValidationAssessment>;
  rightsEvent?: Partial<ProductAssetRightsEvent>;
  approvalEvent?: Partial<ProductAssetApprovalEvent>;
  buffer?: Buffer;
}): AuthoritativeHeroEvidence {
  const asset: ProductAsset = {
    id: TEST_PRODUCT_ASSET_ID,
    sha256: TEST_HERO_SHA256,
    storageKey: 'cas/cutouts/product.png',
    mimeType: 'image/png',
    format: 'png',
    byteSize: 50000,
    width: 600,
    height: 600,
    pixelCount: 360000,
    channels: 4,
    hasAlpha: true,
    transparencyRatio: 0.35,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...(overrides?.asset ?? {}),
  };

  const registration: ProductAssetRegistration = {
    id: TEST_REGISTRATION_ID,
    productAssetId: asset.id,
    sku: 'CHANEL-NO5',
    productSnapshotId: TEST_PRODUCT_SNAPSHOT_ID,
    role: 'HERO_CUTOUT',
    sourceSystem: 'MEKHLA_PRODUCT_API',
    rightsState: 'VERIFIED',
    registeredAt: new Date('2026-01-01T00:00:00Z'),
    ...(overrides?.registration ?? {}),
  };

  const assessment: ProductAssetValidationAssessment = {
    id: TEST_ASSESSMENT_ID,
    productAssetId: asset.id,
    validatorVersion: '1.0.0',
    status: 'PASS',
    isValid: true,
    format: 'png',
    hasAlpha: true,
    transparencyRatio: 0.35,
    width: 600,
    height: 600,
    byteSize: 50000,
    pixelCount: 360000,
    findings: [],
    reasonCodes: [],
    assessedAt: new Date('2026-01-01T00:00:00Z'),
    ...(overrides?.assessment ?? {}),
  };

  const rightsEvent: ProductAssetRightsEvent = {
    id: TEST_RIGHTS_EVENT_ID,
    productAssetRegistrationId: registration.id,
    rightsState: 'VERIFIED',
    effectiveAt: new Date('2026-01-01T00:00:00Z'),
    expiresAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...(overrides?.rightsEvent ?? {}),
  };

  const approvalEvent: ProductAssetApprovalEvent = {
    id: TEST_APPROVAL_EVENT_ID,
    productAssetRegistrationId: registration.id,
    validationAssessmentId: assessment.id,
    decision: 'APPROVED',
    decidedAt: new Date('2026-01-01T00:00:00Z'),
    ...(overrides?.approvalEvent ?? {}),
  };

  return {
    asset,
    registration,
    assessment,
    rightsEvent,
    approvalEvent,
    buffer: overrides?.buffer ?? TEST_HERO_BUFFER,
  };
}

function createSampleLayers(): SceneLayerDraft[] {
  return [
    {
      layerKey: 'bg_01',
      layerGroup: 'BACKGROUND',
      layerType: 'GENERATED_BACKGROUND',
      name: 'Background',
      zIndex: 0,
      visible: true,
      opacity: 1,
      blendMode: 'NORMAL',
      bounds: { x: 0, y: 0, width: 1080, height: 1350 },
      payloadSchemaVersion: 1,
      sortOrder: 0,
      payload: {
        assetType: 'GENERATED_BACKGROUND',
        casStorageKey: 'cas/bg/123.png',
        sha256: TEST_BG_SHA256,
        provider: 'mock-ai',
        model: 'fixture-v1',
        promptVersion: '1.0',
      },
    },
    {
      layerKey: 'shadow_01',
      layerGroup: 'SURFACE_SHADOW',
      layerType: 'CONTACT_SHADOW',
      name: 'Shadow',
      zIndex: 100,
      visible: true,
      opacity: 0.5,
      blendMode: 'MULTIPLY',
      bounds: { x: 200, y: 900, width: 680, height: 120 },
      payloadSchemaVersion: 1,
      sortOrder: 1,
      payload: { shadowType: 'CONTACT_SHADOW', blurRadius: 20, color: '#000000' },
    },
    {
      layerKey: 'hero_01',
      layerGroup: 'PRODUCT_HERO',
      layerType: 'HERO_CUTOUT',
      name: 'Product Hero',
      zIndex: 200,
      visible: true,
      opacity: 1,
      blendMode: 'NORMAL',
      bounds: { x: 240, y: 380, width: 600, height: 600 },
      payloadSchemaVersion: 1,
      sortOrder: 2,
      payload: {
        productSnapshotId: TEST_PRODUCT_SNAPSHOT_ID,
        productAssetId: TEST_PRODUCT_ASSET_ID,
        productAssetRegistrationId: TEST_REGISTRATION_ID,
        validationAssessmentId: TEST_ASSESSMENT_ID,
        validatorVersion: '1.0.0',
        rightsEventId: TEST_RIGHTS_EVENT_ID,
        approvalEventId: TEST_APPROVAL_EVENT_ID,
        assetRole: 'HERO_CUTOUT',
        casStorageKey: 'cas/cutouts/product.png',
        sha256: TEST_HERO_SHA256,
        mimeType: 'image/png',
        format: 'png',
        byteSize: 50000,
        width: 600,
        height: 600,
        pixelCount: 360000,
        channels: 4,
        hasAlpha: true,
        transparencyRatio: 0.35,
        rightsState: 'VERIFIED',
        approvalDecision: 'APPROVED',
        alphaEvidence: {
          hasAlpha: true,
          transparencyRatio: 0.35,
        },
        containmentConfig: {
          containmentPassed: true,
          x: 240,
          y: 380,
          width: 600,
          height: 600,
        },
      },
    },
    {
      layerKey: 'typo_01',
      layerGroup: 'TYPOGRAPHY',
      layerType: 'TYPOGRAPHY_BLOCK',
      name: 'Typography',
      zIndex: 300,
      visible: true,
      opacity: 1,
      blendMode: 'NORMAL',
      bounds: { x: 72, y: 980, width: 936, height: 200 },
      payloadSchemaVersion: 1,
      sortOrder: 3,
      payload: {
        headline: {
          text: 'Initial Luxury Headline',
          fontFamily: 'Playfair Display',
          fontWeight: 700,
          fontSize: 48,
          color: '#1c1a17',
        },
      },
    },
  ];
}

describe('CreativeScene Use Cases', () => {
  let repo: InMemoryCreativeSceneRepository;
  let permissions: PermissionService;
  let snapshotRepo: ProductSnapshotRepository;
  let assetEvaluator: ProductAssetEligibilityEvaluator;
  let contentRepo: ContentGenerationRepository;
  let brandRepo: BrandRuleRepository;
  let createUseCase: CreateInitialSceneUseCase;
  let reviseUseCase: ReviseSceneUseCase;
  let getUseCase: GetSceneVersionUseCase;
  let invalidationService: SceneInvalidationService;

  const validSnapshot: ProductSnapshot = {
    id: TEST_PRODUCT_SNAPSHOT_ID,
    snapshotHash: '1'.repeat(64),
    normalizerVersion: '1.0.0',
    product: {
      schema_version: '1.0',
      source_system: 'MEKHLA_PRODUCT_API',
      source_updated_at: new Date('2026-01-01T00:00:00Z').toISOString(),
      retrieved_at: new Date('2026-01-01T00:00:00Z').toISOString(),
      lifecycle_status: 'active',
      product: {
        sku: 'CHANEL-NO5',
        product_name: 'Chanel No 5',
        brand: 'Chanel',
        category: 'Fragrance',
        price: '165.00',
        currency: 'USD',
        stock_status: 'in_stock',
      },
    },
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };

  const validContentVersion: ContentVersion = {
    id: TEST_CONTENT_VERSION_ID,
    contentJobId: 'job-content-1',
    versionNumber: 1,
    brandRuleVersionId: TEST_BRAND_PROFILE_VERSION_ID,
    productSnapshotId: TEST_PRODUCT_SNAPSHOT_ID,
    generationAttemptId: 'attempt-1',
    provider: 'mock-ai',
    model: 'fixture-v1',
    promptVersion: '1.0',
    structuredOutput: {
      headline: 'Initial Luxury Headline',
      khmer_caption: 'Khmer text',
      english_caption: 'English text',
      cta: 'Shop Now',
      hashtags: ['#chanel'],
      creative_brief: 'Brief',
      facts_used: ['Original Fragrance'],
      warnings: [],
      missing_information: [],
    },
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };

  const validBrandRuleVersion: BrandRuleVersion = {
    id: TEST_BRAND_PROFILE_VERSION_ID,
    name: 'Luxury Rules',
    version: 1,
    status: 'ACTIVE',
    rules: DEVELOPMENT_BRAND_RULES,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };

  beforeEach(() => {
    repo = new InMemoryCreativeSceneRepository();
    permissions = new PermissionService();

    snapshotRepo = {
      create: (input): Promise<ProductSnapshot> =>
        Promise.resolve({
          id: 'new-id',
          ...input,
          createdAt: new Date(),
        }),
      findById: (id: string): Promise<ProductSnapshot | null> =>
        Promise.resolve(id === validSnapshot.id ? validSnapshot : null),
      findLatestBySku: (sku: string): Promise<ProductSnapshot | null> =>
        Promise.resolve(sku === validSnapshot.product.product.sku ? validSnapshot : null),
    };

    assetEvaluator = {
      resolveAuthoritativeHeroEvidence: (sku: string): Promise<AuthoritativeHeroEvidence> => {
        if (sku !== 'CHANEL-NO5') {
          return Promise.reject(new ProductHeroEvidenceMismatchError(`SKU ${sku} not eligible`));
        }
        return Promise.resolve(createAuthoritativeEvidence());
      },
      evaluateHeroEligibility: (): Promise<{ isEligible: boolean }> =>
        Promise.resolve({ isEligible: true }),
      assertHeroEligible: (): Promise<AuthoritativeHeroEvidence> =>
        Promise.resolve(createAuthoritativeEvidence()),
    } as unknown as ProductAssetEligibilityEvaluator;

    contentRepo = {
      findVersionById: (id: string): Promise<ContentVersion | null> =>
        Promise.resolve(id === validContentVersion.id ? validContentVersion : null),
      createJob: (): Promise<never> => Promise.reject(new Error('not implemented')),
      findJobById: (): Promise<null> => Promise.resolve(null),
      beginGeneration: (): Promise<never> => Promise.reject(new Error('not implemented')),
      completeGeneration: (): Promise<never> => Promise.reject(new Error('not implemented')),
      failGeneration: (): Promise<void> => Promise.resolve(),
      findVersionsByJobId: (): Promise<readonly ContentVersion[]> => Promise.resolve([]),
      findAttemptsByJobId: (): Promise<readonly never[]> => Promise.resolve([]),
    };

    brandRepo = {
      findById: (id: string): Promise<BrandRuleVersion | null> =>
        Promise.resolve(id === validBrandRuleVersion.id ? validBrandRuleVersion : null),
      findActive: (): Promise<BrandRuleVersion | null> => Promise.resolve(validBrandRuleVersion),
      create: (): Promise<never> => Promise.reject(new Error('not implemented')),
    };

    createUseCase = new CreateInitialSceneUseCase(
      repo,
      permissions,
      snapshotRepo,
      assetEvaluator,
      contentRepo,
      brandRepo,
    );
    reviseUseCase = new ReviseSceneUseCase(
      repo,
      permissions,
      snapshotRepo,
      assetEvaluator,
      contentRepo,
      brandRepo,
    );
    getUseCase = new GetSceneVersionUseCase(repo);
    invalidationService = new SceneInvalidationService(repo);
  });

  describe('CreateInitialSceneUseCase', () => {
    const validCreateInput: CreateInitialSceneInput = {
      requesterUserId: 'user-editor-1',
      requesterRoles: ['MARKETING_EDITOR'],
      creativeJobId: 'job-123',
      campaignId: 'camp-456',
      title: 'Chanel Campaign Poster',
      aspectRatio: '4:5',
      templateId: 'EDITORIAL_SPLIT',
      templateVersion: '1.0.0',
      language: 'EN',
      safeMargins: { top: 80, bottom: 120, left: 72, right: 72 },
      brandProfileVersionId: TEST_BRAND_PROFILE_VERSION_ID,
      sourceContentVersionId: TEST_CONTENT_VERSION_ID,
      productSnapshotId: TEST_PRODUCT_SNAPSHOT_ID,
      layers: createSampleLayers(),
    };

    it('enforces authorization: throws ForbiddenError if requesterUserId is missing or lacks EDIT_CREATIVE', async () => {
      await expect(
        createUseCase.execute({ ...validCreateInput, requesterUserId: '' }),
      ).rejects.toThrow(ForbiddenError);

      await expect(
        createUseCase.execute({ ...validCreateInput, requesterRoles: [] }),
      ).rejects.toThrow(ForbiddenError);

      expect(repo.scenes.size).toBe(0);
      expect(repo.versions.size).toBe(0);
      expect(repo.outboxEvents).toHaveLength(0);
    });

    it('creates initial scene and version 1 with deterministic hashes and mandatory outbox event', async () => {
      const result = await createUseCase.execute(validCreateInput);

      expect(result.scene.id).toBeDefined();
      expect(result.scene.currentVersionNumber).toBe(1);
      expect(result.version.versionNumber).toBe(1);
      expect(result.version.parentVersionId).toBeNull();
      expect(result.version.state?.status).toBe('DRAFT');
      expect(result.version.sceneHash).toMatch(/^[0-9a-f]{64}$/);
      expect(result.version.dependencyHash).toMatch(/^[0-9a-f]{64}$/);

      // Verify outbox event emitted
      expect(repo.outboxEvents).toHaveLength(1);
      expect(repo.outboxEvents[0]?.topic).toBe('creative.scene.version_created');
    });

    it('attaches FONT_ASSET (10..13) and TYPOGRAPHY_POLICY (20) dependencies when TYPOGRAPHY layer is present', async () => {
      const result = await createUseCase.execute(validCreateInput);
      const deps = result.version.dependencies;

      // 8 base (0..7) + 4 font assets (10..13) + 1 typography policy (20) + 1 template definition (30) = 14 dependencies
      expect(deps).toHaveLength(14);

      // Verify all 4 approved fonts are bound
      const fontDeps = deps.filter((d) => d.dependencyType === 'FONT_ASSET');
      expect(fontDeps).toHaveLength(4);
      expect(fontDeps.map((d) => d.dependencyIdentifier)).toEqual([
        'playfair-display-variable',
        'montserrat-variable',
        'noto-sans-khmer-regular',
        'noto-sans-khmer-bold',
      ]);

      fontDeps.forEach((fontDep, idx) => {
        const manifestEntry = APPROVED_FONT_MANIFEST[idx]!;
        expect(fontDep.sortOrder).toBe(10 + idx);
        expect(fontDep.evidenceIdentifier).toBe(manifestEntry.assetPath);
        const expectedDigest = computeFontAssetDigest({
          fontId: manifestEntry.id,
          fontFamily: manifestEntry.family,
          fontSha256: manifestEntry.sha256,
          byteSize: manifestEntry.byteSize,
          supportedWeights: manifestEntry.supportedWeights,
        });
        expect(fontDep.immutableDigest).toBe(expectedDigest);
      });

      // Verify typography policy
      const policyDep = deps.find((d) => d.dependencyType === 'TYPOGRAPHY_POLICY');
      expect(policyDep).toBeDefined();
      expect(policyDep?.sortOrder).toBe(20);
      expect(policyDep?.dependencyIdentifier).toBe('typography-policy-w21');
      expect(policyDep?.evidenceIdentifier).toBe(TYPOGRAPHY_POLICY_VERSION);
      const expectedPolicyDigest = computeTypographyPolicyDigest({
        policyVersion: TYPOGRAPHY_POLICY_VERSION,
        shapingEngineVersion: TYPOGRAPHY_SHAPING_ENGINE_VERSION,
        approvedFonts: APPROVED_FONT_MANIFEST.map((f) => f.id),
        normalization: 'NFC',
        bidiEnforcement: 'FAIL_CLOSED',
      });
      expect(policyDep?.immutableDigest).toBe(expectedPolicyDigest);

      // Verify template definition dependency (sortOrder: 30)
      const templateDep = deps.find((d) => d.dependencyType === 'TEMPLATE_DEFINITION');
      expect(templateDep).toBeDefined();
      expect(templateDep?.sortOrder).toBe(30);
      expect(templateDep?.dependencyIdentifier).toBe('EDITORIAL_SPLIT@1.0.0');
    });

    it('attaches sceneLayerKey to typoLayer.layerKey in verifier drafts', async () => {
      const verifier = new AuthoritativeSceneEvidenceVerifier(
        snapshotRepo,
        assetEvaluator,
        contentRepo,
        brandRepo,
      );
      const verified = await verifier.verifyAuthoritativeSceneEvidence({
        layers: createSampleLayers(),
        productSnapshotId: TEST_PRODUCT_SNAPSHOT_ID,
        sourceContentVersionId: TEST_CONTENT_VERSION_ID,
        brandProfileVersionId: TEST_BRAND_PROFILE_VERSION_ID,
      });

      const fontDeps = verified.dependencies.filter((d) => d.dependencyType === 'FONT_ASSET');
      expect(fontDeps).toHaveLength(4);
      fontDeps.forEach((d) => {
        expect(d.sceneLayerKey).toBe('typo_01');
      });

      const policyDep = verified.dependencies.find((d) => d.dependencyType === 'TYPOGRAPHY_POLICY');
      expect(policyDep?.sceneLayerKey).toBe('typo_01');
    });

    it('omits typography dependencies in verifier when layers draft has no TYPOGRAPHY layer', async () => {
      const verifier = new AuthoritativeSceneEvidenceVerifier(
        snapshotRepo,
        assetEvaluator,
        contentRepo,
        brandRepo,
      );
      const layersWithoutTypo = createSampleLayers().filter((l) => l.layerGroup !== 'TYPOGRAPHY');
      const verified = await verifier.verifyAuthoritativeSceneEvidence({
        layers: layersWithoutTypo,
        productSnapshotId: TEST_PRODUCT_SNAPSHOT_ID,
        sourceContentVersionId: TEST_CONTENT_VERSION_ID,
        brandProfileVersionId: TEST_BRAND_PROFILE_VERSION_ID,
      });

      const deps = verified.dependencies;
      expect(deps).toHaveLength(8);
      expect(deps.some((d) => d.dependencyType === 'FONT_ASSET')).toBe(false);
      expect(deps.some((d) => d.dependencyType === 'TYPOGRAPHY_POLICY')).toBe(false);
    });

    it('mutating font asset digest alters dependencyHash and sceneHash while background layerHash is unchanged', async () => {
      const v1Result = await createUseCase.execute(validCreateInput);
      const v1 = v1Result.version;
      const bgLayerV1 = v1.layers.find((l) => l.layerGroup === 'BACKGROUND')!;
      const bgLayerHashOriginal = computeLayerHash(bgLayerV1);

      // Simulate a dependency set with an altered font asset digest
      const modifiedDeps = v1.dependencies.map((d) =>
        d.dependencyIdentifier === 'noto-sans-khmer-regular'
          ? { ...d, immutableDigest: 'f'.repeat(64) }
          : d,
      );

      const modifiedDepHash = computeDependencyHash(modifiedDeps);
      expect(modifiedDepHash).not.toBe(v1.dependencyHash);

      const modifiedSceneHash = computeSceneHash({
        templateId: v1.templateId,
        templateVersion: v1.templateVersion,
        aspectRatio: v1.aspectRatio,
        width: v1.width,
        height: v1.height,
        safeMargins: v1.safeMargins,
        language: v1.language,
        stylePresetId: v1.stylePresetId,
        layers: v1.layers,
        dependencyHash: modifiedDepHash,
      });
      expect(modifiedSceneHash).not.toBe(v1.sceneHash);

      // Layer hash isolation: background layer hash remains bit-exact identical
      expect(computeLayerHash(bgLayerV1)).toBe(bgLayerHashOriginal);
    });

    it('rejects creation fail-closed on negative coordinate bounds and writes nothing', async () => {
      const invalidLayers = createSampleLayers();
      const firstLayer = invalidLayers[0]!;
      invalidLayers[0] = {
        ...firstLayer,
        bounds: { ...firstLayer.bounds, x: -50 },
      };

      await expect(
        createUseCase.execute({ ...validCreateInput, layers: invalidLayers }),
      ).rejects.toThrow(NegativeCoordinateSpaceError);

      expect(repo.scenes.size).toBe(0);
      expect(repo.versions.size).toBe(0);
      expect(repo.outboxEvents).toHaveLength(0);
    });

    it('rejects creation if PRODUCT_HERO layer is missing and writes nothing', async () => {
      const layersWithoutHero = createSampleLayers().filter((l) => l.layerGroup !== 'PRODUCT_HERO');
      await expect(
        createUseCase.execute({ ...validCreateInput, layers: layersWithoutHero }),
      ).rejects.toThrow(InvalidSceneLayerError);

      expect(repo.scenes.size).toBe(0);
      expect(repo.versions.size).toBe(0);
      expect(repo.outboxEvents).toHaveLength(0);
    });

    it('rejects creation if hero productSnapshotId mismatches input productSnapshotId', async () => {
      const mismatchedLayers = createSampleLayers();
      const hero = mismatchedLayers[2]!;
      mismatchedLayers[2] = {
        ...hero,
        payload: {
          ...hero.payload,
          productSnapshotId: '99999999-9999-4999-8999-999999999999',
        },
      };

      await expect(
        createUseCase.execute({ ...validCreateInput, layers: mismatchedLayers }),
      ).rejects.toThrow(ProductHeroEvidenceMismatchError);

      expect(repo.scenes.size).toBe(0);
      expect(repo.versions.size).toBe(0);
      expect(repo.outboxEvents).toHaveLength(0);
    });

    it('rejects creation if product snapshot is missing from authoritative repository', async () => {
      await expect(
        createUseCase.execute({
          ...validCreateInput,
          productSnapshotId: '00000000-0000-4000-8000-000000000000',
        }),
      ).rejects.toThrow(ProductHeroEvidenceMismatchError);

      expect(repo.scenes.size).toBe(0);
      expect(repo.versions.size).toBe(0);
      expect(repo.outboxEvents).toHaveLength(0);
    });

    // Part E: Comprehensive negative tests for all 19 evidence fields and relationships
    it('1. rejects creation when hero productAssetId mismatches authoritative evidence', async () => {
      const layers = createSampleLayers();
      const hero = layers[2]!;
      layers[2] = {
        ...hero,
        payload: { ...hero.payload, productAssetId: '99999999-9999-4999-8999-999999999999' },
      };

      await expect(createUseCase.execute({ ...validCreateInput, layers })).rejects.toThrow(
        ProductHeroEvidenceMismatchError,
      );
      expect(repo.scenes.size).toBe(0);
      expect(repo.versions.size).toBe(0);
      expect(repo.outboxEvents).toHaveLength(0);
    });

    it('2. rejects creation when hero productAssetRegistrationId mismatches authoritative evidence', async () => {
      const layers = createSampleLayers();
      const hero = layers[2]!;
      layers[2] = {
        ...hero,
        payload: {
          ...hero.payload,
          productAssetRegistrationId: '99999999-9999-4999-8999-999999999999',
        },
      };

      await expect(createUseCase.execute({ ...validCreateInput, layers })).rejects.toThrow(
        ProductHeroEvidenceMismatchError,
      );
      expect(repo.scenes.size).toBe(0);
      expect(repo.versions.size).toBe(0);
      expect(repo.outboxEvents).toHaveLength(0);
    });

    it('3. rejects creation when registration SKU mismatches snapshot SKU', async () => {
      assetEvaluator.resolveAuthoritativeHeroEvidence = (): Promise<AuthoritativeHeroEvidence> =>
        Promise.resolve(
          createAuthoritativeEvidence({
            registration: { sku: 'WRONG-SKU' },
          }),
        );

      await expect(createUseCase.execute(validCreateInput)).rejects.toThrow(
        ProductHeroEvidenceMismatchError,
      );
      expect(repo.scenes.size).toBe(0);
      expect(repo.versions.size).toBe(0);
      expect(repo.outboxEvents).toHaveLength(0);
    });

    it('4. rejects creation when registration productSnapshotId mismatches scene snapshot ID', async () => {
      assetEvaluator.resolveAuthoritativeHeroEvidence = (): Promise<AuthoritativeHeroEvidence> =>
        Promise.resolve(
          createAuthoritativeEvidence({
            registration: { productSnapshotId: '88888888-8888-4888-8888-888888888888' },
          }),
        );

      await expect(createUseCase.execute(validCreateInput)).rejects.toThrow(
        ProductHeroEvidenceMismatchError,
      );
      expect(repo.scenes.size).toBe(0);
      expect(repo.versions.size).toBe(0);
      expect(repo.outboxEvents).toHaveLength(0);
    });

    it('5. rejects creation when hero validationAssessmentId mismatches authoritative assessment', async () => {
      const layers = createSampleLayers();
      const hero = layers[2]!;
      layers[2] = {
        ...hero,
        payload: {
          ...hero.payload,
          validationAssessmentId: '99999999-9999-4999-8999-999999999999',
        },
      };

      await expect(createUseCase.execute({ ...validCreateInput, layers })).rejects.toThrow(
        ProductHeroEvidenceMismatchError,
      );
      expect(repo.scenes.size).toBe(0);
      expect(repo.versions.size).toBe(0);
      expect(repo.outboxEvents).toHaveLength(0);
    });

    it('6. rejects creation when assessment productAssetId mismatches asset id', async () => {
      assetEvaluator.resolveAuthoritativeHeroEvidence = (): Promise<AuthoritativeHeroEvidence> =>
        Promise.resolve(
          createAuthoritativeEvidence({
            assessment: { productAssetId: '88888888-8888-4888-8888-888888888888' },
          }),
        );

      await expect(createUseCase.execute(validCreateInput)).rejects.toThrow(
        ProductHeroEvidenceMismatchError,
      );
      expect(repo.scenes.size).toBe(0);
      expect(repo.versions.size).toBe(0);
      expect(repo.outboxEvents).toHaveLength(0);
    });

    it('7. rejects creation when hero rightsEventId mismatches authoritative rights event', async () => {
      const layers = createSampleLayers();
      const hero = layers[2]!;
      layers[2] = {
        ...hero,
        payload: { ...hero.payload, rightsEventId: '99999999-9999-4999-8999-999999999999' },
      };

      await expect(createUseCase.execute({ ...validCreateInput, layers })).rejects.toThrow(
        ProductHeroEvidenceMismatchError,
      );
      expect(repo.scenes.size).toBe(0);
      expect(repo.versions.size).toBe(0);
      expect(repo.outboxEvents).toHaveLength(0);
    });

    it('8. rejects creation when rights event registration ID mismatches registration ID', async () => {
      assetEvaluator.resolveAuthoritativeHeroEvidence = (): Promise<AuthoritativeHeroEvidence> =>
        Promise.resolve(
          createAuthoritativeEvidence({
            rightsEvent: { productAssetRegistrationId: '88888888-8888-4888-8888-888888888888' },
          }),
        );

      await expect(createUseCase.execute(validCreateInput)).rejects.toThrow(
        ProductHeroEvidenceMismatchError,
      );
      expect(repo.scenes.size).toBe(0);
      expect(repo.versions.size).toBe(0);
      expect(repo.outboxEvents).toHaveLength(0);
    });

    it('9. rejects creation when hero approvalEventId mismatches authoritative approval event', async () => {
      const layers = createSampleLayers();
      const hero = layers[2]!;
      layers[2] = {
        ...hero,
        payload: { ...hero.payload, approvalEventId: '99999999-9999-4999-8999-999999999999' },
      };

      await expect(createUseCase.execute({ ...validCreateInput, layers })).rejects.toThrow(
        ProductHeroEvidenceMismatchError,
      );
      expect(repo.scenes.size).toBe(0);
      expect(repo.versions.size).toBe(0);
      expect(repo.outboxEvents).toHaveLength(0);
    });

    it('10. rejects creation when approval event registration ID mismatches registration ID', async () => {
      assetEvaluator.resolveAuthoritativeHeroEvidence = (): Promise<AuthoritativeHeroEvidence> =>
        Promise.resolve(
          createAuthoritativeEvidence({
            approvalEvent: { productAssetRegistrationId: '88888888-8888-4888-8888-888888888888' },
          }),
        );

      await expect(createUseCase.execute(validCreateInput)).rejects.toThrow(
        ProductHeroEvidenceMismatchError,
      );
      expect(repo.scenes.size).toBe(0);
      expect(repo.versions.size).toBe(0);
      expect(repo.outboxEvents).toHaveLength(0);
    });

    it('11. rejects creation when approval event assessment ID mismatches assessment ID', async () => {
      assetEvaluator.resolveAuthoritativeHeroEvidence = (): Promise<AuthoritativeHeroEvidence> =>
        Promise.resolve(
          createAuthoritativeEvidence({
            approvalEvent: { validationAssessmentId: '88888888-8888-4888-8888-888888888888' },
          }),
        );

      await expect(createUseCase.execute(validCreateInput)).rejects.toThrow(
        ProductHeroEvidenceMismatchError,
      );
      expect(repo.scenes.size).toBe(0);
      expect(repo.versions.size).toBe(0);
      expect(repo.outboxEvents).toHaveLength(0);
    });

    it('12. rejects creation when MIME type mismatches authoritative asset MIME type', async () => {
      assetEvaluator.resolveAuthoritativeHeroEvidence = (): Promise<AuthoritativeHeroEvidence> =>
        Promise.resolve(
          createAuthoritativeEvidence({
            asset: { mimeType: 'image/webp' },
          }),
        );

      await expect(createUseCase.execute(validCreateInput)).rejects.toThrow(
        ProductHeroEvidenceMismatchError,
      );
      expect(repo.scenes.size).toBe(0);
      expect(repo.versions.size).toBe(0);
      expect(repo.outboxEvents).toHaveLength(0);
    });

    it('13. rejects creation when alpha evidence mismatches authoritative asset', async () => {
      assetEvaluator.resolveAuthoritativeHeroEvidence = (): Promise<AuthoritativeHeroEvidence> =>
        Promise.resolve(
          createAuthoritativeEvidence({
            asset: { transparencyRatio: 0.15 },
          }),
        );

      await expect(createUseCase.execute(validCreateInput)).rejects.toThrow(
        ProductHeroEvidenceMismatchError,
      );
      expect(repo.scenes.size).toBe(0);
      expect(repo.versions.size).toBe(0);
      expect(repo.outboxEvents).toHaveLength(0);
    });

    it('14. rejects creation when dimensions (width/height) mismatch authoritative asset', async () => {
      assetEvaluator.resolveAuthoritativeHeroEvidence = (): Promise<AuthoritativeHeroEvidence> =>
        Promise.resolve(
          createAuthoritativeEvidence({
            asset: { width: 800 },
          }),
        );

      await expect(createUseCase.execute(validCreateInput)).rejects.toThrow(
        ProductHeroEvidenceMismatchError,
      );
      expect(repo.scenes.size).toBe(0);
      expect(repo.versions.size).toBe(0);
      expect(repo.outboxEvents).toHaveLength(0);
    });

    it('15. rejects creation when byteSize mismatches authoritative asset', async () => {
      assetEvaluator.resolveAuthoritativeHeroEvidence = (): Promise<AuthoritativeHeroEvidence> =>
        Promise.resolve(
          createAuthoritativeEvidence({
            asset: { byteSize: 99999 },
          }),
        );

      await expect(createUseCase.execute(validCreateInput)).rejects.toThrow(
        ProductHeroEvidenceMismatchError,
      );
      expect(repo.scenes.size).toBe(0);
      expect(repo.versions.size).toBe(0);
      expect(repo.outboxEvents).toHaveLength(0);
    });

    it('16. rejects creation fail-closed when authoritative rights event is unverified or absent', async () => {
      assetEvaluator.resolveAuthoritativeHeroEvidence = (): Promise<AuthoritativeHeroEvidence> =>
        Promise.reject(new ProductAssetRightsUnverifiedError('CHANEL-NO5', 'UNVERIFIED'));

      await expect(createUseCase.execute(validCreateInput)).rejects.toThrow(
        ProductAssetRightsUnverifiedError,
      );
      expect(repo.scenes.size).toBe(0);
      expect(repo.versions.size).toBe(0);
      expect(repo.outboxEvents).toHaveLength(0);
    });

    it('17. rejects creation fail-closed when authoritative approval event is unapproved or absent', async () => {
      assetEvaluator.resolveAuthoritativeHeroEvidence = (): Promise<AuthoritativeHeroEvidence> =>
        Promise.reject(new ProductAssetUnapprovedError('CHANEL-NO5', 'REJECTED'));

      await expect(createUseCase.execute(validCreateInput)).rejects.toThrow(
        ProductAssetUnapprovedError,
      );
      expect(repo.scenes.size).toBe(0);
      expect(repo.versions.size).toBe(0);
      expect(repo.outboxEvents).toHaveLength(0);
    });

    it('18. rejects creation fail-closed when authoritative validation assessment is absent or failed', async () => {
      assetEvaluator.resolveAuthoritativeHeroEvidence = (): Promise<AuthoritativeHeroEvidence> =>
        Promise.reject(
          new ProductAssetIneligibleError('CHANEL-NO5', 'Missing validation assessment'),
        );

      await expect(createUseCase.execute(validCreateInput)).rejects.toThrow(
        ProductAssetIneligibleError,
      );
      expect(repo.scenes.size).toBe(0);
      expect(repo.versions.size).toBe(0);
      expect(repo.outboxEvents).toHaveLength(0);
    });

    it('19. rejects creation fail-closed when authoritative content version is absent', async () => {
      contentRepo.findVersionById = (): Promise<ContentVersion | null> => Promise.resolve(null);

      await expect(createUseCase.execute(validCreateInput)).rejects.toThrow(
        ProductHeroEvidenceMismatchError,
      );
      expect(repo.scenes.size).toBe(0);
      expect(repo.versions.size).toBe(0);
      expect(repo.outboxEvents).toHaveLength(0);
    });

    it('20. rejects creation fail-closed when authoritative brand rule version is absent', async () => {
      brandRepo.findById = (): Promise<BrandRuleVersion | null> => Promise.resolve(null);

      await expect(createUseCase.execute(validCreateInput)).rejects.toThrow(
        ProductHeroEvidenceMismatchError,
      );
      expect(repo.scenes.size).toBe(0);
      expect(repo.versions.size).toBe(0);
      expect(repo.outboxEvents).toHaveLength(0);
    });

    it('21. rejects creation when contentVersion productSnapshotId mismatches scene snapshot ID', async () => {
      contentRepo.findVersionById = (): Promise<ContentVersion | null> =>
        Promise.resolve({
          ...validContentVersion,
          productSnapshotId: '88888888-8888-4888-8888-888888888888',
        });

      await expect(createUseCase.execute(validCreateInput)).rejects.toThrow(
        ProductHeroEvidenceMismatchError,
      );
      expect(repo.scenes.size).toBe(0);
      expect(repo.versions.size).toBe(0);
      expect(repo.outboxEvents).toHaveLength(0);
    });

    it('22. rejects creation when contentVersion brandRuleVersionId mismatches scene brandProfileVersionId', async () => {
      contentRepo.findVersionById = (): Promise<ContentVersion | null> =>
        Promise.resolve({
          ...validContentVersion,
          brandRuleVersionId: '88888888-8888-4888-8888-888888888888',
        });

      await expect(createUseCase.execute(validCreateInput)).rejects.toThrow(
        ProductHeroEvidenceMismatchError,
      );
      expect(repo.scenes.size).toBe(0);
      expect(repo.versions.size).toBe(0);
      expect(repo.outboxEvents).toHaveLength(0);
    });
  });

  describe('ReviseSceneUseCase', () => {
    const validCreateInput: CreateInitialSceneInput = {
      requesterUserId: 'user-editor-1',
      requesterRoles: ['MARKETING_EDITOR'],
      creativeJobId: 'job-123',
      campaignId: 'camp-456',
      title: 'Chanel Campaign Poster',
      aspectRatio: '4:5',
      templateId: 'EDITORIAL_SPLIT',
      templateVersion: '1.0.0',
      language: 'EN',
      safeMargins: { top: 80, bottom: 120, left: 72, right: 72 },
      brandProfileVersionId: TEST_BRAND_PROFILE_VERSION_ID,
      sourceContentVersionId: TEST_CONTENT_VERSION_ID,
      productSnapshotId: TEST_PRODUCT_SNAPSHOT_ID,
      layers: createSampleLayers(),
    };

    it('creates version 2 with parentVersionId pointing to version 1', async () => {
      const initial = await createUseCase.execute(validCreateInput);

      const initialBgHash = computeLayerHash(initial.version.layers[0]!);
      const initialHeroHash = computeLayerHash(initial.version.layers[2]!);

      // Revise text (EDIT_TEXT)
      const revisedLayers = createSampleLayers();
      const typoLayer = revisedLayers[3]!;
      revisedLayers[3] = {
        ...typoLayer,
        payload: {
          headline: {
            text: 'Revised Headline with $0 AI Cost',
            fontFamily: 'Playfair Display',
            fontWeight: 700,
            fontSize: 48,
            color: '#1c1a17',
          },
        },
      };

      const reviseInput: ReviseSceneInput = {
        requesterUserId: 'user-editor-1',
        requesterRoles: ['MARKETING_EDITOR'],
        sceneId: initial.scene.id,
        expectedVersionNumber: 1,
        operationCode: 'EDIT_TEXT',
        changeReason: 'Updated promotion headline',
        layers: revisedLayers,
      };

      const revised = await reviseUseCase.execute(reviseInput);

      expect(revised.versionNumber).toBe(2);
      expect(revised.parentVersionId).toBe(initial.version.id);
      expect(revised.state?.status).toBe('DRAFT');

      // Invariant: Unchanged layers have IDENTICAL hashes
      const revisedBgHash = computeLayerHash(revised.layers[0]!);
      const revisedHeroHash = computeLayerHash(revised.layers[2]!);
      expect(revisedBgHash).toBe(initialBgHash);
      expect(revisedHeroHash).toBe(initialHeroHash);
    });

    it('rejects revision fail-closed on evidence mismatch and asserts no version or outbox write', async () => {
      const initial = await createUseCase.execute(validCreateInput);
      const versionCountBefore = repo.versions.size;
      const outboxCountBefore = repo.outboxEvents.length;

      const badLayers = createSampleLayers();
      const hero = badLayers[2]!;
      badLayers[2] = {
        ...hero,
        payload: { ...hero.payload, productAssetId: '88888888-8888-4888-8888-888888888888' },
      };

      await expect(
        reviseUseCase.execute({
          requesterUserId: 'user-editor-1',
          requesterRoles: ['MARKETING_EDITOR'],
          sceneId: initial.scene.id,
          expectedVersionNumber: 1,
          operationCode: 'EDIT_LAYOUT',
          changeReason: 'tampered asset id',
          layers: badLayers,
        }),
      ).rejects.toThrow(ProductHeroEvidenceMismatchError);

      expect(repo.versions.size).toBe(versionCountBefore);
      expect(repo.outboxEvents.length).toBe(outboxCountBefore);
    });

    it('emits creative.approval.rendered_ineligible when revising an APPROVED version', async () => {
      const initial = await createUseCase.execute(validCreateInput);

      // Simulate approved state on version 1
      const v1 = repo.versions.get(initial.version.id)!;
      repo.versions.set(initial.version.id, {
        ...v1,
        state: {
          ...v1.state!,
          status: 'APPROVED',
          isExportEligible: true,
        },
      });

      repo.outboxEvents = [];

      await reviseUseCase.execute({
        requesterUserId: 'user-editor-1',
        requesterRoles: ['MARKETING_EDITOR'],
        sceneId: initial.scene.id,
        expectedVersionNumber: 1,
        operationCode: 'EDIT_TEXT',
        changeReason: 'Typo fix post-approval',
        layers: createSampleLayers(),
      });

      // Verify that creative.approval.rendered_ineligible event was emitted
      const ineligibleEvt = repo.outboxEvents.find(
        (e) => e.topic === 'creative.approval.rendered_ineligible',
      );
      expect(ineligibleEvt).toBeDefined();
    });

    it('throws CreativeSceneNotFoundError for nonexistent sceneId', async () => {
      await expect(
        reviseUseCase.execute({
          requesterUserId: 'user-editor-1',
          requesterRoles: ['MARKETING_EDITOR'],
          sceneId: 'nonexistent-scene',
          expectedVersionNumber: 1,
          operationCode: 'EDIT_LAYOUT',
          changeReason: 'test',
          layers: createSampleLayers(),
        }),
      ).rejects.toThrow(CreativeSceneNotFoundError);
    });
  });

  describe('GetSceneVersionUseCase', () => {
    const validCreateInput: CreateInitialSceneInput = {
      requesterUserId: 'user-editor-1',
      requesterRoles: ['MARKETING_EDITOR'],
      creativeJobId: 'job-lookup-1',
      title: 'Lookup Test',
      aspectRatio: '4:5',
      templateId: 'EDITORIAL_SPLIT',
      templateVersion: '1.0.0',
      language: 'EN',
      safeMargins: { top: 80, bottom: 120, left: 72, right: 72 },
      brandProfileVersionId: TEST_BRAND_PROFILE_VERSION_ID,
      sourceContentVersionId: TEST_CONTENT_VERSION_ID,
      productSnapshotId: TEST_PRODUCT_SNAPSHOT_ID,
      layers: createSampleLayers(),
    };

    it('retrieves versions by id, number, and latest by scene/job', async () => {
      const created = await createUseCase.execute(validCreateInput);

      const scene = await getUseCase.getScene(created.scene.id);
      expect(scene.id).toBe(created.scene.id);

      const byId = await getUseCase.getVersionById(created.version.id);
      expect(byId.id).toBe(created.version.id);

      const byNumber = await getUseCase.getVersionByNumber(created.scene.id, 1);
      expect(byNumber.versionNumber).toBe(1);

      const latestByJob = await getUseCase.getLatestByJobId('job-lookup-1');
      expect(latestByJob.id).toBe(created.version.id);

      const latestByScene = await getUseCase.getLatestBySceneId(created.scene.id);
      expect(latestByScene.id).toBe(created.version.id);

      const versions = await getUseCase.listVersions(created.scene.id);
      expect(versions).toHaveLength(1);
    });

    it('throws CreativeSceneVersionNotFoundError when querying nonexistent version', async () => {
      await expect(getUseCase.getVersionById('nonexistent-ver')).rejects.toThrow(
        CreativeSceneVersionNotFoundError,
      );
    });
  });

  describe('SceneInvalidationService', () => {
    it('marks version as STALE_FACTS and emits outbox event on dependency divergence', async () => {
      const created = await createUseCase.execute({
        requesterUserId: 'user-editor-1',
        requesterRoles: ['MARKETING_EDITOR'],
        creativeJobId: 'job-stale-test',
        title: 'Stale Facts Test',
        aspectRatio: '4:5',
        templateId: 'EDITORIAL_SPLIT',
        templateVersion: '1.0.0',
        language: 'EN',
        safeMargins: { top: 80, bottom: 120, left: 72, right: 72 },
        brandProfileVersionId: TEST_BRAND_PROFILE_VERSION_ID,
        sourceContentVersionId: TEST_CONTENT_VERSION_ID,
        productSnapshotId: TEST_PRODUCT_SNAPSHOT_ID,
        layers: createSampleLayers(),
      });

      // Simulate approved state
      const v1 = repo.versions.get(created.version.id)!;
      repo.versions.set(created.version.id, {
        ...v1,
        state: {
          ...v1.state!,
          status: 'APPROVED',
          isExportEligible: true,
        },
      });
      const approvedVer = await repo.findVersionById(created.version.id);

      repo.outboxEvents = [];

      // Check divergence with new priceStockHash
      const assessment = await invalidationService.assessAndInvalidateIfDiverged({
        version: approvedVer!,
        currentPriceStockHash: 'ps-diverged-hash',
        reason: 'Price changed in catalog snapshot',
      });

      expect(assessment.dependencyDiverged).toBe(true);
      expect(assessment.isValid).toBe(false);

      const updated = await repo.findVersionById(created.version.id);
      expect(updated?.state?.status).toBe('STALE_FACTS');

      // Verify ineligible event emitted
      const ineligibleEvt = repo.outboxEvents.find(
        (e) => e.topic === 'creative.approval.rendered_ineligible',
      );
      expect(ineligibleEvt).toBeDefined();
    });

    it('reports isValid: true when dependencies are unchanged', async () => {
      const created = await createUseCase.execute({
        requesterUserId: 'user-editor-1',
        requesterRoles: ['MARKETING_EDITOR'],
        creativeJobId: 'job-fresh-test',
        title: 'Fresh Test',
        aspectRatio: '4:5',
        templateId: 'EDITORIAL_SPLIT',
        templateVersion: '1.0.0',
        language: 'EN',
        safeMargins: { top: 80, bottom: 120, left: 72, right: 72 },
        brandProfileVersionId: TEST_BRAND_PROFILE_VERSION_ID,
        sourceContentVersionId: TEST_CONTENT_VERSION_ID,
        productSnapshotId: TEST_PRODUCT_SNAPSHOT_ID,
        layers: createSampleLayers(),
      });

      const snapshotDigest = created.version.dependencies.find(
        (d) => d.dependencyType === 'PRODUCT_SNAPSHOT',
      )?.immutableDigest;

      const assessment = await invalidationService.assessAndInvalidateIfDiverged({
        version: created.version,
        currentPriceStockHash: snapshotDigest,
      });

      expect(assessment.dependencyDiverged).toBe(false);
      expect(assessment.isValid).toBe(true);
    });
  });
});
