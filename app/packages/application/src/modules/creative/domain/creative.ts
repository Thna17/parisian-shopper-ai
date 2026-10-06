import { z } from 'zod';

export const creativeJobStatusSchema = z.enum([
  'REQUESTED',
  'GENERATING_BACKGROUND',
  'COMPOSITING',
  'VALIDATING',
  'READY_FOR_REVIEW',
  'REVISION_REQUESTED',
  'CREATIVE_APPROVED',
  'CREATIVE_REJECTED',
  'FAILED',
]);

export const visualAssetRoleSchema = z.enum([
  'CANONICAL_PRODUCT',
  'GENERATED_BACKGROUND',
  'COMPOSITED_CREATIVE',
  'PREVIEW',
]);

export const visualValidationStatusSchema = z.enum([
  'PASSED',
  'PASSED_WITH_WARNINGS',
  'BLOCKED',
  'FAILED',
]);

export const creativeRevisionTypeSchema = z.enum(['EDIT', 'REGENERATE']);

export const creativeApprovalDecisionSchema = z.enum(['CREATIVE_APPROVED', 'CREATIVE_REJECTED']);

export const creativeAspectRatioSchema = z.enum(['1:1', '4:5', '9:16', '16:9']);

export type CreativeJobStatus = z.infer<typeof creativeJobStatusSchema>;
export type VisualAssetRole = z.infer<typeof visualAssetRoleSchema>;
export type VisualValidationStatus = z.infer<typeof visualValidationStatusSchema>;
export type CreativeRevisionType = z.infer<typeof creativeRevisionTypeSchema>;
export type CreativeApprovalDecision = z.infer<typeof creativeApprovalDecisionSchema>;
export type CreativeAspectRatio = z.infer<typeof creativeAspectRatioSchema>;

const creativeTransitions: Readonly<Record<CreativeJobStatus, readonly CreativeJobStatus[]>> = {
  REQUESTED: ['GENERATING_BACKGROUND', 'FAILED'],
  GENERATING_BACKGROUND: ['COMPOSITING', 'FAILED'],
  COMPOSITING: ['VALIDATING', 'FAILED'],
  VALIDATING: ['READY_FOR_REVIEW', 'FAILED'],
  READY_FOR_REVIEW: ['REVISION_REQUESTED', 'CREATIVE_APPROVED', 'CREATIVE_REJECTED'],
  REVISION_REQUESTED: ['GENERATING_BACKGROUND', 'FAILED'],
  FAILED: ['GENERATING_BACKGROUND'],
  CREATIVE_APPROVED: [],
  CREATIVE_REJECTED: [],
};

const terminalStates: ReadonlySet<CreativeJobStatus> = new Set([
  'CREATIVE_APPROVED',
  'CREATIVE_REJECTED',
]);

export function canTransitionCreativeJob(from: CreativeJobStatus, to: CreativeJobStatus): boolean {
  return creativeTransitions[from]?.includes(to) ?? false;
}

export function assertCreativeJobTransition(from: CreativeJobStatus, to: CreativeJobStatus): void {
  if (!canTransitionCreativeJob(from, to)) {
    throw new Error(`Invalid creative job transition: ${from} -> ${to}`);
  }
}

export function isTerminalCreativeStatus(status: CreativeJobStatus): boolean {
  return terminalStates.has(status);
}
