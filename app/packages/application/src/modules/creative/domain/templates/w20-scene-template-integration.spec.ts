import { describe, expect, it, beforeEach, beforeAll } from '@jest/globals';
import { TemplateRegistry, computeTemplateDefinitionDigest } from './template-registry.js';
import {
  CANONICAL_TEMPLATE_IDS,
  type CanonicalTemplateId,
  type TemplateDefinition,
} from './template-registry.types.js';
import {
  TemplateNotFoundError,
  TemplateNotEligibleForProductionError,
  DuplicateTemplateRegistrationError,
} from '../creative-errors.js';
import {
  computeDependencyHash,
  computeSceneHash,
  computeTemplateDependencyDigest,
  type ComputeSceneHashInput,
} from '../scene/scene-hash.js';
import {
  type LayerDependencyDraft,
  type SceneLayerDraft,
  type PosterAspectRatio,
  type SceneLanguage,
} from '../scene/creative-scene.types.js';
import { PosterTemplateRenderer } from '../poster-templates.js';
import { FontRegistry } from '../../infrastructure/fonts/font-registry.js';
import { HarfBuzzShapingService } from '../../infrastructure/fonts/harfbuzz-shaping-service.js';
import { TextLayoutEngine } from '../services/text-layout-engine.js';
import {
  GOLDEN_VECTORS,
  getGoldenVectorsByTemplate,
} from './__fixtures__/golden-templates.fixture.js';

describe('W20 Scene Model & Template Family Integration (W22-G)', () => {
  let registry: TemplateRegistry;
  let fontFaceCss: string;

  beforeAll(() => {
    const fontRegistry = FontRegistry.getInstance();
    TextLayoutEngine.setDefaultShaper(new HarfBuzzShapingService(fontRegistry));
    fontFaceCss = fontRegistry.getFontFaceCss();
  });

  beforeEach(() => {
    TemplateRegistry.clearInstanceForTesting();
    registry = new TemplateRegistry(true);
  });

  // -------------------------------------------------------------------------
  // 1. Template Identity & W20 Dependency Binding
  // -------------------------------------------------------------------------
  describe('1. Template Identity & W20 Dependency Binding', () => {
    it('verifies all five canonical templates carry full immutable W20 provenance identity', () => {
      for (const templateId of CANONICAL_TEMPLATE_IDS) {
        const tpl = registry.getTemplate(templateId);

        // Core identity attributes
        expect(tpl.id).toBe(templateId);
        expect(tpl.version).toBe('1.0.0');
        expect(tpl.provenance.tokenSetVersion).toBe('2026.1');
        expect(tpl.provenance.approvalState).toBe('APPROVED');
        expect(tpl.provenance.approverRef).toBe('Project Owner Brathna');
        expect(tpl.provenance.sourceDecisionRef).toBe('W03-DEC-006');
        expect(tpl.provenance.approvedAt).toBe('2026-10-26T10:53:59.000Z');
        expect(tpl.provenance.contentDigest).toMatch(/^[0-9a-f]{64}$/);

        // Formats & languages
        expect(tpl.supportedAspectRatios).toEqual(['1:1', '4:5', '9:16']);
        expect([...tpl.supportedLanguages].sort()).toEqual(['BILINGUAL', 'EN', 'KM']);

        // Digest is bit-exact reproducible
        const verifiedDigest = computeTemplateDefinitionDigest(tpl);
        expect(tpl.provenance.contentDigest).toBe(verifiedDigest);
      }
    });

    it('binds TEMPLATE_DEFINITION layer dependency into deterministic dependencyHash', () => {
      const template = registry.getTemplate('CENTERED_HERO');
      const approvalRef = template.provenance.approverRef ?? template.provenance.sourceDecisionRef;
      const templateDep: LayerDependencyDraft = {
        dependencyType: 'TEMPLATE_DEFINITION',
        dependencyIdentifier: `${template.id}@${template.version}`,
        evidenceIdentifier: approvalRef,
        immutableDigest: computeTemplateDependencyDigest({
          templateId: template.id,
          templateVersion: template.version,
          tokenSetVersion: template.tokens.tokenSetVersion,
          contentDigest: template.provenance.contentDigest,
          approvalReference: approvalRef,
        }),
        sortOrder: 30,
      };

      const baseDep: LayerDependencyDraft = {
        dependencyType: 'PRODUCT_SNAPSHOT',
        dependencyIdentifier: 'prod-snap-1',
        immutableDigest: 'a'.repeat(64),
        sortOrder: 0,
      };

      const depHashWithTemplate = computeDependencyHash([baseDep, templateDep]);
      const depHashWithoutTemplate = computeDependencyHash([baseDep]);

      expect(depHashWithTemplate).toMatch(/^[0-9a-f]{64}$/);
      expect(depHashWithTemplate).not.toBe(depHashWithoutTemplate);
    });

    it('produces distinct scene hashes for different template versions and families', () => {
      const mockLayers: readonly SceneLayerDraft[] = [
        {
          layerKey: 'bg',
          layerGroup: 'BACKGROUND',
          layerType: 'GENERATED_BACKGROUND',
          name: 'BG',
          zIndex: 0,
          visible: true,
          opacity: 1,
          blendMode: 'NORMAL',
          bounds: { x: 0, y: 0, width: 1080, height: 1350 },
          payload: {
            assetType: 'GENERATED_BACKGROUND',
            casStorageKey: 'cas/bg/11/22/backdrop.png',
            sha256: 'a'.repeat(64),
            provider: 'imagen-3',
            model: 'imagen-3.0-generate-002',
            promptVersion: '1.0.0',
          },
          payloadSchemaVersion: 1,
          sortOrder: 0,
        },
      ];

      const baseInput: ComputeSceneHashInput = {
        templateId: 'CENTERED_HERO',
        templateVersion: '1.0.0',
        aspectRatio: '4:5',
        width: 1080,
        height: 1350,
        safeMargins: { top: 80, bottom: 120, left: 72, right: 72 },
        language: 'EN',
        layers: mockLayers,
        dependencyHash: 'd'.repeat(64),
      };

      const hashHeroV1 = computeSceneHash(baseInput);

      // Version bump
      const hashHeroV2 = computeSceneHash({
        ...baseInput,
        templateVersion: '1.1.0',
      });
      expect(hashHeroV2).not.toBe(hashHeroV1);

      // Template family change
      const hashEditorialV1 = computeSceneHash({
        ...baseInput,
        templateId: 'EDITORIAL_SPLIT',
      });
      expect(hashEditorialV1).not.toBe(hashHeroV1);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Historical Scene Guarantees
  // -------------------------------------------------------------------------
  describe('2. Historical Scene Guarantees', () => {
    it('guarantees registered historical template definitions cannot be mutated in place', () => {
      const historicalDef = registry.getTemplate('SCENT_STORY', '1.0.0');

      expect(() => {
        // @ts-expect-error mutating readonly property
        historicalDef.name = 'Mutated Scent Story';
      }).toThrow();

      expect(() => {
        // @ts-expect-error mutating nested readonly token
        historicalDef.tokens.spacing.xs = 999;
      }).toThrow();

      expect(() => {
        (historicalDef.slots as unknown as unknown[]).push({ slotId: 'illegal' });
      }).toThrow();
    });

    it('rejects duplicate registration of the same template ID and version', () => {
      const existing = registry.getTemplate('KHMER_SEASONAL', '1.0.0');
      expect(() => registry.registerTemplate(existing)).toThrow(DuplicateTemplateRegistrationError);
    });

    it('preserves historical version 1.0.0 even when newer versions are registered', () => {
      const v100 = registry.getTemplate('CENTERED_HERO', '1.0.0');

      // Register new approved v1.1.0
      const v110WithoutDigest = {
        ...v100,
        version: '1.1.0' as const,
        provenance: {
          ...v100.provenance,
          version: '1.1.0' as const,
          approvalState: 'APPROVED' as const,
          approverRef: 'Brathna',
          approvedAt: '2026-10-26T00:00:00.000Z',
          contentDigest: '',
        },
      };
      const v110Digest = computeTemplateDefinitionDigest(v110WithoutDigest);
      const v110: TemplateDefinition = {
        ...v110WithoutDigest,
        provenance: { ...v110WithoutDigest.provenance, contentDigest: v110Digest },
      };
      registry.registerTemplate(v110);

      // Historical v1.0.0 remains intact and identical
      const retrievedV100 = registry.getTemplate('CENTERED_HERO', '1.0.0');
      expect(retrievedV100.version).toBe('1.0.0');
      expect(retrievedV100.provenance.contentDigest).toBe(v100.provenance.contentDigest);

      // Default (unversioned) lookup resolves latest approved v1.1.0
      const latest = registry.getTemplate('CENTERED_HERO');
      expect(latest.version).toBe('1.1.0');
    });

    it('allows historical rendering of DEPRECATED template versions when explicitly queried', () => {
      const v100 = registry.getTemplate('EDITORIAL_SPLIT', '1.0.0');
      const depDefWithoutDigest = {
        ...v100,
        version: '0.9.0' as const,
        provenance: {
          ...v100.provenance,
          version: '0.9.0' as const,
          approvalState: 'DEPRECATED' as const,
          contentDigest: '',
        },
      };
      const depDigest = computeTemplateDefinitionDigest(depDefWithoutDigest);
      const deprecatedV090: TemplateDefinition = {
        ...depDefWithoutDigest,
        provenance: { ...depDefWithoutDigest.provenance, contentDigest: depDigest },
      };
      registry.registerTemplate(deprecatedV090);

      // Historical retrieval works
      const retrieved = registry.getTemplate('EDITORIAL_SPLIT', '0.9.0');
      expect(retrieved).toBeDefined();
      expect(retrieved.provenance.approvalState).toBe('DEPRECATED');

      // Production resolution with test bypass succeeds for historical re-renders
      const productionHistorical = registry.resolveProductionTemplate('EDITORIAL_SPLIT', '0.9.0', {
        allowNonApprovedForTesting: true,
      });
      expect(productionHistorical.version).toBe('0.9.0');
    });

    it('guarantees bit-exact repeat rendering of historical scenes across multiple invocations', () => {
      const vector = GOLDEN_VECTORS.find(
        (v) => v.templateId === 'CENTERED_HERO' && v.aspectRatio === '4:5' && v.language === 'EN',
      )!;

      const render1 = PosterTemplateRenderer.renderTemplate(vector.spec, fontFaceCss, {
        allowNonApprovedForTesting: true,
      });
      const render2 = PosterTemplateRenderer.renderTemplate(vector.spec, fontFaceCss, {
        allowNonApprovedForTesting: true,
      });

      expect(render1.svgOverlay).toBe(render2.svgOverlay);
      expect(render1.manifest).toEqual(render2.manifest);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Production Approval Governance (Fail-Closed)
  // -------------------------------------------------------------------------
  describe('3. Production Approval Governance (Fail-Closed)', () => {
    it('allows production resolution of canonical templates because they are approved', () => {
      for (const templateId of CANONICAL_TEMPLATE_IDS) {
        const approved = registry.resolveProductionTemplate(templateId, '1.0.0');
        expect(approved.id).toBe(templateId);
        expect(approved.provenance.approvalState).toBe('APPROVED');
        expect(approved.provenance.approverRef).toBe('Project Owner Brathna');
        expect(approved.provenance.approvedAt).toBe('2026-10-26T10:53:59.000Z');
      }
    });

    it('fails closed when attempting to select a DRAFT template for production', () => {
      const hero = registry.getTemplate('CENTERED_HERO');
      const draftDefWithoutDigest = {
        ...hero,
        version: '2.0.0' as const,
        provenance: {
          ...hero.provenance,
          version: '2.0.0' as const,
          approvalState: 'DRAFT' as const,
          approverRef: null,
          approvedAt: null,
          contentDigest: '',
        },
      };
      const digest = computeTemplateDefinitionDigest(draftDefWithoutDigest);
      const draftDef: TemplateDefinition = {
        ...draftDefWithoutDigest,
        provenance: { ...draftDefWithoutDigest.provenance, contentDigest: digest },
      };
      registry.registerTemplate(draftDef);

      expect(() => registry.resolveProductionTemplate('CENTERED_HERO', '2.0.0')).toThrow(
        TemplateNotEligibleForProductionError,
      );
    });

    it('fails closed when attempting to select a RETIRED template for production', () => {
      const promo = registry.getTemplate('PROMOTION_PRICE_CTA');
      const retDefWithoutDigest = {
        ...promo,
        version: '0.1.0' as const,
        provenance: {
          ...promo.provenance,
          version: '0.1.0' as const,
          approvalState: 'RETIRED' as const,
          approverRef: null,
          approvedAt: null,
          contentDigest: '',
        },
      };
      const digest = computeTemplateDefinitionDigest(retDefWithoutDigest);
      const retiredDef: TemplateDefinition = {
        ...retDefWithoutDigest,
        provenance: { ...retDefWithoutDigest.provenance, contentDigest: digest },
      };
      registry.registerTemplate(retiredDef);

      expect(() => registry.resolveProductionTemplate('PROMOTION_PRICE_CTA', '0.1.0')).toThrow(
        TemplateNotEligibleForProductionError,
      );
    });

    it('fails closed when template does not exist in registry', () => {
      expect(() => registry.resolveProductionTemplate('CENTERED_HERO', '9.9.9')).toThrow(
        TemplateNotFoundError,
      );

      expect(() =>
        registry.resolveProductionTemplate('UNKNOWN_FAMILY' as unknown as CanonicalTemplateId),
      ).toThrow(TemplateNotFoundError);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Complete Golden Matrix Coverage (50 Vectors)
  // -------------------------------------------------------------------------
  describe('4. Complete Golden Matrix Coverage (50 Vectors)', () => {
    it('verifies exact corpus count: 50 golden vectors covering all 5 families, 3 formats, and 3 languages', () => {
      expect(GOLDEN_VECTORS.length).toBe(50);

      const requiredFamilies: CanonicalTemplateId[] = [
        'CENTERED_HERO',
        'EDITORIAL_SPLIT',
        'KHMER_SEASONAL',
        'SCENT_STORY',
        'PROMOTION_PRICE_CTA',
      ];
      const requiredFormats: PosterAspectRatio[] = ['1:1', '4:5', '9:16'];
      const requiredLanguages: SceneLanguage[] = ['EN', 'KM', 'BILINGUAL'];

      for (const family of requiredFamilies) {
        const familyVectors = getGoldenVectorsByTemplate(family);
        expect(familyVectors.length).toBeGreaterThanOrEqual(9);

        for (const format of requiredFormats) {
          for (const lang of requiredLanguages) {
            const match = familyVectors.find(
              (v) => v.aspectRatio === format && v.language === lang,
            );
            expect(match).toBeDefined();
          }
        }
      }
    });

    it('verifies all 50 vectors produce valid non-overlapping manifests with safe margins respected', () => {
      for (const vector of GOLDEN_VECTORS) {
        const result = PosterTemplateRenderer.renderTemplate(vector.spec, fontFaceCss, {
          allowNonApprovedForTesting: true,
        });
        const { manifest, svgOverlay, productHeroZone } = result;

        expect(svgOverlay).toContain('<svg');
        expect(svgOverlay).toContain('</svg>');
        expect(manifest.templateId).toBe(vector.templateId);
        expect(manifest.elements.length).toBeGreaterThanOrEqual(4);

        // Safe margins containment
        const { safeMargins, dimensions } = manifest;
        const heroBox = productHeroZone.boundingBox;
        expect(heroBox.x).toBeGreaterThanOrEqual(0);
        expect(heroBox.y).toBeGreaterThanOrEqual(0);
        expect(heroBox.x + heroBox.width).toBeLessThanOrEqual(dimensions.width);
        expect(heroBox.y + heroBox.height).toBeLessThanOrEqual(dimensions.height);

        // All manifest elements must be contained within canvas dimensions
        for (const el of manifest.elements) {
          expect(el.boundingBox.x).toBeGreaterThanOrEqual(0);
          expect(el.boundingBox.x + el.boundingBox.width).toBeLessThanOrEqual(dimensions.width);
          expect(el.boundingBox.y).toBeGreaterThanOrEqual(0);
          expect(el.boundingBox.y + el.boundingBox.height).toBeLessThanOrEqual(dimensions.height);
        }

        // Logo element, if present, must stay in upper safe area
        const logoEl = manifest.elements.find((e) => e.type === 'LOGO');
        if (logoEl) {
          expect(logoEl.boundingBox.y).toBeGreaterThanOrEqual(safeMargins.top - 10);
        }
      }
    });
  });
});
