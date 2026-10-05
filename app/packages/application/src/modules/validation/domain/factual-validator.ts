import { type FactualValidationRule } from './factual-rule.js';
import { defaultFactualRules } from './factual-rules.js';
import {
  FACTUAL_VALIDATOR_VERSION,
  FindingCode,
  FindingSeverity,
  type FactualValidationInput,
  type FactualValidationOutcome,
  type ValidationFindingDraft,
  ValidationStatus,
} from './validation.js';

export const FACTUAL_VALIDATOR = Symbol('FACTUAL_VALIDATOR');

export interface FactualValidator {
  validate(input: FactualValidationInput): FactualValidationOutcome;
}

export class FactualRuleRegistry {
  public constructor(
    public readonly rules: readonly FactualValidationRule[] = defaultFactualRules(),
  ) {}
}

export class DeterministicFactualValidator implements FactualValidator {
  public constructor(private readonly registry: FactualRuleRegistry = new FactualRuleRegistry()) {}

  public validate(input: FactualValidationInput): FactualValidationOutcome {
    try {
      const findings = deduplicate(this.registry.rules.flatMap((rule) => rule.validate(input)));
      if (findings.length === 0) {
        findings.push({
          field: 'content',
          severity: FindingSeverity.INFO,
          code: FindingCode.VALIDATION_COMPLETED,
          message: 'Deterministic factual validation completed without findings.',
        });
      }
      return outcome(findings);
    } catch {
      return outcome(
        [
          {
            field: 'validator',
            severity: FindingSeverity.BLOCKING,
            code: FindingCode.VALIDATOR_INTERNAL_ERROR,
            message: 'Deterministic factual validation could not be completed.',
          },
        ],
        ValidationStatus.FAILED,
      );
    }
  }
}

function outcome(
  findings: readonly ValidationFindingDraft[],
  forcedStatus?: FactualValidationOutcome['status'],
): FactualValidationOutcome {
  const blockingCount = findings.filter(
    (item) => item.severity === FindingSeverity.BLOCKING,
  ).length;
  const warningCount = findings.filter((item) => item.severity === FindingSeverity.WARNING).length;
  const infoCount = findings.filter((item) => item.severity === FindingSeverity.INFO).length;
  const status =
    forcedStatus ??
    (blockingCount > 0
      ? ValidationStatus.BLOCKED
      : warningCount > 0
        ? ValidationStatus.PASSED_WITH_WARNINGS
        : ValidationStatus.PASSED);
  return {
    validatorVersion: FACTUAL_VALIDATOR_VERSION,
    status,
    findings,
    findingCount: findings.length,
    blockingCount,
    warningCount,
    infoCount,
  };
}

function deduplicate(findings: readonly ValidationFindingDraft[]): ValidationFindingDraft[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = JSON.stringify([
      finding.code,
      finding.field,
      finding.contentPath,
      finding.actualValue,
    ]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
