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

export interface ReviewQueueItem {
  jobId: string;
  jobStatus: ContentJobStatus;
  productSnapshotId: string;
  sku: string;
  productName: string;
  brand: string;
  priceUsd: number;
  imageUrl?: string;
  campaignId?: string;
  campaignCode?: string;
  campaignName?: string;
  requesterUserId: string;
  requesterDisplayName?: string;
  currentVersionNumber: number;
  targetVersionId: string;
  targetVersionNumber: number;
  targetVersionAuthorUserId?: string;
  headline: string;
  englishCaption?: string;
  validationStatus: string;
  blockingCount: number;
  warningCount: number;
  submittedAt: Date;
  activeRevision?: RevisionRequestRecord;
  latestApproval?: {
    decision: ApprovalDecision;
    approverUserId: string;
    approverDisplayName?: string;
    comment?: string;
    decidedAt: Date;
  };
  isEligibleToApprove?: boolean;
  isEligibleToReject?: boolean;
  ineligibilityReasons?: readonly string[];
}

export interface PaginatedReviewQueue {
  items: readonly ReviewQueueItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ListReviewQueueQuery {
  status?: 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'HISTORY';
  campaignId?: string;
  productSnapshotId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface ReviewDeskDetail {
  job: {
    id: string;
    contentType: string;
    language: string;
    platform: string;
    campaignContext?: string;
    status: ContentJobStatus;
    requesterUserId: string;
    requesterDisplayName?: string;
    createdAt: Date;
    updatedAt: Date;
  };
  productSnapshot: {
    id: string;
    sku: string;
    productName: string;
    brand: string;
    priceUsd: number;
    category?: string;
    description?: string;
    imageUrl?: string;
    fragranceNotes?: {
      top: readonly string[];
      heart: readonly string[];
      base: readonly string[];
    };
    stockStatus?: string;
    productUrl?: string;
  };
  campaign?: {
    id: string;
    code: string;
    name: string;
    status: string;
    objective?: string;
    targetAudience?: string;
  };
  versions: readonly {
    id: string;
    versionNumber: number;
    authorUserId?: string;
    authorDisplayName?: string;
    headline: string;
    englishCaption?: string;
    khmerCaption?: string;
    cta?: string;
    hashtags?: readonly string[];
    creativeBrief?: string;
    factsUsed?: readonly string[];
    createdAt: Date;
    validationStatus?: string;
    blockingCount?: number;
    warningCount?: number;
  }[];
  targetVersion: {
    id: string;
    versionNumber: number;
    authorUserId?: string;
    authorDisplayName?: string;
    headline: string;
    englishCaption?: string;
    khmerCaption?: string;
    cta?: string;
    hashtags?: readonly string[];
    creativeBrief?: string;
    factsUsed?: readonly string[];
    createdAt: Date;
    structuredOutput: Record<string, unknown>;
  };
  validationResult?: {
    id: string;
    status: string;
    blockingCount: number;
    warningCount: number;
    findings: readonly {
      severity: string;
      field?: string;
      code?: string;
      message: string;
    }[];
  };
  activeRevision?: RevisionRequestRecord;
  approvalEvents: readonly ApprovalEventRecord[];
  eligibility: {
    canApprove: boolean;
    canReject: boolean;
    ineligibilityReasons: readonly string[];
    selfRequested: boolean;
    selfAuthored: boolean;
    missingPermission: boolean;
    hasBlockingFindings: boolean;
    notUnderReview: boolean;
    isStaleVersion: boolean;
  };
}
