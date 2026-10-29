import { type LayerGroup } from '../scene/creative-scene.types.js';
import { type HardGateCode } from '../services/hard-visual-gates.port.js';

export const RevisionTargetType = {
  // Group 4: Typography (Zero AI spend, fast Sharp re-layout)
  HEADLINE: 'HEADLINE',
  SUBHEAD: 'SUBHEAD',
  PRICE: 'PRICE',
  PROMOTIONAL_PRICE: 'PROMOTIONAL_PRICE',
  CTA: 'CTA',
  LANGUAGE: 'LANGUAGE',

  // Group 3: Product Hero
  PRODUCT_PLACEMENT: 'PRODUCT_PLACEMENT',
  PRODUCT_SCALE: 'PRODUCT_SCALE',
  PRODUCT_ASSET: 'PRODUCT_ASSET',

  // Group 1 & 2: Background & Ambiance
  BACKGROUND_PROMPT: 'BACKGROUND_PROMPT',
  STYLE_PRESET: 'STYLE_PRESET',
  NEW_BACKGROUND: 'NEW_BACKGROUND',

  // Architectural
  TEMPLATE: 'TEMPLATE',
  ASPECT_RATIO: 'ASPECT_RATIO',
} as const;

export type RevisionTargetType = (typeof RevisionTargetType)[keyof typeof RevisionTargetType];

export const RevisionExecutionStrategy = {
  ZERO_AI_COMPOSITE: 'ZERO_AI_COMPOSITE',
  AI_BACKGROUND_REGEN: 'AI_BACKGROUND_REGEN',
  PRODUCT_ASSET_SWAP: 'PRODUCT_ASSET_SWAP',
  CANVAS_REFORMAT: 'CANVAS_REFORMAT',
} as const;

export type RevisionExecutionStrategy =
  (typeof RevisionExecutionStrategy)[keyof typeof RevisionExecutionStrategy];

export const RevisionInterpretationConfidence = {
  CONFIDENT: 'CONFIDENT',
  AMBIGUOUS: 'AMBIGUOUS',
  UNSUPPORTED: 'UNSUPPORTED',
} as const;

export type RevisionInterpretationConfidence =
  (typeof RevisionInterpretationConfidence)[keyof typeof RevisionInterpretationConfidence];

export const ApprovalDomain = {
  CONTENT_APPROVED: 'CONTENT_APPROVED',
  VISUAL_APPROVED: 'VISUAL_APPROVED',
  EXPORT_APPROVED: 'EXPORT_APPROVED',
  PRODUCT_GOVERNANCE_APPROVED: 'PRODUCT_GOVERNANCE_APPROVED',
} as const;

export type ApprovalDomain = (typeof ApprovalDomain)[keyof typeof ApprovalDomain];

export interface TargetMutation {
  readonly target: RevisionTargetType;
  readonly fieldName: string;
  readonly previousValue?: unknown;
  readonly requestedValue: unknown;
}

export interface LayerDriftGuarantee {
  readonly layerGroup: LayerGroup;
  readonly isPreserved: boolean;
  readonly expectedDigest?: string | undefined;
  readonly reason: string;
}

export interface InvalidationAssessment {
  readonly invalidatedGateCodes: readonly HardGateCode[];
  readonly preservedGateCodes: readonly HardGateCode[];
  readonly invalidatedApprovalDomains: readonly ApprovalDomain[];
  readonly preservedApprovalDomains: readonly ApprovalDomain[];
  readonly affectedLayerGroups: readonly LayerGroup[];
  readonly preservedLayerDigests: Readonly<Record<string, string>>;
  readonly layerDriftGuarantees: readonly LayerDriftGuarantee[];
}

export interface RevisionPlan {
  readonly id: string;
  readonly creativeJobId: string;
  readonly baseVersionNumber: number;
  readonly requestedByUserId: string;
  readonly rawInstruction: string;
  readonly executionStrategy: RevisionExecutionStrategy;
  readonly confidence: RevisionInterpretationConfidence;
  readonly confidenceScore: number;
  readonly mutations: readonly TargetMutation[];
  readonly affectedLayerGroups: readonly LayerGroup[];
  readonly preservedLayerDigests: Readonly<Record<string, string>>;
  readonly requiresConfirmation: boolean;
  readonly confirmationReason?: string | undefined;
  readonly estimatedExecutionMs: number;
  readonly createdAt: Date;
}

export interface RevisionInterpretationResult {
  readonly confidence: RevisionInterpretationConfidence;
  readonly confidenceScore: number;
  readonly rawInstruction: string;
  readonly proposedPlan?: RevisionPlan | undefined;
  readonly suggestedAlternatives?: readonly string[] | undefined;
  readonly explanation: string;
}
