import { type FactualValidationInput, type ValidationFindingDraft } from './validation.js';

export interface FactualValidationRule {
  readonly id: string;
  readonly version: string;
  validate(input: FactualValidationInput): readonly ValidationFindingDraft[];
}
