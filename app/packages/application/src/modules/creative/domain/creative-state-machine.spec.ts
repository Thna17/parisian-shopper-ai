import { describe, expect, it } from '@jest/globals';
import {
  assertCreativeJobTransition,
  canTransitionCreativeJob,
  creativeApprovalDecisionSchema,
  creativeJobStatusSchema,
  creativeRevisionTypeSchema,
  isTerminalCreativeStatus,
  visualAssetRoleSchema,
  visualValidationStatusSchema,
} from './creative.js';
import {
  DEFAULT_DEVELOPMENT_PROFILE,
  DEVELOPMENT_ONLY_CREATIVE_PROFILE,
  DEVELOPMENT_ONLY_HUMAN_PRESENCE,
  DEVELOPMENT_ONLY_TEXT_ON_IMAGE,
  visualProfileConfigSchema,
} from './visual-profile.js';
import {
  VISUAL_VALIDATOR_VERSION,
  VisualFindingCode,
  VisualValidationSeverity,
} from './visual-validation.js';

describe('Creative Domain & State Machine', () => {
  describe('CreativeJobStatus Transitions', () => {
    it('allows valid forward pipeline transitions', () => {
      expect(canTransitionCreativeJob('REQUESTED', 'GENERATING_BACKGROUND')).toBe(true);
      expect(canTransitionCreativeJob('GENERATING_BACKGROUND', 'COMPOSITING')).toBe(true);
      expect(canTransitionCreativeJob('COMPOSITING', 'VALIDATING')).toBe(true);
      expect(canTransitionCreativeJob('VALIDATING', 'READY_FOR_REVIEW')).toBe(true);
    });

    it('allows review decisions from READY_FOR_REVIEW', () => {
      expect(canTransitionCreativeJob('READY_FOR_REVIEW', 'CREATIVE_APPROVED')).toBe(true);
      expect(canTransitionCreativeJob('READY_FOR_REVIEW', 'CREATIVE_REJECTED')).toBe(true);
      expect(canTransitionCreativeJob('READY_FOR_REVIEW', 'REVISION_REQUESTED')).toBe(true);
    });

    it('allows regeneration cycle from REVISION_REQUESTED', () => {
      expect(canTransitionCreativeJob('REVISION_REQUESTED', 'GENERATING_BACKGROUND')).toBe(true);
      expect(canTransitionCreativeJob('REVISION_REQUESTED', 'FAILED')).toBe(true);
    });

    it('allows failure transitions from active processing states', () => {
      expect(canTransitionCreativeJob('REQUESTED', 'FAILED')).toBe(true);
      expect(canTransitionCreativeJob('GENERATING_BACKGROUND', 'FAILED')).toBe(true);
      expect(canTransitionCreativeJob('COMPOSITING', 'FAILED')).toBe(true);
      expect(canTransitionCreativeJob('VALIDATING', 'FAILED')).toBe(true);
    });

    it('allows retry from FAILED', () => {
      expect(canTransitionCreativeJob('FAILED', 'GENERATING_BACKGROUND')).toBe(true);
    });

    it('strictly enforces terminal states (APPROVED and REJECTED cannot transition)', () => {
      const allStatuses = creativeJobStatusSchema.options;

      for (const target of allStatuses) {
        expect(canTransitionCreativeJob('CREATIVE_APPROVED', target)).toBe(false);
        expect(canTransitionCreativeJob('CREATIVE_REJECTED', target)).toBe(false);
      }

      expect(isTerminalCreativeStatus('CREATIVE_APPROVED')).toBe(true);
      expect(isTerminalCreativeStatus('CREATIVE_REJECTED')).toBe(true);
      expect(isTerminalCreativeStatus('READY_FOR_REVIEW')).toBe(false);
      expect(isTerminalCreativeStatus('FAILED')).toBe(false);
    });

    it('rejects illegal skipping or backward transitions', () => {
      expect(canTransitionCreativeJob('REQUESTED', 'READY_FOR_REVIEW')).toBe(false);
      expect(canTransitionCreativeJob('REQUESTED', 'CREATIVE_APPROVED')).toBe(false);
      expect(canTransitionCreativeJob('COMPOSITING', 'CREATIVE_APPROVED')).toBe(false);
      expect(canTransitionCreativeJob('READY_FOR_REVIEW', 'COMPOSITING')).toBe(false);
      expect(canTransitionCreativeJob('READY_FOR_REVIEW', 'GENERATING_BACKGROUND')).toBe(false);
    });

    it('assertCreativeJobTransition throws on invalid transition and succeeds on valid', () => {
      expect(() => {
        assertCreativeJobTransition('REQUESTED', 'GENERATING_BACKGROUND');
      }).not.toThrow();

      expect(() => {
        assertCreativeJobTransition('REQUESTED', 'CREATIVE_APPROVED');
      }).toThrow(/Invalid creative job transition/);
    });
  });

  describe('Controlled Role & Status Vocabularies', () => {
    it('validates VisualAssetRole enum strictly', () => {
      expect(visualAssetRoleSchema.parse('CANONICAL_PRODUCT')).toBe('CANONICAL_PRODUCT');
      expect(visualAssetRoleSchema.parse('GENERATED_BACKGROUND')).toBe('GENERATED_BACKGROUND');
      expect(visualAssetRoleSchema.parse('COMPOSITED_CREATIVE')).toBe('COMPOSITED_CREATIVE');
      expect(visualAssetRoleSchema.parse('PREVIEW')).toBe('PREVIEW');

      expect(() => visualAssetRoleSchema.parse('FREE_TEXT_ROLE')).toThrow();
      expect(() => visualAssetRoleSchema.parse('USER_UPLOAD')).toThrow();
    });

    it('validates VisualValidationStatus enum strictly', () => {
      expect(visualValidationStatusSchema.parse('PASSED')).toBe('PASSED');
      expect(visualValidationStatusSchema.parse('PASSED_WITH_WARNINGS')).toBe(
        'PASSED_WITH_WARNINGS',
      );
      expect(visualValidationStatusSchema.parse('BLOCKED')).toBe('BLOCKED');
      expect(visualValidationStatusSchema.parse('FAILED')).toBe('FAILED');

      expect(() => visualValidationStatusSchema.parse('INVALID_STATUS')).toThrow();
    });

    it('validates CreativeRevisionType and ApprovalDecision enums', () => {
      expect(creativeRevisionTypeSchema.parse('EDIT')).toBe('EDIT');
      expect(creativeRevisionTypeSchema.parse('REGENERATE')).toBe('REGENERATE');
      expect(() => creativeRevisionTypeSchema.parse('CANCEL')).toThrow();

      expect(creativeApprovalDecisionSchema.parse('CREATIVE_APPROVED')).toBe('CREATIVE_APPROVED');
      expect(creativeApprovalDecisionSchema.parse('CREATIVE_REJECTED')).toBe('CREATIVE_REJECTED');
      expect(() => creativeApprovalDecisionSchema.parse('MAYBE')).toThrow();
    });

    it('maintains explicit validator versioning and severity levels', () => {
      expect(VISUAL_VALIDATOR_VERSION).toBe('ps-visual-v1');
      expect(VisualValidationSeverity.INFO).toBe('INFO');
      expect(VisualValidationSeverity.WARNING).toBe('WARNING');
      expect(VisualValidationSeverity.BLOCKING).toBe('BLOCKING');
      expect(VisualFindingCode.DIMENSIONS_INVALID).toBe('DIMENSIONS_INVALID');
      expect(VisualFindingCode.UNEXPECTED_TEXT_DETECTED).toBe('UNEXPECTED_TEXT_DETECTED');
    });
  });

  describe('Development-Only Visual Profile Configuration', () => {
    it('clearly marks development baseline as NOT production approved', () => {
      expect(DEFAULT_DEVELOPMENT_PROFILE.isProductionApproved).toBe(false);
      expect(DEFAULT_DEVELOPMENT_PROFILE.profileName).toBe(DEVELOPMENT_ONLY_CREATIVE_PROFILE);
      expect(DEFAULT_DEVELOPMENT_PROFILE.textOnImageAllowed).toBe(DEVELOPMENT_ONLY_TEXT_ON_IMAGE);
      expect(DEFAULT_DEVELOPMENT_PROFILE.humanPresenceAllowed).toBe(
        DEVELOPMENT_ONLY_HUMAN_PRESENCE,
      );

      const parsed = visualProfileConfigSchema.parse(DEFAULT_DEVELOPMENT_PROFILE);
      expect(parsed.isProductionApproved).toBe(false);
    });
  });
});
