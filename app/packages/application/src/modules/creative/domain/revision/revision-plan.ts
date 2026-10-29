import { randomUUID } from 'node:crypto';
import { type LayerGroup } from '../scene/creative-scene.types.js';
import {
  type RevisionPlan,
  RevisionExecutionStrategy,
  RevisionInterpretationConfidence,
  RevisionTargetType,
  type TargetMutation,
} from './revision-plan.types.js';

export interface CreateRevisionPlanParams {
  readonly id?: string | undefined;
  readonly creativeJobId: string;
  readonly baseVersionNumber: number;
  readonly requestedByUserId: string;
  readonly rawInstruction: string;
  readonly executionStrategy: RevisionExecutionStrategy;
  readonly confidence?: RevisionInterpretationConfidence | undefined;
  readonly confidenceScore?: number | undefined;
  readonly mutations: readonly TargetMutation[];
  readonly affectedLayerGroups: readonly LayerGroup[];
  readonly preservedLayerDigests?: Readonly<Record<string, string>> | undefined;
  readonly requiresConfirmation?: boolean | undefined;
  readonly confirmationReason?: string | undefined;
  readonly estimatedExecutionMs?: number | undefined;
  readonly createdAt?: Date | undefined;
}

export function createRevisionPlan(params: CreateRevisionPlanParams): RevisionPlan {
  const confidence = params.confidence ?? RevisionInterpretationConfidence.CONFIDENT;
  const confidenceScore = params.confidenceScore ?? (confidence === 'CONFIDENT' ? 1.0 : 0.7);

  const defaultExecutionMs =
    params.executionStrategy === RevisionExecutionStrategy.AI_BACKGROUND_REGEN
      ? 4000
      : params.executionStrategy === RevisionExecutionStrategy.CANVAS_REFORMAT
        ? 200
        : 80;

  const requiresConfirmation =
    params.requiresConfirmation ??
    (params.executionStrategy === RevisionExecutionStrategy.AI_BACKGROUND_REGEN ||
      confidence === RevisionInterpretationConfidence.AMBIGUOUS);

  const confirmationReason =
    params.confirmationReason ??
    (params.executionStrategy === RevisionExecutionStrategy.AI_BACKGROUND_REGEN
      ? 'AI background generation requires credit confirmation.'
      : confidence === RevisionInterpretationConfidence.AMBIGUOUS
        ? 'Instruction intent is ambiguous; requires confirmation.'
        : undefined);

  return {
    id: params.id ?? randomUUID(),
    creativeJobId: params.creativeJobId,
    baseVersionNumber: params.baseVersionNumber,
    requestedByUserId: params.requestedByUserId,
    rawInstruction: params.rawInstruction,
    executionStrategy: params.executionStrategy,
    confidence,
    confidenceScore,
    mutations: params.mutations,
    affectedLayerGroups: params.affectedLayerGroups,
    preservedLayerDigests: params.preservedLayerDigests ?? {},
    requiresConfirmation,
    confirmationReason,
    estimatedExecutionMs: params.estimatedExecutionMs ?? defaultExecutionMs,
    createdAt: params.createdAt ?? new Date(),
  };
}

export function validateRevisionPlan(plan: RevisionPlan): {
  readonly valid: boolean;
  readonly errors: readonly string[];
} {
  const errors: string[] = [];

  if (!plan.creativeJobId || plan.creativeJobId.trim() === '') {
    errors.push('creativeJobId must be a non-empty string');
  }

  if (plan.baseVersionNumber < 1 || !Number.isInteger(plan.baseVersionNumber)) {
    errors.push('baseVersionNumber must be an integer >= 1');
  }

  if (!plan.requestedByUserId || plan.requestedByUserId.trim() === '') {
    errors.push('requestedByUserId must be a non-empty string');
  }

  if (!plan.rawInstruction || plan.rawInstruction.trim() === '') {
    errors.push('rawInstruction must be a non-empty string');
  }

  if (!plan.mutations || plan.mutations.length === 0) {
    errors.push('mutations must contain at least one TargetMutation');
  } else {
    for (const [index, mutation] of plan.mutations.entries()) {
      if (!mutation.target || !(mutation.target in RevisionTargetType)) {
        errors.push(`mutations[${index}].target is invalid: "${String(mutation.target)}"`);
      }
      if (!mutation.fieldName || mutation.fieldName.trim() === '') {
        errors.push(`mutations[${index}].fieldName must be non-empty`);
      }
      if (mutation.requestedValue === undefined) {
        errors.push(`mutations[${index}].requestedValue cannot be undefined`);
      }
    }
  }

  // Strategy compatibility checks
  const hasAiBgMutation = plan.mutations.some(
    (m) =>
      m.target === RevisionTargetType.BACKGROUND_PROMPT ||
      m.target === RevisionTargetType.STYLE_PRESET ||
      m.target === RevisionTargetType.NEW_BACKGROUND,
  );

  if (hasAiBgMutation && plan.executionStrategy === RevisionExecutionStrategy.ZERO_AI_COMPOSITE) {
    errors.push('AI background mutations cannot use execution strategy ZERO_AI_COMPOSITE');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
