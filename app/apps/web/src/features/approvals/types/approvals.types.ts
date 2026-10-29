export type ContentJobStatus =
  | 'REQUESTED'
  | 'GENERATING'
  | 'DRAFT'
  | 'UNDER_REVIEW'
  | 'REVISION_REQUESTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'FAILED';

export type ApprovalDecision = 'APPROVED' | 'REJECTED';

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
  submittedAt: string;
  latestApproval?: {
    decision: ApprovalDecision;
    approverUserId: string;
    approverDisplayName?: string;
    comment?: string;
    decidedAt: string;
  };
  isEligibleToApprove: boolean;
  isEligibleToReject: boolean;
  ineligibilityReasons: readonly string[];
}

export interface PaginatedReviewQueue {
  items: readonly ReviewQueueItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ListReviewQueueParams {
  status?: 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'HISTORY';
  campaignId?: string;
  productSnapshotId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface ApprovalDecisionResponse {
  id: string;
  contentJobId: string;
  contentVersionId: string;
  approverUserId: string;
  approverDisplayName?: string;
  decision: ApprovalDecision;
  comment?: string;
  createdAt: string;
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
    createdAt: string;
    updatedAt: string;
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
    headline: string;
    englishCaption?: string;
    khmerCaption?: string;
    cta?: string;
    hashtags?: readonly string[];
    creativeBrief?: string;
    factsUsed?: readonly string[];
    createdAt: string;
    validationStatus?: string;
    blockingCount?: number;
    warningCount?: number;
  }[];
  targetVersion: {
    id: string;
    versionNumber: number;
    authorUserId?: string;
    headline: string;
    englishCaption?: string;
    khmerCaption?: string;
    cta?: string;
    hashtags?: readonly string[];
    creativeBrief?: string;
    factsUsed?: readonly string[];
    createdAt: string;
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
  approvalEvents: readonly ApprovalDecisionResponse[];
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

export interface ApprovePayload {
  versionId: string;
  comment?: string;
}

export interface RejectPayload {
  versionId: string;
  reason: string;
}
