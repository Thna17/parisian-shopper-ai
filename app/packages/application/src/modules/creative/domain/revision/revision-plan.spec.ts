import { describe, expect, it } from '@jest/globals';
import {
  RevisionExecutionStrategy,
  RevisionInterpretationConfidence,
  RevisionTargetType,
} from './revision-plan.types.js';
import { createRevisionPlan, validateRevisionPlan } from './revision-plan.js';

describe('RevisionPlan Domain Models & Validation', () => {
  const validBaseParams = {
    creativeJobId: 'job-uuid-1234',
    baseVersionNumber: 1,
    requestedByUserId: 'user-uuid-5678',
    rawInstruction: 'Headline: Parisian Elegance',
    executionStrategy: RevisionExecutionStrategy.ZERO_AI_COMPOSITE,
    mutations: [
      {
        target: RevisionTargetType.HEADLINE,
        fieldName: 'headline',
        requestedValue: 'Parisian Elegance',
      },
    ],
    affectedLayerGroups: ['TYPOGRAPHY'] as const,
  };

  describe('createRevisionPlan', () => {
    it('creates a plan with defaults and generated UUID', () => {
      const plan = createRevisionPlan(validBaseParams);

      expect(plan.id).toBeDefined();
      expect(plan.creativeJobId).toBe('job-uuid-1234');
      expect(plan.confidence).toBe(RevisionInterpretationConfidence.CONFIDENT);
      expect(plan.confidenceScore).toBe(1.0);
      expect(plan.requiresConfirmation).toBe(false);
      expect(plan.estimatedExecutionMs).toBe(80);
      expect(plan.createdAt).toBeInstanceOf(Date);
    });

    it('sets requiresConfirmation and 4000ms estimate for AI_BACKGROUND_REGEN strategy', () => {
      const plan = createRevisionPlan({
        ...validBaseParams,
        rawInstruction: 'New Background',
        executionStrategy: RevisionExecutionStrategy.AI_BACKGROUND_REGEN,
        mutations: [
          {
            target: RevisionTargetType.NEW_BACKGROUND,
            fieldName: 'background',
            requestedValue: 'NEW_BACKGROUND',
          },
        ],
        affectedLayerGroups: ['BACKGROUND', 'SURFACE_SHADOW'] as const,
      });

      expect(plan.requiresConfirmation).toBe(true);
      expect(plan.confirmationReason).toContain('credit confirmation');
      expect(plan.estimatedExecutionMs).toBe(4000);
    });

    it('sets requiresConfirmation for AMBIGUOUS confidence plans', () => {
      const plan = createRevisionPlan({
        ...validBaseParams,
        confidence: RevisionInterpretationConfidence.AMBIGUOUS,
        confidenceScore: 0.75,
      });

      expect(plan.requiresConfirmation).toBe(true);
      expect(plan.confirmationReason).toContain('ambiguous');
    });
  });

  describe('validateRevisionPlan', () => {
    it('validates a compliant revision plan successfully', () => {
      const plan = createRevisionPlan(validBaseParams);
      const validation = validateRevisionPlan(plan);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('rejects plan with empty job ID or user ID', () => {
      const plan = createRevisionPlan({
        ...validBaseParams,
        creativeJobId: '',
        requestedByUserId: '   ',
      });
      const validation = validateRevisionPlan(plan);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('creativeJobId must be a non-empty string');
      expect(validation.errors).toContain('requestedByUserId must be a non-empty string');
    });

    it('rejects plan with baseVersionNumber < 1', () => {
      const plan = createRevisionPlan({
        ...validBaseParams,
        baseVersionNumber: 0,
      });
      const validation = validateRevisionPlan(plan);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('baseVersionNumber must be an integer >= 1');
    });

    it('rejects plan with empty mutations array', () => {
      const plan = createRevisionPlan({
        ...validBaseParams,
        mutations: [],
      });
      const validation = validateRevisionPlan(plan);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('mutations must contain at least one TargetMutation');
    });

    it('rejects plan where mutation target is AI background but strategy is ZERO_AI_COMPOSITE', () => {
      const plan = createRevisionPlan({
        ...validBaseParams,
        executionStrategy: RevisionExecutionStrategy.ZERO_AI_COMPOSITE,
        mutations: [
          {
            target: RevisionTargetType.STYLE_PRESET,
            fieldName: 'stylePreset',
            requestedValue: 'NOCTURNE_ROYALE',
          },
        ],
      });
      const validation = validateRevisionPlan(plan);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain(
        'AI background mutations cannot use execution strategy ZERO_AI_COMPOSITE',
      );
    });
  });
});
