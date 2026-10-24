import {
  type VisualValidationFindingDraft,
  type VisualValidationOutcome,
  VISUAL_VALIDATOR_VERSION,
  VisualFindingCode,
  VisualValidationSeverity,
} from '../visual-validation.js';

export const VISUAL_SAFETY_SCANNER = Symbol('VISUAL_SAFETY_SCANNER');

export interface ScanVisualSafetyInput {
  readonly promptMetadata?: {
    readonly stylePrompt?: string;
    readonly negativePrompt?: string;
    readonly briefText?: string;
    readonly overlayText?: string;
  };
  readonly textDetections?: readonly string[];
}

/**
 * Disallowed categories in luxury Parisian marketing visuals:
 * 1. Prohibited health / medical claims (anti-aging cures, medical guarantees, etc.)
 * 2. Aggressive pricing spam (cheap, clearance, discount badges, 90% off, bargain, wholesale)
 * 3. Prohibited promotional / urgent badges (buy now, limited time only, click here, hurry)
 */
const PROHIBITED_HEALTH_CLAIMS: readonly RegExp[] = [
  /\bcures?\b/i,
  /\bmedical grade\b/i,
  /\bclinical guarantee\b/i,
  /\bfda approved\b/i,
  /\bpharmaceutical\b/i,
  /\btreatment for\b/i,
];

const PROHIBITED_PRICING_SPAM: readonly RegExp[] = [
  /\bcheap\b/i,
  /\blowest price\b/i,
  /\bclearance sale\b/i,
  /\bdiscount code\b/i,
  /\b\d{1,2}%\s*off\b/i,
  /\bbargain\b/i,
  /\bwholesale\b/i,
  /\bbuy 1 get 1\b/i,
  /\bbogo\b/i,
];

const PROHIBITED_PROMOTIONAL_BADGES: readonly RegExp[] = [
  /\bbuy now\b/i,
  /\bclick here\b/i,
  /\bswipe up\b/i,
  /\bhurry\b/i,
  /\blimited time only\b/i,
  /\bact fast\b/i,
];

export class VisualSafetyScanner {
  public scan(input: ScanVisualSafetyInput): VisualValidationOutcome {
    const findings: VisualValidationFindingDraft[] = [];

    const textCorpora: { source: string; text: string }[] = [];

    if (input.promptMetadata) {
      if (input.promptMetadata.stylePrompt) {
        textCorpora.push({ source: 'stylePrompt', text: input.promptMetadata.stylePrompt });
      }
      if (input.promptMetadata.briefText) {
        textCorpora.push({ source: 'briefText', text: input.promptMetadata.briefText });
      }
      if (input.promptMetadata.overlayText) {
        textCorpora.push({ source: 'overlayText', text: input.promptMetadata.overlayText });
      }
    }

    if (input.textDetections && input.textDetections.length > 0) {
      let idx = 0;
      for (const text of input.textDetections) {
        if (text) {
          textCorpora.push({ source: `textDetections[${idx}]`, text });
        }
        idx++;
      }
    }

    for (const item of textCorpora) {
      // Check prohibited health claims
      for (const pattern of PROHIBITED_HEALTH_CLAIMS) {
        const match = pattern.exec(item.text);
        if (match) {
          findings.push({
            field: item.source,
            severity: VisualValidationSeverity.BLOCKING,
            code: VisualFindingCode.UNEXPECTED_TEXT_DETECTED,
            message: `Prohibited health/medical claim phrase detected: "${match[0]}" in ${item.source}`,
            metadata: { matchedPhrase: match[0], source: item.source },
          });
        }
      }

      // Check prohibited pricing spam
      for (const pattern of PROHIBITED_PRICING_SPAM) {
        const match = pattern.exec(item.text);
        if (match) {
          findings.push({
            field: item.source,
            severity: VisualValidationSeverity.BLOCKING,
            code: VisualFindingCode.UNEXPECTED_TEXT_DETECTED,
            message: `Prohibited pricing spam / low-end discount terminology detected: "${match[0]}" in ${item.source}`,
            metadata: { matchedPhrase: match[0], source: item.source },
          });
        }
      }

      // Check prohibited promotional badges
      for (const pattern of PROHIBITED_PROMOTIONAL_BADGES) {
        const match = pattern.exec(item.text);
        if (match) {
          findings.push({
            field: item.source,
            severity: VisualValidationSeverity.WARNING,
            code: VisualFindingCode.UNEXPECTED_TEXT_DETECTED,
            message: `Discouraged promotional call-to-action detected: "${match[0]}" in ${item.source}`,
            metadata: { matchedPhrase: match[0], source: item.source },
          });
        }
      }
    }

    const blockingCount = findings.filter(
      (f) => f.severity === VisualValidationSeverity.BLOCKING,
    ).length;
    const warningCount = findings.filter(
      (f) => f.severity === VisualValidationSeverity.WARNING,
    ).length;
    const infoCount = findings.filter((f) => f.severity === VisualValidationSeverity.INFO).length;

    let status: 'PASSED' | 'PASSED_WITH_WARNINGS' | 'BLOCKED' | 'FAILED' = 'PASSED';
    if (blockingCount > 0) {
      status = 'FAILED';
    } else if (warningCount > 0) {
      status = 'PASSED_WITH_WARNINGS';
    }

    return {
      validatorVersion: VISUAL_VALIDATOR_VERSION,
      status,
      findings,
      findingCount: findings.length,
      blockingCount,
      warningCount,
      infoCount,
    };
  }
}
