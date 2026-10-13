import { describe, expect, it } from '@jest/globals';
import { VisualSafetyScanner } from './services/visual-safety-scanner.js';
import {
  VisualFindingCode,
  VisualValidationSeverity,
  type VisualValidationFindingDraft,
} from './visual-validation.js';

describe('VisualSafetyScanner', () => {
  const scanner = new VisualSafetyScanner();

  it('passes on clean Parisian luxury prompt and brief', () => {
    const outcome = scanner.scan({
      promptMetadata: {
        stylePrompt: 'Haussmann apartment interior, soft morning light, marble mantlepiece',
        briefText: 'Sophisticated handcrafted leather goods made in France',
      },
      textDetections: ['Hermès Paris'],
    });

    expect(outcome.status).toBe('PASSED');
    expect(outcome.blockingCount).toBe(0);
    expect(outcome.findings).toHaveLength(0);
  });

  it('blocks on prohibited medical or health claims in prompt or text detections', () => {
    const outcome = scanner.scan({
      promptMetadata: {
        briefText: 'Clinical guarantee and medical grade formula cures aging',
      },
    });

    expect(outcome.status).toBe('FAILED');
    expect(outcome.blockingCount).toBeGreaterThan(0);
    const finding = outcome.findings.find(
      (f: VisualValidationFindingDraft) => f.code === VisualFindingCode.UNEXPECTED_TEXT_DETECTED,
    );
    expect(finding?.severity).toBe(VisualValidationSeverity.BLOCKING);
  });

  it('blocks on aggressive pricing spam / low-end discount terminology', () => {
    const outcome = scanner.scan({
      textDetections: ['Cheap clearance sale 70% off!'],
    });

    expect(outcome.status).toBe('FAILED');
    expect(outcome.blockingCount).toBeGreaterThan(0);
  });

  it('warns on urgent promotional badges (e.g., BUY NOW)', () => {
    const outcome = scanner.scan({
      promptMetadata: {
        overlayText: 'BUY NOW! Limited time only',
      },
    });

    expect(outcome.status).toBe('PASSED_WITH_WARNINGS');
    expect(outcome.blockingCount).toBe(0);
    expect(outcome.warningCount).toBeGreaterThan(0);
  });
});
