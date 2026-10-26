import { describe, expect, it, beforeEach } from '@jest/globals';
import {
  TemplateRegistry,
  computeTemplateDefinitionDigest,
  createDraftTemplate,
} from './template-registry.js';
import {
  CANONICAL_TEMPLATE_IDS,
  type CanonicalTemplateId,
  type TemplateDefinition,
} from './template-registry.types.js';
import {
  TemplateNotFoundError,
  TemplateNotEligibleForProductionError,
  InvalidTemplateDefinitionError,
  DuplicateTemplateRegistrationError,
  TemplateDigestMismatchError,
} from '../creative-errors.js';

describe('TemplateRegistry & Design-Token Contracts (W22-B)', () => {
  let registry: TemplateRegistry;

  beforeEach(() => {
    TemplateRegistry.clearInstanceForTesting();
    registry = new TemplateRegistry(true);
  });

  describe('1. Five Canonical Template Families & Approved Production State', () => {
    it('registers exactly the five canonical template families as initial APPROVED production templates', () => {
      expect(CANONICAL_TEMPLATE_IDS).toEqual([
        'CENTERED_HERO',
        'EDITORIAL_SPLIT',
        'KHMER_SEASONAL',
        'SCENT_STORY',
        'PROMOTION_PRICE_CTA',
      ]);
      expect(CANONICAL_TEMPLATE_IDS.length).toBe(5);

      const allTemplates = registry.getAllTemplates();
      expect(allTemplates.length).toBe(5);

      const approvedTemplates = registry.getApprovedTemplates();
      expect(approvedTemplates.length).toBe(5);

      const registeredIds = allTemplates.map((t) => t.id);
      for (const id of CANONICAL_TEMPLATE_IDS) {
        expect(registeredIds).toContain(id);
      }
    });

    it('enforces that Haussmann Luxe is not a sixth template family', () => {
      expect(CANONICAL_TEMPLATE_IDS).not.toContain('HAUSSMANN_LUXE');
      expect(() =>
        registry.getTemplate('HAUSSMANN_LUXE' as unknown as CanonicalTemplateId),
      ).toThrow(TemplateNotFoundError);
    });

    it('confirms all canonical templates have owner approval provenance, semver 1.0.0, and valid content digests', () => {
      for (const id of CANONICAL_TEMPLATE_IDS) {
        const tpl = registry.getTemplate(id);
        expect(tpl.version).toBe('1.0.0');
        expect(tpl.provenance.approvalState).toBe('APPROVED');
        expect(tpl.provenance.approverRef).toBe('Project Owner Brathna');
        expect(tpl.provenance.approvedAt).toBe('2026-10-26T10:53:59.000Z');
        expect(tpl.provenance.sourceDecisionRef).toBe('W03-DEC-006');
        expect(tpl.provenance.tokenSetVersion).toBe('2026.1');
        expect(tpl.provenance.contentDigest).toMatch(/^[0-9a-f]{64}$/);

        // Verify digest is bit-exact reproducible
        const recomputedDigest = computeTemplateDefinitionDigest(tpl);
        expect(tpl.provenance.contentDigest).toBe(recomputedDigest);
      }
    });

    it('transitions DRAFT template to APPROVED upon explicit owner approval with bit-exact digest', () => {
      const draftTpl = createDraftTemplate({
        ...registry.getTemplate('CENTERED_HERO', '1.0.0'),
        version: '1.0.1',
      });
      registry.registerTemplate(draftTpl);
      expect(draftTpl.provenance.approvalState).toBe('DRAFT');

      const approved = registry.approveTemplate({
        templateId: 'CENTERED_HERO',
        version: '1.0.1',
        tokenSetVersion: draftTpl.provenance.tokenSetVersion,
        contentDigest: draftTpl.provenance.contentDigest,
        approverRef: 'Project Owner Brathna',
        approvedAt: '2026-10-26T10:53:59.000Z',
        sourceDecisionRef: 'W03-DEC-006',
      });

      expect(approved.provenance.approvalState).toBe('APPROVED');
      expect(approved.provenance.approverRef).toBe('Project Owner Brathna');
      expect(approved.provenance.approvedAt).toBe('2026-10-26T10:53:59.000Z');
      expect(approved.provenance.sourceDecisionRef).toBe('W03-DEC-006');

      // Verify registry reflects approval
      expect(registry.getApprovedTemplates().length).toBe(6);
    });

    it('rejects approval when content digest mismatches candidate definition', () => {
      const draftTpl = createDraftTemplate({
        ...registry.getTemplate('CENTERED_HERO', '1.0.0'),
        version: '1.0.2',
      });
      registry.registerTemplate(draftTpl);

      expect(() =>
        registry.approveTemplate({
          templateId: 'CENTERED_HERO',
          version: '1.0.2',
          tokenSetVersion: draftTpl.provenance.tokenSetVersion,
          contentDigest: '0'.repeat(64),
          approverRef: 'Project Owner Brathna',
          approvedAt: '2026-10-26T10:53:59.000Z',
        }),
      ).toThrow(TemplateDigestMismatchError);
    });

    it('verifies every canonical template supports 1:1, 4:5, and 9:16 aspect ratios', () => {
      for (const id of CANONICAL_TEMPLATE_IDS) {
        const tpl = registry.getTemplate(id);
        expect(tpl.supportedAspectRatios).toEqual(['1:1', '4:5', '9:16']);
        for (const ratio of ['1:1', '4:5', '9:16'] as const) {
          expect(tpl.tokens.formatAdaptations[ratio]).toBeDefined();
          expect(tpl.tokens.formatAdaptations[ratio].aspectRatio).toBe(ratio);
          expect(tpl.tokens.formatAdaptations[ratio].width).toBe(1080);
          expect(tpl.tokens.formatAdaptations[ratio].safeMargins.top).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('2. Fail-Closed Production Eligibility', () => {
    it('fails closed when attempting to resolve a DRAFT candidate template for production', () => {
      const draftTpl = createDraftTemplate({
        ...registry.getTemplate('CENTERED_HERO', '1.0.0'),
        version: '2.0.0',
      });
      registry.registerTemplate(draftTpl);

      expect(() => registry.resolveProductionTemplate('CENTERED_HERO', '2.0.0')).toThrow(
        TemplateNotEligibleForProductionError,
      );
    });

    it('successfully resolves an APPROVED template for production use directly', () => {
      const resolved = registry.resolveProductionTemplate('CENTERED_HERO', '1.0.0');
      expect(resolved).toBeDefined();
      expect(resolved.id).toBe('CENTERED_HERO');
      expect(resolved.provenance.approvalState).toBe('APPROVED');
      expect(resolved.provenance.approverRef).toBe('Project Owner Brathna');
    });

    it('fails closed with TemplateDigestMismatchError when content digest has been tampered', () => {
      const hero = registry.getTemplate('CENTERED_HERO', '1.0.0');
      const tamperedTpl: TemplateDefinition = {
        ...hero,
        version: '1.0.1',
        provenance: {
          ...hero.provenance,
          version: '1.0.1',
          approvalState: 'APPROVED',
          approverRef: 'Brathna',
          approvedAt: '2026-10-26T00:00:00.000Z',
          contentDigest: 'f'.repeat(64), // tampered
        },
      };
      registry.registerTemplate(tamperedTpl);

      expect(() => registry.resolveProductionTemplate('CENTERED_HERO', '1.0.1')).toThrow(
        TemplateDigestMismatchError,
      );
    });

    it('fails closed when attempting to resolve DEPRECATED or RETIRED templates for production', () => {
      const base = registry.getTemplate('EDITORIAL_SPLIT');
      const depDefWithoutDigest = {
        ...base,
        version: '0.9.0' as const,
        provenance: {
          ...base.provenance,
          version: '0.9.0' as const,
          approvalState: 'DEPRECATED' as const,
          contentDigest: '',
        },
      };
      const depDigest = computeTemplateDefinitionDigest(depDefWithoutDigest);
      const deprecatedTpl: TemplateDefinition = {
        ...depDefWithoutDigest,
        provenance: { ...depDefWithoutDigest.provenance, contentDigest: depDigest },
      };

      const retDefWithoutDigest = {
        ...base,
        version: '0.8.0' as const,
        provenance: {
          ...base.provenance,
          version: '0.8.0' as const,
          approvalState: 'RETIRED' as const,
          contentDigest: '',
        },
      };
      const retDigest = computeTemplateDefinitionDigest(retDefWithoutDigest);
      const retiredTpl: TemplateDefinition = {
        ...retDefWithoutDigest,
        provenance: { ...retDefWithoutDigest.provenance, contentDigest: retDigest },
      };

      registry.registerTemplate(deprecatedTpl);
      registry.registerTemplate(retiredTpl);

      expect(() => registry.resolveProductionTemplate('EDITORIAL_SPLIT', '0.9.0')).toThrow(
        TemplateNotEligibleForProductionError,
      );
      expect(() => registry.resolveProductionTemplate('EDITORIAL_SPLIT', '0.8.0')).toThrow(
        TemplateNotEligibleForProductionError,
      );
    });

    it('permits resolving DRAFT/DEPRECATED templates ONLY when explicitly flagged for testing', () => {
      const base = registry.getTemplate('SCENT_STORY');
      const draftDefWithoutDigest = {
        ...base,
        version: '1.2.0' as const,
        provenance: {
          ...base.provenance,
          version: '1.2.0' as const,
          approvalState: 'DRAFT' as const,
          contentDigest: '',
        },
      };
      const draftDigest = computeTemplateDefinitionDigest(draftDefWithoutDigest);
      const draftTpl: TemplateDefinition = {
        ...draftDefWithoutDigest,
        provenance: { ...draftDefWithoutDigest.provenance, contentDigest: draftDigest },
      };
      registry.registerTemplate(draftTpl);

      const resolved = registry.resolveProductionTemplate('SCENT_STORY', '1.2.0', {
        allowNonApprovedForTesting: true,
      });
      expect(resolved).toBeDefined();
      expect(resolved.version).toBe('1.2.0');
    });
  });

  describe('3. Immutability & Duplicate Registration Protection', () => {
    it('prevents mutation of registered template definition properties', () => {
      const tpl = registry.getTemplate('KHMER_SEASONAL');
      expect(() => {
        // @ts-expect-error mutating readonly property
        tpl.name = 'Altered Name';
      }).toThrow();

      expect(() => {
        // @ts-expect-error mutating nested readonly property
        tpl.tokens.spacing.xs = 999;
      }).toThrow();
    });

    it('throws DuplicateTemplateRegistrationError when registering an existing template version', () => {
      const existing = registry.getTemplate('PROMOTION_PRICE_CTA');
      expect(() => registry.registerTemplate(existing)).toThrow(DuplicateTemplateRegistrationError);
    });

    it('returns an immutable array from getAllTemplates()', () => {
      const all = registry.getAllTemplates();
      expect(Object.isFrozen(all)).toBe(true);
      expect(() => {
        (all as unknown as unknown[]).push(all[0]);
      }).toThrow();
    });
  });

  describe('4. SemVer Resolution & Latest Version Fallback', () => {
    it('resolves the latest APPROVED version when version parameter is omitted', () => {
      const tplV1 = registry.getTemplate('CENTERED_HERO');
      expect(tplV1.version).toBe('1.0.0');

      // Register newer approved v1.1.0
      const v11WithoutDigest = {
        ...tplV1,
        version: '1.1.0' as const,
        provenance: {
          ...tplV1.provenance,
          version: '1.1.0' as const,
          approvalState: 'APPROVED' as const,
          approverRef: 'Brathna',
          approvedAt: '2026-10-26T00:00:00.000Z',
          contentDigest: '',
        },
      };
      const v11Digest = computeTemplateDefinitionDigest(v11WithoutDigest);
      const tplV11: TemplateDefinition = {
        ...v11WithoutDigest,
        provenance: { ...v11WithoutDigest.provenance, contentDigest: v11Digest },
      };
      registry.registerTemplate(tplV11);

      // Register draft v2.0.0
      const v20WithoutDigest = {
        ...tplV1,
        version: '2.0.0' as const,
        provenance: {
          ...tplV1.provenance,
          version: '2.0.0' as const,
          approvalState: 'DRAFT' as const,
          approverRef: null,
          approvedAt: null,
          contentDigest: '',
        },
      };
      const v20Digest = computeTemplateDefinitionDigest(v20WithoutDigest);
      const tplV20Draft: TemplateDefinition = {
        ...v20WithoutDigest,
        provenance: { ...v20WithoutDigest.provenance, contentDigest: v20Digest },
      };
      registry.registerTemplate(tplV20Draft);

      // Latest APPROVED should be 1.1.0 (skipping 2.0.0 DRAFT)
      const latest = registry.getTemplate('CENTERED_HERO');
      expect(latest.version).toBe('1.1.0');

      // Explicit version request returns exact version
      expect(registry.getTemplate('CENTERED_HERO', '1.0.0').version).toBe('1.0.0');
      expect(registry.getTemplate('CENTERED_HERO', '2.0.0').version).toBe('2.0.0');
    });

    it('throws TemplateNotFoundError when template ID or version is unknown', () => {
      expect(() => registry.getTemplate('CENTERED_HERO', '9.9.9')).toThrow(TemplateNotFoundError);
      expect(() => registry.getTemplate('UNKNOWN_ID' as unknown as CanonicalTemplateId)).toThrow(
        TemplateNotFoundError,
      );
    });
  });

  describe('5. Invariant & Structural Validation', () => {
    it('throws InvalidTemplateDefinitionError when template ID is not canonical', () => {
      const invalid = {
        ...registry.getTemplate('CENTERED_HERO'),
        id: 'CUSTOM_UNAPPROVED_TEMPLATE' as unknown as CanonicalTemplateId,
      };
      expect(() => registry.registerTemplate(invalid)).toThrow(InvalidTemplateDefinitionError);
    });

    it('throws InvalidTemplateDefinitionError when version is not valid SemVer', () => {
      const invalid = {
        ...registry.getTemplate('CENTERED_HERO'),
        version: 'v1.0' as unknown as TemplateDefinition['version'],
      };
      expect(() => registry.registerTemplate(invalid)).toThrow(InvalidTemplateDefinitionError);
    });

    it('throws InvalidTemplateDefinitionError when headline slot is missing or optional', () => {
      const base = registry.getTemplate('CENTERED_HERO');
      const invalid = {
        ...base,
        version: '1.9.0' as const,
        slots: base.slots.filter((s) => s.slotId !== 'headline'),
      };
      expect(() => registry.registerTemplate(invalid)).toThrow(InvalidTemplateDefinitionError);
    });

    it('throws InvalidTemplateDefinitionError when format adaptations are incomplete', () => {
      const base = registry.getTemplate('CENTERED_HERO');
      const invalid = {
        ...base,
        version: '1.9.1' as const,
        tokens: {
          ...base.tokens,
          formatAdaptations: {
            '1:1': base.tokens.formatAdaptations['1:1'],
            '4:5': base.tokens.formatAdaptations['4:5'],
            // Missing 9:16
          } as unknown as TemplateDefinition['tokens']['formatAdaptations'],
        },
      };
      expect(() => registry.registerTemplate(invalid)).toThrow(InvalidTemplateDefinitionError);
    });
  });

  describe('6. Design Tokens Hierarchy & Completeness', () => {
    it('verifies all five templates specify complete spacing, corner radii, stroke, shadow, and color tokens', () => {
      for (const id of CANONICAL_TEMPLATE_IDS) {
        const tpl = registry.getTemplate(id);
        const tokens = tpl.tokens;

        // Spacing
        expect(tokens.spacing.xs).toBe(8);
        expect(tokens.spacing.sm).toBe(16);
        expect(tokens.spacing.md).toBe(24);
        expect(tokens.spacing.lg).toBe(32);
        expect(tokens.spacing.xl).toBe(48);
        expect(tokens.spacing.xxl).toBe(64);

        // Corner radii
        expect(tokens.cornerRadii.none).toBe(0);
        expect(tokens.cornerRadii.pill).toBe(9999);

        // Strokes
        expect(tokens.strokeWeights.hairline).toBeLessThan(tokens.strokeWeights.thin);
        expect(tokens.strokeWeights.thin).toBeLessThan(tokens.strokeWeights.thick);

        // Shadows
        expect(tokens.shadows.contact.opacity).toBeGreaterThan(0);
        expect(tokens.shadows.elevation.blurRadius).toBeGreaterThan(0);

        // Colors
        expect(tokens.colorRoles.textPrimary).toBeDefined();
        expect(tokens.colorRoles.accentPrimary).toBeDefined();
        expect(tokens.colorRoles.ctaBackground).toBeDefined();

        // Base typography roles
        expect(tokens.baseTypographyRoles.HEADLINE).toBeDefined();
        expect(tokens.baseTypographyRoles.PRICE).toBeDefined();
        expect(tokens.baseTypographyRoles.CTA).toBeDefined();
      }
    });

    it('verifies PROMOTION_PRICE_CTA defines promotionalPrice and discount badges', () => {
      const promoTpl = registry.getTemplate('PROMOTION_PRICE_CTA');
      const promoSlot = promoTpl.slots.find((s) => s.slotId === 'promotionalPrice');
      expect(promoSlot).toBeDefined();
      expect(promoSlot?.required).toBe(true);
      expect(promoTpl.tokens.colorRoles.discountBadgeBackground).toBeDefined();
    });
  });
});
