import { describe, expect, it } from '@jest/globals';
import {
  type ProductHeroPayload,
  type SceneLayerDraft,
} from './creative-scene.types.js';
import {
  assertFiniteNumber,
  validateBoundingBox,
  validateCanvasGeometry,
  validateCasStorageKey,
  validateLayerZIndex,
  validateProductHero,
  validateSafePathString,
  validateSceneGraph,
  validateSceneLayer,
  validateSha256Digest,
  validateTypographyFont,
} from './creative-scene.validator.js';
import {
  InvalidSceneLayerError,
  InvalidSceneZIndexError,
  InvalidTypographyFontError,
  InvalidTypographyWeightError,
  NegativeCoordinateSpaceError,
  SceneContainmentError,
  UnsupportedAspectRatioError,
} from './creative-scene-errors.js';

function createValidHeroPayload(): ProductHeroPayload {
  return {
    productSnapshotId: '11111111-1111-4111-8111-111111111111',
    productAssetId: '22222222-2222-4222-8222-222222222222',
    productAssetRegistrationId: '33333333-3333-4333-8333-333333333333',
    validationAssessmentId: '44444444-4444-4444-8444-444444444444',
    validatorVersion: 'product-asset-validator-v1',
    rightsEventId: '55555555-5555-4555-8555-555555555555',
    approvalEventId: '66666666-6666-4666-8666-666666666666',
    assetRole: 'HERO_CUTOUT',
    mimeType: 'image/png',
    casStorageKey: 'cas/12/34/cutout.png',
    sha256: 'b'.repeat(64),
    format: 'png',
    byteSize: 50400,
    width: 600,
    height: 600,
    pixelCount: 360000,
    channels: 4,
    hasAlpha: true,
    transparencyRatio: 0.45,
    rightsState: 'VERIFIED',
    approvalDecision: 'APPROVED',
    alphaEvidence: {
      hasAlpha: true,
      transparencyRatio: 0.45,
    },
    containmentConfig: {
      x: 240,
      y: 380,
      width: 600,
      height: 600,
      containmentPassed: true,
    },
  };
}

function createValidLayers(): SceneLayerDraft[] {
  return [
    {
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
        casStorageKey: 'cas/bg/12/34/hash.png',
        sha256: 'a'.repeat(64),
        provider: 'imagen-3',
        model: 'text2image-v1',
        promptVersion: '1.0.0',
      },
    },
    {
      layerKey: 'contact_shadow',
      layerGroup: 'SURFACE_SHADOW',
      layerType: 'CONTACT_SHADOW',
      name: 'Contact Shadow',
      zIndex: 100,
      visible: true,
      opacity: 0.5,
      blendMode: 'MULTIPLY',
      bounds: { x: 200, y: 900, width: 680, height: 120 },
      payloadSchemaVersion: 1,
      sortOrder: 2,
      payload: {
        shadowType: 'CONTACT_SHADOW',
        blurRadius: 24,
        color: '#1a1a1a',
      },
    },
    {
      layerKey: 'product_hero',
      layerGroup: 'PRODUCT_HERO',
      layerType: 'HERO_CUTOUT',
      name: 'Authentic Perfume Bottle',
      zIndex: 200,
      visible: true,
      opacity: 1,
      blendMode: 'NORMAL',
      bounds: { x: 240, y: 380, width: 600, height: 600 },
      payloadSchemaVersion: 1,
      sortOrder: 3,
      payload: createValidHeroPayload(),
    },
    {
      layerKey: 'typography_block',
      layerGroup: 'TYPOGRAPHY',
      layerType: 'TYPOGRAPHY_BLOCK',
      name: 'Main Typography',
      zIndex: 300,
      visible: true,
      opacity: 1,
      blendMode: 'NORMAL',
      bounds: { x: 72, y: 980, width: 936, height: 240 },
      payloadSchemaVersion: 1,
      sortOrder: 4,
      payload: {
        headline: {
          text: 'Parisian Elegance',
          fontFamily: 'Playfair Display',
          fontWeight: 700,
          fontSize: 48,
          color: '#1c1a17',
        },
        body: {
          text: 'Eau de Parfum 100ml',
          fontFamily: 'Montserrat',
          fontWeight: 400,
          fontSize: 24,
          color: '#555555',
        },
        priceBadge: {
          regularPrice: '$145.00',
          currency: 'USD',
        },
        cta: {
          text: 'Discover Now',
          fontFamily: 'Montserrat',
          fontWeight: 600,
          fontSize: 18,
        },
      },
    },
    {
      layerKey: 'brand_seal',
      layerGroup: 'BRAND_DECORATION',
      layerType: 'BRAND_MARK',
      name: 'Brand Seal',
      zIndex: 400,
      visible: true,
      opacity: 1,
      blendMode: 'NORMAL',
      bounds: { x: 440, y: 80, width: 200, height: 50 },
      payloadSchemaVersion: 1,
      sortOrder: 5,
      payload: {
        logoType: 'VECTOR_EMBLEM',
        color: '#1c1a17',
      },
    },
  ];
}

describe('CreativeScene Validator', () => {
  describe('assertFiniteNumber', () => {
    it('accepts finite numbers', () => {
      expect(() => assertFiniteNumber(100, 'test', 'l1')).not.toThrow();
      expect(() => assertFiniteNumber(0, 'test', 'l1')).not.toThrow();
      expect(() => assertFiniteNumber(-50.5, 'test', 'l1')).not.toThrow();
    });

    it('rejects NaN, Infinity, and -Infinity', () => {
      expect(() => assertFiniteNumber(NaN, 'test', 'l1')).toThrow(InvalidSceneLayerError);
      expect(() => assertFiniteNumber(Infinity, 'test', 'l1')).toThrow(InvalidSceneLayerError);
      expect(() => assertFiniteNumber(-Infinity, 'test', 'l1')).toThrow(InvalidSceneLayerError);
    });
  });

  describe('validateSafePathString & validateCasStorageKey', () => {
    it('accepts valid CAS storage key', () => {
      expect(() => validateCasStorageKey('cas/12/34/cutout.png', 'l1')).not.toThrow();
    });

    it('rejects absolute paths', () => {
      expect(() => validateSafePathString('/etc/passwd', 'key', 'l1')).toThrow(InvalidSceneLayerError);
    });

    it('rejects path traversal', () => {
      expect(() => validateSafePathString('cas/../../secret', 'key', 'l1')).toThrow(InvalidSceneLayerError);
    });

    it('rejects URL schemes', () => {
      expect(() => validateSafePathString('https://evil.com/img.png', 'key', 'l1')).toThrow(InvalidSceneLayerError);
      expect(() => validateSafePathString('data:image/png;base64,...', 'key', 'l1')).toThrow(InvalidSceneLayerError);
      expect(() => validateSafePathString('file:///local', 'key', 'l1')).toThrow(InvalidSceneLayerError);
    });

    it('rejects keys not starting with cas/', () => {
      expect(() => validateCasStorageKey('images/cutout.png', 'l1')).toThrow(InvalidSceneLayerError);
    });
  });

  describe('validateSha256Digest', () => {
    it('accepts strictly lowercase 64-character hex digest', () => {
      expect(() => validateSha256Digest('a'.repeat(64), 'sha256', 'l1')).not.toThrow();
    });

    it('rejects uppercase SHA-256 digest', () => {
      expect(() => validateSha256Digest('A'.repeat(64), 'sha256', 'l1')).toThrow(InvalidSceneLayerError);
    });

    it('rejects malformed digests', () => {
      expect(() => validateSha256Digest('not-a-hash', 'sha256', 'l1')).toThrow(InvalidSceneLayerError);
      expect(() => validateSha256Digest('a'.repeat(63), 'sha256', 'l1')).toThrow(InvalidSceneLayerError);
      expect(() => validateSha256Digest('a'.repeat(65), 'sha256', 'l1')).toThrow(InvalidSceneLayerError);
    });
  });

  describe('validateBoundingBox', () => {
    it('accepts non-negative coordinates and positive dimensions', () => {
      expect(() =>
        validateBoundingBox({ x: 0, y: 0, width: 100, height: 100 }, 'layer-1'),
      ).not.toThrow();
      expect(() =>
        validateBoundingBox({ x: 50, y: 80, width: 200, height: 400 }, 'layer-2'),
      ).not.toThrow();
    });

    it('rejects negative x coordinate with NegativeCoordinateSpaceError', () => {
      expect(() =>
        validateBoundingBox({ x: -10, y: 0, width: 100, height: 100 }, 'layer-x'),
      ).toThrow(NegativeCoordinateSpaceError);
    });

    it('rejects negative y coordinate with NegativeCoordinateSpaceError', () => {
      expect(() =>
        validateBoundingBox({ x: 0, y: -5, width: 100, height: 100 }, 'layer-y'),
      ).toThrow(NegativeCoordinateSpaceError);
    });

    it('rejects zero or negative width with NegativeCoordinateSpaceError', () => {
      expect(() =>
        validateBoundingBox({ x: 0, y: 0, width: 0, height: 100 }, 'layer-w0'),
      ).toThrow(NegativeCoordinateSpaceError);
      expect(() =>
        validateBoundingBox({ x: 0, y: 0, width: -50, height: 100 }, 'layer-w-neg'),
      ).toThrow(NegativeCoordinateSpaceError);
    });

    it('rejects zero or negative height with NegativeCoordinateSpaceError', () => {
      expect(() =>
        validateBoundingBox({ x: 0, y: 0, width: 100, height: 0 }, 'layer-h0'),
      ).toThrow(NegativeCoordinateSpaceError);
      expect(() =>
        validateBoundingBox({ x: 0, y: 0, width: 100, height: -20 }, 'layer-h-neg'),
      ).toThrow(NegativeCoordinateSpaceError);
    });
  });

  describe('validateLayerZIndex', () => {
    it('accepts zIndex within group boundaries', () => {
      expect(() => validateLayerZIndex('l1', 'BACKGROUND', 0)).not.toThrow();
      expect(() => validateLayerZIndex('l1', 'BACKGROUND', 99)).not.toThrow();
      expect(() => validateLayerZIndex('l2', 'SURFACE_SHADOW', 100)).not.toThrow();
      expect(() => validateLayerZIndex('l2', 'SURFACE_SHADOW', 199)).not.toThrow();
      expect(() => validateLayerZIndex('l3', 'PRODUCT_HERO', 200)).not.toThrow();
      expect(() => validateLayerZIndex('l3', 'PRODUCT_HERO', 299)).not.toThrow();
      expect(() => validateLayerZIndex('l4', 'TYPOGRAPHY', 300)).not.toThrow();
      expect(() => validateLayerZIndex('l4', 'TYPOGRAPHY', 399)).not.toThrow();
      expect(() => validateLayerZIndex('l5', 'BRAND_DECORATION', 400)).not.toThrow();
      expect(() => validateLayerZIndex('l5', 'BRAND_DECORATION', 499)).not.toThrow();
    });

    it('rejects zIndex outside group boundaries', () => {
      expect(() => validateLayerZIndex('l-bg', 'BACKGROUND', 100)).toThrow(
        InvalidSceneZIndexError,
      );
      expect(() => validateLayerZIndex('l-hero', 'PRODUCT_HERO', 150)).toThrow(
        InvalidSceneZIndexError,
      );
      expect(() => validateLayerZIndex('l-hero', 'PRODUCT_HERO', 300)).toThrow(
        InvalidSceneZIndexError,
      );
      expect(() => validateLayerZIndex('l-typo', 'TYPOGRAPHY', 250)).toThrow(
        InvalidSceneZIndexError,
      );
    });

    it('rejects fractional zIndex', () => {
      expect(() => validateLayerZIndex('l-hero', 'PRODUCT_HERO', 200.5)).toThrow(
        InvalidSceneZIndexError,
      );
    });
  });

  describe('validateProductHero (W03-DEC-004 & W12 Evidence)', () => {
    it('accepts valid HERO_CUTOUT with transparent PNG and exact evidence', () => {
      const valid = createValidHeroPayload();
      expect(() => validateProductHero(valid, 'hero-l')).not.toThrow();
      expect(() =>
        validateProductHero({ ...valid, mimeType: 'image/webp' }, 'hero-l'),
      ).not.toThrow();
    });

    it('fails closed when assetRole is not HERO_CUTOUT', () => {
      const invalid = { ...createValidHeroPayload(), assetRole: 'ORIGINAL_SOURCE' as unknown as 'HERO_CUTOUT' };
      expect(() => validateProductHero(invalid, 'hero-l')).toThrow(InvalidSceneLayerError);
    });

    it('fails closed when mimeType is opaque JPEG', () => {
      const invalid = { ...createValidHeroPayload(), mimeType: 'image/jpeg' as unknown as 'image/png' };
      expect(() => validateProductHero(invalid, 'hero-l')).toThrow(InvalidSceneLayerError);
    });

    it('fails closed when alphaEvidence hasAlpha is false', () => {
      const invalid = {
        ...createValidHeroPayload(),
        alphaEvidence: { hasAlpha: false, transparencyRatio: 0 },
      };
      expect(() => validateProductHero(invalid, 'hero-l')).toThrow(InvalidSceneLayerError);
    });

    it('fails closed when containmentPassed is false', () => {
      const invalid = {
        ...createValidHeroPayload(),
        containmentConfig: {
          ...createValidHeroPayload().containmentConfig,
          containmentPassed: false,
        },
      };
      expect(() => validateProductHero(invalid, 'hero-l')).toThrow(SceneContainmentError);
    });

    it('fails closed on missing validation or approval evidence IDs', () => {
      const invalid1 = { ...createValidHeroPayload(), validationAssessmentId: '' };
      expect(() => validateProductHero(invalid1, 'hero-l')).toThrow(InvalidSceneLayerError);

      const invalid2 = { ...createValidHeroPayload(), approvalEventId: '' };
      expect(() => validateProductHero(invalid2, 'hero-l')).toThrow(InvalidSceneLayerError);
    });
  });

  describe('validateTypographyFont (W03-DEC-007)', () => {
    it('accepts Playfair Display with weights 400 through 900', () => {
      expect(() =>
        validateTypographyFont('Playfair Display', 400, 'headline', 'l1'),
      ).not.toThrow();
      expect(() =>
        validateTypographyFont('Playfair Display', 700, 'headline', 'l1'),
      ).not.toThrow();
      expect(() =>
        validateTypographyFont('Playfair Display', 900, 'headline', 'l1'),
      ).not.toThrow();
    });

    it('rejects Playfair Display with weights below 400', () => {
      expect(() =>
        validateTypographyFont('Playfair Display', 300, 'headline', 'l1'),
      ).toThrow(InvalidTypographyWeightError);
    });

    it('rejects fractional font weights', () => {
      expect(() =>
        validateTypographyFont('Playfair Display', 400.5, 'headline', 'l1'),
      ).toThrow(InvalidTypographyWeightError);
    });

    it('accepts Montserrat with weights 100 through 900', () => {
      expect(() =>
        validateTypographyFont('Montserrat', 100, 'body', 'l1'),
      ).not.toThrow();
      expect(() =>
        validateTypographyFont('Montserrat', 400, 'body', 'l1'),
      ).not.toThrow();
      expect(() =>
        validateTypographyFont('Montserrat', 900, 'body', 'l1'),
      ).not.toThrow();
    });

    it('strictly accepts Noto Sans Khmer weights 400 and 700 only', () => {
      expect(() =>
        validateTypographyFont('Noto Sans Khmer', 400, 'headline', 'l1'),
      ).not.toThrow();
      expect(() =>
        validateTypographyFont('Noto Sans Khmer', 700, 'headline', 'l1'),
      ).not.toThrow();
    });

    it('rejects Noto Sans Khmer synthetic weights like 500, 600, 300', () => {
      expect(() =>
        validateTypographyFont('Noto Sans Khmer', 500, 'headline', 'l1'),
      ).toThrow(InvalidTypographyWeightError);
      expect(() =>
        validateTypographyFont('Noto Sans Khmer', 600, 'headline', 'l1'),
      ).toThrow(InvalidTypographyWeightError);
      expect(() =>
        validateTypographyFont('Noto Sans Khmer', 300, 'headline', 'l1'),
      ).toThrow(InvalidTypographyWeightError);
    });

    it('rejects deferred or unapproved fonts like Moul, Kantumruy Pro, Roboto', () => {
      expect(() =>
        validateTypographyFont('Moul', 400, 'headline', 'l1'),
      ).toThrow(InvalidTypographyFontError);
      expect(() =>
        validateTypographyFont('Kantumruy Pro', 400, 'headline', 'l1'),
      ).toThrow(InvalidTypographyFontError);
      expect(() =>
        validateTypographyFont('Helvetica', 400, 'headline', 'l1'),
      ).toThrow(InvalidTypographyFontError);
    });
  });

  describe('validateCanvasGeometry & Safe Margins', () => {
    const validMargins = { top: 80, bottom: 120, left: 72, right: 72 };

    it('accepts supported 1:1, 4:5, 9:16 canvases', () => {
      expect(() => validateCanvasGeometry('1:1', 1080, 1080, validMargins)).not.toThrow();
      expect(() => validateCanvasGeometry('4:5', 1080, 1350, validMargins)).not.toThrow();
      expect(() => validateCanvasGeometry('9:16', 1080, 1920, validMargins)).not.toThrow();
    });

    it('rejects unsupported aspect ratios fail-closed', () => {
      expect(() => validateCanvasGeometry('16:9', 1920, 1080, validMargins)).toThrow(
        UnsupportedAspectRatioError,
      );
    });

    it('rejects safe margins that consume or exceed canvas width/height', () => {
      expect(() =>
        validateCanvasGeometry('4:5', 1080, 1350, { top: 700, bottom: 700, left: 72, right: 72 }),
      ).toThrow(InvalidSceneLayerError);
      expect(() =>
        validateCanvasGeometry('4:5', 1080, 1350, { top: 80, bottom: 120, left: 600, right: 600 }),
      ).toThrow(InvalidSceneLayerError);
    });
  });

  describe('validateSceneGraph', () => {
    const validMargins = { top: 80, bottom: 120, left: 72, right: 72 };

    it('validates a complete, compliant scene graph', () => {
      const layers = createValidLayers();
      expect(() =>
        validateSceneGraph(layers, '4:5', 1080, 1350, validMargins),
      ).not.toThrow();
    });

    it('rejects duplicate layerKey', () => {
      const layers = createValidLayers();
      layers[1] = { ...layers[1]!, layerKey: layers[0]!.layerKey };
      expect(() =>
        validateSceneGraph(layers, '4:5', 1080, 1350, validMargins),
      ).toThrow(InvalidSceneLayerError);
    });

    it('rejects duplicate zIndex', () => {
      const layers = createValidLayers();
      layers[1] = { ...layers[1]!, zIndex: layers[0]!.zIndex };
      expect(() =>
        validateSceneGraph(layers, '4:5', 1080, 1350, validMargins),
      ).toThrow(InvalidSceneLayerError);
    });

    it('rejects duplicate sortOrder', () => {
      const layers = createValidLayers();
      layers[1] = { ...layers[1]!, sortOrder: layers[0]!.sortOrder };
      expect(() =>
        validateSceneGraph(layers, '4:5', 1080, 1350, validMargins),
      ).toThrow(InvalidSceneLayerError);
    });

    it('rejects typography layer placed outside safe margins', () => {
      const layers = createValidLayers();
      // Safe margin left is 72; placing x at 50 violates safe margin
      layers[3] = {
        ...layers[3]!,
        bounds: { ...layers[3]!.bounds, x: 50 },
      };
      expect(() =>
        validateSceneGraph(layers, '4:5', 1080, 1350, validMargins),
      ).toThrow(InvalidSceneLayerError);
    });

    it('rejects background layer not covering 100% of canvas', () => {
      const layers = createValidLayers();
      layers[0] = {
        ...layers[0]!,
        bounds: { x: 0, y: 0, width: 1000, height: 1350 },
      };
      expect(() =>
        validateSceneGraph(layers, '4:5', 1080, 1350, validMargins),
      ).toThrow(InvalidSceneLayerError);
    });
  });

  describe('Strict Runtime Zod Layer Schemas', () => {
    const validMargins = { top: 80, bottom: 120, left: 72, right: 72 };

    it('rejects unknown properties in BACKGROUND payload', () => {
      const layer = {
        layerKey: 'background',
        layerGroup: 'BACKGROUND' as const,
        layerType: 'GENERATED_BACKGROUND' as const,
        name: 'Backdrop',
        zIndex: 0,
        visible: true,
        opacity: 1,
        blendMode: 'NORMAL' as const,
        bounds: { x: 0, y: 0, width: 1080, height: 1350 },
        payloadSchemaVersion: 1,
        sortOrder: 1,
        payload: {
          assetType: 'GENERATED_BACKGROUND',
          provider: 'imagen-3',
          unauthorizedExtraProperty: 'forbidden',
        },
      };
      expect(() => validateSceneLayer(layer as unknown as SceneLayerDraft, 1080, 1350, validMargins)).toThrow(
        InvalidSceneLayerError,
      );
    });

    it('rejects unknown properties in PRODUCT_HERO payload', () => {
      const heroPayload: Record<string, unknown> = {
        ...createValidHeroPayload(),
        unknownField: 'malicious',
      };
      const layer = {
        layerKey: 'product_hero',
        layerGroup: 'PRODUCT_HERO' as const,
        layerType: 'HERO_CUTOUT' as const,
        name: 'Hero',
        zIndex: 200,
        visible: true,
        opacity: 1,
        blendMode: 'NORMAL' as const,
        bounds: { x: 240, y: 380, width: 600, height: 600 },
        payloadSchemaVersion: 1,
        sortOrder: 2,
        payload: heroPayload,
      };
      expect(() => validateSceneLayer(layer as unknown as SceneLayerDraft, 1080, 1350, validMargins)).toThrow(
        InvalidSceneLayerError,
      );
    });

    it('rejects unknown properties in TYPOGRAPHY payload', () => {
      const layer = {
        layerKey: 'typo',
        layerGroup: 'TYPOGRAPHY' as const,
        layerType: 'TYPOGRAPHY_BLOCK' as const,
        name: 'Text',
        zIndex: 300,
        visible: true,
        opacity: 1,
        blendMode: 'NORMAL' as const,
        bounds: { x: 72, y: 980, width: 936, height: 240 },
        payloadSchemaVersion: 1,
        sortOrder: 3,
        payload: {
          headline: {
            text: 'Test',
            fontFamily: 'Montserrat',
            fontWeight: 700,
            fontSize: 48,
            color: '#000000',
            extraTypoField: true,
          },
        },
      };
      expect(() => validateSceneLayer(layer as unknown as SceneLayerDraft, 1080, 1350, validMargins)).toThrow(
        InvalidSceneLayerError,
      );
    });

    it('rejects unknown properties on the whole layer object', () => {
      const layer = {
        layerKey: 'bg',
        layerGroup: 'BACKGROUND' as const,
        layerType: 'SOLID_COLOR_BACKGROUND',
        name: 'Bg',
        zIndex: 0,
        visible: true,
        opacity: 1,
        blendMode: 'NORMAL' as const,
        bounds: { x: 0, y: 0, width: 1080, height: 1350 },
        payloadSchemaVersion: 1,
        sortOrder: 1,
        payload: {
          assetType: 'SOLID_COLOR_BACKGROUND' as const,
          color: '#ffffff',
        },
        unexpectedTopLevelProperty: 12345,
      };
      expect(() =>
        validateSceneLayer(layer as unknown as SceneLayerDraft, 1080, 1350, validMargins),
      ).toThrow(InvalidSceneLayerError);
    });

    it('rejects malformed payload values (e.g. invalid blendMode or negative opacity)', () => {
      const layer = {
        layerKey: 'bg',
        layerGroup: 'BACKGROUND' as const,
        layerType: 'SOLID_COLOR_BACKGROUND',
        name: 'Bg',
        zIndex: 0,
        visible: true,
        opacity: -0.5,
        blendMode: 'INVALID_BLEND' as const,
        bounds: { x: 0, y: 0, width: 1080, height: 1350 },
        payloadSchemaVersion: 1,
        sortOrder: 1,
        payload: {
          assetType: 'SOLID_COLOR_BACKGROUND' as const,
          color: '#ffffff',
        },
      };
      expect(() =>
        validateSceneLayer(layer as unknown as SceneLayerDraft, 1080, 1350, validMargins),
      ).toThrow(InvalidSceneLayerError);
    });
  });

  describe('True Layer-Type and Payload Discrimination (Part D)', () => {
    const validMargins = { top: 80, bottom: 120, left: 72, right: 72 };

    it('accepts valid GENERATED_BACKGROUND payload with complete provenance', () => {
      const layer: SceneLayerDraft = {
        layerKey: 'bg_gen',
        layerGroup: 'BACKGROUND',
        layerType: 'GENERATED_BACKGROUND',
        name: 'AI Backdrop',
        zIndex: 0,
        visible: true,
        opacity: 1,
        blendMode: 'NORMAL',
        bounds: { x: 0, y: 0, width: 1080, height: 1350 },
        payloadSchemaVersion: 1,
        sortOrder: 1,
        payload: {
          assetType: 'GENERATED_BACKGROUND',
          casStorageKey: 'cas/bg/imagen.png',
          sha256: 'a'.repeat(64),
          provider: 'imagen-3',
          model: 'text2image-v1',
          promptVersion: '1.0.0',
        },
      };
      expect(() => validateSceneLayer(layer, 1080, 1350, validMargins)).not.toThrow();
    });

    it('rejects GENERATED_BACKGROUND with solid-color-only payload', () => {
      const layer: SceneLayerDraft = {
        layerKey: 'bg_gen',
        layerGroup: 'BACKGROUND',
        layerType: 'GENERATED_BACKGROUND',
        name: 'AI Backdrop',
        zIndex: 0,
        visible: true,
        opacity: 1,
        blendMode: 'NORMAL',
        bounds: { x: 0, y: 0, width: 1080, height: 1350 },
        payloadSchemaVersion: 1,
        sortOrder: 1,
        payload: {
          assetType: 'GENERATED_BACKGROUND',
          color: '#ffffff',
        } as unknown as SceneLayerDraft['payload'],
      };
      expect(() => validateSceneLayer(layer, 1080, 1350, validMargins)).toThrow(
        InvalidSceneLayerError,
      );
    });

    it('accepts valid STATIC_CAS_BACKGROUND payload', () => {
      const layer: SceneLayerDraft = {
        layerKey: 'bg_cas',
        layerGroup: 'BACKGROUND',
        layerType: 'STATIC_CAS_BACKGROUND',
        name: 'Static CAS Backdrop',
        zIndex: 0,
        visible: true,
        opacity: 1,
        blendMode: 'NORMAL',
        bounds: { x: 0, y: 0, width: 1080, height: 1350 },
        payloadSchemaVersion: 1,
        sortOrder: 1,
        payload: {
          assetType: 'STATIC_CAS_BACKGROUND',
          casStorageKey: 'cas/bg/studio.png',
          sha256: 'b'.repeat(64),
        },
      };
      expect(() => validateSceneLayer(layer, 1080, 1350, validMargins)).not.toThrow();
    });

    it('rejects STATIC_CAS_BACKGROUND containing generator provenance fields', () => {
      const layer: SceneLayerDraft = {
        layerKey: 'bg_cas',
        layerGroup: 'BACKGROUND',
        layerType: 'STATIC_CAS_BACKGROUND',
        name: 'Static CAS Backdrop',
        zIndex: 0,
        visible: true,
        opacity: 1,
        blendMode: 'NORMAL',
        bounds: { x: 0, y: 0, width: 1080, height: 1350 },
        payloadSchemaVersion: 1,
        sortOrder: 1,
        payload: {
          assetType: 'STATIC_CAS_BACKGROUND',
          casStorageKey: 'cas/bg/studio.png',
          sha256: 'b'.repeat(64),
          provider: 'imagen-3', // forbidden on static CAS background
        } as unknown as SceneLayerDraft['payload'],
      };
      expect(() => validateSceneLayer(layer, 1080, 1350, validMargins)).toThrow(
        InvalidSceneLayerError,
      );
    });

    it('accepts valid SOLID_COLOR_BACKGROUND payload and rejects CAS fields', () => {
      const validLayer: SceneLayerDraft = {
        layerKey: 'bg_solid',
        layerGroup: 'BACKGROUND',
        layerType: 'SOLID_COLOR_BACKGROUND',
        name: 'Solid White',
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
      expect(() => validateSceneLayer(validLayer, 1080, 1350, validMargins)).not.toThrow();

      const invalidLayer: SceneLayerDraft = {
        ...validLayer,
        payload: {
          assetType: 'SOLID_COLOR_BACKGROUND',
          color: '#ffffff',
          casStorageKey: 'cas/bg/unwanted.png',
        } as unknown as SceneLayerDraft['payload'],
      };
      expect(() => validateSceneLayer(invalidLayer, 1080, 1350, validMargins)).toThrow(
        InvalidSceneLayerError,
      );
    });

    it('accepts valid GRADIENT_BACKGROUND payload and rejects non-gradient payloads', () => {
      const validLayer: SceneLayerDraft = {
        layerKey: 'bg_grad',
        layerGroup: 'BACKGROUND',
        layerType: 'GRADIENT_BACKGROUND',
        name: 'Linear Gradient',
        zIndex: 0,
        visible: true,
        opacity: 1,
        blendMode: 'NORMAL',
        bounds: { x: 0, y: 0, width: 1080, height: 1350 },
        payloadSchemaVersion: 1,
        sortOrder: 1,
        payload: {
          assetType: 'GRADIENT_BACKGROUND',
          gradient: {
            type: 'LINEAR',
            stops: [
              { color: '#ffffff', offset: 0 },
              { color: '#000000', offset: 1 },
            ],
          },
        },
      };
      expect(() => validateSceneLayer(validLayer, 1080, 1350, validMargins)).not.toThrow();

      const invalidLayer: SceneLayerDraft = {
        ...validLayer,
        payload: {
          assetType: 'GRADIENT_BACKGROUND',
          color: '#ffffff', // missing gradient object
        } as unknown as SceneLayerDraft['payload'],
      };
      expect(() => validateSceneLayer(invalidLayer, 1080, 1350, validMargins)).toThrow(
        InvalidSceneLayerError,
      );
    });

    it('accepts each SurfaceShadow layer type only with its matching shadowType', () => {
      const contactLayer: SceneLayerDraft = {
        layerKey: 'sh_contact',
        layerGroup: 'SURFACE_SHADOW',
        layerType: 'CONTACT_SHADOW',
        name: 'Contact Shadow',
        zIndex: 100,
        visible: true,
        opacity: 0.6,
        blendMode: 'MULTIPLY',
        bounds: { x: 200, y: 800, width: 680, height: 100 },
        payloadSchemaVersion: 1,
        sortOrder: 2,
        payload: {
          shadowType: 'CONTACT_SHADOW',
          blurRadius: 15,
          color: '#111111',
        },
      };
      expect(() => validateSceneLayer(contactLayer, 1080, 1350, validMargins)).not.toThrow();

      // Mismatched shadowType throws
      const mismatchedLayer: SceneLayerDraft = {
        ...contactLayer,
        payload: {
          shadowType: 'PEDESTAL_SURFACE', // Mismatched!
          blurRadius: 15,
          color: '#111111',
        } as unknown as SceneLayerDraft['payload'],
      };
      expect(() => validateSceneLayer(mismatchedLayer, 1080, 1350, validMargins)).toThrow(
        InvalidSceneLayerError,
      );

      // PEDESTAL_SURFACE accepts only PEDESTAL_SURFACE
      const pedestalLayer: SceneLayerDraft = {
        ...contactLayer,
        layerKey: 'sh_pedestal',
        layerType: 'PEDESTAL_SURFACE',
        payload: {
          shadowType: 'PEDESTAL_SURFACE',
          blurRadius: 30,
          color: '#222222',
        },
      };
      expect(() => validateSceneLayer(pedestalLayer, 1080, 1350, validMargins)).not.toThrow();

      // DIRECTIONAL_DROP accepts only DIRECTIONAL_DROP
      const dropLayer: SceneLayerDraft = {
        ...contactLayer,
        layerKey: 'sh_drop',
        layerType: 'DIRECTIONAL_DROP',
        payload: {
          shadowType: 'DIRECTIONAL_DROP',
          blurRadius: 40,
          color: '#333333',
        },
      };
      expect(() => validateSceneLayer(dropLayer, 1080, 1350, validMargins)).not.toThrow();
    });

    it('accepts BrandDecoration types only with their relevant payload structures', () => {
      // BRAND_MARK accepts logoType
      const markLayer: SceneLayerDraft = {
        layerKey: 'brand_logo',
        layerGroup: 'BRAND_DECORATION',
        layerType: 'BRAND_MARK',
        name: 'Brand Logo',
        zIndex: 400,
        visible: true,
        opacity: 1,
        blendMode: 'NORMAL',
        bounds: { x: 100, y: 100, width: 200, height: 60 },
        payloadSchemaVersion: 1,
        sortOrder: 5,
        payload: {
          logoType: 'VECTOR_EMBLEM',
          color: '#d4af37',
        },
      };
      expect(() => validateSceneLayer(markLayer, 1080, 1350, validMargins)).not.toThrow();

      // BRAND_MARK rejects divider
      const markWithDivider: SceneLayerDraft = {
        ...markLayer,
        payload: {
          logoType: 'VECTOR_EMBLEM',
          divider: 'SOLID_LINE', // forbidden on BRAND_MARK
        } as unknown as SceneLayerDraft['payload'],
      };
      expect(() => validateSceneLayer(markWithDivider, 1080, 1350, validMargins)).toThrow(
        InvalidSceneLayerError,
      );

      // BRAND_DIVIDER accepts divider and rejects logoType
      const dividerLayer: SceneLayerDraft = {
        ...markLayer,
        layerKey: 'brand_div',
        layerType: 'BRAND_DIVIDER',
        payload: {
          divider: 'DOUBLE_HAIRLINE',
          color: '#d4af37',
          thicknessPx: 2,
        },
      };
      expect(() => validateSceneLayer(dividerLayer, 1080, 1350, validMargins)).not.toThrow();

      const dividerWithLogo: SceneLayerDraft = {
        ...dividerLayer,
        payload: {
          divider: 'DOUBLE_HAIRLINE',
          color: '#d4af37',
          logoType: 'VECTOR_EMBLEM', // forbidden on BRAND_DIVIDER
        } as unknown as SceneLayerDraft['payload'],
      };
      expect(() => validateSceneLayer(dividerWithLogo, 1080, 1350, validMargins)).toThrow(
        InvalidSceneLayerError,
      );

      // BRAND_FRAME accepts frame and rejects divider
      const frameLayer: SceneLayerDraft = {
        ...markLayer,
        layerKey: 'brand_frm',
        layerType: 'BRAND_FRAME',
        payload: {
          frame: 'INSET_BORDER',
          color: '#d4af37',
          insetPx: 40,
        },
      };
      expect(() => validateSceneLayer(frameLayer, 1080, 1350, validMargins)).not.toThrow();

      const frameWithDivider: SceneLayerDraft = {
        ...frameLayer,
        payload: {
          frame: 'INSET_BORDER',
          color: '#d4af37',
          divider: 'SOLID_LINE', // forbidden on BRAND_FRAME
        },
      };
      expect(() => validateSceneLayer(frameWithDivider, 1080, 1350, validMargins)).toThrow(
        InvalidSceneLayerError,
      );
    });

    it('rejects cross-group layerGroup and layerType mismatch', () => {
      const mismatchedGroupLayer: SceneLayerDraft = {
        layerKey: 'bad_group',
        layerGroup: 'BACKGROUND',
        layerType: 'CONTACT_SHADOW', // Belongs to SURFACE_SHADOW, not BACKGROUND
        name: 'Bad Group',
        zIndex: 0,
        visible: true,
        opacity: 1,
        blendMode: 'NORMAL',
        bounds: { x: 0, y: 0, width: 1080, height: 1350 },
        payloadSchemaVersion: 1,
        sortOrder: 1,
        payload: {
          shadowType: 'CONTACT_SHADOW',
          blurRadius: 10,
          color: '#000000',
        },
      };
      expect(() => validateSceneLayer(mismatchedGroupLayer, 1080, 1350, validMargins)).toThrow(
        InvalidSceneLayerError,
      );
    });
  });
});
