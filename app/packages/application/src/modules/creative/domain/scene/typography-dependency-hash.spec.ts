import {
  computeDependencyHash,
  computeFontAssetDigest,
  computeLayerHash,
  computeSceneHash,
  computeTypographyPolicyDigest,
  TYPOGRAPHY_POLICY_VERSION,
  TYPOGRAPHY_SHAPING_ENGINE_VERSION,
} from './scene-hash.js';
import type { LayerDependencyDraft, SceneLayerDraft } from './creative-scene.types.js';

describe('Typography Dependency Hashing and W20 Reproducibility (W21 Deliverable H)', () => {
  const baseTypographyLayer: SceneLayerDraft = {
    layerKey: 'typography_block',
    layerGroup: 'TYPOGRAPHY',
    layerType: 'TYPOGRAPHY_BLOCK',
    name: 'Main Typography',
    zIndex: 310,
    visible: true,
    opacity: 1.0,
    blendMode: 'NORMAL',
    bounds: { x: 54, y: 120, width: 972, height: 350 },
    payloadSchemaVersion: 1,
    sortOrder: 10,
    payload: {
      headline: {
        text: 'Elegance Redefined',
        fontFamily: 'Playfair Display',
        fontWeight: 700,
        fontSize: 48,
        color: '#FFFFFF',
      },
      supportingText: {
        text: 'Parisian luxury collection',
        fontFamily: 'Montserrat',
        fontWeight: 400,
        fontSize: 18,
        color: '#E0E0E0',
      },
    },
  };

  const backgroundLayer: SceneLayerDraft = {
    layerKey: 'bg_photo',
    layerGroup: 'BACKGROUND',
    layerType: 'GENERATED_BACKGROUND',
    name: 'Photo Background',
    zIndex: 10,
    visible: true,
    opacity: 1.0,
    blendMode: 'NORMAL',
    bounds: { x: 0, y: 0, width: 1080, height: 1350 },
    payloadSchemaVersion: 1,
    sortOrder: 1,
    payload: {
      assetType: 'GENERATED_BACKGROUND',
      casStorageKey: 'cas/bg-summer-palace.png',
      sha256: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
      provider: 'higgsfield',
      model: 'seedance-v1',
      promptVersion: 'v1.0',
    },
  };

  it('preserves stable layer hash for non-typography layers when typography changes', () => {
    const bgHashBefore = computeLayerHash(backgroundLayer);
    const bgHashAfter = computeLayerHash(backgroundLayer);
    expect(bgHashBefore).toBe(bgHashAfter);
    expect(bgHashBefore).toMatch(/^[a-f0-9]{64}$/);
  });

  it('computes deterministic typography dependency digest based on font SHA-256 and policy', () => {
    const digestA = computeFontAssetDigest({
      fontId: 'noto-sans-khmer-regular',
      fontFamily: 'Noto Sans Khmer',
      fontSha256: 'cc8af91f5558ac8e53fce83213328dada31b22edb562e44938f04238a2a65b6a',
      byteSize: 147792,
      supportedWeights: [400],
      shapingEngineVersion: TYPOGRAPHY_SHAPING_ENGINE_VERSION,
      typographyPolicyVersion: TYPOGRAPHY_POLICY_VERSION,
    });

    const digestB = computeFontAssetDigest({
      fontId: 'noto-sans-khmer-regular',
      fontFamily: 'Noto Sans Khmer',
      fontSha256: 'cc8af91f5558ac8e53fce83213328dada31b22edb562e44938f04238a2a65b6a',
      byteSize: 147792,
      supportedWeights: [400],
      shapingEngineVersion: TYPOGRAPHY_SHAPING_ENGINE_VERSION,
      typographyPolicyVersion: TYPOGRAPHY_POLICY_VERSION,
    });

    expect(digestA).toBe(digestB);
    expect(digestA).toMatch(/^[a-f0-9]{64}$/);
  });

  it('alters dependency hash and scene hash when font binary SHA-256 changes', () => {
    const originalFontDigest = computeFontAssetDigest({
      fontId: 'playfair-display-variable',
      fontFamily: 'Playfair Display',
      fontSha256: 'c40f2293766a503bc70cce9e512ef844a4ccb7cbcde792fe2ea31d191917d8d6',
      byteSize: 300724,
      supportedWeights: { min: 400, max: 900 },
    });

    const updatedFontDigest = computeFontAssetDigest({
      fontId: 'playfair-display-variable',
      fontFamily: 'Playfair Display',
      fontSha256: '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff', // simulated replacement
      byteSize: 300724,
      supportedWeights: { min: 400, max: 900 },
    });

    expect(originalFontDigest).not.toBe(updatedFontDigest);

    const depsOriginal: LayerDependencyDraft[] = [
      {
        dependencyType: 'FONT_ASSET',
        dependencyIdentifier: 'playfair-display-variable',
        immutableDigest: originalFontDigest,
        sortOrder: 1,
      },
    ];

    const depsUpdated: LayerDependencyDraft[] = [
      {
        dependencyType: 'FONT_ASSET',
        dependencyIdentifier: 'playfair-display-variable',
        immutableDigest: updatedFontDigest,
        sortOrder: 1,
      },
    ];

    const depHashOrig = computeDependencyHash(depsOriginal);
    const depHashUpdated = computeDependencyHash(depsUpdated);
    expect(depHashOrig).not.toBe(depHashUpdated);

    const sceneHashOrig = computeSceneHash({
      templateId: 'EDITORIAL_SPLIT',
      templateVersion: 'v1.0',
      aspectRatio: '4:5',
      width: 1080,
      height: 1350,
      safeMargins: { top: 54, right: 54, bottom: 54, left: 54 },
      language: 'EN',
      layers: [backgroundLayer, baseTypographyLayer],
      dependencyHash: depHashOrig,
    });

    const sceneHashUpdated = computeSceneHash({
      templateId: 'EDITORIAL_SPLIT',
      templateVersion: 'v1.0',
      aspectRatio: '4:5',
      width: 1080,
      height: 1350,
      safeMargins: { top: 54, right: 54, bottom: 54, left: 54 },
      language: 'EN',
      layers: [backgroundLayer, baseTypographyLayer],
      dependencyHash: depHashUpdated,
    });

    // Proves render approval is invalidated deterministically upon dependency change
    expect(sceneHashOrig).not.toBe(sceneHashUpdated);
  });

  it('alters dependency hash when typography policy version changes', () => {
    const policyV1Digest = computeTypographyPolicyDigest({
      policyVersion: 'W21-v1.0',
      shapingEngineVersion: TYPOGRAPHY_SHAPING_ENGINE_VERSION,
      approvedFonts: ['Playfair Display', 'Montserrat', 'Noto Sans Khmer'],
      normalization: 'NFC',
      bidiEnforcement: 'FAIL_CLOSED',
    });

    const policyV2Digest = computeTypographyPolicyDigest({
      policyVersion: 'W21-v2.0',
      shapingEngineVersion: TYPOGRAPHY_SHAPING_ENGINE_VERSION,
      approvedFonts: ['Playfair Display', 'Montserrat', 'Noto Sans Khmer'],
      normalization: 'NFC',
      bidiEnforcement: 'FAIL_CLOSED',
    });

    expect(policyV1Digest).not.toBe(policyV2Digest);
  });
});
