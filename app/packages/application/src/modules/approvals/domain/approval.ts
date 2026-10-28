import { z } from 'zod';
import { type ContentJobStatus } from '../../content/domain/content.js';

export const approvalDecisionSchema = z.enum(['APPROVED', 'REJECTED']);
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;

export const revisionRequestTypeSchema = z.enum(['EDIT', 'REGENERATE']);
export type RevisionRequestType = z.infer<typeof revisionRequestTypeSchema>;

export const revisionRequestStatusSchema = z.enum(['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED']);
export type RevisionRequestStatus = z.infer<typeof revisionRequestStatusSchema>;

export const pendingReviewActionSchema = z.enum(['EDIT', 'REJECT']);
export type PendingReviewAction = z.infer<typeof pendingReviewActionSchema>;

export interface RevisionRequestRecord {
  id: string;
  contentJobId: string;
  sourceContentVersionId: string;
  requestedByUserId: string;
  instruction?: string;
  type: RevisionRequestType;
  status: RevisionRequestStatus;
  resultingContentVersionId?: string;
  createdAt: Date;
}

export interface ApprovalEventRecord {
  id: string;
  contentJobId: string;
  contentVersionId: string;
  approverUserId: string;
  approverDisplayName?: string;
  decision: ApprovalDecision;
  comment?: string;
  validationResultId?: string;
  createdAt: Date;
}

export interface PendingReviewInteractionRecord {
  id: string;
  telegramIdentityId: string;
  contentJobId: string;
  contentVersionId: string;
  action: PendingReviewAction;
  expiresAt: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  createdAt: Date;
}

export interface ContentReviewState {
  jobId: string;
  jobStatus: ContentJobStatus;
  productSnapshotId: string;
  sku: string;
  productName: string;
  requesterUserId: string;
  currentVersionNumber: number;
  versions: readonly {
    id: string;
    versionNumber: number;
    authorUserId?: string;
    createdAt: Date;
    validationStatus?: string;
    blockingCount?: number;
    approvalEligible?: boolean;
    headline: string;
  }[];
  activeRevision?: RevisionRequestRecord;
  approvalEvent?: ApprovalEventRecord;
}

export interface ApprovalStatusView {
  jobId: string;
  jobStatus: ContentJobStatus;
  latestVersionNumber: number;
  approvedVersionNumber?: number;
  decision?: ApprovalDecision;
  approverUserId?: string;
  approverDisplayName?: string;
  decidedAt?: Date;
  comment?: string;
}
