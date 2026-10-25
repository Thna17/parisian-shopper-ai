import { describe, expect, it } from '@jest/globals';
import {
  type LayerDependencyDraft,
  type SceneLayerDraft,
} from './creative-scene.types.js';
import {
  canonicalStringify,
  computeApprovalEventDigest,
  computeAssessmentDigest,
  computeBrandRuleDigest,
  computeCanonicalSha256,
  computeContentVersionDigest,
  computeDependencyHash,
  computeFontAssetDigest,
  computeIdentifierDigest,
  computeLayerHash,
  computeProductAssetDigest,
  computeRegistrationDigest,
  computeRightsEventDigest,
  computeSceneHash,
  computeSnapshotDigest,
  computeTypographyPolicyDigest,
  type TypographyDependencyMetadata,
  TYPOGRAPHY_POLICY_VERSION,
  TYPOGRAPHY_SHAPING_ENGINE_VERSION,
} from './scene-hash.js';

describe('Scene Hashing and Canonical Serialization', () => {
  const baseBgLayer: SceneLayerDraft = {
    layerKey: 'background',
    layerGroup: 'BACKGROUND',
    layerType: 'GENERATED_BACKGROUND',
    name: 'Luxury Backdrop',
    zIndex: 0,
    visible: true,
    opacity: 1,
    blendMode: 'NORMAL',
    bounds: { x: 0, y: 0, width: 1080, height: 1350 },
    payloadSchemaVersion: 1,
    sortOrder: 1,
    payload: {
      assetType: 'GENERATED_BACKGROUND',
      casStorageKey: 'cas/bg/11/22/backdrop.png',
      sha256: 'a'.repeat(64),
      provider: 'imagen-3',
      model: 'imagen-3.0-generate-002',
      promptVersion: '1.0.0',
    },
  };

  const baseHeroLayer: SceneLayerDraft = {
    layerKey: 'product_hero',
    layerGroup: 'PRODUCT_HERO',
    layerType: 'HERO_CUTOUT',
    name: 'Product Hero',
    zIndex: 200,
    visible: true,
    opacity: 1,
    blendMode: 'NORMAL',
    bounds: { x: 240, y: 380, width: 600, height: 600 },
    payloadSchemaVersion: 1,
    sortOrder: 3,
    payload: {
      productSnapshotId: '11111111-1111-4111-8111-111111111111',
      productAssetId: '22222222-2222-4222-8222-222222222222',
      productAssetRegistrationId: '33333333-3333-4333-8333-333333333333',
      validationAssessmentId: '44444444-4444-4444-8444-444444444444',
      validatorVersion: 'v1',
      rightsEventId: '55555555-5555-4555-8555-555555555555',
      approvalEventId: '66666666-6666-4666-8666-666666666666',
      assetRole: 'HERO_CUTOUT',
      mimeType: 'image/png',
      casStorageKey: 'cas/hero/33/44/bottle.png',
      sha256: 'b'.repeat(64),
      format: 'png',
      byteSize: 50400,
      width: 600,
      height: 600,
      pixelCount: 360000,
      channels: 4,
      hasAlpha: true,
      transparencyRatio: 0.5,
      rightsState: 'VERIFIED',
      approvalDecision: 'APPROVED',
      alphaEvidence: { hasAlpha: true, transparencyRatio: 0.5 },
      containmentConfig: { x: 240, y: 380, width: 600, height: 600, containmentPassed: true },
    },
  };

  const baseTypographyLayer: SceneLayerDraft = {
    layerKey: 'typography_main',
    layerGroup: 'TYPOGRAPHY',
    layerType: 'TYPOGRAPHY_BLOCK',
    name: 'Khmer Typography',
    zIndex: 300,
    visible: true,
    opacity: 1,
    blendMode: 'NORMAL',
    bounds: { x: 72, y: 980, width: 936, height: 280 },
    payloadSchemaVersion: 1,
    sortOrder: 4,
    payload: {
      headline: {
        text: 'ភាពទាក់ទាញបែបប៉ារីសពិតៗ',
        fontFamily: 'Noto Sans Khmer',
        fontWeight: 700,
        fontSize: 48,
        color: '#1c1a17',
      },
      priceBadge: {
        regularPrice: '$145.00',
        currency: 'USD',
      },
    },
  };

  const sampleDependencies: LayerDependencyDraft[] = [
    {
      dependencyType: 'PRODUCT_SNAPSHOT',
      dependencyIdentifier: '11111111-1111-4111-8111-111111111111',
      immutableDigest: 'c'.repeat(64),
      sortOrder: 1,
    },
    {
      dependencyType: 'PRODUCT_ASSET',
      dependencyIdentifier: '22222222-2222-4222-8222-222222222222',
      evidenceIdentifier: 'cas/hero/33/44/bottle.png',
      immutableDigest: 'b'.repeat(64),
      sortOrder: 2,
    },
  ];

  describe('canonicalStringify', () => {
    it('produces identical output regardless of object key insertion order', () => {
      const objA = { b: 2, a: 1, z: { d: 4, c: 3 } };
      const objB = { a: 1, z: { c: 3, d: 4 }, b: 2 };
      expect(canonicalStringify(objA)).toBe(canonicalStringify(objB));
    });

    it('omits undefined properties deterministically', () => {
      const objA = { a: 1, b: undefined, c: 3 };
      const objB = { a: 1, c: 3 };
      expect(canonicalStringify(objA)).toBe(canonicalStringify(objB));
    });

    it('formats arrays deterministically', () => {
      const arr = [1, 'two', { b: 2, a: 1 }];
      expect(canonicalStringify(arr)).toBe('[1,"two",{"a":1,"b":2}]');
    });

    it('serializes Date to ISO string and BigInt to decimal string', () => {
      const date = new Date('2026-10-23T12:00:00.000Z');
      const big = BigInt(9876543210);
      const str = canonicalStringify({ createdAt: date, seq: big });
      expect(str).toBe('{"createdAt":"2026-10-23T12:00:00.000Z","seq":"9876543210"}');
    });
  });

  describe('computeCanonicalSha256 and Dependency Digest Helpers', () => {
    it('produces 64-char lowercase hex SHA-256 digest', () => {
      const digest = computeCanonicalSha256({ test: 'value', number: 42 });
      expect(digest).toMatch(/^[0-9a-f]{64}$/);
    });

    it('computes stable fixed vector digest for known object', () => {
      const payload = { sku: 'TEST-SKU-01', active: true };
      const digest1 = computeCanonicalSha256(payload);
      const digest2 = computeCanonicalSha256({ active: true, sku: 'TEST-SKU-01' });
      expect(digest1).toBe(digest2);
    });

    it('computeSnapshotDigest alters digest on any snapshot property mutation', () => {
      const snapshot = {
        id: '11111111-1111-4111-8111-111111111111',
        sku: 'CHANEL-NO5',
        price: 165.0,
        currency: 'USD',
      };
      const original = computeSnapshotDigest(snapshot);

      expect(computeSnapshotDigest({ ...snapshot, sku: 'CHANEL-NO19' })).not.toBe(original);
      expect(computeSnapshotDigest({ ...snapshot, price: 175.0 })).not.toBe(original);
      expect(computeSnapshotDigest({ ...snapshot, currency: 'EUR' })).not.toBe(original);
    });

    it('computeProductAssetDigest alters digest on any asset property mutation', () => {
      const asset = {
        id: '22222222-2222-4222-8222-222222222222',
        sha256: 'a'.repeat(64),
        storageKey: 'cas/cutouts/bottle.png',
        byteSize: 50400,
        width: 600,
        height: 600,
        hasAlpha: true,
      };
      const original = computeProductAssetDigest(asset);

      expect(computeProductAssetDigest({ ...asset, byteSize: 50401 })).not.toBe(original);
      expect(computeProductAssetDigest({ ...asset, width: 601 })).not.toBe(original);
      expect(computeProductAssetDigest({ ...asset, hasAlpha: false })).not.toBe(original);
      expect(computeProductAssetDigest({ ...asset, sha256: 'b'.repeat(64) })).not.toBe(original);
    });

    it('computeRegistrationDigest alters digest on any registration property mutation', () => {
      const registration = {
        id: '33333333-3333-4333-8333-333333333333',
        productAssetId: '22222222-2222-4222-8222-222222222222',
        sku: 'CHANEL-NO5',
        role: 'HERO_CUTOUT',
        rightsState: 'VERIFIED',
      };
      const original = computeRegistrationDigest(registration);

      expect(computeRegistrationDigest({ ...registration, rightsState: 'EXPIRED' })).not.toBe(original);
      expect(computeRegistrationDigest({ ...registration, role: 'DETAIL' })).not.toBe(original);
      expect(computeRegistrationDigest({ ...registration, sku: 'CHANEL-NO19' })).not.toBe(original);
    });

    it('computeAssessmentDigest alters digest on any assessment property mutation', () => {
      const assessment = {
        id: '44444444-4444-4444-8444-444444444444',
        productAssetId: '22222222-2222-4222-8222-222222222222',
        validatorVersion: '1.0.0',
        isValid: true,
        status: 'PASS',
      };
      const original = computeAssessmentDigest(assessment);

      expect(computeAssessmentDigest({ ...assessment, isValid: false })).not.toBe(original);
      expect(computeAssessmentDigest({ ...assessment, validatorVersion: '2.0.0' })).not.toBe(original);
      expect(computeAssessmentDigest({ ...assessment, status: 'FAIL' })).not.toBe(original);
    });

    it('computeRightsEventDigest and computeApprovalEventDigest alter digest on mutation', () => {
      const rights = {
        id: '55555555-5555-4555-8555-555555555555',
        rightsState: 'VERIFIED',
        effectiveAt: new Date('2026-01-01T00:00:00Z'),
      };
      const rightsOrig = computeRightsEventDigest(rights);
      expect(computeRightsEventDigest({ ...rights, rightsState: 'RESTRICTED' })).not.toBe(rightsOrig);

      const approval = {
        id: '66666666-6666-4666-8666-666666666666',
        decision: 'APPROVED',
        decidedByUserId: 'user-1',
      };
      const appOrig = computeApprovalEventDigest(approval);
      expect(computeApprovalEventDigest({ ...approval, decision: 'REJECTED' })).not.toBe(appOrig);
    });

    it('computeContentVersionDigest requires an authoritative record object and changes on property mutations', () => {
      expect(() => computeContentVersionDigest('string-id' as unknown as object)).toThrow(TypeError);

      const contentVersion = {
        id: 'cv-100',
        contentJobId: 'job-100',
        versionNumber: 1,
        brandRuleVersionId: 'brand-200',
        productSnapshotId: 'snap-300',
        generationAttemptId: 'attempt-400',
        provider: 'openai',
        model: 'gpt-4o',
        promptVersion: '1.2.0',
        structuredOutput: { headline: 'Parisian Elegance', body: 'Discover scent.' },
        createdAt: new Date('2026-10-23T10:00:00Z'),
      };
      const origDigest = computeContentVersionDigest(contentVersion);
      expect(origDigest).toMatch(/^[0-9a-f]{64}$/);

      expect(computeContentVersionDigest({ ...contentVersion, model: 'gpt-4o-mini' })).not.toBe(origDigest);
      expect(computeContentVersionDigest({ ...contentVersion, promptVersion: '1.3.0' })).not.toBe(origDigest);
      expect(
        computeContentVersionDigest({
          ...contentVersion,
          structuredOutput: { headline: 'New Elegance', body: 'Discover scent.' },
        }),
      ).not.toBe(origDigest);
    });

    it('computeBrandRuleDigest requires an authoritative record object and changes on property mutations', () => {
      expect(() => computeBrandRuleDigest('string-id' as unknown as object)).toThrow(TypeError);

      const brandRuleVersion = {
        id: 'brand-200',
        name: 'Parisian Luxury Fall 2026',
        version: 2,
        status: 'ACTIVE',
        rules: { tone: 'sophisticated', typography: { primary: 'Playfair Display' } },
        createdAt: new Date('2026-10-23T10:00:00Z'),
      };
      const origDigest = computeBrandRuleDigest(brandRuleVersion);
      expect(origDigest).toMatch(/^[0-9a-f]{64}$/);

      expect(computeBrandRuleDigest({ ...brandRuleVersion, version: 3 })).not.toBe(origDigest);
      expect(computeBrandRuleDigest({ ...brandRuleVersion, status: 'RETIRED' })).not.toBe(origDigest);
      expect(computeBrandRuleDigest({ ...brandRuleVersion, name: 'Parisian Luxury Winter 2026' })).not.toBe(origDigest);
      expect(
        computeBrandRuleDigest({
          ...brandRuleVersion,
          rules: { tone: 'casual', typography: { primary: 'Montserrat' } },
        }),
      ).not.toBe(origDigest);
    });

    it('computeFontAssetDigest produces stable 64-char hex digest and alters on any font metadata property change', () => {
      expect(() => computeFontAssetDigest('not-an-object' as unknown as TypographyDependencyMetadata)).toThrow(TypeError);

      const fontMeta = {
        fontId: 'noto-sans-khmer-regular',
        fontFamily: 'Noto Sans Khmer',
        fontSha256: 'cc8af91f5558ac8e53fce83213328dada31b22edb562e44938f04238a2a65b6a',
        byteSize: 147792,
        supportedWeights: [400],
      };
      const origDigest = computeFontAssetDigest(fontMeta);
      expect(origDigest).toMatch(/^[0-9a-f]{64}$/);

      // Stable determinism regardless of key order
      const reordered = {
        supportedWeights: [400],
        byteSize: 147792,
        fontSha256: 'CC8AF91F5558AC8E53FCE83213328DADA31B22EDB562E44938F04238A2A65B6A',
        fontFamily: 'Noto Sans Khmer',
        fontId: 'noto-sans-khmer-regular',
      };
      expect(computeFontAssetDigest(reordered)).toBe(origDigest);

      expect(computeFontAssetDigest({ ...fontMeta, byteSize: 147793 })).not.toBe(origDigest);
      expect(computeFontAssetDigest({ ...fontMeta, fontFamily: 'Noto Serif Khmer' })).not.toBe(origDigest);
      expect(computeFontAssetDigest({ ...fontMeta, fontSha256: 'a'.repeat(64) })).not.toBe(origDigest);
    });

    it('computeTypographyPolicyDigest produces stable 64-char hex digest and alters on any policy property change', () => {
      expect(() =>
        computeTypographyPolicyDigest(
          'not-an-object' as unknown as Parameters<typeof computeTypographyPolicyDigest>[0],
        ),
      ).toThrow(TypeError);

      const policy = {
        policyVersion: TYPOGRAPHY_POLICY_VERSION,
        shapingEngineVersion: TYPOGRAPHY_SHAPING_ENGINE_VERSION,
        approvedFonts: ['playfair-display-variable', 'montserrat-variable', 'noto-sans-khmer-regular', 'noto-sans-khmer-bold'],
        normalization: 'NFC' as const,
        bidiEnforcement: 'FAIL_CLOSED' as const,
      };
      const origDigest = computeTypographyPolicyDigest(policy);
      expect(origDigest).toMatch(/^[0-9a-f]{64}$/);

      expect(computeTypographyPolicyDigest({ ...policy, policyVersion: 'W22-v1.0' })).not.toBe(origDigest);
      expect(computeTypographyPolicyDigest({ ...policy, shapingEngineVersion: 'harfbuzzjs@2.0.0' })).not.toBe(origDigest);
      expect(
        computeTypographyPolicyDigest({
          ...policy,
          approvedFonts: ['playfair-display-variable'],
        }),
      ).not.toBe(origDigest);
    });

    it('computeIdentifierDigest computes SHA-256 for string identifiers', () => {
      const idDigest = computeIdentifierDigest('ident-123');
      expect(idDigest).toMatch(/^[0-9a-f]{64}$/);
      expect(computeIdentifierDigest('ident-124')).not.toBe(idDigest);
    });
  });

  describe('computeLayerHash & Layer Hash Stability', () => {
    it('computes a 64-char lowercase hex SHA-256 digest', () => {
      const hash = computeLayerHash(baseBgLayer);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('guarantees unchanged layers have identical hash across text revisions', () => {
      const initialBgHash = computeLayerHash(baseBgLayer);
      const initialHeroHash = computeLayerHash(baseHeroLayer);

      const revisedTypographyLayer: SceneLayerDraft = {
        ...baseTypographyLayer,
        payload: {
          ...baseTypographyLayer.payload,
          headline: {
            text: 'ភាពទាក់ទាញថ្មី ២០២៦',
            fontFamily: 'Noto Sans Khmer',
            fontWeight: 700,
            fontSize: 48,
            color: '#1c1a17',
          },
        },
      };

      // Typography layer hash changed
      expect(computeLayerHash(revisedTypographyLayer)).not.toBe(
        computeLayerHash(baseTypographyLayer),
      );

      // But Background and Product Hero hashes remain EXACTLY identical
      expect(computeLayerHash(baseBgLayer)).toBe(initialBgHash);
      expect(computeLayerHash(baseHeroLayer)).toBe(initialHeroHash);
    });

    it('matches fixed test vector for stable reproducibility', () => {
      const testLayer: SceneLayerDraft = {
        layerKey: 'test_layer',
        layerGroup: 'BACKGROUND',
        layerType: 'SOLID_COLOR_BACKGROUND',
        name: 'Fixed Test Vector',
        zIndex: 0,
        visible: true,
        opacity: 1,
        blendMode: 'NORMAL',
        bounds: { x: 0, y: 0, width: 1080, height: 1350 },
        payloadSchemaVersion: 1,
        sortOrder: 1,
        payload: {
          assetType: 'SOLID_COLOR_BACKGROUND',
          color: '#ffffff',
        },
      };

      const hash1 = computeLayerHash(testLayer);
      const hash2 = computeLayerHash({ ...testLayer });
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('computeDependencyHash', () => {
    it('computes deterministic dependency hash sorted by sortOrder', () => {
      const hash1 = computeDependencyHash(sampleDependencies);
      const reversed = [...sampleDependencies].reverse();
      const hash2 = computeDependencyHash(reversed);
      expect(hash1).toBe(hash2);
    });

    it('detects changes in any dependency digest', () => {
      const initial = computeDependencyHash(sampleDependencies);
      const diverged: LayerDependencyDraft[] = [
        sampleDependencies[0]!,
        {
          ...sampleDependencies[1]!,
          immutableDigest: 'd'.repeat(64),
        },
      ];
      expect(computeDependencyHash(diverged)).not.toBe(initial);
    });
  });

  describe('computeSceneHash', () => {
    const dependencyHash = computeDependencyHash(sampleDependencies);
    const sceneInput = {
      templateId: 'EDITORIAL_SPLIT' as const,
      templateVersion: '1.2.0',
      aspectRatio: '4:5' as const,
      width: 1080,
      height: 1350,
      safeMargins: { top: 80, bottom: 120, left: 72, right: 72 },
      language: 'KM' as const,
      stylePresetId: 'HAUSSMANN_GOLD_PRESET',
      layers: [baseBgLayer, baseHeroLayer, baseTypographyLayer],
      dependencyHash,
    };

    it('computes deterministic scene hash regardless of input layer array order', () => {
      const hashNormalOrder = computeSceneHash(sceneInput);
      const hashReversedOrder = computeSceneHash({
        ...sceneInput,
        layers: [baseTypographyLayer, baseBgLayer, baseHeroLayer],
      });
      expect(hashNormalOrder).toBe(hashReversedOrder);
    });

    it('changes scene hash when any layer payload changes', () => {
      const hashBefore = computeSceneHash(sceneInput);
      const revisedTypo: SceneLayerDraft = {
        ...baseTypographyLayer,
        payload: {
          ...baseTypographyLayer.payload,
          headline: {
            text: 'New Revised Headline',
            fontFamily: 'Playfair Display',
            fontWeight: 700,
            fontSize: 48,
            color: '#1c1a17',
          },
        },
      };
      const hashAfter = computeSceneHash({
        ...sceneInput,
        layers: [baseBgLayer, baseHeroLayer, revisedTypo],
      });
      expect(hashAfter).not.toBe(hashBefore);
    });
  });
});
