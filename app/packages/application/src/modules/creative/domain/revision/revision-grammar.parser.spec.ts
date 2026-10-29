import { describe, expect, it } from '@jest/globals';
import {
  RevisionExecutionStrategy,
  RevisionInterpretationConfidence,
  RevisionTargetType,
} from './revision-plan.types.js';
import { RevisionGrammarParser } from './revision-grammar.parser.js';

describe('RevisionGrammarParser', () => {
  const parser = new RevisionGrammarParser();

  const baseInput = {
    creativeJobId: 'job-uuid-1234',
    baseVersionNumber: 1,
    requestedByUserId: 'user-uuid-5678',
    currentSceneDigests: {
      BACKGROUND: 'cas-bg-digest-1',
      PRODUCT_HERO: 'cas-hero-digest-1',
      TYPOGRAPHY: 'cas-typo-digest-1',
    },
  };

  describe('Tier 1: Deterministic Pattern Grammar', () => {
    it('parses "Headline: <text>" with CONFIDENT score and zero-AI strategy', () => {
      const result = parser.parse({
        ...baseInput,
        rawInstruction: 'Headline: Parisian Midnight Rose',
      });

      expect(result.confidence).toBe(RevisionInterpretationConfidence.CONFIDENT);
      expect(result.confidenceScore).toBe(1.0);
      expect(result.proposedPlan).toBeDefined();
      expect(result.proposedPlan?.mutations[0]).toEqual({
        target: RevisionTargetType.HEADLINE,
        fieldName: 'headline',
        requestedValue: 'Parisian Midnight Rose',
      });
      expect(result.proposedPlan?.executionStrategy).toBe(
        RevisionExecutionStrategy.ZERO_AI_COMPOSITE,
      );
      expect(result.proposedPlan?.requiresConfirmation).toBe(false);
      expect(result.proposedPlan?.estimatedExecutionMs).toBe(80);
    });

    it('parses "Price: <amount>" and maps to PRICE target', () => {
      const result = parser.parse({
        ...baseInput,
        rawInstruction: 'Price: 195 EUR',
      });

      expect(result.confidence).toBe(RevisionInterpretationConfidence.CONFIDENT);
      expect(result.proposedPlan?.mutations[0]?.target).toBe(RevisionTargetType.PRICE);
      expect(result.proposedPlan?.mutations[0]?.requestedValue).toBe('195 EUR');
    });

    it('parses "Promo: <amount>" and maps to PROMOTIONAL_PRICE target', () => {
      const result = parser.parse({
        ...baseInput,
        rawInstruction: 'Promo: 150 EUR',
      });

      expect(result.confidence).toBe(RevisionInterpretationConfidence.CONFIDENT);
      expect(result.proposedPlan?.mutations[0]?.target).toBe(RevisionTargetType.PROMOTIONAL_PRICE);
    });

    it('parses "Align: left" and maps to PRODUCT_PLACEMENT target', () => {
      const result = parser.parse({
        ...baseInput,
        rawInstruction: 'Align: left',
      });

      expect(result.confidence).toBe(RevisionInterpretationConfidence.CONFIDENT);
      expect(result.proposedPlan?.mutations[0]?.target).toBe(RevisionTargetType.PRODUCT_PLACEMENT);
      expect(result.proposedPlan?.mutations[0]?.requestedValue).toBe('LEFT');
    });

    it('parses "Scale: 120%" and maps to PRODUCT_SCALE target with normalized decimal', () => {
      const result = parser.parse({
        ...baseInput,
        rawInstruction: 'Scale: 120%',
      });

      expect(result.confidence).toBe(RevisionInterpretationConfidence.CONFIDENT);
      expect(result.proposedPlan?.mutations[0]?.target).toBe(RevisionTargetType.PRODUCT_SCALE);
      expect(result.proposedPlan?.mutations[0]?.requestedValue).toBe(1.2);
    });

    it('parses "Style: Haussmann" with AI_BACKGROUND_REGEN strategy and mandatory confirmation', () => {
      const result = parser.parse({
        ...baseInput,
        rawInstruction: 'Style: Haussmann',
      });

      expect(result.confidence).toBe(RevisionInterpretationConfidence.CONFIDENT);
      expect(result.proposedPlan?.mutations[0]?.target).toBe(RevisionTargetType.STYLE_PRESET);
      expect(result.proposedPlan?.mutations[0]?.requestedValue).toBe('PARISIAN_MORNING_ATELIER');
      expect(result.proposedPlan?.executionStrategy).toBe(
        RevisionExecutionStrategy.AI_BACKGROUND_REGEN,
      );
      expect(result.proposedPlan?.requiresConfirmation).toBe(true);
      expect(result.proposedPlan?.confirmationReason).toContain('credit confirmation');
      expect(result.proposedPlan?.estimatedExecutionMs).toBe(4000);
    });

    it('parses "New Background" command requiring AI regeneration and credit confirmation', () => {
      const result = parser.parse({
        ...baseInput,
        rawInstruction: 'New Background',
      });

      expect(result.confidence).toBe(RevisionInterpretationConfidence.CONFIDENT);
      expect(result.proposedPlan?.mutations[0]?.target).toBe(RevisionTargetType.NEW_BACKGROUND);
      expect(result.proposedPlan?.executionStrategy).toBe(
        RevisionExecutionStrategy.AI_BACKGROUND_REGEN,
      );
      expect(result.proposedPlan?.requiresConfirmation).toBe(true);
    });

    it('parses "Layout: editorial_split" and maps to TEMPLATE target', () => {
      const result = parser.parse({
        ...baseInput,
        rawInstruction: 'Layout: editorial',
      });

      expect(result.confidence).toBe(RevisionInterpretationConfidence.CONFIDENT);
      expect(result.proposedPlan?.mutations[0]?.target).toBe(RevisionTargetType.TEMPLATE);
      expect(result.proposedPlan?.mutations[0]?.requestedValue).toBe('EDITORIAL_SPLIT');
    });

    it('parses "Aspect Ratio: 9:16" with CANVAS_REFORMAT strategy', () => {
      const result = parser.parse({
        ...baseInput,
        rawInstruction: 'Aspect Ratio: 9:16',
      });

      expect(result.confidence).toBe(RevisionInterpretationConfidence.CONFIDENT);
      expect(result.proposedPlan?.mutations[0]?.target).toBe(RevisionTargetType.ASPECT_RATIO);
      expect(result.proposedPlan?.executionStrategy).toBe(
        RevisionExecutionStrategy.CANVAS_REFORMAT,
      );
    });
  });

  describe('Tier 2: Semantic Intent Matcher', () => {
    it('infers natural language headline change "change headline to L\'Art du Parfum"', () => {
      const result = parser.parse({
        ...baseInput,
        rawInstruction: "change headline to L'Art du Parfum",
      });

      expect(result.confidence).toBe(RevisionInterpretationConfidence.CONFIDENT);
      expect(result.proposedPlan?.mutations[0]?.target).toBe(RevisionTargetType.HEADLINE);
      expect(result.proposedPlan?.mutations[0]?.requestedValue).toBe("L'Art du Parfum");
    });

    it('infers natural language placement "move bottle to center"', () => {
      const result = parser.parse({
        ...baseInput,
        rawInstruction: 'move bottle to center',
      });

      expect(result.confidence).toBe(RevisionInterpretationConfidence.CONFIDENT);
      expect(result.proposedPlan?.mutations[0]?.target).toBe(RevisionTargetType.PRODUCT_PLACEMENT);
      expect(result.proposedPlan?.mutations[0]?.requestedValue).toBe('CENTER');
    });

    it('infers natural language enlargement "make bottle bigger"', () => {
      const result = parser.parse({
        ...baseInput,
        rawInstruction: 'make bottle bigger',
      });

      expect(result.confidence).toBe(RevisionInterpretationConfidence.CONFIDENT);
      expect(result.proposedPlan?.mutations[0]?.target).toBe(RevisionTargetType.PRODUCT_SCALE);
      expect(result.proposedPlan?.mutations[0]?.requestedValue).toBe(1.2);
    });

    it('flags ambiguous atmosphere prompt "make it more evening and dramatic" as AMBIGUOUS requiring confirmation', () => {
      const result = parser.parse({
        ...baseInput,
        rawInstruction: 'make it more evening and dramatic',
      });

      expect(result.confidence).toBe(RevisionInterpretationConfidence.AMBIGUOUS);
      expect(result.confidenceScore).toBeLessThan(0.85);
      expect(result.proposedPlan?.requiresConfirmation).toBe(true);
      expect(result.proposedPlan?.confirmationReason).toContain('Nocturne Royale');
      expect(result.suggestedAlternatives).toBeDefined();
    });

    it('infers background regeneration from "different background"', () => {
      const result = parser.parse({
        ...baseInput,
        rawInstruction: 'different background please',
      });

      expect(result.proposedPlan?.mutations[0]?.target).toBe(RevisionTargetType.NEW_BACKGROUND);
      expect(result.proposedPlan?.requiresConfirmation).toBe(true);
    });
  });

  describe('Unsupported / Ambiguous Fallback', () => {
    it('returns UNSUPPORTED for empty string', () => {
      const result = parser.parse({
        ...baseInput,
        rawInstruction: '   ',
      });

      expect(result.confidence).toBe(RevisionInterpretationConfidence.UNSUPPORTED);
      expect(result.confidenceScore).toBe(0);
      expect(result.suggestedAlternatives).toBeDefined();
    });

    it('returns UNSUPPORTED for unrecognized gibberish instructions', () => {
      const result = parser.parse({
        ...baseInput,
        rawInstruction: 'asdkjhqwerty 123987 foobar baz',
      });

      expect(result.confidence).toBe(RevisionInterpretationConfidence.UNSUPPORTED);
      expect(result.proposedPlan).toBeUndefined();
      expect(result.explanation).toContain('Could not interpret instruction');
      expect(result.suggestedAlternatives).toContain('New Background');
    });
  });
});
